using System.Net.WebSockets;
using System.Text;
using Tiedragon.LngPdk;
using Tiedragon.XmppMessenger.Core.Messaging;
using Tiedragon.XmppMessenger.Core.Rtt;
using Tiedragon.XmppMessenger.Core.Xmpp;

namespace Tiedragon.XmppMessenger.WinFormsDemo;

public sealed class MainForm : Form
{
    private readonly LanguageCatalog _language = LanguageCatalog.Load("ned");
    private readonly TextBox _urlTextBox = new() { Text = "ws://127.0.0.1:8787" };
    private readonly TextBox _displayNameTextBox = new() { Text = "Edward" };
    private readonly TextBox _jidTextBox = new() { Text = "edward@localhost" };
    private readonly TextBox _xmppHostTextBox = new() { Text = "localhost", Width = 130 };
    private readonly TextBox _xmppPortTextBox = new() { Text = "5222", Width = 58 };
    private readonly TextBox _xmppPasswordTextBox = new() { Width = 130, UseSystemPasswordChar = true };
    private readonly Button _connectButton = new();
    private readonly Button _xmppLoginButton = new();
    private readonly Button _resetButton = new() { Enabled = false };
    private readonly CheckBox _rttEnabledCheckBox = new() { Checked = true, AutoSize = true };
    private readonly CheckBox _xmppTlsCheckBox = new() { Checked = false, AutoSize = true };
    private readonly Label _statusLabel = new() { AutoSize = true };
    private readonly Label _nameLabel = new() { AutoSize = true, Anchor = AnchorStyles.Left };
    private readonly Label _jidLabel = new() { AutoSize = true, Anchor = AnchorStyles.Left };
    private readonly Label _xmppHostLabel = new() { AutoSize = true };
    private readonly Label _xmppPortLabel = new() { AutoSize = true };
    private readonly Label _xmppPasswordLabel = new() { AutoSize = true };
    private readonly Label _webSocketLabel = new() { AutoSize = true, Anchor = AnchorStyles.Left };
    private readonly Label _conversationLabel = new() { AutoSize = true };
    private readonly Label _messageLabel = new() { AutoSize = true };
    private readonly Label _rttStatusLabel = new() { AutoSize = true };
    private readonly TextBox _localTextBox = new() { Multiline = true, ScrollBars = ScrollBars.Vertical, AcceptsReturn = true };
    private readonly TextBox _remoteTextBox = new() { Multiline = true, ScrollBars = ScrollBars.Vertical, ReadOnly = true };
    private readonly TextBox _logTextBox = new() { Multiline = true, ScrollBars = ScrollBars.Vertical, ReadOnly = true };

    private readonly RttComposer _composer = new();
    private readonly RttMessageState _remoteState = new();

    private ClientWebSocket? _client;
    private XmppStreamClient? _xmppClient;
    private CancellationTokenSource? _receiveCancellation;
    private ConversationOptions _conversationOptions = ConversationOptions.Default;
    private bool _isApplyingRemoteText;

    public MainForm()
    {
        MinimumSize = new Size(760, 640);
        StartPosition = FormStartPosition.CenterScreen;

        BuildLayout();
        ApplyLanguage();
        ApplyTheme();

        _connectButton.Click += async (_, _) => await ToggleConnectionAsync();
        _xmppLoginButton.Click += async (_, _) => await LoginXmppAsync();
        _resetButton.Click += async (_, _) => await SendResetAsync();
        _localTextBox.TextChanged += async (_, _) => await LocalTextChangedAsync();
        _localTextBox.KeyUp += async (_, eventArgs) => await LocalKeyUpAsync(eventArgs);
        _rttEnabledCheckBox.CheckedChanged += async (_, _) => await RttModeChangedAsync();
        FormClosing += async (_, _) => await DisconnectAsync();
    }

