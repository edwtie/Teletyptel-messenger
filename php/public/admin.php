<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TeleTypTel admin</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Arial, sans-serif;
      --line: #b8d4ff;
      --blue: #0b73e7;
      --ink: #0f172a;
      --muted: #526070;
      --panel: #fff;
      --bg: #eef4ff;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 24px; background: var(--panel); border-bottom: 1px solid var(--line); }
    h1, h2 { margin: 0; }
    main { display: grid; gap: 18px; padding: 20px; }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
    button, input, select, textarea { font: inherit; }
    button { border: 1px solid #0b63ce; background: var(--blue); color: #fff; border-radius: 6px; padding: 9px 12px; cursor: pointer; }
    button.secondary { background: #f8fbff; color: var(--ink); }
    input, select, textarea { border: 1px solid #94bff0; border-radius: 6px; padding: 8px; width: 100%; }
    textarea { min-height: 72px; resize: vertical; }
    table { border-collapse: collapse; width: 100%; min-width: 980px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 9px; text-align: left; vertical-align: top; }
    th { font-size: 13px; color: var(--muted); background: #f8fbff; }
    .toolbar { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; }
    .toolbar label { display: grid; gap: 4px; min-width: 220px; font-weight: 700; }
    .login-bar { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; }
    .cards { display: grid; grid-template-columns: repeat(5, minmax(130px, 1fr)); gap: 12px; }
    .card { border: 1px solid #c7ddff; border-radius: 8px; padding: 12px; background: #f8fbff; }
    .card strong { display: block; font-size: 26px; }
    .small, .status { color: var(--muted); font-size: 13px; }
    .table-wrap { overflow: auto; border: 1px solid #d7e7ff; border-radius: 8px; }
    .badge { display: inline-block; border-radius: 999px; padding: 3px 8px; font-size: 12px; font-weight: 700; }
    .badge.ok { background: #dcfce7; color: #166534; }
    .badge.warn { background: #fee2e2; color: #991b1b; }
    .row-actions { display: grid; gap: 7px; min-width: 190px; }
    .logs { display: grid; gap: 8px; }
    .log-row { display: grid; grid-template-columns: 100px 220px 1fr 170px; gap: 10px; border-bottom: 1px solid #e2e8f0; padding: 8px 0; }
    .error { border-color: #d92d20; background: #fff1f0; color: #991b1b; }
    @media (max-width: 900px) {
      header { align-items: flex-start; flex-direction: column; }
      .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .log-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>TeleTypTel admin</h1>
      <div class="small">Status, accounts, abonnementen en logs</div>
    </div>
    <div class="toolbar">
      <div id="loginBar" class="login-bar">
        <label>
          Admin e-mail
          <input id="adminEmailInput" type="email" autocomplete="username">
        </label>
        <label>
          Wachtwoord
          <input id="adminPasswordInput" type="password" autocomplete="current-password">
        </label>
        <button id="loginButton" type="button">Inloggen</button>
      </div>
      <span id="adminIdentity" class="small"></span>
      <button id="logoutButton" class="secondary" type="button" hidden>Uitloggen</button>
      <button id="refreshButton" type="button">Verversen</button>
      <a href="chat.html"><button class="secondary" type="button">Chat openen</button></a>
    </div>
  </header>

  <main>
    <section id="messagePanel" hidden></section>

    <section>
      <h2>Overzicht</h2>
      <div id="cards" class="cards"></div>
      <p id="serverStatus" class="status"></p>
    </section>

    <section>
      <h2>Accounts en abonnementen</h2>
      <p class="small">Hier kun je nu alvast plan/status/notitie beheren. Later kan hier facturatie of subsidiecontrole aan vast.</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Naam</th>
              <th>JID</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Tot</th>
              <th>Gebruik</th>
              <th>Notitie</th>
              <th>Actie</th>
            </tr>
          </thead>
          <tbody id="accountsTable"></tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Logs</h2>
      <div id="logs" class="logs"></div>
    </section>
  </main>

  <script>
    const loginBar = document.getElementById("loginBar");
    const adminEmailInput = document.getElementById("adminEmailInput");
    const adminPasswordInput = document.getElementById("adminPasswordInput");
    const loginButton = document.getElementById("loginButton");
    const logoutButton = document.getElementById("logoutButton");
    const adminIdentity = document.getElementById("adminIdentity");
    const refreshButton = document.getElementById("refreshButton");
    const messagePanel = document.getElementById("messagePanel");
    const cards = document.getElementById("cards");
    const serverStatus = document.getElementById("serverStatus");
    const accountsTable = document.getElementById("accountsTable");
    const logs = document.getElementById("logs");

    adminEmailInput.value = sessionStorage.getItem("teletyptelAdminEmail") || "";
    loginButton.addEventListener("click", loginAdmin);
    logoutButton.addEventListener("click", logoutAdmin);
    refreshButton.addEventListener("click", loadAdmin);
    adminPasswordInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") loginAdmin();
    });

    async function adminFetch(url, options = {}) {
      const headers = { ...(options.headers || {}) };
      const response = await fetch(url, { ...options, headers });
      const data = await response.json().catch(() => ({ ok: false, error: "invalid_json" }));
      if (!response.ok || data.ok === false) {
        throw new Error(data.message || data.error || "Admin request mislukt");
      }
      return data;
    }

    async function loginAdmin() {
      setMessage("");
      try {
        const data = await adminFetch("api/admin.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "login",
            email: adminEmailInput.value,
            password: adminPasswordInput.value
          })
        });
        sessionStorage.setItem("teletyptelAdminEmail", adminEmailInput.value);
        adminPasswordInput.value = "";
        setAdminIdentity(data.admin || null);
        loadAdmin();
      } catch (error) {
        setMessage(error.message, true);
      }
    }

    async function logoutAdmin() {
      await adminFetch("api/admin.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" })
      }).catch(() => {});
      setAdminIdentity(null);
      renderCards({});
      renderAccounts([]);
      renderLogs([]);
      setMessage("Uitgelogd.");
    }

    async function loadAdmin() {
      setMessage("");
      try {
        const data = await adminFetch("api/admin.php");
        setAdminIdentity(data.admin || null);
        renderCards(data.stats || {});
        renderServer(data.server || {});
        renderAccounts(data.accounts || []);
        renderLogs(data.logs || []);
      } catch (error) {
        setAdminIdentity(null);
        setMessage(error.message, true);
      }
    }

    function setAdminIdentity(admin) {
      const loggedIn = Boolean(admin);
      loginBar.hidden = loggedIn;
      logoutButton.hidden = !loggedIn;
      adminIdentity.textContent = loggedIn ? `${admin.displayName || admin.email} (${admin.role || "admin"})` : "";
    }

    function renderCards(stats) {
      const items = [
        ["Accounts", stats.accounts ?? 0],
        ["Actief", stats.activeAccounts ?? 0],
        ["Berichten", stats.messages ?? 0],
        ["Uploads", stats.uploads ?? 0],
        ["Mail fouten", stats.failedMails ?? 0],
      ];
      cards.innerHTML = items.map(([label, value]) => `<div class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("");
    }

    function renderServer(server) {
      const parts = [
        `PHP ${server.phpVersion || "?"}`,
        server.os || "?",
        server.https ? "HTTPS" : "geen HTTPS",
        server.pdoMysql ? "pdo_mysql OK" : "pdo_mysql mist",
        server.adminTokenConfigured ? "token actief" : "alleen lokaal"
      ];
      serverStatus.textContent = parts.join(" · ");
    }

    function renderAccounts(accounts) {
      accountsTable.innerHTML = accounts.map((account) => {
        const id = escapeHtml(account.account_id || "");
        return `<tr data-account-id="${id}">
          <td><strong>${escapeHtml(account.display_name || "-")}</strong><div class="small">${escapeHtml(account.provider_id || "")}</div></td>
          <td>${escapeHtml(account.jid || "")}<div class="small">${id}</div></td>
          <td>${selectHtml("subscriptionPlan", account.subscription_plan || "free", ["free", "pro", "business", "subsidy", "disabled"])}</td>
          <td>${selectHtml("accountStatus", account.account_status || "active", ["active", "trial", "suspended", "closed"])}</td>
          <td><input data-field="subscriptionExpiresAt" type="date" value="${escapeHtml(account.subscription_expires_at || "")}"></td>
          <td>${escapeHtml(String(account.message_count || 0))} berichten<br>${escapeHtml(String(account.upload_count || 0))} uploads</td>
          <td><textarea data-field="adminNote">${escapeHtml(account.admin_note || "")}</textarea></td>
          <td class="row-actions"><button type="button" data-save="${id}">Opslaan</button><span class="small">${escapeHtml(account.updated_at || "")}</span></td>
        </tr>`;
      }).join("");

      accountsTable.querySelectorAll("[data-save]").forEach((button) => {
        button.addEventListener("click", () => saveAccount(button.dataset.save));
      });
    }

    async function saveAccount(accountId) {
      const row = accountsTable.querySelector(`tr[data-account-id="${CSS.escape(accountId)}"]`);
      if (!row) return;
      const body = {
        accountId,
        subscriptionPlan: row.querySelector('[data-field="subscriptionPlan"]').value,
        accountStatus: row.querySelector('[data-field="accountStatus"]').value,
        subscriptionExpiresAt: row.querySelector('[data-field="subscriptionExpiresAt"]').value,
        adminNote: row.querySelector('[data-field="adminNote"]').value,
      };
      try {
        await adminFetch("api/admin.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        setMessage("Account bijgewerkt.");
        loadAdmin();
      } catch (error) {
        setMessage(error.message, true);
      }
    }

    function renderLogs(items) {
      if (!items.length) {
        logs.innerHTML = '<p class="small">Geen logs gevonden.</p>';
        return;
      }
      logs.innerHTML = items.map((item) => `<div class="log-row">
        <strong>${escapeHtml(item.source || "")}</strong>
        <span>${escapeHtml(item.subject || "")}</span>
        <span>${escapeHtml(item.detail || "")}</span>
        <span class="small">${escapeHtml(item.created_at || "")}</span>
      </div>`).join("");
    }

    function selectHtml(field, current, values) {
      return `<select data-field="${field}">${values.map((value) => `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select>`;
    }

    function setMessage(message, isError = false) {
      messagePanel.hidden = !message;
      messagePanel.className = isError ? "error" : "";
      messagePanel.textContent = message;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char]));
    }

    loadAdmin();
  </script>
</body>
</html>
