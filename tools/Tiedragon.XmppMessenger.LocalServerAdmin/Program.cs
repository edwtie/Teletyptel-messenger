using System.Diagnostics;
using System.ComponentModel;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;
using MySqlConnector;

namespace Tiedragon.XmppMessenger.LocalServerAdmin;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new LocalServerAdminForm());
    }
}

internal sealed class LocalServerAdminForm : Form
{
    private readonly TextBox _dataDirectoryText = new();
    private readonly TextBox _mysqlConnectionText = new();
    private readonly TextBox _listenPortText = new();
    private readonly TextBox _uploadPortText = new();
    private readonly TextBox _domainText = new();
    private readonly CheckBox _captchaCheck = new();
    private readonly Button _startButton = new();
    private readonly Button _stopButton = new();
    private readonly TextBox _serverLogText = new();
    private readonly DataGridView _accountsGrid = new();
    private readonly DataGridView _rosterGrid = new();
    private readonly DataGridView _archiveGrid = new();
    private readonly DataGridView _sqlAccountsGrid = new();
    private readonly DataGridView _sqlHistoryGrid = new();
    private readonly DataGridView _servicesGrid = new();
    private readonly Label _statusLabel = new();
    private LocalServerStore _store;
    private MySqlAdminStore _mysqlStore;
    private Process? _serverProcess;

    public LocalServerAdminForm()
    {
        Text = "TeleTypTel LocalServer Admin";
        Width = 1120;
        Height = 760;
        MinimumSize = new Size(980, 620);
        StartPosition = FormStartPosition.CenterScreen;

        _store = LocalServerStore.Open(LocalServerStore.DefaultRootDirectory());
        _mysqlStore = new MySqlAdminStore(FindRepoRoot());

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            Padding = new Padding(10)
        };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(root);

        root.Controls.Add(CreateDataDirectoryPanel(), 0, 0);
        root.Controls.Add(CreateTabs(), 0, 1);
        _statusLabel.AutoSize = true;
        _statusLabel.Text = "Klaar";
        root.Controls.Add(_statusLabel, 0, 2);

