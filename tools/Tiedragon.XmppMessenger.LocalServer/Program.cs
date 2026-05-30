using System.Collections.Concurrent;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using Tiedragon.XmppMessenger.Core.Xmpp;

var options = LocalServerOptions.Parse(args);
if (options is null)
{
    LocalServerOptions.PrintUsage();
    Environment.ExitCode = 2;
    return;
}

using var certificate = options.LoadOrCreateCertificate();
var uploadBaseUrl = options.UploadPort > 0
    ? $"http://{options.UploadListenAddress}:{options.UploadPort}/"
    : null;
var state = new LocalXmppServerState(options.Domain, certificate, uploadBaseUrl);
foreach (var account in options.Accounts)
{
    state.Accounts[account.Username] = account.Password;
}

using var cancellation = new CancellationTokenSource();
Console.CancelKeyPress += (_, eventArgs) =>
{
    eventArgs.Cancel = true;
    cancellation.Cancel();
};

var listener = new TcpListener(IPAddress.Parse(options.ListenAddress), options.Port);
listener.Start();
LocalUploadHttpServer? uploadServer = null;
Task? uploadServerTask = null;
if (options.UploadPort > 0)
{
    uploadServer = new LocalUploadHttpServer(options.UploadListenAddress, options.UploadPort, state);
    uploadServer.Start();
    uploadServerTask = uploadServer.RunAsync(cancellation.Token);
    Console.WriteLine($"Local HTTP upload endpoint listening on {uploadBaseUrl}");
}

Console.WriteLine($"Tiedragon Local XMPP server listening on {options.ListenAddress}:{options.Port} for domain {options.Domain}");
Console.WriteLine("Features: RFC 6120/6121 C2S, STARTTLS required, SASL PLAIN, resource bind, session, roster, presence, XEP-0030 disco, XEP-0077, XEP-0198 SM, XEP-0352 CSI, XEP-0054 vCard, XEP-0191 blocking, XEP-0215 STUN/TURN discovery, XEP-0363 slot/PUT smoke, XEP-0045 local MUC, direct chat relay");
Console.WriteLine("Scope: local development and smoke testing server; not hardened for internet-facing production use.");
Console.WriteLine($"Certificate SHA-256: {Convert.ToHexString(certificate.GetCertHash(HashAlgorithmName.SHA256)).ToLowerInvariant()}");

try
{
    while (!cancellation.IsCancellationRequested)
    {
        var client = await listener.AcceptTcpClientAsync(cancellation.Token);
        _ = Task.Run(() => HandleClientAsync(client, state, cancellation.Token), cancellation.Token);
    }
}
catch (OperationCanceledException)
{
}
finally
{
    listener.Stop();
    uploadServer?.Stop();
    if (uploadServerTask is not null)
    {
        try
        {
            await uploadServerTask;
        }
        catch (OperationCanceledException)
        {
        }
    }
}

static async Task HandleClientAsync(
    TcpClient client,
    LocalXmppServerState state,
    CancellationToken cancellationToken)
{
    var session = new LocalXmppSession(client, state);
    state.AddSession(session);
    Console.WriteLine("client connected");

    try
    {
        await session.RunAsync(cancellationToken);
    }
    catch (OperationCanceledException)
    {
    }
    catch (Exception ex)
    {
        Console.WriteLine("client failed: " + ex.Message);
    }
    finally
    {
        state.RemoveSession(session);
        client.Dispose();
        Console.WriteLine("client disconnected");
    }
}

sealed class LocalXmppServerState(string domain, X509Certificate2 certificate, string? uploadBaseUrl)
{
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, LocalXmppSession>> _sessionsByBareJid = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, LocalXmppSession> _sessionsByFullJid = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, LocalXmppSession>> _rooms = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, string>> _avatarDataByBareJid = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, string> _avatarMetadataByBareJid = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, string> _userLocationByBareJid = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, byte>> _blockedJidsByBareJid = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, LocalRosterItem>> _rostersByBareJid = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, LocalUploadSlotState> _uploadSlots = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, string> _presenceByBareJid = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, string> _vCardsByBareJid = new(StringComparer.OrdinalIgnoreCase);

    public string Domain { get; } = domain;

    public X509Certificate2 Certificate { get; } = certificate;

    public string? UploadBaseUrl { get; } = uploadBaseUrl;

    public ConcurrentDictionary<string, string> Accounts { get; } = new(StringComparer.OrdinalIgnoreCase);

    public LocalUploadSlot CreateUploadSlot(string fileName, long expectedSize)
    {
        var token = Guid.NewGuid().ToString("N");
        var escapedName = Uri.EscapeDataString(fileName);
        var path = $"/local/{token}/{escapedName}";
        _uploadSlots[path] = new LocalUploadSlotState(
            fileName,
            expectedSize,
            DateTimeOffset.UtcNow.AddMinutes(5));

        if (string.IsNullOrWhiteSpace(UploadBaseUrl))
        {
            return new LocalUploadSlot(
                $"https://upload.{Domain}/local/{token}/{escapedName}",
                $"https://download.{Domain}/local/{token}/{escapedName}");
        }

        var baseUrl = UploadBaseUrl.EndsWith("/", StringComparison.Ordinal)
            ? UploadBaseUrl[..^1]
            : UploadBaseUrl;
        var url = baseUrl + path;
        return new LocalUploadSlot(url, url);
    }

    public LocalUploadWriteStatus StoreUpload(string path, byte[] data, string? contentType)
    {
        if (!_uploadSlots.TryGetValue(path, out var slot))
        {
            return LocalUploadWriteStatus.NotFound;
        }

        if (slot.ExpiresAt < DateTimeOffset.UtcNow)
        {
            return LocalUploadWriteStatus.Expired;
        }

        if (data.LongLength != slot.ExpectedSize)
        {
            return LocalUploadWriteStatus.SizeMismatch;
        }

        slot.Data = data;
        slot.ContentType = string.IsNullOrWhiteSpace(contentType)
            ? "application/octet-stream"
            : contentType;
        return LocalUploadWriteStatus.Stored;
    }

    public bool TryReadUpload(string path, out byte[] data, out string contentType)
    {
        data = [];
        contentType = "application/octet-stream";
        if (!_uploadSlots.TryGetValue(path, out var slot)
            || slot.Data is null
            || slot.ExpiresAt < DateTimeOffset.UtcNow)
        {
            return false;
        }

        data = slot.Data;
        contentType = slot.ContentType;
        return true;
    }

    public void AddSession(LocalXmppSession session)
    {
        UpdateSessionJid(session);
    }

    public void UpdateSessionJid(LocalXmppSession session)
    {
        if (session.BareJid is not null)
        {
            var resources = _sessionsByBareJid.GetOrAdd(
                session.BareJid,
                _ => new ConcurrentDictionary<string, LocalXmppSession>(StringComparer.OrdinalIgnoreCase));
            resources[session.FullJid ?? session.BareJid] = session;
        }

        if (session.FullJid is not null)
        {
            _sessionsByFullJid[session.FullJid] = session;
        }
    }

    public void RemoveSession(LocalXmppSession session)
    {
        if (session.BareJid is not null)
        {
            if (_sessionsByBareJid.TryGetValue(session.BareJid, out var resources))
            {
                foreach (var resource in resources)
                {
                    if (ReferenceEquals(resource.Value, session))
                    {
                        resources.TryRemove(resource.Key, out _);
                    }
                }

                if (resources.IsEmpty)
                {
                    _sessionsByBareJid.TryRemove(session.BareJid, out _);
                    _presenceByBareJid.TryRemove(session.BareJid, out _);
                }
            }
        }

        if (session.FullJid is not null)
        {
            _sessionsByFullJid.TryRemove(session.FullJid, out _);
        }

        foreach (var room in _rooms.Values)
        {
            foreach (var occupant in room)
            {
                if (ReferenceEquals(occupant.Value, session))
                {
                    room.TryRemove(occupant.Key, out _);
                }
            }
        }
    }

    public bool TryGetSession(string jid, out LocalXmppSession? session)
    {
        if (_sessionsByFullJid.TryGetValue(jid, out session))
        {
            return true;
        }

        var bare = BareJid(jid);
        if (_sessionsByBareJid.TryGetValue(bare, out var resources)
            && resources.Values.FirstOrDefault() is { } first)
        {
            session = first;
            return true;
        }

        session = null;
        return false;
    }

    public IReadOnlyList<LocalXmppSession> GetSessionsForBareJid(string bareJid)
    {
        return _sessionsByBareJid.TryGetValue(bareJid, out var resources)
            ? resources.Values.ToArray()
            : [];
    }

    public IReadOnlyList<LocalXmppSession> GetAllSessions()
    {
        return _sessionsByBareJid.Values.SelectMany(resources => resources.Values).Distinct().ToArray();
    }

