using System.Globalization;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using Tiedragon.XmppMessenger.Core.Xmpp;

if (args.Any(arg => string.Equals(arg, "--help", StringComparison.OrdinalIgnoreCase)
    || string.Equals(arg, "-h", StringComparison.OrdinalIgnoreCase)
    || string.Equals(arg, "/?", StringComparison.OrdinalIgnoreCase)))
{
    SmokeOptions.PrintUsage();
    return;
}

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
    if (options.BoshDiscoveryOnly)
    {
        var boshUrl = options.BoshUrl
            ?? await DiscoverBoshUrlAsync(options.Account1.DomainPart, cancellation.Token);
        Console.WriteLine($"PASS BOSH endpoint discovered for {options.Account1.DomainPart}: {boshUrl}");
        return;
    }

    if (options.DiscoverDirectTls)
    {
        options = await ResolveDiscoveredEndpointAsync(options, cancellation.Token);
    }

    if (!options.BoshOnly)
    {
        Console.WriteLine($"TLS smoke: {options.Host}:{options.Port} as {options.Account1.Bare} ({(options.DirectTls ? "direct TLS" : "STARTTLS")})");
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

        if (options.RegistrationInfoOnly)
        {
            Console.WriteLine($"Registration info smoke: {options.Account1.DomainPart}");
            await PrintRegistrationInfoAsync(options, options.Account1, cancellation.Token);
            Console.WriteLine("PASS Registration info smoke completed.");
            return;
        }

        if (options.TlsOnly)
        {
            Console.WriteLine("PASS TLS-only internet smoke completed.");
        }
        else if (options.Register)
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

        if (!options.TlsOnly)
        {
            Console.WriteLine("Login and roster smoke.");
            await VerifyLoginAndRosterAsync(options, cancellation.Token);
            Console.WriteLine("PASS Login, bind and roster smoke completed.");

            await PrintServiceContactAddressesAsync(options, cancellation.Token);
        }

        if (!options.TlsOnly && options.ExternalServices)
        {
            Console.WriteLine("External STUN/TURN discovery smoke.");
            await VerifyExternalServiceDiscoveryAsync(options, cancellation.Token);
            Console.WriteLine("PASS External service discovery smoke completed.");
        }
        else if (!options.TlsOnly)
        {
            Console.WriteLine("SKIP External service discovery: pass --external-services.");
        }

        if (!options.TlsOnly && options.BlockJid is not null)
        {
            Console.WriteLine($"Blocking command smoke: block/unblock {options.BlockJid.Bare}");
            await VerifyBlockingCommandAsync(options, cancellation.Token);
            Console.WriteLine("PASS Blocking command smoke completed.");
        }
        else if (!options.TlsOnly)
        {
            Console.WriteLine("SKIP Blocking command: pass --block-jid.");
        }

        if (!options.TlsOnly && (options.LocationSmoke || options.ExpectNoUserLocationSupport))
        {
            Console.WriteLine("User location smoke.");
            await VerifyUserLocationAsync(options, cancellation.Token);
            Console.WriteLine("PASS User location smoke completed.");
        }
        else if (!options.TlsOnly)
        {
            Console.WriteLine("SKIP User location: pass --location-smoke.");
        }

        if (!options.TlsOnly && (options.UploadService is not null || !string.IsNullOrWhiteSpace(options.UploadFile)))
        {
            Console.WriteLine("HTTP file upload smoke.");
            await VerifyHttpFileUploadAsync(options, cancellation.Token);
            Console.WriteLine("PASS HTTP file upload smoke completed.");
        }
        else if (!options.TlsOnly)
        {
            Console.WriteLine("SKIP HTTP file upload: pass --upload-service or --upload-file.");
        }

        if (!options.TlsOnly && (options.Socks5Smoke || options.Socks5Proxy is not null))
        {
            Console.WriteLine("SOCKS5 bytestream proxy smoke.");
            await VerifySocks5BytestreamProxyAsync(options, cancellation.Token);
            Console.WriteLine("PASS SOCKS5 bytestream proxy smoke completed.");
        }
        else if (!options.TlsOnly)
        {
            Console.WriteLine("SKIP SOCKS5 bytestream proxy: pass --socks5-smoke or --socks5-proxy.");
        }

        if (!options.TlsOnly && options.IbbSmoke)
        {
            Console.WriteLine("In-Band Bytestream fallback smoke.");
            await VerifyInBandBytestreamAsync(options, cancellation.Token);
            Console.WriteLine("PASS In-Band Bytestream fallback smoke completed.");
        }
        else if (!options.TlsOnly)
        {
            Console.WriteLine("SKIP In-Band Bytestream fallback: pass --ibb-smoke.");
        }

        if (!options.TlsOnly && options.MamSmoke)
        {
            Console.WriteLine("Message archive smoke.");
            await VerifyMessageArchiveAsync(options, cancellation.Token);
            Console.WriteLine("PASS Message archive smoke completed.");
        }
        else if (!options.TlsOnly)
        {
            Console.WriteLine("SKIP Message archive: pass --mam-smoke.");
        }

        if (!options.TlsOnly && options.CorrectionSmoke)
        {
            Console.WriteLine("Message correction smoke.");
            await VerifyMessageCorrectionAsync(options, cancellation.Token);
            Console.WriteLine("PASS Message correction smoke completed.");
        }
        else if (!options.TlsOnly)
        {
            Console.WriteLine("SKIP Message correction: pass --correction-smoke.");
        }

        if (!options.TlsOnly && !string.IsNullOrEmpty(options.Password2))
        {
            Console.WriteLine($"Two-account smoke: {options.Account1.Bare} -> {options.Account2.Bare}");
            await VerifyTwoAccountChatAsync(options, cancellation.Token);
            Console.WriteLine("PASS Two-account chat message delivered.");
        }
        else if (!options.TlsOnly)
        {
            Console.WriteLine("SKIP Two-account chat: pass --account2 and --password2.");
        }

        if (!options.TlsOnly && options.MucService is not null)
        {
            Console.WriteLine($"MUC smoke: service {options.MucService.Bare}");
            await VerifyMultiUserChatAsync(options, cancellation.Token);
            Console.WriteLine("PASS Multi-user chat smoke completed.");
        }
        else if (!options.TlsOnly)
        {
            Console.WriteLine("SKIP Multi-user chat: pass --muc-service and optionally --muc-room.");
        }
    }
    else
    {
        Console.WriteLine("BOSH-only smoke: skipping TCP STARTTLS/direct TLS checks.");
    }

    if (!options.TlsOnly && (options.BoshUrl is not null || options.DiscoverBosh))
    {
        await VerifyBoshAsync(options, cancellation.Token);
        Console.WriteLine("PASS BOSH smoke completed.");
    }
    else if (!options.TlsOnly)
    {
        Console.WriteLine("SKIP BOSH: pass --bosh-url or --discover-bosh.");
    }
}
catch (Exception ex)
{
    Console.Error.WriteLine("FAIL " + ex.Message);
    Console.Error.WriteLine(ex);
    Environment.ExitCode = 1;
}

static async Task<SmokeOptions> ResolveDiscoveredEndpointAsync(
    SmokeOptions options,
    CancellationToken cancellationToken)
{
    var endpoints = await XmppDirectTls.DiscoverClientEndpointsAsync(
        options.Account1.DomainPart,
        includeStartTlsFallback: true,
        preferDirectTls: true,
        cancellationToken: cancellationToken);
    var endpoint = endpoints.FirstOrDefault();
    if (endpoint is null)
    {
        throw new InvalidOperationException(
            $"No XMPP client endpoint found for {options.Account1.DomainPart}.");
    }

    Console.WriteLine(
        $"INFO XEP-0368/XMPP endpoint: {endpoint.Service} -> {endpoint.Host}:{endpoint.Port}");
    return options with
    {
        Host = endpoint.Host,
        Port = endpoint.Port,
        DirectTls = endpoint.DirectTls
    };
}

static async Task VerifyBoshAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    var boshUrl = options.BoshUrl
        ?? await DiscoverBoshUrlAsync(options.Account1.DomainPart, cancellationToken);
    Console.WriteLine($"BOSH smoke: {boshUrl} as {options.Account1.Bare}");

    using var senderHttp = new HttpClient
    {
        Timeout = options.Timeout
    };
    await using var sender = new XmppBoshClient(
        boshUrl,
        options.Account1.DomainPart,
        senderHttp,
        language: "en",
        initialRid: DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    var senderLogin = await sender.LoginAsync(
        options.Account1,
        options.Password1,
        options.Timeout,
        resource: options.Account1.ResourcePart ?? "bosh-smoke",
        cancellationToken: cancellationToken);
    Console.WriteLine($"PASS BOSH login/bind: {senderLogin.BoundJid.Full} via {senderLogin.SaslMechanism}.");

    var domain = XmppAddress.Parse(options.Account1.DomainPart);
    var disco = await sender.SendIqAndWaitAsync(
        XmppServiceDiscovery.CreateInfoRequest("bosh-domain-disco", domain),
        options.Timeout,
        cancellationToken);
    if (!XmppServiceDiscovery.TryParseInfoResult(disco, out var info) || info is null)
    {
        throw new InvalidOperationException("BOSH disco#info response was not valid.");
    }

    Console.WriteLine($"PASS BOSH disco#info returned {info.Features.Count} feature(s) for {domain.Bare}.");

    if (string.IsNullOrWhiteSpace(options.Password2))
    {
        Console.WriteLine("SKIP BOSH two-account chat: pass --account2 and --password2.");
        await sender.TerminateAsync(cancellationToken: cancellationToken);
        return;
    }

    using var receiverHttp = new HttpClient
    {
        Timeout = options.Timeout
    };
    await using var receiver = new XmppBoshClient(
        boshUrl,
        options.Account2.DomainPart,
        receiverHttp,
        language: "en",
        initialRid: DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + 1000);
    var receiverLogin = await receiver.LoginAsync(
        options.Account2,
        options.Password2,
        options.Timeout,
        resource: options.Account2.ResourcePart ?? "bosh-smoke",
        cancellationToken: cancellationToken);
    Console.WriteLine($"PASS BOSH receiver login/bind: {receiverLogin.BoundJid.Full}.");

    await sender.SendElementAsync(new XmppPresence().ToXml(), cancellationToken);
    await receiver.SendElementAsync(new XmppPresence().ToXml(), cancellationToken);

    var text = "Teletyptel BOSH smoke " + DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    await sender.SendElementAsync(new XmppChatMessage(
        options.Account2,
        text,
        Id: "bosh-chat-smoke").ToXml(), cancellationToken);
    var received = await WaitForBoshChatAsync(receiver, text, cancellationToken);
    Console.WriteLine($"PASS BOSH long-poll chat delivered from {received.From?.Full ?? "unknown"}.");

    await receiver.TerminateAsync(cancellationToken: cancellationToken);
    await sender.TerminateAsync(cancellationToken: cancellationToken);
}