        LoadStore();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        StopServer();
        base.OnFormClosing(e);
    }

    private Control CreateDataDirectoryPanel()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            ColumnCount = 4,
            AutoSize = true,
            Padding = new Padding(0, 0, 0, 8)
        };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

        panel.Controls.Add(new Label { Text = "LocalServer data:", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 0);
        _dataDirectoryText.Text = _store.RootDirectory;
        _dataDirectoryText.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        panel.Controls.Add(_dataDirectoryText, 1, 0);

        var browse = new Button { Text = "Map...", AutoSize = true };
        browse.Click += (_, _) => BrowseDataDirectory();
        panel.Controls.Add(browse, 2, 0);

        var reload = new Button { Text = "Herladen", AutoSize = true };
        reload.Click += (_, _) => LoadStore();
        panel.Controls.Add(reload, 3, 0);

        panel.Controls.Add(new Label { Text = "MySQL:", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 1);
        _mysqlConnectionText.Text = _mysqlStore.ConnectionString;
        _mysqlConnectionText.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        panel.Controls.Add(_mysqlConnectionText, 1, 1);
        var testSql = new Button { Text = "SQL laden", AutoSize = true };
        testSql.Click += (_, _) => LoadSqlStore();
        panel.Controls.Add(testSql, 2, 1);
        return panel;
    }

    private Control CreateTabs()
    {
        var tabs = new TabControl { Dock = DockStyle.Fill };
        tabs.TabPages.Add(new TabPage("Services") { Controls = { CreateServicesTab() } });
        tabs.TabPages.Add(new TabPage("Server") { Controls = { CreateServerTab() } });
        tabs.TabPages.Add(new TabPage("Accounts") { Controls = { CreateAccountsTab() } });
        tabs.TabPages.Add(new TabPage("Contacten") { Controls = { CreateRosterTab() } });
        tabs.TabPages.Add(new TabPage("Archief") { Controls = { CreateArchiveTab() } });
        tabs.TabPages.Add(new TabPage("SQL accounts") { Controls = { CreateSqlAccountsTab() } });
        tabs.TabPages.Add(new TabPage("SQL geschiedenis") { Controls = { CreateSqlHistoryTab() } });
        return tabs;
    }

    private Control CreateServicesTab()
    {
        var panel = CreateGridTab(_servicesGrid, out var buttons);
        var refresh = new Button { Text = "Ververs", AutoSize = true };
        refresh.Click += (_, _) => LoadServices();
        var kill = new Button { Text = "Force terminate", AutoSize = true };
        kill.Click += (_, _) => ForceTerminateSelectedService();
        buttons.Controls.Add(refresh);
        buttons.Controls.Add(kill);
        ConfigureGrid(_servicesGrid);
        return panel;
    }

    private Control CreateServerTab()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            Padding = new Padding(8)
        };
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var fields = new TableLayoutPanel { Dock = DockStyle.Top, ColumnCount = 8, AutoSize = true };
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 140));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

        _listenPortText.Text = "5222";
        _uploadPortText.Text = "58088";
        _domainText.Text = "localhost";
        _captchaCheck.Text = "CAPTCHA";
        _captchaCheck.Checked = true;
        fields.Controls.Add(new Label { Text = "XMPP poort", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 0);
        fields.Controls.Add(_listenPortText, 1, 0);
        fields.Controls.Add(new Label { Text = "Upload poort", AutoSize = true, Anchor = AnchorStyles.Left }, 2, 0);
        fields.Controls.Add(_uploadPortText, 3, 0);
        fields.Controls.Add(new Label { Text = "Domein", AutoSize = true, Anchor = AnchorStyles.Left }, 4, 0);
        fields.Controls.Add(_domainText, 5, 0);
        fields.Controls.Add(_captchaCheck, 6, 0);
        panel.Controls.Add(fields, 0, 0);

        var buttons = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
        _startButton.Text = "Start localhost server";
        _startButton.AutoSize = true;
        _startButton.Click += (_, _) => StartServer();
        _stopButton.Text = "Stop";
        _stopButton.AutoSize = true;
        _stopButton.Enabled = false;
        _stopButton.Click += (_, _) => StopServer();
        var openData = new Button { Text = "Open data map", AutoSize = true };
        openData.Click += (_, _) => OpenFolder(_store.RootDirectory);
        buttons.Controls.AddRange([_startButton, _stopButton, openData]);
        panel.Controls.Add(buttons, 0, 1);

        _serverLogText.Dock = DockStyle.Fill;
        _serverLogText.Multiline = true;
        _serverLogText.ScrollBars = ScrollBars.Both;
        _serverLogText.ReadOnly = true;
        _serverLogText.Font = new Font(FontFamily.GenericMonospace, 9f);
        panel.Controls.Add(_serverLogText, 0, 2);
        return panel;
    }

    private Control CreateAccountsTab()
    {
        var panel = CreateGridTab(_accountsGrid, out var buttons);
        var add = new Button { Text = "Account toevoegen", AutoSize = true };
        add.Click += (_, _) => AddAccount();
        var remove = new Button { Text = "Account verwijderen", AutoSize = true };
        remove.Click += (_, _) => RemoveSelectedAccount();
        buttons.Controls.Add(add);
        buttons.Controls.Add(remove);
        ConfigureGrid(_accountsGrid);
        return panel;
    }

    private Control CreateRosterTab()
    {
        var panel = CreateGridTab(_rosterGrid, out var buttons);
        var add = new Button { Text = "Contact toevoegen", AutoSize = true };
        add.Click += (_, _) => AddRosterItem();
        var remove = new Button { Text = "Contact verwijderen", AutoSize = true };
        remove.Click += (_, _) => RemoveSelectedRosterItem();
        buttons.Controls.Add(add);
        buttons.Controls.Add(remove);
        ConfigureGrid(_rosterGrid);
        return panel;
    }

    private Control CreateArchiveTab()
    {
        var panel = CreateGridTab(_archiveGrid, out var buttons);
        var clear = new Button { Text = "Archief legen", AutoSize = true };
        clear.Click += (_, _) => ClearArchive();
        buttons.Controls.Add(clear);
        ConfigureGrid(_archiveGrid);
        return panel;
    }

    private Control CreateSqlAccountsTab()
    {
        var panel = CreateGridTab(_sqlAccountsGrid, out var buttons);
        var create = new Button { Text = "Schema maken/checken", AutoSize = true };
        create.Click += (_, _) => EnsureSqlSchema();
        var add = new Button { Text = "SQL account toevoegen", AutoSize = true };
        add.Click += (_, _) => AddSqlAccount();
        var remove = new Button { Text = "SQL account verwijderen", AutoSize = true };
        remove.Click += (_, _) => RemoveSelectedSqlAccount();
        buttons.Controls.Add(create);
        buttons.Controls.Add(add);
        buttons.Controls.Add(remove);
        ConfigureGrid(_sqlAccountsGrid);
        return panel;
    }

    private Control CreateSqlHistoryTab()
    {
        var panel = CreateGridTab(_sqlHistoryGrid, out var buttons);
        var create = new Button { Text = "Schema maken/checken", AutoSize = true };
        create.Click += (_, _) => EnsureSqlSchema();
        var clear = new Button { Text = "SQL geschiedenis legen", AutoSize = true };
        clear.Click += (_, _) => ClearSqlHistory();
        buttons.Controls.Add(create);
        buttons.Controls.Add(clear);
        ConfigureGrid(_sqlHistoryGrid);
        return panel;
    }

    private static Control CreateGridTab(DataGridView grid, out FlowLayoutPanel buttons)
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            Padding = new Padding(8)
        };
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        buttons = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
        panel.Controls.Add(buttons, 0, 0);
        panel.Controls.Add(grid, 0, 1);
        return panel;
    }

    private static void ConfigureGrid(DataGridView grid)
    {
        grid.Dock = DockStyle.Fill;
        grid.ReadOnly = true;
        grid.AllowUserToAddRows = false;
        grid.AllowUserToDeleteRows = false;
        grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        grid.MultiSelect = false;
        grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
    }

    private void BrowseDataDirectory()
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "Kies LocalServer data map",
            SelectedPath = Directory.Exists(_dataDirectoryText.Text) ? _dataDirectoryText.Text : _store.RootDirectory
        };
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        _dataDirectoryText.Text = dialog.SelectedPath;
        LoadStore();
    }

    private void LoadStore()
    {
        _store = LocalServerStore.Open(_dataDirectoryText.Text);
        _accountsGrid.DataSource = _store.LoadAccounts().ToList();
        _rosterGrid.DataSource = _store.LoadRosterItems().ToList();
        _archiveGrid.DataSource = _store.LoadArchive().ToList();
        _statusLabel.Text = $"Geladen: {_store.RootDirectory}";
        LoadServices();
        LoadSqlStore(showErrors: false);
    }

    private void LoadServices()
    {
        var xmppPort = int.TryParse(_listenPortText.Text.Trim(), out var parsedXmppPort) ? parsedXmppPort : 5222;
        var uploadPort = int.TryParse(_uploadPortText.Text.Trim(), out var parsedUploadPort) ? parsedUploadPort : 58088;
        _servicesGrid.DataSource = ServiceStatusProbe.GetStatuses(xmppPort, uploadPort).ToList();
    }

    private void ForceTerminateSelectedService()
    {
        if (_servicesGrid.CurrentRow?.DataBoundItem is not ServiceStatusRow service)
        {
            return;
        }

        if (MessageBox.Show(
                this,
                $"Geforceerd stoppen van '{service.Service}'?\n\nDit sluit alle gematchte processen voor deze service.",
                "Force terminate",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning) != DialogResult.Yes)
        {
            return;
        }

        var killed = ServiceStatusProbe.ForceTerminate(service.Service);
        LoadServices();
        MessageBox.Show(this, killed == 0 ? "Geen proces gevonden." : $"{killed} proces(sen) gestopt.", "Force terminate", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void LoadSqlStore(bool showErrors = true)
    {
        try
        {
            _mysqlStore = new MySqlAdminStore(FindRepoRoot(), _mysqlConnectionText.Text);
            _sqlAccountsGrid.DataSource = _mysqlStore.LoadAccounts().ToList();
            _sqlHistoryGrid.DataSource = _mysqlStore.LoadHistory().ToList();
            _statusLabel.Text = "SQL geladen";
        }
        catch (Exception ex) when (ex is MySqlException or InvalidOperationException)
        {
            _sqlAccountsGrid.DataSource = null;
            _sqlHistoryGrid.DataSource = null;
            _statusLabel.Text = "SQL niet verbonden: " + ex.Message;
            if (showErrors)
            {
                MessageBox.Show(this, ex.Message, "SQL niet verbonden", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }

    private void EnsureSqlSchema()
    {
        try
        {
            _mysqlStore = new MySqlAdminStore(FindRepoRoot(), _mysqlConnectionText.Text);
            _mysqlStore.EnsureSchema();
            LoadSqlStore();
        }
        catch (Exception ex) when (ex is MySqlException or InvalidOperationException)
        {
            MessageBox.Show(this, ex.Message, "Schema maken mislukt", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void AddAccount()
    {
        using var dialog = new AccountDialog();
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        _store.SaveAccount(new LocalAccount(dialog.Username, dialog.Password));
        LoadStore();
    }

    private void RemoveSelectedAccount()
    {
        if (_accountsGrid.CurrentRow?.DataBoundItem is not LocalAccount account)
        {
            return;
        }

        if (MessageBox.Show(this, $"Account '{account.Username}' verwijderen?", "Bevestigen", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
        {
            return;
        }

        _store.RemoveAccount(account.Username);
        LoadStore();
    }

    private void AddRosterItem()
    {
        using var dialog = new RosterDialog(_domainText.Text);
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        _store.SaveRosterItem(new LocalStoredRosterItem(dialog.OwnerBareJid, dialog.Jid, dialog.ContactName, "both"));
        LoadStore();
    }

    private void RemoveSelectedRosterItem()
    {
        if (_rosterGrid.CurrentRow?.DataBoundItem is not LocalStoredRosterItem item)
        {
            return;
        }

        _store.RemoveRosterItem(item.OwnerBareJid, item.Jid);
        LoadStore();
    }

    private void ClearArchive()
    {
        if (MessageBox.Show(this, "Hele lokale MAM-archive legen?", "Bevestigen", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
        {
            return;
        }

        _store.ClearArchive();
        LoadStore();
    }

    private void AddSqlAccount()
    {
        using var dialog = new AccountDialog { Text = "SQL account toevoegen" };
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        try
        {
            _mysqlStore.SaveAccount(dialog.Username, dialog.Password);
            LoadSqlStore();
        }
        catch (Exception ex) when (ex is MySqlException or InvalidOperationException)
        {
            MessageBox.Show(this, ex.Message, "SQL account opslaan mislukt", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void RemoveSelectedSqlAccount()
    {
        if (_sqlAccountsGrid.CurrentRow?.DataBoundItem is not SqlAccountRow row)
        {
            return;
        }

        if (MessageBox.Show(this, $"SQL account '{row.Jid}' verwijderen?", "Bevestigen", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
        {
            return;
        }

        try
        {
            _mysqlStore.DeleteAccount(row.AccountId);
            LoadSqlStore();
        }
        catch (Exception ex) when (ex is MySqlException or InvalidOperationException)
        {
            MessageBox.Show(this, ex.Message, "SQL account verwijderen mislukt", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void ClearSqlHistory()
    {
        if (MessageBox.Show(this, "Hele SQL message_history legen?", "Bevestigen", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
        {
            return;
        }

        try
        {
            _mysqlStore.ClearHistory();
            LoadSqlStore();
        }
        catch (Exception ex) when (ex is MySqlException or InvalidOperationException)
        {
            MessageBox.Show(this, ex.Message, "SQL geschiedenis legen mislukt", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void StartServer()
    {
        if (_serverProcess is { HasExited: false })
        {
            return;
        }

        if (!int.TryParse(_listenPortText.Text.Trim(), out var xmppPort)
            || !int.TryParse(_uploadPortText.Text.Trim(), out var uploadPort))
        {
            MessageBox.Show(this, "Poorten moeten nummers zijn.", "Ongeldige poort", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (!IsTcpPortAvailable(IPAddress.Loopback, xmppPort))
        {
            MessageBox.Show(this, $"XMPP poort {xmppPort} is al in gebruik. Stop de oude LocalServer of kies een andere poort.", "Poort bezet", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (uploadPort > 0 && !IsTcpPortAvailable(IPAddress.Loopback, uploadPort))
        {
            var nextPort = FindAvailablePort(IPAddress.Loopback, uploadPort + 1);
            var result = MessageBox.Show(
                this,
                $"Upload poort {uploadPort} is al in gebruik. Wil je poort {nextPort} gebruiken?",
                "Upload poort bezet",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);
            if (result != DialogResult.Yes)
            {
                return;
            }

            _uploadPortText.Text = nextPort.ToString();
            uploadPort = nextPort;
        }

        var repoRoot = FindRepoRoot();
        var project = Path.Combine(repoRoot, "tools", "Tiedragon.XmppMessenger.LocalServer", "Tiedragon.XmppMessenger.LocalServer.csproj");
        var info = new ProcessStartInfo("dotnet")
        {
            WorkingDirectory = repoRoot,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        info.ArgumentList.Add("run");
        info.ArgumentList.Add("--project");
        info.ArgumentList.Add(project);
        info.ArgumentList.Add("--");
        info.ArgumentList.Add("--listen");
        info.ArgumentList.Add("127.0.0.1");
        info.ArgumentList.Add("--port");
        info.ArgumentList.Add(xmppPort.ToString());
        info.ArgumentList.Add("--upload-listen");
        info.ArgumentList.Add("127.0.0.1");
        info.ArgumentList.Add("--upload-port");
        info.ArgumentList.Add(uploadPort.ToString());
        info.ArgumentList.Add("--domain");
        info.ArgumentList.Add(_domainText.Text.Trim());
        info.ArgumentList.Add("--data-dir");
        info.ArgumentList.Add(_store.RootDirectory);
        info.ArgumentList.Add("--registration-captcha");
        info.ArgumentList.Add(_captchaCheck.Checked ? "true" : "false");

        foreach (var account in _store.LoadAccounts())
        {
            info.ArgumentList.Add("--account");
            info.ArgumentList.Add($"{account.Username}:{account.Password}");
        }

        _serverLogText.Clear();
        _serverProcess = Process.Start(info);
        if (_serverProcess is null)
        {
            return;
        }

        _startButton.Enabled = false;
        _stopButton.Enabled = true;
        _statusLabel.Text = "LocalServer draait";
        _ = ReadServerOutputAsync(_serverProcess.StandardOutput);
        _ = ReadServerOutputAsync(_serverProcess.StandardError);
        _ = WaitForServerExitAsync(_serverProcess);
    }

    private async Task ReadServerOutputAsync(StreamReader reader)
    {
        while (await reader.ReadLineAsync() is { } line)
        {
            AppendServerLog(line);
        }
    }

    private async Task WaitForServerExitAsync(Process process)
    {
        await process.WaitForExitAsync();
        if (IsDisposed)
        {
            return;
        }

        BeginInvoke(() =>
        {
            _startButton.Enabled = true;
            _stopButton.Enabled = false;
            _statusLabel.Text = "LocalServer gestopt";
        });
    }

    private void AppendServerLog(string line)
    {
        if (IsDisposed)
        {
            return;
        }

        BeginInvoke(() =>
        {
            _serverLogText.AppendText(line + Environment.NewLine);
        });
    }

    private void StopServer()
    {
        if (_serverProcess is null || _serverProcess.HasExited)
        {
            return;
        }

        try
        {
            _serverProcess.Kill(entireProcessTree: true);
        }
        catch (InvalidOperationException)
        {
        }
    }

    private static void OpenFolder(string path)
    {
        Directory.CreateDirectory(path);
        Process.Start(new ProcessStartInfo("explorer.exe", path) { UseShellExecute = true });
    }

    private static string FindRepoRoot()
    {
        var directory = AppContext.BaseDirectory;
        while (!string.IsNullOrEmpty(directory))
        {
            if (File.Exists(Path.Combine(directory, "Tiedragon.XmppMessenger.slnx")))
            {
                return directory;
            }

            directory = Directory.GetParent(directory)?.FullName ?? string.Empty;
        }

        return Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
    }

    private static bool IsTcpPortAvailable(IPAddress address, int port)
    {
        if (port < 1 || port > 65535)
        {
            return false;
        }

        try
        {
            var listener = new TcpListener(address, port);
            listener.Start();
            listener.Stop();
            return true;
        }
        catch (SocketException)
        {
            return false;
        }
    }

    private static int FindAvailablePort(IPAddress address, int startPort)
    {
        for (var port = Math.Max(1, startPort); port <= 65535; port++)
        {
            if (IsTcpPortAvailable(address, port))
            {
                return port;
            }
        }

        throw new InvalidOperationException("Geen vrije TCP-poort gevonden.");
    }
}

internal sealed class AccountDialog : Form
{
    private readonly TextBox _username = new();
    private readonly TextBox _password = new();

    public AccountDialog()
    {
        Text = "Account toevoegen";
        Width = 380;
        Height = 190;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        var panel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(12) };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(panel);
        panel.Controls.Add(new Label { Text = "Gebruiker", AutoSize = true }, 0, 0);
        panel.Controls.Add(_username, 1, 0);
        panel.Controls.Add(new Label { Text = "Wachtwoord", AutoSize = true }, 0, 1);
        panel.Controls.Add(_password, 1, 1);
        _password.UseSystemPasswordChar = true;
        var ok = new Button { Text = "Bewaren", DialogResult = DialogResult.OK, AutoSize = true };
        var cancel = new Button { Text = "Annuleren", DialogResult = DialogResult.Cancel, AutoSize = true };
        var buttons = new FlowLayoutPanel { FlowDirection = FlowDirection.RightToLeft, Dock = DockStyle.Fill };
        buttons.Controls.Add(cancel);
        buttons.Controls.Add(ok);
        panel.SetColumnSpan(buttons, 2);
        panel.Controls.Add(buttons, 0, 2);
        AcceptButton = ok;
        CancelButton = cancel;
    }

    public string Username => _username.Text.Trim();

    public string Password => _password.Text;
}

internal sealed class RosterDialog : Form
{
    private readonly TextBox _owner = new();
    private readonly TextBox _jid = new();
    private readonly TextBox _name = new();

    public RosterDialog(string domain)
    {
        Text = "Contact toevoegen";
        Width = 460;
        Height = 220;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        var panel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(12) };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(panel);
        _owner.Text = $"edward@{(string.IsNullOrWhiteSpace(domain) ? "localhost" : domain)}";
        _jid.Text = $"tester@{(string.IsNullOrWhiteSpace(domain) ? "localhost" : domain)}";
        panel.Controls.Add(new Label { Text = "Eigen JID", AutoSize = true }, 0, 0);
        panel.Controls.Add(_owner, 1, 0);
        panel.Controls.Add(new Label { Text = "Contact JID", AutoSize = true }, 0, 1);
        panel.Controls.Add(_jid, 1, 1);
        panel.Controls.Add(new Label { Text = "Naam", AutoSize = true }, 0, 2);
        panel.Controls.Add(_name, 1, 2);
        var ok = new Button { Text = "Bewaren", DialogResult = DialogResult.OK, AutoSize = true };
        var cancel = new Button { Text = "Annuleren", DialogResult = DialogResult.Cancel, AutoSize = true };
        var buttons = new FlowLayoutPanel { FlowDirection = FlowDirection.RightToLeft, Dock = DockStyle.Fill };
        buttons.Controls.Add(cancel);
        buttons.Controls.Add(ok);
        panel.SetColumnSpan(buttons, 2);
        panel.Controls.Add(buttons, 0, 3);
        AcceptButton = ok;
        CancelButton = cancel;
    }

    public string OwnerBareJid => BareJid(_owner.Text);

    public string Jid => BareJid(_jid.Text);

    public string ContactName => string.IsNullOrWhiteSpace(_name.Text) ? Jid.Split('@')[0] : _name.Text.Trim();

    private static string BareJid(string jid)
    {
        return jid.Trim().Split('/', 2)[0];
    }
}

internal sealed class LocalServerStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly string _accountsPath;
    private readonly string _rosterPath;
    private readonly string _archivePath;

    private LocalServerStore(string rootDirectory)
    {
        RootDirectory = Path.GetFullPath(rootDirectory);
        Directory.CreateDirectory(RootDirectory);
        _accountsPath = Path.Combine(RootDirectory, "accounts.json");
        _rosterPath = Path.Combine(RootDirectory, "roster.json");
        _archivePath = Path.Combine(RootDirectory, "message-archive.jsonl");
    }

    public string RootDirectory { get; }

    public static LocalServerStore Open(string rootDirectory)
    {
        return new LocalServerStore(rootDirectory);
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
        return LoadJsonList<LocalAccount>(_accountsPath);
    }

    public void SaveAccount(LocalAccount account)
    {
        var accounts = LoadAccounts()
            .Where(existing => !string.Equals(existing.Username, account.Username, StringComparison.OrdinalIgnoreCase))
            .Append(account)
            .OrderBy(existing => existing.Username, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        SaveJsonList(_accountsPath, accounts);
    }

    public void RemoveAccount(string username)
    {
        SaveJsonList(
            _accountsPath,
            LoadAccounts().Where(existing => !string.Equals(existing.Username, username, StringComparison.OrdinalIgnoreCase)));
    }

    public IReadOnlyList<LocalStoredRosterItem> LoadRosterItems()
    {
        return LoadJsonList<LocalStoredRosterItem>(_rosterPath);
    }

    public void SaveRosterItem(LocalStoredRosterItem item)
    {
        var items = LoadRosterItems()
            .Where(existing => !string.Equals(existing.OwnerBareJid, item.OwnerBareJid, StringComparison.OrdinalIgnoreCase)
                || !string.Equals(existing.Jid, item.Jid, StringComparison.OrdinalIgnoreCase))
            .Append(item)
            .OrderBy(existing => existing.OwnerBareJid, StringComparer.OrdinalIgnoreCase)
            .ThenBy(existing => existing.Jid, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        SaveJsonList(_rosterPath, items);
    }

    public void RemoveRosterItem(string ownerBareJid, string jid)
    {
        SaveJsonList(
            _rosterPath,
            LoadRosterItems().Where(existing => !string.Equals(existing.OwnerBareJid, ownerBareJid, StringComparison.OrdinalIgnoreCase)
                || !string.Equals(existing.Jid, jid, StringComparison.OrdinalIgnoreCase)));
    }

    public IReadOnlyList<LocalArchiveMessage> LoadArchive()
    {
        if (!File.Exists(_archivePath))
        {
            return [];
        }

        var messages = new List<LocalArchiveMessage>();
        foreach (var line in File.ReadLines(_archivePath, Encoding.UTF8))
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

        return messages
            .OrderByDescending(message => message.StampUtc)
            .Take(500)
            .ToArray();
    }

    public void ClearArchive()
    {
        File.WriteAllText(_archivePath, string.Empty, Encoding.UTF8);
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
}

internal sealed record LocalAccount(string Username, string Password);

internal sealed record LocalStoredRosterItem(string OwnerBareJid, string Jid, string Name, string Subscription);

internal sealed record LocalArchiveMessage(
    string ArchiveId,
    string OwnerBareJid,
    string ConversationJid,
    string StanzaXml,
    DateTimeOffset StampUtc);

internal sealed class MySqlAdminStore
{
    public MySqlAdminStore(string repoRoot, string? connectionString = null)
    {
        ConnectionString = string.IsNullOrWhiteSpace(connectionString)
            ? LoadConnectionString(repoRoot)
            : connectionString.Trim();
    }

    public string ConnectionString { get; }

    public IReadOnlyList<SqlAccountRow> LoadAccounts()
    {
        using var connection = OpenConnection();
        EnsureSchema(connection);
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT account_id, jid, display_name, provider_id, preferred_language,
                   xmpp_host, xmpp_port, xmpp_domain, xmpp_tls_mode, updated_at
            FROM account_profiles
            ORDER BY updated_at DESC, jid ASC
            LIMIT 500
            """;
        using var reader = command.ExecuteReader();
        var rows = new List<SqlAccountRow>();
        while (reader.Read())
        {
            rows.Add(new SqlAccountRow(
                reader.GetString("account_id"),
                reader.GetString("jid"),
                reader.GetString("display_name"),
                reader.GetString("provider_id"),
                reader.GetString("preferred_language"),
                reader.GetString("xmpp_host"),
                reader.GetInt32("xmpp_port"),
                reader.GetString("xmpp_domain"),
                reader.GetString("xmpp_tls_mode"),
                reader.GetDateTime("updated_at")));
        }

        return rows;
    }

    public IReadOnlyList<SqlHistoryRow> LoadHistory()
    {
        using var connection = OpenConnection();
        EnsureSchema(connection);
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT account_id, conversation_peer, conversation_name, conversation_kind,
                   message_id, direction, sender_jid, text, status,
                   edited, retracted, message_timestamp
            FROM message_history
            ORDER BY message_timestamp DESC, id DESC
            LIMIT 500
            """;
        using var reader = command.ExecuteReader();
        var rows = new List<SqlHistoryRow>();
        while (reader.Read())
        {
            rows.Add(new SqlHistoryRow(
                reader.GetString("account_id"),
                reader.GetString("conversation_peer"),
                reader.GetString("conversation_name"),
                reader.GetString("conversation_kind"),
                reader.GetString("message_id"),
                reader.GetString("direction"),
                reader.GetString("sender_jid"),
                reader.GetString("text"),
                reader.GetString("status"),
                reader.GetBoolean("edited"),
                reader.GetBoolean("retracted"),
                reader.GetDateTime("message_timestamp")));
        }

        return rows;
    }

    public void EnsureSchema()
    {
        using var connection = OpenConnection();
        EnsureSchema(connection);
    }

    public void SaveAccount(string jid, string password)
    {
        var bare = jid.Trim().Split('/', 2)[0];
        var local = bare.Split('@', 2)[0];
        var domain = bare.Contains('@', StringComparison.Ordinal) ? bare.Split('@', 2)[1] : "localhost";
        var passwordHash = BCrypt.Net.BCrypt.HashPassword(password);
        using var connection = OpenConnection();
        EnsureSchema(connection);
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO account_profiles (
                account_id, jid, display_name, password_hash, provider_id, preferred_language,
                relay_websocket, xmpp_websocket, xmpp_host, xmpp_port, xmpp_domain, xmpp_tls_mode,
                peer, avatar_color
            ) VALUES (
                @account_id, @jid, @display_name, @password_hash, 'localhost', 'nl',
                'ws://127.0.0.1:8787', 'ws://127.0.0.1:8787', @xmpp_host, 5222, @xmpp_domain, 'starttls',
                'relay@localhost', '#2563eb'
            )
            ON DUPLICATE KEY UPDATE
                jid = VALUES(jid),
                display_name = VALUES(display_name),
                password_hash = VALUES(password_hash),
                xmpp_host = VALUES(xmpp_host),
                xmpp_domain = VALUES(xmpp_domain)
            """;
        command.Parameters.AddWithValue("@account_id", "local-" + SanitizeAccountId(local));
        command.Parameters.AddWithValue("@jid", bare);
        command.Parameters.AddWithValue("@display_name", string.IsNullOrWhiteSpace(local) ? bare : char.ToUpperInvariant(local[0]) + local[1..]);
        command.Parameters.AddWithValue("@password_hash", passwordHash);
        command.Parameters.AddWithValue("@xmpp_host", domain);
        command.Parameters.AddWithValue("@xmpp_domain", domain);
        command.ExecuteNonQuery();

        var accountId = "local-" + SanitizeAccountId(local);
        var displayName = string.IsNullOrWhiteSpace(local) ? bare : char.ToUpperInvariant(local[0]) + local[1..];
        using var accountCommand = connection.CreateCommand();
        accountCommand.CommandText = """
            INSERT INTO accounts (
                account_id, display_name, provider_id, preferred_language, status
            ) VALUES (
                @account_id, @display_name, 'localhost', 'nl', 'active'
            )
            ON DUPLICATE KEY UPDATE
                display_name = VALUES(display_name),
                provider_id = VALUES(provider_id),
                preferred_language = VALUES(preferred_language),
                status = 'active'
            """;
        accountCommand.Parameters.AddWithValue("@account_id", accountId);
        accountCommand.Parameters.AddWithValue("@display_name", displayName);
        accountCommand.ExecuteNonQuery();

        using var credentialCommand = connection.CreateCommand();
        credentialCommand.CommandText = """
            INSERT INTO account_credentials (account_id, password_hash, password_updated_at)
            VALUES (@account_id, @password_hash, NOW())
            ON DUPLICATE KEY UPDATE
                password_hash = VALUES(password_hash),
                password_updated_at = NOW()
            """;
        credentialCommand.Parameters.AddWithValue("@account_id", accountId);
        credentialCommand.Parameters.AddWithValue("@password_hash", passwordHash);
        credentialCommand.ExecuteNonQuery();

        using var identityCommand = connection.CreateCommand();
        identityCommand.CommandText = """
            INSERT INTO account_identities (account_id, provider, provider_subject, email, email_verified, last_used_at)
            VALUES (@account_id, 'email', @jid, @email, @email_verified, NOW())
            ON DUPLICATE KEY UPDATE
                account_id = VALUES(account_id),
                email = VALUES(email),
                email_verified = VALUES(email_verified),
                last_used_at = NOW()
            """;
        identityCommand.Parameters.AddWithValue("@account_id", accountId);
        identityCommand.Parameters.AddWithValue("@jid", bare);
        identityCommand.Parameters.AddWithValue("@email", bare.Contains('@', StringComparison.Ordinal) ? bare : string.Empty);
        identityCommand.Parameters.AddWithValue("@email_verified", string.Equals(domain, "localhost", StringComparison.OrdinalIgnoreCase) ? 0 : 1);
        identityCommand.ExecuteNonQuery();

        using var xmppCommand = connection.CreateCommand();
        xmppCommand.CommandText = """
            INSERT INTO account_xmpp (
                account_id, xmpp_jid, xmpp_domain, xmpp_host, xmpp_port, xmpp_tls_mode, xmpp_websocket, peer
            ) VALUES (
                @account_id, @jid, @xmpp_domain, @xmpp_host, 5222, 'starttls', 'ws://127.0.0.1:8787', 'relay@localhost'
            )
            ON DUPLICATE KEY UPDATE
                xmpp_jid = VALUES(xmpp_jid),
                xmpp_domain = VALUES(xmpp_domain),
                xmpp_host = VALUES(xmpp_host)
            """;
        xmppCommand.Parameters.AddWithValue("@account_id", accountId);
        xmppCommand.Parameters.AddWithValue("@jid", bare);
        xmppCommand.Parameters.AddWithValue("@xmpp_domain", domain);
        xmppCommand.Parameters.AddWithValue("@xmpp_host", domain);
        xmppCommand.ExecuteNonQuery();
    }

    public void DeleteAccount(string accountId)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM account_profiles WHERE account_id = @account_id";
        command.Parameters.AddWithValue("@account_id", accountId);
        command.ExecuteNonQuery();
    }

    public void ClearHistory()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM message_history";
        command.ExecuteNonQuery();
    }

    private MySqlConnection OpenConnection()
    {
        var connection = new MySqlConnection(ConnectionString);
        connection.Open();
        return connection;
    }

    private static void EnsureSchema(MySqlConnection connection)
    {
        Execute(connection, """
            CREATE TABLE IF NOT EXISTS account_profiles (
              account_id VARCHAR(96) NOT NULL PRIMARY KEY,
              jid VARCHAR(255) NOT NULL,
              display_name VARCHAR(120) NOT NULL,
              password_secret TEXT NULL,
              password_hash VARCHAR(255) NOT NULL DEFAULT '',
              remember_password TINYINT(1) NOT NULL DEFAULT 0,
              phone_number VARCHAR(64) NOT NULL DEFAULT '',
              birth_date VARCHAR(10) NOT NULL DEFAULT '',
              provider_id VARCHAR(96) NOT NULL DEFAULT 'example-provider',
              accessibility_profile_id VARCHAR(96) NOT NULL DEFAULT 'default-live-text',
              preferred_language VARCHAR(16) NOT NULL DEFAULT 'nl',
              live_rtt_enabled TINYINT(1) NOT NULL DEFAULT 1,
              show_smileys TINYINT(1) NOT NULL DEFAULT 1,
              relay_websocket VARCHAR(255) NOT NULL DEFAULT 'ws://127.0.0.1:8787',
              xmpp_websocket VARCHAR(255) NOT NULL DEFAULT 'ws://127.0.0.1:8787',
              xmpp_host VARCHAR(255) NOT NULL DEFAULT 'localhost',
              xmpp_port INT NOT NULL DEFAULT 5222,
              xmpp_domain VARCHAR(255) NOT NULL DEFAULT 'localhost',
              xmpp_tls_mode VARCHAR(32) NOT NULL DEFAULT 'starttls',
              peer VARCHAR(255) NOT NULL DEFAULT 'relay@localhost',
              avatar_data_url MEDIUMTEXT NULL,
              avatar_color VARCHAR(32) NOT NULL DEFAULT '#2563eb',
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              UNIQUE KEY uq_account_profiles_jid (jid)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """);
        Execute(connection, """
            CREATE TABLE IF NOT EXISTS accounts (
              account_id VARCHAR(96) NOT NULL PRIMARY KEY,
              display_name VARCHAR(120) NOT NULL DEFAULT '',
              phone_number VARCHAR(64) NOT NULL DEFAULT '',
              birth_date VARCHAR(10) NOT NULL DEFAULT '',
              provider_id VARCHAR(96) NOT NULL DEFAULT 'example-provider',
              accessibility_profile_id VARCHAR(96) NOT NULL DEFAULT 'default-live-text',
              preferred_language VARCHAR(16) NOT NULL DEFAULT 'nl',
              avatar_data_url MEDIUMTEXT NULL,
              avatar_color VARCHAR(32) NOT NULL DEFAULT '#2563eb',
              status VARCHAR(32) NOT NULL DEFAULT 'active',
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """);
        Execute(connection, """
            CREATE TABLE IF NOT EXISTS account_identities (
              id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
              account_id VARCHAR(96) NOT NULL,
              provider VARCHAR(32) NOT NULL,
              provider_subject VARCHAR(255) NOT NULL,
              email VARCHAR(255) NOT NULL DEFAULT '',
              email_verified TINYINT(1) NOT NULL DEFAULT 0,
              linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              last_used_at DATETIME NULL,
              UNIQUE KEY uq_account_identity_provider_subject (provider, provider_subject(190)),
              KEY idx_account_identity_account (account_id),
              KEY idx_account_identity_email (email(190))
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """);
        Execute(connection, """
            CREATE TABLE IF NOT EXISTS account_credentials (
              account_id VARCHAR(96) NOT NULL PRIMARY KEY,
              password_hash VARCHAR(255) NOT NULL,
              password_updated_at DATETIME NOT NULL
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """);
        Execute(connection, """
            CREATE TABLE IF NOT EXISTS account_xmpp (
              account_id VARCHAR(96) NOT NULL PRIMARY KEY,
              xmpp_jid VARCHAR(255) NOT NULL,
              xmpp_domain VARCHAR(255) NOT NULL DEFAULT 'localhost',
              xmpp_host VARCHAR(255) NOT NULL DEFAULT 'localhost',
              xmpp_port INT NOT NULL DEFAULT 5222,
              xmpp_tls_mode VARCHAR(32) NOT NULL DEFAULT 'starttls',
              xmpp_websocket VARCHAR(255) NOT NULL DEFAULT 'ws://127.0.0.1:8787',
              peer VARCHAR(255) NOT NULL DEFAULT 'relay@localhost',
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              UNIQUE KEY uq_account_xmpp_jid (xmpp_jid)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """);
        Execute(connection, """
            CREATE TABLE IF NOT EXISTS message_history (
              id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
              account_id VARCHAR(96) NOT NULL,
              conversation_peer VARCHAR(255) NOT NULL,
              conversation_name VARCHAR(255) NOT NULL DEFAULT '',
              conversation_kind VARCHAR(32) NOT NULL DEFAULT 'contact',
              message_id VARCHAR(160) NOT NULL,
              direction VARCHAR(16) NOT NULL,
              sender_jid VARCHAR(255) NOT NULL DEFAULT '',
              text MEDIUMTEXT NOT NULL,
              status VARCHAR(64) NOT NULL DEFAULT '',
              attachment_json MEDIUMTEXT NULL,
              location_json MEDIUMTEXT NULL,
              styling_disabled TINYINT(1) NOT NULL DEFAULT 0,
              edited TINYINT(1) NOT NULL DEFAULT 0,
              retracted TINYINT(1) NOT NULL DEFAULT 0,
              retraction_json MEDIUMTEXT NULL,
              message_timestamp DATETIME(3) NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              UNIQUE KEY uq_message_history_account_message (account_id, message_id),
              KEY idx_message_history_account_peer_time (account_id, conversation_peer, message_timestamp)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """);
    }

    private static void Execute(MySqlConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }

    private static string LoadConnectionString(string repoRoot)
    {
        var host = Environment.GetEnvironmentVariable("TELETYPTEL_DB_HOST") ?? "127.0.0.1";
        var port = Environment.GetEnvironmentVariable("TELETYPTEL_DB_PORT") ?? "3306";
        var database = Environment.GetEnvironmentVariable("TELETYPTEL_DB_NAME") ?? "teletyptel";
        var user = Environment.GetEnvironmentVariable("TELETYPTEL_DB_USER") ?? "teletyptel";
        var password = Environment.GetEnvironmentVariable("TELETYPTEL_DB_PASSWORD") ?? string.Empty;

        var phpConfig = Path.Combine(repoRoot, "php", "config.php");
        if (File.Exists(phpConfig))
        {
            var text = File.ReadAllText(phpConfig, Encoding.UTF8);
            host = ReadPhpConfigValue(text, "host") ?? host;
            port = ReadPhpConfigValue(text, "port") ?? port;
            database = ReadPhpConfigValue(text, "database") ?? database;
            user = ReadPhpConfigValue(text, "username") ?? user;
            password = ReadPhpConfigValue(text, "password") ?? password;
        }

        var builder = new MySqlConnectionStringBuilder
        {
            Server = host,
            Port = uint.TryParse(port, out var parsedPort) ? parsedPort : 3306,
            Database = database,
            UserID = user,
            Password = password,
            CharacterSet = "utf8mb4",
            SslMode = MySqlSslMode.None,
            AllowUserVariables = true
        };
        return builder.ConnectionString;
    }

    private static string? ReadPhpConfigValue(string text, string key)
    {
        var marker = "'" + key + "'";
        var index = text.IndexOf(marker, StringComparison.Ordinal);
        if (index < 0)
        {
            return null;
        }

        var arrow = text.IndexOf("=>", index, StringComparison.Ordinal);
        if (arrow < 0)
        {
            return null;
        }

        var valueStart = arrow + 2;
        while (valueStart < text.Length && char.IsWhiteSpace(text[valueStart]))
        {
            valueStart++;
        }

        if (valueStart >= text.Length)
        {
            return null;
        }

        if (char.IsDigit(text[valueStart]))
        {
            var numberEnd = valueStart;
            while (numberEnd < text.Length && char.IsDigit(text[numberEnd]))
            {
                numberEnd++;
            }

            return text[valueStart..numberEnd];
        }

        if (text[valueStart] is not ('\'' or '"'))
        {
            return null;
        }

        var quote = text[valueStart];
        var valueEnd = text.IndexOf(quote, valueStart + 1);
        return valueEnd > valueStart ? text[(valueStart + 1)..valueEnd] : null;
    }

    private static string SanitizeAccountId(string value)
    {
        var builder = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            builder.Append(char.IsLetterOrDigit(ch) || ch is '-' or '_' ? ch : '-');
        }

        return builder.Length > 0 ? builder.ToString() : "account";
    }
}

internal sealed record SqlAccountRow(
    string AccountId,
    string Jid,
    string DisplayName,
    string ProviderId,
    string PreferredLanguage,
    string XmppHost,
    int XmppPort,
    string XmppDomain,
    string XmppTlsMode,
    DateTime UpdatedAt);

internal sealed record SqlHistoryRow(
    string AccountId,
    string ConversationPeer,
    string ConversationName,
    string ConversationKind,
    string MessageId,
    string Direction,
    string SenderJid,
    string Text,
    string Status,
    bool Edited,
    bool Retracted,
    DateTime MessageTimestamp);

internal static class ServiceStatusProbe
{
    private static readonly Dictionary<string, string[]> ProcessNamesByService = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Apache / WAMP webserver"] = ["httpd", "apache", "wampapache64", "wampapache"],
        ["TeleTypTel webclient dev server"] = ["php", "node", "dotnet"],
        ["MySQL / MariaDB"] = ["mysqld", "mariadbd", "wampmysqld64", "wampmariadb64"],
        ["PHP RTT relay"] = ["php"],
        ["Local XMPP server"] = ["Tiedragon.XmppMessenger.LocalServer", "dotnet"],
        ["Local upload endpoint"] = ["Tiedragon.XmppMessenger.LocalServer", "dotnet"],
    };

    public static IReadOnlyList<ServiceStatusRow> GetStatuses(int xmppPort, int uploadPort)
    {
        var rows = new List<ServiceStatusRow>
        {
            Create("Apache / WAMP webserver", ["httpd", "apache", "wampapache64", "wampapache"], [80, 8080]),
            Create("TeleTypTel webclient dev server", ["php", "node", "dotnet"], [8090]),
            Create("MySQL / MariaDB", ["mysqld", "mariadbd", "wampmysqld64", "wampmariadb64"], [3306, 3307]),
            Create("PHP RTT relay", ["php"], [8787]),
            Create("Local XMPP server", ["Tiedragon.XmppMessenger.LocalServer", "dotnet"], [xmppPort]),
            Create("Local upload endpoint", ["Tiedragon.XmppMessenger.LocalServer", "dotnet"], uploadPort > 0 ? [uploadPort] : []),
        };
        return rows;
    }

    public static int ForceTerminate(string serviceName)
    {
        if (!ProcessNamesByService.TryGetValue(serviceName, out var names))
        {
            return 0;
        }

        var targets = FindProcessObjects(names);
        var killed = 0;
        foreach (var process in targets)
        {
            try
            {
                process.Kill(entireProcessTree: true);
                killed++;
            }
            catch (Exception ex) when (ex is InvalidOperationException or Win32Exception)
            {
            }
            finally
            {
                process.Dispose();
            }
        }

        return killed;
    }

    private static ServiceStatusRow Create(string name, string[] processNames, int[] ports)
    {
        var matchedProcesses = FindProcesses(processNames);
        var portStates = ports.Select(port => new
        {
            Port = port,
            Listening = port > 0 && !IsTcpPortAvailable(IPAddress.Loopback, port)
        }).ToArray();
        var activePorts = portStates.Where(item => item.Listening).Select(item => item.Port).ToArray();
        var running = matchedProcesses.Count > 0 || activePorts.Length > 0;
        var detail = new List<string>();
        if (matchedProcesses.Count > 0)
        {
            detail.Add("processen: " + string.Join(", ", matchedProcesses.Take(6)));
        }

        if (activePorts.Length > 0)
        {
            detail.Add("poorten actief: " + string.Join(", ", activePorts));
        }

        if (detail.Count == 0 && ports.Length > 0)
        {
            detail.Add("poorten vrij: " + string.Join(", ", ports));
        }

        return new ServiceStatusRow(
            name,
            running ? "Actief" : "Niet gevonden",
            ports.Length == 0 ? "-" : string.Join(", ", ports),
            detail.Count == 0 ? "-" : string.Join(" | ", detail));
    }

    private static List<string> FindProcesses(string[] names)
    {
        return FindProcessObjects(names)
            .Select(process =>
            {
                using (process)
                {
                    return $"{process.ProcessName}({process.Id})";
                }
            })
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static List<Process> FindProcessObjects(string[] names)
    {
        var normalized = names.Select(name => name.ToLowerInvariant()).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return Process.GetProcesses()
            .Where(process =>
            {
                try
                {
                    return normalized.Contains(process.ProcessName.ToLowerInvariant());
                }
                catch (InvalidOperationException)
                {
                    return false;
                }
            })
            .ToList();
    }

    private static bool IsTcpPortAvailable(IPAddress address, int port)
    {
        try
        {
            var listener = new TcpListener(address, port);
            listener.Start();
            listener.Stop();
            return true;
        }
        catch (SocketException)
        {
            return false;
        }
    }
}

internal sealed record ServiceStatusRow(
    string Service,
    string Status,
    string Ports,
    string Details);
