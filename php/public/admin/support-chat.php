<?php
header('Cache-Control: no-store, private');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
?>
<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Klantenservice · TeleTypTel</title><link rel="stylesheet" href="../aanmelden/intake.css?v=20260929-website"><link rel="stylesheet" href="support-chat.css?v=20261027-close-all"><link rel="stylesheet" href="../support-call.css?v=20261027-close-all"><link rel="stylesheet" href="../support-translation.css?v=20261027-close-all"><script src="../aanmelden/intake-ui.js" defer></script><script src="../support-language.js?v=20261027-support-auto" defer></script><script src="../support-translation.js?v=20261027-support-auto" defer></script><script src="../support-call.js?v=20261027-close-all" defer></script><link rel="stylesheet" href="../support-attachments.css?v=20261027-close-all"><script src="../support-attachments.js?v=20261027-close-all" defer></script><script src="support-chat.js?v=20261027-close-all" defer></script></head>
<body><header><a href="../index.php">TeleTypTel</a><nav><a href="aanmeldingen.php">Staffwerkplek</a> <a id="supportAdminLink" href="./" hidden>Adminpaneel</a></nav></header>
<main><h1>Klantenservice</h1><p>Een aparte inbox voor websitebezoekers. De opgegeven naam is niet geverifieerd; deel geen account- of zorggegevens op basis van alleen een naam.</p>
<p id="supportStaffStatus" class="notice" role="status">Sessie laden…</p>
<form id="supportStaffLogin" hidden><fieldset><legend>Inloggen als medewerker</legend><label>E-mailadres <input id="supportStaffEmail" type="email" autocomplete="username" required></label><label>Wachtwoord <input id="supportStaffPassword" type="password" autocomplete="current-password" required></label><button type="submit">Inloggen</button></fieldset></form>
<div id="supportStaffWorkspace" hidden>
  <div class="actions"><strong id="supportStaffIdentity"></strong><label><input id="supportStaffAvailable" type="checkbox"> Beschikbaar voor nieuwe chats</label><button id="supportStaffRefresh" type="button" class="secondary">Verversen</button><button id="supportStaffLogout" type="button" class="secondary">Uitloggen</button></div>
  <p class="support-staff-note">Bij oppakken of openen van je eigen gesprek deelt RTT automatisch tekst tijdens het typen, ook vóór versturen. Camera en microfoon starten nooit automatisch. Houd deze werkplek open. Beschikbaarheid vervalt na 45 seconden zonder verbinding. Gesloten gesprekken worden na 30 dagen opgeruimd.</p>
  <p class="support-staff-note">Als de bezoeker de vertaalvoorwaarden accepteert, gaan berichten en live concepttekst automatisch naar Google Cloud Translation, ook vóór versturen. Je hoeft dit niet apart te bevestigen. Vertaling naar Nederlands staat voor nieuwe medewerkersvoorkeuren aan; onder Taal kun je jouw doeltaal of vertaalweergave aanpassen. Uitschakelen op jouw scherm stopt niet de vertaling bij de bezoeker. De bezoeker kan vertaling voor het hele gesprek intrekken. Deel geen gevoelige gegevens; vertalingen kunnen fouten bevatten.</p>
  <div class="support-inbox-layout">
    <section aria-labelledby="supportQueueTitle"><h2 id="supportQueueTitle">Gesprekken</h2><label>Toon <select id="supportStaffFilter"><option value="open">Alle open gesprekken</option><option value="waiting">Wachtrij</option><option value="mine">Mijn gesprekken</option><option value="closed">Afgesloten</option></select></label><div id="supportStaffQueue"></div><div class="actions"><button id="supportPrevious" type="button" class="secondary">Vorige</button><span id="supportPagination"></span><button id="supportNext" type="button" class="secondary">Volgende</button></div></section>
    <section aria-labelledby="supportThreadTitle"><h2 id="supportThreadTitle">Kies een gesprek</h2><p id="supportThreadStatus"></p><div id="supportStaffTranslation"></div><div id="supportStaffCall"></div><div id="supportStaffMessages" class="support-staff-messages" role="log" aria-label="Chatberichten" aria-live="polite" aria-relevant="additions"></div>
      <div id="supportStaffLive" class="support-live"></div>
      <div id="supportStaffAttachments"></div>
      <form id="supportStaffReply" hidden><label>Antwoord <textarea id="supportStaffText" rows="3" maxlength="2000" required></textarea></label><button type="submit">Versturen</button></form>
      <div id="supportThreadActions" class="actions" hidden><button id="supportStaffRelease" type="button" class="secondary">Terug naar wachtrij</button><button id="supportStaffClose" type="button" class="secondary">Gesprek afsluiten</button></div>
    </section>
  </div>
</div></main></body></html>