static async Task<Uri> DiscoverBoshUrlAsync(string domain, CancellationToken cancellationToken)
{
    using var http = new HttpClient
    {
        Timeout = TimeSpan.FromSeconds(10)
    };

    var jsonUri = XmppAlternativeConnectionDiscovery.CreateHostMetaUri(domain, json: true);
    try
    {
        var json = await http.GetStringAsync(jsonUri, cancellationToken);
        var jsonMethods = XmppAlternativeConnectionDiscovery.ParseJsonHostMeta(json);
        var jsonBosh = XmppAlternativeConnectionDiscovery.BoshUris(jsonMethods).FirstOrDefault();
        if (jsonBosh is not null)
        {
            Console.WriteLine($"INFO XEP-0156 discovered BOSH from {jsonUri}: {jsonBosh}");
            return jsonBosh;
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"INFO XEP-0156 JSON BOSH discovery skipped: {ex.Message}");
    }

    var xmlUri = XmppAlternativeConnectionDiscovery.CreateHostMetaUri(domain);
    try
    {
        var xml = await http.GetStringAsync(xmlUri, cancellationToken);
        var xmlMethods = XmppAlternativeConnectionDiscovery.ParseXmlHostMeta(xml);
        var xmlBosh = XmppAlternativeConnectionDiscovery.BoshUris(xmlMethods).FirstOrDefault();
        if (xmlBosh is not null)
        {
            Console.WriteLine($"INFO XEP-0156 discovered BOSH from {xmlUri}: {xmlBosh}");
            return xmlBosh;
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"INFO XEP-0156 XML BOSH discovery skipped: {ex.Message}");
    }

    throw new InvalidOperationException(
        $"No BOSH endpoint was discovered for {domain}; pass --bosh-url explicitly.");
}

static async Task<XmppChatMessage> WaitForBoshChatAsync(
    XmppBoshClient client,
    string body,
    CancellationToken cancellationToken)
{
    while (true)
    {
        var stanza = await client.ReadNextStanzaAsync(cancellationToken);
        if (stanza.Message is not null
            && string.Equals(stanza.Message.Body, body, StringComparison.Ordinal))
        {
            return stanza.Message;
        }
    }
}

static async Task VerifyExternalServiceDiscoveryAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    var tlsUpgrader = new SmokeTlsStreamUpgrader(options.CertificateSha256);
    await using var client = CreateClient(options, options.Account1, tlsUpgrader);

    await client.LoginAsync(
        options.Account1.LocalPart ?? options.Account1.Bare,
        options.Password1,
        cancellationToken: cancellationToken);

    var target = options.ExternalService ?? XmppAddress.Parse(options.Account1.DomainPart);
    var info = await client.RequestServiceDiscoveryInfoAsync(
        target,
        options.Timeout,
        id: "extdisco-info",
        cancellationToken: cancellationToken);
    if (!XmppExternalServiceDiscovery.SupportsExternalServiceDiscovery(info))
    {
        throw new InvalidOperationException(
            $"{target.Bare} did not advertise {XmppExternalServiceDiscovery.NamespaceName}.");
    }

    Console.WriteLine($"PASS XEP-0215 advertised by {target.Bare}.");
    var services = await client.RequestExternalServicesAsync(
        target,
        options.Timeout,
        options.ExternalServiceType,
        id: "extdisco-services",
        cancellationToken: cancellationToken);
    if (services.Services.Count == 0)
    {
        throw new InvalidOperationException(
            $"XEP-0215 service request returned no external services from {target.Bare}.");
    }

    var expectedType = options.ExternalServiceType;
    var mediaServices = string.IsNullOrWhiteSpace(expectedType)
        ? services.Services
            .Where(service => IsExternalServiceType(service, XmppExternalServiceDiscovery.StunServiceType)
                || IsExternalServiceType(service, XmppExternalServiceDiscovery.TurnServiceType))
            .ToArray()
        : services.Services
            .Where(service => IsExternalServiceType(service, expectedType))
            .ToArray();
    if (mediaServices.Length == 0)
    {
        var typeText = string.IsNullOrWhiteSpace(expectedType) ? "stun/turn" : expectedType;
        throw new InvalidOperationException($"XEP-0215 response did not contain a {typeText} service.");
    }

    Console.WriteLine(
        $"PASS XEP-0215 returned {mediaServices.Length} usable STUN/TURN service(s) from {target.Bare}.");
    foreach (var service in mediaServices)
    {
        Console.WriteLine("INFO XEP-0215 service: "
            + $"type={service.Type}, host={service.Host}, port={service.Port?.ToString() ?? "-"}, "
            + $"transport={service.Transport ?? "-"}, restricted={service.Restricted?.ToString() ?? "-"}, "
            + $"credentials={(HasCredentials(service) ? "present" : "missing")}, "
            + $"expires={service.Expires?.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ") ?? "-"}");
    }

    var restricted = mediaServices
        .Where(service => service.RequiresCredentials)
        .ToArray();
    if (restricted.Length == 0)
    {
        Console.WriteLine("INFO XEP-0215 credential request skipped: returned services already include credentials or are unrestricted.");
        return;
    }

    for (var index = 0; index < restricted.Length; index++)
    {
        var service = restricted[index];
        var credentials = await client.RequestExternalServiceCredentialsAsync(
            target,
            new XmppExternalServiceIdentity(service.Host, service.Type, service.Port),
            options.Timeout,
            id: $"extdisco-credentials-{index + 1}",
            cancellationToken: cancellationToken);
        var credential = credentials.Services.FirstOrDefault(candidate =>
            string.Equals(candidate.Host, service.Host, StringComparison.OrdinalIgnoreCase)
            && string.Equals(candidate.Type, service.Type, StringComparison.OrdinalIgnoreCase)
            && candidate.Port == service.Port);
        if (credential is null || !HasCredentials(credential))
        {
            throw new InvalidOperationException(
                $"XEP-0215 credentials response did not include username/password for {service.Type} {service.Host}.");
        }

        Console.WriteLine(
            $"PASS XEP-0215 credentials received for {service.Type} {service.Host}:{service.Port?.ToString() ?? "-"}.");
    }
}

static bool IsExternalServiceType(XmppExternalService service, string type)
{
    return string.Equals(service.Type, type, StringComparison.OrdinalIgnoreCase);
}

static bool HasCredentials(XmppExternalService service)
{
    return !string.IsNullOrWhiteSpace(service.Username)
        && !string.IsNullOrWhiteSpace(service.Password);
}

static async Task VerifyLoginAndRosterAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    var tlsUpgrader = new SmokeTlsStreamUpgrader(options.CertificateSha256);
    await using var client = CreateClient(options, options.Account1, tlsUpgrader);

    var login = await client.LoginAsync(
        options.Account1.LocalPart ?? options.Account1.Bare,
        options.Password1,
        cancellationToken: cancellationToken);
    Console.WriteLine($"PASS Login/bind: {login.BoundJid.Full} via {login.SaslMechanism}.");

    await client.SendInitialPresenceAsync(cancellationToken: cancellationToken);

    var roster = await client.RequestRosterAsync(
        options.Timeout,
        id: "roster-smoke",
        cancellationToken: cancellationToken);
    Console.WriteLine($"PASS Roster returned {roster.Count} item(s).");
}

static async Task VerifyBlockingCommandAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    var tlsUpgrader = new SmokeTlsStreamUpgrader(options.CertificateSha256);
    await using var client = CreateClient(options, options.Account1, tlsUpgrader);

    await client.LoginAsync(
        options.Account1.LocalPart ?? options.Account1.Bare,
        options.Password1,
        cancellationToken: cancellationToken);

    var domain = XmppAddress.Parse(options.Account1.DomainPart);
    var info = await client.RequestServiceDiscoveryInfoAsync(
        domain,
        options.Timeout,
        id: "blocking-domain-info",
        cancellationToken: cancellationToken);
    if (!XmppBlockingCommand.SupportsBlocking(info))
    {
        throw new InvalidOperationException(
            $"{domain.Bare} did not advertise {XmppBlockingCommand.NamespaceName}.");
    }

    Console.WriteLine($"PASS XEP-0191 advertised by {domain.Bare}.");
    var before = await client.RequestBlockedUsersAsync(
        options.Timeout,
        id: "blocking-list-before",
        cancellationToken: cancellationToken);
    Console.WriteLine($"INFO XEP-0191 blocklist before smoke contains {before.Count} JID(s).");

    var blockJid = options.BlockJid!;
    await client.BlockUserAsync(
        blockJid,
        options.Timeout,
        id: "blocking-block-smoke",
        cancellationToken: cancellationToken);

    var afterBlock = await client.RequestBlockedUsersAsync(
        options.Timeout,
        id: "blocking-list-after-block",
        cancellationToken: cancellationToken);
    if (!afterBlock.Any(jid => string.Equals(jid.Full, blockJid.Full, StringComparison.OrdinalIgnoreCase)
            || string.Equals(jid.Bare, blockJid.Bare, StringComparison.OrdinalIgnoreCase)))
    {
        throw new InvalidOperationException($"XEP-0191 blocklist did not contain {blockJid.Full} after block.");
    }

    Console.WriteLine($"PASS XEP-0191 blocklist contains {blockJid.Full} after block.");
    await client.UnblockUserAsync(
        blockJid,
        options.Timeout,
        id: "blocking-unblock-smoke",
        cancellationToken: cancellationToken);

    var afterUnblock = await client.RequestBlockedUsersAsync(
        options.Timeout,
        id: "blocking-list-after-unblock",
        cancellationToken: cancellationToken);
    if (afterUnblock.Any(jid => string.Equals(jid.Full, blockJid.Full, StringComparison.OrdinalIgnoreCase)
            || string.Equals(jid.Bare, blockJid.Bare, StringComparison.OrdinalIgnoreCase)))
    {
        throw new InvalidOperationException($"XEP-0191 blocklist still contained {blockJid.Full} after unblock.");
    }

    Console.WriteLine($"PASS XEP-0191 unblock removed {blockJid.Full}.");
}

