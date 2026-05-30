using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Tiedragon.XmppMessenger.Core.Xmpp;

namespace Tiedragon.XmppMessenger.AccountRegistration;

public sealed class RegistrationForm : Form
{
    private static readonly XName DataFormName = XName.Get("x", XmppServiceDiscovery.DataFormNamespace);
    private static readonly XName DataFormFieldName = XName.Get("field", XmppServiceDiscovery.DataFormNamespace);
    private static readonly XName DataFormValueName = XName.Get("value", XmppServiceDiscovery.DataFormNamespace);
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(30);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly WebView2 _webView = new() { Dock = DockStyle.Fill };
    private XmppStreamClient? _client;
    private XElement? _registrationQuery;
    private XmppAddress? _registrationTo;
    private XmppClientConnectionEndpoint? _registrationEndpoint;
    private bool _registrationUsesDataForm;
    private bool _registrationSucceeded;
    private UiState _state = UiState.Default;

    public event EventHandler<AccountRegisteredEventArgs>? AccountRegistered;

    public RegistrationForm()
    {
        Text = "Teletyptel XMPP account registratie";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(820, 680);
        Size = new Size(980, 760);
        Controls.Add(_webView);
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        await InitializeWebViewAsync();
    }

    protected override async void OnFormClosed(FormClosedEventArgs e)
    {
        await DisposeCurrentClientAsync();
        base.OnFormClosed(e);
    }

