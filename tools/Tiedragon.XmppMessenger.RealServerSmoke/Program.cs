using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using Tiedragon.XmppMessenger.Core.Xmpp;

var options = SmokeOptions.Parse(args);
if (options is null)
{
    SmokeOptions.PrintUsage();
    Environment.ExitCode = 2;
    return;
}

using var cancellation = new CancellationTokenSource(options.Timeout);

try
{
    Console.WriteLine($"TLS smoke: {options.Host}:{options.Port} as {options.Account1.Bare}");
    await VerifyTlsCertificateAsync(options, cancellation.Token);
    Console.WriteLine("PASS TLS certificate accepted for configured host.");

    if (!string.IsNullOrWhiteSpace(options.BadHost))
    {
        await VerifyHostnameRejectionAsync(options, cancellation.Token);
        Console.WriteLine("PASS Hostname mismatch rejected.");
    }
    else
    {
        Console.WriteLine("SKIP Hostname mismatch: pass --bad-host to run the negative certificate test.");
    }

    if (options.Register)
    {
        Console.WriteLine($"Register smoke account: {options.Account1.Bare}");
        await RegisterAccountAsync(options, options.Account1, options.Password1, cancellation.Token);
        Console.WriteLine($"PASS Registration accepted for {options.Account1.Bare}.");

        if (!string.IsNullOrEmpty(options.Password2))
        {
            Console.WriteLine($"Register smoke account: {options.Account2.Bare}");
            await RegisterAccountAsync(options, options.Account2, options.Password2, cancellation.Token);
            Console.WriteLine($"PASS Registration accepted for {options.Account2.Bare}.");
        }
    }

    if (!string.IsNullOrEmpty(options.Password2))
    {
        Console.WriteLine($"Two-account smoke: {options.Account1.Bare} -> {options.Account2.Bare}");
        await VerifyTwoAccountChatAsync(options, cancellation.Token);
        Console.WriteLine("PASS Two-account chat message delivered.");
    }
    else
    {
        Console.WriteLine("SKIP Two-account chat: pass --account2 and --password2.");
    }

    if (options.MucService is not null)
    {
        Console.WriteLine($"MUC smoke: service {options.MucService.Bare}");
        await VerifyMultiUserChatAsync(options, cancellation.Token);
        Console.WriteLine("PASS Multi-user chat smoke completed.");
    }
    else
    {
        Console.WriteLine("SKIP Multi-user chat: pass --muc-service and optionally --muc-room.");
    }
}
catch (Exception ex)
{
    Console.Error.WriteLine("FAIL " + ex.Message);
    Console.Error.WriteLine(ex);
    Environment.ExitCode = 1;
}

static async Task RegisterAccountAsync(
    SmokeOptions options,
    XmppAddress account,
    string password,
    CancellationToken cancellationToken)
{
    if (string.IsNullOrWhiteSpace(account.LocalPart))
    {
        throw new InvalidOperationException("In-band registration requires an account localpart.");
    }

    await using var stream = await OpenRegistrationStreamAsync(options, account.DomainPart, cancellationToken);
    await WriteTextAsync(stream, XmppInBandRegistration.CreateInfoRequest(
        "reg-info",
        XmppAddress.Parse(account.DomainPart)).ToXml().ToString(SaveOptions.DisableFormatting), cancellationToken);
    var infoResponse = await ReadIqAsync(stream, "reg-info", cancellationToken);
    if (!TryParseStreamIq(infoResponse, out var infoIq)
        || infoIq is null
        || !XmppInBandRegistration.TryParseInfoResult(infoIq, out var info)
        || info is null)
    {
        throw new InvalidOperationException("Registration info request failed: " + infoResponse);
    }

    var request = XmppInBandRegistration.CreateSimpleRegistrationRequest(
        "reg-1",
        account.LocalPart,
        password,
        XmppAddress.Parse(account.DomainPart),
        info?.Key).ToXml().ToString(SaveOptions.DisableFormatting);

    await WriteTextAsync(stream, request, cancellationToken);
    var response = await ReadIqAsync(stream, "reg-1", cancellationToken);
    if (!TryReadIqType(response, out var type))
    {
        throw new InvalidOperationException("Registration response was not a valid IQ stanza: " + response);
    }

    if (string.Equals(type, "result", StringComparison.Ordinal))
    {
        return;
    }

    throw new InvalidOperationException("Registration failed: " + response);
}