static async Task VerifyUserLocationAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    var tlsUpgrader = new SmokeTlsStreamUpgrader(options.CertificateSha256);
    await using var client = CreateClient(options, options.Account1, tlsUpgrader);

    await client.LoginAsync(
        options.Account1.LocalPart ?? options.Account1.Bare,
        options.Password1,
        cancellationToken: cancellationToken);

    var support = await client.RequestUserLocationSupportAsync(
        options.Timeout,
        id: "location-disco-smoke",
        cancellationToken: cancellationToken);
    Console.WriteLine(
        "INFO XEP-0080 support: "
        + $"pep={support.PersonalEventing}, publish={support.Publish}, auto-create={support.AutoCreate}, "
        + $"retrieve={support.RetrieveItems}, notify={support.Notifications}.");

    if (options.ExpectNoUserLocationSupport)
    {
        if (support.CanPublish || support.CanRetrieve || support.CanNotify)
        {
            throw new InvalidOperationException(
                "Server advertised user-location support while --expect-no-location was set.");
        }

        Console.WriteLine("PASS XEP-0080/PEP not advertised, as expected for this server.");
        return;
    }

    if (!support.CanPublish)
    {
        throw new InvalidOperationException(
            "Server does not advertise enough PEP/PubSub support for XEP-0080 publish. "
            + "Use --expect-no-location when testing a server that is expected not to support it.");
    }

    if (!support.CanRetrieve)
    {
        throw new InvalidOperationException(
            "Server does not advertise enough PEP/PubSub support for XEP-0080 item retrieval.");
    }

    var location = new XmppUserLocationData(
        Latitude: 52.0907m,
        Longitude: 5.1214m,
        Accuracy: 8.5m,
        Locality: "Utrecht",
        Text: "Teletyptel XEP-0080 smoke",
        Timestamp: DateTimeOffset.UtcNow,
        Source: "real-server-smoke");

    await client.PublishUserLocationAsync(
        location,
        options.Timeout,
        id: "location-publish-smoke",
        cancellationToken: cancellationToken);
    Console.WriteLine("PASS XEP-0080 location published.");

    var retrieved = await client.RequestUserLocationAsync(
        XmppAddress.Parse(options.Account1.Bare),
        options.Timeout,
        itemId: XmppUserLocation.CurrentItemId,
        id: "location-read-smoke",
        cancellationToken: cancellationToken);
    if (retrieved is null
        || retrieved.Latitude != location.Latitude
        || retrieved.Longitude != location.Longitude)
    {
        throw new InvalidOperationException("XEP-0080 retrieved location did not match the published coordinates.");
    }

    Console.WriteLine("PASS XEP-0080 location retrieved.");
    await client.ClearUserLocationAsync(
        options.Timeout,
        id: "location-clear-smoke",
        cancellationToken: cancellationToken);

    var cleared = await client.RequestUserLocationAsync(
        XmppAddress.Parse(options.Account1.Bare),
        options.Timeout,
        itemId: XmppUserLocation.CurrentItemId,
        id: "location-read-cleared-smoke",
        cancellationToken: cancellationToken);
    if (cleared is not null && !cleared.IsEmpty)
    {
        throw new InvalidOperationException("XEP-0080 location was not cleared.");
    }

    Console.WriteLine("PASS XEP-0080 location cleared.");
}

static async Task VerifyHttpFileUploadAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    var tlsUpgrader = new SmokeTlsStreamUpgrader(options.CertificateSha256);
    await using var client = CreateClient(options, options.Account1, tlsUpgrader);

    await client.LoginAsync(
        options.Account1.LocalPart ?? options.Account1.Bare,
        options.Password1,
        cancellationToken: cancellationToken);
    await client.SendInitialPresenceAsync(cancellationToken: cancellationToken);

    var uploadService = options.UploadService
        ?? await DiscoverHttpUploadServiceAsync(client, options, cancellationToken);
    var info = await client.RequestServiceDiscoveryInfoAsync(
        uploadService,
        options.Timeout,
        id: "upload-service-info",
        cancellationToken: cancellationToken);
    if (!XmppHttpFileUpload.SupportsHttpUpload(info))
    {
        throw new InvalidOperationException(
            $"Service '{uploadService.Bare}' did not advertise {XmppHttpFileUpload.NamespaceName}.");
    }

    Console.WriteLine($"PASS XEP-0363 upload service discovered: {uploadService.Bare}.");
    var maxFileSize = XmppHttpFileUpload.GetAdvertisedMaxFileSize(info);
    Console.WriteLine(maxFileSize is null
        ? "INFO XEP-0363 max-file-size was not advertised."
        : $"PASS XEP-0363 max-file-size advertised: {maxFileSize.Value} bytes.");

    if (string.IsNullOrWhiteSpace(options.UploadFile))
    {
        Console.WriteLine("SKIP XEP-0363 slot/PUT: pass --upload-file.");
        return;
    }

    var uploadPath = Path.GetFullPath(options.UploadFile);
    if (!File.Exists(uploadPath))
    {
        throw new FileNotFoundException("Upload smoke file was not found.", uploadPath);
    }

    var fileName = Path.GetFileName(uploadPath);
    var contentType = DetectContentType(fileName);
    await using var file = File.OpenRead(uploadPath);
    XmppHttpFileUpload.EnsureRequestAllowed(fileName, file.Length, contentType, maxFileSize);

    var slot = await client.RequestHttpUploadSlotAsync(
        uploadService,
        fileName,
        file.Length,
        options.Timeout,
        contentType,
        XmppHttpUploadPurpose.Message,
        id: "upload-slot-smoke",
        cancellationToken: cancellationToken);
    Console.WriteLine($"PASS XEP-0363 slot received: PUT {slot.PutUrl} GET {slot.GetUrl}.");

    var completion = await XmppHttpFileUpload.UploadAsync(
        slot,
        file,
        file.Length,
        contentType,
        cancellationToken: cancellationToken);
    Console.WriteLine($"PASS XEP-0363 HTTP PUT returned {completion.GetUrl}.");

    var recipient = options.UploadRecipient
        ?? (!string.IsNullOrWhiteSpace(options.Password2) ? options.Account2 : null);
    if (recipient is null)
    {
        Console.WriteLine("SKIP XEP-0363 attachment message: pass --upload-recipient or --account2.");
        return;
    }

    var message = XmppHttpFileUpload.CreateFileMessage(
        recipient,
        completion,
        fileName,
        id: "upload-message-smoke");
    await client.SendChatMessageAsync(message, cancellationToken);
    Console.WriteLine($"PASS XEP-0363 attachment message sent to {recipient.Bare} with XEP-0066 fallback.");
}

static async Task<XmppAddress> DiscoverHttpUploadServiceAsync(
    XmppStreamClient client,
    SmokeOptions options,
    CancellationToken cancellationToken)
{
    var domain = XmppAddress.Parse(options.Account1.DomainPart);

    try
    {
        var domainInfo = await client.RequestServiceDiscoveryInfoAsync(
            domain,
            options.Timeout,
            id: "upload-domain-info",
            cancellationToken: cancellationToken);
        if (XmppHttpFileUpload.SupportsHttpUpload(domainInfo))
        {
            return domain;
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"INFO XEP-0363 domain disco skipped: {ex.Message}");
    }

    var items = await client.RequestServiceDiscoveryItemsAsync(
        domain,
        options.Timeout,
        id: "upload-domain-items",
        cancellationToken: cancellationToken);
    foreach (var item in items.Items)
    {
        if (item.Jid is null)
        {
            continue;
        }

        try
        {
            var info = await client.RequestServiceDiscoveryInfoAsync(
                item.Jid,
                options.Timeout,
                id: "upload-item-info-" + Guid.NewGuid().ToString("N"),
                cancellationToken: cancellationToken);
            if (XmppHttpFileUpload.SupportsHttpUpload(info))
            {
                return item.Jid;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"INFO XEP-0363 item disco skipped for {item.Jid.Bare}: {ex.Message}");
        }
    }

    throw new InvalidOperationException(
        $"No XEP-0363 upload service was discovered below {domain.Bare}; pass --upload-service explicitly if needed.");
}

static async Task VerifySocks5BytestreamProxyAsync(
    SmokeOptions options,
    CancellationToken cancellationToken)
{
    if (string.IsNullOrWhiteSpace(options.Password2))
    {
        throw new InvalidOperationException(
            "SOCKS5 bytestream proxy smoke requires --account2 and --password2 so a real target can connect to the proxy.");
    }

    var tlsUpgrader = new SmokeTlsStreamUpgrader(options.CertificateSha256);
    await using var sender = CreateClient(options, options.Account1, tlsUpgrader);
    await using var receiver = CreateClient(options, options.Account2, tlsUpgrader);

    var senderLogin = await sender.LoginAsync(
        options.Account1.LocalPart ?? options.Account1.Bare,
        options.Password1,
        cancellationToken: cancellationToken);
    var receiverLogin = await receiver.LoginAsync(
        options.Account2.LocalPart ?? options.Account2.Bare,
        options.Password2,
        cancellationToken: cancellationToken);
    await sender.SendInitialPresenceAsync(cancellationToken: cancellationToken);
    await receiver.SendInitialPresenceAsync(cancellationToken: cancellationToken);

    var proxy = options.Socks5Proxy
        ?? await DiscoverSocks5BytestreamProxyAsync(sender, options, cancellationToken);
    var proxyInfo = await sender.RequestServiceDiscoveryInfoAsync(
        proxy,
        options.Timeout,
        id: "s5b-proxy-info",
        cancellationToken: cancellationToken);
    if (!XmppSocks5Bytestreams.IsBytestreamProxy(proxyInfo))
    {
        throw new InvalidOperationException(
            $"Service '{proxy.Bare}' did not advertise XEP-0065 bytestream proxy support.");
    }

    Console.WriteLine($"PASS XEP-0065 bytestream proxy discovered: {proxy.Bare}.");
    var streamHosts = await sender.RequestSocks5ProxyAddressAsync(
        proxy,
        options.Timeout,
        id: "s5b-proxy-address",
        cancellationToken: cancellationToken);
    var usableStreamHosts = streamHosts
        .Where(host => !string.IsNullOrWhiteSpace(host.Host) && host.Port is > 0)
        .ToArray();
    if (usableStreamHosts.Length == 0)
    {
        throw new InvalidOperationException(
            $"Proxy '{proxy.Bare}' did not return a usable streamhost with host and port.");
    }

    foreach (var host in usableStreamHosts)
    {
        Console.WriteLine($"INFO XEP-0065 streamhost: {host.Jid.Full} {host.Host}:{host.Port}");
    }

    var streamId = "teletyptel-s5b-" + Guid.NewGuid().ToString("N");
    var target = receiverLogin.BoundJid;
    var requester = senderLogin.BoundJid;
    var destination = XmppSocks5Bytestreams.ComputeDestinationAddress(streamId, requester, target);
    var payload = Encoding.UTF8.GetBytes("Teletyptel S5B smoke " + DateTimeOffset.UtcNow.ToUnixTimeSeconds());

    var receiverTask = RunSocks5BytestreamTargetAsync(
        receiver,
        requester,
        streamId,
        destination,
        payload.Length,
        options,
        cancellationToken);

    var request = XmppSocks5Bytestreams.CreateBytestreamRequest(
        "s5b-request",
        target,
        streamId,
        usableStreamHosts);
    var result = await sender.SendIqAndWaitAsync(request, options.Timeout, cancellationToken);
    if (!XmppSocks5Bytestreams.TryParseStreamHostUsedResult(result, out var usedStreamHost)
        || usedStreamHost is null)
    {
        throw new InvalidOperationException("The target did not return a valid XEP-0065 streamhost-used result.");
    }

    var selected = usableStreamHosts.FirstOrDefault(host =>
        string.Equals(host.Jid.Full, usedStreamHost.Full, StringComparison.OrdinalIgnoreCase)
        || string.Equals(host.Jid.Bare, usedStreamHost.Bare, StringComparison.OrdinalIgnoreCase));
    if (selected is null)
    {
        throw new InvalidOperationException(
            $"The target selected unknown streamhost '{usedStreamHost.Full}'.");
    }

    Console.WriteLine($"PASS XEP-0065 target selected streamhost {selected.Jid.Full}.");
    await using var senderConnection = await XmppSocks5BytestreamSocket.ConnectAsync(
        selected,
        destination,
        options.Timeout,
        cancellationToken);
    Console.WriteLine("PASS XEP-0065 initiator SOCKS5 CONNECT completed.");

    await sender.ActivateSocks5BytestreamAsync(
        selected.Jid,
        streamId,
        target,
        options.Timeout,
        id: "s5b-activate",
        cancellationToken: cancellationToken);
    Console.WriteLine("PASS XEP-0065 proxy activation accepted.");

    await senderConnection.Stream.WriteAsync(payload, cancellationToken);
    await senderConnection.Stream.FlushAsync(cancellationToken);

    var received = await receiverTask;
    if (!payload.SequenceEqual(received))
    {
        throw new InvalidOperationException("SOCKS5 bytestream payload did not survive the proxy transfer.");
    }

    Console.WriteLine($"PASS XEP-0065 proxied byte transfer completed: {payload.Length} bytes.");
}

