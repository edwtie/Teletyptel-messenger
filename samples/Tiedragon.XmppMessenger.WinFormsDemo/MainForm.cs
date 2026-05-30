using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Tiedragon.LngPdk;
using Tiedragon.XmppMessenger.Core.Messaging;
using Tiedragon.XmppMessenger.Core.Rtt;
using Tiedragon.XmppMessenger.Core.Xmpp;

namespace Tiedragon.XmppMessenger.WinFormsDemo;

public sealed class MainForm : Form
{
    private static readonly JsonSerializerOptions SettingsJsonOptions = new() { WriteIndented = true };
    private static readonly JsonSerializerOptions WebViewJsonOptions = new(JsonSerializerDefaults.Web);

    private LanguageCatalog _language = LanguageCatalog.Load("ned");
    private string _languageCode = "ned";

    private readonly MenuStrip _menuStrip = new();
    private readonly ToolStripMenuItem _fileMenu = new();
    private readonly ToolStripMenuItem _connectMenuItem = new();
    private readonly ToolStripMenuItem _disconnectMenuItem = new() { Enabled = false };
    private readonly ToolStripMenuItem _createAccountMenuItem = new();
    private readonly ToolStripMenuItem _settingsMenuItem = new();
    private readonly ToolStripMenuItem _exitMenuItem = new();
    private readonly ToolStripMenuItem _conversationMenu = new();
    private readonly ToolStripMenuItem _newConversationMenuItem = new();
    private readonly ToolStripMenuItem _newGroupMenuItem = new();
    private readonly ToolStripMenuItem _inviteToGroupMenuItem = new();
    private readonly ToolStripMenuItem _blockConversationMenuItem = new() { Enabled = false };
    private readonly ToolStripMenuItem _resetRttMenuItem = new() { Enabled = false };
    private readonly ToolStripMenuItem _viewMenu = new();
    private readonly ToolStripMenuItem _languageMenu = new();
    private readonly ToolStripMenuItem _dutchLanguageMenuItem = new();
    private readonly ToolStripMenuItem _englishLanguageMenuItem = new();
    private readonly ToolStripMenuItem _themeMenu = new();
    private readonly ToolStripMenuItem _darkThemeMenuItem = new();
    private readonly ToolStripMenuItem _lightThemeMenuItem = new();
    private readonly ToolStripMenuItem _debugMenuItem = new() { Checked = false, CheckOnClick = true };
    private readonly ToolStripMenuItem _helpMenu = new();
    private readonly ToolStripMenuItem _aboutMenuItem = new();

    private readonly StatusStrip _statusStrip = new();
    private readonly ToolStripStatusLabel _statusStripLabel = new();

    private readonly ListBox _conversationListBox = new();
    private readonly Button _addConversationButton = new();
    private readonly Button _newGroupButton = new();
    private readonly Button _inviteToGroupButton = new();
    private readonly Button _blockConversationButton = new();
    private readonly Label _conversationListTitleLabel = new();

    private readonly Label _activeConversationTitleLabel = new();
    private readonly Label _activeConversationMetaLabel = new();
    private readonly WebView2 _timelineWebView = new();
    private readonly TextBox _timelineTextBox = new() { Multiline = true, ScrollBars = ScrollBars.Vertical, ReadOnly = true };
    private readonly TextBox _localTextBox = new() { Multiline = true, ScrollBars = ScrollBars.Vertical, AcceptsReturn = true };
    private readonly Button _sendButton = new();
    private readonly CheckBox _rttEnabledCheckBox = new() { Checked = true, AutoSize = true };
    private readonly Button _resetButton = new() { Enabled = false };
    private readonly Button _settingsButton = new();
    private readonly Button _createAccountButton = new();
    private readonly TextBox _logTextBox = new() { Multiline = true, ScrollBars = ScrollBars.Vertical, ReadOnly = true };

    private readonly GroupBox _connectionGroupBox = new();
    private readonly GroupBox _xmppGroupBox = new();
    private readonly GroupBox _debugGroupBox = new();
    private readonly Label _nameLabel = new() { AutoSize = true };
    private readonly Label _jidLabel = new() { AutoSize = true };
    private readonly Label _peerLabel = new() { AutoSize = true };
    private readonly Label _webSocketLabel = new() { AutoSize = true };
    private readonly Label _xmppHostLabel = new() { AutoSize = true };
    private readonly Label _xmppPortLabel = new() { AutoSize = true };
    private readonly Label _xmppPasswordLabel = new() { AutoSize = true };
    private readonly Label _statusLabel = new() { AutoSize = true };
    private readonly TextBox _displayNameTextBox = new() { Text = "Edward" };
    private readonly TextBox _jidTextBox = new() { Text = "edward@localhost/windows" };
    private readonly TextBox _peerTextBox = new() { Text = "relay@localhost" };
    private readonly TextBox _urlTextBox = new() { Text = "ws://127.0.0.1:8787" };
    private readonly TextBox _xmppHostTextBox = new() { Text = "localhost" };
    private readonly TextBox _xmppPortTextBox = new() { Text = "5222" };
    private readonly TextBox _xmppPasswordTextBox = new() { UseSystemPasswordChar = true };
    private readonly Button _connectButton = new();
    private readonly Button _xmppLoginButton = new();
    private readonly CheckBox _xmppTlsCheckBox = new() { Checked = false, AutoSize = true };
    private readonly CheckBox _xmppDirectTlsCheckBox = new() { Checked = false, AutoSize = true };

    private readonly RttComposer _composer = new();
    private readonly RttMessageState _remoteState = new();
    private readonly Dictionary<string, List<string>> _conversationLinesByPeer = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _blockedPeers = new(StringComparer.OrdinalIgnoreCase);

    private ClientWebSocket? _client;
    private XmppStreamClient? _xmppClient;
    private CancellationTokenSource? _receiveCancellation;
    private ConversationOptions _conversationOptions = ConversationOptions.Default;
    private bool _isApplyingRemoteText;
    private bool _isClosing;
    private Form? _settingsDialog;
    private Tiedragon.XmppMessenger.AccountRegistration.RegistrationForm? _accountRegistrationDialog;
    private RowStyle? _debugRowStyle;
    private MessengerSettings? _settingsSnapshot;
    private string _activePeer = string.Empty;
    private bool _isDarkTheme = true;
    private bool _timelineWebViewReady;
    private string? _pendingTimelineJson;

    public MainForm()
    {
        MinimumSize = new Size(1100, 720);
        Size = new Size(1180, 760);
        StartPosition = FormStartPosition.CenterScreen;

        LoadSavedSettings();
        BuildLayout();
        ApplyLanguage();
        InitializeConversations();
        ApplyTheme();

        _connectButton.Click += async (_, _) => await ToggleConnectionAsync();
        _connectMenuItem.Click += async (_, _) => await ConnectAsync();
        _disconnectMenuItem.Click += async (_, _) => await DisconnectAsync();
        _settingsButton.Click += (_, _) => ShowSettingsDialog();
        _settingsMenuItem.Click += (_, _) => ShowSettingsDialog();
        _createAccountMenuItem.Click += (_, _) => ShowAccountRegistrationDialog();
        _createAccountButton.Click += (_, _) => ShowAccountRegistrationDialog();
        _exitMenuItem.Click += (_, _) => Close();
        _xmppLoginButton.Click += async (_, _) => await LoginXmppAsync();
        _resetButton.Click += async (_, _) => await SendResetAsync();
        _resetRttMenuItem.Click += async (_, _) => await SendResetAsync();
        _sendButton.Click += async (_, _) => await SendCurrentMessageAsync();
        _addConversationButton.Click += (_, _) => AddConversationFromPeer();
        _newGroupButton.Click += (_, _) => ShowNewGroupDialog();
        _inviteToGroupButton.Click += async (_, _) => await ShowInviteDialogAsync();
        _blockConversationButton.Click += async (_, _) => await ToggleBlockSelectedConversationAsync();
        _newConversationMenuItem.Click += (_, _) => AddConversationFromPeer();
        _newGroupMenuItem.Click += (_, _) => ShowNewGroupDialog();
        _inviteToGroupMenuItem.Click += async (_, _) => await ShowInviteDialogAsync();
        _blockConversationMenuItem.Click += async (_, _) => await ToggleBlockSelectedConversationAsync();
        _darkThemeMenuItem.Click += (_, _) => SetTheme(true);
        _lightThemeMenuItem.Click += (_, _) => SetTheme(false);
        _dutchLanguageMenuItem.Click += (_, _) => SetLanguage("ned");
        _englishLanguageMenuItem.Click += (_, _) => SetLanguage("eng");
        _debugMenuItem.CheckedChanged += (_, _) => UpdateDebugVisibility();
        _localTextBox.TextChanged += async (_, _) => await LocalTextChangedAsync();
        _localTextBox.KeyDown += async (_, eventArgs) => await LocalKeyDownAsync(eventArgs);
        _rttEnabledCheckBox.CheckedChanged += async (_, _) => await RttModeChangedAsync();
        _conversationListBox.SelectedIndexChanged += (_, _) => SelectConversationFromList();
        Shown += async (_, _) => await InitializeTimelineWebViewAsync();
        FormClosing += async (_, _) =>
        {
            _isClosing = true;
            _settingsDialog?.Dispose();
            _accountRegistrationDialog?.Dispose();
            await DisconnectAsync();
        };
        FormClosed += (_, _) =>
        {
            _settingsDialog?.Dispose();
            _accountRegistrationDialog?.Dispose();
        };
    }

