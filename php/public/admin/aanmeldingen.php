<?php
require_once dirname(__DIR__, 2) . '/lib/IntakeHttp.php';
IntakeHttp::headers();
try {
    IntakeHttp::https();
} catch (IntakeDenied $error) {
    http_response_code(403);
    exit('Open deze pagina via HTTPS.');
}
?>
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Aanmeldingen beheren · TeleTypTel</title>
  <link rel="stylesheet" href="../aanmelden/intake.css?v=20260929-website">
  <script src="../aanmelden/intake-ui.js" defer></script>
  <script src="intake-management.js?v=20260929-staff-afscherming" defer></script>
</head>
<body>
<header><a href="aanmeldingen.php"><img src="../assets/brand/teletyptel-logo-header.png" alt="TeleTypTel"></a><a href="support-chat.php">Klantenservice</a><a id="adminBack" href="./" hidden>Algemeen beheer</a></header>
<main>
  <h1>Aanmeldingen &amp; beoordeling</h1>
  <p>Een aparte werkplek voor bevoegde admin/staff. Beoordelen geeft geen garantie op vergoeding en activeert geen abonnement of factuur.</p>
  <p id="message" role="status" aria-live="polite" class="notice">Sessie laden…</p>
  <form id="loginForm" hidden>
    <fieldset><legend>Beheeraccount</legend>
      <label>E-mailadres <input id="email" type="email" autocomplete="username" required></label>
      <label>Wachtwoord <input id="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">Inloggen</button>
    </fieldset>
  </form>
  <div class="actions"><button id="refresh" type="button" class="secondary">Verversen</button><button id="logout" type="button" class="secondary" hidden>Uitloggen</button><span id="identity"></span></div>
  <div id="workspace" hidden>
    <section id="ownerSection" hidden>
      <h2>Abonnementen instellen</h2>
      <p>Prijs, beschikbaarheid en aanmeldvoorwaarden beheer je samen bij het abonnement.</p>
      <p><a href="./#abonnementen">Naar Abonnementen → Instellen</a></p>
    </section>
    <section id="teamSection" hidden>
      <h2>Staffaccounts en bevoegdheden</h2>
      <p><a href="./#staff">Open Staffbeheer in het adminpaneel</a></p>
      <p>Actieve eigenaren en admins hebben via hun beheerrol toegang tot alle aanmeldingen en dossiers. Staff heeft afzonderlijk toegekend inzagerecht nodig en krijgt alleen deze werkplek, geen gebruikers-, chat- of factuurbeheer.</p>
      <p>Admin en eigenaar kunnen staffaccounts aanmaken en blokkeren bij vertrek. Blokkeren trekt de inzage in en maakt bestaande sessies ongeldig. Deblokkeren herstelt geen inzagerecht: dat moet opnieuw worden toegekend.</p>
      <label>Jouw eigen beheerwachtwoord ter bevestiging <input id="ownerPassword" type="password" autocomplete="current-password"></label>
      <div id="team"></div>
      <details><summary>Nieuw staffaccount aanmaken</summary>
        <form id="staffForm" autocomplete="off">
          <label>Naam <input id="staffName" maxlength="120" required></label>
          <label>E-mailadres <input id="staffEmail" type="email" required></label>
          <label>Nieuw staffwachtwoord <input id="staffPassword" type="password" minlength="12" maxlength="72" autocomplete="new-password" required></label>
          <p>Het inzagerecht staat eerst uit. Ken het na aanmaken expliciet toe.</p>
          <button type="submit">Staffaccount maken</button>
        </form>
      </details>
    </section>
    <section id="listSection" hidden>
      <h2>Ingekomen aanmeldingen</h2>
      <div class="scroll"><table><thead><tr><th>Gebruiker</th><th>Abonnement</th><th>Status</th><th>Ontvangen</th><th>Actie</th></tr></thead><tbody id="rows"></tbody></table></div>
      <div class="actions"><button id="previous" class="secondary" type="button">Vorige</button><span id="pagination"></span><button id="next" class="secondary" type="button">Volgende</button></div>
    </section>
    <section id="detailSection" hidden>
      <h2>Aanmelding bekijken</h2>
      <p id="detailSummary"></p><p id="detailRequirements"></p><p id="detailInsurer"></p><p id="detailExpiry"></p>
      <p id="detailAttention" class="notice"></p>
      <label>Jouw beheerwachtwoord voor documentdownload / volledig BSN <input id="reviewPassword" type="password" autocomplete="current-password"></label>
      <p id="bsnValue"></p><button id="reveal" type="button" class="secondary" hidden>BSN 15 seconden tonen</button>
      <div id="documents" class="actions"></div>
      <p class="muted">Elke inzage en download wordt gelogd. Download alleen op een beveiligd apparaat; verspreid deze documenten niet via chat.</p>
      <form id="reviewForm">
        <label>Behandelstatus <select id="reviewStatus"><option value="processing">In behandeling</option><option value="needs_info">Aanvulling nodig</option><option value="reviewed">Beoordeling afgerond</option><option value="closed">Gesloten</option></select></label>
        <label>Bericht aan gebruiker <select id="reviewFeedback"><option value="">Geen vervolgactie</option><option value="contact_us">Neem contact op</option><option value="replace_audiogram">Nieuw audiogram nodig</option><option value="replace_prescription">Nieuw voorschrift nodig</option><option value="check_insurer">Zorgverzekeraar controleren</option><option value="complete">Beoordeling afgerond</option></select></label>
        <button type="submit">Beoordeling opslaan</button>
      </form>
      <h3>Inzagelog</h3><p>Maximaal 100 recente acties; zonder BSN of documentinhoud.</p><pre id="audit"></pre>
    </section>
  </div>
</main>
</body>
</html>