static async Task<byte[]> RunSocks5BytestreamTargetAsync(
    XmppStreamClient receiver,
    XmppAddress requester,
    string streamId,
    string destination,
    int payloadLength,
    SmokeOptions options,
    CancellationToken cancellationToken)
{
    while (true)
    {
        var stanza = await receiver.ReadNextStanzaAsync(cancellationToken);
        if (stanza.Iq is null
            || !XmppSocks5Bytestreams.TryParseBytestreamRequest(stanza.Iq, out var request)
            || request is null
            || !string.Equals(request.StreamId, streamId, StringComparison.Ordinal))
        {
            continue;
        }

        var selected = request.StreamHosts.FirstOrDefault(host => host.Port is > 0);
        if (selected is null)
        {
            throw new InvalidOperationException("Received XEP-0065 request did not include a usable streamhost.");
        }

        await using var receiverConnection = await XmppSocks5BytestreamSocket.ConnectAsync(
            selected,
            destination,
            options.Timeout,
            cancellationToken);
        Console.WriteLine("PASS XEP-0065 target SOCKS5 CONNECT completed.");

        var responseTo = stanza.Iq.From ?? requester;
        await receiver.SendIqAsync(
            XmppSocks5Bytestreams.CreateStreamHostUsedResult(
                stanza.Iq.Id,
                responseTo,
                selected.Jid),
            cancellationToken);

        return await ReadExactBytesAsync(receiverConnection.Stream, payloadLength, cancellationToken);
    }
}

static async Task<XmppAddress> DiscoverSocks5BytestreamProxyAsync(
    XmppStreamClient client,
    SmokeOptions options,
    CancellationToken cancellationToken)
{
    var domain = XmppAddress.Parse(options.Account1.DomainPart);

    try
    {
        var domainInfo = await client.RequestServiceDiscoveryInfoAsync(
            domain,
            options.Timeout,
            id: "s5b-domain-info",
            cancellationToken: cancellationToken);
        if (XmppSocks5Bytestreams.IsBytestreamProxy(domainInfo))
        {
            return domain;
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"INFO XEP-0065 domain disco skipped: {ex.Message}");
    }

    var items = await client.RequestServiceDiscoveryItemsAsync(
        domain,
        options.Timeout,
        id: "s5b-domain-items",
        cancellationToken: cancellationToken);
    foreach (var item in items.Items)
    {
        if (item.Jid is null)
        {
            continue;
        }

        try
        {
            var info = await client.RequestServiceDiscoveryInfoAsync(
                item.Jid,
                options.Timeout,
                id: "s5b-item-info-" + Guid.NewGuid().ToString("N"),
                cancellationToken: cancellationToken);
            if (XmppSocks5Bytestreams.IsBytestreamProxy(info))
            {
                return item.Jid;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"INFO XEP-0065 item disco skipped for {item.Jid.Bare}: {ex.Message}");
        }
    }

    throw new InvalidOperationException(
        $"No XEP-0065 bytestream proxy was discovered below {domain.Bare}; pass --socks5-proxy explicitly if needed.");
}

static async Task<byte[]> ReadExactBytesAsync(
    Stream stream,
    int count,
    CancellationToken cancellationToken)
{
    var buffer = new byte[count];
    var offset = 0;
    while (offset < count)
    {
        var read = await stream.ReadAsync(buffer.AsMemory(offset, count - offset), cancellationToken);
        if (read == 0)
        {
            throw new EndOfStreamException("Stream closed before enough bytes were read.");
        }

        offset += read;
    }

    return buffer;
}

static async Task VerifyInBandBytestreamAsync(
    SmokeOptions options,
    CancellationToken cancellationToken)
{
    if (string.IsNullOrWhiteSpace(options.Password2))
    {
        throw new InvalidOperationException(
            "In-Band Bytestream fallback smoke requires --account2 and --password2 so a real target can accept the transfer.");
    }

    var tlsUpgrader = new SmokeTlsStreamUpgrader(options.CertificateSha256);
    await using var sender = CreateClient(options, options.Account1, tlsUpgrader);
    await using var receiver = CreateClient(options, options.Account2, tlsUpgrader);

    var senderLogin = await sender.LoginAsync(
        options.Account1.LocalPart ?? options.Account1.Bare,
        options.Password1,
        cancellationToken: cancellationToken);
    var receiverLogin = await receiver.LoginAsync(
        options.Account2.LocalPart ?? options.Account2.Bare,
        options.Password2,
        cancellationToken: cancellationToken);
    await sender.SendInitialPresenceAsync(cancellationToken: cancellationToken);
    await receiver.SendInitialPresenceAsync(cancellationToken: cancellationToken);

    var sessionId = "teletyptel-ibb-" + Guid.NewGuid().ToString("N");
    const int blockSize = 16;
    var payload = Encoding.UTF8.GetBytes("Teletyptel IBB fallback " + DateTimeOffset.UtcNow.ToUnixTimeSeconds());
    var receiverTask = RunInBandBytestreamTargetAsync(
        receiver,
        senderLogin.BoundJid,
        sessionId,
        payload.Length,
        options,
        cancellationToken);

    var targetInfo = await sender.RequestServiceDiscoveryInfoAsync(
        receiverLogin.BoundJid,
        options.Timeout,
        id: "ibb-target-info",
        cancellationToken: cancellationToken);
    if (XmppInBandBytestreams.SupportsInBandBytestreams(targetInfo))
    {
        Console.WriteLine($"PASS XEP-0047 advertised by {receiverLogin.BoundJid.Full}.");
    }
    else
    {
        Console.WriteLine($"INFO XEP-0047 was not advertised by {receiverLogin.BoundJid.Full}; continuing with direct IQ fallback smoke.");
    }

    await sender.OpenInBandBytestreamAsync(
        receiverLogin.BoundJid,
        sessionId,
        blockSize,
        options.Timeout,
        id: "ibb-open-smoke",
        cancellationToken: cancellationToken);
    Console.WriteLine("PASS XEP-0047 IBB open accepted.");

    ushort sequence = 0;
    foreach (var chunk in ChunkBytes(payload, blockSize))
    {
        await sender.SendInBandBytestreamDataAsync(
            receiverLogin.BoundJid,
            sessionId,
            sequence,
            chunk,
            options.Timeout,
            blockSize,
            id: "ibb-data-smoke-" + sequence.ToString(CultureInfo.InvariantCulture),
            cancellationToken: cancellationToken);
        sequence++;
    }

    await sender.CloseInBandBytestreamAsync(
        receiverLogin.BoundJid,
        sessionId,
        options.Timeout,
        id: "ibb-close-smoke",
        cancellationToken: cancellationToken);
    Console.WriteLine($"PASS XEP-0047 IBB close accepted after {sequence} chunk(s).");

    var received = await receiverTask;
    if (!payload.SequenceEqual(received))
    {
        throw new InvalidOperationException("IBB fallback payload did not survive the IQ transfer.");
    }

    Console.WriteLine($"PASS XEP-0047 IBB byte transfer completed: {payload.Length} bytes.");
}

static async Task<byte[]> RunInBandBytestreamTargetAsync(
    XmppStreamClient receiver,
    XmppAddress requester,
    string sessionId,
    int expectedLength,
    SmokeOptions options,
    CancellationToken cancellationToken)
{
    var opened = false;
    ushort expectedSequence = 0;
    using var received = new MemoryStream();
    while (true)
    {
        var stanza = await receiver.ReadNextStanzaAsync(cancellationToken);
        if (stanza.Iq is null)
        {
            continue;
        }

        var responseTo = stanza.Iq.From ?? requester;
        if (IsServiceDiscoveryInfoRequest(stanza.Iq))
        {
            await receiver.SendIqAsync(
                CreateSmokeClientDiscoveryInfoResult(stanza.Iq.Id, responseTo),
                cancellationToken);
            continue;
        }

        if (!opened
            && XmppInBandBytestreams.TryParseOpenRequest(stanza.Iq, out var open)
            && open is not null
            && string.Equals(open.SessionId, sessionId, StringComparison.Ordinal))
        {
            opened = true;
            await receiver.SendIqAsync(new XmppIq(XmppIqType.Result, stanza.Iq.Id, To: responseTo), cancellationToken);
            continue;
        }

        if (opened
            && XmppInBandBytestreams.TryParseDataIq(stanza.Iq, out var data)
            && data is not null
            && string.Equals(data.SessionId, sessionId, StringComparison.Ordinal))
        {
            if (data.Sequence != expectedSequence)
            {
                throw new InvalidOperationException(
                    $"IBB sequence mismatch: expected {expectedSequence}, got {data.Sequence}.");
            }

            await received.WriteAsync(data.Bytes, cancellationToken);
            expectedSequence++;
            await receiver.SendIqAsync(new XmppIq(XmppIqType.Result, stanza.Iq.Id, To: responseTo), cancellationToken);
            continue;
        }

        if (opened
            && XmppInBandBytestreams.TryParseCloseRequest(stanza.Iq, out var close)
            && close is not null
            && string.Equals(close.SessionId, sessionId, StringComparison.Ordinal))
        {
            await receiver.SendIqAsync(new XmppIq(XmppIqType.Result, stanza.Iq.Id, To: responseTo), cancellationToken);
            if (received.Length != expectedLength)
            {
                throw new InvalidOperationException(
                    $"IBB received {received.Length} byte(s), expected {expectedLength}.");
            }

            return received.ToArray();
        }
    }
}

