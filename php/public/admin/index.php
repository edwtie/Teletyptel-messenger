<?php
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
?>
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
    [hidden] { display: none !important; }
    body { margin: 0; background: var(--bg); color: var(--ink); }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 24px; background: var(--panel); border-bottom: 1px solid var(--line); }
    h1, h2 { margin: 0; }
    main { display: grid; gap: 18px; padding: 20px; }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
    button, input, select, textarea { font: inherit; }
    button { border: 1px solid #0b63ce; background: var(--blue); color: #fff; border-radius: 6px; padding: 9px 12px; cursor: pointer; }
    button.secondary, .button-link.secondary { background: #f8fbff; color: var(--ink); }
    button, .button-link { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
    .button-link { border: 1px solid #0b63ce; background: var(--blue); color: #fff; border-radius: 6px; padding: 9px 12px; text-decoration: none; }
    button:focus-visible, a:focus-visible { outline: 3px solid #60a5fa; outline-offset: 3px; }
    .icon { width: 20px; height: 20px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; vertical-align: middle; }
    .icon-definitions { position: absolute; width: 0; height: 0; overflow: hidden; }
    .heading-icon { display: flex; align-items: center; gap: 10px; }
    .heading-icon > .icon { color: var(--blue); width: 24px; height: 24px; }
    input, select, textarea { border: 1px solid #94bff0; border-radius: 6px; padding: 8px; width: 100%; }
    textarea { min-height: 72px; resize: vertical; }
    table { border-collapse: collapse; width: 100%; min-width: 980px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 9px; text-align: left; vertical-align: top; }
    th { font-size: 13px; color: var(--muted); background: #f8fbff; }
    .toolbar { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; }
    .toolbar label { display: grid; gap: 4px; min-width: 220px; font-weight: 700; }
    .login-bar { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; }
    .server-grid { display: grid; grid-template-columns: repeat(4, minmax(150px, 1fr)); gap: 12px; margin-top: 12px; }
    .card { min-width: 0; overflow-wrap: anywhere; border: 1px solid #c7ddff; border-radius: 8px; padding: 12px; background: #f8fbff; }
    .card strong { display: block; font-size: 26px; }
    .card-label { display: flex; align-items: center; gap: 8px; color: var(--muted); margin-bottom: 10px; }
    .card-label .icon { color: var(--blue); }
    .runtime-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .runtime-grid .card { display: grid; gap: 10px; }
    .runtime-grid .card-label { color: var(--ink); font-weight: 700; margin: 0; }
    .small, .status { color: var(--muted); font-size: 13px; }
    .table-wrap { overflow: auto; border: 1px solid #d7e7ff; border-radius: 8px; }
    .badge { display: inline-block; border-radius: 999px; padding: 3px 8px; font-size: 12px; font-weight: 700; }
    .badge.ok { background: #dcfce7; color: #166534; }
    .badge.warn { background: #fee2e2; color: #991b1b; }
    .row-actions { display: grid; gap: 7px; min-width: 190px; }
    .logs { display: grid; gap: 8px; }
    .log-row { display: grid; grid-template-columns: 100px 220px 1fr 170px; gap: 10px; border-bottom: 1px solid #e2e8f0; padding: 8px 0; }
    .log-row > * { min-width: 0; overflow-wrap: anywhere; }
    .error { border-color: #d92d20; background: #fff1f0; color: #991b1b; }
    .workspace { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 20px; align-items: start; }
    .admin-navigation { position: sticky; top: 20px; padding: 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
    .nav-caption { color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: .08em; margin: 0 10px 14px; text-transform: uppercase; }
    .admin-nav-links { display: grid; gap: 8px; }
    .nav-link { display: flex; align-items: center; gap: 10px; border-radius: 6px; padding: 12px 10px; color: var(--muted); text-decoration: none; font-weight: 700; }
    .nav-link:hover { background: #f0f6ff; color: var(--ink); }
    .nav-link[aria-current="page"] { background: #e3efff; color: #0759b5; box-shadow: inset 3px 0 #0b73e7; }
    .admin-content { min-width: 0; }
    .admin-view { display: grid; gap: 18px; min-width: 0; }
    .user-management-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 18px; min-width: 0; }
    #userListPanel, #userDetailsPanel, #staffView, #staffDetailsPanel, #plansView { grid-template-columns: minmax(0, 1fr); }
    #userDetailsPanel summary { cursor: pointer; font-weight: 650; padding: 6px 0; }
    .user-list-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 18px; }
    .user-list-heading h3, .user-list-heading p { margin: 0; }
    .user-search { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(170px, 250px) auto; gap: 12px; align-items: end; margin-bottom: 14px; }
    .user-search label { display: grid; gap: 7px; font-size: 14px; min-width: 0; }
    .user-search input, .user-search select, .user-search button { min-height: 44px; }
    .user-filter-label { display: inline-flex; gap: 6px; align-items: center; }
    .user-bulk-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 14px; margin: 16px 0; border: 1px solid #a5c9ff; background: #edf5ff; border-radius: 10px; }
    #userSelectionCount, #staffSelectionCount { font-weight: 700; font-size: 14px; }
    .user-bulk-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .user-bulk-actions button { min-height: 42px; font-size: 14px; }
    button.user-danger { color: #b42318; border-color: #e6a6a0; background: #fff; }
    .user-list-table { min-width: 620px; }
    .user-list-table th, .user-list-table td { padding: 14px 12px; vertical-align: middle; }
    .user-list-table th:first-child, .user-list-table td:first-child { width: 48px; text-align: center; }
    .user-list-table input[type="checkbox"] { width: 20px; height: 20px; accent-color: var(--blue); cursor: pointer; }
    .user-list-table tbody tr:has(input:checked) { background: #edf5ff; }
    .user-list-table tbody tr:hover { background: #f5f9ff; }
    .user-list-table td:last-child { width: 125px; }
    .user-person { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .user-avatar { display: grid; place-items: center; width: 38px; height: 38px; flex-shrink: 0; border-radius: 50%; color: #0759b5; background: #e8f1ff; }
    .user-person-text { overflow-wrap: anywhere; max-width: 360px; }
    .user-person-text strong { display: block; margin-bottom: 4px; }
    .user-status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 9px; border-radius: 7px; font-size: 12px; font-weight: 650; background: #f1f3f6; color: #475467; }
    .user-status-badge .icon { width: 16px; height: 16px; }
    .user-status-badge.active, .user-status-badge.trial { background: #e9f7ee; color: #24633d; }
    .user-status-badge.blocked, .user-status-badge.suspended { background: #fff2e5; color: #8c4915; }
    .user-status-badge.trash { background: #fceeed; color: #a22d25; }
    @media (max-width: 600px) {
      .user-search { grid-template-columns: minmax(0, 1fr); }
      .user-bulk-actions { width: 100%; }
      .user-bulk-actions button { flex: 1 1 140px; }
    }
    .page-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; padding: 4px 0; }
    .page-heading h2 { font-size: 26px; }
    .page-heading p { margin: 8px 0 0; }
    .section-heading, .pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 12px 0; }
    .filters { display: flex; align-items: end; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
    .filters label, .setup-form label { display: grid; gap: 6px; }
    .setup-form { display: grid; gap: 12px; max-width: 440px; }
    .plan-form { display: grid; gap: 14px; max-width: 620px; }
    .plan-form label { display: grid; gap: 6px; }
    .plan-intake-fields { border: 1px solid var(--line); border-radius: 8px; padding: 16px; min-width: 0; margin: 6px 0; }
    .plan-intake-fields legend { font-weight: 700; padding: 0 6px; }
    .plan-form .checkbox-label { display: flex; align-items: center; gap: 10px; }
    input[type="checkbox"] { width: auto; }
    dialog { width: min(1140px, 96vw); max-height: 92vh; border: 1px solid var(--line); border-radius: 12px; padding: 24px; color: var(--ink); }
    dialog::backdrop { background: #0f172a99; }
    dialog h3 { margin: 22px 0 8px; }
    dialog table { min-width: 760px; }
    .user-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
    .user-fields div { padding: 10px; background: var(--bg); border-radius: 6px; overflow-wrap: anywhere; }
    .user-fields dt { font-size: 13px; color: var(--muted); }
    .user-fields dd { margin: 5px 0 0; }
    .privacy-note { padding: 12px; border-left: 4px solid var(--blue); background: var(--bg); }
    .text-link { color: var(--blue); text-decoration: underline; }
    button:disabled { opacity: .55; cursor: default; }
    @media (max-width: 900px) {
      header { align-items: flex-start; flex-direction: column; }
      .workspace { grid-template-columns: minmax(0, 1fr); }
      .admin-navigation { position: static; padding: 10px; }
      .nav-caption { display: none; }
      .admin-nav-links { display: flex; flex-wrap: wrap; }
      .cards, .server-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .runtime-grid { grid-template-columns: 1fr; }
      .log-row { grid-template-columns: 1fr; }
      .user-fields { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <svg class="icon-definitions" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <symbol id="admin-icon-home" viewBox="0 0 24 24"><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/></symbol>
      <symbol id="admin-icon-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/></symbol>
      <symbol id="admin-icon-server" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M12 6.5h5M12 17.5h5"/></symbol>
      <symbol id="admin-icon-database" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/></symbol>
      <symbol id="admin-icon-code" viewBox="0 0 24 24"><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/></symbol>
      <symbol id="admin-icon-message" viewBox="0 0 24 24"><path d="M21 11a8 8 0 0 1-8 8H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M7 8h10M7 12h7"/></symbol>
      <symbol id="admin-icon-activity" viewBox="0 0 24 24"><path d="M3 12h4l3-9 4 18 3-9h4"/></symbol>
      <symbol id="admin-icon-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></symbol>
      <symbol id="admin-icon-upload" viewBox="0 0 24 24"><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></symbol>
      <symbol id="admin-icon-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></symbol>
      <symbol id="admin-icon-refresh" viewBox="0 0 24 24"><path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5m-3 9a9 9 0 0 0 15 2l3-3m0 5v-5h-5"/></symbol>
      <symbol id="admin-icon-logout" viewBox="0 0 24 24"><path d="M9 3H4v18h5m0-9h12m-4-4 4 4-4 4"/></symbol>
      <symbol id="admin-icon-search" viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></symbol>
      <symbol id="admin-icon-save" viewBox="0 0 24 24"><path d="M4 3h13l4 4v14H3V3h1Zm3 0v6h10V3M7 21v-8h10v8"/></symbol>
      <symbol id="admin-icon-plan" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 15h3m4 0h3"/></symbol>
      <symbol id="admin-icon-lock" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></symbol>
      <symbol id="admin-icon-unlock" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2m-3.5 10v2"/></symbol>
      <symbol id="admin-icon-trash" viewBox="0 0 24 24"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></symbol>
      <symbol id="admin-icon-restore" viewBox="0 0 24 24"><path d="M3 4v6h6M3 10a9 9 0 1 1 1 8"/></symbol>
      <symbol id="admin-icon-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol>
      <symbol id="admin-icon-filter" viewBox="0 0 24 24"><path d="M3 5h18M6 12h12m-9 7h6"/></symbol>
      <symbol id="admin-icon-arrow" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></symbol>
      <symbol id="admin-icon-add" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16"/></symbol>
      <symbol id="admin-icon-eye" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></symbol>
      <symbol id="admin-icon-eye-off" viewBox="0 0 24 24"><path d="m3 3 18 18M9 5a11 11 0 0 1 3 0c6 0 10 7 10 7a17 17 0 0 1-3 4M6 6a21 21 0 0 0-4 6s4 7 10 7a13 13 0 0 0 5-1M9 9a4 4 0 0 0 6 6"/></symbol>
    </defs>
  </svg>
  <header>
    <div>
      <h1>TeleTypTel admin</h1>
      <div class="small">Gebruikers, gespreksactiviteit en serverbeheer</div>
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
      <button id="logoutButton" class="secondary" type="button" hidden><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-logout"/></svg>Uitloggen</button>
      <button id="refreshButton" type="button" disabled><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-refresh"/></svg>Verversen</button>
      <a href="../chat.html" class="button-link secondary"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-message"/></svg>Chat openen</a>
      <a id="interpretersAdminLink" href="interpreters.php" class="button-link secondary" hidden>Tolkenbeheer</a>
      <a href="support-chat.php" class="button-link secondary">Klantenservice</a>
    </div>
  </header>

  <main>
    <section id="messagePanel" role="status" aria-live="polite" hidden></section>

    <section id="setupPanel" hidden>
      <h2>Eerste beheerder instellen</h2>
      <p id="setupHint">Maak een apart beheeraccount. Gebruik hiervoor niet je Google-wachtwoord.</p>
      <p id="setupLocalLink" hidden>Open op de servercomputer <a href="https://localhost/admin/">https://localhost/admin/</a> om de eerste beheerder in te stellen. Daarna kun je hier inloggen.</p>
      <form id="setupForm" class="setup-form" hidden>
        <label>Naam <input id="setupName" autocomplete="name" maxlength="120"></label>
        <label>Beheer-e-mailadres <input id="setupEmail" type="email" autocomplete="username" maxlength="255" required></label>
        <label>Nieuw beheerwachtwoord (minimaal 12 tekens) <input id="setupPassword" type="password" autocomplete="new-password" minlength="12" maxlength="72" required></label>
        <label>Herhaal wachtwoord <input id="setupPasswordConfirm" type="password" autocomplete="new-password" minlength="12" maxlength="72" required></label>
        <button id="setupButton" type="submit">Beheeraccount maken</button>
      </form>
    </section>

    <div id="adminWorkspace" class="workspace" hidden>
      <nav class="admin-navigation" aria-label="Beheermenu">
        <p class="nav-caption">Beheeromgeving</p>
        <div class="admin-nav-links">
          <a id="homeNavLink" class="nav-link" href="#hoofdpagina" aria-current="page"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-home"/></svg>Hoofdpagina</a>
          <a id="usersNavLink" class="nav-link" href="#gebruikers"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-users"/></svg>Gebruikersbeheer</a>
          <a id="staffNavLink" class="nav-link" href="#staff"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-users"/></svg>Staffbeheer</a>
          <a class="nav-link" href="aanmeldingen.php"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-users"/></svg>Aanmeldingen &amp; staff</a>
          <a id="plansNavLink" class="nav-link" href="#abonnementen"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-plan"/></svg>Abonnementen</a>
          <a id="billingNavLink" class="nav-link" href="#facturatie"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-mail"/></svg>Facturatie</a>
          <a id="settingsNavLink" class="nav-link" href="#instellingen" hidden><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-code"/></svg>Instellingen</a>
          <a id="logsNavLink" class="nav-link" href="#logs"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-activity"/></svg>Systeem- en beheerlog</a>
        </div>
      </nav>
      <div class="admin-content">
        <div id="homeView" class="admin-view" role="region" aria-labelledby="homeTitle">
          <div class="page-heading">
            <div><h2 id="homeTitle" class="heading-icon" tabindex="-1"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-home"/></svg>Hoofdpagina</h2><p class="small">Serverstatus en gebruik in één overzicht.</p></div>
            <a class="button-link secondary" href="#gebruikers"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-users"/></svg>Naar gebruikersbeheer</a>
          </div>
          <p id="dashboardStatus" class="status" role="status" aria-live="polite"></p>

    <section>
      <h3 class="heading-icon"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-server"/></svg>Apache, MySQL en PHP</h3>
      <div id="runtimeStatus" class="server-grid runtime-grid"></div>
      <p id="runtimeHint" class="status"></p>
      <p id="serverStatus" class="status"></p>
    </section>

    <section>
      <h3 class="heading-icon"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-activity"/></svg>Gebruiksoverzicht</h3>
      <div id="cards" class="cards"></div>
    </section>

    <section>
      <h3 class="heading-icon"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-message"/></svg>ejabberd en SIP-server</h3>
      <p class="small">SIP hoort bij de server/gatewaylaag. Dit paneel controleert de bekende ejabberd-configuratie en of de SIP-poorten bereikbaar lijken.</p>
      <div id="sipStatus" class="server-grid"></div>
      <p id="sipHint" class="status"></p>
    </section>

        </div>

        <div id="usersView" class="admin-view" role="region" aria-labelledby="usersTitle" hidden>
        <div id="userListPanel" class="admin-view">
          <div class="page-heading">
            <div><h2 id="usersTitle" class="heading-icon" tabindex="-1"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-users"/></svg>Gebruikersbeheer</h2><p class="small">Accounts zoeken, gegevens bekijken en opgeslagen gespreksactiviteit inzien.</p></div>
          </div>
    <section>
      <div class="user-list-heading">
        <h3 class="heading-icon"><svg class="icon" aria-hidden="true"><use href="#admin-icon-users"/></svg>Gebruikerslijst</h3>
        <p id="userListStatus" class="status" role="status" aria-live="polite"></p>
      </div>
      <form id="userSearchForm" class="user-search">
        <label>Gebruiker zoeken<input id="userSearchInput" type="search" placeholder="Naam, e-mail, JID of account-ID" maxlength="255" autocomplete="off"></label>
        <label><span class="user-filter-label"><svg class="icon" aria-hidden="true"><use href="#admin-icon-filter"/></svg>Toon</span><select id="userStatusInput"><option value="">Alle gebruikers</option><option value="active">Actief</option><option value="trial">Proef</option><option value="suspended">Opgeschort</option><option value="closed">Gesloten</option><option value="blocked">Webtoegang geblokkeerd</option><option value="trash">Prullenbak</option></select></label>
        <button type="submit"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-search"/></svg>Zoeken</button>
      </form>
      <p class="small">Vink gebruikers aan om ze te beheren. Selectie geldt voor deze pagina.</p>
      <?php require __DIR__ . '/user-bulk-panel.php'; ?>
      <div class="table-wrap">
        <table class="user-list-table">
          <thead>
            <tr>
              <th><input id="selectAllUsers" type="checkbox" aria-label="Alle gebruikers op deze pagina selecteren" disabled></th>
              <th>Gebruiker</th>
              <th>Abonnement</th>
              <th>Status</th>
              <th>Actie</th>
            </tr>
          </thead>
          <tbody id="accountsTable"></tbody>
        </table>
      </div>
      <div class="pagination"><button id="usersPrevious" class="secondary" type="button" disabled>Vorige gebruikers</button><span id="usersPageInfo" class="small"></span><button id="usersNext" class="secondary" type="button" disabled>Volgende gebruikers</button></div>
    </section>

        </div>
        <?php require __DIR__ . '/user-details.php'; ?>
        </div>
        <div id="plansView" class="admin-view" role="region" aria-labelledby="plansTitle" hidden>
          <div class="page-heading">
            <div><h2 id="plansTitle" class="heading-icon" tabindex="-1"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-plan"/></svg>Abonnementen</h2><p class="small">Plannen instellen, toevoegen en abonnementsovergangen terugzien.</p></div>
            <button id="newPlanButton" type="button"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-plan"/></svg>Plan toevoegen</button>
          </div>
          <p class="privacy-note">Administratief planbeheer. Prijzen zijn exclusief btw in EUR. Automatische facturatie activeer je apart per gebruiker. Planwijzigingen voeren geen betalingen of automatische toegangsbeperkingen uit.</p>
          <p id="plansStatus" class="status" role="status" aria-live="polite"></p>
          <section>
            <h3>Datumplanning</h3>
            <p id="scheduleWorkerStatus" class="status"></p>
            <p class="small">Plan een overgang via Gebruikersbeheer → Beheren → Abonnement wijzigen. Datums zijn UTC. Annuleer een openstaande planning voordat je een andere wijziging doet.</p>
            <div class="table-wrap"><table><thead><tr><th>Datum (UTC)</th><th>Gebruiker</th><th>Naar plan</th><th>Einddatum</th><th>Status / melding</th><th>Actie</th></tr></thead><tbody id="scheduleRows"></tbody></table></div>
            <div class="pagination"><button id="schedulePrevious" type="button" class="secondary">Vorige planningen</button><span id="schedulePageInfo"></span><button id="scheduleNext" type="button" class="secondary">Volgende planningen</button></div>
          </section>
          <section id="planEditorPanel" hidden>
            <h3 id="planEditorTitle" tabindex="-1">Plan toevoegen</h3>
            <form id="planForm" class="plan-form">
              <label>Plancode <input id="planCode" pattern="[a-z0-9][a-z0-9_-]{0,31}" maxlength="32" required autocomplete="off"></label>
              <p class="small">Een unieke, vaste code. Een bestaande plancode kun je niet wijzigen.</p>
              <label>Naam <input id="planName" maxlength="120" required></label>
              <label>Omschrijving <textarea id="planDescription" maxlength="1000"></textarea></label>
              <label>Referentieprijs (EUR) <input id="planPrice" inputmode="decimal" maxlength="10" placeholder="Leeg = nog niet ingesteld"></label>
              <label>Prijsperiode <select id="planPeriod"><option value="month">Per maand</option><option value="year">Per jaar</option><option value="once">Eenmalig</option><option value="none">Niet van toepassing</option></select></label>
              <label class="checkbox-label"><input id="planEnabled" type="checkbox" checked>Beschikbaar voor nieuwe toewijzingen</label>
              <p class="small">Uitschakelen behoudt bestaande abonnementen en historie. Het standaardplan free blijft beschikbaar.</p>
              <fieldset id="planIntakeFields" class="plan-form plan-intake-fields" hidden>
                <legend>Aanmelding en vereisten</legend>
                <label class="checkbox-label"><input id="planIntakePublished" type="checkbox">Tonen bij nieuwe aanmeldingen</label>
                <label class="checkbox-label"><input id="planIntakeDocuments" type="checkbox">Audiogram én voorschrift verplicht</label>
                <label class="checkbox-label"><input id="planIntakeBsn" type="checkbox">BSN verplicht</label>
                <p class="small">Bij verplichte documenten of BSN is ook een zorgverzekeraar verplicht. Het abonnement verschijnt alleen bij aanmelding als het beschikbaar én gepubliceerd is.</p>
                <p id="planIntakeReadiness" class="status" role="status"></p>
              </fieldset>
              <p id="planIntakeOwnerHint" class="small" hidden>Aanmeldvoorwaarden worden door de eigenaar ingesteld.</p>
              <div class="toolbar"><button id="savePlanButton" type="submit">Plan opslaan</button><button id="cancelPlanButton" class="secondary" type="button">Annuleren</button></div>
              <p id="planFormStatus" class="status" role="status" aria-live="polite"></p>
            </form>
          </section>
          <section>
            <h3>Beschikbare plannen</h3>
            <div class="table-wrap"><table><thead><tr><th>Plan</th><th>Omschrijving</th><th>Referentieprijs</th><th>Nieuwe toewijzingen</th><th>Gebruikers</th><th>Actie</th></tr></thead><tbody id="plansTable"></tbody></table></div>
            <p class="small">Een gebruiker overzetten? Ga naar <a href="#gebruikers">Gebruikersbeheer</a>, kies Beheren en daarna Abonnement wijzigen.</p>
          </section>
          <section>
            <h3>Abonnementsovergangen</h3>
            <p class="small">Wijzigingen vanaf de ingebruikname van dit planbeheer. Tijdstippen zijn UTC; bestaande abonnementen blijven behouden.</p>
            <div class="table-wrap"><table><thead><tr><th>Tijdstip (UTC)</th><th>Gebruiker</th><th>Van plan</th><th>Naar plan</th><th>Einddatum oud → nieuw</th><th>Reden</th><th>Beheerder</th></tr></thead><tbody id="planHistory"></tbody></table></div>
            <div class="pagination"><button id="planHistoryPrevious" class="secondary" type="button" disabled>Vorige overgangen</button><span id="planHistoryPageInfo" class="small"></span><button id="planHistoryNext" class="secondary" type="button" disabled>Volgende overgangen</button></div>
          </section>
        </div>
        <?php require __DIR__ . '/management-panels.php'; ?>
        <?php require __DIR__ . '/staff-panel.php'; ?>
        <div id="logsView" class="admin-view" role="region" aria-labelledby="logsTitle" hidden>
          <div class="page-heading">
            <div><h2 id="logsTitle" class="heading-icon" tabindex="-1"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-activity"/></svg>Systeem- en beheerlog</h2><p class="small">Recente systeemgebeurtenissen en geregistreerde beheerinzage.</p></div>
          </div>
          <section>
            <h3>Recente gebeurtenissen</h3>
            <p class="small">Inzage in gebruikersgegevens en chatlogs wordt hier geregistreerd. Dit overzicht toont maximaal 80 recente logregels. Gebruik Verversen om de nieuwste gebeurtenissen op te halen.</p>
            <p id="logsStatus" class="status" role="status" aria-live="polite"></p>
            <div id="logs" class="logs"></div>
          </section>
        </div>
      </div>
    </div>
  </main>

  <dialog id="subscriptionDialog" aria-labelledby="subscriptionTitle">
    <div class="section-heading"><h2 id="subscriptionTitle">Abonnement wijzigen</h2><button id="closeSubscription" class="secondary" type="button" autofocus>Sluiten</button></div>
    <p id="subscriptionStatus" class="status" role="status" aria-live="polite"></p>
    <p id="subscriptionCurrent"></p>
    <form id="subscriptionForm" class="plan-form" hidden>
      <label>Uitvoeren <select id="subscriptionMode"><option value="now">Direct</option><option value="later">Op een toekomstige datum</option></select></label>
      <label id="subscriptionEffectiveLabel" hidden>Ingangsdatum (UTC) <input id="subscriptionEffective" type="date"></label>
      <label>Naar plan <select id="subscriptionTarget" required></select></label>
      <label>Einddatum (optioneel) <input id="subscriptionExpiry" type="date"></label>
      <p class="small">Leeg betekent geen einddatum. De datum is administratief: deze schakelt niet automatisch het account uit.</p>
      <label>Reden / notitie <textarea id="subscriptionNote" maxlength="1000"></textarea></label>
      <label class="checkbox-label"><input id="subscriptionConfirm" type="checkbox" required>Ik bevestig deze wijziging en het gekozen moment voor de getoonde gebruiker.</label>
      <button id="saveSubscriptionButton" type="submit">Overgang direct uitvoeren</button>
    </form>
    <h3>Geplande overgangen</h3>
    <div class="table-wrap"><table><thead><tr><th>Datum (UTC)</th><th>Gebruiker</th><th>Naar plan</th><th>Einddatum</th><th>Status / melding</th><th>Actie</th></tr></thead><tbody id="subscriptionSchedules"></tbody></table></div>
    <h3>Recente overgangen voor deze gebruiker</h3>
    <p class="small">De 25 recentste wijzigingen; voor de volledige historie ga je naar Abonnementen.</p>
    <div class="table-wrap"><table><thead><tr><th>Tijdstip (UTC)</th><th>Gebruiker</th><th>Van plan</th><th>Naar plan</th><th>Einddatum oud → nieuw</th><th>Reden</th><th>Beheerder</th></tr></thead><tbody id="subscriptionHistory"></tbody></table></div>
  </dialog>

  <?php require __DIR__ . '/management-dialogs.php'; ?>
  <?php require __DIR__ . '/staff-dialog.php'; ?>
  <?php require __DIR__ . '/user-bulk-dialog.php'; ?>
  <script src="management.js?v=20261026-translation"></script>
  <script src="staff.js?v=20260923-staffbeheer"></script>
  <script src="user-bulk.js?v=20260923-design"></script>
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
    const runtimeStatus = document.getElementById("runtimeStatus");
    const runtimeHint = document.getElementById("runtimeHint");
    const sipStatus = document.getElementById("sipStatus");
    const sipHint = document.getElementById("sipHint");
    const accountsTable = document.getElementById("accountsTable");
    const logs = document.getElementById("logs");
    const adminWorkspace = document.getElementById("adminWorkspace");
    const setupPanel = document.getElementById("setupPanel");
    const setupForm = document.getElementById("setupForm");
    const userSearchInput = document.getElementById("userSearchInput");
    const userStatusInput = document.getElementById("userStatusInput");
    const userDetailsPanel = document.getElementById("userDetailsPanel");
    const homeView = document.getElementById("homeView");
    const usersView = document.getElementById("usersView");
    const logsView = document.getElementById("logsView");
    const dashboardStatus = document.getElementById("dashboardStatus");
    const logsStatus = document.getElementById("logsStatus");
    const plansView = document.getElementById("plansView");
    const plansStatus = document.getElementById("plansStatus");
    const subscriptionDialog = document.getElementById("subscriptionDialog");
    let planCatalog = [];
    let planIntakeConfig = null;
    let planRuleVersion = null;
    let planHistoryPage = 1;
    let schedulePage = 1;
    let planEditVersion = null;
    let planEditorRequest = 0;
    let subscriptionAccount = null;
    let subscriptionRequest = 0;
    let currentPage = "home";
    let csrfToken = "";
    let currentAdmin = null;
    let overviewRequest = 0;
    let detailRequest = 0;
    let userPage = 1;
    let activityPage = 1;
    let selectedAccountId = "";
    let loadedAccountId = "";
    let accountSaveRequest = 0;
    let userAccountDirty = false;
    let userAccountSaving = false;
    let expiryTimer;

    adminEmailInput.value = sessionStorage.getItem("teletyptelAdminEmail") || "";
    loginButton.addEventListener("click", loginAdmin);
    logoutButton.addEventListener("click", logoutAdmin);
    refreshButton.addEventListener("click", loadAdmin);
    document.getElementById("newPlanButton").addEventListener("click", () => editPlan());
    document.getElementById("cancelPlanButton").addEventListener("click", resetPlanEditor);
    document.getElementById("planForm").addEventListener("submit", savePlan);
    document.getElementById("planHistoryPrevious").addEventListener("click", () => { planHistoryPage -= 1; loadAdmin(); });
    document.getElementById("planHistoryNext").addEventListener("click", () => { planHistoryPage += 1; loadAdmin(); });
    document.getElementById("closeSubscription").addEventListener("click", () => subscriptionDialog.close());
    subscriptionDialog.addEventListener("close", clearSubscription);
    document.getElementById("subscriptionForm").addEventListener("submit", saveSubscription);
    document.getElementById("subscriptionMode").addEventListener("change", setSubscriptionMode);
    document.getElementById("schedulePrevious").addEventListener("click", () => { schedulePage -= 1; loadAdmin(); });
    document.getElementById("scheduleNext").addEventListener("click", () => { schedulePage += 1; loadAdmin(); });
    window.addEventListener("hashchange", () => {
      showAdminPage(true);
      loadAdmin();
    });
    setupForm.addEventListener("submit", setupOwner);
    document.getElementById("userSearchForm").addEventListener("submit", (event) => { event.preventDefault(); userPage = 1; loadAdmin(); });
    userStatusInput.addEventListener("change", () => { userPage = 1; loadAdmin(); });
    document.getElementById("usersPrevious").addEventListener("click", () => { userPage -= 1; loadAdmin(); });
    document.getElementById("usersNext").addEventListener("click", () => { userPage += 1; loadAdmin(); });
    document.getElementById("closeUserDetails").addEventListener("click", () => {
      clearUserDetails();
      document.getElementById("usersTitle").focus();
      loadAdmin();
    });
    document.getElementById("userAccountForm").addEventListener("submit", (event) => { event.preventDefault(); saveAccount(); });
    document.getElementById("userAccountForm").addEventListener("input", () => {
      userAccountDirty = true;
      document.getElementById("userAccountSaveStatus").textContent = "Nog niet opgeslagen.";
    });
    document.getElementById("userSubscriptionButton").addEventListener("click", () => userManagementAction("subscription"));
    document.getElementById("userInvoiceButton").addEventListener("click", () => userManagementAction("invoice"));
    document.getElementById("userRecurringButton").addEventListener("click", () => userManagementAction("recurring"));
    document.getElementById("activityFilterForm").addEventListener("submit", (event) => { event.preventDefault(); activityPage = 1; loadUserDetails(); });
    document.getElementById("clearActivityFilters").addEventListener("click", () => { document.getElementById("activityFilterForm").reset(); activityPage = 1; loadUserDetails(); });
    document.getElementById("activityPrevious").addEventListener("click", () => { activityPage -= 1; loadUserDetails(); });
    document.getElementById("activityNext").addEventListener("click", () => { activityPage += 1; loadUserDetails(); });
    adminPasswordInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") loginAdmin();
    });

    async function adminFetch(url, options = {}) {
      const headers = { ...(options.headers || {}) };
      if (options.method === "POST") {
        headers["X-Teletyptel-Csrf"] = csrfToken;
        headers["X-CSRF-Token"] = csrfToken;
      }
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options, headers });
      const data = await response.json().catch(() => ({ ok: false, error: "invalid_json" }));
      if (data.csrfToken) csrfToken = data.csrfToken;
      if (!response.ok || data.ok === false) {
        if (response.status === 401 || data.error === "admin_login_required") {
          clearPrivateData();
          setAdminIdentity(null);
        }
        throw new Error(data.message || data.error || "Admin request mislukt");
      }
      if (currentAdmin) resetExpiryTimer();
      return data;
    }

    async function initializeAdmin() {
      try {
        const data = await adminFetch("api.php?action=session");
        setAdminIdentity(data.admin || null);
        setupPanel.hidden = !data.setupRequired;
        setupForm.hidden = !data.setupRequired || !data.localSetupAllowed;
        document.getElementById("setupLocalLink").hidden = !data.setupRequired || data.localSetupAllowed;
        if (data.admin) await loadAdmin();
      } catch (error) {
        setMessage(error.message, true);
      }
    }

    async function setupOwner(event) {
      event.preventDefault();
      const password = document.getElementById("setupPassword").value;
      if (password !== document.getElementById("setupPasswordConfirm").value) {
        setMessage("De wachtwoorden zijn niet gelijk.", true);
        return;
      }
      const button = document.getElementById("setupButton");
      button.disabled = true;
      try {
        const data = await adminFetch("api.php", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "setup", displayName: document.getElementById("setupName").value, email: document.getElementById("setupEmail").value, password })
        });
        setupForm.reset();
        setupPanel.hidden = true;
        setAdminIdentity(data.admin);
        await loadAdmin();
        setMessage("Beheeraccount aangemaakt. Je kunt dit account ook op dev.teletyptel.nl gebruiken.");
      } catch (error) {
        setMessage(error.message, true);
      } finally {
        button.disabled = false;
      }
    }

    async function loginAdmin() {
      setMessage("");
      try {
        const data = await adminFetch("api.php", {
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
      clearPrivateData();
      setAdminIdentity(null);
      try {
        await adminFetch("api.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "logout" })
        });
        setMessage("Uitgelogd.");
      } catch (error) {
        setMessage("De gegevens zijn verborgen, maar uitloggen op de server is niet bevestigd. Ververs de pagina en probeer opnieuw.", true);
      }
    }

    function showAdminPage(focusHeading = false) {
      adminBulkUsers.clear();
      currentPage = ({ "#gebruikers": "users", "#staff": "staff", "#logs": "logs", "#abonnementen": "plans", "#facturatie": "billing", "#instellingen": "settings" })[window.location.hash] || "home";
      adminManagement.cancel();
      adminStaff.clear();
      overviewRequest += 1;
      clearUserDetails();
      if (subscriptionDialog.open) subscriptionDialog.close();
      clearSubscription();
      resetPlanEditor();
      for (const [page, view, title] of [["home", homeView, "Hoofdpagina"], ["users", usersView, "Gebruikersbeheer"], ["staff", document.getElementById("staffView"), "Staffbeheer"], ["plans", plansView, "Abonnementen"], ["billing", document.getElementById("billingView"), "Facturatie"], ["settings", document.getElementById("settingsView"), "Instellingen"], ["logs", logsView, "Systeem- en beheerlog"]]) {
        const active = currentPage === page;
        view.hidden = !active;
        const link = document.getElementById(`${page}NavLink`);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
        if (active) {
          document.title = `${title} · TeleTypTel admin`;
          if (focusHeading && currentAdmin) document.getElementById(`${page}Title`).focus();
        }
      }
    }

    async function loadAdmin() {
      if (!currentAdmin) return;
      if (currentAdmin.role === "staff") return;
      if (currentPage === "staff") return adminStaff.load();
      if (currentPage === "billing") return adminManagement.loadBilling();
      if (currentPage === "settings") return adminManagement.loadSettings();
      if (currentPage === "users" && selectedAccountId && !userDetailsPanel.hidden) return loadUserDetails();
      if (currentPage === "users") adminBulkUsers.clear();
      const request = ++overviewRequest;
      const page = currentPage;
      const status = page === "home" ? dashboardStatus : page === "logs" ? logsStatus : page === "plans" ? plansStatus : document.getElementById("userListStatus");
      setMessage("");
      status.textContent = page === "home" ? "Serverstatus en overzicht laden…" : page === "logs" ? "Systeem- en beheerlog laden…" : page === "plans" ? "Abonnementen laden…" : "Gebruikers laden…";
      if (page === "logs") logs.replaceChildren();
      try {
        const query = new URLSearchParams(page === "users"
          ? { action: "users", search: userSearchInput.value, status: userStatusInput.value, page: String(userPage) }
          : page === "plans" ? { action: "plans", page: String(planHistoryPage), schedulePage: String(schedulePage) } : { action: page === "home" ? "dashboard" : "logs" });
        const data = await adminFetch(`api.php?${query}`);
        if (request !== overviewRequest) return;
        if (page === "home") {
          renderCards(data.stats || {});
          renderServer(data.server || {});
          renderRuntime(data.server?.runtime || {});
          renderSip(data.server?.ejabberd || {});
          status.textContent = "Serverstatus en overzicht bijgewerkt.";
        } else if (page === "logs") {
          const items = data.logs || [];
          renderLogs(items);
          status.textContent = `${items.length} recente logregels. Overzicht bijgewerkt.`;
        } else if (page === "plans") {
          planCatalog = data.plans || [];
          planIntakeConfig = currentAdmin.role === "owner" ? data.intake || null : null;
          renderPlans();
          renderSubscriptionHistory("planHistory", data.history);
          planHistoryPage = data.history.page;
          renderPagination("planHistory", data.history);
          const schedules = data.schedules || { items: [], total: 0, page: 1, pageSize: 25 };
          renderSchedules("scheduleRows", schedules);
          schedulePage = schedules.page;
          renderPagination("schedule", schedules);
          document.getElementById("scheduleWorkerStatus").textContent = adminManagement.workerText(data.worker);
          status.textContent = `${planCatalog.length} plannen. ${data.history.total} geregistreerde overgangen.`;
        } else {
          planCatalog = data.plans || [];
          renderAccounts(data.users.items || []);
          userPage = data.users.page;
          renderPagination("users", data.users);
          status.textContent = `${data.users.total} gebruikers gevonden.`;
        }
      } catch (error) {
        if (request !== overviewRequest && currentAdmin) return;
        status.textContent = page === "home" ? "Het overzicht kon niet worden geladen." : page === "logs" ? "De systeem- en beheerlog kon niet worden geladen." : page === "plans" ? "Abonnementen konden niet worden geladen." : "Gebruikers konden niet worden geladen.";
        setMessage(error.message, true);
      }
    }

    function setAdminIdentity(admin) {
      currentAdmin = admin;
      document.getElementById("interpretersAdminLink").hidden = !["owner", "admin"].includes(admin?.role);
      if (admin?.role === "staff") {
        adminWorkspace.hidden = true;
        window.location.replace("aanmeldingen.php");
        return;
      }
      document.getElementById("settingsNavLink").hidden = admin?.role !== "owner";
      const loggedIn = Boolean(admin);
      loginBar.hidden = loggedIn;
      logoutButton.hidden = !loggedIn;
      adminWorkspace.hidden = !loggedIn;
      refreshButton.disabled = !loggedIn;
      if (loggedIn) setupPanel.hidden = true;
      adminIdentity.textContent = loggedIn ? `${admin.displayName || admin.email} (${admin.role || "admin"})` : "";
      resetExpiryTimer();
    }

    function resetExpiryTimer() {
      clearTimeout(expiryTimer);
      if (currentAdmin) expiryTimer = setTimeout(() => {
        clearPrivateData();
        setAdminIdentity(null);
        setMessage("Je beheersessie is verlopen. Log opnieuw in.");
      }, 30 * 60 * 1000);
    }

    function clearPrivateData() {
      adminBulkUsers.clear();
      adminManagement.clear();
      adminStaff.clear();
      schedulePage = 1;
      for (const identifier of ["scheduleRows", "schedulePageInfo", "scheduleWorkerStatus", "subscriptionSchedules"]) document.getElementById(identifier).replaceChildren();
      overviewRequest += 1;
      if (subscriptionDialog.open) subscriptionDialog.close();
      clearSubscription();
      resetPlanEditor();
      planCatalog = [];
      planIntakeConfig = null;
      planHistoryPage = 1;
      for (const identifier of ["plansTable", "planHistory", "planHistoryPageInfo", "plansStatus"]) document.getElementById(identifier).replaceChildren();
      document.getElementById("planHistoryPrevious").disabled = true;
      document.getElementById("planHistoryNext").disabled = true;
      clearUserDetails();
      renderCards({});
      renderRuntime({});
      renderSip({});
      renderAccounts([]);
      renderLogs([]);
      serverStatus.textContent = "";
      dashboardStatus.textContent = "";
      logsStatus.textContent = "";
      userSearchInput.value = "";
      userStatusInput.value = "";
      userPage = 1;
      document.getElementById("usersPageInfo").textContent = "";
      document.getElementById("userListStatus").textContent = "";
    }

    function renderCards(stats) {
      const items = [
        ["Accounts", stats.accounts ?? 0, "users"],
        ["Actief", stats.activeAccounts ?? 0, "check"],
        ["Berichten", stats.messages ?? 0, "message"],
        ["Uploads", stats.uploads ?? 0, "upload"],
        ["Mailfouten", stats.failedMails ?? 0, "mail"],
      ];
      cards.innerHTML = items.map(([label, value, icon]) => `<div class="card"><span class="card-label">${iconHtml(icon)}${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("");
    }

    function renderServer(server) {
      const parts = [
        `PHP ${server.phpVersion || "?"}`,
        server.os || "?",
        server.https ? "HTTPS" : "geen HTTPS",
        server.pdoMysql ? "pdo_mysql OK" : "pdo_mysql mist",
        server.adminTokenConfigured ? "noodtoken geconfigureerd" : "beheerlogin vereist"
      ];
      serverStatus.textContent = parts.join(" · ");
    }

    function renderRuntime(runtime) {
      const apache = runtime.apache || {};
      const mysql = runtime.mysql || {};
      const php = runtime.php || {};
      const items = [
        ["Apache", apache.active ? "actief" : "niet actief", Boolean(apache.active), apache.version || "-", apache.detail || "Webserver niet herkend", "server"],
        ["MySQL", mysql.active ? "actief" : "niet actief", Boolean(mysql.active), mysql.version || "-", mysql.detail || "Database niet bereikbaar", "database"],
        ["PHP", php.active ? "actief" : "niet actief", Boolean(php.active), php.version || "-", php.detail || "PHP runtime onbekend", "code"],
      ];
      runtimeStatus.innerHTML = items.map(([label, value, ok, version, detail, icon]) => `<div class="card">
        <span class="card-label">${iconHtml(icon)}${escapeHtml(label)}</span>
        <strong><span class="badge ${ok ? "ok" : "warn"}">${escapeHtml(value)}</span></strong>
        <div>Versie ${escapeHtml(version)}</div>
        <div class="small">${escapeHtml(detail)}</div>
      </div>`).join("");

      const missing = items.filter(([, , ok]) => !ok).map(([label]) => label);
      runtimeHint.textContent = missing.length
        ? `Controleer nog: ${missing.join(", ")}.`
        : "Basisstack actief: Apache, MySQL en PHP draaien.";
    }

    function renderSip(sip) {
      const items = [
        ["ejabberd", sip.ejabberdService || "onbekend", sip.ejabberdService === "active" || sip.ejabberdCtlAvailable],
        ["XMPP domein", sip.xmppDomain || "-", Boolean(sip.xmppDomain)],
        ["XMPP WebSocket", sip.xmppWebSocket || "-", Boolean(sip.xmppWebSocket)],
        [`SIP ${sip.sipPort || 5060}`, sip.sipPortOpen ? "open" : "niet open", Boolean(sip.sipPortOpen)],
        [`SIPS ${sip.sipsPort || 5061}`, sip.sipsPortOpen ? "open" : "niet open", Boolean(sip.sipsPortOpen)],
        ["Module", sip.moduleHint || "ejabberd_sip / mod_sip", Boolean(sip.sipConfigured || sip.sipPortOpen || sip.sipsPortOpen)],
        ["Database", [sip.xmppDatabaseHost, sip.xmppDatabase].filter(Boolean).join(" / ") || "-", Boolean(sip.xmppDatabase)],
        ["Gateway", sip.sipConfigured ? "geconfigureerd" : "nog niet actief", Boolean(sip.sipConfigured)],
      ];
      sipStatus.innerHTML = items.map(([label, value, ok]) => `<div class="card">
        <span>${escapeHtml(label)}</span>
        <strong><span class="badge ${ok ? "ok" : "warn"}">${escapeHtml(String(value))}</span></strong>
      </div>`).join("");
      sipHint.textContent = sip.gatewayRole || "SIP is gatewaylaag voor telefonie/relay, niet de browser-client zelf.";
    }

    function renderAccounts(accounts) {
      adminBulkUsers.clear();
      if (!accounts.length) {
        accountsTable.innerHTML = '<tr><td colspan="5">' + (userStatusInput.value === "trash" ? "De prullenbak is leeg." : "Geen gebruikers gevonden.") + '</td></tr>';
        return;
      }
      accountsTable.innerHTML = accounts.map((account) => {
        const id = escapeHtml(account.account_id || "");
        return `<tr data-account-id="${id}">
          <td><input type="checkbox" data-account-select="${id}" aria-label="${escapeHtml((account.display_name || account.jid || account.account_id) + ' selecteren')}"></td>
          <td><div class="user-person"><span class="user-avatar">${iconHtml("users")}</span><div class="user-person-text"><strong>${escapeHtml(account.display_name || account.jid || "-")}</strong><div class="small">${escapeHtml(account.email || account.jid || account.account_id)}</div></div></div></td>
          <td>${escapeHtml(planCatalog.find((plan) => plan.plan_id === account.subscription_plan)?.name || account.subscription_plan || "free")}</td>
          <td>${accountStatusBadge(account)}</td>
          <td><button class="secondary" type="button" data-details="${id}">Beheren${iconHtml("arrow")}</button></td>
        </tr>`;
      }).join("");

      accountsTable.querySelectorAll("[data-details]").forEach((button) => {
        button.addEventListener("click", () => openUserDetails(button.dataset.details));
      });
      adminBulkUsers.setRows(accounts);
    }

    function renderPagination(prefix, data) {
      const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
      document.getElementById(`${prefix}Previous`).disabled = data.page <= 1;
      document.getElementById(`${prefix}Next`).disabled = data.page >= pages;
      document.getElementById(`${prefix}PageInfo`).textContent = `Pagina ${data.page} van ${pages} · ${data.total} resultaten`;
    }

    function clearUserDetails() {
      detailRequest += 1;
      accountSaveRequest += 1;
      selectedAccountId = "";
      loadedAccountId = "";
      userAccountDirty = false;
      userAccountSaving = false;
      userDetailsPanel.hidden = true;
      document.getElementById("userListPanel").hidden = false;
      document.getElementById("userAdministration").hidden = true;
      document.getElementById("userChatLog").open = false;
      document.getElementById("userDetailsTitle").textContent = "Gebruiker beheren";
      for (const id of ["userFields", "userIdentities", "userConversations", "userActivity", "userDetailsStatus", "activityPageInfo", "userAccountSaveStatus", "userSubscriptionSummary"]) {
        document.getElementById(id).replaceChildren();
      }
      document.getElementById("userAccountForm").reset();
      document.getElementById("userAdminNote").value = "";
      document.getElementById("userAccountStatus").value = "active";
      for (const id of ["userAccountStatus", "userAdminNote", "saveUserAccount", "userSubscriptionButton", "userInvoiceButton", "userRecurringButton"]) {
        document.getElementById(id).disabled = true;
      }
      document.getElementById("activityFilterForm").reset();
      document.getElementById("conversationLimitHint").hidden = true;
      document.getElementById("activityPrevious").disabled = true;
      document.getElementById("activityNext").disabled = true;
    }

    function openUserDetails(accountId) {
      if (!currentAdmin || !["owner", "admin"].includes(currentAdmin.role) || currentPage !== "users") return;
      adminBulkUsers.clear();
      clearUserDetails();
      overviewRequest += 1;
      selectedAccountId = accountId;
      activityPage = 1;
      document.getElementById("userListPanel").hidden = true;
      userDetailsPanel.hidden = false;
      document.getElementById("userDetailsTitle").focus();
      loadUserDetails();
    }

    async function loadUserDetails() {
      if (!selectedAccountId || !currentAdmin || userDetailsPanel.hidden) return;
      const request = ++detailRequest;
      const status = document.getElementById("userDetailsStatus");
      status.textContent = "Gebruikersgegevens en gesprekslog laden…";
      document.getElementById("userConversations").replaceChildren();
      document.getElementById("userActivity").replaceChildren();
      const query = new URLSearchParams({ action: "user", accountId: selectedAccountId, page: String(activityPage),
        from: document.getElementById("activityFrom").value, to: document.getElementById("activityTo").value,
        kind: document.getElementById("activityKind").value, peer: document.getElementById("activityPeer").value });
      try {
        const data = await adminFetch(`api.php?${query}`);
        if (request !== detailRequest || userDetailsPanel.hidden) return;
        const account = data.account;
        if (account.account_id !== selectedAccountId) throw new Error("De geladen gebruiker komt niet overeen met de selectie.");
        loadedAccountId = account.account_id;
        document.getElementById("userDetailsTitle").textContent = "Gebruiker beheren: " + (account.display_name || account.jid);
        const fields = [["Account-ID", account.account_id], ["JID", account.jid], ["Naam", account.display_name],
          ["E-mail", account.email], ["Telefoon", account.phone_number], ["Taal", account.preferred_language],
          ["Aanmeldprovider", account.provider_id], ["Accountstatus", accountStatusName(account.account_status)], ["Webtoegang / prullenbak", accountAccessLabel(account)], ["Plan", account.subscription_plan],
          ["Einddatum abonnement", account.subscription_expires_at || "Geen einddatum"],
          ["Gebruik", (account.message_count || 0) + " berichten · " + (account.upload_count || 0) + " uploads"],
          ["Aangemaakt", account.created_at], ["Bijgewerkt", account.updated_at], ["Laatste provideraanmelding", account.last_login_at]];
        document.getElementById("userFields").innerHTML = fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "—")}</dd></div>`).join("");
        document.getElementById("userIdentities").innerHTML = (account.identities.length
          ? `<ul>${account.identities.map((identity) => `<li>${escapeHtml(identity.provider)} · ${escapeHtml(identity.email || "Geen e-mail")} · ${Number(identity.email_verified) === 1 ? "e-mail bevestigd" : "e-mail niet bevestigd"} · laatst gebruikt: ${escapeHtml(identity.last_used_at || "onbekend")}</li>`).join("")}</ul>`
          : '<p class="small">Geen gekoppelde aanmeldaccounts.</p>');
        document.getElementById("userAdministration").hidden = false;
        if (!userAccountDirty && !userAccountSaving) {
          document.getElementById("userAccountStatus").value = account.account_status || "active";
          document.getElementById("userAdminNote").value = account.admin_note || "";
        }
        for (const id of ["userAccountStatus", "userAdminNote", "saveUserAccount"]) document.getElementById(id).disabled = userAccountSaving;
        for (const id of ["userSubscriptionButton", "userInvoiceButton", "userRecurringButton"]) document.getElementById(id).disabled = false;
        const planName = planCatalog.find((plan) => plan.plan_id === account.subscription_plan)?.name || account.subscription_plan || "free";
        document.getElementById("userSubscriptionSummary").textContent = planName + " · " + (account.subscription_expires_at || "Geen einddatum");
        renderUserActivity(data.activity);
        status.textContent = data.activity.sources.length ? `${data.activity.total} opgeslagen activiteiten voor deze filters. Inzage geregistreerd.` : "Er is nog geen opgeslagen gesprekslog beschikbaar.";
      } catch (error) {
        if (request === detailRequest) status.textContent = error.message;
      }
    }

    function renderUserActivity(data) {
      const kindName = (kind) => kind === "group" ? "Groep" : "Privé";
      document.getElementById("userConversations").innerHTML = data.conversations.length ? data.conversations.map((conversation) => `<tr>
        <td><strong>${escapeHtml(conversation.conversation_name || conversation.conversation_peer)}</strong><div class="small">${escapeHtml(conversation.conversation_peer)}</div></td>
        <td>${kindName(conversation.conversation_kind)}</td><td>${Number(conversation.message_count)}</td>
        <td>${Number(conversation.sent_count)} / ${Number(conversation.received_count)}</td><td>${Number(conversation.call_count)}</td>
        <td>${escapeHtml(conversation.first_activity)}</td><td>${escapeHtml(conversation.last_activity)}</td></tr>`).join("") : '<tr><td colspan="7">Geen gesprekken voor deze filters.</td></tr>';
      document.getElementById("conversationLimitHint").hidden = !data.conversationsTruncated;
      const directionNames = { self: "Uitgaand", peer: "Inkomend", system: "Systeem" };
      const callTypes = { audio: "Audio", video: "Video", total: "Total Conversation" };
      document.getElementById("userActivity").innerHTML = data.items.length ? data.items.map((item) => `<tr>
        <td>${escapeHtml(item.happened_at)}</td><td>${escapeHtml(item.conversation_name || item.conversation_peer)}<div class="small">${escapeHtml(item.conversation_peer)} · ${kindName(item.conversation_kind)}</div></td>
        <td>${item.event_type === "call" ? `Oproep · ${escapeHtml(callTypes[item.call_type] || item.call_type)}` : "Bericht"}</td>
        <td>${escapeHtml(directionNames[item.direction] || item.direction)}</td><td>${escapeHtml(item.status || "—")}</td>
        <td>${item.event_type === "call" ? `${Number(item.duration_seconds)} sec` : "—"}</td></tr>`).join("") : '<tr><td colspan="6">Geen opgeslagen activiteiten voor deze filters.</td></tr>';
      activityPage = data.page;
      renderPagination("activity", data);
    }

    function userManagementAction(action) {
      if (!currentAdmin || userDetailsPanel.hidden || !loadedAccountId || loadedAccountId !== selectedAccountId) return;
      if (action === "subscription") openSubscription(loadedAccountId);
      if (action === "invoice") adminManagement.invoiceFor(loadedAccountId);
      if (action === "recurring") adminManagement.recurringFor(loadedAccountId);
    }

    async function saveAccount() {
      if (!currentAdmin || userDetailsPanel.hidden || !loadedAccountId || loadedAccountId !== selectedAccountId || userAccountSaving) return;
      const accountId = loadedAccountId;
      const request = ++accountSaveRequest;
      const isCurrent = () => request === accountSaveRequest && currentAdmin && selectedAccountId === accountId && !userDetailsPanel.hidden;
      const status = document.getElementById("userAccountSaveStatus");
      const body = {
        action: "update_account",
        accountId,
        accountStatus: document.getElementById("userAccountStatus").value,
        adminNote: document.getElementById("userAdminNote").value,
      };
      userAccountSaving = true;
      detailRequest += 1;
      for (const id of ["userAccountStatus", "userAdminNote", "saveUserAccount"]) document.getElementById(id).disabled = true;
      status.textContent = "Wijzigingen opslaan…";
      try {
        await adminFetch("api.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!isCurrent()) return;
        userAccountDirty = false;
        userAccountSaving = false;
        await loadUserDetails();
        if (isCurrent()) status.textContent = "Wijzigingen opgeslagen.";
      } catch (error) {
        if (isCurrent()) status.textContent = error.message;
      } finally {
        if (isCurrent()) {
          userAccountSaving = false;
          for (const id of ["userAccountStatus", "userAdminNote", "saveUserAccount"]) document.getElementById(id).disabled = false;
        }
      }
    }

    function formatPlanPrice(plan) {
      if (plan.price_cents === null) return "Nog niet ingesteld";
      const periods = { month: " / maand", year: " / jaar", once: " eenmalig", none: "" };
      return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(plan.price_cents) / 100)
        + (periods[plan.billing_period] || "");
    }

    function renderPlans() {
      const table = document.getElementById("plansTable");
      table.innerHTML = planCatalog.length ? planCatalog.map((plan) => '<tr><td><strong>' + escapeHtml(plan.name)
        + '</strong><div class="small">' + escapeHtml(plan.plan_id) + '</div></td><td>' + escapeHtml(plan.description)
        + '</td><td>' + escapeHtml(formatPlanPrice(plan)) + '</td><td>' + (Number(plan.enabled) === 1 ? "Beschikbaar" : "Uitgeschakeld")
        + '</td><td>' + Number(plan.account_count) + '</td><td><button class="secondary" type="button" data-edit-plan="'
        + escapeHtml(plan.plan_id) + '">' + iconHtml("plan") + 'Instellen</button></td></tr>').join("")
        : '<tr><td colspan="6">Geen plannen gevonden.</td></tr>';
      table.querySelectorAll("[data-edit-plan]").forEach((button) => {
        button.addEventListener("click", () => editPlan(button.dataset.editPlan));
      });
    }

    function resetPlanEditor() {
      planEditorRequest += 1;
      planEditVersion = null;
      planRuleVersion = null;
      document.getElementById("planIntakeFields").hidden = true;
      document.getElementById("planIntakeOwnerHint").hidden = true;
      document.getElementById("planIntakeReadiness").textContent = "";
      for (const identifier of ["planIntakePublished", "planIntakeDocuments", "planIntakeBsn"]) {
        document.getElementById(identifier).checked = false;
        document.getElementById(identifier).disabled = true;
      }
      document.getElementById("planForm").reset();
      for (const identifier of ["planCode", "planName", "planDescription", "planPrice"]) document.getElementById(identifier).value = "";
      document.getElementById("planFormStatus").textContent = "";
      document.getElementById("planEditorPanel").hidden = true;
    }

    function editPlan(code = "") {
      if (!currentAdmin) return;
      const plan = code ? planCatalog.find((entry) => entry.plan_id === code) : null;
      if (code && !plan) return;
      resetPlanEditor();
      planEditVersion = plan ? Number(plan.version) : null;
      document.getElementById("planEditorPanel").hidden = false;
      document.getElementById("planEditorTitle").textContent = plan ? "Plan instellen" : "Plan toevoegen";
      document.getElementById("planCode").value = plan?.plan_id || "";
      document.getElementById("planCode").readOnly = Boolean(plan);
      document.getElementById("planName").value = plan?.name || "";
      document.getElementById("planDescription").value = plan?.description || "";
      document.getElementById("planPrice").value = plan && plan.price_cents !== null ? (Number(plan.price_cents) / 100).toFixed(2) : "";
      document.getElementById("planPeriod").value = plan?.billing_period || "month";
      document.getElementById("planEnabled").checked = !plan || Number(plan.enabled) === 1;
      document.getElementById("savePlanButton").disabled = false;
      const owner = currentAdmin.role === "owner";
      document.getElementById("planIntakeFields").hidden = !owner;
      document.getElementById("planIntakeOwnerHint").hidden = owner;
      if (owner) {
        const rule = planIntakeConfig?.plans?.find((entry) => entry.plan_id === code);
        if (!planIntakeConfig || (code && !rule)) {
          document.getElementById("planFormStatus").textContent = "Aanmeldvoorwaarden konden niet worden geladen. Ververs de abonnementen en open het plan opnieuw.";
          document.getElementById("savePlanButton").disabled = true;
        } else {
          planRuleVersion = Number(rule?.rule_version || 0);
          for (const [identifier, field] of [["planIntakePublished", "published"], ["planIntakeDocuments", "requires_documents"], ["planIntakeBsn", "requires_bsn"]]) {
            document.getElementById(identifier).disabled = false;
            document.getElementById(identifier).checked = Boolean(Number(rule?.[field] || 0));
          }
          const readiness = planIntakeConfig.readiness || {};
          document.getElementById("planIntakeReadiness").textContent = "Documentverwerking: " + (readiness.medicalReady ? "actief" : "nog niet actief")
            + " · BSN-verwerking: " + (readiness.bsnReady ? "actief" : "nog niet actief")
            + ". Het instellen van vereisten activeert deze verwerking niet.";
        }
      }
      document.getElementById("planName").focus();
    }

    async function savePlan(event) {
      event.preventDefault();
      if (!currentAdmin || document.getElementById("savePlanButton").disabled) return;
      const request = planEditorRequest;
      const button = document.getElementById("savePlanButton");
      button.disabled = true;
      document.getElementById("planFormStatus").textContent = "Plan opslaan…";
      try {
        await adminFetch("api.php", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: planEditVersion === null ? "create_plan" : "update_plan",
            planId: document.getElementById("planCode").value, name: document.getElementById("planName").value,
            description: document.getElementById("planDescription").value, price: document.getElementById("planPrice").value,
            billingPeriod: document.getElementById("planPeriod").value, enabled: document.getElementById("planEnabled").checked,
            version: planEditVersion,
            ...(currentAdmin.role === "owner" ? { intake: {
              version: planRuleVersion, published: document.getElementById("planIntakePublished").checked,
              requiresDocuments: document.getElementById("planIntakeDocuments").checked,
              requiresBsn: document.getElementById("planIntakeBsn").checked,
            } } : {}) }) });
        if (request !== planEditorRequest || !currentAdmin) return;
        resetPlanEditor();
        await loadAdmin();
        setMessage("Plan opgeslagen. Bestaande abonnementen zijn behouden.");
      } catch (error) {
        if (request === planEditorRequest) document.getElementById("planFormStatus").textContent = error.message;
      } finally {
        if (request === planEditorRequest) button.disabled = false;
      }
    }

    function clearSubscription() {
      subscriptionRequest += 1;
      subscriptionAccount = null;
      document.getElementById("subscriptionTitle").textContent = "Abonnement wijzigen";
      document.getElementById("subscriptionForm").reset();
      document.getElementById("subscriptionForm").hidden = true;
      document.getElementById("subscriptionConfirm").checked = false;
      document.getElementById("subscriptionMode").value = "now";
      document.getElementById("subscriptionEffective").value = "";
      document.getElementById("subscriptionSchedules").replaceChildren();
      setSubscriptionMode();
      for (const identifier of ["subscriptionExpiry", "subscriptionNote"]) document.getElementById(identifier).value = "";
      for (const identifier of ["subscriptionStatus", "subscriptionCurrent", "subscriptionHistory", "subscriptionTarget"]) document.getElementById(identifier).replaceChildren();
    }

    async function openSubscription(accountId) {
      if (!currentAdmin) return;
      clearSubscription();
      const request = subscriptionRequest;
      subscriptionDialog.showModal();
      document.getElementById("subscriptionStatus").textContent = "Abonnement laden…";
      try {
        const query = new URLSearchParams({ action: "subscription", accountId });
        const data = await adminFetch("api.php?" + query);
        if (request !== subscriptionRequest || !subscriptionDialog.open) return;
        subscriptionAccount = data.account;
        const account = data.account;
        const plans = data.plans || [];
        const currentPlan = plans.find((plan) => plan.plan_id === account.subscription_plan);
        document.getElementById("subscriptionTitle").textContent = "Abonnement: " + (account.display_name || account.jid);
        document.getElementById("subscriptionCurrent").textContent = account.jid + " · " + account.account_id + " · Huidig plan: "
          + (currentPlan?.name || account.subscription_plan) + " · Einddatum: " + (account.subscription_expires_at || "geen");
        document.getElementById("subscriptionTarget").innerHTML = plans
          .filter((plan) => Number(plan.enabled) === 1 || plan.plan_id === account.subscription_plan)
          .map((plan) => '<option value="' + escapeHtml(plan.plan_id) + '">' + escapeHtml(plan.name + " (" + plan.plan_id + ")")
            + (Number(plan.enabled) === 1 ? "" : " — niet meer beschikbaar") + '</option>').join("");
        document.getElementById("subscriptionTarget").value = account.subscription_plan;
        document.getElementById("subscriptionExpiry").value = account.subscription_expires_at || "";
        document.getElementById("subscriptionExpiry").min = new Date().toISOString().slice(0, 10);
        document.getElementById("subscriptionForm").hidden = false;
        document.getElementById("saveSubscriptionButton").disabled = false;
        document.getElementById("subscriptionStatus").textContent = "Kies het nieuwe plan of pas de einddatum aan. De wijziging gaat direct in.";
        renderSubscriptionHistory("subscriptionHistory", data.history);
        renderSchedules("subscriptionSchedules", data.schedules);
        document.getElementById("subscriptionStatus").textContent = "Kies plan, einddatum en direct of gepland uitvoeren.";
      } catch (error) {
        if (request === subscriptionRequest) document.getElementById("subscriptionStatus").textContent = error.message;
      }
    }

    async function saveSubscription(event) {
      event.preventDefault();
      const button = document.getElementById("saveSubscriptionButton");
      if (!currentAdmin || !subscriptionAccount || button.disabled) return;
      if (!document.getElementById("subscriptionConfirm").checked) {
        document.getElementById("subscriptionStatus").textContent = "Bevestig eerst de wijziging voor deze gebruiker.";
        return;
      }
      const request = subscriptionRequest;
      button.disabled = true;
      const scheduled = document.getElementById("subscriptionMode").value === "later";
      try {
        const data = await adminFetch("api.php", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: scheduled ? "schedule_subscription" : "change_subscription", accountId: subscriptionAccount.account_id,
            effectiveOn: document.getElementById("subscriptionEffective").value,
            expectedPlan: subscriptionAccount.subscription_plan, expectedExpiresAt: subscriptionAccount.subscription_expires_at,
            planId: document.getElementById("subscriptionTarget").value, expiresAt: document.getElementById("subscriptionExpiry").value,
            note: document.getElementById("subscriptionNote").value }) });
        if (request !== subscriptionRequest || !currentAdmin || !subscriptionDialog.open) return;
        subscriptionDialog.close();
        clearSubscription();
        await loadAdmin();
        setMessage(scheduled ? "Overgang ingepland. De automatische verwerking voert deze op de gekozen datum uit." : data.changed ? "Abonnement direct gewijzigd. De overgang is geregistreerd." : "Het abonnement was al zo ingesteld; niets gewijzigd.");
      } catch (error) {
        if (request === subscriptionRequest) document.getElementById("subscriptionStatus").textContent = error.message;
      } finally {
        if (request === subscriptionRequest) button.disabled = false;
      }
    }

    function renderSubscriptionHistory(identifier, history) {
      const entries = history?.items || [];
      document.getElementById(identifier).innerHTML = entries.length ? entries.map((entry) => '<tr><td>'
        + escapeHtml(entry.created_at) + '</td><td>' + escapeHtml(entry.display_name || entry.jid || entry.account_id)
        + '<div class="small">' + escapeHtml(entry.account_id) + '</div></td><td>' + escapeHtml(entry.from_plan_name)
        + '<div class="small">' + escapeHtml(entry.from_plan) + '</div></td><td>' + escapeHtml(entry.to_plan_name)
        + '<div class="small">' + escapeHtml(entry.to_plan) + '</div></td><td>' + escapeHtml(entry.from_expires_at || "Geen")
        + ' → ' + escapeHtml(entry.to_expires_at || "Geen") + '</td><td>' + escapeHtml(entry.note)
        + '</td><td>' + escapeHtml(entry.actor_id) + '</td></tr>').join("")
        : '<tr><td colspan="7">Nog geen abonnementsovergangen geregistreerd.</td></tr>';
    }

    function setSubscriptionMode() {
      const later = document.getElementById("subscriptionMode").value === "later";
      document.getElementById("subscriptionEffectiveLabel").hidden = !later;
      document.getElementById("subscriptionEffective").required = later;
      document.getElementById("subscriptionEffective").min = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      document.getElementById("saveSubscriptionButton").textContent = later ? "Overgang inplannen" : "Overgang direct uitvoeren";
    }

    function renderSchedules(identifier, schedules) {
      const table = document.getElementById(identifier);
      const labels = { pending: "Ingepland", applied: "Uitgevoerd", cancelled: "Geannuleerd", failed: "Mislukt; opnieuw beoordelen" };
      table.innerHTML = (schedules?.items || []).map((entry) => '<tr><td>' + escapeHtml(entry.effective_on)
        + '</td><td>' + escapeHtml(entry.display_name || entry.account_id) + '</td><td>' + escapeHtml(entry.to_plan)
        + '</td><td>' + escapeHtml(entry.to_expires_at || "Geen") + '</td><td>' + escapeHtml(labels[entry.status] || entry.status)
        + ' ' + escapeHtml(entry.error_code || "") + '</td><td>' + (entry.status === "pending"
          ? '<button type="button" class="secondary" data-cancel-schedule="' + Number(entry.id) + '">Planning annuleren</button>' : "—") + '</td></tr>').join("")
        || '<tr><td colspan="6">Geen geplande overgangen.</td></tr>';
      table.querySelectorAll("[data-cancel-schedule]").forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await adminFetch("api.php", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "cancel_schedule", id: Number(button.dataset.cancelSchedule) }) });
            if (!currentAdmin) return;
            if (subscriptionAccount && subscriptionDialog.open) {
              const accountId = subscriptionAccount.account_id;
              subscriptionDialog.close();
              await openSubscription(accountId);
            }
            await loadAdmin();
          } catch (error) { setMessage(error.message, true); }
          finally { button.disabled = false; }
        });
      });
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

    function accountStatusName(status) {
      return ({ active: "Actief", trial: "Proef", suspended: "Opgeschort", closed: "Gesloten" })[status || "active"] || status;
    }

    function accountAccessLabel(account) {
      if (account.trashed_at) return "Prullenbak";
      if (Number(account.web_blocked)) return "Webtoegang geblokkeerd";
      return accountStatusName(account.account_status);
    }

    function accountStatusBadge(account) {
      const state = account.trashed_at ? "trash" : Number(account.web_blocked) ? "blocked" : account.account_status || "active";
      const icon = ({ trash: "trash", blocked: "lock", suspended: "lock", closed: "close" })[state] || "check";
      return '<span class="user-status-badge ' + escapeHtml(state) + '">' + iconHtml(icon) + escapeHtml(accountAccessLabel(account)) + '</span>';
    }

    function setMessage(message, isError = false) {
      messagePanel.hidden = !message;
      messagePanel.className = isError ? "error" : "";
      messagePanel.textContent = message;
    }

    function iconHtml(name) {
      return `<svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-${escapeHtml(name)}"/></svg>`;
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

    adminManagement.init({ fetch: adminFetch, active: () => Boolean(currentAdmin), owner: () => currentAdmin?.role === "owner",
      page: () => currentPage, message: setMessage, escape: escapeHtml, paginate: renderPagination });
    adminStaff.init({ fetch: adminFetch, active: () => ["owner", "admin"].includes(currentAdmin?.role),
      page: () => currentPage, message: setMessage, escape: escapeHtml, paginate: renderPagination });
    adminBulkUsers.init({ fetch: adminFetch, active: () => ["owner", "admin"].includes(currentAdmin?.role),
      page: () => currentPage, reload: loadAdmin, message: setMessage, escape: escapeHtml });
    showAdminPage();
    initializeAdmin();
  </script>
</body>
</html>
