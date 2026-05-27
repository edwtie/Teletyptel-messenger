using System.Net.Sockets;
using System.Text;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed class XmppStreamClient : IAsyncDisposable
{
    private readonly XmppConnectionSettings _settings;
    private readonly XmppStreamOptions _options;
    private readonly IXmppTlsStreamUpgrader _tlsStreamUpgrader;
    private TcpClient? _tcpClient;
    private Stream? _stream;
    private XmppStreamWriter? _writer;
    private readonly XmppStreamReader _reader = new();
    private readonly XmppIqTracker _iqTracker = new();
    private readonly XmppStreamManagementState _streamManagement = new();
    private bool _tlsActive;
    private bool _authenticated;
    private bool _resourceBound;

    public XmppStreamClient(
        XmppConnectionSettings settings,
        XmppStreamOptions? options = null,
        IXmppTlsStreamUpgrader? tlsStreamUpgrader = null)
    {
        _settings = settings ?? throw new ArgumentNullException(nameof(settings));
        _options = options ?? XmppStreamOptions.Default;
        _tlsStreamUpgrader = tlsStreamUpgrader ?? new XmppTlsStreamUpgrader();
    }

    public event Action<string>? RawXmlSent;

    public event Action<string>? RawXmlReceived;

    public bool IsConnected => _tcpClient?.Connected == true && _stream is not null;

    public async Task<XmppStreamFeatureSet> ConnectAndReadFeaturesAsync(CancellationToken cancellationToken = default)
    {
        var result = await ConnectAndPlanAsync(cancellationToken).ConfigureAwait(false);
        return result.Features;
    }

    public async Task<XmppStreamConnectionResult> ConnectAndPlanAsync(CancellationToken cancellationToken = default)
    {
        if (IsConnected)
        {
            throw new InvalidOperationException("The XMPP stream client is already connected.");
        }

        _tcpClient = new TcpClient();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(_options.ConnectTimeout);

        await _tcpClient.ConnectAsync(_settings.Host, _settings.Port, timeout.Token).ConfigureAwait(false);
        _stream = _tcpClient.GetStream();
        _writer = new XmppStreamWriter(_stream);

        await WriteOpenStreamAsync(timeout.Token).ConfigureAwait(false);

        while (true)
        {
            var nodes = await ReadNodesAsync(timeout.Token).ConfigureAwait(false);
            foreach (var node in nodes)
            {
                if (node.Type == XmppStreamNodeType.Features
                    && node.Element is not null
                    && XmppStreamFeatureSet.TryParse(node.Element, out var features))
                {
                    var plan = new XmppStreamNegotiationPlan(
                        TlsActive: _tlsActive,
                        Authenticated: _authenticated,
                        ResourceBound: _resourceBound);
                    return new XmppStreamConnectionResult(features, plan.GetNextStep(features, _settings));
                }

                if (node.Type is XmppStreamNodeType.StreamClosed or XmppStreamNodeType.StreamError)
                {
                    throw CreateStreamFailure(node, "The server closed the stream before sending stream features.");
                }
            }
        }
    }

    public async Task SendElementAsync(System.Xml.Linq.XElement element, CancellationToken cancellationToken = default)
    {
        EnsureWriter();
        await _writer!.WriteElementAsync(element, cancellationToken).ConfigureAwait(false);
        RawXmlSent?.Invoke(element.ToString(System.Xml.Linq.SaveOptions.DisableFormatting));
        if (IsClientStanza(element))
        {
            _streamManagement.CountOutboundStanza();
        }
    }

    public async Task BeginStartTlsAsync(CancellationToken cancellationToken = default)
    {
        await SendElementAsync(XmppStartTls.CreateStartTlsElement(), cancellationToken).ConfigureAwait(false);

        while (true)
        {
            var nodes = await ReadNodesAsync(cancellationToken).ConfigureAwait(false);
            foreach (var node in nodes)
            {
                if (node.Element is null)
                {
                    continue;
                }

                if (XmppStartTls.IsProceed(node.Element))
                {
                    await UpgradeToTlsAndRestartStreamAsync(cancellationToken).ConfigureAwait(false);
                    return;
                }

                if (XmppStartTls.IsFailure(node.Element))
                {
                    throw new XmppProtocolException(
                        XmppProtocolErrorKind.StartTlsFailure,
                        "The server rejected STARTTLS.",
                        node.Element);
                }
            }
        }
    }

    public async Task AuthenticatePlainAsync(
        string authenticationIdentity,
        string password,
        string? authorizationIdentity = null,
        CancellationToken cancellationToken = default)
    {
        var auth = XmppSaslPlain.CreateAuthElement(
            authorizationIdentity ?? _settings.Account.Bare,
            authenticationIdentity,
            password);
        await SendElementAsync(auth, cancellationToken).ConfigureAwait(false);

        while (true)
        {
            var nodes = await ReadNodesAsync(cancellationToken).ConfigureAwait(false);
            foreach (var node in nodes)
            {
                if (node.Element is null)
                {
                    continue;
                }

                if (XmppSaslPlain.IsSuccess(node.Element))
                {
                    await RestartStreamAfterAuthenticationAsync(cancellationToken).ConfigureAwait(false);
                    return;
                }

                if (XmppSaslPlain.IsFailure(node.Element))
                {
                    throw new XmppProtocolException(
                        XmppProtocolErrorKind.AuthenticationFailure,
                        "The server rejected SASL authentication.",
                        node.Element);
                }
            }
        }
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
            var nodes = await ReadNodesAsync(cancellationToken).ConfigureAwait(false);
            foreach (var node in nodes)
            {
                if (node.Element is null)
                {
                    continue;
                }

                if (XmppSaslScram.IsChallenge(node.Element))
                {
                    await SendElementAsync(scram.CreateResponseElement(node.Element.Value), cancellationToken).ConfigureAwait(false);
                    challengeHandled = true;
                    continue;
                }

                if (XmppSaslPlain.IsSuccess(node.Element))
                {
                    if (!challengeHandled || !scram.VerifyServerFinal(node.Element.Value))
                    {
                        throw new XmppProtocolException(
                            XmppProtocolErrorKind.AuthenticationFailure,
                            "The SCRAM server signature is invalid.",
                            node.Element);
                    }

                    await RestartStreamAfterAuthenticationAsync(cancellationToken).ConfigureAwait(false);
                    return;
                }

                if (XmppSaslPlain.IsFailure(node.Element))
                {
                    throw new XmppProtocolException(
                        XmppProtocolErrorKind.AuthenticationFailure,
                        "The server rejected SCRAM authentication.",
                        node.Element);
                }
            }
        }
    }

    public async Task<string> AuthenticateBestAsync(
        XmppStreamFeatureSet features,
        string authenticationIdentity,
        string password,
        string? clientNonce = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(features);

        var mechanism = XmppSaslMechanismSelector.SelectBest(features);
        if (mechanism is null)
        {
            throw new XmppProtocolException(
                XmppProtocolErrorKind.AuthenticationFailure,
                "The server did not offer a supported SASL mechanism.");
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
                authenticationIdentity,
                password,
                cancellationToken: cancellationToken).ConfigureAwait(false);
        }

        return mechanism;
    }

    public async Task<XmppLoginResult> LoginAsync(
        string authenticationIdentity,
        string password,
        string? clientNonce = null,
        CancellationToken cancellationToken = default)
    {
        var connection = await ConnectAndPlanAsync(cancellationToken).ConfigureAwait(false);

        if (connection.NextStep == XmppStreamNegotiationStep.StartTls)
        {
            await BeginStartTlsAsync(cancellationToken).ConfigureAwait(false);
            connection = new XmppStreamConnectionResult(
                await ReadFeaturesAsync(cancellationToken).ConfigureAwait(false),
                XmppStreamNegotiationStep.Authenticate);
        }

        if (connection.NextStep == XmppStreamNegotiationStep.OpenStream
            && XmppSaslMechanismSelector.SelectBest(connection.Features) is not null)
        {
            connection = connection with { NextStep = XmppStreamNegotiationStep.Authenticate };
        }

        if (connection.NextStep != XmppStreamNegotiationStep.Authenticate)
        {
            throw new XmppProtocolException(
                XmppProtocolErrorKind.AuthenticationFailure,
                "The server did not provide authentication features.");
        }

        var mechanism = await AuthenticateBestAsync(
            connection.Features,
            authenticationIdentity,
            password,
            clientNonce,
            cancellationToken).ConfigureAwait(false);

        var postAuthFeatures = await ReadFeaturesAsync(cancellationToken).ConfigureAwait(false);
        var boundJid = await BindAfterAuthenticationAsync(
            postAuthFeatures,
            _options.Resource,
            cancellationToken: cancellationToken).ConfigureAwait(false);

        return new XmppLoginResult(boundJid, mechanism, _tlsActive);
    }

    public async Task<XmppAddress> BindResourceAsync(string resource, string id = "bind-1", CancellationToken cancellationToken = default)
    {
        var request = XmppResourceBinding.CreateBindRequest(id, resource);
        await SendElementAsync(request.ToXml(), cancellationToken).ConfigureAwait(false);

        while (true)
        {
            var nodes = await ReadNodesAsync(cancellationToken).ConfigureAwait(false);
            foreach (var node in nodes)
            {
                if (node.Element is null || !XmppIq.TryParse(node.Element, out var iq) || iq is null)
                {
                    continue;
                }

                if (iq.Id != id)
                {
                    continue;
                }

                if (XmppResourceBinding.TryGetBoundJid(iq, out var jid) && jid is not null)
                {
                    BoundJid = jid;
                    _resourceBound = true;
                    return jid;
                }

                throw new XmppProtocolException(
                    XmppProtocolErrorKind.ResourceBindingFailure,
                    "The server rejected resource binding.",
                    node.Element);
            }
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

        var responseTask = _iqTracker.Track(iq.Id, timeoutSource.Token);
        await SendIqAsync(iq, cancellationToken).ConfigureAwait(false);

        while (!responseTask.IsCompleted)
        {
            var stanza = await ReadNextStanzaAsync(timeoutSource.Token).ConfigureAwait(false);
            if (stanza.Iq is not null)
            {
                _iqTracker.TryComplete(stanza.Iq);
            }
        }

        return await responseTask.ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<XmppRosterItem>> RequestRosterAsync(
        TimeSpan timeout,
        string id = "roster-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(XmppIq.RosterGet(id), timeout, cancellationToken).ConfigureAwait(false);
        return result.GetRosterItems();
    }

    public async Task SetRosterItemAsync(
        XmppRosterItem item,
        TimeSpan timeout,
        string id = "roster-set-1",
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(item);
        await SendIqAndWaitAsync(XmppIq.RosterSet(id, item), timeout, cancellationToken).ConfigureAwait(false);
    }

    public async Task RemoveRosterItemAsync(
        XmppAddress jid,
        TimeSpan timeout,
        string id = "roster-remove-1",
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(jid);
        await SendIqAndWaitAsync(XmppIq.RosterRemove(id, jid), timeout, cancellationToken).ConfigureAwait(false);
    }

    public async Task<XmppServiceDiscoveryInfo> RequestServiceDiscoveryInfoAsync(
        XmppAddress? to,
        TimeSpan timeout,
        string? node = null,
        string id = "disco-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppServiceDiscovery.CreateInfoRequest(id, to, node),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppServiceDiscovery.TryParseInfoResult(result, out var info) && info is not null)
        {
            return info;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The service discovery response was not a valid disco#info result.",
            result.Payload);
    }

    public Task SendChatMessageAsync(XmppChatMessage message, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(message);
        return SendElementAsync(message.ToXml(), cancellationToken);
    }

    public Task SendRealTimeTextAsync(XmppRealTimeTextMessage message, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(message);
        return SendElementAsync(message.ToXml(), cancellationToken);
    }

    public Task SendPresenceAsync(XmppPresence presence, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(presence);
        return SendElementAsync(presence.ToXml(), cancellationToken);
    }

    public Task SendInitialPresenceAsync(
        XmppPresenceShow show = XmppPresenceShow.Online,
        string? status = null,
        CancellationToken cancellationToken = default)
    {
        return SendPresenceAsync(new XmppPresence(Show: show, Status: status), cancellationToken);
    }

    public Task SendPresenceSubscriptionAsync(
        XmppAddress to,
        XmppPresenceType type,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(to);
        if (type is not (XmppPresenceType.Subscribe
            or XmppPresenceType.Subscribed
            or XmppPresenceType.Unsubscribe
            or XmppPresenceType.Unsubscribed))
        {
            throw new ArgumentOutOfRangeException(nameof(type), "Presence subscription type is required.");
        }

        return SendPresenceAsync(new XmppPresence(To: to, Type: type), cancellationToken);
    }

    public Task SendIqAsync(XmppIq iq, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(iq);
        return SendElementAsync(iq.ToXml(), cancellationToken);
    }

    public async Task EnableMessageCarbonsAsync(
        TimeSpan timeout,
        string id = "carbons-enable-1",
        CancellationToken cancellationToken = default)
    {
        await SendIqAndWaitAsync(
            XmppMessageCarbons.CreateEnableRequest(id),
            timeout,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task DisableMessageCarbonsAsync(
        TimeSpan timeout,
        string id = "carbons-disable-1",
        CancellationToken cancellationToken = default)
    {
        await SendIqAndWaitAsync(
            XmppMessageCarbons.CreateDisableRequest(id),
            timeout,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task EnableStreamManagementAsync(
        bool resume = true,
        CancellationToken cancellationToken = default)
    {
        await SendStreamManagementElementAsync(
            XmppStreamManagement.CreateEnable(resume),
            cancellationToken).ConfigureAwait(false);

        while (true)
        {
            var nodes = await ReadNodesAsync(cancellationToken).ConfigureAwait(false);
            foreach (var node in nodes)
            {
                if (node.Element is null)
                {
                    continue;
                }

                if (XmppStreamManagement.TryParseEnabled(node.Element, out var id, out var resumeSupported))
                {
                    _streamManagement.Enable(id, resumeSupported);
                    return;
                }

                if (XmppStreamManagement.IsFailed(node.Element))
                {
                    throw new XmppProtocolException(
                        XmppProtocolErrorKind.StreamError,
                        "The server rejected stream management.",
                        node.Element);
                }

                await HandleStreamManagementElementAsync(node.Element, cancellationToken).ConfigureAwait(false);
            }
        }
    }

    public async Task ResumeStreamManagementAsync(
        string previousId,
        ulong handled,
        CancellationToken cancellationToken = default)
    {
        await SendStreamManagementElementAsync(
            XmppStreamManagement.CreateResume(previousId, handled),
            cancellationToken).ConfigureAwait(false);

        while (true)
        {
            var nodes = await ReadNodesAsync(cancellationToken).ConfigureAwait(false);
            foreach (var node in nodes)
            {
                if (node.Element is null)
                {
                    continue;
                }

                if (XmppStreamManagement.TryParseResumed(node.Element, out var id, out var serverHandled))
                {
                    _streamManagement.MarkResumed(serverHandled, id);
                    return;
                }

                if (XmppStreamManagement.IsFailed(node.Element))
                {
                    throw new XmppProtocolException(
                        XmppProtocolErrorKind.StreamError,
                        "The server rejected stream resumption.",
                        node.Element);
                }

                await HandleStreamManagementElementAsync(node.Element, cancellationToken).ConfigureAwait(false);
            }
        }
    }

    public Task SendStreamManagementAckRequestAsync(CancellationToken cancellationToken = default)
    {
        return SendStreamManagementElementAsync(XmppStreamManagement.CreateAckRequest(), cancellationToken);
    }

    public Task SendStreamManagementAckAsync(CancellationToken cancellationToken = default)
    {
        return SendStreamManagementElementAsync(
            XmppStreamManagement.CreateAck(_streamManagement.InboundStanzaCount),
            cancellationToken);
    }

    public async Task<bool> ReadStreamManagementAsync(CancellationToken cancellationToken = default)
    {
        var handledAny = false;
        var nodes = await ReadNodesAsync(cancellationToken).ConfigureAwait(false);
        foreach (var node in nodes)
        {
            if (node.Element is not null
                && await HandleStreamManagementElementAsync(node.Element, cancellationToken).ConfigureAwait(false))
            {
                handledAny = true;
            }
        }

        return handledAny;
    }

    public async Task<XmppIncomingStanza> ReadNextStanzaAsync(CancellationToken cancellationToken = default)
    {
        while (true)
        {
            var nodes = await ReadNodesAsync(cancellationToken).ConfigureAwait(false);
            foreach (var node in nodes)
            {
                if (node.Type == XmppStreamNodeType.Stanza && node.Element is not null)
                {
                    if (await HandleStreamManagementElementAsync(node.Element, cancellationToken).ConfigureAwait(false))
                    {
                        continue;
                    }

                    if (IsClientStanza(node.Element))
                    {
                        _streamManagement.CountInboundStanza();
                    }

                    return XmppIncomingStanza.FromElement(node.Element);
                }

                if (node.Type is XmppStreamNodeType.StreamClosed or XmppStreamNodeType.StreamError)
                {
                    throw CreateStreamFailure(node, "The stream closed before a stanza was received.");
                }
            }
        }
    }

    private static XmppProtocolException CreateStreamFailure(XmppStreamNode node, string fallbackMessage)
    {
        return node.Type == XmppStreamNodeType.StreamError
            ? new XmppProtocolException(XmppProtocolErrorKind.StreamError, "The server returned a stream error.", node.Element)
            : new XmppProtocolException(XmppProtocolErrorKind.StreamClosed, fallbackMessage, node.Element);
    }

    public async Task<IReadOnlyList<XmppStreamNode>> ReadNodesAsync(CancellationToken cancellationToken = default)
    {
        if (_stream is null)
        {
            throw new InvalidOperationException("The XMPP stream client is not connected.");
        }

        var immediateNodes = _reader.ReadAvailable();
        if (immediateNodes.Count > 0)
        {
            return immediateNodes;
        }

        var buffer = new byte[8192];
        var count = await _stream.ReadAsync(buffer, cancellationToken).ConfigureAwait(false);
        if (count == 0)
        {
            return [XmppStreamNode.StreamClosed()];
        }

        var text = Encoding.UTF8.GetString(buffer, 0, count);
        RawXmlReceived?.Invoke(text);
        _reader.Append(text);
        return _reader.ReadAvailable();
    }

    public async Task DisconnectAsync(CancellationToken cancellationToken = default)
    {
        if (_writer is not null)
        {
            try
            {
                await _writer.WriteCloseStreamAsync(cancellationToken).ConfigureAwait(false);
                RawXmlSent?.Invoke(XmppStreamHeader.CloseStream);
            }
            catch (IOException)
            {
            }
            catch (ObjectDisposedException)
            {
            }
        }

        _stream?.Dispose();
        _stream = null;
        _writer = null;
        _tlsActive = false;
        _authenticated = false;
        _resourceBound = false;
        _streamManagement.Disable();
        BoundJid = null;

        _tcpClient?.Dispose();
        _tcpClient = null;
    }

    public async ValueTask DisposeAsync()
    {
        await DisconnectAsync(CancellationToken.None).ConfigureAwait(false);
    }

    public XmppAddress? BoundJid { get; private set; }

    public XmppStreamManagementState StreamManagement => _streamManagement;

    public async Task<XmppStreamFeatureSet> ReadFeaturesAsync(CancellationToken cancellationToken = default)
    {
        while (true)
        {
            var nodes = await ReadNodesAsync(cancellationToken).ConfigureAwait(false);
            foreach (var node in nodes)
            {
                if (node.Type == XmppStreamNodeType.Features
                    && node.Element is not null
                    && XmppStreamFeatureSet.TryParse(node.Element, out var features))
                {
                    return features;
                }

                if (node.Type is XmppStreamNodeType.StreamClosed or XmppStreamNodeType.StreamError)
                {
                    throw CreateStreamFailure(node, "The stream closed before stream features were received.");
                }
            }
        }
    }

    public Task<XmppAddress> BindAfterAuthenticationAsync(
        XmppStreamFeatureSet features,
        string? resource = null,
        string id = "bind-1",
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(features);

        if (!features.ResourceBindingOffered)
        {
            throw new XmppProtocolException(
                XmppProtocolErrorKind.ResourceBindingFailure,
                "The server did not offer resource binding.");
        }

        return BindResourceAsync(resource ?? _options.Resource, id, cancellationToken);
    }

    private async Task WriteOpenStreamAsync(CancellationToken cancellationToken)
    {
        EnsureWriter();
        var xml = XmppStreamHeader.CreateClientOpenStream(
            _settings.Account.DomainPart,
            _options.PreferredLanguage,
            _settings.Account);

        await _writer!.WriteRawAsync(xml, cancellationToken).ConfigureAwait(false);
        RawXmlSent?.Invoke(xml);
    }

    private async Task UpgradeToTlsAndRestartStreamAsync(CancellationToken cancellationToken)
    {
        if (_stream is null)
        {
            throw new InvalidOperationException("The XMPP stream is not connected.");
        }

        try
        {
            _stream = await _tlsStreamUpgrader.UpgradeAsync(_stream, _settings.Host, cancellationToken).ConfigureAwait(false);
            _writer = new XmppStreamWriter(_stream);
            _tlsActive = true;
            _reader.Reset();
            await WriteOpenStreamAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not XmppProtocolException)
        {
            throw new XmppProtocolException(
                XmppProtocolErrorKind.StartTlsFailure,
                "The TLS stream upgrade failed.",
                innerException: ex);
        }
    }

    private async Task RestartStreamAfterAuthenticationAsync(CancellationToken cancellationToken)
    {
        _authenticated = true;
        _reader.Reset();
        await WriteOpenStreamAsync(cancellationToken).ConfigureAwait(false);
    }

    private void EnsureWriter()
    {
        if (_writer is null)
        {
            throw new InvalidOperationException("The XMPP stream writer is not ready.");
        }
    }

    private async Task<bool> HandleStreamManagementElementAsync(
        System.Xml.Linq.XElement element,
        CancellationToken cancellationToken)
    {
        if (!XmppStreamManagement.IsStreamManagementElement(element))
        {
            return false;
        }

        if (XmppStreamManagement.TryParseAck(element, out var handled))
        {
            _streamManagement.AcknowledgeOutbound(handled);
            return true;
        }

        if (XmppStreamManagement.IsAckRequest(element))
        {
            await SendStreamManagementAckAsync(cancellationToken).ConfigureAwait(false);
            return true;
        }

        return true;
    }

    private async Task SendStreamManagementElementAsync(
        System.Xml.Linq.XElement element,
        CancellationToken cancellationToken)
    {
        EnsureWriter();
        await _writer!.WriteElementAsync(element, cancellationToken).ConfigureAwait(false);
        RawXmlSent?.Invoke(element.ToString(System.Xml.Linq.SaveOptions.DisableFormatting));
    }

    private static bool IsClientStanza(System.Xml.Linq.XElement element)
    {
        if (element.Name.NamespaceName != XmppXmlNames.ClientNamespace)
        {
            return false;
        }

        return element.Name.LocalName is "message" or "presence" or "iq";
    }
}