static bool IsServiceDiscoveryInfoRequest(XmppIq iq)
{
    return iq.Type == XmppIqType.Get
        && iq.Payload?.Name == XName.Get("query", XmppServiceDiscovery.InfoNamespace);
}

static XmppIq CreateSmokeClientDiscoveryInfoResult(string id, XmppAddress to)
{
    var query = new XElement(XName.Get("query", XmppServiceDiscovery.InfoNamespace),
        new XElement(XName.Get("identity", XmppServiceDiscovery.InfoNamespace),
            new XAttribute("category", "client"),
            new XAttribute("type", "bot"),
            new XAttribute("name", "Teletyptel smoke target")),
        new XElement(XName.Get("feature", XmppServiceDiscovery.InfoNamespace),
            new XAttribute("var", XmppServiceDiscovery.InfoNamespace)),
        new XElement(XName.Get("feature", XmppServiceDiscovery.InfoNamespace),
            new XAttribute("var", XmppInBandBytestreams.NamespaceName)));

    return new XmppIq(XmppIqType.Result, id, query, To: to);
}

static IEnumerable<byte[]> ChunkBytes(byte[] payload, int blockSize)
{
    for (var offset = 0; offset < payload.Length; offset += blockSize)
    {
        var count = Math.Min(blockSize, payload.Length - offset);
        var chunk = new byte[count];
        Array.Copy(payload, offset, chunk, 0, count);
        yield return chunk;
    }
}

static string DetectContentType(string fileName)
{
    var extension = Path.GetExtension(fileName).ToLowerInvariant();
    return extension switch
    {
        ".txt" or ".log" or ".md" => "text/plain",
        ".html" or ".htm" => "text/html",
        ".json" => "application/json",
        ".xml" => "application/xml",
        ".pdf" => "application/pdf",
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".svg" => "image/svg+xml",
        ".mp3" => "audio/mpeg",
        ".wav" => "audio/wav",
        ".mp4" => "video/mp4",
        ".zip" => "application/zip",
        _ => "application/octet-stream"
    };
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

    var registrationQuery = infoIq.Payload;
    var hasDataForm = registrationQuery
        ?.Descendants(XName.Get("x", XmppServiceDiscovery.DataFormNamespace))
        .Any() == true;
    string request;
    if (hasDataForm)
    {
        if (!options.RegistrationPrompt)
        {
            throw new InvalidOperationException(
                "Registration requires a jabber:x:data form. Re-run with --registration-prompt to answer required fields such as CAPTCHA.");
        }

        PrintRegistrationInfoDetails(account, info, infoIq);
        var values = PromptForRegistrationFormValues(registrationQuery!, account.LocalPart, password);
        request = XmppInBandRegistration.CreateDataFormRegistrationRequest(
            "reg-1",
            registrationQuery!,
            values,
            XmppAddress.Parse(account.DomainPart)).ToXml().ToString(SaveOptions.DisableFormatting);
    }
    else
    {
        request = XmppInBandRegistration.CreateSimpleRegistrationRequest(
            "reg-1",
            account.LocalPart,
            password,
            XmppAddress.Parse(account.DomainPart),
            info?.Key).ToXml().ToString(SaveOptions.DisableFormatting);
    }

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

static async Task PrintRegistrationInfoAsync(
    SmokeOptions options,
    XmppAddress account,
    CancellationToken cancellationToken)
{
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

    PrintRegistrationInfoDetails(account, info, infoIq);
}

static void PrintRegistrationInfoDetails(XmppAddress account, XmppRegistrationInfo info, XmppIq infoIq)
{
    Console.WriteLine($"PASS XEP-0077 registration info returned for {account.DomainPart}.");
    Console.WriteLine("  Registered: " + (info.Registered ? "yes" : "no"));
    Console.WriteLine("  Fields: " + (info.Fields.Count == 0 ? "(none)" : string.Join(", ", info.Fields)));
    if (!string.IsNullOrWhiteSpace(info.Instructions))
    {
        Console.WriteLine("  Instructions: " + info.Instructions.Trim());
    }

    Console.WriteLine("  Key: " + (string.IsNullOrWhiteSpace(info.Key) ? "(none)" : "(present)"));

    if (infoIq.Payload is not null)
    {
        var dataForms = infoIq.Payload
            .Descendants(XName.Get("x", XmppServiceDiscovery.DataFormNamespace))
            .ToList();
        if (dataForms.Count > 0)
        {
            Console.WriteLine($"  Data forms: {dataForms.Count}");
            foreach (var form in dataForms)
            {
                foreach (var field in form.Elements(XName.Get("field", XmppServiceDiscovery.DataFormNamespace)))
                {
                    var variable = field.Attribute("var")?.Value ?? "(no var)";
                    var type = field.Attribute("type")?.Value ?? "text-single";
                    var label = field.Attribute("label")?.Value;
                    var required = field.Element(XName.Get("required", XmppServiceDiscovery.DataFormNamespace)) is not null
                        ? " required"
                        : string.Empty;
                    Console.WriteLine($"    {variable} [{type}{required}]" + (string.IsNullOrWhiteSpace(label) ? string.Empty : $" - {label}"));
                    var values = field.Elements(XName.Get("value", XmppServiceDiscovery.DataFormNamespace))
                        .Select(value => value.Value)
                        .Where(value => !string.IsNullOrWhiteSpace(value))
                        .ToList();
                    if (values.Count > 0
                        && (string.Equals(type, "fixed", StringComparison.OrdinalIgnoreCase)
                            || variable.Contains("url", StringComparison.OrdinalIgnoreCase)
                            || variable.Contains("captcha", StringComparison.OrdinalIgnoreCase)))
                    {
                        foreach (var value in values)
                        {
                            Console.WriteLine("      value: " + value);
                        }
                    }
                }
            }
        }

        var captchaElements = infoIq.Payload
            .Descendants()
            .Where(element => element.Name.NamespaceName.Contains("captcha", StringComparison.OrdinalIgnoreCase))
            .Select(element => element.Name.ToString())
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (captchaElements.Count > 0)
        {
            Console.WriteLine("  CAPTCHA: advertised (" + string.Join(", ", captchaElements) + ")");
        }
    }
}

static IReadOnlyDictionary<string, string> PromptForRegistrationFormValues(
    XElement registrationQuery,
    string username,
    string password)
{
    var values = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["username"] = username,
        ["password"] = password
    };
    foreach (var form in registrationQuery.Descendants(XName.Get("x", XmppServiceDiscovery.DataFormNamespace)))
    {
        foreach (var field in form.Elements(XName.Get("field", XmppServiceDiscovery.DataFormNamespace)))
        {
            var variable = field.Attribute("var")?.Value;
            if (string.IsNullOrWhiteSpace(variable) || values.ContainsKey(variable))
            {
                continue;
            }

            var type = field.Attribute("type")?.Value;
            if (string.Equals(type, "hidden", StringComparison.OrdinalIgnoreCase)
                || string.Equals(type, "fixed", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var required = field.Element(XName.Get("required", XmppServiceDiscovery.DataFormNamespace)) is not null;
            if (!required)
            {
                continue;
            }

            var label = field.Attribute("label")?.Value;
            var prompt = string.IsNullOrWhiteSpace(label)
                ? variable
                : $"{label} ({variable})";
            Console.Write(prompt + ": ");
            var value = Console.ReadLine();
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new InvalidOperationException($"Registration field '{variable}' is required.");
            }

            values[variable] = value.Trim();
        }
    }

    return values;
}

static async Task PrintServiceContactAddressesAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    try
    {
        var tlsUpgrader = new SmokeTlsStreamUpgrader(options.CertificateSha256);
        await using var client = CreateClient(options, options.Account1, tlsUpgrader);
        await client.LoginAsync(
            options.Account1.LocalPart ?? options.Account1.Bare,
            options.Password1,
            cancellationToken: cancellationToken);

        var domain = XmppAddress.Parse(options.Account1.DomainPart);
        var info = await client.RequestServiceDiscoveryInfoAsync(
            domain,
            options.Timeout,
            id: "server-contact-info",
            cancellationToken: cancellationToken);

        if (!XmppServiceContactAddresses.TryGetContactAddresses(info, out var addresses))
        {
            Console.WriteLine($"SKIP XEP-0157 contact addresses: {domain.Bare} did not advertise serverinfo contacts.");
            return;
        }

        Console.WriteLine($"PASS XEP-0157 contact addresses discovered: {addresses.Count} URI(s).");
        foreach (var group in addresses.GroupBy(address => address.Kind).OrderBy(group => group.Key))
        {
            var values = string.Join(", ", group.Select(address => address.Uri.OriginalString));
            Console.WriteLine($"  {group.Key}: {values}");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"SKIP XEP-0157 contact addresses: {ex.Message}");
    }
}

static async Task VerifyTlsCertificateAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    await using var stream = await OpenTlsStreamAsync(options, options.Account1.DomainPart, cancellationToken);
    await stream.WriteAsync(Encoding.UTF8.GetBytes(" "), cancellationToken);
}

static async Task VerifyHostnameRejectionAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    try
    {
        await using var stream = await OpenTlsStreamAsync(
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

static async Task<SslStream> OpenTlsStreamAsync(
    SmokeOptions options,
    string validationHost,
    CancellationToken cancellationToken,
    bool allowCertificatePin = true)
{
    return options.DirectTls
        ? await DirectTlsAsync(options, validationHost, cancellationToken, allowCertificatePin)
        : await StartTlsAsync(options, validationHost, cancellationToken, allowCertificatePin);
}

static async Task<SslStream> DirectTlsAsync(
    SmokeOptions options,
    string validationHost,
    CancellationToken cancellationToken,
    bool allowCertificatePin = true)
{
    var client = new TcpClient();
    await client.ConnectAsync(options.Host, options.Port, cancellationToken);
    var networkStream = client.GetStream();
    var sslStream = new SslStream(networkStream, leaveInnerStreamOpen: false);
    await sslStream.AuthenticateAsClientAsync(
        CreateTlsClientOptions(options, validationHost, allowCertificatePin, directTls: true),
        cancellationToken);
    return sslStream;
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
    return options.DirectTls
        ? await DirectTlsAndOpenRegistrationStreamAsync(options, domain, cancellationToken)
        : await StartTlsAndOpenRegistrationStreamAsync(options, domain, cancellationToken);
}

static async Task<SslStream> DirectTlsAndOpenRegistrationStreamAsync(
    SmokeOptions options,
    string domain,
    CancellationToken cancellationToken)
{
    var sslStream = await DirectTlsAsync(options, domain, cancellationToken);
    var buffer = new byte[16384];
    await WriteTextAsync(sslStream, CreateOpenStreamWithoutFrom(domain), cancellationToken);
    await ReadUntilAsync(sslStream, buffer, "</stream:features>", cancellationToken);
    return sslStream;
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
    await sslStream.AuthenticateAsClientAsync(CreateTlsClientOptions(options, domain), cancellationToken);
    await WriteTextAsync(sslStream, CreateOpenStreamWithoutFrom(domain), cancellationToken);
    await ReadUntilAsync(sslStream, buffer, "</stream:features>", cancellationToken);
    return sslStream;
}

static async Task VerifyMessageArchiveAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    if (string.IsNullOrEmpty(options.Password2))
    {
        throw new InvalidOperationException(
            "Message archive smoke requires --account2 and --password2 so a unique chat message can be archived.");
    }

    var tlsUpgrader = new SmokeTlsStreamUpgrader(options.CertificateSha256);
    await using var sender = CreateClient(options, options.Account1, tlsUpgrader);
    await using var receiver = CreateClient(options, options.Account2, tlsUpgrader);

    await sender.LoginAsync(
        options.Account1.LocalPart ?? options.Account1.Bare,
        options.Password1,
        cancellationToken: cancellationToken);
    await receiver.LoginAsync(
        options.Account2.LocalPart ?? options.Account2.Bare,
        options.Password2,
        cancellationToken: cancellationToken);
    await sender.SendInitialPresenceAsync(cancellationToken: cancellationToken);
    await receiver.SendInitialPresenceAsync(cancellationToken: cancellationToken);

    var archiveOwner = XmppAddress.Parse(options.Account2.Bare);
    var archiveDomain = XmppAddress.Parse(options.Account2.DomainPart);
    var advertisesMam = await SupportsMessageArchiveAsync(receiver, archiveDomain, options, cancellationToken)
        || await SupportsMessageArchiveAsync(receiver, archiveOwner, options, cancellationToken);
    if (!advertisesMam)
    {
        throw new InvalidOperationException(
            $"{archiveDomain.Bare} / {archiveOwner.Bare} did not advertise {XmppMessageArchive.NamespaceName}.");
    }

    Console.WriteLine($"PASS XEP-0313 advertised for {archiveOwner.Bare}.");

    var senderBare = XmppAddress.Parse(options.Account1.Bare);
    var text = "Teletyptel MAM smoke " + Guid.NewGuid().ToString("N");
    await sender.SendChatMessageAsync(
        new XmppChatMessage(archiveOwner, text, Id: "mam-seed-" + Guid.NewGuid().ToString("N")),
        cancellationToken);
    await WaitForChatBodyAsync(receiver, text, cancellationToken);
    Console.WriteLine("PASS XEP-0313 seed chat delivered before archive query.");

    var queryStart = DateTimeOffset.UtcNow.AddMinutes(-10);
    var archived = await QueryArchiveForBodyWithRetryAsync(
        receiver,
        to: null,
        with: senderBare,
        body: text,
        start: queryStart,
        options: options,
        cancellationToken: cancellationToken)
        ?? await QueryArchiveForBodyWithRetryAsync(
            receiver,
            to: null,
            with: null,
            body: text,
            start: queryStart,
            options: options,
            cancellationToken: cancellationToken)
        ?? await QueryArchiveForBodyWithRetryAsync(
            sender,
            to: null,
            with: archiveOwner,
            body: text,
            start: queryStart,
            options: options,
            cancellationToken: cancellationToken)
        ?? await QueryArchiveForBodyWithRetryAsync(
            sender,
            to: null,
            with: null,
            body: text,
            start: queryStart,
            options: options,
            cancellationToken: cancellationToken);

    if (archived is null)
    {
        throw new InvalidOperationException(
            "XEP-0313 archive query completed but neither receiver nor sender archive returned the seeded message.");
    }

    Console.WriteLine(
        $"PASS XEP-0313 archived one-to-one message returned id={DescribeArchiveId(archived.Id)}, "
        + $"stamp={archived.DelayStamp?.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture) ?? "-"}.");
}

static async Task VerifyMucMessageArchiveAsync(
    XmppStreamClient client,
    XmppAddress room,
    string expectedBody,
    SmokeOptions options,
    CancellationToken cancellationToken)
{
    if (!await SupportsMessageArchiveAsync(client, room, options, cancellationToken))
    {
        throw new InvalidOperationException(
            $"{room.Bare} did not advertise {XmppMessageArchive.NamespaceName} for room archive queries.");
    }

    Console.WriteLine($"PASS XEP-0313 advertised by MUC room {room.Bare}.");

    var archived = await QueryArchiveForBodyWithRetryAsync(
        client,
        to: room,
        with: null,
        body: expectedBody,
        start: DateTimeOffset.UtcNow.AddMinutes(-10),
        options: options,
        cancellationToken: cancellationToken);
    if (archived is null)
    {
        throw new InvalidOperationException("XEP-0313 MUC archive query completed but did not return the groupchat message.");
    }

    Console.WriteLine(
        $"PASS XEP-0313 MUC archive returned id={DescribeArchiveId(archived.Id)}, "
        + $"stamp={archived.DelayStamp?.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture) ?? "-"}.");
}

static async Task<bool> SupportsMessageArchiveAsync(
    XmppStreamClient client,
    XmppAddress target,
    SmokeOptions options,
    CancellationToken cancellationToken)
{
    try
    {
        var info = await client.RequestServiceDiscoveryInfoAsync(
            target,
            options.Timeout,
            id: "mam-info-" + Guid.NewGuid().ToString("N"),
            cancellationToken: cancellationToken);
        return info.Supports(XmppMessageArchive.NamespaceName);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"INFO XEP-0313 disco for {target.Bare} skipped: {ex.Message}");
        return false;
    }
}

static async Task WaitForChatBodyAsync(
    XmppStreamClient client,
    string body,
    CancellationToken cancellationToken)
{
    while (true)
    {
        var stanza = await client.ReadNextStanzaAsync(cancellationToken);
        if (stanza.Message is not null
            && string.Equals(stanza.Message.Body, body, StringComparison.Ordinal))
        {
            return;
        }

        if (stanza.Element.Name == XName.Get("message", "jabber:client")
            && string.Equals(
                stanza.Element.Element(XName.Get("body", "jabber:client"))?.Value,
                body,
                StringComparison.Ordinal))
        {
            return;
        }
    }
}

static async Task<XmppChatMessage> WaitForChatMessageAsync(
    XmppStreamClient client,
    Func<XmppChatMessage, bool> matches,
    string description,
    CancellationToken cancellationToken)
{
    while (true)
    {
        var stanza = await client.ReadNextStanzaAsync(cancellationToken);
        if (stanza.Message is not null && matches(stanza.Message))
        {
            return stanza.Message;
        }

        if (stanza.Element.Name == XName.Get("message", "jabber:client")
            && XmppChatMessage.TryParse(stanza.Element, out var message)
            && message is not null
            && matches(message))
        {
            return message;
        }

        if (stanza.Element.Name == XName.Get("message", "jabber:client")
            && string.Equals((string?)stanza.Element.Attribute("type"), "error", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"Server returned an error while waiting for {description}: {stanza.Element}");
        }
    }
}

static async Task<XmppArchiveSmokeMatch?> QueryArchiveForBodyWithRetryAsync(
    XmppStreamClient client,
    XmppAddress? to,
    XmppAddress? with,
    string body,
    DateTimeOffset start,
    SmokeOptions options,
    CancellationToken cancellationToken)
{
    for (var attempt = 1; attempt <= 8; attempt++)
    {
        var archived = await QueryArchiveForBodyAsync(
            client,
            to,
            with,
            body,
            start,
            options,
            cancellationToken);
        if (archived is not null)
        {
            return archived;
        }

        if (attempt < 8)
        {
            await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
        }
    }

    return null;
}

static async Task<XmppArchiveSmokeMatch?> QueryArchiveForBodyAsync(
    XmppStreamClient client,
    XmppAddress? to,
    XmppAddress? with,
    string body,
    DateTimeOffset start,
    SmokeOptions options,
    CancellationToken cancellationToken)
{
    using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
    timeoutSource.CancelAfter(options.Timeout);

    var id = "mam-smoke-" + Guid.NewGuid().ToString("N");
    var queryId = "mamq-" + Guid.NewGuid().ToString("N");
    var iq = XmppMessageArchive.CreateQuery(
        id,
        new XmppArchiveQueryOptions(
            Start: start,
            End: DateTimeOffset.UtcNow.AddMinutes(1),
            With: with,
            Max: 50),
        queryId);
    if (to is not null)
    {
        iq = iq with { To = to };
    }

    await client.SendIqAsync(iq, cancellationToken);

    XmppArchiveSmokeMatch? match = null;
    while (true)
    {
        var stanza = await client.ReadNextStanzaAsync(timeoutSource.Token);
        if (stanza.Element.Name == XName.Get("message", "jabber:client")
            && XmppMessageArchive.TryParseResult(stanza.Element, out var archived)
            && archived is not null
            && (archived.QueryId is null || string.Equals(archived.QueryId, queryId, StringComparison.Ordinal))
            && string.Equals(archived.Message.Body, body, StringComparison.Ordinal))
        {
            match = new XmppArchiveSmokeMatch(archived.Id, archived.DelayStamp);
            continue;
        }

        if (stanza.Element.Name == XName.Get("message", "jabber:client")
            && XmppMessageArchive.TryParseGroupResult(stanza.Element, out var archivedGroup)
            && archivedGroup is not null
            && (archivedGroup.QueryId is null || string.Equals(archivedGroup.QueryId, queryId, StringComparison.Ordinal))
            && string.Equals(archivedGroup.Message.Body, body, StringComparison.Ordinal))
        {
            match = new XmppArchiveSmokeMatch(archivedGroup.Id, archivedGroup.DelayStamp);
            continue;
        }

        if (stanza.Iq is null || !string.Equals(stanza.Iq.Id, id, StringComparison.Ordinal))
        {
            continue;
        }

        if (stanza.Iq.Type == XmppIqType.Error)
        {
            throw new InvalidOperationException("XEP-0313 query failed: " + stanza.Iq.ToXml());
        }

        if (!XmppMessageArchive.TryParseFin(stanza.Iq, out _, out _))
        {
            throw new InvalidOperationException("XEP-0313 query result did not contain a MAM fin element.");
        }

        return match;
    }
}