static async Task VerifyTlsCertificateAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    await using var stream = await StartTlsAsync(options, options.Host, cancellationToken);
    await stream.WriteAsync(Encoding.UTF8.GetBytes(" "), cancellationToken);
}

static async Task VerifyHostnameRejectionAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    try
    {
        await using var stream = await StartTlsAsync(
            options,
            options.BadHost!,
            cancellationToken,
            allowCertificatePin: false);
        throw new InvalidOperationException(
            $"TLS unexpectedly accepted the certificate for wrong host '{options.BadHost}'.");
    }
    catch (AuthenticationException)
    {
    }
    catch (IOException ex) when (ex.InnerException is AuthenticationException)
    {
    }
}

static async Task<SslStream> StartTlsAsync(
    SmokeOptions options,
    string validationHost,
    CancellationToken cancellationToken,
    bool allowCertificatePin = true)
{
    var client = new TcpClient();
    await client.ConnectAsync(options.Host, options.Port, cancellationToken);
    var networkStream = client.GetStream();
    var buffer = new byte[16384];

    await WriteTextAsync(networkStream, XmppStreamHeader.CreateClientOpenStream(
        options.Account1.DomainPart,
        "en",
        options.Account1), cancellationToken);

    var features = await ReadUntilAsync(networkStream, buffer, "</stream:features>", cancellationToken);
    if (!features.Contains("<starttls", StringComparison.Ordinal)
        || !features.Contains("urn:ietf:params:xml:ns:xmpp-tls", StringComparison.Ordinal))
    {
        throw new InvalidOperationException("Server did not offer STARTTLS in stream features.");
    }

    await WriteTextAsync(
        networkStream,
        "<starttls xmlns=\"urn:ietf:params:xml:ns:xmpp-tls\"/>",
        cancellationToken);

    var proceed = await ReadUntilAsync(networkStream, buffer, ">", cancellationToken);
    if (!proceed.Contains("<proceed", StringComparison.Ordinal))
    {
        throw new InvalidOperationException("Server did not accept STARTTLS.");
    }

    var sslStream = new SslStream(networkStream, leaveInnerStreamOpen: false);
    await sslStream.AuthenticateAsClientAsync(
        CreateTlsClientOptions(options, validationHost, allowCertificatePin),
        cancellationToken);
    return sslStream;
}

static async Task<Stream> OpenRegistrationStreamAsync(
    SmokeOptions options,
    string domain,
    CancellationToken cancellationToken)
{
    return await StartTlsAndOpenRegistrationStreamAsync(options, domain, cancellationToken);
}

static async Task<SslStream> StartTlsAndOpenRegistrationStreamAsync(
    SmokeOptions options,
    string domain,
    CancellationToken cancellationToken)
{
    var client = new TcpClient();
    await client.ConnectAsync(options.Host, options.Port, cancellationToken);
    var networkStream = client.GetStream();
    var buffer = new byte[16384];

    await WriteTextAsync(networkStream, CreateOpenStreamWithoutFrom(domain), cancellationToken);
    var features = await ReadUntilAsync(networkStream, buffer, "</stream:features>", cancellationToken);
    if (!features.Contains("<starttls", StringComparison.Ordinal)
        || !features.Contains("urn:ietf:params:xml:ns:xmpp-tls", StringComparison.Ordinal))
    {
        throw new InvalidOperationException("Server did not offer STARTTLS in stream features.");
    }

    await WriteTextAsync(
        networkStream,
        "<starttls xmlns=\"urn:ietf:params:xml:ns:xmpp-tls\"/>",
        cancellationToken);

    var proceed = await ReadUntilAsync(networkStream, buffer, ">", cancellationToken);
    if (!proceed.Contains("<proceed", StringComparison.Ordinal))
    {
        throw new InvalidOperationException("Server did not accept STARTTLS.");
    }

    var sslStream = new SslStream(networkStream, leaveInnerStreamOpen: false);
    await sslStream.AuthenticateAsClientAsync(CreateTlsClientOptions(options, options.Host), cancellationToken);
    await WriteTextAsync(sslStream, CreateOpenStreamWithoutFrom(domain), cancellationToken);
    await ReadUntilAsync(sslStream, buffer, "</stream:features>", cancellationToken);
    return sslStream;
}

static async Task VerifyTwoAccountChatAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    var clientOptions = new XmppStreamOptions(
        XmppStreamOptions.Default.PreferredLanguage,
        XmppStreamOptions.Default.Resource,
        options.Timeout,
        XmppStreamOptions.Default.KeepAliveInterval);
    var tlsUpgrader = new SmokeTlsStreamUpgrader(options.CertificateSha256);
    await using var sender = new XmppStreamClient(
        new XmppConnectionSettings(options.Account1, options.Host, options.Port, requireTls: true),
        clientOptions,
        tlsUpgrader);
    await using var receiver = new XmppStreamClient(
        new XmppConnectionSettings(options.Account2, options.Host, options.Port, requireTls: true),
        clientOptions,
        tlsUpgrader);

    await sender.LoginAsync(options.Account1.LocalPart ?? options.Account1.Bare, options.Password1, cancellationToken: cancellationToken);
    await receiver.LoginAsync(options.Account2.LocalPart ?? options.Account2.Bare, options.Password2!, cancellationToken: cancellationToken);
    await sender.SendInitialPresenceAsync(cancellationToken: cancellationToken);
    await receiver.SendInitialPresenceAsync(cancellationToken: cancellationToken);

    var text = "Teletyptel smoke " + DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    await sender.SendChatMessageAsync(new XmppChatMessage(options.Account2, text), cancellationToken);

    while (true)
    {
        var stanza = await receiver.ReadNextStanzaAsync(cancellationToken);
        if (stanza.Message?.Body == text)
        {
            return;
        }
    }
}

