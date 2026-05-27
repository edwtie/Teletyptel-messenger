using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Text;
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
}
catch (Exception ex)
{
    Console.Error.WriteLine("FAIL " + ex.Message);
    Console.Error.WriteLine(ex);
    Environment.ExitCode = 1;
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
        await using var stream = await StartTlsAsync(options, options.BadHost!, cancellationToken);
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
    CancellationToken cancellationToken)
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
    var authOptions = new SslClientAuthenticationOptions
    {
        TargetHost = validationHost
    };

    await sslStream.AuthenticateAsClientAsync(authOptions, cancellationToken);
    return sslStream;
}

static async Task VerifyTwoAccountChatAsync(SmokeOptions options, CancellationToken cancellationToken)
{
    var clientOptions = new XmppStreamOptions(
        XmppStreamOptions.Default.PreferredLanguage,
        XmppStreamOptions.Default.Resource,
        options.Timeout,
        XmppStreamOptions.Default.KeepAliveInterval);
    await using var sender = new XmppStreamClient(
        new XmppConnectionSettings(options.Account1, options.Host, options.Port, requireTls: true),
        clientOptions);
    await using var receiver = new XmppStreamClient(
        new XmppConnectionSettings(options.Account2, options.Host, options.Port, requireTls: true),
        clientOptions);

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

sealed record SmokeOptions(
    string Host,
    int Port,
    XmppAddress Account1,
    string Password1,
    XmppAddress Account2,
    string? Password2,
    string? BadHost,
    TimeSpan Timeout)
{
    public static SmokeOptions? Parse(string[] args)
    {
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < args.Length; index++)
        {
            var key = args[index];
            if (!key.StartsWith("--", StringComparison.Ordinal) || index + 1 >= args.Length)
            {
                return null;
            }

            values[key[2..]] = args[++index];
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

        return new SmokeOptions(host, port, account1, password1, account2, password2, badHost, timeout);
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
                --bad-host wrong.example.org

            Optional:
              --port 5222
              --timeout-seconds 30
            """);
    }
}