    public IReadOnlyList<LocalRosterItem> GetRoster(string ownerBareJid)
    {
        var roster = _rostersByBareJid.GetOrAdd(
            ownerBareJid,
            _ => new ConcurrentDictionary<string, LocalRosterItem>(StringComparer.OrdinalIgnoreCase));
        foreach (var username in Accounts.Keys.Order(StringComparer.OrdinalIgnoreCase))
        {
            var jid = $"{username}@{Domain}";
            if (!string.Equals(jid, ownerBareJid, StringComparison.OrdinalIgnoreCase))
            {
                roster.TryAdd(jid, new LocalRosterItem(jid, username, "both"));
            }
        }

        return roster.Values.OrderBy(item => item.Jid, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    public void SetRosterItem(string ownerBareJid, string jid, string? name)
    {
        var roster = _rostersByBareJid.GetOrAdd(
            ownerBareJid,
            _ => new ConcurrentDictionary<string, LocalRosterItem>(StringComparer.OrdinalIgnoreCase));
        var bare = BareJid(NormalizeJid(jid));
        roster[bare] = new LocalRosterItem(bare, string.IsNullOrWhiteSpace(name) ? bare.Split('@')[0] : name, "both");
    }

    public void RemoveRosterItem(string ownerBareJid, string jid)
    {
        if (_rostersByBareJid.TryGetValue(ownerBareJid, out var roster))
        {
            roster.TryRemove(BareJid(NormalizeJid(jid)), out _);
        }
    }

    public void StorePresence(string bareJid, XElement presence)
    {
        var copy = new XElement(presence);
        copy.SetAttributeValue("from", bareJid);
        copy.SetAttributeValue("to", null);
        _presenceByBareJid[bareJid] = copy.ToString(SaveOptions.DisableFormatting);
    }

    public void ClearPresence(string bareJid)
    {
        _presenceByBareJid.TryRemove(bareJid, out _);
    }

    public IEnumerable<string> GetOnlinePresenceForRoster(string ownerBareJid)
    {
        foreach (var item in GetRoster(ownerBareJid))
        {
            if (_presenceByBareJid.TryGetValue(item.Jid, out var presenceXml))
            {
                yield return presenceXml;
            }
        }
    }

    public void StoreVCard(string bareJid, XElement vCard)
    {
        _vCardsByBareJid[bareJid] = new XElement(vCard).ToString(SaveOptions.DisableFormatting);
    }

    public string GetVCard(string bareJid)
    {
        if (_vCardsByBareJid.TryGetValue(bareJid, out var vCard))
        {
            return vCard;
        }

        var name = bareJid.Split('@')[0];
        return $"""
            <vCard xmlns="vcard-temp">
              <FN>{System.Security.SecurityElement.Escape(name)}</FN>
              <NICKNAME>{System.Security.SecurityElement.Escape(name)}</NICKNAME>
            </vCard>
            """;
    }

    public IReadOnlyList<string> GetBlockedJids(string ownerBareJid)
    {
        return _blockedJidsByBareJid.TryGetValue(ownerBareJid, out var blocked)
            ? blocked.Keys.Order(StringComparer.OrdinalIgnoreCase).ToArray()
            : [];
    }

    public void BlockJids(string ownerBareJid, IEnumerable<string> jids)
    {
        var blocked = _blockedJidsByBareJid.GetOrAdd(
            ownerBareJid,
            _ => new ConcurrentDictionary<string, byte>(StringComparer.OrdinalIgnoreCase));
        foreach (var jid in jids)
        {
            blocked[NormalizeJid(jid)] = 0;
        }
    }

    public void UnblockJids(string ownerBareJid, IEnumerable<string> jids)
    {
        if (!_blockedJidsByBareJid.TryGetValue(ownerBareJid, out var blocked))
        {
            return;
        }

        foreach (var jid in jids)
        {
            blocked.TryRemove(NormalizeJid(jid), out _);
        }
    }

    public void UnblockAllJids(string ownerBareJid)
    {
        _blockedJidsByBareJid.TryRemove(ownerBareJid, out _);
    }

    public bool IsBlockedBy(string ownerBareJid, string? otherJid)
    {
        if (string.IsNullOrWhiteSpace(otherJid)
            || !_blockedJidsByBareJid.TryGetValue(ownerBareJid, out var blocked))
        {
            return false;
        }

        return blocked.ContainsKey(NormalizeJid(otherJid))
            || blocked.ContainsKey(BareJid(otherJid));
    }

    public void JoinRoom(string roomJid, string nick, LocalXmppSession session)
    {
        var room = _rooms.GetOrAdd(roomJid, _ => new ConcurrentDictionary<string, LocalXmppSession>(StringComparer.OrdinalIgnoreCase));
        room[nick] = session;
    }

    public void LeaveRoom(string roomJid, string nick)
    {
        if (_rooms.TryGetValue(roomJid, out var room))
        {
            room.TryRemove(nick, out _);
        }
    }

    public IReadOnlyList<(string Nick, LocalXmppSession Session)> GetRoomOccupants(string roomJid)
    {
        return _rooms.TryGetValue(roomJid, out var room)
            ? room.Select(occupant => (occupant.Key, occupant.Value)).ToArray()
            : [];
    }

    public string? GetRoomNick(string roomJid, LocalXmppSession session)
    {
        if (!_rooms.TryGetValue(roomJid, out var room))
        {
            return null;
        }

        return room.FirstOrDefault(occupant => ReferenceEquals(occupant.Value, session)).Key;
    }

    public void StoreAvatarData(string bareJid, string itemId, XElement dataElement)
    {
        var store = _avatarDataByBareJid.GetOrAdd(bareJid, _ => new ConcurrentDictionary<string, string>(StringComparer.OrdinalIgnoreCase));
        store[itemId] = new XElement(dataElement).ToString(SaveOptions.DisableFormatting);
    }

    public bool TryGetAvatarData(string bareJid, string itemId, out string? dataXml)
    {
        dataXml = null;
        return _avatarDataByBareJid.TryGetValue(bareJid, out var store)
            && store.TryGetValue(itemId, out dataXml);
    }

    public void StoreAvatarMetadata(string bareJid, XElement metadataElement)
    {
        _avatarMetadataByBareJid[bareJid] = new XElement(metadataElement).ToString(SaveOptions.DisableFormatting);
    }

    public bool TryGetAvatarMetadata(string bareJid, out string? metadataXml)
    {
        return _avatarMetadataByBareJid.TryGetValue(bareJid, out metadataXml);
    }

    public void StoreUserLocation(string bareJid, XElement locationElement)
    {
        _userLocationByBareJid[bareJid] = new XElement(locationElement).ToString(SaveOptions.DisableFormatting);
    }

    public bool TryGetUserLocation(string bareJid, out string? locationXml)
    {
        return _userLocationByBareJid.TryGetValue(bareJid, out locationXml);
    }

    private static string BareJid(string jid)
    {
        var slash = jid.IndexOf('/');
        return slash >= 0 ? jid[..slash] : jid;
    }

    private static string NormalizeJid(string jid)
    {
        return XmppAddress.TryParse(jid, out var address) && address is not null
            ? address.Full
            : jid;
    }
}

sealed class LocalXmppSession(TcpClient client, LocalXmppServerState state)
{
    private Stream _stream = client.GetStream();
    private readonly StringBuilder _buffer = new();
    private string? _username;
    private bool _tlsActive;
    private bool _streamManagementEnabled;
    private bool _clientInactive;
    private long _handledInboundStanzas;
    private readonly string _streamManagementId = "sm-" + Guid.NewGuid().ToString("N");

    public string? BareJid => _username is null ? null : $"{_username}@{state.Domain}";

    public string? FullJid { get; private set; }

    public bool IsClientInactive => _clientInactive;

    private bool IsAuthenticated => _username is not null;

    private bool IsBound => FullJid is not null;

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var node = await ReadNextNodeAsync(cancellationToken);
            if (node is null)
            {
                return;
            }

            if (node.StartsWith("<stream:stream", StringComparison.Ordinal))
            {
                await SendOpenAndFeaturesAsync(cancellationToken);
                continue;
            }

            if (node.StartsWith("</stream:stream>", StringComparison.Ordinal))
            {
                await WriteAsync("</stream:stream>", cancellationToken);
                return;
            }

            await HandleElementAsync(node, cancellationToken);
        }
    }

    public Task SendAsync(string xml, CancellationToken cancellationToken)
    {
        return WriteAsync(xml, cancellationToken);
    }

    private async Task HandleElementAsync(string xml, CancellationToken cancellationToken)
    {
        XElement element;
        try
        {
            element = ParseClientElement(xml);
        }
        catch (XmlException ex)
        {
            await WriteAsync(StreamError("bad-format", ex.Message), cancellationToken);
            return;
        }

        if (element.Name.LocalName is "iq" or "message" or "presence")
        {
            _handledInboundStanzas++;
        }

        switch (element.Name.LocalName)
        {
            case "starttls":
                await HandleStartTlsAsync(cancellationToken);
                break;
            case "auth":
                await HandleAuthAsync(element, cancellationToken);
                break;
            case "iq":
                await HandleIqAsync(element, cancellationToken);
                break;
            case "message":
                await HandleMessageAsync(element, cancellationToken);
                break;
            case "presence":
                await HandlePresenceAsync(element, cancellationToken);
                break;
            case "enable":
                await HandleStreamManagementEnableAsync(element, cancellationToken);
                break;
            case "r":
                await HandleStreamManagementRequestAsync(element, cancellationToken);
                break;
            case "a":
                break;
            case "active":
                _clientInactive = false;
                break;
            case "inactive":
                _clientInactive = true;
                break;
            default:
                await WriteAsync(StreamError("unsupported-stanza-type", $"Unsupported stream element '{element.Name.LocalName}'."), cancellationToken);
                break;
        }
    }