    private void BuildLayout()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 5,
            Padding = new Padding(12)
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 88));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 138));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 82));

        var top = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 7,
            RowCount = 2
        };
        top.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 92));
        top.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 38));
        top.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 52));
        top.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 44));
        top.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 86));
        top.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 108));
        top.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 116));
        top.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        top.RowStyles.Add(new RowStyle(SizeType.Percent, 50));

        top.Controls.Add(_nameLabel, 0, 0);
        top.Controls.Add(_displayNameTextBox, 1, 0);
        top.Controls.Add(_jidLabel, 2, 0);
        top.Controls.Add(_jidTextBox, 3, 0);
        top.Controls.Add(_rttEnabledCheckBox, 4, 0);
        top.SetRowSpan(_rttEnabledCheckBox, 2);
        top.Controls.Add(_connectButton, 5, 0);
        top.Controls.Add(_statusLabel, 6, 0);
        top.SetRowSpan(_statusLabel, 2);

        top.Controls.Add(_webSocketLabel, 0, 1);
        top.Controls.Add(_urlTextBox, 1, 1);
        top.SetColumnSpan(_urlTextBox, 3);
        top.Controls.Add(_resetButton, 5, 1);

        var xmppPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Padding = new Padding(0, 6, 0, 0)
        };
        xmppPanel.Controls.Add(_xmppHostLabel);
        xmppPanel.Controls.Add(_xmppHostTextBox);
        xmppPanel.Controls.Add(_xmppPortLabel);
        xmppPanel.Controls.Add(_xmppPortTextBox);
        xmppPanel.Controls.Add(_xmppPasswordLabel);
        xmppPanel.Controls.Add(_xmppPasswordTextBox);
        xmppPanel.Controls.Add(_xmppTlsCheckBox);
        xmppPanel.Controls.Add(_xmppLoginButton);

        var conversationPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            Padding = new Padding(0, 8, 0, 8)
        };
        conversationPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        conversationPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        conversationPanel.Controls.Add(_conversationLabel, 0, 0);
        conversationPanel.Controls.Add(_remoteTextBox, 0, 1);

        var inputPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            Padding = new Padding(0, 4, 0, 8)
        };
        inputPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        inputPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        inputPanel.Controls.Add(_messageLabel, 0, 0);
        inputPanel.Controls.Add(_localTextBox, 0, 1);

        var logPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2
        };
        logPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        logPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        logPanel.Controls.Add(_rttStatusLabel, 0, 0);
        logPanel.Controls.Add(_logTextBox, 0, 1);

        root.Controls.Add(top, 0, 0);
        root.Controls.Add(xmppPanel, 0, 1);
        root.Controls.Add(conversationPanel, 0, 2);
        root.Controls.Add(inputPanel, 0, 3);
        root.Controls.Add(logPanel, 0, 4);
        Controls.Add(root);

        foreach (var textBox in new[] { _urlTextBox, _displayNameTextBox, _jidTextBox, _xmppHostTextBox, _xmppPortTextBox, _xmppPasswordTextBox, _localTextBox, _remoteTextBox, _logTextBox })
        {
            textBox.Dock = DockStyle.Fill;
            textBox.Font = new Font("Consolas", 10F);
        }

        _remoteTextBox.Font = new Font("Segoe UI", 11F);
        _localTextBox.Font = new Font("Segoe UI", 11F);
        _connectButton.Dock = DockStyle.Fill;
        _xmppLoginButton.AutoSize = true;
        _resetButton.Dock = DockStyle.Fill;
        _rttEnabledCheckBox.Anchor = AnchorStyles.Left;
        _xmppTlsCheckBox.Margin = new Padding(12, 6, 8, 0);
        _statusLabel.Anchor = AnchorStyles.Left;
    }

    private void ApplyLanguage()
    {
        Text = _language["app.title"];
        _nameLabel.Text = _language["label.name"];
        _jidLabel.Text = _language["label.jid"];
        _xmppHostLabel.Text = _language["label.xmpp_host"];
        _xmppPortLabel.Text = _language["label.xmpp_port"];
        _xmppPasswordLabel.Text = _language["label.password"];
        _webSocketLabel.Text = _language["label.websocket"];
        _conversationLabel.Text = _language["label.conversation"];
        _messageLabel.Text = _language["label.message"];
        _rttStatusLabel.Text = _language["label.rtt_status"];
        _rttEnabledCheckBox.Text = _language["option.rtt_live"];
        _xmppTlsCheckBox.Text = _language["option.tls"];
        _connectButton.Text = _language["button.connect"];
        _xmppLoginButton.Text = _language["button.xmpp_login"];
        _resetButton.Text = _language["button.reset"];
        _statusLabel.Text = _language["status.disconnected"];
        _localTextBox.PlaceholderText = _language["placeholder.local"];
        _remoteTextBox.PlaceholderText = _language["placeholder.remote"];
    }

    private void ApplyTheme()
    {
        var back = Color.FromArgb(15, 23, 42);
        var panel = Color.FromArgb(30, 41, 59);
        var fore = Color.FromArgb(226, 232, 240);
        var accent = Color.FromArgb(96, 165, 250);

        BackColor = back;
        ForeColor = fore;

        foreach (Control control in GetAllControls(this))
        {
            control.ForeColor = fore;

            if (control is TextBox textBox)
            {
                textBox.BackColor = panel;
                textBox.ForeColor = fore;
                textBox.BorderStyle = BorderStyle.FixedSingle;
            }
            else if (control is Button button)
            {
                button.FlatStyle = FlatStyle.Flat;
                button.FlatAppearance.BorderColor = accent;
                button.BackColor = Color.FromArgb(17, 24, 39);
            }
            else if (control is TableLayoutPanel)
            {
                control.BackColor = back;
            }
        }
    }

    private async Task ToggleConnectionAsync()
    {
        if (_client?.State == WebSocketState.Open)
        {
            await DisconnectAsync();
            return;
        }

        await ConnectAsync();
    }

    private async Task ConnectAsync()
    {
        try
        {
            _client = new ClientWebSocket();
            _receiveCancellation = new CancellationTokenSource();
            SetStatusKey("status.connecting");

            await _client.ConnectAsync(new Uri(_urlTextBox.Text), _receiveCancellation.Token);
            SetStatusKey("status.connected");
            _connectButton.Text = _language["button.disconnect"];
            _resetButton.Enabled = true;

            _ = ReceiveLoopAsync(_client, _receiveCancellation.Token);
            await SendResetAsync();
        }
        catch (Exception ex)
        {
            SetStatusKey("status.connection_failed");
            AppendLog(ex.Message);
            await DisconnectAsync();
        }
    }

    private async Task LoginXmppAsync()
    {
        _xmppLoginButton.Enabled = false;
        SetStatusKey("status.connecting");

        try
        {
            await DisposeXmppClientAsync();

            if (!int.TryParse(_xmppPortTextBox.Text, out var port))
            {
                throw new InvalidOperationException(_language["status.invalid_port"]);
            }

            var account = XmppAddress.Parse(_jidTextBox.Text);
            var settings = new XmppConnectionSettings(
                account,
                _xmppHostTextBox.Text,
                port,
                _xmppTlsCheckBox.Checked);

            _xmppClient = new XmppStreamClient(settings);
            _xmppClient.RawXmlSent += xml => BeginInvoke(() => AppendLog("C: " + xml));
            _xmppClient.RawXmlReceived += xml => BeginInvoke(() => AppendLog("S: " + xml));

            var login = await _xmppClient.LoginAsync(account.LocalPart ?? account.Bare, _xmppPasswordTextBox.Text);
            AppendLog(string.Format(_language["log.xmpp_login_ok"], login.BoundJid.Full, login.SaslMechanism));
            SetStatusKey("status.connected");
        }
        catch (Exception ex)
        {
            SetStatusKey("status.connection_failed");
            AppendLog(ex.Message);
            await DisposeXmppClientAsync();
        }
        finally
        {
            _xmppLoginButton.Enabled = true;
        }
    }

    private async Task DisconnectAsync()
    {
        _receiveCancellation?.Cancel();

        if (_client is { State: WebSocketState.Open })
        {
            try
            {
                await _client.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
            }
            catch (WebSocketException)
            {
            }
        }

        _client?.Dispose();
        _client = null;
        _receiveCancellation?.Dispose();
        _receiveCancellation = null;
        await DisposeXmppClientAsync();

        SetStatusKey("status.disconnected");
        _connectButton.Text = _language["button.connect"];
        _resetButton.Enabled = false;
    }

    private async Task DisposeXmppClientAsync()
    {
        if (_xmppClient is null)
        {
            return;
        }

        await _xmppClient.DisposeAsync();
        _xmppClient = null;
    }

    private async Task LocalTextChangedAsync()
    {
        if (_isApplyingRemoteText || !_conversationOptions.RealTimeTextEnabled || _client?.State != WebSocketState.Open)
        {
            return;
        }

        await SendPacketAsync(_composer.Replace(_localTextBox.Text), _localTextBox.Text);
    }

    private async Task LocalKeyUpAsync(KeyEventArgs eventArgs)
    {
        if (_conversationOptions.RealTimeTextEnabled
            || !_conversationOptions.SendMessageSnapshotOnEnter
            || eventArgs.KeyCode != Keys.Enter
            || _client?.State != WebSocketState.Open)
        {
            return;
        }

        await SendTextMessageAsync(_localTextBox.Text);
    }

    private async Task RttModeChangedAsync()
    {
        _conversationOptions = _conversationOptions.WithRealTimeText(_rttEnabledCheckBox.Checked);

        if (_client?.State != WebSocketState.Open)
        {
            return;
        }

        if (_rttEnabledCheckBox.Checked)
        {
            await SendResetAsync();
        }
        else
        {
            await SendPacketAsync(_composer.Cancel(), _localTextBox.Text);
            AppendLog(_language["log.rtt_disabled"]);
        }
    }

    private async Task SendResetAsync()
    {
        if (_client?.State != WebSocketState.Open)
        {
            return;
        }

        await SendPacketAsync(_composer.Reset(_localTextBox.Text), _localTextBox.Text);
    }

    private async Task SendPacketAsync(RttPacket packet, string text)
    {
        if (_client?.State != WebSocketState.Open)
        {
            return;
        }

        var envelope = RttJsonEnvelope.FromPacket(packet, text);
        var json = envelope.ToJson();
        var bytes = Encoding.UTF8.GetBytes(json);
        await _client.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
        AppendLog(envelope.Xml);
    }

    private async Task SendTextMessageAsync(string text)
    {
        if (_client?.State != WebSocketState.Open)
        {
            return;
        }

        var envelope = RttJsonEnvelope.FromTextMessage(text);
        var json = envelope.ToJson();
        var bytes = Encoding.UTF8.GetBytes(json);
        await _client.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
        AppendLog(_language["log.message_sent"]);
    }

    private async Task ReceiveLoopAsync(ClientWebSocket client, CancellationToken cancellationToken)
    {
        var buffer = new byte[8192];

        try
        {
            while (!cancellationToken.IsCancellationRequested && client.State == WebSocketState.Open)
            {
                var builder = new StringBuilder();
                WebSocketReceiveResult result;
                do
                {
                    result = await client.ReceiveAsync(buffer, cancellationToken);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        BeginInvoke(async () => await DisconnectAsync());
                        return;
                    }

                    builder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                }
                while (!result.EndOfMessage);

                ApplyRemoteMessage(builder.ToString());
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (WebSocketException ex)
        {
            BeginInvoke(() =>
            {
                AppendLog(ex.Message);
                SetStatusKey("status.disconnected");
            });
        }
    }

    private void ApplyRemoteMessage(string json)
    {
        if (!RttJsonEnvelope.TryParse(json, out var envelope) || envelope is null)
        {
            return;
        }

        BeginInvoke(() =>
        {
            if (envelope.Type == "message")
            {
                _remoteState.AcceptFinalBody(envelope.Text);
                _remoteTextBox.Text = _remoteState.Text;
                AppendLog(_language["log.message_received"]);
                return;
            }

            var packet = RttPacket.Parse(envelope.Xml);
            if (!_remoteState.Apply(packet))
            {
                _remoteState.AcceptFinalBody(envelope.Text);
                AppendLog(_language["log.rtt_out_of_sync"]);
            }

            _isApplyingRemoteText = true;
            _remoteTextBox.Text = _remoteState.Text;
            _isApplyingRemoteText = false;
            AppendLog(envelope.Xml);
        });
    }

    private void SetStatusKey(string key)
    {
        _statusLabel.Text = _language[key];
    }

    private void AppendLog(string text)
    {
        if (string.IsNullOrEmpty(_logTextBox.Text))
        {
            _logTextBox.Text = text;
            return;
        }

        _logTextBox.AppendText(Environment.NewLine + text);
    }

    private static IEnumerable<Control> GetAllControls(Control root)
    {
        foreach (Control child in root.Controls)
        {
            yield return child;
            foreach (var nested in GetAllControls(child))
            {
                yield return nested;
            }
        }
    }
}