static string DescribeArchiveId(string id)
{
    return string.IsNullOrWhiteSpace(id) ? "(none)" : id;
}

static async Task VerifyTwoAccountChatAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    var tlsUpgrader = new SmokeTlsStreamUpgrader(options.CertificateSha256);
    await using var sender = CreateClient(options, options.Account1, tlsUpgrader);
    await using var receiver = CreateClient(options, options.Account2, tlsUpgrader);

    await sender.LoginAsync(options.Account1.LocalPart ?? options.Account1.Bare, options.Password1, cancellationToken: cancellationToken);
    await receiver.LoginAsync(options.Account2.LocalPart ?? options.Account2.Bare, options.Password2!, cancellationToken: cancellationToken);
    await sender.SendInitialPresenceAsync(cancellationToken: cancellationToken);
    await receiver.SendInitialPresenceAsync(cancellationToken: cancellationToken);

    var text = "Teletyptel smoke " + DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    await sender.SendChatMessageAsync(new XmppChatMessage(XmppAddress.Parse(options.Account2.Bare), text), cancellationToken);
    if (!string.IsNullOrWhiteSpace(options.Account2.ResourcePart))
    {
        await sender.SendChatMessageAsync(new XmppChatMessage(options.Account2, text), cancellationToken);
    }

    while (true)
    {
        var stanza = await receiver.ReadNextStanzaAsync(cancellationToken);
        if (stanza.Element.Name == XName.Get("message", "jabber:client")
            && stanza.Element.Element(XName.Get("body", "jabber:client"))?.Value == text)
        {
            return;
        }
    }
}

static async Task VerifyMessageCorrectionAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    if (string.IsNullOrEmpty(options.Password2))
    {
        throw new InvalidOperationException(
            "Message correction smoke requires --account2 and --password2 so the correction can be received by another account.");
    }

    var tlsUpgrader = new SmokeTlsStreamUpgrader(options.CertificateSha256);
    await using var sender = CreateClient(options, options.Account1, tlsUpgrader);
    await using var receiver = CreateClient(options, options.Account2, tlsUpgrader);

    await sender.LoginAsync(options.Account1.LocalPart ?? options.Account1.Bare, options.Password1, cancellationToken: cancellationToken);
    await receiver.LoginAsync(options.Account2.LocalPart ?? options.Account2.Bare, options.Password2, cancellationToken: cancellationToken);
    await sender.SendInitialPresenceAsync(cancellationToken: cancellationToken);
    await receiver.SendInitialPresenceAsync(cancellationToken: cancellationToken);

    var recipient = XmppAddress.Parse(options.Account2.Bare);
    var originalId = "xep0308-original-" + Guid.NewGuid().ToString("N");
    var correctionId = "xep0308-edit-" + Guid.NewGuid().ToString("N");
    var originalBody = "Teletyptel correction original " + Guid.NewGuid().ToString("N");
    var correctedBody = "Teletyptel correction edited " + Guid.NewGuid().ToString("N");

    await sender.SendChatMessageAsync(
        new XmppChatMessage(recipient, originalBody, Id: originalId),
        cancellationToken);
    var original = await WaitForChatMessageAsync(
        receiver,
        message => string.Equals(message.Body, originalBody, StringComparison.Ordinal)
            && string.IsNullOrWhiteSpace(message.ReplaceId),
        "original XEP-0308 seed message",
        cancellationToken);
    Console.WriteLine($"PASS XEP-0308 original delivered id={original.Id ?? originalId}.");

    await sender.SendMessageCorrectionAsync(
        recipient,
        correctedBody,
        originalId,
        id: correctionId,
        cancellationToken: cancellationToken);
    var correction = await WaitForChatMessageAsync(
        receiver,
        message => string.Equals(message.Body, correctedBody, StringComparison.Ordinal)
            && string.Equals(message.ReplaceId, originalId, StringComparison.Ordinal),
        "XEP-0308 correction message",
        cancellationToken);
    Console.WriteLine($"PASS XEP-0308 correction delivered id={correction.Id ?? correctionId}, replace={correction.ReplaceId}.");
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

    await using var receiver = CreateClient(options, options.Account2, tlsUpgrader);
    await receiver.LoginAsync(
        options.Account2.LocalPart ?? options.Account2.Bare,
        options.Password2,
        cancellationToken: cancellationToken);
    await receiver.SendInitialPresenceAsync(cancellationToken: cancellationToken);

    var nick1 = options.MucNick1 ?? DefaultNick(options.Account1, "teletyptel-a");
    var nick2 = options.MucNick2 ?? DefaultNick(options.Account2, "teletyptel-b");

    await sender.SendMultiUserChatJoinAsync(options.MucRoom, nick1, historyMaxChars: 0, cancellationToken: cancellationToken);
    var roomWasCreated = await WaitForMucSelfPresenceAsync(sender, options.MucRoom, nick1, cancellationToken);
    if (roomWasCreated)
    {
        var form = await sender.RequestMultiUserChatConfigurationFormAsync(
            options.MucRoom,
            options.Timeout,
            id: "muc-new-room-config",
            cancellationToken: cancellationToken);
        var fields = CreateOpenMucRoomConfigurationFields(
            form,
            options.MucRoom,
            enableArchiving: options.MucMamSmoke);
        await sender.SubmitMultiUserChatConfigurationAsync(
            options.MucRoom,
            fields,
            options.Timeout,
            id: "muc-open-room",
            cancellationToken: cancellationToken);
        Console.WriteLine($"PASS MUC open room configuration submitted with {fields.Count} field(s).");
    }

    await receiver.SendMultiUserChatJoinAsync(options.MucRoom, nick2, historyMaxChars: 0, cancellationToken: cancellationToken);
    await WaitForMucSelfPresenceAsync(receiver, options.MucRoom, nick2, cancellationToken);
    Console.WriteLine($"PASS Two accounts joined {options.MucRoom.Bare} as {nick1} and {nick2}.");

    var roomItems = await sender.RequestMultiUserChatRoomItemsAsync(
        options.MucRoom,
        options.Timeout,
        id: "muc-room-items",
        cancellationToken: cancellationToken);
    Console.WriteLine($"PASS MUC room item discovery returned {roomItems.Count} item(s).");

    var text = "Teletyptel MUC smoke " + DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    await sender.SendMultiUserChatMessageAsync(
        options.MucRoom,
        text,
        id: "muc-smoke-message",
        cancellationToken: cancellationToken);
    var group = await WaitForMucGroupMessageAsync(receiver, options.MucRoom, text, nick1, cancellationToken);
    Console.WriteLine($"PASS MUC groupchat delivered from {group.From?.Full ?? group.Nickname ?? "unknown"}.");

    if (options.MucMamSmoke)
    {
        await VerifyMucMessageArchiveAsync(sender, options.MucRoom, text, options, cancellationToken);
        Console.WriteLine("PASS MUC message archive smoke completed.");
    }
    else
    {
        Console.WriteLine("SKIP MUC message archive: pass --muc-mam-smoke.");
    }

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
        account.ResourcePart ?? XmppStreamOptions.Default.Resource,
        options.Timeout,
        XmppStreamOptions.Default.KeepAliveInterval);
    return new XmppStreamClient(
        new XmppConnectionSettings(
            account,
            options.Host,
            options.Port,
            requireTls: true,
            directTls: options.DirectTls,
            tlsServerName: account.DomainPart),
        clientOptions,
        tlsUpgrader);
}

static bool IsMultiUserChatService(XmppServiceDiscoveryInfo info)
{
    return info.Supports(XmppMultiUserChat.NamespaceName)
        || info.Identities.Any(identity =>
            string.Equals(identity.Category, "conference", StringComparison.OrdinalIgnoreCase));
}

static IReadOnlyList<XmppDataFormSubmitField> CreateOpenMucRoomConfigurationFields(
    XmppDataForm form,
    XmppAddress room,
    bool enableArchiving = false)
{
    var fields = form.Fields.ToDictionary(
        pair => pair.Key,
        pair => pair.Value,
        StringComparer.Ordinal);

    if (!fields.ContainsKey("FORM_TYPE"))
    {
        fields["FORM_TYPE"] = ["http://jabber.org/protocol/muc#roomconfig"];
    }
    else
    {
        fields["FORM_TYPE"] = [form.FormType ?? "http://jabber.org/protocol/muc#roomconfig"];
    }

    SetIfPresent(fields, "muc#roomconfig_roomname", room.LocalPart ?? room.Bare);
    SetIfPresent(fields, "muc#roomconfig_roomdesc", "Teletyptel public MUC smoke room");
    SetBooleanIfPresent(fields, "muc#roomconfig_publicroom", true);
    SetBooleanIfPresent(fields, "muc#roomconfig_membersonly", false);
    SetBooleanIfPresent(fields, "muc#roomconfig_moderatedroom", false);
    SetBooleanIfPresent(fields, "muc#roomconfig_passwordprotectedroom", false);
    SetBooleanIfPresent(fields, "muc#roomconfig_persistentroom", enableArchiving);
    SetBooleanIfPresent(fields, "muc#roomconfig_allowinvites", true);
    SetBooleanIfPresent(fields, "muc#roomconfig_changesubject", true);
    SetBooleanIfPresent(fields, "muc#roomconfig_enablelogging", enableArchiving);
    SetBooleanIfPresent(fields, "muc#roomconfig_enablearchiving", enableArchiving);
    SetBooleanIfPresent(fields, "muc#roomconfig_mam", enableArchiving);
    SetIfPresent(fields, "muc#roomconfig_whois", "anyone");
    SetIfPresent(fields, "muc#roomconfig_allowpm", "anyone");
    if (fields.ContainsKey("muc#roomconfig_roomsecret"))
    {
        fields["muc#roomconfig_roomsecret"] = [];
    }

    return fields
        .Select(pair => new XmppDataFormSubmitField(pair.Key, pair.Value))
        .ToArray();
}

static void SetIfPresent(
    IDictionary<string, IReadOnlyList<string>> fields,
    string name,
    params string[] values)
{
    if (fields.ContainsKey(name))
    {
        fields[name] = values;
    }
}

static void SetBooleanIfPresent(
    IDictionary<string, IReadOnlyList<string>> fields,
    string name,
    bool value)
{
    if (fields.TryGetValue(name, out var currentValues))
    {
        fields[name] = [SelectBooleanDataFormValue(currentValues, value)];
    }
}

static string SelectBooleanDataFormValue(IReadOnlyList<string> currentValues, bool value)
{
    return currentValues.Any(current =>
        string.Equals(current, "true", StringComparison.OrdinalIgnoreCase)
        || string.Equals(current, "false", StringComparison.OrdinalIgnoreCase))
            ? value ? "true" : "false"
            : value ? "1" : "0";
}