    private async Task InitializeWebViewAsync()
    {
        try
        {
            _webView.DefaultBackgroundColor = Color.FromArgb(11, 18, 32);
            await _webView.EnsureCoreWebView2Async();
            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _webView.CoreWebView2.Profile.PreferredColorScheme = CoreWebView2PreferredColorScheme.Dark;
            _webView.CoreWebView2.WebMessageReceived += async (_, args) => await HandleWebMessageAsync(args.WebMessageAsJson);
            _webView.NavigateToString(CreateHtml());
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "WebView2", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task HandleWebMessageAsync(string json)
    {
        UiMessage? message;
        try
        {
            message = JsonSerializer.Deserialize<UiMessage>(json, JsonOptions);
        }
        catch (JsonException)
        {
            return;
        }

        if (message?.Action is null)
        {
            return;
        }

        if (message.State is not null)
        {
            _state = message.State;
        }

        switch (message.Action)
        {
            case "ready":
                await PostAsync(new
                {
                    type = "state",
                    state = _state with
                    {
                        Username = CreateDefaultUsername(),
                        Password = CreatePassword()
                    }
                });
                await LogAsync("Klaar. Kies server en haal het XEP-0077 formulier op.");
                break;
            case "randomUser":
                await PostAsync(new { type = "field", name = "username", value = CreateDefaultUsername() });
                break;
            case "generatePassword":
                await PostAsync(new { type = "field", name = "password", value = CreatePassword() });
                break;
            case "fetch":
                await FetchRegistrationAsync();
                break;
            case "register":
                await SubmitRegistrationAsync();
                break;
            case "saveEnv":
                await SaveEnvironmentFileAsync();
                break;
            case "theme":
                _webView.CoreWebView2.Profile.PreferredColorScheme = _state.Theme == "light"
                    ? CoreWebView2PreferredColorScheme.Light
                    : CoreWebView2PreferredColorScheme.Dark;
                break;
        }
    }

    private async Task FetchRegistrationAsync()
    {
        try
        {
            await SetBusyAsync(true);
            _registrationSucceeded = false;
            _registrationQuery = null;
            _registrationTo = null;
            _registrationEndpoint = null;
            _registrationUsesDataForm = false;
            await PostAsync(new { type = "captcha", url = "", image = "" });
            await PostAsync(new { type = "canRegister", value = false });
            await PostAsync(new { type = "canSave", value = false });
            await DisposeCurrentClientAsync();

            var account = CreateAccountAddress(_state);
            var endpoint = await ResolveEndpointAsync(account.DomainPart, _state);
            _registrationEndpoint = endpoint;
            await LogAsync($"Server: {endpoint.Host}:{endpoint.Port} {(endpoint.DirectTls ? "Direct TLS" : "STARTTLS")}.");

            _client = CreateClient(account, endpoint);
            await _client.ConnectAndReadFeaturesAsync();
            await LogAsync("XMPP stream geopend. Registratieformulier wordt opgehaald...");

            _registrationTo = XmppAddress.Parse(account.DomainPart);
            var iq = await _client.SendIqAndWaitAsync(
                XmppInBandRegistration.CreateInfoRequest("register-info-1", _registrationTo),
                RequestTimeout);

            if (!XmppInBandRegistration.TryParseInfoResult(iq, out var info) || info is null || iq.Payload is null)
            {
                throw new InvalidOperationException("De server gaf geen geldig XEP-0077 registratieformulier terug.");
            }

            _registrationQuery = iq.Payload;
            _registrationUsesDataForm = FindDataForm(_registrationQuery) is not null;
            await LogAsync(info.Instructions ?? "Registratieformulier ontvangen.");

            if (_registrationUsesDataForm)
            {
                await LoadCaptchaImageAsync(_registrationQuery);
            }
            else
            {
                await LogAsync("Server gebruikt eenvoudig username/password formulier zonder x:data CAPTCHA.");
            }

            await PostAsync(new { type = "canRegister", value = true });
            await LogAsync("Klaar om te registreren.");
        }
        catch (Exception ex)
        {
            await LogAsync($"Fout: {ex.Message}");
            await DisposeCurrentClientAsync();
        }
        finally
        {
            await SetBusyAsync(false);
        }
    }

    private async Task SubmitRegistrationAsync()
    {
        try
        {
            if (_client is null || _registrationQuery is null || _registrationTo is null)
            {
                await LogAsync("Haal eerst het formulier op.");
                return;
            }

            await SetBusyAsync(true);
            var username = GetUsername(_state);
            var password = GetPassword(_state);
            XmppIq request;

            if (_registrationUsesDataForm)
            {
                var values = new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["username"] = username,
                    ["password"] = password
                };

                var captcha = _state.Captcha.Trim();
                if (FindRequiredFieldNames(_registrationQuery).Contains("ocr") && captcha.Length == 0)
                {
                    throw new InvalidOperationException("CAPTCHA tekst is verplicht.");
                }

                if (captcha.Length > 0)
                {
                    values["ocr"] = captcha;
                }

                request = XmppInBandRegistration.CreateDataFormRegistrationRequest(
                    "register-1",
                    _registrationQuery,
                    values,
                    _registrationTo);
            }
            else
            {
                request = XmppInBandRegistration.CreateSimpleRegistrationRequest(
                    "register-1",
                    username,
                    password,
                    _registrationTo);
            }

            var result = await _client.SendIqAndWaitAsync(request, RequestTimeout);
            if (!XmppInBandRegistration.IsRegistrationResult(result, "register-1"))
            {
                throw new InvalidOperationException("De server bevestigde de registratie niet correct.");
            }

            _registrationSucceeded = true;
            var account = CreateAccountAddress(_state);
            await LogAsync($"Account geregistreerd: {account.Bare}");
            AccountRegistered?.Invoke(
                this,
                new AccountRegisteredEventArgs(
                    account.Full,
                    GetPassword(_state),
                    account.DomainPart,
                    _registrationEndpoint?.Host ?? account.DomainPart,
                    _registrationEndpoint?.Port ?? XmppConnectionSettings.ClientPort,
                    _registrationEndpoint?.DirectTls ?? false));
            await LogAsync("Je kunt nu het env-bestand bewaren voor de real-server smoke test.");
            await PostAsync(new { type = "canRegister", value = false });
            await PostAsync(new { type = "canSave", value = true });
            await DisposeCurrentClientAsync();
        }
        catch (XmppProtocolException ex)
        {
            await LogAsync($"XMPP fout: {ex.Message}");
            if (ex.ErrorElement is not null)
            {
                await LogAsync(ex.ErrorElement.ToString(SaveOptions.DisableFormatting));
            }

            if (IsCaptchaFailure(ex.ErrorElement))
            {
                await InvalidateRegistrationChallengeAsync(
                    "CAPTCHA afgewezen of verlopen. Haal een nieuwe CAPTCHA op en submit direct opnieuw.");
            }
        }
        catch (Exception ex)
        {
            await LogAsync($"Fout: {ex.Message}");
        }
        finally
        {
            await SetBusyAsync(false);
        }
    }

    private async Task<XmppClientConnectionEndpoint> ResolveEndpointAsync(string domain, UiState state)
    {
        if (state.Discover)
        {
            var endpoints = await XmppDirectTls.DiscoverClientEndpointsAsync(
                domain,
                includeStartTlsFallback: true,
                preferDirectTls: true);
            var endpoint = endpoints.FirstOrDefault();
            if (endpoint is not null)
            {
                return endpoint;
            }
        }

        var host = string.IsNullOrWhiteSpace(state.Host) ? domain : state.Host.Trim();
        return new XmppClientConnectionEndpoint(
            host,
            state.Port,
            state.DirectTls,
            Priority: 0,
            Weight: 0,
            Service: state.DirectTls ? XmppDirectTls.DirectTlsService : XmppDirectTls.StartTlsService);
    }

    private static XmppStreamClient CreateClient(XmppAddress account, XmppClientConnectionEndpoint endpoint)
    {
        var options = new XmppStreamOptions(
            XmppStreamOptions.Default.PreferredLanguage,
            account.ResourcePart ?? "registration",
            RequestTimeout,
            XmppStreamOptions.Default.KeepAliveInterval);
        return new XmppStreamClient(
            XmppConnectionSettings.FromEndpoint(account, endpoint),
            options,
            new XmppTlsStreamUpgrader());
    }

    private async Task LoadCaptchaImageAsync(XElement registrationQuery)
    {
        var captchaUrl = GetDataFormValue(registrationQuery, "captcha-fallback-url");
        if (string.IsNullOrWhiteSpace(captchaUrl))
        {
            await LogAsync("Geen CAPTCHA URL gevonden in het x:data formulier.");
            return;
        }

        await LogAsync($"CAPTCHA wordt geladen: {captchaUrl}");
        using var http = new HttpClient();
        using var response = await http.GetAsync(captchaUrl);
        response.EnsureSuccessStatusCode();
        var bytes = await response.Content.ReadAsByteArrayAsync();
        var mediaType = response.Content.Headers.ContentType?.MediaType ?? "image/png";
        var dataUri = $"data:{mediaType};base64,{Convert.ToBase64String(bytes)}";
        await PostAsync(new { type = "captcha", url = captchaUrl, image = dataUri });
        await PostAsync(new { type = "focus", id = "captcha" });
        await LogAsync("CAPTCHA geladen. Typ de tekst en klik op Account registreren.");
    }

    private async Task InvalidateRegistrationChallengeAsync(string message)
    {
        _registrationQuery = null;
        _registrationTo = null;
        _registrationEndpoint = null;
        _registrationUsesDataForm = false;
        _registrationSucceeded = false;
        await DisposeCurrentClientAsync();
        await PostAsync(new { type = "canRegister", value = false });
        await PostAsync(new { type = "canSave", value = false });
        await PostAsync(new { type = "captcha", url = string.Empty, image = string.Empty });
        await LogAsync(message);
    }

    private async Task SaveEnvironmentFileAsync()
    {
        if (!_registrationSucceeded)
        {
            await LogAsync("Registreer eerst het account.");
            return;
        }

        var account = CreateAccountAddress(_state);
        var password = GetPassword(_state);
        var slot = NormalizeEnvSlot(_state.EnvSlot);
        var secretsDirectory = Path.Combine(FindRepositoryRoot(), "artifacts", "secrets");
        Directory.CreateDirectory(secretsDirectory);
        var path = Path.Combine(secretsDirectory, $"xmpp-account{slot}-{account.LocalPart}-{DateTime.Now:yyyyMMdd-HHmmss}.ps1");

        var builder = new StringBuilder();
        builder.AppendLine("# Teletyptel public XMPP smoke account. Do not commit this file.");
        builder.AppendLine($"$env:TELETYPTEL_XMPP_ACCOUNT{slot} = {QuotePowerShell(account.Full)}");
        builder.AppendLine($"$env:TELETYPTEL_XMPP_PASSWORD{slot} = {QuotePowerShell(password)}");
        builder.AppendLine($"$env:TELETYPTEL_ACCOUNT{slot} = {QuotePowerShell(account.Full)}");
        builder.AppendLine($"$env:TELETYPTEL_PASSWORD{slot} = {QuotePowerShell(password)}");
        if (_registrationEndpoint is not null)
        {
            builder.AppendLine($"$env:TELETYPTEL_XMPP_HOST = {QuotePowerShell(_registrationEndpoint.Host)}");
            builder.AppendLine($"$env:TELETYPTEL_XMPP_PORT = {QuotePowerShell(_registrationEndpoint.Port.ToString())}");
            builder.AppendLine($"$env:TELETYPTEL_XMPP_DIRECT_TLS = {QuotePowerShell(_registrationEndpoint.DirectTls ? "1" : "0")}");
        }

        File.WriteAllText(path, builder.ToString(), Encoding.UTF8);
        await LogAsync($"Env-bestand voor smoke account {slot} geschreven: {path}");
    }

    private static XmppAddress CreateAccountAddress(UiState state)
    {
        return XmppAddress.Parse($"{GetUsername(state)}@{GetDomain(state)}/registration");
    }

    private static string GetUsername(UiState state)
    {
        var username = state.Username.Trim();
        if (string.IsNullOrWhiteSpace(username))
        {
            throw new InvalidOperationException("Gebruikersnaam is verplicht.");
        }

        if (username.Contains('@', StringComparison.Ordinal) || username.Contains('/', StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Gebruik alleen de lokale gebruikersnaam, zonder domein of resource.");
        }

        return username;
    }

    private static string GetDomain(UiState state)
    {
        var domain = state.Domain.Trim();
        if (string.IsNullOrWhiteSpace(domain))
        {
            throw new InvalidOperationException("Domein is verplicht.");
        }

        return domain;
    }

    private static string GetPassword(UiState state)
    {
        if (string.IsNullOrWhiteSpace(state.Password))
        {
            throw new InvalidOperationException("Wachtwoord is verplicht.");
        }

        return state.Password;
    }

    private static int NormalizeEnvSlot(int slot)
    {
        return slot == 2 ? 2 : 1;
    }

    private static XElement? FindDataForm(XElement registrationQuery)
    {
        return registrationQuery.Descendants(DataFormName).FirstOrDefault();
    }

    private static string? GetDataFormValue(XElement registrationQuery, string fieldName)
    {
        return FindDataForm(registrationQuery)?
            .Elements(DataFormFieldName)
            .FirstOrDefault(field => string.Equals((string?)field.Attribute("var"), fieldName, StringComparison.Ordinal))?
            .Element(DataFormValueName)?
            .Value;
    }

    private static HashSet<string> FindRequiredFieldNames(XElement registrationQuery)
    {
        return FindDataForm(registrationQuery)?
            .Elements(DataFormFieldName)
            .Where(field => field.Element(XName.Get("required", XmppServiceDiscovery.DataFormNamespace)) is not null)
            .Select(field => (string?)field.Attribute("var"))
            .Where(field => !string.IsNullOrWhiteSpace(field))
            .Cast<string>()
            .ToHashSet(StringComparer.Ordinal)
            ?? new HashSet<string>(StringComparer.Ordinal);
    }

    private static bool IsCaptchaFailure(XElement? errorElement)
    {
        if (errorElement is null)
        {
            return false;
        }

        return errorElement
            .Descendants(XName.Get("text", "urn:ietf:params:xml:ns:xmpp-stanzas"))
            .Any(text => text.Value.Contains("captcha", StringComparison.OrdinalIgnoreCase));
    }

    private static string CreateDefaultUsername()
    {
        return $"teletyptel-{RandomNumberGenerator.GetInt32(100000, 999999)}";
    }

    private static string CreatePassword()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(18))
            .Replace("+", "A", StringComparison.Ordinal)
            .Replace("/", "b", StringComparison.Ordinal)
            .TrimEnd('=');
    }