    private async Task HandleStartTlsAsync(CancellationToken cancellationToken)
    {
        if (_tlsActive)
        {
            await WriteAsync("<failure xmlns=\"urn:ietf:params:xml:ns:xmpp-tls\"/>", cancellationToken);
            return;
        }

        await WriteAsync("<proceed xmlns=\"urn:ietf:params:xml:ns:xmpp-tls\"/>", cancellationToken);
        var sslStream = new SslStream(_stream, leaveInnerStreamOpen: false);
        await sslStream.AuthenticateAsServerAsync(new SslServerAuthenticationOptions
        {
            ServerCertificate = state.Certificate,
            EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
            ClientCertificateRequired = false
        }, cancellationToken);

        _stream = sslStream;
        _buffer.Clear();
        _tlsActive = true;
    }

    private async Task HandleAuthAsync(XElement element, CancellationToken cancellationToken)
    {
        if (!_tlsActive)
        {
            await WriteAsync("<failure xmlns=\"urn:ietf:params:xml:ns:xmpp-sasl\"><encryption-required/></failure>", cancellationToken);
            return;
        }

        var mechanism = (string?)element.Attribute("mechanism");
        if (!string.Equals(mechanism, "PLAIN", StringComparison.OrdinalIgnoreCase))
        {
            await WriteAsync("<failure xmlns=\"urn:ietf:params:xml:ns:xmpp-sasl\"><invalid-mechanism/></failure>", cancellationToken);
            return;
        }

        string data;
        try
        {
            data = Encoding.UTF8.GetString(Convert.FromBase64String(element.Value));
        }
        catch (FormatException)
        {
            await WriteAsync("<failure xmlns=\"urn:ietf:params:xml:ns:xmpp-sasl\"><malformed-request/></failure>", cancellationToken);
            return;
        }

        var parts = data.Split('\0');
        var authcid = parts.Length >= 2 ? parts[^2] : string.Empty;
        var password = parts.Length >= 1 ? parts[^1] : string.Empty;
        var username = authcid.Contains('@', StringComparison.Ordinal)
            ? authcid[..authcid.IndexOf('@')]
            : authcid;

        if (state.Accounts.TryGetValue(username, out var expected) && expected == password)
        {
            _username = username;
            state.UpdateSessionJid(this);
            await WriteAsync("<success xmlns=\"urn:ietf:params:xml:ns:xmpp-sasl\"/>", cancellationToken);
            return;
        }

        await WriteAsync("<failure xmlns=\"urn:ietf:params:xml:ns:xmpp-sasl\"><not-authorized/></failure>", cancellationToken);
    }

    private async Task HandleStreamManagementEnableAsync(XElement element, CancellationToken cancellationToken)
    {
        if (element.Name.NamespaceName != "urn:xmpp:sm:3")
        {
            return;
        }

        if (!IsBound)
        {
            await WriteAsync("<failed xmlns=\"urn:xmpp:sm:3\"><unexpected-request xmlns=\"urn:ietf:params:xml:ns:xmpp-stanzas\"/></failed>", cancellationToken);
            return;
        }

        _streamManagementEnabled = true;
        await WriteAsync($"""<enabled xmlns="urn:xmpp:sm:3" id="{Escape(_streamManagementId)}" resume="false"/>""", cancellationToken);
    }

    private async Task HandleStreamManagementRequestAsync(XElement element, CancellationToken cancellationToken)
    {
        if (element.Name.NamespaceName != "urn:xmpp:sm:3" || !_streamManagementEnabled)
        {
            return;
        }

        await WriteAsync($"""<a xmlns="urn:xmpp:sm:3" h="{_handledInboundStanzas}"/>""", cancellationToken);
    }

