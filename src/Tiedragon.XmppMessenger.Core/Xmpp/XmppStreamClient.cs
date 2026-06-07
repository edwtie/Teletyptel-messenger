using System.Globalization;
using System.Net.Sockets;
using System.Text;
using System.Xml.Linq;

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
    private readonly Queue<XmppStreamNode> _pendingNodes = new();
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
        if (_settings.DirectTls)
        {
            await UpgradeToDirectTlsAsync(timeout.Token).ConfigureAwait(false);
        }

        _writer = new XmppStreamWriter(_stream);

        await WriteOpenStreamAsync(timeout.Token).ConfigureAwait(false);

        while (true)
        {
            var nodes = await ReadNodesAsync(timeout.Token).ConfigureAwait(false);
            for (var index = 0; index < nodes.Count; index++)
            {
                var node = nodes[index];
                if (node.Type == XmppStreamNodeType.Features
                    && node.Element is not null
                    && XmppStreamFeatureSet.TryParse(node.Element, out var features))
                {
                    PreserveTrailingNodes(nodes, index);
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
            for (var index = 0; index < nodes.Count; index++)
            {
                var node = nodes[index];
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
                    PreserveTrailingNodes(nodes, index);
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

    public async Task<IReadOnlyList<XmppAddress>> RequestBlockedUsersAsync(
        TimeSpan timeout,
        string id = "blocklist-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppBlockingCommand.CreateBlockListRequest(id),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppBlockingCommand.TryParseBlockListResult(result, out var blocked))
        {
            return blocked;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The blocking command response was not a valid XEP-0191 blocklist result.",
            result.Payload);
    }

    public async Task BlockUsersAsync(
        IEnumerable<XmppAddress> jids,
        TimeSpan timeout,
        string id = "block-1",
        CancellationToken cancellationToken = default)
    {
        await SendIqAndWaitAsync(
            XmppBlockingCommand.CreateBlockRequest(id, jids),
            timeout,
            cancellationToken).ConfigureAwait(false);
    }

    public Task BlockUserAsync(
        XmppAddress jid,
        TimeSpan timeout,
        string id = "block-1",
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(jid);
        return BlockUsersAsync([jid], timeout, id, cancellationToken);
    }

    public async Task UnblockUsersAsync(
        IEnumerable<XmppAddress> jids,
        TimeSpan timeout,
        string id = "unblock-1",
        CancellationToken cancellationToken = default)
    {
        await SendIqAndWaitAsync(
            XmppBlockingCommand.CreateUnblockRequest(id, jids),
            timeout,
            cancellationToken).ConfigureAwait(false);
    }

    public Task UnblockUserAsync(
        XmppAddress jid,
        TimeSpan timeout,
        string id = "unblock-1",
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(jid);
        return UnblockUsersAsync([jid], timeout, id, cancellationToken);
    }

    public async Task UnblockAllUsersAsync(
        TimeSpan timeout,
        string id = "unblock-all-1",
        CancellationToken cancellationToken = default)
    {
        await SendIqAndWaitAsync(
            XmppBlockingCommand.CreateUnblockAllRequest(id),
            timeout,
            cancellationToken).ConfigureAwait(false);
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

    public async Task<XmppServiceDiscoveryItems> RequestServiceDiscoveryItemsAsync(
        XmppAddress? to,
        TimeSpan timeout,
        string? node = null,
        string id = "disco-items-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppServiceDiscovery.CreateItemsRequest(id, to, node),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppServiceDiscovery.TryParseItemsResult(result, out var items) && items is not null)
        {
            return items;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The service discovery response was not a valid disco#items result.",
            result.Payload);
    }

    public async Task<XmppAdHocCommandResult> ExecuteServiceAdministrationCommandAsync(
        XmppAddress to,
        string node,
        TimeSpan timeout,
        string id = "service-admin-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppServiceAdministration.CreateReadOnlyCommandRequest(id, to, node),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppAdHocCommands.TryParseCommandResult(result, out var command) && command is not null)
        {
            return command;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The service administration response was not a valid XEP-0050 command result.",
            result.Payload);
    }

    public async Task<XmppExternalServices> RequestExternalServicesAsync(
        XmppAddress? to,
        TimeSpan timeout,
        string? type = null,
        string id = "extdisco-1",
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
            "The external service discovery response was not a valid extdisco services result.",
            result.Payload);
    }

    public async Task<XmppExternalServices> RequestExternalServiceCredentialsAsync(
        XmppAddress? to,
        XmppExternalServiceIdentity service,
        TimeSpan timeout,
        string id = "extdisco-credentials-1",
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
            "The external service discovery response was not a valid extdisco credentials result.",
            result.Payload);
    }

    public Task<XmppServiceDiscoveryInfo> RequestPersonalEventingInfoAsync(
        TimeSpan timeout,
        string id = "pep-disco-1",
        CancellationToken cancellationToken = default)
    {
        return RequestServiceDiscoveryInfoAsync(
            XmppAddress.Parse(_settings.Account.Bare),
            timeout,
            id: id,
            cancellationToken: cancellationToken);
    }

    public async Task<XmppUserLocationSupport> RequestUserLocationSupportAsync(
        TimeSpan timeout,
        string id = "location-disco-1",
        CancellationToken cancellationToken = default)
    {
        var info = await RequestPersonalEventingInfoAsync(timeout, id, cancellationToken)
            .ConfigureAwait(false);
        return XmppUserLocation.EvaluateSupport(info);
    }

    public Task PublishPersonalEventAsync(
        string node,
        string? itemId,
        XElement payload,
        TimeSpan timeout,
        string id = "pep-publish-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppPersonalEventing.CreatePublishRequest(id, node, itemId, payload),
            timeout,
            cancellationToken);
    }

    public Task RetractPersonalEventAsync(
        string node,
        string itemId,
        TimeSpan timeout,
        bool notify = true,
        string id = "pep-retract-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppPersonalEventing.CreateRetractRequest(id, node, itemId, notify),
            timeout,
            cancellationToken);
    }

    public Task DeletePersonalEventNodeAsync(
        string node,
        TimeSpan timeout,
        string id = "pep-delete-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppPersonalEventing.CreateDeleteNodeRequest(id, node),
            timeout,
            cancellationToken);
    }

    public async Task<XmppPersonalEventNodeItems> RequestPersonalEventItemsAsync(
        string node,
        XmppAddress? owner,
        TimeSpan timeout,
        string? itemId = null,
        int? maxItems = null,
        string id = "pep-items-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppPersonalEventing.CreateItemsRequest(id, node, owner, itemId, maxItems),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppPersonalEventing.TryParseItemsResult(result, out var items) && items is not null)
        {
            return items;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The personal eventing response was not a valid PubSub items result.",
            result.Payload);
    }

    public async Task<XmppPubSubSubscription> SubscribePubSubNodeAsync(
        string node,
        XmppAddress service,
        XmppAddress subscriber,
        TimeSpan timeout,
        string id = "pubsub-subscribe-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppPubSub.CreateSubscribeRequest(id, node, subscriber, service),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppPubSub.TryParseSubscriptionResult(result, out var subscription) && subscription is not null)
        {
            return subscription;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The PubSub response was not a valid subscription result.",
            result.Payload);
    }

    public Task UnsubscribePubSubNodeAsync(
        string node,
        XmppAddress service,
        XmppAddress subscriber,
        TimeSpan timeout,
        string? subscriptionId = null,
        string id = "pubsub-unsubscribe-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppPubSub.CreateUnsubscribeRequest(id, node, subscriber, subscriptionId, service),
            timeout,
            cancellationToken);
    }

    public Task CreatePubSubNodeAsync(
        string node,
        XmppAddress service,
        TimeSpan timeout,
        string id = "pubsub-create-1",
        XElement? configureForm = null,
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppPubSub.CreateCreateNodeRequest(id, node, service, configureForm),
            timeout,
            cancellationToken);
    }

    public Task PublishPubSubItemAsync(
        string node,
        XmppAddress service,
        XElement payload,
        TimeSpan timeout,
        string? itemId = null,
        string id = "pubsub-publish-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppPubSub.CreatePublishRequest(id, node, itemId, payload, service),
            timeout,
            cancellationToken);
    }

    public Task RetractPubSubItemAsync(
        string node,
        XmppAddress service,
        string itemId,
        TimeSpan timeout,
        bool notify = true,
        string id = "pubsub-retract-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppPubSub.CreateRetractRequest(id, node, itemId, notify, service),
            timeout,
            cancellationToken);
    }

    public async Task<XmppPersonalEventNodeItems> RequestPubSubItemsAsync(
        string node,
        XmppAddress service,
        TimeSpan timeout,
        string? itemId = null,
        int? maxItems = null,
        string id = "pubsub-items-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppPubSub.CreateItemsRequest(id, node, service, itemId, maxItems),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppPersonalEventing.TryParseItemsResult(result, out var items) && items is not null)
        {
            return items;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The PubSub response was not a valid items result.",
            result.Payload);
    }

    public Task DeletePubSubNodeAsync(
        string node,
        XmppAddress service,
        TimeSpan timeout,
        string id = "pubsub-delete-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppPubSub.CreateDeleteNodeRequest(id, node, service),
            timeout,
            cancellationToken);
    }

    public Task PurgePubSubNodeAsync(
        string node,
        XmppAddress service,
        TimeSpan timeout,
        string id = "pubsub-purge-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppPubSub.CreatePurgeNodeRequest(id, node, service),
            timeout,
            cancellationToken);
    }

    public async Task<XmppDataForm> RequestPubSubNodeConfigurationAsync(
        string node,
        XmppAddress service,
        TimeSpan timeout,
        string id = "pubsub-config-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppPubSub.CreateConfigurationRequest(id, node, service),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppPubSub.TryParseConfigurationResult(result, out var form) && form is not null)
        {
            return form;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The PubSub response was not a valid node configuration form.",
            result.Payload);
    }

    public Task ConfigurePubSubNodeAsync(
        string node,
        XmppAddress service,
        XElement configureForm,
        TimeSpan timeout,
        string id = "pubsub-config-submit-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppPubSub.CreateConfigureNodeRequest(id, node, configureForm, service),
            timeout,
            cancellationToken);
    }

    public async Task<IReadOnlyList<XmppPubSubSubscription>> RequestPubSubSubscriptionsAsync(
        XmppAddress service,
        TimeSpan timeout,
        string? node = null,
        string id = "pubsub-subscriptions-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppPubSub.CreateSubscriptionsRequest(id, node, service),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppPubSub.TryParseSubscriptionsResult(result, out var subscriptions))
        {
            return subscriptions;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The PubSub response was not a valid subscriptions result.",
            result.Payload);
    }

    public async Task<IReadOnlyList<XmppPubSubAffiliation>> RequestPubSubAffiliationsAsync(
        XmppAddress service,
        TimeSpan timeout,
        string? node = null,
        string id = "pubsub-affiliations-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppPubSub.CreateAffiliationsRequest(id, node, service),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppPubSub.TryParseAffiliationsResult(result, out var affiliations))
        {
            return affiliations;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The PubSub response was not a valid affiliations result.",
            result.Payload);
    }

    public Task PublishAnnouncementAsync(
        XmppAnnouncement announcement,
        XmppAddress service,
        TimeSpan timeout,
        string node = XmppPubSubAnnouncements.DefaultNode,
        string id = "announcement-publish-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppPubSubAnnouncements.CreatePublishRequest(id, announcement, node, service),
            timeout,
            cancellationToken);
    }

    public async Task<IReadOnlyList<XmppAnnouncement>> RequestAnnouncementsAsync(
        XmppAddress service,
        TimeSpan timeout,
        string node = XmppPubSubAnnouncements.DefaultNode,
        int? maxItems = null,
        string id = "announcement-items-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppPubSubAnnouncements.CreateItemsRequest(id, service, node, maxItems),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppPubSubAnnouncements.TryParseItems(result, out var announcements, node))
        {
            return announcements;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The announcement response was not a valid XEP-0060 items result.",
            result.Payload);
    }

    public async Task<XmppDataForm> RequestPublicChannelSearchFormAsync(
        XmppAddress searchService,
        TimeSpan timeout,
        string id = "channel-search-form-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppPublicChannelSearch.CreateSearchFormRequest(id, searchService),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppPublicChannelSearch.TryParseSearchForm(result, out var form) && form is not null)
        {
            return form;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The public channel search response was not a valid XEP-0433 search form.",
            result.Payload);
    }

    public async Task<XmppPublicChannelSearchResult> SearchPublicChannelsAsync(
        XmppAddress searchService,
        XmppPublicChannelSearchQuery query,
        TimeSpan timeout,
        XmppResultSetRequest? paging = null,
        string id = "channel-search-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppPublicChannelSearch.CreateSearchRequest(id, searchService, query, paging),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppPublicChannelSearch.TryParseSearchResult(result, out var searchResult) && searchResult is not null)
        {
            return searchResult;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The public channel search response was not a valid XEP-0433 result.",
            result.Payload);
    }

    public Task PublishConferenceBookmarkAsync(
        XmppConferenceBookmark bookmark,
        TimeSpan timeout,
        string id = "bookmark-publish-1",
        bool addPublishOptions = true,
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppBookmarks.CreatePublishConferenceRequest(id, bookmark, addPublishOptions),
            timeout,
            cancellationToken);
    }

    public async Task<IReadOnlyList<XmppConferenceBookmark>> RequestConferenceBookmarksAsync(
        XmppAddress? owner,
        TimeSpan timeout,
        string id = "bookmarks-1",
        int? maxItems = null,
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppBookmarks.CreateBookmarksRequest(id, owner, maxItems),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppBookmarks.TryParseBookmarksResult(result, out var bookmarks) && bookmarks is not null)
        {
            return bookmarks;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The bookmark response was not a valid XEP-0402 PubSub items result.",
            result.Payload);
    }

    public Task RetractConferenceBookmarkAsync(
        XmppAddress room,
        TimeSpan timeout,
        string id = "bookmark-retract-1",
        bool notify = true,
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppBookmarks.CreateRetractConferenceRequest(id, room, notify),
            timeout,
            cancellationToken);
    }

    public async Task<IReadOnlyList<XmppConferenceBookmark>> RequestLegacyConferenceBookmarksAsync(
        TimeSpan timeout,
        string id = "legacy-bookmarks-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppBookmarks.CreateLegacyBookmarksRequest(id),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppBookmarks.TryParseLegacyBookmarksResult(result, out var bookmarks) && bookmarks is not null)
        {
            return bookmarks;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The bookmark response was not a valid XEP-0048 private XML result.",
            result.Payload);
    }

    public Task SetLegacyConferenceBookmarksAsync(
        IEnumerable<XmppConferenceBookmark> bookmarks,
        TimeSpan timeout,
        string id = "legacy-bookmarks-set-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppBookmarks.CreateLegacyBookmarksSetRequest(id, bookmarks),
            timeout,
            cancellationToken);
    }

    public async Task<XElement> RequestPrivateXmlAsync(
        XName payloadName,
        TimeSpan timeout,
        string id = "private-xml-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppPrivateXmlStorage.CreateGetRequest(id, payloadName),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppPrivateXmlStorage.TryParseResult(result, payloadName, out var payload) && payload is not null)
        {
            return payload;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The private XML response was not a valid XEP-0049 result.",
            result.Payload);
    }

    public Task SetPrivateXmlAsync(
        XElement payload,
        TimeSpan timeout,
        string id = "private-xml-set-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppPrivateXmlStorage.CreateSetRequest(id, payload),
            timeout,
            cancellationToken);
    }

    public Task StorePersistentPrivateDataAsync(
        string node,
        XElement payload,
        TimeSpan timeout,
        string? itemId = null,
        string id = "private-pubsub-store-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppPersistentPrivateData.CreateStoreRequest(id, node, payload, itemId),
            timeout,
            cancellationToken);
    }

    public async Task<IReadOnlyList<XmppPersistentPrivateDataItem>> RequestPersistentPrivateDataAsync(
        string node,
        TimeSpan timeout,
        XmppAddress? owner = null,
        string? itemId = null,
        int? maxItems = null,
        string id = "private-pubsub-items-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppPersistentPrivateData.CreateItemsRequest(id, node, owner, itemId, maxItems),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppPersistentPrivateData.TryParseItemsResult(result, node, out var items) && items is not null)
        {
            return items;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The persistent private data response was not a valid XEP-0223 PubSub items result.",
            result.Payload);
    }

    public Task PublishUserLocationAsync(
        XmppUserLocationData location,
        TimeSpan timeout,
        string itemId = XmppUserLocation.CurrentItemId,
        string id = "location-publish-1",
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(location);
        XmppUserLocation.Validate(location);
        return PublishPersonalEventAsync(
            XmppUserLocation.NamespaceName,
            itemId,
            location.ToXml(),
            timeout,
            id,
            cancellationToken);
    }

    public Task ClearUserLocationAsync(
        TimeSpan timeout,
        string itemId = XmppUserLocation.CurrentItemId,
        string id = "location-clear-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppUserLocation.CreateClearPublishRequest(id, itemId),
            timeout,
            cancellationToken);
    }

    public Task RetractUserLocationAsync(
        TimeSpan timeout,
        string itemId = XmppUserLocation.CurrentItemId,
        bool notify = true,
        string id = "location-retract-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppUserLocation.CreateRetractRequest(id, itemId, notify),
            timeout,
            cancellationToken);
    }

    public async Task<XmppUserLocationData?> RequestUserLocationAsync(
        XmppAddress contact,
        TimeSpan timeout,
        string? itemId = null,
        string id = "location-items-1",
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(contact);
        var items = await RequestPersonalEventItemsAsync(
            XmppUserLocation.NamespaceName,
            contact,
            timeout,
            itemId: itemId,
            maxItems: 1,
            id: id,
            cancellationToken: cancellationToken).ConfigureAwait(false);

        return XmppUserLocation.TryParseNodeItems(items, out var location)
            ? location
            : null;
    }

    public async Task<XmppRegistrationInfo> RequestRegistrationInfoAsync(
        XmppAddress? to,
        TimeSpan timeout,
        string id = "register-info-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppInBandRegistration.CreateInfoRequest(id, to),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppInBandRegistration.TryParseInfoResult(result, out var info) && info is not null)
        {
            return info;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The registration response was not a valid XEP-0077 info result.",
            result.Payload);
    }

    public async Task RegisterInBandAsync(
        XmppRegistrationRequest request,
        XmppAddress? to,
        TimeSpan timeout,
        string id = "register-1",
        CancellationToken cancellationToken = default)
    {
        await SendIqAndWaitAsync(
            XmppInBandRegistration.CreateRegistrationRequest(id, request, to),
            timeout,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task ChangePasswordInBandAsync(
        string username,
        string password,
        XmppAddress? to,
        TimeSpan timeout,
        string id = "register-password-1",
        CancellationToken cancellationToken = default)
    {
        await SendIqAndWaitAsync(
            XmppInBandRegistration.CreatePasswordChangeRequest(id, username, password, to),
            timeout,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task RemoveRegistrationAsync(
        XmppAddress? to,
        TimeSpan timeout,
        string id = "register-remove-1",
        CancellationToken cancellationToken = default)
    {
        await SendIqAndWaitAsync(
            XmppInBandRegistration.CreateRemoveRequest(id, to),
            timeout,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<XmppHttpUploadSlot> RequestHttpUploadSlotAsync(
        XmppAddress uploadService,
        string fileName,
        long size,
        TimeSpan timeout,
        string? contentType = null,
        XmppHttpUploadPurpose purpose = XmppHttpUploadPurpose.Default,
        string id = "upload-slot-1",
        DateTimeOffset? expireBefore = null,
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppHttpFileUpload.CreateSlotRequest(id, uploadService, fileName, size, contentType, purpose, expireBefore),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppHttpFileUpload.TryParseSlotResult(result, out var slot) && slot is not null)
        {
            return slot;
        }

        if (XmppHttpFileUpload.TryParseFileTooLarge(result, out var maxFileSize))
        {
            var maxText = maxFileSize is null
                ? "an unknown server maximum"
                : $"{maxFileSize.Value} bytes";
            throw new XmppProtocolException(
                XmppProtocolErrorKind.IqError,
                $"The HTTP upload service rejected the file because it exceeds {maxText}.",
                result.Payload);
        }

        if (XmppHttpFileUpload.TryParseRetry(result, out var retryAt))
        {
            var retryText = retryAt is null
                ? "later"
                : retryAt.Value.ToString("u", CultureInfo.InvariantCulture);
            throw new XmppProtocolException(
                XmppProtocolErrorKind.IqError,
                $"The HTTP upload service asked the client to retry {retryText}.",
                result.Payload);
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The HTTP upload response was not a valid XEP-0363 slot result.",
            result.Payload);
    }

    public async Task<IReadOnlyList<XmppSocks5StreamHost>> RequestSocks5ProxyAddressAsync(
        XmppAddress proxy,
        TimeSpan timeout,
        string id = "s5b-proxy-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppSocks5Bytestreams.CreateProxyAddressRequest(id, proxy),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppSocks5Bytestreams.TryParseProxyAddressResult(result, out var streamHosts))
        {
            return streamHosts;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The SOCKS5 bytestream proxy response was not valid.",
            result.Payload);
    }

    public Task ActivateSocks5BytestreamAsync(
        XmppAddress proxy,
        string streamId,
        XmppAddress target,
        TimeSpan timeout,
        string id = "s5b-activate-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppSocks5Bytestreams.CreateActivationRequest(id, proxy, streamId, target),
            timeout,
            cancellationToken);
    }

    public Task<XmppIq> OpenInBandBytestreamAsync(
        XmppAddress target,
        string sessionId,
        int blockSize,
        TimeSpan timeout,
        string stanza = "iq",
        string id = "ibb-open-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppInBandBytestreams.CreateOpenRequest(id, target, sessionId, blockSize, stanza),
            timeout,
            cancellationToken);
    }

    public Task<XmppIq> SendInBandBytestreamDataAsync(
        XmppAddress target,
        string sessionId,
        ushort sequence,
        byte[] data,
        TimeSpan timeout,
        int? blockSize = null,
        string id = "ibb-data-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppInBandBytestreams.CreateDataIq(id, target, sessionId, sequence, data, blockSize),
            timeout,
            cancellationToken);
    }

    public Task SendInBandBytestreamMessageDataAsync(
        XmppAddress target,
        string sessionId,
        ushort sequence,
        byte[] data,
        string? id = null,
        int? blockSize = null,
        CancellationToken cancellationToken = default)
    {
        return SendElementAsync(
            XmppInBandBytestreams.CreateDataMessage(target, sessionId, sequence, data, id, BoundJid, blockSize),
            cancellationToken);
    }

    public Task<XmppIq> CloseInBandBytestreamAsync(
        XmppAddress target,
        string sessionId,
        TimeSpan timeout,
        string id = "ibb-close-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppInBandBytestreams.CreateCloseRequest(id, target, sessionId),
            timeout,
            cancellationToken);
    }

    public async Task<XmppUserAvatarMetadata> RequestUserAvatarMetadataAsync(
        XmppAddress contact,
        TimeSpan timeout,
        string id = "avatar-metadata-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppUserAvatar.CreateMetadataRequest(id, contact),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppUserAvatar.TryParseMetadata(result, out var metadata) && metadata is not null)
        {
            return metadata;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The avatar metadata response was not valid.",
            result.Payload);
    }

    public async Task<XmppUserAvatarData> RequestUserAvatarDataAsync(
        XmppAddress contact,
        string avatarId,
        TimeSpan timeout,
        string id = "avatar-data-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppUserAvatar.CreateDataRequest(id, contact, avatarId),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppUserAvatar.TryParseData(result, out var data) && data is not null)
        {
            return data;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The avatar data response was not valid.",
            result.Payload);
    }

    public async Task<string> PublishUserAvatarDataAsync(
        byte[] pngData,
        TimeSpan timeout,
        string id = "avatar-data-publish-1",
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(pngData);

        var avatarId = XmppUserAvatar.ComputeId(pngData);
        await SendIqAndWaitAsync(
            XmppUserAvatar.CreateDataPublish(id, pngData),
            timeout,
            cancellationToken).ConfigureAwait(false);
        return avatarId;
    }

    public Task PublishUserAvatarMetadataAsync(
        IEnumerable<XmppUserAvatarInfo> infos,
        TimeSpan timeout,
        string id = "avatar-metadata-publish-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppUserAvatar.CreateMetadataPublish(id, infos),
            timeout,
            cancellationToken);
    }

    public Task DisableUserAvatarAsync(
        TimeSpan timeout,
        string id = "avatar-disable-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppUserAvatar.CreateDisableMetadataPublish(id),
            timeout,
            cancellationToken);
    }

    public async Task<XmppVCardTemp> RequestVCardAsync(
        XmppAddress? contact,
        TimeSpan timeout,
        string id = "vcard-get-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppVCardTemp.CreateGetRequest(id, contact),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppVCardTemp.TryParseResult(result, out var vCard) && vCard is not null)
        {
            return vCard;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The vCard response was not valid.",
            result.Payload);
    }

    public Task PublishVCardAsync(
        XmppVCardTemp vCard,
        TimeSpan timeout,
        string id = "vcard-set-1",
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(vCard);
        return SendIqAndWaitAsync(
            XmppVCardTemp.CreateSetRequest(id, vCard),
            timeout,
            cancellationToken);
    }

    public async Task<string> PublishVCardAvatarAsync(
        byte[] imageData,
        TimeSpan timeout,
        string contentType = XmppUserAvatar.RequiredContentType,
        bool sendPresenceUpdate = true,
        string vCardId = "vcard-avatar-set-1",
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(imageData);

        var vCard = XmppVCardAvatar.CreateVCard(imageData, contentType);
        await PublishVCardAsync(vCard, timeout, vCardId, cancellationToken).ConfigureAwait(false);
        var photoHash = XmppVCardAvatar.ComputePhotoHash(imageData);
        if (sendPresenceUpdate)
        {
            await SendPresenceAsync(
                new XmppPresence(VCardAvatarUpdate: new XmppVCardAvatarUpdate(photoHash)),
                cancellationToken).ConfigureAwait(false);
        }

        return photoHash;
    }

    public async Task<IReadOnlyList<uint>> RequestOmemoDeviceListAsync(
        XmppAddress contact,
        TimeSpan timeout,
        string id = "omemo-devices-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppOmemo.CreateDeviceListRequest(id, contact),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppOmemo.TryParseDeviceList(result, out var deviceIds))
        {
            return deviceIds;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The OMEMO device list response was not valid.",
            result.Payload);
    }

    public Task SendMultiUserChatJoinAsync(
        XmppAddress room,
        string nickname,
        string? password = null,
        int? historyMaxChars = null,
        CancellationToken cancellationToken = default)
    {
        return SendElementAsync(
            XmppMultiUserChat.CreateJoinPresence(room, nickname, password, historyMaxChars),
            cancellationToken);
    }

    public Task SendMultiUserChatLeaveAsync(
        XmppAddress room,
        string nickname,
        CancellationToken cancellationToken = default)
    {
        return SendElementAsync(
            XmppMultiUserChat.CreateLeavePresence(room, nickname),
            cancellationToken);
    }

    public Task SendMultiUserChatMessageAsync(
        XmppAddress room,
        string body,
        string? id = null,
        CancellationToken cancellationToken = default)
    {
        return SendMultiUserChatMessageAsync(room, body, id, null, cancellationToken);
    }

    public Task SendMultiUserChatMessageAsync(
        XmppAddress room,
        string body,
        string? id,
        string? replaceId,
        CancellationToken cancellationToken)
    {
        return SendElementAsync(
            XmppMultiUserChat.CreateGroupMessage(room, body, id, replaceId),
            cancellationToken);
    }

    public async Task<IReadOnlyList<XmppMucRoom>> RequestMultiUserChatRoomsAsync(
        XmppAddress service,
        TimeSpan timeout,
        string id = "muc-rooms-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppMultiUserChat.CreateRoomDiscoveryRequest(id, service),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppMultiUserChat.TryParseRoomDiscoveryResult(result, out var rooms) && rooms is not null)
        {
            return rooms;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The MUC room discovery response was not a valid disco#items result.",
            result.Payload);
    }

    public async Task<IReadOnlyList<XmppMucRoomItem>> RequestMultiUserChatRoomItemsAsync(
        XmppAddress room,
        TimeSpan timeout,
        string id = "muc-room-items-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppMultiUserChat.CreateRoomItemsRequest(id, room),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppMultiUserChat.TryParseRoomItemsResult(result, out var items) && items is not null)
        {
            return items;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The MUC room items response was not a valid disco#items result.",
            result.Payload);
    }

    public async Task<XmppDataForm> RequestMultiUserChatConfigurationFormAsync(
        XmppAddress room,
        TimeSpan timeout,
        string id = "muc-config-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppMultiUserChat.CreateConfigurationFormRequest(id, room),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppMultiUserChat.TryParseConfigurationForm(result, out var form) && form is not null)
        {
            return form;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The MUC configuration response was not a valid owner data form.",
            result.Payload);
    }

    public Task SubmitMultiUserChatConfigurationAsync(
        XmppAddress room,
        IEnumerable<XmppDataFormSubmitField> fields,
        TimeSpan timeout,
        string id = "muc-config-submit-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppMultiUserChat.CreateConfigurationSubmitRequest(id, room, fields),
            timeout,
            cancellationToken);
    }

    public async Task<IReadOnlyList<XmppMucAdminItem>> RequestMultiUserChatAdminItemsAsync(
        XmppAddress room,
        TimeSpan timeout,
        string? affiliation = null,
        string? role = null,
        string id = "muc-admin-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppMultiUserChat.CreateAdminListRequest(id, room, affiliation, role),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppMultiUserChat.TryParseAdminItemsResult(result, out var items) && items is not null)
        {
            return items;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The MUC admin response was not a valid admin item list.",
            result.Payload);
    }

    public Task SetMultiUserChatAdminItemsAsync(
        XmppAddress room,
        IEnumerable<XmppMucAdminItem> items,
        TimeSpan timeout,
        string id = "muc-admin-set-1",
        CancellationToken cancellationToken = default)
    {
        return SendIqAndWaitAsync(
            XmppMultiUserChat.CreateAdminSetRequest(id, room, items),
            timeout,
            cancellationToken);
    }

    public async Task<XmppMucSelfPingStatus> PingMultiUserChatSelfAsync(
        XmppAddress room,
        string nickname,
        TimeSpan timeout,
        string id = "muc-self-ping-1",
        CancellationToken cancellationToken = default)
    {
        var result = await SendIqAndWaitAsync(
            XmppMucSelfPing.CreatePingRequest(id, room, nickname, BoundJid),
            timeout,
            cancellationToken).ConfigureAwait(false);

        if (XmppMucSelfPing.TryParsePingResponse(result, out var status, out _))
        {
            return status;
        }

        throw new XmppProtocolException(
            XmppProtocolErrorKind.IqError,
            "The MUC self-ping response was not valid.",
            result.Payload);
    }

    public Task SendJingleAsync(XmppIq jingleIq, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(jingleIq);
        return SendElementAsync(jingleIq.ToXml(), cancellationToken);
    }

    public Task SendJingleMessageInitiationAsync(
        XElement message,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(message);
        if (!XmppJingleMessageInitiation.TryParse(message, out _))
        {
            throw new ArgumentException("The element is not a valid XEP-0353 Jingle Message Initiation stanza.", nameof(message));
        }

        return SendElementAsync(message, cancellationToken);
    }

    public Task SendChatMessageAsync(XmppChatMessage message, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(message);
        return SendElementAsync(message.ToXml(), cancellationToken);
    }

    public Task SendMessageCorrectionAsync(
        XmppAddress to,
        string correctedBody,
        string replaceId,
        string? id = null,
        XmppMessageType type = XmppMessageType.Chat,
        CancellationToken cancellationToken = default)
    {
        return SendChatMessageAsync(
            XmppChatMessage.CreateCorrection(to, correctedBody, replaceId, id, type),
            cancellationToken);
    }

    public Task SendMultiUserChatCorrectionAsync(
        XmppAddress room,
        string correctedBody,
        string replaceId,
        string? id = null,
        CancellationToken cancellationToken = default)
    {
        return SendMultiUserChatMessageAsync(
            room,
            correctedBody,
            id,
            replaceId,
            cancellationToken);
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
            for (var index = 0; index < nodes.Count; index++)
            {
                var node = nodes[index];
                if (node.Element is null)
                {
                    continue;
                }

                if (XmppStreamManagement.TryParseEnabled(node.Element, out var id, out var resumeSupported))
                {
                    PreserveTrailingNodes(nodes, index);
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
            for (var index = 0; index < nodes.Count; index++)
            {
                var node = nodes[index];
                if (node.Element is null)
                {
                    continue;
                }

                if (XmppStreamManagement.TryParseResumed(node.Element, out var id, out var serverHandled))
                {
                    PreserveTrailingNodes(nodes, index);
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
            if (_pendingNodes.Count == 0)
            {
                foreach (var node in await ReadNodesAsync(cancellationToken).ConfigureAwait(false))
                {
                    _pendingNodes.Enqueue(node);
                }
            }

            if (_pendingNodes.Count == 0)
            {
                continue;
            }

            var next = _pendingNodes.Dequeue();
            if (next.Type == XmppStreamNodeType.Stanza && next.Element is not null)
            {
                if (await HandleStreamManagementElementAsync(next.Element, cancellationToken).ConfigureAwait(false))
                {
                    continue;
                }

                if (IsClientStanza(next.Element))
                {
                    _streamManagement.CountInboundStanza();
                }

                return XmppIncomingStanza.FromElement(next.Element);
            }

            if (next.Type is XmppStreamNodeType.StreamClosed or XmppStreamNodeType.StreamError)
            {
                throw CreateStreamFailure(next, "The stream closed before a stanza was received.");
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

        if (_pendingNodes.Count > 0)
        {
            var pendingNodes = _pendingNodes.ToArray();
            _pendingNodes.Clear();
            return pendingNodes;
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
        ResetStreamReaderState();
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
            for (var index = 0; index < nodes.Count; index++)
            {
                var node = nodes[index];
                if (node.Type == XmppStreamNodeType.Features
                    && node.Element is not null
                    && XmppStreamFeatureSet.TryParse(node.Element, out var features))
                {
                    PreserveTrailingNodes(nodes, index);
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
            _stream = await _tlsStreamUpgrader
                .UpgradeAsync(_stream, XmppTlsClientOptions.ForStartTls(_settings.TlsServerName), cancellationToken)
                .ConfigureAwait(false);
            _writer = new XmppStreamWriter(_stream);
            _tlsActive = true;
            ResetStreamReaderState();
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

    private async Task UpgradeToDirectTlsAsync(CancellationToken cancellationToken)
    {
        if (_stream is null)
        {
            throw new InvalidOperationException("The XMPP stream is not connected.");
        }

        try
        {
            _stream = await _tlsStreamUpgrader
                .UpgradeAsync(_stream, XmppTlsClientOptions.ForDirectTls(_settings.TlsServerName), cancellationToken)
                .ConfigureAwait(false);
            _tlsActive = true;
            ResetStreamReaderState();
        }
        catch (Exception ex) when (ex is not XmppProtocolException)
        {
            throw new XmppProtocolException(
                XmppProtocolErrorKind.DirectTlsFailure,
                "The direct TLS connection failed.",
                innerException: ex);
        }
    }

    private async Task RestartStreamAfterAuthenticationAsync(CancellationToken cancellationToken)
    {
        _authenticated = true;
        ResetStreamReaderState();
        await WriteOpenStreamAsync(cancellationToken).ConfigureAwait(false);
    }

    private void ResetStreamReaderState()
    {
        _reader.Reset();
        _pendingNodes.Clear();
    }

    private void PreserveTrailingNodes(IReadOnlyList<XmppStreamNode> nodes, int processedIndex)
    {
        for (var index = processedIndex + 1; index < nodes.Count; index++)
        {
            _pendingNodes.Enqueue(nodes[index]);
        }
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
