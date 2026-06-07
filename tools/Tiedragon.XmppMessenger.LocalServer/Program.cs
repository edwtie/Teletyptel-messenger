using System.Collections.Concurrent;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.IO.Compression;
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

var dataStore = LocalServerDataStore.Open(options.DataDirectory);
using var certificate = options.LoadOrCreateCertificate();
var uploadBaseUrl = options.UploadPort > 0
    ? $"http://{options.UploadListenAddress}:{options.UploadPort}/"
    : null;
var state = new LocalXmppServerState(
    options.Domain,
    certificate,
    uploadBaseUrl,
    dataStore,
    options.RegistrationCaptchaEnabled);
foreach (var account in dataStore.LoadAccounts())
{
    state.Accounts[account.Username] = account.Password;
}

foreach (var account in options.Accounts)
{
    state.Accounts[account.Username] = account.Password;
    dataStore.SaveAccount(account);
}

foreach (var item in dataStore.LoadRosterItems())
{
    state.LoadRosterItem(item);
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
Console.WriteLine("Features: RFC 6120/6121 C2S, STARTTLS required, SASL PLAIN, resource bind, session, roster, presence, XEP-0030 disco, XEP-0045 local MUC, XEP-0050 ad-hoc commands, XEP-0054 vCard, XEP-0077, XEP-0133 read-only service administration, XEP-0191 blocking, XEP-0198 SM, XEP-0215 STUN/TURN discovery, XEP-0313 local message archive, XEP-0352 CSI, XEP-0363 slot/PUT smoke, direct chat relay");
Console.WriteLine("Scope: local development and smoke testing server; not hardened for internet-facing production use.");
Console.WriteLine($"Data directory: {dataStore.RootDirectory}");
Console.WriteLine($"XEP-0077 CAPTCHA: {(state.RegistrationCaptchaEnabled ? "enabled" : "disabled")}");
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

sealed class LocalXmppServerState(
    string domain,
    X509Certificate2 certificate,
    string? uploadBaseUrl,
    LocalServerDataStore dataStore,
    bool registrationCaptchaEnabled)
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
    private readonly ConcurrentDictionary<string, LocalCaptchaChallenge> _captchaChallenges = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, string> _presenceByBareJid = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, string> _vCardsByBareJid = new(StringComparer.OrdinalIgnoreCase);

    public string Domain { get; } = domain;

    public X509Certificate2 Certificate { get; } = certificate;

    public string? UploadBaseUrl { get; } = uploadBaseUrl;

    public ConcurrentDictionary<string, string> Accounts { get; } = new(StringComparer.OrdinalIgnoreCase);

    public LocalServerDataStore DataStore { get; } = dataStore;

    public bool RegistrationCaptchaEnabled { get; } = registrationCaptchaEnabled && uploadBaseUrl is not null;

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

    public LocalCaptchaChallenge CreateCaptchaChallenge()
    {
        var challenge = LocalCaptchaGenerator.Create();
        _captchaChallenges[challenge.Key] = challenge;
        return challenge;
    }

    public bool TryReadCaptcha(string path, out byte[] data, out string contentType)
    {
        data = [];
        contentType = "image/png";
        var parts = path.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 2
            || !string.Equals(parts[0], "captcha", StringComparison.OrdinalIgnoreCase)
            || !_captchaChallenges.TryGetValue(parts[1], out var challenge))
        {
            return false;
        }

        if (challenge.ExpiresUtc < DateTimeOffset.UtcNow)
        {
            _captchaChallenges.TryRemove(challenge.Key, out _);
            return false;
        }

        data = challenge.PngBytes;
        return true;
    }

    public bool ValidateCaptcha(string? key, string? answer)
    {
        if (!RegistrationCaptchaEnabled)
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(key)
            || string.IsNullOrWhiteSpace(answer)
            || !_captchaChallenges.TryRemove(key, out var challenge))
        {
            return false;
        }

        return challenge.ExpiresUtc >= DateTimeOffset.UtcNow
            && string.Equals(challenge.Answer, answer.Trim(), StringComparison.OrdinalIgnoreCase);
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

    public void LoadRosterItem(LocalStoredRosterItem item)
    {
        var roster = _rostersByBareJid.GetOrAdd(
            item.OwnerBareJid,
            _ => new ConcurrentDictionary<string, LocalRosterItem>(StringComparer.OrdinalIgnoreCase));
        roster[item.Jid] = new LocalRosterItem(item.Jid, item.Name, item.Subscription);
    }

    public void SetRosterItem(string ownerBareJid, string jid, string? name)
    {
        var roster = _rostersByBareJid.GetOrAdd(
            ownerBareJid,
            _ => new ConcurrentDictionary<string, LocalRosterItem>(StringComparer.OrdinalIgnoreCase));
        var bare = BareJid(NormalizeJid(jid));
        var item = new LocalRosterItem(bare, string.IsNullOrWhiteSpace(name) ? bare.Split('@')[0] : name, "both");
        roster[bare] = item;
        DataStore.SaveRosterItem(new LocalStoredRosterItem(ownerBareJid, item.Jid, item.Name, item.Subscription));
    }

    public void RemoveRosterItem(string ownerBareJid, string jid)
    {
        var bare = BareJid(NormalizeJid(jid));
        if (_rostersByBareJid.TryGetValue(ownerBareJid, out var roster))
        {
            roster.TryRemove(bare, out _);
        }

        DataStore.RemoveRosterItem(ownerBareJid, bare);
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

    public void StoreChatArchive(XElement message, string senderBareJid, string recipientBareJid)
    {
        if (!HasArchivablePayload(message))
        {
            return;
        }

        var conversation = BareJid(recipientBareJid);
        DataStore.AppendArchiveMessage(new LocalArchiveMessage(
            CreateArchiveId(),
            senderBareJid,
            conversation,
            new XElement(message).ToString(SaveOptions.DisableFormatting),
            DateTimeOffset.UtcNow));

        if (!string.Equals(senderBareJid, recipientBareJid, StringComparison.OrdinalIgnoreCase))
        {
            DataStore.AppendArchiveMessage(new LocalArchiveMessage(
                CreateArchiveId(),
                recipientBareJid,
                BareJid(senderBareJid),
                new XElement(message).ToString(SaveOptions.DisableFormatting),
                DateTimeOffset.UtcNow));
        }
    }

    public void StoreRoomArchive(string roomBareJid, XElement message)
    {
        if (!HasArchivablePayload(message))
        {
            return;
        }

        DataStore.AppendArchiveMessage(new LocalArchiveMessage(
            CreateArchiveId(),
            roomBareJid,
            roomBareJid,
            new XElement(message).ToString(SaveOptions.DisableFormatting),
            DateTimeOffset.UtcNow));
    }

    public IReadOnlyList<LocalArchiveMessage> QueryArchive(
        string ownerBareJid,
        string? withBareJid,
        DateTimeOffset? start,
        DateTimeOffset? end,
        int max,
        string? after,
        string? before)
    {
        return DataStore.QueryArchive(ownerBareJid, withBareJid, start, end, max, after, before);
    }

    private static string BareJid(string jid)
    {
        var slash = jid.IndexOf('/');
        return slash >= 0 ? jid[..slash] : jid;
    }

    private static string CreateArchiveId()
    {
        return "local-mam-" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString("x") + "-" + Guid.NewGuid().ToString("N")[..10];
    }

    private static bool HasArchivablePayload(XElement message)
    {
        return message.Element(XName.Get("body", "jabber:client")) is not null
            || message.Element(XName.Get("body", string.Empty)) is not null
            || message.Elements().Any(element => element.Name.NamespaceName is not "http://jabber.org/protocol/chatstates");
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

        if (payload?.Name == XName.Get("command", XmppAdHocCommands.NamespaceName) && type == "set")
        {
            await HandleAdHocCommandIqAsync(id, to, payload, cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("query", "http://jabber.org/protocol/disco#info") && type == "get")
        {
            var discoveryNode = (string?)payload.Attribute("node");
            if (XmppServiceAdministration.IsReadOnlyCommandNode(discoveryNode))
            {
                var command = XmppServiceAdministration.ReadOnlyCommands
                    .First(entry => string.Equals(entry.Node, discoveryNode, StringComparison.Ordinal));
                await WriteAsync($"""
                    <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                      <query xmlns="http://jabber.org/protocol/disco#info" node="{Escape(discoveryNode)}">
                        <identity category="automation" type="command-node" name="{Escape(command.Name)}"/>
                        <feature var="{XmppAdHocCommands.NamespaceName}"/>
                        <feature var="{XmppServiceDiscovery.DataFormNamespace}"/>
                      </query>
                    </iq>
                    """, cancellationToken);
                return;
            }

            if (IsMucAddress(to))
            {
                var identityType = to.Contains('@', StringComparison.Ordinal) ? "text" : "service";
                var identityName = to.Contains('@', StringComparison.Ordinal) ? "Team room" : "Tiedragon Local Conference";
                await WriteAsync($"""
                    <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                      <query xmlns="http://jabber.org/protocol/disco#info">
                        <identity category="conference" type="{identityType}" name="{identityName}"/>
                        <feature var="http://jabber.org/protocol/muc"/>
                        <feature var="{XmppMessageArchive.NamespaceName}"/>
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
                    <feature var="{XmppAdHocCommands.NamespaceName}"/>
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
                    <feature var="{XmppMessageArchive.NamespaceName}"/>
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
            var discoveryNode = (string?)payload.Attribute("node");
            if (string.Equals(discoveryNode, XmppAdHocCommands.CommandsNode, StringComparison.Ordinal))
            {
                var commandItems = XmppServiceAdministration.ReadOnlyCommands
                    .Select(command => $"<item jid=\"{Escape(state.Domain)}\" node=\"{Escape(command.Node)}\" name=\"{Escape(command.Name)}\"/>")
                    .ToArray();
                await WriteAsync($"""
                    <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                      <query xmlns="http://jabber.org/protocol/disco#items" node="{XmppAdHocCommands.CommandsNode}">
                        {string.Join(Environment.NewLine + "    ", commandItems)}
                      </query>
                    </iq>
                    """, cancellationToken);
                return;
            }

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

        if (payload?.Name == XName.Get("query", XmppMessageArchive.NamespaceName) && type == "set")
        {
            await HandleMessageArchiveIqAsync(id, to, payload, cancellationToken);
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

    private async Task HandleAdHocCommandIqAsync(
        string id,
        string to,
        XElement payload,
        CancellationToken cancellationToken)
    {
        var action = (string?)payload.Attribute("action");
        var node = (string?)payload.Attribute("node");
        if ((!string.IsNullOrWhiteSpace(action) && !string.Equals(action, "execute", StringComparison.Ordinal))
            || string.IsNullOrWhiteSpace(node))
        {
            await WriteAsync(BadRequestIq(id), cancellationToken);
            return;
        }

        if (!string.IsNullOrWhiteSpace(to)
            && !string.Equals(ToBareJid(to), state.Domain, StringComparison.OrdinalIgnoreCase))
        {
            await WriteAsync(ItemNotFoundIq(id), cancellationToken);
            return;
        }

        if (!XmppServiceAdministration.IsReadOnlyCommandNode(node))
        {
            await WriteAsync(ItemNotFoundIq(id), cancellationToken);
            return;
        }

        var form = CreateServiceAdministrationResultForm(node);
        await WriteAsync($"""
            <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
              <command xmlns="{XmppAdHocCommands.NamespaceName}" node="{Escape(node)}" status="completed">
                {form}
              </command>
            </iq>
            """, cancellationToken);
    }

    private string CreateServiceAdministrationResultForm(string node)
    {
        var command = XmppServiceAdministration.ReadOnlyCommands
            .First(entry => string.Equals(entry.Node, node, StringComparison.Ordinal));
        var fieldXml = command.ReturnsJids
            ? CreateDataFormField(command.ResultField, "jid-multi", GetServiceAdministrationJids(node))
            : CreateDataFormField(command.ResultField, "text-single", [GetServiceAdministrationCount(node).ToString(System.Globalization.CultureInfo.InvariantCulture)]);

        return $"""
            <x xmlns="{XmppServiceDiscovery.DataFormNamespace}" type="result">
              <field var="{XmppServiceAdministration.FormTypeField}" type="hidden">
                <value>{XmppServiceAdministration.NamespaceName}</value>
              </field>
              {fieldXml}
            </x>
            """;
    }

    private int GetServiceAdministrationCount(string node)
    {
        return node switch
        {
            XmppServiceAdministration.GetRegisteredUsersNumberNode => state.Accounts.Count,
            XmppServiceAdministration.GetOnlineUsersNumberNode => GetOnlineBareJids().Length,
            XmppServiceAdministration.GetActiveUsersNumberNode => GetOnlineBareJids(inactive: false).Length,
            XmppServiceAdministration.GetIdleUsersNumberNode => GetOnlineBareJids(inactive: true).Length,
            _ => 0
        };
    }

    private IReadOnlyList<string> GetServiceAdministrationJids(string node)
    {
        return node switch
        {
            XmppServiceAdministration.GetRegisteredUsersListNode => state.Accounts.Keys
                .Select(username => $"{username}@{state.Domain}")
                .Order(StringComparer.OrdinalIgnoreCase)
                .ToArray(),
            XmppServiceAdministration.GetOnlineUsersListNode => GetOnlineBareJids(),
            XmppServiceAdministration.GetActiveUsersNode => GetOnlineBareJids(inactive: false),
            XmppServiceAdministration.GetIdleUsersNode => GetOnlineBareJids(inactive: true),
            _ => []
        };
    }

    private string[] GetOnlineBareJids(bool? inactive = null)
    {
        return state.GetAllSessions()
            .Where(session => session.BareJid is not null
                && (inactive is null || session.IsClientInactive == inactive.Value))
            .Select(session => session.BareJid!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string CreateDataFormField(string name, string type, IEnumerable<string> values)
    {
        var valueXml = values.Select(value => $"<value>{Escape(value)}</value>");
        return $"""
            <field var="{Escape(name)}" type="{Escape(type)}">
              {string.Join(Environment.NewLine + "      ", valueXml)}
            </field>
            """;
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

    private async Task HandleMessageArchiveIqAsync(
        string id,
        string to,
        XElement query,
        CancellationToken cancellationToken)
    {
        var ownerBareJid = IsMucAddress(to) && to.Contains('@', StringComparison.Ordinal)
            ? ToBareJid(to)
            : BareJid;
        if (string.IsNullOrWhiteSpace(ownerBareJid))
        {
            await WriteAsync(BadRequestIq(id), cancellationToken);
            return;
        }

        var queryId = (string?)query.Attribute("queryid");
        var options = ParseArchiveQueryOptions(query);
        var max = options.Max is > 0 and <= 500 ? options.Max.Value : 50;
        var archived = state.QueryArchive(
            ownerBareJid,
            options.With?.Bare,
            options.Start,
            options.End,
            max,
            options.After,
            options.Before);

        foreach (var item in archived)
        {
            await WriteAsync(CreateArchiveResultMessage(ownerBareJid, item, queryId), cancellationToken);
        }

        var first = archived.FirstOrDefault();
        var last = archived.LastOrDefault();
        var firstXml = first is null
            ? string.Empty
            : $"<first index=\"0\">{Escape(first.ArchiveId)}</first>";
        var lastXml = last is null
            ? string.Empty
            : $"<last>{Escape(last.ArchiveId)}</last>";
        await WriteAsync($"""
            <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
              <fin xmlns="{XmppMessageArchive.NamespaceName}" complete="true">
                <set xmlns="{XmppMessageArchive.ResultSetManagementNamespace}">
                  {firstXml}
                  {lastXml}
                  <count>{archived.Count}</count>
                </set>
              </fin>
            </iq>
            """, cancellationToken);
    }

    private string CreateArchiveResultMessage(string ownerBareJid, LocalArchiveMessage item, string? queryId)
    {
        var result = new XElement(XName.Get("result", XmppMessageArchive.NamespaceName),
            new XAttribute("id", item.ArchiveId));
        if (!string.IsNullOrWhiteSpace(queryId))
        {
            result.SetAttributeValue("queryid", queryId);
        }

        result.Add(new XElement(XName.Get("forwarded", XmppMessageCarbons.ForwardedNamespace),
            new XElement(XName.Get("delay", XmppMessageArchive.DelayNamespace),
                new XAttribute("stamp", item.StampUtc.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'"))),
            XElement.Parse(item.StanzaXml, LoadOptions.PreserveWhitespace)));

        var message = new XElement(XName.Get("message", "jabber:client"),
            new XAttribute("from", ownerBareJid),
            result);
        if (!string.IsNullOrWhiteSpace(FullJid ?? BareJid))
        {
            message.SetAttributeValue("to", FullJid ?? BareJid);
        }

        return message.ToString(SaveOptions.DisableFormatting);
    }

    private static XmppArchiveQueryOptions ParseArchiveQueryOptions(XElement query)
    {
        var fields = query
            .Elements(XName.Get("x", XmppMessageArchive.DataFormsNamespace))
            .Elements(XName.Get("field", XmppMessageArchive.DataFormsNamespace))
            .ToDictionary(
                field => (string?)field.Attribute("var") ?? string.Empty,
                field => field.Element(XName.Get("value", XmppMessageArchive.DataFormsNamespace))?.Value,
                StringComparer.OrdinalIgnoreCase);

        XmppAddress? with = null;
        if (fields.TryGetValue("with", out var withText)
            && XmppAddress.TryParse(withText, out var parsedWith))
        {
            with = parsedWith;
        }

        var set = query.Element(XName.Get("set", XmppMessageArchive.ResultSetManagementNamespace));
        return new XmppArchiveQueryOptions(
            TryParseArchiveDate(fields.GetValueOrDefault("start")),
            TryParseArchiveDate(fields.GetValueOrDefault("end")),
            with,
            TryParseArchiveInt(set?.Element(XName.Get("max", XmppMessageArchive.ResultSetManagementNamespace))?.Value),
            set?.Element(XName.Get("after", XmppMessageArchive.ResultSetManagementNamespace))?.Value,
            set?.Element(XName.Get("before", XmppMessageArchive.ResultSetManagementNamespace))?.Value);
    }

    private static DateTimeOffset? TryParseArchiveDate(string? value)
    {
        return DateTimeOffset.TryParse(value, out var parsed) ? parsed : null;
    }

    private static int? TryParseArchiveInt(string? value)
    {
        return int.TryParse(value, out var parsed) ? parsed : null;
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
            await WriteAsync(CreateRegistrationInfoIq(id), cancellationToken);
            return;
        }

        if (type == "set")
        {
            if (query.Element(XName.Get("remove", "jabber:iq:register")) is not null)
            {
                if (_username is not null)
                {
                    state.Accounts.TryRemove(_username, out _);
                    state.DataStore.RemoveAccount(_username);
                }

                await WriteAsync($"<iq xmlns=\"jabber:client\" type=\"result\" id=\"{Escape(id)}\"/>", cancellationToken);
                return;
            }

            var username = GetRegistrationValue(query, "username");
            var password = GetRegistrationValue(query, "password");
            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            {
                await WriteAsync($"""
                    <iq xmlns="jabber:client" type="error" id="{Escape(id)}">
                      <error type="modify"><not-acceptable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error>
                    </iq>
                    """, cancellationToken);
                return;
            }

            if (!state.ValidateCaptcha(GetRegistrationValue(query, "key"), GetRegistrationValue(query, "ocr")))
            {
                await WriteAsync($"""
                    <iq xmlns="jabber:client" type="error" id="{Escape(id)}">
                      <error type="cancel">
                        <not-allowed xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>
                        <text xmlns="urn:ietf:params:xml:ns:xmpp-stanzas">The CAPTCHA verification has failed</text>
                      </error>
                    </iq>
                    """, cancellationToken);
                return;
            }

            state.Accounts[username] = password;
            state.DataStore.SaveAccount(new LocalAccount(username, password));
            await WriteAsync($"<iq xmlns=\"jabber:client\" type=\"result\" id=\"{Escape(id)}\"/>", cancellationToken);
        }
    }

    private string CreateRegistrationInfoIq(string id)
    {
        if (!state.RegistrationCaptchaEnabled || state.UploadBaseUrl is null)
        {
            return $"""
                <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                  <query xmlns="jabber:iq:register">
                    <instructions>Choose a username and password.</instructions>
                    <username/>
                    <password/>
                  </query>
                </iq>
                """;
        }

        var challenge = state.CreateCaptchaChallenge();
        var captchaUrl = state.UploadBaseUrl.TrimEnd('/') + "/captcha/" + challenge.Key;
        return $"""
            <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
              <query xmlns="jabber:iq:register">
                <instructions>Choose a username and password, then copy the CAPTCHA text.</instructions>
                <x xmlns="jabber:x:data" type="form">
                  <title>Account registration</title>
                  <instructions>Complete the CAPTCHA to create a local test account.</instructions>
                  <field var="FORM_TYPE" type="hidden">
                    <value>jabber:iq:register</value>
                  </field>
                  <field var="username" type="text-single" label="Username">
                    <required/>
                  </field>
                  <field var="password" type="text-private" label="Password">
                    <required/>
                  </field>
                  <field var="captcha-fallback-url" type="hidden">
                    <value>{Escape(captchaUrl)}</value>
                  </field>
                  <field var="key" type="hidden">
                    <value>{Escape(challenge.Key)}</value>
                  </field>
                  <field var="ocr" type="text-single" label="CAPTCHA">
                    <required/>
                  </field>
                </x>
              </query>
            </iq>
            """;
    }

    private static string? GetRegistrationValue(XElement query, string fieldName)
    {
        var direct = query.Element(XName.Get(fieldName, "jabber:iq:register"))?.Value;
        if (!string.IsNullOrWhiteSpace(direct))
        {
            return direct;
        }

        return query
            .Descendants(XName.Get("field", "jabber:x:data"))
            .FirstOrDefault(field => string.Equals((string?)field.Attribute("var"), fieldName, StringComparison.OrdinalIgnoreCase))
            ?.Element(XName.Get("value", "jabber:x:data"))
            ?.Value;
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
            XElement? archiveMessage = null;
            foreach (var occupant in state.GetRoomOccupants(room))
            {
                var outgoing = new XElement(element);
                outgoing.SetAttributeValue("from", room + "/" + nick);
                outgoing.SetAttributeValue("to", occupant.Session.FullJid ?? occupant.Session.BareJid);
                archiveMessage ??= new XElement(outgoing);
                await occupant.Session.SendAsync(outgoing.ToString(SaveOptions.DisableFormatting), cancellationToken);
            }

            if (archiveMessage is not null)
            {
                state.StoreRoomArchive(room, archiveMessage);
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

        if (BareJid is not null)
        {
            state.StoreChatArchive(element, BareJid, ToBareJid(to));
        }

        if (state.TryGetSession(to, out var recipient) && recipient is not null)
        {
            var outgoing = element.ToString(SaveOptions.DisableFormatting);
            await recipient.SendAsync(outgoing, cancellationToken);
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

    private static string ItemNotFoundIq(string id)
    {
        return $"""
            <iq xmlns="jabber:client" type="error" id="{Escape(id)}">
              <error type="cancel"><item-not-found xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error>
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

sealed record LocalStoredRosterItem(string OwnerBareJid, string Jid, string Name, string Subscription);

sealed record LocalArchiveMessage(
    string ArchiveId,
    string OwnerBareJid,
    string ConversationJid,
    string StanzaXml,
    DateTimeOffset StampUtc);

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

sealed record LocalCaptchaChallenge(
    string Key,
    string Answer,
    byte[] PngBytes,
    DateTimeOffset ExpiresUtc);

static class LocalCaptchaGenerator
{
    private const int Width = 180;
    private const int Height = 70;
    private static readonly byte[] PngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

    public static LocalCaptchaChallenge Create()
    {
        var random = new Random(RandomNumberGenerator.GetInt32(int.MaxValue));
        var answer = string.Concat(Enumerable.Range(0, 5).Select(_ => (char)('0' + random.Next(10))));
        var pixels = CreateCanvas(random);

        for (var index = 0; index < answer.Length; index++)
        {
            var x = 18 + index * 28 + random.Next(-2, 3);
            var y = 17 + random.Next(-5, 6);
            DrawSevenSegmentDigit(pixels, answer[index], x + 1, y + 1, 4, (170, 190, 210));
            DrawSevenSegmentDigit(pixels, answer[index], x, y, 4, (
                (byte)random.Next(20, 70),
                (byte)random.Next(45, 100),
                (byte)random.Next(85, 145)));
        }

        ApplyEffects(pixels, random);
        return new LocalCaptchaChallenge(
            Guid.NewGuid().ToString("N"),
            answer,
            EncodePng(pixels, Width, Height),
            DateTimeOffset.UtcNow.AddMinutes(5));
    }

    private static byte[] CreateCanvas(Random random)
    {
        var pixels = new byte[Width * Height * 3];
        for (var y = 0; y < Height; y++)
        {
            for (var x = 0; x < Width; x++)
            {
                var offset = Offset(x, y);
                var shade = random.Next(-8, 9);
                pixels[offset] = Clamp(239 + shade);
                pixels[offset + 1] = Clamp(246 + shade);
                pixels[offset + 2] = Clamp(252 + shade);
            }
        }

        return pixels;
    }

    private static void ApplyEffects(byte[] pixels, Random random)
    {
        for (var line = 0; line < 7; line++)
        {
            DrawLine(
                pixels,
                random.Next(Width),
                random.Next(Height),
                random.Next(Width),
                random.Next(Height),
                (
                    (byte)random.Next(80, 170),
                    (byte)random.Next(120, 190),
                    (byte)random.Next(150, 220)));
        }

        for (var dot = 0; dot < 900; dot++)
        {
            var x = random.Next(Width);
            var y = random.Next(Height);
            SetPixel(pixels, x, y, (
                (byte)random.Next(80, 210),
                (byte)random.Next(95, 215),
                (byte)random.Next(110, 230)));
        }

        for (var y = 0; y < Height; y += 9)
        {
            var wave = (int)Math.Round(Math.Sin(y / 6.0) * 3);
            if (wave == 0)
            {
                continue;
            }

            ShiftRow(pixels, y, wave);
        }
    }

    private static void DrawSevenSegmentDigit(
        byte[] pixels,
        char digit,
        int x,
        int y,
        int scale,
        (byte R, byte G, byte B) color)
    {
        var segments = digit switch
        {
            '0' => "abcfed",
            '1' => "bc",
            '2' => "abged",
            '3' => "abgcd",
            '4' => "fgbc",
            '5' => "afgcd",
            '6' => "afgecd",
            '7' => "abc",
            '8' => "abcdefg",
            '9' => "abfgcd",
            _ => "g"
        };

        foreach (var segment in segments)
        {
            switch (segment)
            {
                case 'a':
                    FillRect(pixels, x + scale, y, 5 * scale, scale, color);
                    break;
                case 'b':
                    FillRect(pixels, x + 6 * scale, y + scale, scale, 5 * scale, color);
                    break;
                case 'c':
                    FillRect(pixels, x + 6 * scale, y + 7 * scale, scale, 5 * scale, color);
                    break;
                case 'd':
                    FillRect(pixels, x + scale, y + 12 * scale, 5 * scale, scale, color);
                    break;
                case 'e':
                    FillRect(pixels, x, y + 7 * scale, scale, 5 * scale, color);
                    break;
                case 'f':
                    FillRect(pixels, x, y + scale, scale, 5 * scale, color);
                    break;
                case 'g':
                    FillRect(pixels, x + scale, y + 6 * scale, 5 * scale, scale, color);
                    break;
            }
        }
    }

    private static void FillRect(byte[] pixels, int x, int y, int width, int height, (byte R, byte G, byte B) color)
    {
        for (var yy = y; yy < y + height; yy++)
        {
            for (var xx = x; xx < x + width; xx++)
            {
                SetPixel(pixels, xx, yy, color);
            }
        }
    }

    private static void DrawLine(byte[] pixels, int x0, int y0, int x1, int y1, (byte R, byte G, byte B) color)
    {
        var dx = Math.Abs(x1 - x0);
        var sx = x0 < x1 ? 1 : -1;
        var dy = -Math.Abs(y1 - y0);
        var sy = y0 < y1 ? 1 : -1;
        var error = dx + dy;
        while (true)
        {
            SetPixel(pixels, x0, y0, color);
            if (x0 == x1 && y0 == y1)
            {
                break;
            }

            var e2 = 2 * error;
            if (e2 >= dy)
            {
                error += dy;
                x0 += sx;
            }

            if (e2 <= dx)
            {
                error += dx;
                y0 += sy;
            }
        }
    }

    private static void ShiftRow(byte[] pixels, int y, int amount)
    {
        var copy = new byte[Width * 3];
        Buffer.BlockCopy(pixels, Offset(0, y), copy, 0, copy.Length);
        for (var x = 0; x < Width; x++)
        {
            var sourceX = Math.Clamp(x - amount, 0, Width - 1);
            Buffer.BlockCopy(copy, sourceX * 3, pixels, Offset(x, y), 3);
        }
    }

    private static void SetPixel(byte[] pixels, int x, int y, (byte R, byte G, byte B) color)
    {
        if (x < 0 || y < 0 || x >= Width || y >= Height)
        {
            return;
        }

        var offset = Offset(x, y);
        pixels[offset] = color.R;
        pixels[offset + 1] = color.G;
        pixels[offset + 2] = color.B;
    }

    private static byte[] EncodePng(byte[] rgb, int width, int height)
    {
        using var png = new MemoryStream();
        png.Write(PngSignature);
        WriteChunk(png, "IHDR", CreateIhdr(width, height));

        using var raw = new MemoryStream();
        for (var y = 0; y < height; y++)
        {
            raw.WriteByte(0);
            raw.Write(rgb, y * width * 3, width * 3);
        }

        using var compressed = new MemoryStream();
        raw.Position = 0;
        using (var zlib = new ZLibStream(compressed, CompressionLevel.SmallestSize, leaveOpen: true))
        {
            raw.CopyTo(zlib);
        }

        WriteChunk(png, "IDAT", compressed.ToArray());
        WriteChunk(png, "IEND", []);
        return png.ToArray();
    }

    private static byte[] CreateIhdr(int width, int height)
    {
        var data = new byte[13];
        WriteInt(data.AsSpan(0, 4), width);
        WriteInt(data.AsSpan(4, 4), height);
        data[8] = 8;
        data[9] = 2;
        return data;
    }

    private static void WriteChunk(Stream stream, string type, byte[] data)
    {
        Span<byte> length = stackalloc byte[4];
        WriteInt(length, data.Length);
        stream.Write(length);
        var typeBytes = Encoding.ASCII.GetBytes(type);
        stream.Write(typeBytes);
        stream.Write(data);
        var crc = Crc32(typeBytes, data);
        Span<byte> crcBytes = stackalloc byte[4];
        WriteInt(crcBytes, unchecked((int)crc));
        stream.Write(crcBytes);
    }

    private static uint Crc32(byte[] typeBytes, byte[] data)
    {
        var crc = 0xffffffffu;
        foreach (var value in typeBytes.Concat(data))
        {
            crc ^= value;
            for (var bit = 0; bit < 8; bit++)
            {
                crc = (crc & 1) == 1 ? 0xedb88320u ^ (crc >> 1) : crc >> 1;
            }
        }

        return crc ^ 0xffffffffu;
    }

    private static void WriteInt(Span<byte> target, int value)
    {
        target[0] = (byte)((value >> 24) & 0xff);
        target[1] = (byte)((value >> 16) & 0xff);
        target[2] = (byte)((value >> 8) & 0xff);
        target[3] = (byte)(value & 0xff);
    }

    private static int Offset(int x, int y) => (y * Width + x) * 3;

    private static byte Clamp(int value) => (byte)Math.Clamp(value, 0, 255);
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

                if (string.Equals(request.Method, "GET", StringComparison.OrdinalIgnoreCase)
                    && state.TryReadCaptcha(request.Path, out var captchaData, out var captchaContentType))
                {
                    await WriteResponseAsync(stream, 200, "OK", captchaContentType, captchaData, cancellationToken);
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

sealed class LocalServerDataStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly object _gate = new();
    private readonly string _accountsPath;
    private readonly string _archivePath;
    private readonly string _rosterPath;
    private readonly List<LocalArchiveMessage> _archive;
    private readonly List<LocalAccount> _accounts;
    private readonly List<LocalStoredRosterItem> _rosterItems;

    private LocalServerDataStore(string rootDirectory)
    {
        RootDirectory = Path.GetFullPath(rootDirectory);
        Directory.CreateDirectory(RootDirectory);
        _accountsPath = Path.Combine(RootDirectory, "accounts.json");
        _rosterPath = Path.Combine(RootDirectory, "roster.json");
        _archivePath = Path.Combine(RootDirectory, "message-archive.jsonl");
        _accounts = LoadJsonList<LocalAccount>(_accountsPath);
        _rosterItems = LoadJsonList<LocalStoredRosterItem>(_rosterPath);
        _archive = LoadArchive(_archivePath);
    }

    public string RootDirectory { get; }

    public static LocalServerDataStore Open(string rootDirectory)
    {
        return new LocalServerDataStore(rootDirectory);
    }

    public static string DefaultRootDirectory()
    {
        var localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(localData))
        {
            localData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "share");
        }

        return Path.Combine(localData, "Tiedragon", "TeleTypTel", "LocalServer");
    }

    public IReadOnlyList<LocalAccount> LoadAccounts()
    {
        lock (_gate)
        {
            return _accounts.ToArray();
        }
    }

    public void SaveAccount(LocalAccount account)
    {
        lock (_gate)
        {
            _accounts.RemoveAll(existing => string.Equals(existing.Username, account.Username, StringComparison.OrdinalIgnoreCase));
            _accounts.Add(account);
            SaveJsonList(_accountsPath, _accounts.OrderBy(item => item.Username, StringComparer.OrdinalIgnoreCase));
        }
    }

    public void RemoveAccount(string username)
    {
        lock (_gate)
        {
            _accounts.RemoveAll(existing => string.Equals(existing.Username, username, StringComparison.OrdinalIgnoreCase));
            SaveJsonList(_accountsPath, _accounts.OrderBy(item => item.Username, StringComparer.OrdinalIgnoreCase));
        }
    }

    public IReadOnlyList<LocalStoredRosterItem> LoadRosterItems()
    {
        lock (_gate)
        {
            return _rosterItems.ToArray();
        }
    }

    public void SaveRosterItem(LocalStoredRosterItem item)
    {
        lock (_gate)
        {
            _rosterItems.RemoveAll(existing =>
                string.Equals(existing.OwnerBareJid, item.OwnerBareJid, StringComparison.OrdinalIgnoreCase)
                && string.Equals(existing.Jid, item.Jid, StringComparison.OrdinalIgnoreCase));
            _rosterItems.Add(item);
            SaveJsonList(_rosterPath, _rosterItems
                .OrderBy(existing => existing.OwnerBareJid, StringComparer.OrdinalIgnoreCase)
                .ThenBy(existing => existing.Jid, StringComparer.OrdinalIgnoreCase));
        }
    }

    public void RemoveRosterItem(string ownerBareJid, string jid)
    {
        lock (_gate)
        {
            _rosterItems.RemoveAll(existing =>
                string.Equals(existing.OwnerBareJid, ownerBareJid, StringComparison.OrdinalIgnoreCase)
                && string.Equals(existing.Jid, jid, StringComparison.OrdinalIgnoreCase));
            SaveJsonList(_rosterPath, _rosterItems
                .OrderBy(existing => existing.OwnerBareJid, StringComparer.OrdinalIgnoreCase)
                .ThenBy(existing => existing.Jid, StringComparer.OrdinalIgnoreCase));
        }
    }

    public void AppendArchiveMessage(LocalArchiveMessage message)
    {
        lock (_gate)
        {
            _archive.Add(message);
            var line = JsonSerializer.Serialize(message, JsonOptions);
            File.AppendAllText(_archivePath, line.Replace(Environment.NewLine, string.Empty, StringComparison.Ordinal) + Environment.NewLine, Encoding.UTF8);
        }
    }

    public IReadOnlyList<LocalArchiveMessage> QueryArchive(
        string ownerBareJid,
        string? withBareJid,
        DateTimeOffset? start,
        DateTimeOffset? end,
        int max,
        string? after,
        string? before)
    {
        lock (_gate)
        {
            var query = _archive
                .Where(message => string.Equals(message.OwnerBareJid, ownerBareJid, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(withBareJid))
            {
                query = query.Where(message => string.Equals(message.ConversationJid, withBareJid, StringComparison.OrdinalIgnoreCase));
            }

            if (start.HasValue)
            {
                query = query.Where(message => message.StampUtc >= start.Value.ToUniversalTime());
            }

            if (end.HasValue)
            {
                query = query.Where(message => message.StampUtc <= end.Value.ToUniversalTime());
            }

            var ordered = query
                .OrderBy(message => message.StampUtc)
                .ThenBy(message => message.ArchiveId, StringComparer.Ordinal)
                .ToList();
            if (!string.IsNullOrWhiteSpace(after))
            {
                var index = ordered.FindIndex(message => string.Equals(message.ArchiveId, after, StringComparison.Ordinal));
                if (index >= 0)
                {
                    ordered = ordered.Skip(index + 1).ToList();
                }
            }

            if (!string.IsNullOrWhiteSpace(before))
            {
                var index = ordered.FindIndex(message => string.Equals(message.ArchiveId, before, StringComparison.Ordinal));
                if (index >= 0)
                {
                    ordered = ordered.Take(index).ToList();
                }
            }

            return ordered.Take(Math.Clamp(max, 1, 500)).ToArray();
        }
    }

    private static List<T> LoadJsonList<T>(string path)
    {
        if (!File.Exists(path))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<T>>(File.ReadAllText(path, Encoding.UTF8), JsonOptions) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static void SaveJsonList<T>(string path, IEnumerable<T> values)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tempPath = path + ".tmp";
        File.WriteAllText(tempPath, JsonSerializer.Serialize(values.ToArray(), JsonOptions), Encoding.UTF8);
        File.Move(tempPath, path, overwrite: true);
    }

    private static List<LocalArchiveMessage> LoadArchive(string path)
    {
        if (!File.Exists(path))
        {
            return [];
        }

        var messages = new List<LocalArchiveMessage>();
        foreach (var line in File.ReadLines(path, Encoding.UTF8))
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            try
            {
                var message = JsonSerializer.Deserialize<LocalArchiveMessage>(line, JsonOptions);
                if (message is not null)
                {
                    messages.Add(message);
                }
            }
            catch (JsonException)
            {
            }
        }

        return messages;
    }
}

sealed record LocalServerOptions(
    string ListenAddress,
    int Port,
    string UploadListenAddress,
    int UploadPort,
    string Domain,
    string? CertificatePath,
    string? CertificatePassword,
    string DataDirectory,
    bool RegistrationCaptchaEnabled,
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
        var dataDirectory = ValueOrDefault(values, "data-dir", LocalServerDataStore.DefaultRootDirectory());
        var registrationCaptchaText = ValueOrDefault(values, "registration-captcha", "false");
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

        if (!bool.TryParse(registrationCaptchaText, out var registrationCaptchaEnabled))
        {
            registrationCaptchaEnabled = registrationCaptchaText is "1" or "yes" or "on";
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
            dataDirectory,
            registrationCaptchaEnabled,
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
                --data-dir .tmp/local-xmpp-data \
                --registration-captcha true \
                --cert-path .tmp/local-xmpp-localhost.pfx \
                --cert-password changeit \
                --account edward:secret \
                --account anna:secret

            Accounts can also be created with XEP-0077 while the server runs.
            Accounts, roster items and XEP-0313 message archive data are stored under --data-dir.
            --registration-captcha true advertises a CAPTCHA data form and requires --upload-port.
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