static async Task VerifyMultiUserChatAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    var tlsUpgrader = new SmokeTlsStreamUpgrader(options.CertificateSha256);
    await using var sender = CreateClient(options, options.Account1, tlsUpgrader);

    await sender.LoginAsync(
        options.Account1.LocalPart ?? options.Account1.Bare,
        options.Password1,
        cancellationToken: cancellationToken);
    await sender.SendInitialPresenceAsync(cancellationToken: cancellationToken);

    var service = options.MucService!;
    var info = await sender.RequestServiceDiscoveryInfoAsync(
        service,
        options.Timeout,
        id: "muc-service-info",
        cancellationToken: cancellationToken);
    if (!IsMultiUserChatService(info))
    {
        throw new InvalidOperationException(
            $"Service '{service.Bare}' did not advertise XEP-0045 MUC support.");
    }

    Console.WriteLine($"PASS MUC service advertises {XmppMultiUserChat.NamespaceName}.");

    var rooms = await sender.RequestMultiUserChatRoomsAsync(
        service,
        options.Timeout,
        id: "muc-service-rooms",
        cancellationToken: cancellationToken);
    Console.WriteLine($"PASS MUC room discovery returned {rooms.Count} room(s).");

    if (options.MucRoom is null)
    {
        Console.WriteLine("SKIP MUC room join/groupchat: pass --muc-room.");
        return;
    }

    if (string.IsNullOrEmpty(options.Password2))
    {
        throw new InvalidOperationException(
            "MUC room join/groupchat smoke requires --account2 and --password2.");
    }

    var roomItems = await sender.RequestMultiUserChatRoomItemsAsync(
        options.MucRoom,
        options.Timeout,
        id: "muc-room-items",
        cancellationToken: cancellationToken);
    Console.WriteLine($"PASS MUC room item discovery returned {roomItems.Count} item(s).");

    await using var receiver = CreateClient(options, options.Account2, tlsUpgrader);
    await receiver.LoginAsync(
        options.Account2.LocalPart ?? options.Account2.Bare,
        options.Password2,
        cancellationToken: cancellationToken);
    await receiver.SendInitialPresenceAsync(cancellationToken: cancellationToken);

    var nick1 = options.MucNick1 ?? DefaultNick(options.Account1, "teletyptel-a");
    var nick2 = options.MucNick2 ?? DefaultNick(options.Account2, "teletyptel-b");

    await sender.SendMultiUserChatJoinAsync(options.MucRoom, nick1, historyMaxChars: 0, cancellationToken: cancellationToken);
    await WaitForMucSelfPresenceAsync(sender, options.MucRoom, nick1, cancellationToken);
    await receiver.SendMultiUserChatJoinAsync(options.MucRoom, nick2, historyMaxChars: 0, cancellationToken: cancellationToken);
    await WaitForMucSelfPresenceAsync(receiver, options.MucRoom, nick2, cancellationToken);
    Console.WriteLine($"PASS Two accounts joined {options.MucRoom.Bare} as {nick1} and {nick2}.");

    var text = "Teletyptel MUC smoke " + DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    await sender.SendMultiUserChatMessageAsync(
        options.MucRoom,
        text,
        id: "muc-smoke-message",
        cancellationToken: cancellationToken);
    var group = await WaitForMucGroupMessageAsync(receiver, options.MucRoom, text, nick1, cancellationToken);
    Console.WriteLine($"PASS MUC groupchat delivered from {group.From?.Full ?? group.Nickname ?? "unknown"}.");

    if (options.MucAdmin)
    {
        var form = await sender.RequestMultiUserChatConfigurationFormAsync(
            options.MucRoom,
            options.Timeout,
            id: "muc-owner-config",
            cancellationToken: cancellationToken);
        Console.WriteLine($"PASS MUC owner configuration form returned {form.Fields.Count} field(s).");

        var adminItems = await sender.RequestMultiUserChatAdminItemsAsync(
            options.MucRoom,
            options.Timeout,
            affiliation: "member",
            id: "muc-admin-members",
            cancellationToken: cancellationToken);
        Console.WriteLine($"PASS MUC admin member query returned {adminItems.Count} item(s).");
    }
    else
    {
        Console.WriteLine("SKIP MUC owner/admin checks: pass --muc-admin when account1 owns the room.");
    }

    await sender.SendMultiUserChatLeaveAsync(options.MucRoom, nick1, cancellationToken);
    await receiver.SendMultiUserChatLeaveAsync(options.MucRoom, nick2, cancellationToken);
}

static XmppStreamClient CreateClient(
    SmokeOptions options,
    XmppAddress account,
    IXmppTlsStreamUpgrader tlsUpgrader)
{
    var clientOptions = new XmppStreamOptions(
        XmppStreamOptions.Default.PreferredLanguage,
        XmppStreamOptions.Default.Resource,
        options.Timeout,
        XmppStreamOptions.Default.KeepAliveInterval);
    return new XmppStreamClient(
        new XmppConnectionSettings(account, options.Host, options.Port, requireTls: true),
        clientOptions,
        tlsUpgrader);
}

static bool IsMultiUserChatService(XmppServiceDiscoveryInfo info)
{
    return info.Supports(XmppMultiUserChat.NamespaceName)
        || info.Identities.Any(identity =>
            string.Equals(identity.Category, "conference", StringComparison.OrdinalIgnoreCase));
}

static async Task WaitForMucSelfPresenceAsync(
    XmppStreamClient client,
    XmppAddress room,
    string nick,
    CancellationToken cancellationToken)
{
    var occupant = XmppMultiUserChat.ToOccupantJid(room, nick);
    while (true)
    {
        var stanza = await client.ReadNextStanzaAsync(cancellationToken);
        if (stanza.Presence?.From is null
            || !string.Equals(stanza.Presence.From.Full, occupant.Full, StringComparison.OrdinalIgnoreCase))
        {
            continue;
        }

        if (stanza.Presence.Type == XmppPresenceType.Error)
        {
            throw new InvalidOperationException("MUC join failed: " + stanza.Element);
        }

        return;
    }
}