static async Task<bool> WaitForMucSelfPresenceAsync(
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

        return stanza.Element
            .Descendants(XName.Get("status", XmppMultiUserChat.UserNamespaceName))
            .Any(element => string.Equals((string?)element.Attribute("code"), "201", StringComparison.Ordinal));
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
    bool allowCertificatePin = true,
    bool directTls = false)
{
    var authOptions = new SslClientAuthenticationOptions
    {
        TargetHost = validationHost
    };

    if (directTls)
    {
        authOptions.ApplicationProtocols =
        [
            new SslApplicationProtocol(XmppDirectTls.XmppClientAlpnProtocol)
        ];
    }

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
        return await UpgradeAsync(
            stream,
            XmppTlsClientOptions.ForStartTls(targetHost),
            cancellationToken);
    }

    public async Task<Stream> UpgradeAsync(
        Stream stream,
        XmppTlsClientOptions options,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentNullException.ThrowIfNull(options);

        var sslStream = new SslStream(stream, leaveInnerStreamOpen: false);
        try
        {
            var authenticationOptions = new SslClientAuthenticationOptions
            {
                TargetHost = options.TargetHost
            };

            if (options.UseXmppClientAlpn)
            {
                authenticationOptions.ApplicationProtocols =
                [
                    new SslApplicationProtocol(XmppDirectTls.XmppClientAlpnProtocol)
                ];
            }

            if (!string.IsNullOrWhiteSpace(certificateSha256))
            {
                var expected = certificateSha256
                    .Replace(":", string.Empty, StringComparison.Ordinal)
                    .Replace("-", string.Empty, StringComparison.Ordinal)
                    .Replace(" ", string.Empty, StringComparison.Ordinal)
                    .ToUpperInvariant();
                authenticationOptions.RemoteCertificateValidationCallback = (_, certificate, _, errors) =>
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

            await sslStream.AuthenticateAsClientAsync(authenticationOptions, cancellationToken);
            return sslStream;
        }
        catch
        {
            await sslStream.DisposeAsync();
            throw;
        }
    }
}

sealed record XmppArchiveSmokeMatch(
    string Id,
    DateTimeOffset? DelayStamp);

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
    bool MucAdmin,
    XmppAddress? UploadService,
    string? UploadFile,
    XmppAddress? UploadRecipient,
    bool Socks5Smoke,
    XmppAddress? Socks5Proxy,
    bool IbbSmoke,
    bool MamSmoke,
    bool MucMamSmoke,
    bool CorrectionSmoke,
    XmppAddress? BlockJid,
    bool LocationSmoke,
    bool ExpectNoUserLocationSupport,
    bool ExternalServices,
    XmppAddress? ExternalService,
    string? ExternalServiceType,
    bool DirectTls,
    bool DiscoverDirectTls,
    bool TlsOnly,
    Uri? BoshUrl,
    bool DiscoverBosh,
    bool BoshDiscoveryOnly,
    bool BoshOnly,
    bool RegistrationInfoOnly,
    bool RegistrationPrompt)
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
                || string.Equals(name, "muc-admin", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "direct-tls", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "discover-direct-tls", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "tls-only", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "external-services", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "socks5-smoke", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "ibb-smoke", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "mam-smoke", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "muc-mam-smoke", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "correction-smoke", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "location-smoke", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "expect-no-location", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "discover-bosh", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "bosh-discovery-only", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "bosh-only", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "registration-info", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "registration-prompt", StringComparison.OrdinalIgnoreCase))
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

        var directTls = flags.Contains("direct-tls");
        var discoverDirectTls = flags.Contains("discover-direct-tls");
        var tlsOnly = flags.Contains("tls-only");
        var discoverBosh = flags.Contains("discover-bosh");
        var boshDiscoveryOnly = flags.Contains("bosh-discovery-only");
        var boshOnly = flags.Contains("bosh-only");
        var registrationInfoOnly = flags.Contains("registration-info");
        var registrationPrompt = flags.Contains("registration-prompt");
        if (!values.TryGetValue("account1", out var account1Text)
            || !TryGetValueOrEnvironment(values, "password1", "password1-env", out var password1))
        {
            return null;
        }

        values.TryGetValue("host", out var host);
        values.TryGetValue("bosh-url", out var boshUrlText);
        var hasBoshUrl = !string.IsNullOrWhiteSpace(boshUrlText);
        if (string.IsNullOrWhiteSpace(host) && !discoverDirectTls && !discoverBosh && !hasBoshUrl)
        {
            return null;
        }

        var port = values.TryGetValue("port", out var portText) && int.TryParse(portText, out var parsedPort)
            ? parsedPort
            : directTls
                ? XmppConnectionSettings.DirectTlsClientPort
                : XmppConnectionSettings.ClientPort;
        var timeout = values.TryGetValue("timeout-seconds", out var timeoutText)
            && int.TryParse(timeoutText, out var timeoutSeconds)
            ? TimeSpan.FromSeconds(timeoutSeconds)
            : TimeSpan.FromSeconds(30);
        var account1 = XmppAddress.Parse(account1Text);
        var account2 = values.TryGetValue("account2", out var account2Text)
            ? XmppAddress.Parse(account2Text)
            : account1;
        TryGetValueOrEnvironment(values, "password2", "password2-env", out var password2);
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
        var uploadService = values.TryGetValue("upload-service", out var uploadServiceText)
            ? XmppAddress.Parse(uploadServiceText)
            : null;
        values.TryGetValue("upload-file", out var uploadFile);
        var uploadRecipient = values.TryGetValue("upload-recipient", out var uploadRecipientText)
            ? XmppAddress.Parse(uploadRecipientText)
            : null;
        var socks5Proxy = values.TryGetValue("socks5-proxy", out var socks5ProxyText)
            ? XmppAddress.Parse(socks5ProxyText)
            : null;
        var blockJid = values.TryGetValue("block-jid", out var blockJidText)
            ? XmppAddress.Parse(blockJidText)
            : null;
        var externalService = values.TryGetValue("external-service", out var externalServiceText)
            ? XmppAddress.Parse(externalServiceText)
            : null;
        values.TryGetValue("external-service-type", out var externalServiceType);
        var boshUrl = hasBoshUrl
            ? new Uri(boshUrlText!, UriKind.Absolute)
            : null;

        return new SmokeOptions(
            string.IsNullOrWhiteSpace(host) ? account1.DomainPart : host,
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
            flags.Contains("muc-admin"),
            uploadService,
            uploadFile,
            uploadRecipient,
            flags.Contains("socks5-smoke"),
            socks5Proxy,
            flags.Contains("ibb-smoke"),
            flags.Contains("mam-smoke"),
            flags.Contains("muc-mam-smoke"),
            flags.Contains("correction-smoke"),
            blockJid,
            flags.Contains("location-smoke"),
            flags.Contains("expect-no-location"),
            flags.Contains("external-services"),
            externalService,
            string.IsNullOrWhiteSpace(externalServiceType) ? null : externalServiceType,
            directTls,
            discoverDirectTls,
            tlsOnly,
            boshUrl,
            discoverBosh,
            boshDiscoveryOnly,
            boshOnly,
            registrationInfoOnly,
            registrationPrompt);
    }

    private static bool TryGetValueOrEnvironment(
        Dictionary<string, string> values,
        string valueName,
        string environmentName,
        out string value)
    {
        if (values.TryGetValue(valueName, out value!)
            && !string.IsNullOrEmpty(value))
        {
            return true;
        }

        if (values.TryGetValue(environmentName, out var variableName)
            && !string.IsNullOrWhiteSpace(variableName))
        {
            value = Environment.GetEnvironmentVariable(variableName) ?? string.Empty;
            return !string.IsNullOrEmpty(value);
        }

        value = string.Empty;
        return false;
    }

    public static void PrintUsage()
    {
        Console.WriteLine("""
            Usage:
              dotnet run --project tools/Tiedragon.XmppMessenger.RealServerSmoke -- \
                --host xmpp.example.org \
                --account1 edward@example.org/desktop \
                --password1 secret \
                --password1-env TELETYPTEL_ACCOUNT1_PASSWORD \
                --account2 anna@example.org/desktop \
                --password2 secret \
                --password2-env TELETYPTEL_ACCOUNT2_PASSWORD \
                --bad-host wrong.example.org \
                --muc-service conference.example.org \
                --muc-room team@conference.example.org \
                --register

            Optional:
              --port 5222
              --direct-tls
              --discover-direct-tls
              --tls-only
              --bosh-url https://example.org/http-bind
              --discover-bosh
              --bosh-discovery-only
              --bosh-only
              --registration-info
              --registration-prompt
              --timeout-seconds 30
              --register
              --password1-env <environment variable containing account1 password>
              --password2-env <environment variable containing account2 password>
              --cert-sha256 <pinned certificate fingerprint for local self-signed smoke>
              --muc-service <conference service JID for XEP-0045 discovery>
              --muc-room <room JID for join and groupchat roundtrip>
              --muc-nick1 <nickname for account1>
              --muc-nick2 <nickname for account2>
              --muc-admin <also request owner configuration and admin member list>
              --upload-service <upload service JID, for example upload.example.org>
              --upload-file <local file path to request a slot and HTTP PUT>
              --upload-recipient <JID that receives the uploaded URL as XEP-0066 fallback>
              --socks5-smoke <discover XEP-0065 proxy, run two-account proxy activation and byte transfer>
              --socks5-proxy <explicit bytestream proxy JID, for example proxy.example.org>
              --ibb-smoke <run two-account XEP-0047 IBB open/data/close fallback transfer>
              --mam-smoke <send a two-account message and verify it through XEP-0313 MAM>
              --muc-mam-smoke <after MUC groupchat, verify the room archive through XEP-0313>
              --correction-smoke <send a two-account XEP-0308 corrected message and verify replace id>
              --block-jid <JID to block, verify in blocklist, then unblock with XEP-0191>
              --location-smoke <publish, retrieve and clear XEP-0080 through PEP>
              --expect-no-location <pass when the server does not advertise PEP/XEP-0080 support>
              --external-services
              --external-service <service JID/domain for XEP-0215, defaults to account domain>
              --external-service-type <optional XEP-0215 type filter, for example stun or turn>
              --bosh-url <BOSH endpoint URL for XEP-0124/XEP-0206 login/disco/chat smoke>
              --discover-bosh <discover BOSH through XEP-0156 host-meta xbosh relation>
              --bosh-discovery-only <only discover and print BOSH endpoint; do not login>
              --bosh-only <run only BOSH smoke, useful when no direct TCP client port is reachable>
              --registration-info <print XEP-0077 registration form details and stop before account creation>
              --registration-prompt <prompt for required XEP-0077 data-form fields during --register>
            """);
    }
}