    private async Task HandleIqAsync(XElement element, CancellationToken cancellationToken)
    {
        var id = (string?)element.Attribute("id") ?? string.Empty;

        if (!_tlsActive)
        {
            await WriteAsync(NotAuthorizedIq(id), cancellationToken);
            return;
        }

        var type = (string?)element.Attribute("type") ?? string.Empty;
        var to = (string?)element.Attribute("to") ?? string.Empty;
        if (type is not ("get" or "set" or "result" or "error"))
        {
            await WriteAsync(BadRequestIq(id), cancellationToken);
            return;
        }

        var payloads = element.Elements().ToArray();
        if (payloads.Length != 1)
        {
            await WriteAsync(BadRequestIq(id), cancellationToken);
            return;
        }

        var payload = payloads[0];

        if (payload?.Name == XName.Get("query", "jabber:iq:register"))
        {
            await HandleRegistrationIqAsync(id, type, payload, cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("bind", "urn:ietf:params:xml:ns:xmpp-bind") && type == "set")
        {
            if (!IsAuthenticated || BareJid is null)
            {
                await WriteAsync(NotAuthorizedIq(id), cancellationToken);
                return;
            }

            var requestedResource = payload.Element(XName.Get("resource", "urn:ietf:params:xml:ns:xmpp-bind"))?.Value;
            var resource = string.IsNullOrWhiteSpace(requestedResource) ? "local" : requestedResource;
            FullJid = $"{BareJid}/{resource}";
            state.UpdateSessionJid(this);
            await WriteAsync($"""
                <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                  <bind xmlns="urn:ietf:params:xml:ns:xmpp-bind">
                    <jid>{Escape(FullJid)}</jid>
                  </bind>
                </iq>
                """, cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("session", "urn:ietf:params:xml:ns:xmpp-session") && type == "set")
        {
            if (!IsBound)
            {
                await WriteAsync(NotAuthorizedIq(id), cancellationToken);
                return;
            }

            await WriteAsync($"<iq xmlns=\"jabber:client\" type=\"result\" id=\"{Escape(id)}\"/>", cancellationToken);
            return;
        }

        if (!IsBound)
        {
            await WriteAsync(NotAuthorizedIq(id), cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("query", "jabber:iq:roster") && type == "get")
        {
            var rosterItems = string.IsNullOrWhiteSpace(BareJid)
                ? []
                : state.GetRoster(BareJid)
                    .Select(item => $"<item jid=\"{Escape(item.Jid)}\" name=\"{Escape(item.Name)}\" subscription=\"{Escape(item.Subscription)}\"/>")
                    .ToArray();
            await WriteAsync($"""
                <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                  <query xmlns="jabber:iq:roster">
                    {string.Join(Environment.NewLine + "    ", rosterItems)}
                  </query>
                </iq>
                """, cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("query", "jabber:iq:roster") && type == "set")
        {
            if (string.IsNullOrWhiteSpace(BareJid))
            {
                await WriteAsync(BadRequestIq(id), cancellationToken);
                return;
            }

            var item = payload.Element(XName.Get("item", "jabber:iq:roster"));
            var itemJid = (string?)item?.Attribute("jid");
            if (string.IsNullOrWhiteSpace(itemJid) || !XmppAddress.TryParse(itemJid, out _))
            {
                await WriteAsync(BadRequestIq(id), cancellationToken);
                return;
            }

            if (string.Equals((string?)item?.Attribute("subscription"), "remove", StringComparison.Ordinal))
            {
                state.RemoveRosterItem(BareJid, itemJid);
            }
            else
            {
                state.SetRosterItem(BareJid, itemJid, (string?)item?.Attribute("name"));
            }

            await WriteAsync($"<iq xmlns=\"jabber:client\" type=\"result\" id=\"{Escape(id)}\"/>", cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("query", "jabber:iq:version") && type == "get")
        {
            await WriteAsync($"""
                <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                  <query xmlns="jabber:iq:version">
                    <name>Tiedragon Local XMPP Server</name>
                    <version>0.1</version>
                  </query>
                </iq>
                """, cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("vCard", "vcard-temp"))
        {
            await HandleVCardIqAsync(id, type, to, payload, cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("blocklist", XmppBlockingCommand.NamespaceName) && type == "get")
        {
            var blocked = string.IsNullOrWhiteSpace(BareJid)
                ? []
                : state.GetBlockedJids(BareJid)
                    .Select(jid => $"<item jid=\"{Escape(jid)}\"/>")
                    .ToArray();
            await WriteAsync($"""
                <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                  <blocklist xmlns="{XmppBlockingCommand.NamespaceName}">
                    {string.Join(Environment.NewLine + "    ", blocked)}
                  </blocklist>
                </iq>
                """, cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("block", XmppBlockingCommand.NamespaceName) && type == "set")
        {
            var jids = GetBlockingItems(payload).ToArray();
            if (string.IsNullOrWhiteSpace(BareJid) || jids.Length == 0)
            {
                await WriteAsync(BadRequestIq(id), cancellationToken);
                return;
            }

            state.BlockJids(BareJid, jids);
            await WriteAsync($"<iq xmlns=\"jabber:client\" type=\"result\" id=\"{Escape(id)}\"/>", cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("unblock", XmppBlockingCommand.NamespaceName) && type == "set")
        {
            if (string.IsNullOrWhiteSpace(BareJid))
            {
                await WriteAsync(BadRequestIq(id), cancellationToken);
                return;
            }

            var jids = GetBlockingItems(payload).ToArray();
            if (jids.Length == 0)
            {
                state.UnblockAllJids(BareJid);
            }
            else
            {
                state.UnblockJids(BareJid, jids);
            }

            await WriteAsync($"<iq xmlns=\"jabber:client\" type=\"result\" id=\"{Escape(id)}\"/>", cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("pubsub", XmppUserAvatar.PubSubNamespaceName))
        {
            if (await HandleAvatarPubSubIqAsync(id, type, to, payload, cancellationToken))
            {
                return;
            }

            if (await HandleUserLocationPubSubIqAsync(id, type, to, payload, cancellationToken))
            {
                return;
            }
        }

        if (payload?.Name == XName.Get("services", XmppExternalServiceDiscovery.NamespaceName) && type == "get")
        {
            await HandleExternalServicesIqAsync(id, payload, cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("credentials", XmppExternalServiceDiscovery.NamespaceName) && type == "get")
        {
            await HandleExternalServiceCredentialsIqAsync(id, payload, cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("query", "http://jabber.org/protocol/disco#info") && type == "get")
        {
            if (IsMucAddress(to))
            {
                var identityType = to.Contains('@', StringComparison.Ordinal) ? "text" : "service";
                var identityName = to.Contains('@', StringComparison.Ordinal) ? "Team room" : "Tiedragon Local Conference";
                await WriteAsync($"""
                    <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                      <query xmlns="http://jabber.org/protocol/disco#info">
                        <identity category="conference" type="{identityType}" name="{identityName}"/>
                        <feature var="http://jabber.org/protocol/muc"/>
                      </query>
                    </iq>
                    """, cancellationToken);
                return;
            }

            var contactForm = XmppServiceContactAddresses.CreateDataForm(
            [
                new XmppServiceContactAddress(XmppServiceContactAddressKind.Abuse, new Uri($"mailto:abuse@{state.Domain}")),
                new XmppServiceContactAddress(XmppServiceContactAddressKind.Admin, new Uri($"mailto:xmpp@{state.Domain}")),
                new XmppServiceContactAddress(XmppServiceContactAddressKind.Security, new Uri($"xmpp:security@{state.Domain}")),
                new XmppServiceContactAddress(XmppServiceContactAddressKind.Status, new Uri($"https://status.{state.Domain}")),
                new XmppServiceContactAddress(XmppServiceContactAddressKind.Support, new Uri($"xmpp:support@{state.Domain}"))
            ]).ToString(SaveOptions.DisableFormatting);

            await WriteAsync($"""
                <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                  <query xmlns="http://jabber.org/protocol/disco#info">
                    <identity category="server" type="im" name="Tiedragon Local XMPP Server"/>
                    <identity category="store" type="file" name="HTTP File Upload"/>
                    <identity category="pubsub" type="pep" name="Personal Eventing"/>
                    <feature var="http://jabber.org/protocol/disco#info"/>
                    <feature var="http://jabber.org/protocol/disco#items"/>
                    <feature var="{XmppPersonalEventing.PubSubNamespaceName}"/>
                    <feature var="{XmppPersonalEventing.PublishFeature}"/>
                    <feature var="{XmppPersonalEventing.AutoCreateFeature}"/>
                    <feature var="{XmppPersonalEventing.RetrieveItemsFeature}"/>
                    <feature var="{XmppPersonalEventing.SubscribeFeature}"/>
                    <feature var="jabber:iq:register"/>
                    <feature var="jabber:iq:roster"/>
                    <feature var="jabber:iq:version"/>
                    <feature var="vcard-temp"/>
                    <feature var="urn:xmpp:rtt:0"/>
                    <feature var="urn:xmpp:receipts"/>
                    <feature var="urn:xmpp:sm:3"/>
                    <feature var="urn:xmpp:csi:0"/>
                    <feature var="urn:xmpp:chat-markers:0"/>
                    <feature var="http://jabber.org/protocol/chatstates"/>
                    <feature var="{XmppBlockingCommand.NamespaceName}"/>
                    <feature var="{XmppUserAvatar.MetadataNotificationFeature}"/>
                    <feature var="{XmppUserAvatar.DataNamespaceName}+notify"/>
                    <feature var="{XmppUserAvatar.MetadataNamespaceName}+notify"/>
                    <feature var="{XmppUserLocation.NotificationFeature}"/>
                    <feature var="{XmppExternalServiceDiscovery.NamespaceName}"/>
                    <feature var="urn:xmpp:http:upload:0"/>
                    <feature var="urn:xmpp:http:upload:purpose:0#message"/>
                    <x xmlns="jabber:x:data" type="result">
                      <field var="FORM_TYPE" type="hidden">
                        <value>urn:xmpp:http:upload:0</value>
                      </field>
                      <field var="max-file-size">
                        <value>10485760</value>
                      </field>
                    </x>
                    {contactForm}
                  </query>
                </iq>
                """, cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("query", "http://jabber.org/protocol/disco#items") && type == "get")
        {
            if (to.Contains("@conference.", StringComparison.OrdinalIgnoreCase))
            {
                await WriteAsync($"""
                    <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                      <query xmlns="http://jabber.org/protocol/disco#items">
                        <item jid="{Escape(to)}/Edward" name="Edward"/>
                        <item jid="{Escape(to)}/Anna" name="Anna"/>
                      </query>
                    </iq>
                    """, cancellationToken);
                return;
            }

            if (!string.IsNullOrWhiteSpace(to) && to.Contains('@', StringComparison.Ordinal))
            {
                await WriteAsync($"""
                    <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                      <query xmlns="http://jabber.org/protocol/disco#items">
                        <item jid="{Escape(ToBareJid(to))}" node="{XmppUserAvatar.DataNamespaceName}"/>
                        <item jid="{Escape(ToBareJid(to))}" node="{XmppUserAvatar.MetadataNamespaceName}"/>
                        <item jid="{Escape(ToBareJid(to))}" node="{XmppUserLocation.NamespaceName}"/>
                      </query>
                    </iq>
                    """, cancellationToken);
                return;
            }

            await WriteAsync($"""
                <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                  <query xmlns="http://jabber.org/protocol/disco#items">
                    <item jid="team@conference.{Escape(state.Domain)}" name="Team room"/>
                    <item jid="support@conference.{Escape(state.Domain)}" name="Support"/>
                  </query>
                </iq>
                """, cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("query", "http://jabber.org/protocol/muc#owner"))
        {
            if (type == "get")
            {
                await WriteAsync($"""
                    <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                      <query xmlns="http://jabber.org/protocol/muc#owner">
                        <x xmlns="jabber:x:data" type="form">
                          <field var="FORM_TYPE" type="hidden">
                            <value>http://jabber.org/protocol/muc#roomconfig</value>
                          </field>
                          <field var="muc#roomconfig_roomname">
                            <value>Team room</value>
                          </field>
                        </x>
                      </query>
                    </iq>
                    """, cancellationToken);
                return;
            }

            if (type == "set")
            {
                await WriteAsync($"<iq xmlns=\"jabber:client\" type=\"result\" id=\"{Escape(id)}\"/>", cancellationToken);
                return;
            }
        }

        if (payload?.Name == XName.Get("query", "http://jabber.org/protocol/muc#admin"))
        {
            if (type == "get")
            {
                await WriteAsync($"""
                    <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                      <query xmlns="http://jabber.org/protocol/muc#admin">
                        <item affiliation="member" jid="anna@{Escape(state.Domain)}" nick="Anna"/>
                        <item affiliation="owner" jid="edward@{Escape(state.Domain)}" nick="Edward"/>
                      </query>
                    </iq>
                    """, cancellationToken);
                return;
            }

            if (type == "set")
            {
                await WriteAsync($"<iq xmlns=\"jabber:client\" type=\"result\" id=\"{Escape(id)}\"/>", cancellationToken);
                return;
            }
        }

        if (payload?.Name == XName.Get("request", "urn:xmpp:http:upload:0") && type == "get")
        {
            var fileName = (string?)payload.Attribute("filename") ?? "upload.bin";
            var size = (string?)payload.Attribute("size") ?? "0";
            if (!long.TryParse(size, out var parsedSize) || parsedSize < 0 || parsedSize > 10_485_760)
            {
                await WriteAsync($"""
                    <iq xmlns="jabber:client" type="error" id="{Escape(id)}">
                      <request xmlns="urn:xmpp:http:upload:0" filename="{Escape(fileName)}" size="{Escape(size)}"/>
                      <error type="modify">
                        <not-acceptable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>
                        <file-too-large xmlns="urn:xmpp:http:upload:0"><max-file-size>10485760</max-file-size></file-too-large>
                      </error>
                    </iq>
                    """, cancellationToken);
                return;
            }

            var slot = state.CreateUploadSlot(fileName, parsedSize);
            await WriteAsync($"""
                <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                  <slot xmlns="urn:xmpp:http:upload:0">
                    <put url="{Escape(slot.PutUrl)}">
                      <header name="Expires">{DateTimeOffset.UtcNow.AddMinutes(5):yyyy-MM-ddTHH:mm:ssZ}</header>
                    </put>
                    <get url="{Escape(slot.GetUrl)}"/>
                  </slot>
                </iq>
                """, cancellationToken);
            return;
        }
        await WriteAsync($"""
            <iq xmlns="jabber:client" type="error" id="{Escape(id)}">
              <error type="cancel"><service-unavailable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error>
            </iq>
            """, cancellationToken);
    }

    private async Task HandleVCardIqAsync(
        string id,
        string type,
        string to,
        XElement vCard,
        CancellationToken cancellationToken)
    {
        if (type == "set")
        {
            if (string.IsNullOrWhiteSpace(BareJid))
            {
                await WriteAsync(BadRequestIq(id), cancellationToken);
                return;
            }

            state.StoreVCard(BareJid, vCard);
            await WriteAsync($"<iq xmlns=\"jabber:client\" type=\"result\" id=\"{Escape(id)}\"/>", cancellationToken);
            return;
        }

        if (type == "get")
        {
            var targetBare = string.IsNullOrWhiteSpace(to) ? BareJid : ToBareJid(to);
            if (string.IsNullOrWhiteSpace(targetBare))
            {
                await WriteAsync(BadRequestIq(id), cancellationToken);
                return;
            }

            await WriteAsync($"""
                <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                  {state.GetVCard(targetBare)}
                </iq>
                """, cancellationToken);
            return;
        }

        await WriteAsync(BadRequestIq(id), cancellationToken);
    }

    private async Task HandleExternalServicesIqAsync(
        string id,
        XElement payload,
        CancellationToken cancellationToken)
    {
        var requestedType = (string?)payload.Attribute("type");
        var services = CreateLocalExternalServices()
            .Where(service => string.IsNullOrWhiteSpace(requestedType)
                || string.Equals(service.Type, requestedType, StringComparison.OrdinalIgnoreCase))
            .Select(service => XmppExternalServiceDiscovery.CreateServiceElement(service).ToString(SaveOptions.DisableFormatting))
            .ToArray();
        var typeAttribute = string.IsNullOrWhiteSpace(requestedType)
            ? string.Empty
            : $" type=\"{Escape(requestedType)}\"";

        await WriteAsync($"""
            <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
              <services xmlns="{XmppExternalServiceDiscovery.NamespaceName}"{typeAttribute}>
                {string.Join(Environment.NewLine + "    ", services)}
              </services>
            </iq>
            """, cancellationToken);
    }

    private async Task HandleExternalServiceCredentialsIqAsync(
        string id,
        XElement payload,
        CancellationToken cancellationToken)
    {
        var requested = payload.Element(XName.Get("service", XmppExternalServiceDiscovery.NamespaceName));
        var host = (string?)requested?.Attribute("host");
        var type = (string?)requested?.Attribute("type");
        var port = ParsePort((string?)requested?.Attribute("port"));
        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(type))
        {
            await WriteAsync(BadRequestIq(id), cancellationToken);
            return;
        }

        var localService = CreateLocalExternalServices().FirstOrDefault(service =>
            string.Equals(service.Type, type, StringComparison.OrdinalIgnoreCase)
            && string.Equals(service.Host, host, StringComparison.OrdinalIgnoreCase)
            && (port is null || service.Port == port));
        if (localService is null || !localService.RequiresCredentials)
        {
            await WriteAsync($"""
                <iq xmlns="jabber:client" type="error" id="{Escape(id)}">
                  <credentials xmlns="{XmppExternalServiceDiscovery.NamespaceName}"/>
                  <error type="cancel"><item-not-found xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error>
                </iq>
                """, cancellationToken);
            return;
        }

        var usernamePart = BareJid?.Split('@')[0] ?? "local";
        var credential = localService with
        {
            Port = port ?? localService.Port,
            Username = usernamePart + "-turn",
            Password = "local-turn-secret",
            Expires = DateTimeOffset.UtcNow.AddHours(1),
            Restricted = true
        };
        var credentialXml = XmppExternalServiceDiscovery.CreateServiceElement(credential)
            .ToString(SaveOptions.DisableFormatting);

        await WriteAsync($"""
            <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
              <credentials xmlns="{XmppExternalServiceDiscovery.NamespaceName}">
                {credentialXml}
              </credentials>
            </iq>
            """, cancellationToken);
    }

    private XmppExternalService[] CreateLocalExternalServices()
    {
        return
        [
            new XmppExternalService(
                XmppExternalServiceDiscovery.StunServiceType,
                $"stun.{state.Domain}",
                3478,
                XmppExternalServiceDiscovery.TransportUdp,
                Name: "Local STUN"),
            new XmppExternalService(
                XmppExternalServiceDiscovery.TurnServiceType,
                $"turn.{state.Domain}",
                3478,
                XmppExternalServiceDiscovery.TransportUdp,
                Name: "Local TURN",
                Restricted: true),
            new XmppExternalService(
                XmppExternalServiceDiscovery.TurnServiceType,
                $"turns.{state.Domain}",
                5349,
                XmppExternalServiceDiscovery.TransportTcp,
                Name: "Local TURN over TCP",
                Restricted: true)
        ];
    }

    private static int? ParsePort(string? value)
    {
        return int.TryParse(value, out var parsed) && parsed is >= 0 and <= 65535
            ? parsed
            : null;
    }

    private async Task<bool> HandleAvatarPubSubIqAsync(
        string id,
        string type,
        string to,
        XElement pubsub,
        CancellationToken cancellationToken)
    {
        if (type == "set")
        {
            var publish = pubsub.Element(XName.Get("publish", XmppUserAvatar.PubSubNamespaceName));
            var node = (string?)publish?.Attribute("node");
            var item = publish?.Element(XName.Get("item", XmppUserAvatar.PubSubNamespaceName));
            var bareJid = BareJid ?? string.Empty;
            if (publish is null || item is null || string.IsNullOrWhiteSpace(bareJid))
            {
                return false;
            }

            if (node == XmppUserAvatar.DataNamespaceName)
            {
                var itemId = (string?)item.Attribute("id");
                var dataElement = item.Element(XName.Get("data", XmppUserAvatar.DataNamespaceName));
                if (string.IsNullOrWhiteSpace(itemId) || dataElement is null)
                {
                    return false;
                }

                state.StoreAvatarData(bareJid, itemId, dataElement);
                await WriteAsync($"<iq xmlns=\"jabber:client\" type=\"result\" id=\"{Escape(id)}\"/>", cancellationToken);
                return true;
            }

            if (node == XmppUserAvatar.MetadataNamespaceName)
            {
                var metadataElement = item.Element(XName.Get("metadata", XmppUserAvatar.MetadataNamespaceName));
                if (metadataElement is null)
                {
                    return false;
                }

                state.StoreAvatarMetadata(bareJid, metadataElement);
                await WriteAsync($"<iq xmlns=\"jabber:client\" type=\"result\" id=\"{Escape(id)}\"/>", cancellationToken);
                return true;
            }
        }

        if (type == "get")
        {
            var items = pubsub.Element(XName.Get("items", XmppUserAvatar.PubSubNamespaceName));
            var node = (string?)items?.Attribute("node");
            var targetBareJid = string.IsNullOrWhiteSpace(to) ? BareJid : ToBareJid(to);
            if (items is null || string.IsNullOrWhiteSpace(targetBareJid))
            {
                return false;
            }

            if (node == XmppUserAvatar.DataNamespaceName)
            {
                var itemId = (string?)items.Element(XName.Get("item", XmppUserAvatar.PubSubNamespaceName))?.Attribute("id");
                if (string.IsNullOrWhiteSpace(itemId)
                    || !state.TryGetAvatarData(targetBareJid, itemId, out var dataXml)
                    || string.IsNullOrWhiteSpace(dataXml))
                {
                    return false;
                }

                await WriteAsync($"""
                    <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                      <pubsub xmlns="http://jabber.org/protocol/pubsub">
                        <items node="{XmppUserAvatar.DataNamespaceName}">
                          <item id="{Escape(itemId)}">{dataXml}</item>
                        </items>
                      </pubsub>
                    </iq>
                    """, cancellationToken);
                return true;
            }

            if (node == XmppUserAvatar.MetadataNamespaceName)
            {
                if (!state.TryGetAvatarMetadata(targetBareJid, out var metadataXml)
                    || string.IsNullOrWhiteSpace(metadataXml))
                {
                    metadataXml = XmppUserAvatar.CreateDisabledMetadataElement().ToString(SaveOptions.DisableFormatting);
                }

                await WriteAsync($"""
                    <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                      <pubsub xmlns="http://jabber.org/protocol/pubsub">
                        <items node="{XmppUserAvatar.MetadataNamespaceName}">
                          <item>{metadataXml}</item>
                        </items>
                      </pubsub>
                    </iq>
                    """, cancellationToken);
                return true;
            }
        }

        return false;
    }

    private async Task<bool> HandleUserLocationPubSubIqAsync(
        string id,
        string type,
        string to,
        XElement pubsub,
        CancellationToken cancellationToken)
    {
        if (type == "set")
        {
            var publish = pubsub.Element(XName.Get("publish", XmppPersonalEventing.PubSubNamespaceName));
            var node = (string?)publish?.Attribute("node");
            var item = publish?.Element(XName.Get("item", XmppPersonalEventing.PubSubNamespaceName));
            var bareJid = BareJid ?? string.Empty;
            if (node != XmppUserLocation.NamespaceName
                || publish is null
                || item is null
                || string.IsNullOrWhiteSpace(bareJid))
            {
                return false;
            }

            var locationElement = item.Element(XName.Get("geoloc", XmppUserLocation.NamespaceName));
            if (locationElement is null)
            {
                return false;
            }

            state.StoreUserLocation(bareJid, locationElement);
            await WriteAsync($"<iq xmlns=\"jabber:client\" type=\"result\" id=\"{Escape(id)}\"/>", cancellationToken);
            return true;
        }

        if (type == "get")
        {
            var items = pubsub.Element(XName.Get("items", XmppPersonalEventing.PubSubNamespaceName));
            var node = (string?)items?.Attribute("node");
            var targetBareJid = string.IsNullOrWhiteSpace(to) ? BareJid : ToBareJid(to);
            if (node != XmppUserLocation.NamespaceName
                || items is null
                || string.IsNullOrWhiteSpace(targetBareJid))
            {
                return false;
            }

            var itemId = (string?)items.Element(XName.Get("item", XmppPersonalEventing.PubSubNamespaceName))?.Attribute("id")
                ?? XmppUserLocation.CurrentItemId;
            if (!state.TryGetUserLocation(targetBareJid, out var locationXml)
                || string.IsNullOrWhiteSpace(locationXml))
            {
                locationXml = XmppUserLocation.CreateEmptyElement().ToString(SaveOptions.DisableFormatting);
            }

            await WriteAsync($"""
                <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                  <pubsub xmlns="http://jabber.org/protocol/pubsub">
                    <items node="{XmppUserLocation.NamespaceName}">
                      <item id="{Escape(itemId)}">{locationXml}</item>
                    </items>
                  </pubsub>
                </iq>
                """, cancellationToken);
            return true;
        }

        return false;
    }

    private async Task HandleRegistrationIqAsync(
        string id,
        string type,
        XElement query,
        CancellationToken cancellationToken)
    {
        if (type == "get")
        {
            await WriteAsync($"""
                <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                  <query xmlns="jabber:iq:register">
                    <instructions>Choose a username and password.</instructions>
                    <username/>
                    <password/>
                  </query>
                </iq>
                """, cancellationToken);
            return;
        }

        if (type == "set")
        {
            if (query.Element(XName.Get("remove", "jabber:iq:register")) is not null)
            {
                if (_username is not null)
                {
                    state.Accounts.TryRemove(_username, out _);
                }

                await WriteAsync($"<iq xmlns=\"jabber:client\" type=\"result\" id=\"{Escape(id)}\"/>", cancellationToken);
                return;
            }

            var username = query.Element(XName.Get("username", "jabber:iq:register"))?.Value;
            var password = query.Element(XName.Get("password", "jabber:iq:register"))?.Value;
            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            {
                await WriteAsync($"""
                    <iq xmlns="jabber:client" type="error" id="{Escape(id)}">
                      <error type="modify"><not-acceptable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error>
                    </iq>
                    """, cancellationToken);
                return;
            }

            state.Accounts[username] = password;
            await WriteAsync($"<iq xmlns=\"jabber:client\" type=\"result\" id=\"{Escape(id)}\"/>", cancellationToken);
        }
    }

    private async Task HandlePresenceAsync(XElement element, CancellationToken cancellationToken)
    {
        if (!_tlsActive || !IsBound)
        {
            await WriteAsync(StanzaNotAuthorized(element), cancellationToken);
            return;
        }

        var to = (string?)element.Attribute("to");
        var type = (string?)element.Attribute("type");
        if (string.IsNullOrWhiteSpace(to))
        {
            if (string.IsNullOrWhiteSpace(BareJid))
            {
                return;
            }

            var outgoing = new XElement(element);
            outgoing.SetAttributeValue("from", FullJid ?? BareJid);
            outgoing.SetAttributeValue("to", null);

            if (string.Equals(type, "unavailable", StringComparison.Ordinal))
            {
                state.ClearPresence(BareJid);
            }
            else
            {
                state.StorePresence(BareJid, outgoing);
            }

            await BroadcastPresenceToRosterAsync(outgoing, cancellationToken);
            if (!string.Equals(type, "unavailable", StringComparison.Ordinal))
            {
                await SendRosterPresenceToSelfAsync(cancellationToken);
            }

            return;
        }

        if (!IsMucAddress(to))
        {
            var outgoing = new XElement(element);
            outgoing.SetAttributeValue("from", FullJid ?? BareJid ?? string.Empty);

            if (BareJid is not null
                && (string.Equals(type, "subscribe", StringComparison.Ordinal)
                    || string.Equals(type, "subscribed", StringComparison.Ordinal)))
            {
                state.SetRosterItem(BareJid, ToBareJid(to), null);
            }

            await SendPresenceToJidAsync(to, outgoing, cancellationToken);
            return;
        }

        var room = ToBareJid(to);
        var nick = ResourcePart(to);
        if (string.IsNullOrWhiteSpace(nick))
        {
            return;
        }

        if (string.Equals(type, "unavailable", StringComparison.Ordinal))
        {
            state.LeaveRoom(room, nick);
            var unavailable = new XElement(XName.Get("presence", "jabber:client"),
                new XAttribute("from", room + "/" + nick),
                new XAttribute("to", FullJid ?? BareJid ?? string.Empty),
                new XAttribute("type", "unavailable"));
            await SendAsync(unavailable.ToString(SaveOptions.DisableFormatting), cancellationToken);
            return;
        }

        state.JoinRoom(room, nick, this);
        foreach (var occupant in state.GetRoomOccupants(room))
        {
            if (ReferenceEquals(occupant.Session, this))
            {
                continue;
            }

            var occupantPresence = new XElement(XName.Get("presence", "jabber:client"),
                new XAttribute("from", room + "/" + occupant.Nick),
                new XAttribute("to", FullJid ?? BareJid ?? string.Empty),
                new XElement(XName.Get("x", "http://jabber.org/protocol/muc#user"),
                    new XElement(XName.Get("item", "http://jabber.org/protocol/muc#user"),
                        new XAttribute("affiliation", "member"),
                        new XAttribute("role", "participant"))));
            await SendAsync(occupantPresence.ToString(SaveOptions.DisableFormatting), cancellationToken);
        }

        var mucUser = XName.Get("x", "http://jabber.org/protocol/muc#user");
        var item = XName.Get("item", "http://jabber.org/protocol/muc#user");
        var status = XName.Get("status", "http://jabber.org/protocol/muc#user");
        var reply = new XElement(XName.Get("presence", "jabber:client"),
            new XAttribute("from", room + "/" + nick),
            new XAttribute("to", FullJid ?? BareJid ?? string.Empty),
            new XElement(mucUser,
                new XElement(item,
                    new XAttribute("affiliation", "member"),
                    new XAttribute("role", "participant")),
                new XElement(status, new XAttribute("code", "110"))));
        await SendAsync(reply.ToString(SaveOptions.DisableFormatting), cancellationToken);
    }

    private async Task BroadcastPresenceToRosterAsync(XElement presence, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(BareJid))
        {
            return;
        }

        var rosterJids = state.GetRoster(BareJid)
            .Select(item => item.Jid)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var recipient in state.GetAllSessions())
        {
            if (recipient.BareJid is null
                || string.Equals(recipient.BareJid, BareJid, StringComparison.OrdinalIgnoreCase)
                || !rosterJids.Contains(recipient.BareJid)
                || state.IsBlockedBy(recipient.BareJid, BareJid))
            {
                continue;
            }

            var outgoing = new XElement(presence);
            outgoing.SetAttributeValue("to", recipient.FullJid ?? recipient.BareJid);
            await recipient.SendAsync(outgoing.ToString(SaveOptions.DisableFormatting), cancellationToken);
        }
    }

    private async Task SendRosterPresenceToSelfAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(BareJid))
        {
            return;
        }

        foreach (var presenceXml in state.GetOnlinePresenceForRoster(BareJid))
        {
            var presence = XElement.Parse(presenceXml, LoadOptions.PreserveWhitespace);
            presence.SetAttributeValue("to", FullJid ?? BareJid);
            await SendAsync(presence.ToString(SaveOptions.DisableFormatting), cancellationToken);
        }
    }

    private async Task SendPresenceToJidAsync(string to, XElement presence, CancellationToken cancellationToken)
    {
        foreach (var recipient in state.GetSessionsForBareJid(ToBareJid(to)))
        {
            var outgoing = new XElement(presence);
            outgoing.SetAttributeValue("to", recipient.FullJid ?? recipient.BareJid);
            await recipient.SendAsync(outgoing.ToString(SaveOptions.DisableFormatting), cancellationToken);
        }
    }

    private async Task HandleMessageAsync(XElement element, CancellationToken cancellationToken)
    {
        if (!_tlsActive || !IsBound)
        {
            await WriteAsync(StanzaNotAuthorized(element), cancellationToken);
            return;
        }

        var to = (string?)element.Attribute("to");
        if (string.IsNullOrWhiteSpace(to))
        {
            return;
        }

        if (string.Equals((string?)element.Attribute("type"), "groupchat", StringComparison.Ordinal)
            && IsMucAddress(to))
        {
            var room = ToBareJid(to);
            var nick = state.GetRoomNick(room, this) ?? _username ?? "anonymous";
            foreach (var occupant in state.GetRoomOccupants(room))
            {
                var outgoing = new XElement(element);
                outgoing.SetAttributeValue("from", room + "/" + nick);
                outgoing.SetAttributeValue("to", occupant.Session.FullJid ?? occupant.Session.BareJid);
                await occupant.Session.SendAsync(outgoing.ToString(SaveOptions.DisableFormatting), cancellationToken);
            }

            return;
        }

        element.SetAttributeValue("from", FullJid ?? BareJid);
        var sender = FullJid ?? BareJid;
        if (sender is not null
            && (state.IsBlockedBy(ToBareJid(to), sender)
                || (BareJid is not null && state.IsBlockedBy(BareJid, to))))
        {
            return;
        }

        if (state.TryGetSession(to, out var recipient) && recipient is not null)
        {
            await recipient.SendAsync(element.ToString(SaveOptions.DisableFormatting), cancellationToken);
        }
    }

    private async Task SendOpenAndFeaturesAsync(CancellationToken cancellationToken)
    {
        var features = !_tlsActive
            ? """
              <starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls">
                <required/>
              </starttls>
            """
            : _username is null
            ? """
              <register xmlns="http://jabber.org/features/iq-register"/>
              <mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl">
                <mechanism>PLAIN</mechanism>
              </mechanisms>
            """
            : """
              <bind xmlns="urn:ietf:params:xml:ns:xmpp-bind">
                <required/>
              </bind>
              <session xmlns="urn:ietf:params:xml:ns:xmpp-session"/>
              <sm xmlns="urn:xmpp:sm:3"/>
              <csi xmlns="urn:xmpp:csi:0"/>
            """;

        await WriteAsync($"""
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="{Escape(state.Domain)}" version="1.0">
            <stream:features>
            {features}
            </stream:features>
            """, cancellationToken);
    }

    private async Task<string?> ReadNextNodeAsync(CancellationToken cancellationToken)
    {
        var buffer = new byte[8192];
        while (true)
        {
            if (TryExtractNode(out var node))
            {
                return node;
            }

            var count = await _stream.ReadAsync(buffer, cancellationToken);
            if (count == 0)
            {
                return null;
            }

            _buffer.Append(Encoding.UTF8.GetString(buffer, 0, count));
        }
    }

    private bool TryExtractNode(out string node)
    {
        node = string.Empty;
        TrimLeadingWhitespace();
        if (_buffer.Length == 0)
        {
            return false;
        }

        if (StartsWith("<stream:stream"))
        {
            var end = FindTagEnd(0);
            if (end < 0)
            {
                return false;
            }

            node = _buffer.ToString(0, end + 1);
            _buffer.Remove(0, end + 1);
            return true;
        }

        if (StartsWith("</stream:stream>"))
        {
            node = "</stream:stream>";
            _buffer.Remove(0, node.Length);
            return true;
        }

        return TryExtractElement(out node);
    }

    private bool TryExtractElement(out string xml)
    {
        xml = string.Empty;
        if (_buffer.Length == 0 || _buffer[0] != '<')
        {
            return false;
        }

        var depth = 0;
        var index = 0;
        while (index < _buffer.Length)
        {
            if (_buffer[index] != '<')
            {
                index++;
                continue;
            }

            if (StartsWithAt("<?", index))
            {
                var endInstruction = IndexOf("?>", index + 2);
                if (endInstruction < 0)
                {
                    return false;
                }

                index = endInstruction + 2;
                continue;
            }

            var tagEnd = FindTagEnd(index);
            if (tagEnd < 0)
            {
                return false;
            }

            if (index + 1 < _buffer.Length && _buffer[index + 1] == '/')
            {
                depth--;
                if (depth == 0)
                {
                    xml = _buffer.ToString(0, tagEnd + 1);
                    _buffer.Remove(0, tagEnd + 1);
                    return true;
                }
            }
            else if (IsSelfClosingTag(index, tagEnd))
            {
                if (depth == 0)
                {
                    xml = _buffer.ToString(0, tagEnd + 1);
                    _buffer.Remove(0, tagEnd + 1);
                    return true;
                }
            }
            else
            {
                depth++;
            }

            index = tagEnd + 1;
        }

        return false;
    }

    private XElement ParseClientElement(string xml)
    {
        var wrapped = "<wrapper xmlns=\"jabber:client\">" + xml + "</wrapper>";
        return XElement.Parse(wrapped, LoadOptions.PreserveWhitespace).Elements().Single();
    }

    private Task WriteAsync(string text, CancellationToken cancellationToken)
    {
        var bytes = Encoding.UTF8.GetBytes(text);
        return _stream.WriteAsync(bytes, cancellationToken).AsTask();
    }

    private void TrimLeadingWhitespace()
    {
        var count = 0;
        while (count < _buffer.Length && char.IsWhiteSpace(_buffer[count]))
        {
            count++;
        }

        if (count > 0)
        {
            _buffer.Remove(0, count);
        }
    }

    private int FindTagEnd(int start)
    {
        var quote = '\0';
        for (var index = start; index < _buffer.Length; index++)
        {
            var ch = _buffer[index];
            if (quote != '\0')
            {
                if (ch == quote)
                {
                    quote = '\0';
                }

                continue;
            }

            if (ch is '"' or '\'')
            {
                quote = ch;
                continue;
            }

            if (ch == '>')
            {
                return index;
            }
        }

        return -1;
    }

    private bool IsSelfClosingTag(int start, int end)
    {
        for (var index = end - 1; index > start; index--)
        {
            if (char.IsWhiteSpace(_buffer[index]))
            {
                continue;
            }

            return _buffer[index] == '/';
        }

        return false;
    }

    private bool StartsWith(string value)
    {
        return StartsWithAt(value, 0);
    }

    private bool StartsWithAt(string value, int start)
    {
        if (start + value.Length > _buffer.Length)
        {
            return false;
        }

        for (var index = 0; index < value.Length; index++)
        {
            if (_buffer[start + index] != value[index])
            {
                return false;
            }
        }

        return true;
    }

    private int IndexOf(string value, int start)
    {
        for (var index = start; index <= _buffer.Length - value.Length; index++)
        {
            if (StartsWithAt(value, index))
            {
                return index;
            }
        }

        return -1;
    }

    private static bool IsMucAddress(string jid)
    {
        return jid.StartsWith("conference.", StringComparison.OrdinalIgnoreCase)
            || jid.Contains("@conference.", StringComparison.OrdinalIgnoreCase);
    }

    private static string ToBareJid(string jid)
    {
        var slash = jid.IndexOf('/');
        return slash >= 0 ? jid[..slash] : jid;
    }

    private static string? ResourcePart(string jid)
    {
        var slash = jid.IndexOf('/');
        return slash >= 0 && slash + 1 < jid.Length ? jid[(slash + 1)..] : null;
    }

    private static IEnumerable<string> GetBlockingItems(XElement element)
    {
        return element.Elements(XName.Get("item", XmppBlockingCommand.NamespaceName))
            .Select(item => (string?)item.Attribute("jid"))
            .Where(jid => XmppAddress.TryParse(jid, out _))
            .Cast<string>();
    }

    private static string BadRequestIq(string id)
    {
        return $"""
            <iq xmlns="jabber:client" type="error" id="{Escape(id)}">
              <error type="modify"><bad-request xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error>
            </iq>
            """;
    }

    private static string NotAuthorizedIq(string id)
    {
        return $"""
            <iq xmlns="jabber:client" type="error" id="{Escape(id)}">
              <error type="auth"><not-authorized xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error>
            </iq>
            """;
    }

    private static string StanzaNotAuthorized(XElement stanza)
    {
        var name = stanza.Name.LocalName is "presence" ? "presence" : "message";
        var id = (string?)stanza.Attribute("id");
        var idAttribute = string.IsNullOrWhiteSpace(id) ? string.Empty : $" id=\"{Escape(id)}\"";
        return $"""
            <{name} xmlns="jabber:client" type="error"{idAttribute}>
              <error type="auth"><not-authorized xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error>
            </{name}>
            """;
    }

    private static string StreamError(string condition, string text)
    {
        return $"""
            <stream:error>
              <{condition} xmlns="urn:ietf:params:xml:ns:xmpp-streams"/>
              <text xmlns="urn:ietf:params:xml:ns:xmpp-streams">{Escape(text)}</text>
            </stream:error>
            """;
    }

    private static string Escape(string? value)
    {
        return System.Security.SecurityElement.Escape(value ?? string.Empty) ?? string.Empty;
    }
}

sealed record LocalAccount(string Username, string Password);

sealed record LocalRosterItem(string Jid, string Name, string Subscription);

sealed record LocalUploadSlot(string PutUrl, string GetUrl);

sealed class LocalUploadSlotState(
    string fileName,
    long expectedSize,
    DateTimeOffset expiresAt)
{
    public string FileName { get; } = fileName;

    public long ExpectedSize { get; } = expectedSize;

    public DateTimeOffset ExpiresAt { get; } = expiresAt;

    public byte[]? Data { get; set; }

    public string ContentType { get; set; } = "application/octet-stream";
}

enum LocalUploadWriteStatus
{
    Stored,
    NotFound,
    Expired,
    SizeMismatch
}

sealed class LocalUploadHttpServer(string listenAddress, int port, LocalXmppServerState state)
{
    private readonly TcpListener _listener = new(IPAddress.Parse(listenAddress), port);

    public void Start()
    {
        _listener.Start();
    }

    public void Stop()
    {
        _listener.Stop();
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                var client = await _listener.AcceptTcpClientAsync(cancellationToken);
                _ = Task.Run(() => HandleClientAsync(client, cancellationToken), cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (ObjectDisposedException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (SocketException) when (cancellationToken.IsCancellationRequested)
        {
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken cancellationToken)
    {
        await using var stream = client.GetStream();
        using (client)
        {
            try
            {
                var request = await ReadRequestAsync(stream, cancellationToken);
                if (request is null)
                {
                    await WriteResponseAsync(stream, 400, "Bad Request", cancellationToken: cancellationToken);
                    return;
                }

                if (string.Equals(request.Method, "PUT", StringComparison.OrdinalIgnoreCase))
                {
                    request.Headers.TryGetValue("content-type", out var uploadedContentType);
                    var status = state.StoreUpload(
                        request.Path,
                        request.Body,
                        uploadedContentType);
                    switch (status)
                    {
                        case LocalUploadWriteStatus.Stored:
                            await WriteResponseAsync(stream, 201, "Created", cancellationToken: cancellationToken);
                            return;
                        case LocalUploadWriteStatus.SizeMismatch:
                            await WriteResponseAsync(stream, 400, "Bad Request", "text/plain", Encoding.UTF8.GetBytes("size mismatch"), cancellationToken);
                            return;
                        case LocalUploadWriteStatus.Expired:
                            await WriteResponseAsync(stream, 410, "Gone", cancellationToken: cancellationToken);
                            return;
                        default:
                            await WriteResponseAsync(stream, 404, "Not Found", cancellationToken: cancellationToken);
                            return;
                    }
                }

                if (string.Equals(request.Method, "GET", StringComparison.OrdinalIgnoreCase)
                    && state.TryReadUpload(request.Path, out var data, out var contentType))
                {
                    await WriteResponseAsync(stream, 200, "OK", contentType, data, cancellationToken);
                    return;
                }

                await WriteResponseAsync(stream, 404, "Not Found", cancellationToken: cancellationToken);
            }
            catch (Exception ex) when (ex is IOException or SocketException or InvalidOperationException or FormatException)
            {
                try
                {
                    await WriteResponseAsync(stream, 400, "Bad Request", cancellationToken: cancellationToken);
                }
                catch
                {
                }
            }
        }
    }

    private static async Task<LocalHttpRequest?> ReadRequestAsync(
        NetworkStream stream,
        CancellationToken cancellationToken)
    {
        using var received = new MemoryStream();
        var buffer = new byte[4096];
        var headerEnd = -1;
        while (received.Length < 64 * 1024)
        {
            var read = await stream.ReadAsync(buffer, cancellationToken);
            if (read == 0)
            {
                break;
            }

            received.Write(buffer, 0, read);
            var bytes = received.GetBuffer();
            headerEnd = IndexOfHeaderEnd(bytes, (int)received.Length);
            if (headerEnd >= 0)
            {
                break;
            }
        }

        if (headerEnd < 0)
        {
            return null;
        }

        var all = received.ToArray();
        var headerText = Encoding.ASCII.GetString(all, 0, headerEnd);
        var lines = headerText.Split(["\r\n"], StringSplitOptions.None);
        if (lines.Length == 0)
        {
            return null;
        }

        var requestParts = lines[0].Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (requestParts.Length < 2)
        {
            return null;
        }

        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in lines.Skip(1))
        {
            var separator = line.IndexOf(':');
            if (separator > 0)
            {
                headers[line[..separator].Trim()] = line[(separator + 1)..].Trim();
            }
        }

        var contentLength = 0;
        if (headers.TryGetValue("content-length", out var contentLengthText)
            && !int.TryParse(contentLengthText, out contentLength))
        {
            return null;
        }

        if (contentLength < 0 || contentLength > 10_485_760)
        {
            return null;
        }

        var body = new byte[contentLength];
        var bodyStart = headerEnd + 4;
        var alreadyRead = Math.Min(contentLength, all.Length - bodyStart);
        if (alreadyRead > 0)
        {
            Buffer.BlockCopy(all, bodyStart, body, 0, alreadyRead);
        }

        while (alreadyRead < contentLength)
        {
            var read = await stream.ReadAsync(body.AsMemory(alreadyRead, contentLength - alreadyRead), cancellationToken);
            if (read == 0)
            {
                return null;
            }

            alreadyRead += read;
        }

        var path = NormalizePath(requestParts[1]);
        return new LocalHttpRequest(requestParts[0], path, headers, body);
    }

    private static int IndexOfHeaderEnd(byte[] bytes, int length)
    {
        for (var index = 3; index < length; index++)
        {
            if (bytes[index - 3] == '\r'
                && bytes[index - 2] == '\n'
                && bytes[index - 1] == '\r'
                && bytes[index] == '\n')
            {
                return index - 3;
            }
        }

        return -1;
    }

    private static string NormalizePath(string target)
    {
        if (Uri.TryCreate(target, UriKind.Absolute, out var uri))
        {
            return uri.AbsolutePath;
        }

        var query = target.IndexOf('?');
        return query >= 0 ? target[..query] : target;
    }

    private static async Task WriteResponseAsync(
        NetworkStream stream,
        int statusCode,
        string reasonPhrase,
        string contentType = "text/plain",
        byte[]? body = null,
        CancellationToken cancellationToken = default)
    {
        body ??= [];
        var header = Encoding.ASCII.GetBytes(
            $"HTTP/1.1 {statusCode} {reasonPhrase}\r\n" +
            $"Content-Length: {body.Length}\r\n" +
            $"Content-Type: {contentType}\r\n" +
            "Connection: close\r\n" +
            "\r\n");
        await stream.WriteAsync(header, cancellationToken);
        if (body.Length > 0)
        {
            await stream.WriteAsync(body, cancellationToken);
        }
    }
}

sealed record LocalHttpRequest(
    string Method,
    string Path,
    IReadOnlyDictionary<string, string> Headers,
    byte[] Body);

sealed record LocalServerOptions(
    string ListenAddress,
    int Port,
    string UploadListenAddress,
    int UploadPort,
    string Domain,
    string? CertificatePath,
    string? CertificatePassword,
    IReadOnlyList<LocalAccount> Accounts)
{
    public X509Certificate2 LoadOrCreateCertificate()
    {
        if (!string.IsNullOrWhiteSpace(CertificatePath))
        {
            return X509CertificateLoader.LoadPkcs12FromFile(
                CertificatePath,
                CertificatePassword,
                X509KeyStorageFlags.Exportable);
        }

        return CreateEphemeralCertificate(Domain);
    }

    public static LocalServerOptions? Parse(string[] args)
    {
        var values = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < args.Length; index++)
        {
            var key = args[index];
            if (!key.StartsWith("--", StringComparison.Ordinal) || index + 1 >= args.Length)
            {
                return null;
            }

            var name = key[2..];
            if (!values.TryGetValue(name, out var list))
            {
                list = [];
                values[name] = list;
            }

            list.Add(args[++index]);
        }

        var listen = ValueOrDefault(values, "listen", "127.0.0.1");
        var uploadListen = ValueOrDefault(values, "upload-listen", listen);
        var domain = ValueOrDefault(values, "domain", "localhost");
        var portText = ValueOrDefault(values, "port", "5222");
        var uploadPortText = ValueOrDefault(values, "upload-port", "0");
        values.TryGetValue("cert-path", out var certPaths);
        values.TryGetValue("cert-password", out var certPasswords);
        if (!int.TryParse(portText, out var port))
        {
            return null;
        }

        if (!int.TryParse(uploadPortText, out var uploadPort) || uploadPort < 0)
        {
            return null;
        }

        var accounts = values.TryGetValue("account", out var accountValues)
            ? accountValues.Select(ParseAccount).Where(account => account is not null).Cast<LocalAccount>().ToArray()
            : Array.Empty<LocalAccount>();
        return new LocalServerOptions(
            listen,
            port,
            uploadListen,
            uploadPort,
            domain,
            certPaths?.LastOrDefault(),
            certPasswords?.LastOrDefault(),
            accounts);
    }

    public static void PrintUsage()
    {
        Console.WriteLine("""
            Usage:
              dotnet run --project tools/Tiedragon.XmppMessenger.LocalServer -- \
                --listen 127.0.0.1 \
                --port 5222 \
                --upload-listen 127.0.0.1 \
                --upload-port 8088 \
                --domain localhost \
                --cert-path .tmp/local-xmpp-localhost.pfx \
                --cert-password changeit \
                --account edward:secret \
                --account anna:secret

            Accounts can also be created with XEP-0077 while the server runs.
            STARTTLS is always required. Without --cert-path, an ephemeral self-signed
            certificate is generated and its SHA-256 fingerprint is printed.
            """);
    }

    private static string ValueOrDefault(Dictionary<string, List<string>> values, string name, string fallback)
    {
        return values.TryGetValue(name, out var list) && list.Count > 0 ? list[^1] : fallback;
    }

    private static LocalAccount? ParseAccount(string value)
    {
        var separator = value.IndexOf(':');
        if (separator <= 0 || separator == value.Length - 1)
        {
            return null;
        }

        return new LocalAccount(value[..separator], value[(separator + 1)..]);
    }

    private static X509Certificate2 CreateEphemeralCertificate(string domain)
    {
        using var key = RSA.Create(2048);
        var subject = new X500DistinguishedName($"CN={domain}");
        var request = new CertificateRequest(
            subject,
            key,
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);
        request.CertificateExtensions.Add(
            new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, critical: true));
        request.CertificateExtensions.Add(
            new X509EnhancedKeyUsageExtension(
                [new Oid("1.3.6.1.5.5.7.3.1")],
                critical: false));

        var san = new SubjectAlternativeNameBuilder();
        san.AddDnsName(domain);
        if (IPAddress.TryParse(domain, out var ipAddress))
        {
            san.AddIpAddress(ipAddress);
        }

        if (!string.Equals(domain, "localhost", StringComparison.OrdinalIgnoreCase))
        {
            san.AddDnsName("localhost");
        }

        san.AddIpAddress(IPAddress.Loopback);
        request.CertificateExtensions.Add(san.Build());

        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddDays(7));
        return X509CertificateLoader.LoadPkcs12(
            certificate.Export(X509ContentType.Pkcs12),
            password: null,
            X509KeyStorageFlags.Exportable);
    }
}