static async Task<XmppGroupChatMessage> WaitForMucGroupMessageAsync(
    XmppStreamClient client,
    XmppAddress room,
    string body,
    string? expectedNick,
    CancellationToken cancellationToken)
{
    while (true)
    {
        var stanza = await client.ReadNextStanzaAsync(cancellationToken);
        if (!XmppMultiUserChat.TryParseGroupMessage(stanza.Element, out var group)
            || group is null
            || !string.Equals(group.Room?.Bare, room.Bare, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(group.Body, body, StringComparison.Ordinal))
        {
            continue;
        }

        if (!string.IsNullOrWhiteSpace(expectedNick)
            && !string.Equals(group.Nickname, expectedNick, StringComparison.OrdinalIgnoreCase))
        {
            continue;
        }

        return group;
    }
}

static string DefaultNick(XmppAddress account, string fallback)
{
    var source = account.LocalPart;
    if (string.IsNullOrWhiteSpace(source))
    {
        source = fallback;
    }

    var builder = new StringBuilder(source.Length);
    foreach (var ch in source)
    {
        builder.Append(char.IsWhiteSpace(ch) || ch == '/' ? '-' : ch);
    }

    return builder.Length == 0 ? fallback : builder.ToString();
}

static async Task WriteTextAsync(Stream stream, string text, CancellationToken cancellationToken)
{
    await stream.WriteAsync(Encoding.UTF8.GetBytes(text), cancellationToken);
    await stream.FlushAsync(cancellationToken);
}

static async Task<string> ReadUntilAsync(
    Stream stream,
    byte[] buffer,
    string marker,
    CancellationToken cancellationToken)
{
    var text = new StringBuilder();
    while (!text.ToString().Contains(marker, StringComparison.Ordinal))
    {
        var count = await stream.ReadAsync(buffer, cancellationToken);
        if (count == 0)
        {
            throw new IOException("Server closed the connection.");
        }

        text.Append(Encoding.UTF8.GetString(buffer, 0, count));
    }

    return text.ToString();
}

static async Task<string> ReadIqAsync(
    Stream stream,
    string id,
    CancellationToken cancellationToken)
{
    var buffer = new byte[16384];
    var text = new StringBuilder();
    while (true)
    {
        if (TryExtractIq(text.ToString(), id, out var iqText))
        {
            return iqText;
        }

        var count = await stream.ReadAsync(buffer, cancellationToken);
        if (count == 0)
        {
            throw new IOException("Server closed the connection.");
        }

        text.Append(Encoding.UTF8.GetString(buffer, 0, count));
    }
}

static bool TryExtractIq(string xml, string id, out string iqText)
{
    iqText = string.Empty;
    var idDouble = $"id=\"{id}\"";
    var idSingle = $"id='{id}'";
    var idIndex = xml.IndexOf(idDouble, StringComparison.Ordinal);
    if (idIndex < 0)
    {
        idIndex = xml.IndexOf(idSingle, StringComparison.Ordinal);
    }

    if (idIndex < 0)
    {
        return false;
    }

    var start = xml.LastIndexOf("<iq", idIndex, StringComparison.Ordinal);
    if (start < 0)
    {
        return false;
    }

    var iqStartEnd = xml.IndexOf('>', start);
    var close = xml.IndexOf("</iq>", idIndex, StringComparison.Ordinal);
    var selfClose = xml.IndexOf("/>", idIndex, StringComparison.Ordinal);
    if (iqStartEnd >= 0 && selfClose > iqStartEnd)
    {
        selfClose = -1;
    }
    if (close >= 0 && (selfClose < 0 || close < selfClose))
    {
        iqText = xml[start..(close + "</iq>".Length)];
        return true;
    }

    if (selfClose >= 0)
    {
        iqText = xml[start..(selfClose + "/>".Length)];
        return true;
    }

    return false;
}

static bool TryReadIqType(string xml, out string? type)
{
    type = null;
    var start = xml.IndexOf("<iq", StringComparison.Ordinal);
    var end = xml.LastIndexOf("</iq>", StringComparison.Ordinal);
    var selfClose = xml.IndexOf("/>", start < 0 ? 0 : start, StringComparison.Ordinal);
    if (start < 0 || end < start && selfClose < start)
    {
        return false;
    }

    var iqText = end > start
        ? xml[start..(end + "</iq>".Length)]
        : xml[start..(selfClose + "/>".Length)];
    try
    {
        var iq = XElement.Parse(iqText);
        type = iq.Attribute("type")?.Value;
        return !string.IsNullOrWhiteSpace(type);
    }
    catch (XmlException)
    {
        return false;
    }
}

static bool TryParseStreamIq(string xml, out XmppIq? iq)
{
    if (XmppIq.TryParse(xml, out iq))
    {
        return true;
    }

    iq = null;
    try
    {
        var wrapper = "<wrapper xmlns=\"jabber:client\">" + xml + "</wrapper>";
        var element = XElement.Parse(wrapper).Elements().SingleOrDefault();
        return element is not null && XmppIq.TryParse(element, out iq);
    }
    catch (XmlException)
    {
        return false;
    }
}

static string CreateOpenStreamWithoutFrom(string domain)
{
    return "<stream:stream"
        + $" to=\"{System.Security.SecurityElement.Escape(domain)}\""
        + " version=\"1.0\""
        + " xml:lang=\"en\""
        + " xmlns=\"jabber:client\""
        + " xmlns:stream=\"http://etherx.jabber.org/streams\">";
}

static SslClientAuthenticationOptions CreateTlsClientOptions(
    SmokeOptions options,
    string validationHost,
    bool allowCertificatePin = true)
{
    var authOptions = new SslClientAuthenticationOptions
    {
        TargetHost = validationHost
    };

    if (allowCertificatePin && !string.IsNullOrWhiteSpace(options.CertificateSha256))
    {
        var expected = NormalizeHex(options.CertificateSha256);
        authOptions.RemoteCertificateValidationCallback = (_, certificate, _, errors) =>
        {
            if (errors == SslPolicyErrors.None)
            {
                return true;
            }

            if (certificate is null)
            {
                return false;
            }

            using var certificate2 = certificate as X509Certificate2 ?? new X509Certificate2(certificate);
            var actual = Convert.ToHexString(certificate2.GetCertHash(HashAlgorithmName.SHA256));
            return string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);
        };
    }

    return authOptions;
}

