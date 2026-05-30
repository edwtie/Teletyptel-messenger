using System.Net.Http;
using System.Text;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed class XmppBoshClient : IAsyncDisposable
{
    private readonly Uri _endpoint;
    private readonly string _domain;
    private readonly string? _language;
    private readonly HttpClient _httpClient;
    private readonly bool _ownsHttpClient;
    private readonly Queue<XElement> _pendingPayloads = new();
    private long _rid;
    private bool _terminated;

    public XmppBoshClient(
        Uri endpoint,
        string domain,
        HttpClient? httpClient = null,
        string? language = null,
        long initialRid = 1)
    {
        ArgumentNullException.ThrowIfNull(endpoint);
        ArgumentException.ThrowIfNullOrWhiteSpace(domain);
        if (endpoint.Scheme is not "http" and not "https")
        {
            throw new ArgumentException("BOSH endpoint must be an HTTP or HTTPS URI.", nameof(endpoint));
        }

        if (initialRid <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(initialRid), "Initial RID must be greater than zero.");
        }

        _endpoint = endpoint;
        _domain = domain;
        _language = language;
        _httpClient = httpClient ?? new HttpClient();
        _ownsHttpClient = httpClient is null;
        _rid = initialRid;
    }

    public string? SessionId { get; private set; }

    public bool IsConnected => !string.IsNullOrWhiteSpace(SessionId) && !_terminated;

    public async Task<XmppStreamFeatureSet> ConnectAsync(
        int wait = 20,
        int hold = 1,
        CancellationToken cancellationToken = default)
    {
        var response = await PostAsync(
            XmppBosh.CreateSessionRequest(NextRid(), _domain, wait, hold, language: _language),
            cancellationToken).ConfigureAwait(false);

        if (!XmppBosh.TryParseSessionResponse(response, out var session) || session is null)
        {
            throw new XmppProtocolException(
                XmppProtocolErrorKind.Connection,
                "The BOSH connection manager did not return a valid session response.",
                response);
        }

        SessionId = session.Sid;
        EnqueuePayloads(session.Payloads);
        return await ReadFeaturesAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<XmppStreamFeatureSet> RestartStreamAsync(CancellationToken cancellationToken = default)
    {
        EnsureConnected();
        var response = await PostAsync(
            XmppBosh.CreateRestartRequest(NextRid(), SessionId!, _language),
            cancellationToken).ConfigureAwait(false);
        EnqueueResponsePayloads(response);
        return await ReadFeaturesAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task SendElementAsync(XElement element, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(element);
        EnsureConnected();
        var response = await PostAsync(
            XmppBosh.CreateRequest(NextRid(), SessionId!, [element]),
            cancellationToken).ConfigureAwait(false);
        EnqueueResponsePayloads(response);
    }

    public Task SendClientStateAsync(XmppClientState state, CancellationToken cancellationToken = default)
    {
        return SendElementAsync(XmppClientStateIndication.Create(state), cancellationToken);
    }

    public Task SendActiveClientStateAsync(CancellationToken cancellationToken = default)
    {
        return SendClientStateAsync(XmppClientState.Active, cancellationToken);
    }

    public Task SendInactiveClientStateAsync(CancellationToken cancellationToken = default)
    {
        return SendClientStateAsync(XmppClientState.Inactive, cancellationToken);
    }

    public async Task<XmppIncomingStanza> ReadNextStanzaAsync(CancellationToken cancellationToken = default)
    {
        while (true)
        {
            if (_pendingPayloads.Count > 0)
            {
                return XmppIncomingStanza.FromElement(_pendingPayloads.Dequeue());
            }

            EnsureConnected();
            var response = await PostAsync(
                XmppBosh.CreateRequest(NextRid(), SessionId!),
                cancellationToken).ConfigureAwait(false);
            EnqueueResponsePayloads(response);
        }
    }

    public async Task<XmppIq> SendIqAndWaitAsync(
        XmppIq iq,
        TimeSpan timeout,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(iq);
        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(timeout);

        await SendElementAsync(iq.ToXml(), timeoutSource.Token).ConfigureAwait(false);
        while (true)
        {
            var stanza = await ReadNextStanzaAsync(timeoutSource.Token).ConfigureAwait(false);
            if (stanza.Iq is null || !string.Equals(stanza.Iq.Id, iq.Id, StringComparison.Ordinal))
            {
                continue;
            }

            if (stanza.Iq.Type == XmppIqType.Error)
            {
                throw new XmppProtocolException(
                    XmppProtocolErrorKind.IqError,
                    "The BOSH IQ request returned an error.",
                    stanza.Iq.Payload);
            }

            return stanza.Iq;
        }
    }

    public async Task<XmppExternalServices> RequestExternalServicesAsync(
        XmppAddress? to,
        TimeSpan timeout,
        string? type = null,
        string id = "bosh-extdisco-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppExternalServiceDiscovery.CreateServicesRequest(id, to, type),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppExternalServiceDiscovery.TryParseServicesResult(result, out var services) && services is not null)
        {
            return services;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The BOSH external service discovery response was not a valid extdisco services result.",
            result.Payload);
    }

    public async Task<XmppExternalServices> RequestExternalServiceCredentialsAsync(
        XmppAddress? to,
        XmppExternalServiceIdentity service,
        TimeSpan timeout,
        string id = "bosh-extdisco-credentials-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppExternalServiceDiscovery.CreateCredentialsRequest(id, service, to),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppExternalServiceDiscovery.TryParseCredentialsResult(result, out var credentials) && credentials is not null)
        {
            return credentials;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The BOSH external service discovery response was not a valid extdisco credentials result.",
            result.Payload);
    }

    public async Task<string> AuthenticateBestAsync(
        XmppStreamFeatureSet features,
        string authenticationIdentity,
        string password,
        string authorizationIdentity,
        string? clientNonce = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(features);
        var mechanism = XmppSaslMechanismSelector.SelectBest(features);
        if (mechanism is null)
        {
            throw new XmppProtocolException(
                XmppProtocolErrorKind.AuthenticationFailure,
                "The BOSH stream did not offer a supported SASL mechanism.");
        }

        if (mechanism is XmppSaslScram.MechanismSha1 or XmppSaslScram.MechanismSha256)
        {
            await AuthenticateScramAsync(
                mechanism,
                authenticationIdentity,
                password,
                clientNonce,
                cancellationToken).ConfigureAwait(false);
        }
        else
        {
            await AuthenticatePlainAsync(
                authorizationIdentity,
                authenticationIdentity,
                password,
                cancellationToken).ConfigureAwait(false);
        }

        return mechanism;
    }

    public async Task AuthenticatePlainAsync(
        string authorizationIdentity,
        string authenticationIdentity,
        string password,
        CancellationToken cancellationToken = default)
    {
        await SendElementAsync(
            XmppSaslPlain.CreateAuthElement(authorizationIdentity, authenticationIdentity, password),
            cancellationToken).ConfigureAwait(false);
        await WaitForSaslSuccessAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task AuthenticateScramAsync(
        string mechanism,
        string authenticationIdentity,
        string password,
        string? clientNonce = null,
        CancellationToken cancellationToken = default)
    {
        var scram = new XmppSaslScram(mechanism, authenticationIdentity, password, clientNonce);
        await SendElementAsync(scram.CreateInitialAuthElement(), cancellationToken).ConfigureAwait(false);

        var challengeHandled = false;
        while (true)
        {
            var element = await ReadNextElementAsync(cancellationToken).ConfigureAwait(false);
            if (XmppSaslScram.IsChallenge(element))
            {
                await SendElementAsync(scram.CreateResponseElement(element.Value), cancellationToken).ConfigureAwait(false);
                challengeHandled = true;
                continue;
            }

            if (XmppSaslPlain.IsSuccess(element))
            {
                if (!challengeHandled || !scram.VerifyServerFinal(element.Value))
                {
                    throw new XmppProtocolException(
                        XmppProtocolErrorKind.AuthenticationFailure,
                        "The BOSH SCRAM server signature is invalid.",
                        element);
                }

                return;
            }

            if (XmppSaslPlain.IsFailure(element))
            {
                throw new XmppProtocolException(
                    XmppProtocolErrorKind.AuthenticationFailure,
                    "The BOSH stream rejected SASL authentication.",
                    element);
            }
        }
    }

    public async Task<XmppAddress> BindResourceAsync(
        string? resource,
        TimeSpan timeout,
        string id = "bosh-bind-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppResourceBinding.CreateBindRequest(id, resource),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppResourceBinding.TryGetBoundJid(result, out var jid) && jid is not null)
        {
            return jid;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.ResourceBindingFailure,
            "The BOSH stream did not return a valid bind result.",
            result.Payload);
    }

    public async Task<XmppLoginResult> LoginAsync(
        XmppAddress account,
        string password,
        TimeSpan timeout,
        string? resource = null,
        string? clientNonce = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(account);
        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(timeout);

        var features = await ConnectAsync(cancellationToken: timeoutSource.Token).ConfigureAwait(false);
        var mechanism = await AuthenticateBestAsync(
            features,
            account.LocalPart ?? account.Bare,
            password,
            account.Bare,
            clientNonce,
            timeoutSource.Token).ConfigureAwait(false);
        var postAuthFeatures = await RestartStreamAsync(timeoutSource.Token).ConfigureAwait(false);
        if (!postAuthFeatures.ResourceBindingOffered)
        {
            throw new XmppProtocolException(
                XmppProtocolErrorKind.ResourceBindingFailure,
                "The BOSH stream did not offer resource binding after authentication.");
        }

        var boundJid = await BindResourceAsync(
            resource ?? account.ResourcePart,
            timeout,
            cancellationToken: timeoutSource.Token).ConfigureAwait(false);
        return new XmppLoginResult(boundJid, mechanism, TlsActive: _endpoint.Scheme == Uri.UriSchemeHttps);
    }

    public async Task TerminateAsync(
        string? condition = null,
        CancellationToken cancellationToken = default)
    {
        if (!IsConnected)
        {
            return;
        }

        var response = await PostAsync(
            XmppBosh.CreateTerminateRequest(NextRid(), SessionId!, condition),
            cancellationToken).ConfigureAwait(false);
        _terminated = true;
        EnqueueResponsePayloads(response, allowTerminate: true);
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            await TerminateAsync().ConfigureAwait(false);
        }
        catch
        {
        }

        if (_ownsHttpClient)
        {
            _httpClient.Dispose();
        }
    }

    private async Task<XmppStreamFeatureSet> ReadFeaturesAsync(CancellationToken cancellationToken)
    {
        while (true)
        {
            var element = await ReadNextElementAsync(cancellationToken).ConfigureAwait(false);
            if (XmppStreamFeatureSet.TryParse(element, out var features))
            {
                return features;
            }
        }
    }

    private async Task WaitForSaslSuccessAsync(CancellationToken cancellationToken)
    {
        while (true)
        {
            var element = await ReadNextElementAsync(cancellationToken).ConfigureAwait(false);
            if (XmppSaslPlain.IsSuccess(element))
            {
                return;
            }

            if (XmppSaslPlain.IsFailure(element))
            {
                throw new XmppProtocolException(
                    XmppProtocolErrorKind.AuthenticationFailure,
                    "The BOSH stream rejected SASL authentication.",
                    element);
            }
        }
    }

    private async Task<XElement> ReadNextElementAsync(CancellationToken cancellationToken)
    {
        while (true)
        {
            if (_pendingPayloads.Count > 0)
            {
                return _pendingPayloads.Dequeue();
            }

            EnsureConnected();
            var response = await PostAsync(
                XmppBosh.CreateRequest(NextRid(), SessionId!),
                cancellationToken).ConfigureAwait(false);
            EnqueueResponsePayloads(response);
        }
    }

    private async Task<XElement> PostAsync(XElement body, CancellationToken cancellationToken)
    {
        var xml = body.ToString(SaveOptions.DisableFormatting);
        using var content = new StringContent(xml, Encoding.UTF8, "text/xml");
        using var response = await _httpClient.PostAsync(_endpoint, content, cancellationToken).ConfigureAwait(false);
        var responseText = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                $"BOSH HTTP request failed with {(int)response.StatusCode} {response.ReasonPhrase}: {responseText}");
        }

        if (string.IsNullOrWhiteSpace(responseText))
        {
            throw new XmppProtocolException(
                XmppProtocolErrorKind.MalformedXml,
                "The BOSH connection manager returned an empty HTTP response.");
        }

        XElement responseElement;
        try
        {
            responseElement = XElement.Parse(responseText);
        }
        catch (System.Xml.XmlException)
        {
            throw new XmppProtocolException(
                XmppProtocolErrorKind.MalformedXml,
                "The BOSH connection manager returned malformed XML.");
        }

        if (!XmppBosh.TryParseBody(responseElement, out var parsed) || parsed is null)
        {
            throw new XmppProtocolException(
                XmppProtocolErrorKind.MalformedXml,
                "The BOSH connection manager returned malformed XML.",
                responseElement);
        }

        return responseElement;
    }

    private void EnqueueResponsePayloads(XElement body, bool allowTerminate = false)
    {
        if (!XmppBosh.TryParseBody(body, out var parsed) || parsed is null)
        {
            throw new XmppProtocolException(
                XmppProtocolErrorKind.MalformedXml,
                "The BOSH response was not a valid body.",
                body);
        }

        if (XmppBosh.IsTerminate(parsed))
        {
            _terminated = true;
            if (!allowTerminate)
            {
                var condition = string.IsNullOrWhiteSpace(parsed.Condition)
                    ? "unknown"
                    : parsed.Condition;
                throw new XmppProtocolException(
                    XmppProtocolErrorKind.StreamClosed,
                    $"The BOSH connection manager terminated the session: {condition}.",
                    body);
            }
        }

        EnqueuePayloads(parsed.Payloads);
    }

    private void EnqueuePayloads(IEnumerable<XElement> payloads)
    {
        foreach (var payload in payloads)
        {
            _pendingPayloads.Enqueue(new XElement(payload));
        }
    }

    private long NextRid()
    {
        return _rid++;
    }

    private void EnsureConnected()
    {
        if (!IsConnected)
        {
            throw new InvalidOperationException("The BOSH client is not connected.");
        }
    }
}