    private void BuildLayout()
    {
        MainMenuStrip = _menuStrip;

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));

        BuildMenu();
        BuildStatusStrip();

        var mainSplit = new SplitContainer
        {
            Dock = DockStyle.Fill,
            FixedPanel = FixedPanel.Panel1,
            SplitterWidth = 6,
            SplitterDistance = 285,
            Panel1MinSize = 260,
            Panel2MinSize = 640
        };

        mainSplit.Panel1.Controls.Add(BuildConversationListPanel());
        mainSplit.Panel2.Controls.Add(BuildChatPanel());

        root.Controls.Add(_menuStrip, 0, 0);
        root.Controls.Add(mainSplit, 0, 1);
        root.Controls.Add(_statusStrip, 0, 2);
        Controls.Add(root);
    }

    private void BuildMenu()
    {
        _fileMenu.DropDownItems.AddRange([
            _connectMenuItem,
            _disconnectMenuItem,
            new ToolStripSeparator(),
            _createAccountMenuItem,
            _settingsMenuItem,
            new ToolStripSeparator(),
            _exitMenuItem
        ]);

        _conversationMenu.DropDownItems.AddRange([
            _newConversationMenuItem,
            _newGroupMenuItem,
            _inviteToGroupMenuItem,
            new ToolStripSeparator(),
            _blockConversationMenuItem,
            new ToolStripSeparator(),
            _resetRttMenuItem
        ]);

        _themeMenu.DropDownItems.AddRange([
            _darkThemeMenuItem,
            _lightThemeMenuItem
        ]);
        _languageMenu.DropDownItems.AddRange([
            _dutchLanguageMenuItem,
            _englishLanguageMenuItem
        ]);
        _viewMenu.DropDownItems.AddRange([
            _languageMenu,
            _themeMenu,
            new ToolStripSeparator(),
            _debugMenuItem
        ]);
        _helpMenu.DropDownItems.Add(_aboutMenuItem);
        _aboutMenuItem.Click += (_, _) => MessageBox.Show(this, T("about.text", "Tiedragon Teletyptel Windows messenger preview."), T("about.title", "About"));

        _menuStrip.Items.AddRange([
            _fileMenu,
            _conversationMenu,
            _viewMenu,
            _helpMenu
        ]);
    }

    private void BuildStatusStrip()
    {
        _statusStrip.Items.Add(_statusStripLabel);
    }

    private Control BuildConversationListPanel()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 6,
            Padding = new Padding(14, 12, 20, 12)
        };
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));

        _conversationListTitleLabel.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
        _conversationListBox.Dock = DockStyle.Fill;
        _conversationListBox.IntegralHeight = false;
        _conversationListBox.BorderStyle = BorderStyle.None;
        _conversationListBox.DrawMode = DrawMode.OwnerDrawFixed;
        _conversationListBox.ItemHeight = 44;
        _conversationListBox.DrawItem += DrawConversationListItem;
        ConfigureSidebarButton(_addConversationButton);
        ConfigureSidebarButton(_newGroupButton);
        ConfigureSidebarButton(_inviteToGroupButton);
        ConfigureSidebarButton(_blockConversationButton);

        panel.Controls.Add(_conversationListTitleLabel, 0, 0);
        panel.Controls.Add(_conversationListBox, 0, 1);
        panel.Controls.Add(_addConversationButton, 0, 2);
        panel.Controls.Add(_newGroupButton, 0, 3);
        panel.Controls.Add(_inviteToGroupButton, 0, 4);
        panel.Controls.Add(_blockConversationButton, 0, 5);
        return panel;
    }

    private static void ConfigureSidebarButton(Button button)
    {
        button.Dock = DockStyle.Fill;
        button.Margin = new Padding(0, 5, 0, 5);
        button.MinimumSize = new Size(0, 32);
        button.AutoEllipsis = true;
        button.TextAlign = ContentAlignment.MiddleCenter;
    }

    private Control BuildChatPanel()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4,
            Padding = new Padding(12)
        };
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 132));
        _debugRowStyle = new RowStyle(SizeType.Absolute, 0);
        panel.RowStyles.Add(_debugRowStyle);

        var header = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 4,
            RowCount = 2
        };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 116));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 116));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 130));
        header.RowStyles.Add(new RowStyle(SizeType.Percent, 58));
        header.RowStyles.Add(new RowStyle(SizeType.Percent, 42));
        _activeConversationTitleLabel.Font = new Font("Segoe UI", 15F, FontStyle.Bold);
        _activeConversationMetaLabel.AutoEllipsis = true;
        _statusLabel.Anchor = AnchorStyles.Right;
        _connectButton.Dock = DockStyle.Fill;
        _settingsButton.Dock = DockStyle.Fill;
        header.Controls.Add(_activeConversationTitleLabel, 0, 0);
        header.Controls.Add(_activeConversationMetaLabel, 0, 1);
        header.Controls.Add(_connectButton, 1, 0);
        header.Controls.Add(_settingsButton, 2, 0);
        header.Controls.Add(_statusLabel, 3, 0);
        header.SetRowSpan(_statusLabel, 2);

        var composer = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            Padding = new Padding(0, 8, 0, 0)
        };
        composer.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        composer.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));

        var composerActions = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false
        };
        _sendButton.Width = 112;
        _resetButton.Width = 112;
        _rttEnabledCheckBox.Margin = new Padding(12, 8, 12, 0);
        composerActions.Controls.Add(_sendButton);
        composerActions.Controls.Add(_resetButton);
        composerActions.Controls.Add(_rttEnabledCheckBox);

        composer.Controls.Add(_localTextBox, 0, 0);
        composer.Controls.Add(composerActions, 0, 1);

        var timelineHost = new Panel { Dock = DockStyle.Fill };
        _timelineWebView.Dock = DockStyle.Fill;
        _timelineWebView.Visible = false;
        _timelineTextBox.Dock = DockStyle.Fill;
        timelineHost.Controls.Add(_timelineWebView);
        timelineHost.Controls.Add(_timelineTextBox);
        _localTextBox.Dock = DockStyle.Fill;
        _logTextBox.Dock = DockStyle.Fill;

        _debugGroupBox.Controls.Add(_logTextBox);
        _debugGroupBox.Padding = new Padding(10, 20, 10, 10);
        _debugGroupBox.Visible = false;
        _logTextBox.BorderStyle = BorderStyle.None;

        panel.Controls.Add(header, 0, 0);
        panel.Controls.Add(timelineHost, 0, 1);
        panel.Controls.Add(composer, 0, 2);
        panel.Controls.Add(_debugGroupBox, 0, 3);
        return panel;
    }

    private Control BuildSettingsPanel()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            Padding = new Padding(12)
        };
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 58));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 42));

        _connectionGroupBox.Dock = DockStyle.Fill;
        _xmppGroupBox.Dock = DockStyle.Fill;
        _connectionGroupBox.Controls.Clear();
        _xmppGroupBox.Controls.Clear();
        _connectionGroupBox.Controls.Add(BuildConnectionSettings());
        _xmppGroupBox.Controls.Add(BuildXmppSettings());
        panel.Controls.Add(_connectionGroupBox, 0, 0);
        panel.Controls.Add(_xmppGroupBox, 0, 1);
        return panel;
    }

    private async Task InitializeTimelineWebViewAsync()
    {
        if (_timelineWebViewReady)
        {
            return;
        }

        try
        {
            ApplyWebViewTheme();
            await _timelineWebView.EnsureCoreWebView2Async();
            _timelineWebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _timelineWebView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _timelineWebView.CoreWebView2.Settings.IsZoomControlEnabled = false;
            ApplyWebViewTheme();
            _timelineWebView.CoreWebView2.NavigationCompleted += (_, _) =>
            {
                _timelineWebViewReady = true;
                _timelineTextBox.Visible = false;
                _timelineWebView.Visible = true;
                FlushTimelinePayload();
            };
            _timelineWebView.NavigateToString(BuildTimelineShellHtml());
        }
        catch (Exception ex)
        {
            _timelineWebViewReady = false;
            _timelineWebView.Visible = false;
            _timelineTextBox.Visible = true;
            AppendLog("WebView2: " + ex.Message);
        }
    }

    private void ApplyWebViewTheme()
    {
        _timelineWebView.DefaultBackgroundColor = _isDarkTheme ? Color.FromArgb(11, 18, 32) : Color.White;
        if (_timelineWebView.CoreWebView2 is null)
        {
            return;
        }

        _timelineWebView.CoreWebView2.Profile.PreferredColorScheme = _isDarkTheme
            ? CoreWebView2PreferredColorScheme.Dark
            : CoreWebView2PreferredColorScheme.Light;
    }

    private void ShowSettingsDialog()
    {
        _settingsSnapshot = CaptureSettings();
        if (_settingsDialog is { IsDisposed: false })
        {
            _settingsDialog.Show(this);
            _settingsDialog.Activate();
            return;
        }

        _settingsDialog = new Form
        {
            Text = T("button.settings", "Settings"),
            StartPosition = FormStartPosition.CenterParent,
            Size = new Size(520, 620),
            MinimumSize = new Size(460, 560),
            ShowInTaskbar = false
        };
        _settingsDialog.FormClosing += (_, eventArgs) =>
        {
            if (_isClosing)
            {
                return;
            }

            eventArgs.Cancel = true;
            RestoreSettings(_settingsSnapshot);
            _settingsDialog.Hide();
        };

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            Padding = new Padding(10)
        };
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));

        var saveButton = new Button
        {
            Text = T("button.save", "Save"),
            Dock = DockStyle.Right,
            Width = 110
        };
        saveButton.Click += (_, _) =>
        {
            SaveSettings();
            _settingsSnapshot = CaptureSettings();
            _settingsDialog.Hide();
        };

        var cancelButton = new Button
        {
            Text = T("button.cancel", "Cancel"),
            Dock = DockStyle.Right,
            Width = 110
        };
        cancelButton.Click += (_, _) =>
        {
            RestoreSettings(_settingsSnapshot);
            _settingsDialog.Hide();
        };

        var closeButton = new Button
        {
            Text = T("button.close", "Close"),
            Dock = DockStyle.Right,
            Width = 110
        };
        closeButton.Click += (_, _) => _settingsDialog.Hide();

        var footer = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false
        };
        footer.Controls.Add(saveButton);
        footer.Controls.Add(cancelButton);
        footer.Controls.Add(closeButton);

        root.Controls.Add(BuildSettingsPanel(), 0, 0);
        root.Controls.Add(footer, 0, 1);
        _settingsDialog.Controls.Add(root);
        ApplyThemeTo(_settingsDialog);
        _settingsDialog.Show(this);
    }

    private void ShowAccountRegistrationDialog()
    {
        if (_accountRegistrationDialog is { IsDisposed: false })
        {
            _accountRegistrationDialog.Show(this);
            _accountRegistrationDialog.Activate();
            return;
        }

        _accountRegistrationDialog = new Tiedragon.XmppMessenger.AccountRegistration.RegistrationForm
        {
            ShowInTaskbar = false
        };
        _accountRegistrationDialog.AccountRegistered += (_, account) => BeginInvoke(() => ApplyRegisteredAccount(account));
        _accountRegistrationDialog.FormClosed += (_, _) => _accountRegistrationDialog = null;
        _accountRegistrationDialog.Show(this);
    }

    private void ApplyRegisteredAccount(
        Tiedragon.XmppMessenger.AccountRegistration.RegistrationForm.AccountRegisteredEventArgs account)
    {
        _jidTextBox.Text = account.Jid;
        _xmppPasswordTextBox.Text = account.Password;
        _xmppHostTextBox.Text = account.Host;
        _xmppPortTextBox.Text = account.Port.ToString();
        _xmppTlsCheckBox.Checked = true;
        _xmppDirectTlsCheckBox.Checked = account.DirectTls;
        SaveSettings();
        SetStatusText(string.Format(
            T("status.account_registered", "Account ready: {0}"),
            account.Jid));
        AppendLog(string.Format(
            T("log.account_registered", "Account registration filled XMPP settings for {0}."),
            account.Jid));
    }

    private Control BuildConnectionSettings()
    {
        var table = CreateSettingsTable();
        AddLabeledControl(table, _nameLabel, _displayNameTextBox);
        AddLabeledControl(table, _jidLabel, _jidTextBox);
        AddLabeledControl(table, _peerLabel, _peerTextBox);
        AddLabeledControl(table, _webSocketLabel, _urlTextBox);
        return table;
    }

    private Control BuildXmppSettings()
    {
        var table = CreateSettingsTable();
        AddLabeledControl(table, _xmppHostLabel, _xmppHostTextBox);
        AddLabeledControl(table, _xmppPortLabel, _xmppPortTextBox);
        AddLabeledControl(table, _xmppPasswordLabel, _xmppPasswordTextBox);
        AddFullWidthControl(table, _xmppTlsCheckBox);
        AddFullWidthControl(table, _xmppDirectTlsCheckBox);
        AddFullWidthControl(table, _createAccountButton);
        AddFullWidthControl(table, _xmppLoginButton);
        return table;
    }

    private void LoadSavedSettings()
    {
        var path = SettingsFilePath();
        if (!File.Exists(path))
        {
            return;
        }

        try
        {
            var settings = JsonSerializer.Deserialize<MessengerSettings>(File.ReadAllText(path), SettingsJsonOptions);
            RestoreSettings(settings);
        }
        catch (JsonException)
        {
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    private void SaveSettings()
    {
        try
        {
            var path = SettingsFilePath();
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, JsonSerializer.Serialize(CaptureSettings(), SettingsJsonOptions));
            SetStatusText(T("status.settings_saved", "Settings saved"));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            AppendLog(ex.Message);
            SetStatusText(T("status.settings_save_failed", "Settings could not be saved"));
        }
    }

    private MessengerSettings CaptureSettings()
    {
        return new MessengerSettings
        {
            DisplayName = _displayNameTextBox.Text,
            Jid = _jidTextBox.Text,
            Peer = _peerTextBox.Text,
            WebSocketUrl = _urlTextBox.Text,
            XmppHost = _xmppHostTextBox.Text,
            XmppPort = _xmppPortTextBox.Text,
            XmppTls = _xmppTlsCheckBox.Checked,
            XmppDirectTls = _xmppDirectTlsCheckBox.Checked,
            Theme = _isDarkTheme ? "dark" : "light",
            Language = _languageCode,
            BlockedPeers = _blockedPeers.OrderBy(peer => peer, StringComparer.OrdinalIgnoreCase).ToArray()
        };
    }

    private void RestoreSettings(MessengerSettings? settings)
    {
        if (settings is null)
        {
            return;
        }

        _displayNameTextBox.Text = settings.DisplayName ?? string.Empty;
        _jidTextBox.Text = settings.Jid ?? string.Empty;
        _peerTextBox.Text = settings.Peer ?? string.Empty;
        _urlTextBox.Text = settings.WebSocketUrl ?? string.Empty;
        _xmppHostTextBox.Text = settings.XmppHost ?? string.Empty;
        _xmppPortTextBox.Text = settings.XmppPort ?? string.Empty;
        _xmppTlsCheckBox.Checked = settings.XmppTls;
        _xmppDirectTlsCheckBox.Checked = settings.XmppDirectTls;
        _blockedPeers.Clear();
        foreach (var peer in settings.BlockedPeers ?? [])
        {
            var normalized = NormalizeBlockedPeer(peer);
            if (!string.IsNullOrWhiteSpace(normalized))
            {
                _blockedPeers.Add(normalized);
            }
        }

        _isDarkTheme = !string.Equals(settings.Theme, "light", StringComparison.OrdinalIgnoreCase);
        LoadLanguage(NormalizeLanguageCode(settings.Language));
    }

    private static string SettingsFilePath()
    {
        return Path.Combine(Application.LocalUserAppDataPath, "settings.json");
    }

    private static TableLayoutPanel CreateSettingsTable()
    {
        var table = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 0,
            Padding = new Padding(10, 18, 10, 10)
        };
        return table;
    }

    private static void AddLabeledControl(TableLayoutPanel table, Label label, Control control)
    {
        var row = table.RowCount;
        table.RowCount += 2;
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, 20));
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        label.Dock = DockStyle.Fill;
        control.Dock = DockStyle.Fill;
        table.Controls.Add(label, 0, row);
        table.Controls.Add(control, 0, row + 1);
    }

    private static void AddFullWidthControl(TableLayoutPanel table, Control control)
    {
        var row = table.RowCount;
        table.RowCount++;
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        control.Dock = DockStyle.Fill;
        table.Controls.Add(control, 0, row);
    }

    private void ApplyLanguage()
    {
        var connected = _client?.State == WebSocketState.Open;
        Text = T("app.title", "Tiedragon XMPP Messenger");
        _fileMenu.Text = T("menu.file", "File");
        _connectMenuItem.Text = T("button.connect", "Connect");
        _disconnectMenuItem.Text = T("button.disconnect", "Disconnect");
        _createAccountMenuItem.Text = T("button.create_account", "Create account...");
        _exitMenuItem.Text = T("menu.exit", "Exit");
        _conversationMenu.Text = T("menu.conversation", "Conversation");
        _newConversationMenuItem.Text = T("menu.new_conversation", "New conversation");
        _newGroupMenuItem.Text = T("menu.new_group", "New group");
        _inviteToGroupMenuItem.Text = T("menu.invite_to_group", "Invite to group");
        _blockConversationMenuItem.Text = BlockActionText();
        _resetRttMenuItem.Text = T("button.reset", "Reset");
        _viewMenu.Text = T("menu.view", "View");
        _languageMenu.Text = T("menu.language", "Language");
        _dutchLanguageMenuItem.Text = T("language.dutch", "Nederlands");
        _englishLanguageMenuItem.Text = T("language.english", "English");
        _dutchLanguageMenuItem.Checked = string.Equals(_languageCode, "ned", StringComparison.OrdinalIgnoreCase);
        _englishLanguageMenuItem.Checked = string.Equals(_languageCode, "eng", StringComparison.OrdinalIgnoreCase);
        _themeMenu.Text = T("menu.theme", "Theme");
        _darkThemeMenuItem.Text = T("theme.black", "Black");
        _lightThemeMenuItem.Text = T("theme.white", "White");
        _debugMenuItem.Text = T("menu.debug", "Debug log");
        _helpMenu.Text = T("menu.help", "Help");
        _aboutMenuItem.Text = T("menu.about", "About");

        _conversationListTitleLabel.Text = T("label.conversations", "Conversations");
        _addConversationButton.Text = T("button.new_conversation", "New conversation");
        _newGroupButton.Text = T("button.new_group", "New group");
        _inviteToGroupButton.Text = T("button.invite_to_group", "Invite");
        _blockConversationButton.Text = BlockActionText();
        _connectionGroupBox.Text = T("section.connection", "Connection");
        _xmppGroupBox.Text = T("section.xmpp", "XMPP server");
        _debugGroupBox.Text = T("label.rtt_status", "RTT status");
        _nameLabel.Text = T("label.name", "Name");
        _jidLabel.Text = T("label.jid", "JID");
        _peerLabel.Text = T("label.peer", "Peer");
        _xmppHostLabel.Text = T("label.xmpp_host", "XMPP host");
        _xmppPortLabel.Text = T("label.xmpp_port", "Port");
        _xmppPasswordLabel.Text = T("label.password", "Password");
        _webSocketLabel.Text = T("label.websocket", "WebSocket");
        _rttEnabledCheckBox.Text = T("option.rtt_live", "RTT live");
        _xmppTlsCheckBox.Text = T("option.tls", "TLS");
        _xmppDirectTlsCheckBox.Text = T("option.direct_tls", "Direct TLS");
        _connectButton.Text = connected ? T("button.disconnect", "Disconnect") : T("button.connect", "Connect");
        _settingsButton.Text = T("button.settings", "Settings");
        _settingsMenuItem.Text = T("button.settings", "Settings");
        _createAccountButton.Text = T("button.create_account", "Create account...");
        _xmppLoginButton.Text = T("button.xmpp_login", "XMPP login");
        _resetButton.Text = T("button.reset", "Reset");
        _sendButton.Text = T("button.send", "Send");
        _statusLabel.Text = connected ? T("status.connected", "Connected") : T("status.disconnected", "Disconnected");
        _statusStripLabel.Text = _statusLabel.Text;
        _localTextBox.PlaceholderText = T("placeholder.local", "Type a message...");
        _timelineTextBox.PlaceholderText = T("placeholder.remote", "Messages appear here...");
        RefreshBuiltInConversationNames();
        if (!HasActiveConversation())
        {
            ShowNoConversationSelected();
        }
    }

    private void InitializeConversations()
    {
        if (_conversationListBox.Items.Count > 0)
        {
            return;
        }

        AddContact(T("conversation.relay", "Relay room"), "relay@localhost");
        AddContact(T("conversation.tester", "Tester"), "tester@localhost");
        AddGroup(T("conversation.support_group", "Support group"), "support@conference.localhost");
        ShowNoConversationSelected();
    }

    private void RefreshBuiltInConversationNames()
    {
        foreach (var item in _conversationListBox.Items.Cast<ConversationListItem>())
        {
            if (AddressMatches(item.Peer, "relay@localhost"))
            {
                item.Name = T("conversation.relay", "Relay room");
            }
            else if (AddressMatches(item.Peer, "tester@localhost"))
            {
                item.Name = T("conversation.tester", "Tester");
            }
            else if (AddressMatches(item.Peer, "support@conference.localhost"))
            {
                item.Name = T("conversation.support_group", "Support group");
            }
        }
    }

    private void ApplyTheme()
    {
        var back = _isDarkTheme ? Color.FromArgb(15, 23, 42) : Color.FromArgb(238, 242, 247);
        var side = _isDarkTheme ? Color.FromArgb(17, 24, 39) : Color.White;
        var input = _isDarkTheme ? Color.FromArgb(31, 41, 55) : Color.White;
        var fore = _isDarkTheme ? Color.FromArgb(226, 232, 240) : Color.FromArgb(15, 23, 42);
        var muted = _isDarkTheme ? Color.FromArgb(178, 190, 205) : Color.FromArgb(71, 85, 105);
        var accent = Color.FromArgb(96, 165, 250);
        var buttonBack = _isDarkTheme ? Color.FromArgb(22, 36, 58) : Color.FromArgb(237, 244, 255);
        var menuBack = _isDarkTheme ? Color.FromArgb(18, 27, 40) : Color.FromArgb(248, 250, 252);
        var timelineBack = _isDarkTheme ? Color.FromArgb(11, 18, 32) : Color.White;
        var localBack = _isDarkTheme ? Color.FromArgb(15, 25, 40) : Color.White;

        BackColor = back;
        ForeColor = fore;

        foreach (Control control in GetAllControls(this))
        {
            control.ForeColor = fore;

            switch (control)
            {
                case TextBox textBox:
                    textBox.BackColor = input;
                    textBox.ForeColor = fore;
                    textBox.BorderStyle = BorderStyle.FixedSingle;
                    break;
                case Button button:
                    button.FlatStyle = FlatStyle.Flat;
                    button.FlatAppearance.BorderColor = accent;
                    button.BackColor = buttonBack;
                    button.ForeColor = _isDarkTheme ? Color.White : fore;
                    break;
                case ListBox listBox:
                    listBox.BackColor = side;
                    listBox.ForeColor = fore;
                    break;
                case ComboBox comboBox:
                    comboBox.BackColor = input;
                    comboBox.ForeColor = fore;
                    comboBox.FlatStyle = FlatStyle.Flat;
                    break;
                case GroupBox groupBox:
                    groupBox.BackColor = back;
                    groupBox.ForeColor = fore;
                    break;
                case CheckBox checkBox:
                    checkBox.BackColor = back;
                    checkBox.ForeColor = fore;
                    break;
                case Label label:
                    label.BackColor = Color.Transparent;
                    if (label == _activeConversationMetaLabel)
                    {
                        label.ForeColor = muted;
                    }
                    break;
                case TableLayoutPanel or FlowLayoutPanel or SplitterPanel:
                    control.BackColor = back;
                    break;
            }
        }

        _menuStrip.BackColor = menuBack;
        _menuStrip.ForeColor = fore;
        _statusStrip.BackColor = menuBack;
        _statusStrip.ForeColor = fore;
        _timelineTextBox.BackColor = timelineBack;
        _localTextBox.BackColor = localBack;
        _conversationListBox.BackColor = side;
        _darkThemeMenuItem.Checked = _isDarkTheme;
        _lightThemeMenuItem.Checked = !_isDarkTheme;
        ApplyToolStripTheme(_menuStrip.Items, fore, menuBack);
        ApplyWebViewTheme();
        RenderConversationDraft(null, null);
        _conversationListBox.Invalidate();
    }

    private static void ApplyToolStripTheme(ToolStripItemCollection items, Color fore, Color back)
    {
        foreach (ToolStripItem item in items)
        {
            item.ForeColor = fore;
            item.BackColor = back;
            if (item is ToolStripMenuItem menuItem)
            {
                ApplyToolStripTheme(menuItem.DropDownItems, fore, back);
            }
        }
    }

    private void SetTheme(bool dark)
    {
        _isDarkTheme = dark;
        ApplyTheme();
        if (_settingsDialog is { IsDisposed: false })
        {
            ApplyThemeTo(_settingsDialog);
        }

        SaveSettings();
    }

    private void SetLanguage(string languageCode)
    {
        var normalizedCode = NormalizeLanguageCode(languageCode);
        if (string.Equals(_languageCode, normalizedCode, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        LoadLanguage(normalizedCode);
        ApplyLanguage();
        RenderConversationDraft(null, null);
        _conversationListBox.Invalidate();
        if (_settingsDialog is { IsDisposed: false })
        {
            _settingsDialog.Text = T("button.settings", "Settings");
            ApplyThemeTo(_settingsDialog);
        }

        SaveSettings();
    }

    private void LoadLanguage(string languageCode)
    {
        _languageCode = NormalizeLanguageCode(languageCode);
        _language = LanguageCatalog.Load(_languageCode);
    }

    private static string NormalizeLanguageCode(string? languageCode)
    {
        return languageCode?.Trim().ToLowerInvariant() switch
        {
            "en" or "eng" => "eng",
            "nl" or "ned" => "ned",
            _ => "ned"
        };
    }

    private void ApplyThemeTo(Control root)
    {
        var back = _isDarkTheme ? Color.FromArgb(15, 23, 42) : Color.FromArgb(238, 242, 247);
        var side = _isDarkTheme ? Color.FromArgb(17, 24, 39) : Color.White;
        var input = _isDarkTheme ? Color.FromArgb(31, 41, 55) : Color.White;
        var fore = _isDarkTheme ? Color.FromArgb(226, 232, 240) : Color.FromArgb(15, 23, 42);
        var accent = Color.FromArgb(96, 165, 250);
        var buttonBack = _isDarkTheme ? Color.FromArgb(22, 36, 58) : Color.FromArgb(237, 244, 255);

        root.BackColor = back;
        root.ForeColor = fore;

        foreach (Control control in GetAllControls(root))
        {
            control.ForeColor = fore;

            switch (control)
            {
                case TextBox textBox:
                    textBox.BackColor = input;
                    textBox.ForeColor = fore;
                    textBox.BorderStyle = BorderStyle.FixedSingle;
                    break;
                case Button button:
                    button.FlatStyle = FlatStyle.Flat;
                    button.FlatAppearance.BorderColor = accent;
                    button.BackColor = buttonBack;
                    button.ForeColor = _isDarkTheme ? Color.White : fore;
                    break;
                case ListBox listBox:
                    listBox.BackColor = side;
                    listBox.ForeColor = fore;
                    break;
                case ComboBox comboBox:
                    comboBox.BackColor = input;
                    comboBox.ForeColor = fore;
                    comboBox.FlatStyle = FlatStyle.Flat;
                    break;
                case GroupBox groupBox:
                    groupBox.BackColor = back;
                    groupBox.ForeColor = fore;
                    break;
                case CheckBox checkBox:
                    checkBox.BackColor = back;
                    checkBox.ForeColor = fore;
                    break;
                case Label label:
                    label.BackColor = Color.Transparent;
                    break;
                case TableLayoutPanel or FlowLayoutPanel or SplitterPanel:
                    control.BackColor = back;
                    break;
            }
        }
    }

    private void UpdateDebugVisibility()
    {
        _debugGroupBox.Visible = _debugMenuItem.Checked;
        if (_debugRowStyle is not null)
        {
            _debugRowStyle.Height = _debugMenuItem.Checked ? 112 : 0;
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
        if (_client?.State == WebSocketState.Open)
        {
            return;
        }

        try
        {
            _client = new ClientWebSocket();
            _receiveCancellation = new CancellationTokenSource();
            SetStatusKey("status.connecting");

            await _client.ConnectAsync(new Uri(_urlTextBox.Text), _receiveCancellation.Token);
            SetStatusKey("status.connected");
            SetConnectedState(true);

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
                throw new InvalidOperationException(T("status.invalid_port", "Invalid XMPP port"));
            }

            var account = XmppAddress.Parse(_jidTextBox.Text);
            var settings = new XmppConnectionSettings(
                account,
                _xmppHostTextBox.Text,
                port,
                _xmppTlsCheckBox.Checked || _xmppDirectTlsCheckBox.Checked,
                directTls: _xmppDirectTlsCheckBox.Checked);

            _xmppClient = new XmppStreamClient(settings);
            _xmppClient.RawXmlSent += xml => BeginInvoke(() => AppendLog("C: " + xml));
            _xmppClient.RawXmlReceived += xml => BeginInvoke(() => AppendLog("S: " + xml));

            var login = await _xmppClient.LoginAsync(account.LocalPart ?? account.Bare, _xmppPasswordTextBox.Text);
            AppendLog(string.Format(T("log.xmpp_login_ok", "XMPP login OK: {0} via {1}."), login.BoundJid.Full, login.SaslMechanism));
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
        SetConnectedState(false);
    }

    private void SetConnectedState(bool connected)
    {
        _connectButton.Text = connected ? T("button.disconnect", "Disconnect") : T("button.connect", "Connect");
        _connectMenuItem.Enabled = !connected;
        _disconnectMenuItem.Enabled = connected;

        SetInfrastructurePresence(connected ? ContactPresence.Online : ContactPresence.Offline);
        if (!connected)
        {
            SetAllContactPresence(ContactPresence.Offline);
        }

        UpdateConversationActions();
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
        if (_isApplyingRemoteText
            || !HasActiveConversation()
            || IsActivePeerBlocked()
            || !_conversationOptions.RealTimeTextEnabled
            || _client?.State != WebSocketState.Open)
        {
            return;
        }

        await SendPacketAsync(_composer.Replace(_localTextBox.Text), _localTextBox.Text);
    }

    private async Task LocalKeyDownAsync(KeyEventArgs eventArgs)
    {
        if (eventArgs.KeyCode != Keys.Enter || eventArgs.Shift)
        {
            return;
        }

        eventArgs.SuppressKeyPress = true;
        await SendCurrentMessageAsync();
    }

    private async Task RttModeChangedAsync()
    {
        _conversationOptions = _conversationOptions.WithRealTimeText(_rttEnabledCheckBox.Checked);

        if (!HasActiveConversation() || _client?.State != WebSocketState.Open)
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
            AppendLog(T("log.rtt_disabled", "RTT live disabled; sending normal message snapshots after Enter."));
        }
    }

    private async Task SendResetAsync()
    {
        if (!HasActiveConversation() || _client?.State != WebSocketState.Open)
        {
            return;
        }

        await SendPacketAsync(_composer.Reset(_localTextBox.Text), _localTextBox.Text);
    }

    private async Task SendCurrentMessageAsync()
    {
        var text = _localTextBox.Text.TrimEnd('\r', '\n');
        if (string.IsNullOrWhiteSpace(text) || !HasActiveConversation() || IsActivePeerBlocked() || _client?.State != WebSocketState.Open)
        {
            return;
        }

        await SendTextMessageAsync(text);
        SetPeerPresence(PeerJid(), ContactPresence.Online);
        AppendConversationLine(PeerJid(), CurrentSenderName(), text);

        _isApplyingRemoteText = true;
        _localTextBox.Clear();
        _isApplyingRemoteText = false;
        _composer.Reset(string.Empty);
    }

    private async Task SendPacketAsync(RttPacket packet, string text)
    {
        if (!HasActiveConversation() || IsActivePeerBlocked() || _client?.State != WebSocketState.Open)
        {
            return;
        }

        var envelope = RttJsonEnvelope.FromPacket(packet, text, LocalJid(), PeerJid());
        var json = envelope.ToJson();
        var bytes = Encoding.UTF8.GetBytes(json);
        await _client.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
        AppendLog(envelope.Xml);
    }

    private async Task SendTextMessageAsync(string text)
    {
        await SendTextMessageAsync(text, PeerJid());
    }

    private async Task SendTextMessageAsync(string text, string peer)
    {
        if (_client?.State != WebSocketState.Open || IsBlockedPeer(peer))
        {
            return;
        }

        var envelope = RttJsonEnvelope.FromTextMessage(text, LocalJid(), peer);
        var json = envelope.ToJson();
        var bytes = Encoding.UTF8.GetBytes(json);
        await _client.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
        AppendLog(T("log.message_sent", "Message snapshot sent."));
    }

    private string CurrentSenderName()
    {
        return string.IsNullOrWhiteSpace(_displayNameTextBox.Text) ? "Me" : _displayNameTextBox.Text.Trim();
    }

    private string LocalJid()
    {
        return string.IsNullOrWhiteSpace(_jidTextBox.Text)
            ? CurrentSenderName()
            : _jidTextBox.Text.Trim();
    }

    private string PeerJid()
    {
        if (!string.IsNullOrWhiteSpace(_activePeer))
        {
            return _activePeer;
        }

        return string.IsNullOrWhiteSpace(_peerTextBox.Text)
            ? "relay@localhost"
            : _peerTextBox.Text.Trim();
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
                SetConnectedState(false);
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
            if (!IsEnvelopeForThisClient(envelope))
            {
                return;
            }

            var from = string.IsNullOrWhiteSpace(envelope.From) ? "Remote" : envelope.From.Trim();
            var peer = IncomingConversationPeer(envelope, from);
            if (IsBlockedPeer(peer))
            {
                AppendLog(string.Format(T("log.blocked_message_ignored", "Blocked message ignored from {0}."), peer));
                return;
            }

            EnsureContactForPeer(peer);
            SetPeerPresence(peer, ContactPresence.Online);
            if (envelope.Type == "message")
            {
                AppendConversationLine(peer, from, envelope.Text);
                _remoteState.AcceptFinalBody(string.Empty);
                return;
            }

            var packet = RttPacket.Parse(envelope.Xml);
            if (!_remoteState.Apply(packet))
            {
                _remoteState.AcceptFinalBody(envelope.Text);
                AppendLog(T("log.rtt_out_of_sync", "Remote RTT stream out of sync; restored from envelope text snapshot."));
            }

            if (AddressMatches(peer, _activePeer))
            {
                RenderConversationDraft(from, _remoteState.Text);
            }

            AppendLog(envelope.Xml);
        });
    }

    private bool IsEnvelopeForThisClient(RttJsonEnvelope envelope)
    {
        if (AddressMatches(envelope.From, LocalJid()))
        {
            return false;
        }

        if (IsBlockedPeer(envelope.From))
        {
            return false;
        }

        return string.IsNullOrWhiteSpace(envelope.To)
            || AddressMatches(envelope.To, LocalJid())
            || AddressMatches(envelope.To, "relay@localhost")
            || IsKnownGroupPeer(envelope.To);
    }

    private static bool AddressMatches(string? left, string? right)
    {
        if (string.IsNullOrWhiteSpace(left) || string.IsNullOrWhiteSpace(right))
        {
            return false;
        }

        var first = left.Trim();
        var second = right.Trim();
        return string.Equals(first, second, StringComparison.OrdinalIgnoreCase)
            || string.Equals(BareJid(first), BareJid(second), StringComparison.OrdinalIgnoreCase);
    }

    private static string BareJid(string jid)
    {
        var slash = jid.IndexOf('/');
        return slash < 0 ? jid : jid[..slash];
    }

    private void AddConversationFromPeer()
    {
        var peer = PeerJid();
        EnsureContactForPeer(peer);
        SelectContact(peer);
    }

    private void ShowNewGroupDialog()
    {
        var groupNumber = _conversationListBox.Items.Cast<ConversationListItem>().Count(item => item.Kind == ConversationKind.Group) + 1;
        var defaultName = string.Format(T("conversation.group_default", "Group {0}"), groupNumber);
        var defaultRoom = $"group{groupNumber}@conference.localhost";

        using var dialog = new Form
        {
            Text = T("dialog.new_group", "New group"),
            StartPosition = FormStartPosition.CenterParent,
            Size = new Size(420, 230),
            MinimumSize = new Size(380, 220),
            ShowInTaskbar = false
        };

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 5,
            Padding = new Padding(14)
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var nameLabel = new Label { Text = T("label.group_name", "Group name"), Dock = DockStyle.Fill };
        var nameTextBox = new TextBox { Text = defaultName, Dock = DockStyle.Fill };
        var roomLabel = new Label { Text = T("label.group_room", "Room JID"), Dock = DockStyle.Fill };
        var roomTextBox = new TextBox { Text = defaultRoom, Dock = DockStyle.Fill };
        var footer = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        var createButton = new Button { Text = T("button.create", "Create"), Width = 110, DialogResult = DialogResult.OK };
        var cancelButton = new Button { Text = T("button.cancel", "Cancel"), Width = 110, DialogResult = DialogResult.Cancel };

        footer.Controls.Add(createButton);
        footer.Controls.Add(cancelButton);
        root.Controls.Add(nameLabel, 0, 0);
        root.Controls.Add(nameTextBox, 0, 1);
        root.Controls.Add(roomLabel, 0, 2);
        root.Controls.Add(roomTextBox, 0, 3);
        root.Controls.Add(footer, 0, 4);
        dialog.Controls.Add(root);
        dialog.AcceptButton = createButton;
        dialog.CancelButton = cancelButton;
        ApplyThemeTo(dialog);

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        var name = string.IsNullOrWhiteSpace(nameTextBox.Text) ? defaultName : nameTextBox.Text.Trim();
        var room = string.IsNullOrWhiteSpace(roomTextBox.Text) ? defaultRoom : roomTextBox.Text.Trim();
        AddGroup(name, room);
        SelectContact(room);
        SetStatusText(string.Format(T("status.group_created", "Group created: {0}"), name));
    }

    private async Task ShowInviteDialogAsync()
    {
        if (_conversationListBox.SelectedItem is not ConversationListItem group || group.Kind != ConversationKind.Group)
        {
            SetStatusText(T("status.select_group_first", "Select a group first"));
            return;
        }

        var contacts = _conversationListBox.Items
            .Cast<ConversationListItem>()
            .Where(item => item.Kind == ConversationKind.Contact)
            .ToList();
        if (contacts.Count == 0)
        {
            SetStatusText(T("status.no_contacts", "No contacts available"));
            return;
        }

        using var dialog = new Form
        {
            Text = T("dialog.invite_to_group", "Invite to group"),
            StartPosition = FormStartPosition.CenterParent,
            Size = new Size(420, 170),
            MinimumSize = new Size(380, 160),
            ShowInTaskbar = false
        };

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            Padding = new Padding(14)
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var label = new Label { Text = T("label.invite_contact", "Contact"), Dock = DockStyle.Fill };
        var comboBox = new ComboBox { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList };
        comboBox.Items.AddRange(contacts.Cast<object>().ToArray());
        comboBox.SelectedIndex = 0;

        var footer = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        var inviteButton = new Button { Text = T("button.invite", "Invite"), Width = 110, DialogResult = DialogResult.OK };
        var cancelButton = new Button { Text = T("button.cancel", "Cancel"), Width = 110, DialogResult = DialogResult.Cancel };
        footer.Controls.Add(inviteButton);
        footer.Controls.Add(cancelButton);

        root.Controls.Add(label, 0, 0);
        root.Controls.Add(comboBox, 0, 1);
        root.Controls.Add(footer, 0, 2);
        dialog.Controls.Add(root);
        dialog.AcceptButton = inviteButton;
        dialog.CancelButton = cancelButton;
        ApplyThemeTo(dialog);

        if (dialog.ShowDialog(this) == DialogResult.OK && comboBox.SelectedItem is ConversationListItem contact)
        {
            await InviteContactToGroupAsync(group, contact);
        }
    }

    private async Task InviteContactToGroupAsync(ConversationListItem group, ConversationListItem contact)
    {
        var inviteText = string.Format(
            T("message.group_invite", "{0} invited you to {1} ({2})."),
            CurrentSenderName(),
            group.Name,
            group.Peer);
        var statusText = string.Format(T("message.group_invite_sent", "Invitation sent to {0}."), contact.Name);

        AppendConversationLine(group.Peer, T("sender.system", "System"), statusText);
        AppendConversationLine(contact.Peer, T("sender.system", "System"), inviteText);
        await SendTextMessageAsync(inviteText, contact.Peer);
        SetStatusText(statusText);
    }

    private async Task ToggleBlockSelectedConversationAsync()
    {
        if (_conversationListBox.SelectedItem is not ConversationListItem item || !CanBlock(item))
        {
            SetStatusText(T("status.select_contact_first", "Select a contact first"));
            return;
        }

        var shouldBlock = !IsBlockedPeer(item.Peer);
        SetBlockedPeer(item.Peer, shouldBlock);
        if (shouldBlock)
        {
            RenderConversationDraft(null, null);
        }

        try
        {
            if (_xmppClient is not null)
            {
                var jid = XmppAddress.Parse(BareJid(item.Peer));
                if (shouldBlock)
                {
                    await _xmppClient.BlockUserAsync(jid, TimeSpan.FromSeconds(5), $"block-{Guid.NewGuid():N}");
                }
                else
                {
                    await _xmppClient.UnblockUserAsync(jid, TimeSpan.FromSeconds(5), $"unblock-{Guid.NewGuid():N}");
                }
            }
        }
        catch (Exception ex)
        {
            AppendLog(ex.Message);
        }

        SaveSettings();
        SetStatusText(string.Format(
            shouldBlock
                ? T("status.contact_blocked", "Contact blocked: {0}")
                : T("status.contact_unblocked", "Contact unblocked: {0}"),
            item.Name));
        if (AddressMatches(item.Peer, _activePeer))
        {
            _activeConversationMetaLabel.Text = IsBlockedPeer(item.Peer)
                ? $"{item.Peer} - {T("presence.blocked", "Blocked")}"
                : item.Peer;
        }

        _conversationListBox.Invalidate();
        UpdateConversationActions();
    }

    private void SelectConversationFromList()
    {
        if (_conversationListBox.SelectedItem is not ConversationListItem item)
        {
            ShowNoConversationSelected();
            return;
        }

        _peerTextBox.Text = item.Peer;
        _activePeer = item.Peer;
        _activeConversationTitleLabel.Text = item.Name;
        _activeConversationMetaLabel.Text = IsBlockedPeer(item.Peer)
            ? $"{item.Peer} - {T("presence.blocked", "Blocked")}"
            : item.Peer;
        EnsureConversation(item.Peer);
        _timelineTextBox.PlaceholderText = T("placeholder.remote", "Messages appear here...");
        RenderConversationDraft(null, null);
        UpdateConversationActions();
    }

    private void ShowNoConversationSelected()
    {
        _activePeer = string.Empty;
        _peerTextBox.Text = string.Empty;
        _activeConversationTitleLabel.Text = T("conversation.none_title", "Select a contact");
        _activeConversationMetaLabel.Text = T("conversation.none_meta", "Click a contact to open the chat room.");
        _timelineTextBox.PlaceholderText = T("placeholder.select_contact", "Select a contact to open a chat room...");
        RenderConversationDraft(null, null);
        _localTextBox.Clear();
        UpdateConversationActions();
    }

    private bool HasActiveConversation()
    {
        return !string.IsNullOrWhiteSpace(_activePeer);
    }

    private void UpdateConversationActions()
    {
        var hasActiveConversation = HasActiveConversation();
        var connected = _client?.State == WebSocketState.Open;
        var selectedGroup = _conversationListBox.SelectedItem is ConversationListItem item && item.Kind == ConversationKind.Group;
        var blocked = IsActivePeerBlocked();

        _localTextBox.Enabled = hasActiveConversation && !blocked;
        _rttEnabledCheckBox.Enabled = hasActiveConversation;
        _sendButton.Enabled = hasActiveConversation && connected && !blocked;
        _resetButton.Enabled = hasActiveConversation && connected && !blocked;
        _resetRttMenuItem.Enabled = hasActiveConversation && connected && !blocked;
        _inviteToGroupButton.Enabled = selectedGroup;
        _inviteToGroupMenuItem.Enabled = selectedGroup;
        _blockConversationButton.Enabled = _conversationListBox.SelectedItem is ConversationListItem selected && CanBlock(selected);
        _blockConversationButton.Text = BlockActionText();
        _blockConversationMenuItem.Enabled = _blockConversationButton.Enabled;
        _blockConversationMenuItem.Text = _blockConversationButton.Text;
    }

    private string BlockActionText()
    {
        return _conversationListBox.SelectedItem is ConversationListItem item && IsBlockedPeer(item.Peer)
            ? T("button.unblock_contact", "Unblock")
            : T("button.block_contact", "Block");
    }

    private static bool CanBlock(ConversationListItem item)
    {
        return item.Kind == ConversationKind.Contact
            && !AddressMatches(item.Peer, "relay@localhost");
    }

    private bool IsActivePeerBlocked()
    {
        return HasActiveConversation() && IsBlockedPeer(_activePeer);
    }

    private bool IsBlockedPeer(string? peer)
    {
        var normalized = NormalizeBlockedPeer(peer);
        return !string.IsNullOrWhiteSpace(normalized) && _blockedPeers.Contains(normalized);
    }

    private void SetBlockedPeer(string peer, bool blocked)
    {
        var normalized = NormalizeBlockedPeer(peer);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return;
        }

        if (blocked)
        {
            _blockedPeers.Add(normalized);
        }
        else
        {
            _blockedPeers.Remove(normalized);
        }
    }

    private static string NormalizeBlockedPeer(string? peer)
    {
        if (string.IsNullOrWhiteSpace(peer))
        {
            return string.Empty;
        }

        var bare = BareJid(peer.Trim()).ToLowerInvariant();
        return AddressMatches(bare, "relay@localhost") ? string.Empty : bare;
    }

    private void DrawConversationListItem(object? sender, DrawItemEventArgs e)
    {
        if (e.Index < 0 || e.Index >= _conversationListBox.Items.Count)
        {
            return;
        }

        if (_conversationListBox.Items[e.Index] is not ConversationListItem item)
        {
            return;
        }

        var selected = (e.State & DrawItemState.Selected) == DrawItemState.Selected;
        var back = selected ? Color.FromArgb(37, 99, 235) : _conversationListBox.BackColor;
        var fore = selected ? Color.White : _conversationListBox.ForeColor;
        var muted = selected ? Color.FromArgb(219, 234, 254) : _isDarkTheme ? Color.FromArgb(178, 190, 205) : Color.FromArgb(71, 85, 105);
        using var backBrush = new SolidBrush(back);
        using var presenceBrush = new SolidBrush(PresenceColor(item));

        e.Graphics.FillRectangle(backBrush, e.Bounds);
        var dotBounds = new Rectangle(e.Bounds.Left + 8, e.Bounds.Top + 15, 12, 12);
        e.Graphics.FillEllipse(presenceBrush, dotBounds);

        var nameBounds = new Rectangle(e.Bounds.Left + 28, e.Bounds.Top + 5, e.Bounds.Width - 34, 18);
        var statusBounds = new Rectangle(e.Bounds.Left + 28, e.Bounds.Top + 23, e.Bounds.Width - 34, 17);
        TextRenderer.DrawText(e.Graphics, item.Name, _conversationListBox.Font, nameBounds, fore, TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
        TextRenderer.DrawText(e.Graphics, PresenceText(item), _conversationListBox.Font, statusBounds, muted, TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
        e.DrawFocusRectangle();
    }

    private void AddContact(string name, string peer)
    {
        AddConversationItem(name, peer, ConversationKind.Contact);
    }

    private void AddGroup(string name, string peer)
    {
        AddConversationItem(name, peer, ConversationKind.Group);
    }

    private void AddConversationItem(string name, string peer, ConversationKind kind)
    {
        if (_conversationListBox.Items.Cast<ConversationListItem>().Any(item => AddressMatches(item.Peer, peer)))
        {
            return;
        }

        _conversationListBox.Items.Add(new ConversationListItem(name, peer, kind));
        EnsureConversation(peer);
    }

    private void EnsureContactForPeer(string peer)
    {
        if (_conversationListBox.Items.Cast<ConversationListItem>().Any(item => AddressMatches(item.Peer, peer)))
        {
            EnsureConversation(peer);
            return;
        }

        AddContact(DisplayNameFromJid(peer), BareJid(peer));
    }

    private void SetPeerPresence(string peer, ContactPresence presence)
    {
        if (IsBlockedPeer(peer))
        {
            return;
        }

        foreach (var item in _conversationListBox.Items.Cast<ConversationListItem>())
        {
            if (AddressMatches(item.Peer, peer))
            {
                item.Presence = presence;
                _conversationListBox.Invalidate();
                return;
            }
        }
    }

    private void SetAllContactPresence(ContactPresence presence)
    {
        foreach (var item in _conversationListBox.Items.Cast<ConversationListItem>())
        {
            if (item.Kind == ConversationKind.Contact)
            {
                item.Presence = presence;
            }
        }

        _conversationListBox.Invalidate();
    }

    private void SetInfrastructurePresence(ContactPresence presence)
    {
        foreach (var item in _conversationListBox.Items.Cast<ConversationListItem>())
        {
            if (item.Kind == ConversationKind.Group || AddressMatches(item.Peer, "relay@localhost"))
            {
                item.Presence = presence;
            }
        }

        _conversationListBox.Invalidate();
    }

    private string PresenceText(ConversationListItem item)
    {
        if (IsBlockedPeer(item.Peer))
        {
            return T("presence.blocked", "Blocked");
        }

        if (item.Kind == ConversationKind.Group)
        {
            return T("presence.group", "Group");
        }

        return item.Presence == ContactPresence.Online
            ? T("presence.online", "Online")
            : T("presence.offline", "Offline");
    }

    private Color PresenceColor(ConversationListItem item)
    {
        if (IsBlockedPeer(item.Peer))
        {
            return Color.FromArgb(239, 68, 68);
        }

        if (item.Kind == ConversationKind.Group)
        {
            return Color.FromArgb(96, 165, 250);
        }

        return item.Presence == ContactPresence.Online
            ? Color.FromArgb(34, 197, 94)
            : Color.FromArgb(239, 68, 68);
    }

    private bool IsKnownGroupPeer(string? peer)
    {
        return !string.IsNullOrWhiteSpace(peer)
            && _conversationListBox.Items.Cast<ConversationListItem>()
                .Any(item => item.Kind == ConversationKind.Group && AddressMatches(item.Peer, peer));
    }

    private void SelectContact(string? peer)
    {
        if (string.IsNullOrWhiteSpace(peer))
        {
            return;
        }

        for (var index = 0; index < _conversationListBox.Items.Count; index++)
        {
            if (_conversationListBox.Items[index] is ConversationListItem item && AddressMatches(item.Peer, peer))
            {
                _conversationListBox.SelectedIndex = index;
                return;
            }
        }
    }

    private List<string> EnsureConversation(string peer)
    {
        var key = ConversationKey(peer);
        if (!_conversationLinesByPeer.TryGetValue(key, out var lines))
        {
            lines = [];
            _conversationLinesByPeer[key] = lines;
        }

        return lines;
    }

    private void AppendConversationLine(string peer, string sender, string text)
    {
        EnsureConversation(peer).Add($"{DateTime.Now:HH:mm}  {sender}{Environment.NewLine}{text}");
        if (AddressMatches(peer, _activePeer))
        {
            RenderConversationDraft(null, null);
        }
    }

    private void RenderConversationDraft(string? sender, string? draft)
    {
        if (!HasActiveConversation())
        {
            _timelineTextBox.Clear();
            PostTimelinePayload(new
            {
                theme = _isDarkTheme ? "dark" : "light",
                smileyBaseUri = SmileyBaseUri(),
                placeholderTitle = T("conversation.none_title", "Select a contact"),
                placeholderText = T("conversation.none_meta", "Click a contact to open the chat room."),
                messages = Array.Empty<TimelineMessage>()
            });
            return;
        }

        var builder = new StringBuilder();
        var messages = new List<TimelineMessage>();
        foreach (var line in EnsureConversation(_activePeer))
        {
            if (builder.Length > 0)
            {
                builder.AppendLine();
                builder.AppendLine();
            }

            builder.Append(line);
            messages.Add(ParseTimelineMessage(line));
        }

        if (!string.IsNullOrWhiteSpace(draft))
        {
            if (builder.Length > 0)
            {
                builder.AppendLine();
                builder.AppendLine();
            }

            builder.Append(DateTime.Now.ToString("HH:mm"));
            builder.Append("  ");
            builder.Append(sender);
            builder.Append(" ");
            builder.AppendLine(T("message.typing", "is typing"));
            builder.Append(draft);
            messages.Add(new TimelineMessage(
                DateTime.Now.ToString("HH:mm"),
                sender ?? string.Empty,
                draft,
                T("message.typing", "is typing"),
                "peer",
                true));
        }

        _timelineTextBox.Text = builder.ToString();
        _timelineTextBox.SelectionStart = _timelineTextBox.TextLength;
        _timelineTextBox.ScrollToCaret();
        PostTimelinePayload(new
        {
            theme = _isDarkTheme ? "dark" : "light",
            smileyBaseUri = SmileyBaseUri(),
            placeholderTitle = T("placeholder.remote", "Messages appear here..."),
            placeholderText = _activeConversationMetaLabel.Text,
            messages
        });
    }

    private TimelineMessage ParseTimelineMessage(string line)
    {
        var parts = line.Split(["\r\n", "\n"], 2, StringSplitOptions.None);
        var header = parts.Length > 0 ? parts[0] : string.Empty;
        var text = parts.Length > 1 ? parts[1] : string.Empty;
        var separator = header.IndexOf("  ", StringComparison.Ordinal);
        var time = separator > 0 ? header[..separator].Trim() : DateTime.Now.ToString("HH:mm");
        var sender = separator > 0 ? header[(separator + 2)..].Trim() : header.Trim();
        var system = T("sender.system", "System");
        var direction = string.Equals(sender, CurrentSenderName(), StringComparison.OrdinalIgnoreCase)
            ? "self"
            : string.Equals(sender, system, StringComparison.OrdinalIgnoreCase) ? "system" : "peer";
        return new TimelineMessage(time, sender, text, string.Empty, direction, false);
    }

    private void PostTimelinePayload(object payload)
    {
        _pendingTimelineJson = JsonSerializer.Serialize(payload, WebViewJsonOptions);
        FlushTimelinePayload();
    }

    private void FlushTimelinePayload()
    {
        if (!_timelineWebViewReady || _timelineWebView.CoreWebView2 is null || string.IsNullOrWhiteSpace(_pendingTimelineJson))
        {
            return;
        }

        _timelineWebView.CoreWebView2.PostWebMessageAsJson(_pendingTimelineJson);
        _pendingTimelineJson = null;
    }

    private static string SmileyBaseUri()
    {
        var directory = Path.Combine(AppContext.BaseDirectory, "smileys");
        return new Uri(directory + Path.DirectorySeparatorChar).AbsoluteUri;
    }

    private static string BuildTimelineShellHtml()
    {
        return """
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1220;
      --panel: #142038;
      --panel-soft: #18253a;
      --text: #e5eefb;
      --muted: #9fb1c8;
      --line: #314159;
      --self: #123f30;
      --peer: #1e293b;
      --system: #17223a;
      --accent: #60a5fa;
    }

    body[data-theme="light"] {
      color-scheme: light;
      --bg: #ffffff;
      --panel: #f8fafc;
      --panel-soft: #edf4ff;
      --text: #0f172a;
      --muted: #475569;
      --line: #cbd5e1;
      --self: #dcfce7;
      --peer: #ffffff;
      --system: #eff6ff;
      --accent: #2563eb;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 14px;
    }

    #timeline {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 100vh;
      padding: 14px;
    }

    .message {
      max-width: min(760px, 78%);
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--peer);
      padding: 8px 10px;
      box-shadow: 0 8px 22px rgba(0, 0, 0, .08);
    }

    .message.self {
      align-self: flex-end;
      background: var(--self);
      border-color: #18a56b;
    }

    .message.peer {
      align-self: flex-start;
    }

    .message.system {
      align-self: center;
      max-width: min(680px, 92%);
      background: var(--system);
      border-color: var(--accent);
    }

    .message.draft {
      border-style: dashed;
    }

    .meta {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 5px;
    }

    .body {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.35;
    }

    .smiley-image {
      width: 22px;
      height: 22px;
      object-fit: contain;
      vertical-align: -5px;
      margin: 0 2px;
    }

    .smiley {
      display: inline-block;
      border: 1px solid var(--line);
      border-radius: 4px;
      background: var(--panel-soft);
      padding: 0 4px;
      color: var(--text);
      font-family: Consolas, monospace;
      font-size: 12px;
      line-height: 20px;
      vertical-align: 1px;
    }

    .empty {
      margin: auto;
      max-width: 360px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--muted);
      padding: 20px;
      text-align: center;
    }

    .empty strong {
      display: block;
      color: var(--text);
      font-size: 18px;
      margin-bottom: 8px;
    }
  </style>
</head>
<body data-theme="dark">
  <main id="timeline"></main>
  <script>
    const timeline = document.getElementById("timeline");
    const smiles = [
      ["biggrin", "biggrin.gif", [":D"]],
      ["bonk", "bonk.gif", ["8)7"]],
      ["bonk3", "bonk3.gif", ["7(8)7"]],
      ["bye", "bye.gif", [":w"]],
      ["clown", "clown.gif", [":+"]],
      ["confused", "confused.gif", [":?"]],
      ["coool", "coool.gif", ["8)"]],
      ["cry", "cry.gif", [":'("]],
      ["devil", "devil.gif", [">:)"]],
      ["devilish", "devilish.gif", ["})"]],
      ["frown", "frown.gif", [":("]],
      ["frusty", "frusty.gif", ["|:("]],
      ["heart", "heart.gif", ["O+"]],
      ["hypocrite", "hypocrite.gif", ["O-)"]],
      ["kwijl", "kwijl.gif", [":9~"]],
      ["loveit", "loveit.gif", [":7"]],
      ["loveys", "loveys.gif", ["*;"]],
      ["marrysmile", "marrysmile.gif", ["^)"]],
      ["michel", "michel.gif", ["(8>"]],
      ["nerd", "nerd.gif", ["B)"]],
      ["nosmile", "nosmile.gif", [":/"]],
      ["nosmile2", "nosmile2.gif", [":|"]],
      ["puh", "puh.gif", [":>", ":*"]],
      ["puh2", "puh2.gif", [":P"]],
      ["pukey", "pukey.gif", [":r"]],
      ["rc5", "rc5.gif", ["}:O"]],
      ["redface", "redface.gif", [":o"]],
      ["sadley", "sadley.gif", [";("]],
      ["shadey", "shadey.gif", ["B-)"]],
      ["shiny", "shiny.gif", [":*)"]],
      ["shutup", "shutup.gif", [":X"]],
      ["sintsmiley", "sintsmiley.gif", ["<+:)"]],
      ["sleepey", "sleepey.gif", [":Z"]],
      ["sleephappy", "sleephappy.gif", [":z"]],
      ["smile", "smile.gif", [":)"]],
      ["thumbsup", "thumbsup.gif", ["d:)b"]],
      ["vork", "vork.gif", [":Y)"]],
      ["wink", "wink.gif", [";)"]],
      ["worshippy", "worshippy.gif", ["_/-\\o_", "_o_"]],
      ["yawnee", "yawnee.gif", [":O"]],
      ["yummie", "yummie.gif", [":9"]]
    ].map(([name, fileName, codes]) => ({ name, fileName, codes }));

    const smileIndex = smiles
      .flatMap((smiley) => smiley.codes.map((code) => ({ code, smiley })))
      .sort((a, b) => b.code.length - a.code.length || a.code.localeCompare(b.code));

    function text(value) {
      return value == null ? "" : String(value);
    }

    function renderRichText(container, value, smileyBaseUri) {
      value = text(value);
      if (container.dataset.richText === value && container.dataset.smileyBaseUri === smileyBaseUri) {
        return;
      }

      container.dataset.richText = value;
      container.dataset.smileyBaseUri = smileyBaseUri;
      const existing = Array.from(container.childNodes);
      const nextNodes = [];
      let index = 0;
      for (const token of tokenizeSmilies(value)) {
        if (token.kind === "text") {
          nextNodes.push(reuseTextNode(existing[index], token.text));
        } else {
          nextNodes.push(reuseSmileyNode(existing[index], token, smileyBaseUri));
        }

        index++;
      }

      patchChildren(container, nextNodes);
    }

    function tokenizeSmilies(value) {
      const tokens = [];
      let textStart = 0;
      let index = 0;
      while (index < value.length) {
        const match = smileIndex.find((item) => value.startsWith(item.code, index));
        if (!match) {
          index++;
          continue;
        }

        if (index > textStart) {
          tokens.push({ kind: "text", text: value.slice(textStart, index) });
        }

        tokens.push({ kind: "smiley", text: match.code, smiley: match.smiley });
        index += match.code.length;
        textStart = index;
      }

      if (textStart < value.length) {
        tokens.push({ kind: "text", text: value.slice(textStart) });
      }

      return tokens;
    }

    function patchChildren(container, nextNodes) {
      for (let index = 0; index < nextNodes.length; index++) {
        const nextNode = nextNodes[index];
        const currentNode = container.childNodes[index] ?? null;
        if (currentNode !== nextNode) {
          container.insertBefore(nextNode, currentNode);
        }
      }

      while (container.childNodes.length > nextNodes.length) {
        container.removeChild(container.lastChild);
      }
    }

    function reuseTextNode(node, value) {
      if (node?.nodeType === Node.TEXT_NODE) {
        if (node.textContent !== value) {
          node.textContent = value;
        }

        return node;
      }

      return document.createTextNode(value);
    }

    function reuseSmileyNode(node, token, smileyBaseUri) {
      if (node instanceof HTMLElement
        && node.dataset.smileyCode === token.text
        && node.dataset.smileyName === token.smiley.name) {
        return node;
      }

      return createSmileyImage(token, smileyBaseUri);
    }

    function createSmileyImage(token, smileyBaseUri) {
      const fallback = document.createElement("span");
      fallback.className = "smiley";
      fallback.dataset.smileyCode = token.text;
      fallback.dataset.smileyName = token.smiley.name;
      fallback.title = `${token.smiley.name} (${token.smiley.fileName})`;
      fallback.textContent = token.text;

      const image = document.createElement("img");
      image.className = "smiley-image";
      image.dataset.smileyCode = token.text;
      image.dataset.smileyName = token.smiley.name;
      image.src = smileyBaseUri + encodeURIComponent(token.smiley.fileName);
      image.alt = token.text;
      image.title = `${token.smiley.name} (${token.smiley.fileName})`;
      image.decoding = "async";
      image.addEventListener("error", () => {
        const fallbackFile = token.smiley.fileName.replace(/\.[^.]+$/, ".svg");
        if (fallbackFile !== token.smiley.fileName && !image.dataset.triedSvg) {
          image.dataset.triedSvg = "true";
          image.src = smileyBaseUri + encodeURIComponent(fallbackFile);
          return;
        }

        image.replaceWith(fallback);
      });
      return image;
    }

    function messageKey(message, index) {
      return [
        index,
        text(message.direction || "peer"),
        text(message.time),
        text(message.sender),
        message.draft ? "draft" : "final"
      ].join("|");
    }

    function updateMessage(article, message, smileyBaseUri) {
      article.className = "message " + text(message.direction || "peer");
      if (message.draft) {
        article.classList.add("draft");
      }

      let meta = article.querySelector(":scope > .meta");
      if (!meta) {
        meta = document.createElement("div");
        meta.className = "meta";
        article.append(meta);
      }

      const metaText = [message.time, message.sender, message.status].filter(Boolean).join(" - ");
      if (meta.textContent !== metaText) {
        meta.textContent = metaText;
      }

      let body = article.querySelector(":scope > .body");
      if (!body) {
        body = document.createElement("div");
        body.className = "body";
        article.append(body);
      }

      renderRichText(body, message.text, smileyBaseUri);
    }

    function render(payload) {
      document.body.dataset.theme = payload.theme === "light" ? "light" : "dark";
      const smileyBaseUri = text(payload.smileyBaseUri || "smileys/");
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      if (!messages.length) {
        timeline.replaceChildren();
        const empty = document.createElement("section");
        empty.className = "empty";
        const title = document.createElement("strong");
        title.textContent = text(payload.placeholderTitle);
        const body = document.createElement("span");
        body.textContent = text(payload.placeholderText);
        empty.append(title, body);
        timeline.append(empty);
        return;
      }

      const existing = new Map(Array.from(timeline.children)
        .filter((node) => node instanceof HTMLElement && node.dataset.key)
        .map((node) => [node.dataset.key, node]));
      const nextArticles = messages.map((message, index) => {
        const key = messageKey(message, index);
        const article = existing.get(key) || document.createElement("article");
        article.dataset.key = key;
        updateMessage(article, message, smileyBaseUri);
        return article;
      });

      patchChildren(timeline, nextArticles);

      requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
    }

    window.chrome.webview.addEventListener("message", event => render(event.data || {}));
  </script>
</body>
</html>
""";
    }

    private void SetStatusKey(string key)
    {
        SetStatusText(T(key, key));
    }

    private void SetStatusText(string status)
    {
        _statusLabel.Text = status;
        _statusStripLabel.Text = status;
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

    private string T(string key, string fallback)
    {
        return _language.Get(key, fallback);
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

    private enum ConversationKind
    {
        Contact,
        Group
    }

    private enum ContactPresence
    {
        Offline,
        Online
    }

    private sealed class ConversationListItem(string name, string peer, ConversationKind kind)
    {
        public string Name { get; set; } = name;
        public string Peer { get; } = peer;
        public ConversationKind Kind { get; } = kind;
        public ContactPresence Presence { get; set; }

        public override string ToString() => Name;
    }

    private static string ConversationKey(string peer)
    {
        return BareJid(string.IsNullOrWhiteSpace(peer) ? "relay@localhost" : peer.Trim());
    }

    private string IncomingConversationPeer(RttJsonEnvelope envelope, string from)
    {
        if (!string.IsNullOrWhiteSpace(envelope.To) && IsKnownGroupPeer(envelope.To))
        {
            return BareJid(envelope.To);
        }

        if (!string.IsNullOrWhiteSpace(from))
        {
            return BareJid(from);
        }

        return string.IsNullOrWhiteSpace(envelope.To) ? "relay@localhost" : BareJid(envelope.To);
    }

    private static string DisplayNameFromJid(string peer)
    {
        var bare = BareJid(peer);
        var at = bare.IndexOf('@');
        var name = at > 0 ? bare[..at] : bare;
        return string.IsNullOrWhiteSpace(name)
            ? bare
            : name.Length == 1 ? name.ToUpperInvariant() : char.ToUpperInvariant(name[0]) + name[1..];
    }

    private sealed class MessengerSettings
    {
        public string? DisplayName { get; set; }
        public string? Jid { get; set; }
        public string? Peer { get; set; }
        public string? WebSocketUrl { get; set; }
        public string? XmppHost { get; set; }
        public string? XmppPort { get; set; }
        public bool XmppTls { get; set; }
        public bool XmppDirectTls { get; set; }
        public string? Theme { get; set; }
        public string? Language { get; set; }
        public string[]? BlockedPeers { get; set; }
    }

    private sealed record TimelineMessage(
        string Time,
        string Sender,
        string Text,
        string Status,
        string Direction,
        bool Draft);
}