static string NormalizeHex(string value)
{
    return value
        .Replace(":", string.Empty, StringComparison.Ordinal)
        .Replace("-", string.Empty, StringComparison.Ordinal)
        .Replace(" ", string.Empty, StringComparison.Ordinal)
        .ToUpperInvariant();
}

sealed class SmokeTlsStreamUpgrader(string? certificateSha256) : IXmppTlsStreamUpgrader
{
    public async Task<Stream> UpgradeAsync(Stream stream, string targetHost, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(stream);

        var sslStream = new SslStream(stream, leaveInnerStreamOpen: false);
        try
        {
            var options = new SslClientAuthenticationOptions
            {
                TargetHost = targetHost
            };

            if (!string.IsNullOrWhiteSpace(certificateSha256))
            {
                var expected = certificateSha256
                    .Replace(":", string.Empty, StringComparison.Ordinal)
                    .Replace("-", string.Empty, StringComparison.Ordinal)
                    .Replace(" ", string.Empty, StringComparison.Ordinal)
                    .ToUpperInvariant();
                options.RemoteCertificateValidationCallback = (_, certificate, _, errors) =>
                {
                    if (errors == SslPolicyErrors.None)
                    {
                        return true;
                    }

                    if (certificate is null)
                    {
                        return false;
                    }

                    using var certificate2 = certificate as X509Certificate2 ?? new X509Certificate2(certificate);
                    var actual = Convert.ToHexString(certificate2.GetCertHash(HashAlgorithmName.SHA256));
                    return string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);
                };
            }

            await sslStream.AuthenticateAsClientAsync(options, cancellationToken);
            return sslStream;
        }
        catch
        {
            await sslStream.DisposeAsync();
            throw;
        }
    }
}