    private async Task SetBusyAsync(bool busy)
    {
        await PostAsync(new { type = "busy", value = busy });
    }

    private async Task LogAsync(string message)
    {
        await PostAsync(new { type = "log", message = $"[{DateTime.Now:HH:mm:ss}] {message}" });
    }

    private Task PostAsync(object message)
    {
        if (_webView.CoreWebView2 is null)
        {
            return Task.CompletedTask;
        }

        _webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(message, JsonOptions));
        return Task.CompletedTask;
    }

    private static string QuotePowerShell(string value)
    {
        return "'" + value.Replace("'", "''", StringComparison.Ordinal) + "'";
    }

    private static string FindRepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "Tiedragon.XmppMessenger.slnx")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        return AppContext.BaseDirectory;
    }

    private async Task DisposeCurrentClientAsync()
    {
        var client = _client;
        _client = null;
        if (client is null)
        {
            return;
        }

        try
        {
            await client.DisposeAsync();
        }
        catch
        {
            // Best effort cleanup for a registration probe connection.
        }
    }

    private static string CreateHtml()
    {
        return """
<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Teletyptel XMPP account registratie</title>
<style>
:root {
  color-scheme: dark;
  --bg: #0b1220;
  --panel: #111c2f;
  --panel2: #17253b;
  --text: #f8fafc;
  --muted: #b8c7dc;
  --line: #36557a;
  --accent: #2f7cff;
  --ok: #23c764;
  --warn: #ffd56a;
}
body.light {
  color-scheme: light;
  --bg: #f5f8fc;
  --panel: #ffffff;
  --panel2: #eaf2ff;
  --text: #071426;
  --muted: #456079;
  --line: #b8cee8;
  --accent: #0b63d1;
  --ok: #0b9f52;
  --warn: #805f00;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font: 15px/1.45 "Segoe UI", system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
}
main { padding: 18px; max-width: 1040px; margin: 0 auto; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
h1 { font-size: 24px; margin: 0; }
.subtitle { color: var(--muted); margin-top: 3px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px;
}
.card h2 { font-size: 17px; margin: 0 0 12px; }
label { display: block; color: var(--muted); font-weight: 600; margin: 10px 0 5px; }
input[type=text], input[type=password], input[type=number] {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel2);
  color: var(--text);
  font: inherit;
}
.row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; }
.checks { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 10px; color: var(--muted); }
button {
  border: 1px solid #75aeff;
  background: var(--accent);
  color: white;
  border-radius: 6px;
  padding: 9px 13px;
  font-weight: 700;
  cursor: pointer;
}
button.secondary { background: transparent; color: var(--text); }
button:disabled { opacity: .45; cursor: default; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
#captchaImage {
  display: none;
  width: 100%;
  min-height: 90px;
  max-height: 170px;
  object-fit: contain;
  background: white;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px;
}
.log {
  height: 170px;
  overflow: auto;
  white-space: pre-wrap;
  background: #020817;
  color: #d7e7ff;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
  font-family: Consolas, monospace;
}
body.light .log { background: #f8fbff; color: #0d1b2a; }
.jid { color: var(--ok); font-weight: 700; margin-top: 8px; word-break: break-all; }
.hint { color: var(--muted); margin-top: 10px; }
@media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>Teletyptel XMPP account registratie</h1>
      <div class="subtitle">XEP-0077 met CAPTCHA in dezelfde live XMPP-verbinding</div>
    </div>
    <button id="themeButton" class="secondary" type="button">Thema: donker</button>
  </header>

  <div class="grid">
    <section class="card">
      <h2>Server</h2>
      <label>Domein</label>
      <input id="domain" type="text" value="conversations.im">
      <label>Host</label>
      <input id="host" type="text" placeholder="leeg = domein/SRV">
      <label>Poort</label>
      <input id="port" type="number" min="1" max="65535" value="5222">
      <div class="checks">
        <label><input id="discover" type="checkbox" checked> SRV discovery / Direct TLS</label>
        <label><input id="directTls" type="checkbox"> Direct TLS handmatig</label>
      </div>
    </section>

    <section class="card">
      <h2>Account</h2>
      <label>Gebruikersnaam</label>
      <div class="row">
        <input id="username" type="text">
        <button id="randomUser" class="secondary" type="button">Nieuwe naam</button>
      </div>
      <label>Wachtwoord</label>
      <div class="row">
        <input id="password" type="password">
        <button id="generatePassword" class="secondary" type="button">Nieuw wachtwoord</button>
      </div>
      <div class="checks"><label><input id="showPassword" type="checkbox"> wachtwoord tonen</label></div>
      <label>Opslaan als smoke account</label>
      <select id="envSlot">
        <option value="1">Account 1</option>
        <option value="2">Account 2</option>
      </select>
      <div id="jid" class="jid"></div>
    </section>
  </div>

  <section class="card" style="margin-top:14px">
    <h2>Registratie</h2>
    <label>CAPTCHA URL</label>
    <input id="captchaUrl" type="text" readonly>
    <img id="captchaImage" alt="CAPTCHA">
    <label>CAPTCHA tekst</label>
    <input id="captcha" type="text" autocomplete="off">
    <div class="hint">Haal eerst het formulier op, typ de CAPTCHA en registreer direct voordat de challenge verloopt.</div>
    <div class="actions">
      <button id="fetch" type="button">Formulier / CAPTCHA ophalen</button>
      <button id="register" type="button" disabled>Account registreren</button>
      <button id="saveEnv" class="secondary" type="button" disabled>Env-bestand bewaren</button>
    </div>
  </section>

  <section class="card" style="margin-top:14px">
    <h2>Log</h2>
    <div id="log" class="log"></div>
  </section>
</main>
<script>
const ids = ["domain","host","port","discover","directTls","username","password","captcha","envSlot"];
let theme = "dark";
let busy = false;
let canRegister = false;
let canSave = false;
function el(id){ return document.getElementById(id); }
function renderButtons(){
  el("fetch").disabled = busy;
  el("randomUser").disabled = busy;
  el("generatePassword").disabled = busy;
  el("register").disabled = busy || !canRegister;
  el("saveEnv").disabled = busy || !canSave;
}
function state(){
  return {
    domain: el("domain").value,
    host: el("host").value,
    port: Number(el("port").value || 5222),
    discover: el("discover").checked,
    directTls: el("directTls").checked,
    username: el("username").value,
    password: el("password").value,
    captcha: el("captcha").value,
    envSlot: Number(el("envSlot").value || 1),
    theme
  };
}
function send(action){ chrome.webview.postMessage({ action, state: state() }); }
function updateJid(){ el("jid").textContent = el("username").value && el("domain").value ? `${el("username").value}@${el("domain").value}/registration` : ""; }
for (const id of ids) el(id).addEventListener("input", updateJid);
el("showPassword").addEventListener("change", () => el("password").type = el("showPassword").checked ? "text" : "password");
el("randomUser").onclick = () => send("randomUser");
el("generatePassword").onclick = () => send("generatePassword");
el("fetch").onclick = () => send("fetch");
el("register").onclick = () => send("register");
el("saveEnv").onclick = () => send("saveEnv");
el("captcha").addEventListener("keydown", event => {
  if (event.key === "Enter" && !el("register").disabled) {
    event.preventDefault();
    send("register");
  }
});
el("themeButton").onclick = () => {
  theme = theme === "dark" ? "light" : "dark";
  document.body.className = theme === "light" ? "light" : "";
  el("themeButton").textContent = `Thema: ${theme === "dark" ? "donker" : "licht"}`;
  send("theme");
};
chrome.webview.addEventListener("message", event => {
  const msg = event.data;
  if (msg.type === "state") {
    for (const [key, value] of Object.entries(msg.state)) {
      const input = el(key);
      if (!input) continue;
      if (input.type === "checkbox") input.checked = !!value; else input.value = value ?? "";
    }
    updateJid();
  } else if (msg.type === "field") {
    el(msg.name).value = msg.value ?? "";
    updateJid();
  } else if (msg.type === "busy") {
    busy = !!msg.value;
    renderButtons();
  } else if (msg.type === "canRegister") {
    canRegister = !!msg.value;
    renderButtons();
  } else if (msg.type === "canSave") {
    canSave = !!msg.value;
    renderButtons();
  } else if (msg.type === "captcha") {
    el("captchaUrl").value = msg.url || "";
    el("captchaImage").src = msg.image || "";
    el("captchaImage").style.display = msg.image ? "block" : "none";
    el("captcha").value = "";
  } else if (msg.type === "focus") {
    const target = el(msg.id);
    if (target) target.focus();
  } else if (msg.type === "log") {
    const log = el("log");
    log.textContent += msg.message + "\n";
    log.scrollTop = log.scrollHeight;
  }
});
send("ready");
</script>
</body>
</html>
""";
    }

    private sealed record UiMessage(string? Action, UiState? State);

    public sealed class AccountRegisteredEventArgs : EventArgs
    {
        public AccountRegisteredEventArgs(
            string jid,
            string password,
            string domain,
            string host,
            int port,
            bool directTls)
        {
            Jid = jid;
            Password = password;
            Domain = domain;
            Host = host;
            Port = port;
            DirectTls = directTls;
        }

        public string Jid { get; }

        public string Password { get; }

        public string Domain { get; }

        public string Host { get; }

        public int Port { get; }

        public bool DirectTls { get; }
    }

    private sealed record UiState(
        string Domain,
        string Host,
        int Port,
        bool Discover,
        bool DirectTls,
        string Username,
        string Password,
        string Captcha,
        int EnvSlot,
        string Theme)
    {
        public static UiState Default { get; } = new(
            Domain: "conversations.im",
            Host: string.Empty,
            Port: XmppConnectionSettings.ClientPort,
            Discover: true,
            DirectTls: false,
            Username: string.Empty,
            Password: string.Empty,
            Captcha: string.Empty,
            EnvSlot: 1,
            Theme: "dark");
    }
}
