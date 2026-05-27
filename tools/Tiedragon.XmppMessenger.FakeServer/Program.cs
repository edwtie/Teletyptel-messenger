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

var options = FakeServerOptions.Parse(args);
if (options is null)
{
    FakeServerOptions.PrintUsage();
    Environment.ExitCode = 2;
    return;
}

using var certificate = options.LoadOrCreateCertificate();
var state = new FakeXmppServerState(options.Domain, certificate);
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
Console.WriteLine($"Fake XMPP server listening on {options.ListenAddress}:{options.Port} for domain {options.Domain}");
Console.WriteLine("Features: STARTTLS required, XEP-0077, XEP-0363 slot responses, SASL PLAIN, resource bind, empty roster, direct chat relay");
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
}

static async Task HandleClientAsync(
    TcpClient client,
    FakeXmppServerState state,
    CancellationToken cancellationToken)
{
    var session = new FakeXmppSession(client, state);
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

sealed class FakeXmppServerState(string domain, X509Certificate2 certificate)
{
    private readonly ConcurrentDictionary<string, FakeXmppSession> _sessionsByBareJid = new(StringComparer.OrdinalIgnoreCase);

    public string Domain { get; } = domain;

    public X509Certificate2 Certificate { get; } = certificate;

    public ConcurrentDictionary<string, string> Accounts { get; } = new(StringComparer.OrdinalIgnoreCase);

    public void AddSession(FakeXmppSession session)
    {
        if (session.BareJid is not null)
        {
            _sessionsByBareJid[session.BareJid] = session;
        }
    }

    public void UpdateSessionJid(FakeXmppSession session)
    {
        if (session.BareJid is not null)
        {
            _sessionsByBareJid[session.BareJid] = session;
        }
    }

    public void RemoveSession(FakeXmppSession session)
    {
        if (session.BareJid is not null)
        {
            _sessionsByBareJid.TryRemove(session.BareJid, out _);
        }
    }

    public bool TryGetSession(string jid, out FakeXmppSession? session)
    {
        var bare = BareJid(jid);
        return _sessionsByBareJid.TryGetValue(bare, out session);
    }

    private static string BareJid(string jid)
    {
        var slash = jid.IndexOf('/');
        return slash >= 0 ? jid[..slash] : jid;
    }
}

sealed class FakeXmppSession(TcpClient client, FakeXmppServerState state)
{
    private Stream _stream = client.GetStream();
    private readonly StringBuilder _buffer = new();
    private string? _username;
    private bool _tlsActive;

    public string? BareJid => _username is null ? null : $"{_username}@{state.Domain}";

    public string? FullJid { get; private set; }

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

        var data = Encoding.UTF8.GetString(Convert.FromBase64String(element.Value));
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

    private async Task HandleIqAsync(XElement element, CancellationToken cancellationToken)
    {
        if (!_tlsActive)
        {
            await WriteAsync($"""
                <iq xmlns="jabber:client" type="error" id="{Escape((string?)element.Attribute("id"))}">
                  <error type="auth"><not-authorized xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error>
                </iq>
                """, cancellationToken);
            return;
        }

        var id = (string?)element.Attribute("id") ?? string.Empty;
        var type = (string?)element.Attribute("type") ?? string.Empty;
        var to = (string?)element.Attribute("to") ?? string.Empty;
        var payload = element.Elements().SingleOrDefault();

        if (payload?.Name == XName.Get("query", "jabber:iq:register"))
        {
            await HandleRegistrationIqAsync(id, type, payload, cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("bind", "urn:ietf:params:xml:ns:xmpp-bind") && type == "set")
        {
            var requestedResource = payload.Element(XName.Get("resource", "urn:ietf:params:xml:ns:xmpp-bind"))?.Value;
            var resource = string.IsNullOrWhiteSpace(requestedResource) ? "fake" : requestedResource;
            FullJid = $"{BareJid}/{resource}";
            await WriteAsync($"""
                <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                  <bind xmlns="urn:ietf:params:xml:ns:xmpp-bind">
                    <jid>{Escape(FullJid)}</jid>
                  </bind>
                </iq>
                """, cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("query", "jabber:iq:roster") && type == "get")
        {
            await WriteAsync($"""
                <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                  <query xmlns="jabber:iq:roster"/>
                </iq>
                """, cancellationToken);
            return;
        }

        if (payload?.Name == XName.Get("query", "http://jabber.org/protocol/disco#info") && type == "get")
        {
            await WriteAsync($"""
                <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                  <query xmlns="http://jabber.org/protocol/disco#info">
                    <identity category="server" type="im" name="Tiedragon Fake XMPP Server"/>
                    <identity category="store" type="file" name="HTTP File Upload"/>
                    <feature var="jabber:iq:register"/>
                    <feature var="urn:xmpp:rtt:0"/>
                    <feature var="urn:xmpp:receipts"/>
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

            var token = Guid.NewGuid().ToString("N");
            var escapedName = Uri.EscapeDataString(fileName);
            await WriteAsync($"""
                <iq xmlns="jabber:client" type="result" id="{Escape(id)}">
                  <slot xmlns="urn:xmpp:http:upload:0">
                    <put url="https://upload.{Escape(state.Domain)}/fake/{token}/{escapedName}">
                      <header name="Expires">{DateTimeOffset.UtcNow.AddMinutes(5):yyyy-MM-ddTHH:mm:ssZ}</header>
                    </put>
                    <get url="https://download.{Escape(state.Domain)}/fake/{token}/{escapedName}"/>
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

    private async Task HandleMessageAsync(XElement element, CancellationToken cancellationToken)
    {
        if (!_tlsActive)
        {
            return;
        }

        var to = (string?)element.Attribute("to");
        if (string.IsNullOrWhiteSpace(to))
        {
            return;
        }

        element.SetAttributeValue("from", FullJid ?? BareJid);
        if (state.TryGetSession(to, out var recipient) && recipient is not null)
        {
            await recipient.SendAsync(element.ToString(SaveOptions.DisableFormatting), cancellationToken);
        }
    }

    private async Task SendOpenAndFeaturesAsync(CancellationToken cancellationToken)
    {
        var features = _tlsActive
            ? """
              <register xmlns="http://jabber.org/features/iq-register"/>
              <mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl">
                <mechanism>PLAIN</mechanism>
              </mechanisms>
              <bind xmlns="urn:ietf:params:xml:ns:xmpp-bind">
                <required/>
              </bind>
            """
            : """
              <starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls">
                <required/>
              </starttls>
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

sealed record FakeAccount(string Username, string Password);

sealed record FakeServerOptions(
    string ListenAddress,
    int Port,
    string Domain,
    string? CertificatePath,
    string? CertificatePassword,
    IReadOnlyList<FakeAccount> Accounts)
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

    public static FakeServerOptions? Parse(string[] args)
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
        var domain = ValueOrDefault(values, "domain", "localhost");
        var portText = ValueOrDefault(values, "port", "5222");
        values.TryGetValue("cert-path", out var certPaths);
        values.TryGetValue("cert-password", out var certPasswords);
        if (!int.TryParse(portText, out var port))
        {
            return null;
        }

        var accounts = values.TryGetValue("account", out var accountValues)
            ? accountValues.Select(ParseAccount).Where(account => account is not null).Cast<FakeAccount>().ToArray()
            : Array.Empty<FakeAccount>();
        return new FakeServerOptions(
            listen,
            port,
            domain,
            certPaths?.LastOrDefault(),
            certPasswords?.LastOrDefault(),
            accounts);
    }

    public static void PrintUsage()
    {
        Console.WriteLine("""
            Usage:
              dotnet run --project tools/Tiedragon.XmppMessenger.FakeServer -- \
                --listen 127.0.0.1 \
                --port 5222 \
                --domain localhost \
                --cert-path .tmp/fake-xmpp-localhost.pfx \
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

    private static FakeAccount? ParseAccount(string value)
    {
        var separator = value.IndexOf(':');
        if (separator <= 0 || separator == value.Length - 1)
        {
            return null;
        }

        return new FakeAccount(value[..separator], value[(separator + 1)..]);
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