sealed record SmokeOptions(
    string Host,
    int Port,
    XmppAddress Account1,
    string Password1,
    XmppAddress Account2,
    string? Password2,
    string? BadHost,
    bool Register,
    string? CertificateSha256,
    TimeSpan Timeout,
    XmppAddress? MucService,
    XmppAddress? MucRoom,
    string? MucNick1,
    string? MucNick2,
    bool MucAdmin)
{
    public static SmokeOptions? Parse(string[] args)
    {
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var flags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < args.Length; index++)
        {
            var key = args[index];
            if (!key.StartsWith("--", StringComparison.Ordinal))
            {
                return null;
            }

            var name = key[2..];
            if (string.Equals(name, "register", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "muc-admin", StringComparison.OrdinalIgnoreCase))
            {
                flags.Add(name);
                continue;
            }

            if (index + 1 >= args.Length)
            {
                return null;
            }

            values[name] = args[++index];
        }

        if (!values.TryGetValue("host", out var host)
            || !values.TryGetValue("account1", out var account1Text)
            || !values.TryGetValue("password1", out var password1))
        {
            return null;
        }

        var port = values.TryGetValue("port", out var portText) && int.TryParse(portText, out var parsedPort)
            ? parsedPort
            : XmppConnectionSettings.ClientPort;
        var timeout = values.TryGetValue("timeout-seconds", out var timeoutText)
            && int.TryParse(timeoutText, out var timeoutSeconds)
            ? TimeSpan.FromSeconds(timeoutSeconds)
            : TimeSpan.FromSeconds(30);
        var account1 = XmppAddress.Parse(account1Text);
        var account2 = values.TryGetValue("account2", out var account2Text)
            ? XmppAddress.Parse(account2Text)
            : account1;
        values.TryGetValue("password2", out var password2);
        values.TryGetValue("bad-host", out var badHost);
        values.TryGetValue("cert-sha256", out var certSha256);
        var mucService = values.TryGetValue("muc-service", out var mucServiceText)
            ? XmppAddress.Parse(mucServiceText)
            : null;
        var mucRoom = values.TryGetValue("muc-room", out var mucRoomText)
            ? XmppAddress.Parse(mucRoomText)
            : null;
        values.TryGetValue("muc-nick1", out var mucNick1);
        values.TryGetValue("muc-nick2", out var mucNick2);

        return new SmokeOptions(
            host,
            port,
            account1,
            password1,
            account2,
            password2,
            badHost,
            flags.Contains("register"),
            certSha256,
            timeout,
            mucService,
            mucRoom,
            mucNick1,
            mucNick2,
            flags.Contains("muc-admin"));
    }

    public static void PrintUsage()
    {
        Console.WriteLine("""
            Usage:
              dotnet run --project tools/Tiedragon.XmppMessenger.RealServerSmoke -- \
                --host xmpp.example.org \
                --account1 edward@example.org/desktop \
                --password1 secret \
                --account2 anna@example.org/desktop \
                --password2 secret \
                --bad-host wrong.example.org \
                --muc-service conference.example.org \
                --muc-room team@conference.example.org \
                --register

            Optional:
              --port 5222
              --timeout-seconds 30
              --register
              --cert-sha256 <pinned certificate fingerprint for local self-signed smoke>
              --muc-service <conference service JID for XEP-0045 discovery>
              --muc-room <room JID for join and groupchat roundtrip>
              --muc-nick1 <nickname for account1>
              --muc-nick2 <nickname for account2>
              --muc-admin <also request owner configuration and admin member list>
            """);
    }
}
