<?php
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; frame-ancestors 'none'");
?>
<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tolk · TeleTypTel</title><link rel="stylesheet" href="tolk.css?v=20261027-inline-interpreter"></head>
<body><header><a href="../chat.html">← Messenger</a><h1>Tolk toevoegen</h1></header><main>
<p id="status" role="status" aria-live="polite">Aanmelden controleren…</p>
<section id="workspace" hidden>
<h2>Kies een tolkroute</h2><p>Een besloten nieuwe sessie voor jou, je gesprekspartner en een tolk. Een lopende Messenger-oproep wordt niet automatisch overgenomen: beëindig die eerst. Alle drie melden zich aan met hun eigen Messenger-account en stemmen zelf in met deelname.</p>
<form id="requestForm"><label>Gesprekspartner (Messenger-JID)<input id="peer" type="text" maxlength="255" placeholder="naam@domein" required autocomplete="off"></label><button>Eigen tolk aanvragen</button><button type="button" disabled>Tolkcontact — nog niet gekoppeld</button></form>
<p>De aanvraag verloopt na 10 minuten. De gesprekspartner vindt de uitnodiging via de knop Tolk in Messenger. Er wordt geen chatgeschiedenis gedeeld.</p>
<h2>Mijn tolksessies</h2><div id="rooms" class="cards"></div>
<details><summary>Werkplek voor eigen tolken</summary><p id="profileStatus"></p><button id="register" type="button">Aanmelden als tolk</button><label id="availabilityLabel" hidden><input id="available" type="checkbox"> Beschikbaar voor aanvragen</label><p>Laat deze werkplek open om beschikbaar te blijven. Na afsluiten of verbindingsverlies verdwijnt je beschikbaarheid binnen 30 seconden. Een beheerder controleert je aanmelding.</p><div id="queue" class="cards"></div></details>
</section>
<section id="session" hidden><h2>Besloten tolksessie</h2><p id="sessionState" role="status"></p><div id="participants"></div>
<div id="joinPanel"><p>Bij deelnemen worden beeld, geluid en wat je live typt gedeeld met de genoemde deelnemers. Dit wordt niet opgenomen of opgeslagen in de chatgeschiedenis. Live tekst kan al gelezen zijn voordat je die wist. De tolk krijgt geen eerdere berichten. Er is hier geen automatische vertaling.</p><label><input id="joinConsent" type="checkbox"> Ik wil deelnemen en mijn media en live tekst met deze deelnemers delen.</label><button id="join" type="button">Deelnemen met camera en microfoon</button><button id="joinText" type="button">Alleen deelnemen met RTT</button></div>
<div id="videos" class="videos"></div><div id="controls" hidden><button id="microphone" type="button" aria-pressed="true">Microfoon aan</button><button id="camera" type="button" aria-pressed="true">Camera aan</button><button id="leave" type="button">Gesprek beëindigen voor iedereen</button></div>
<section id="rttPanel" hidden><h3>Live tekst · RTT</h3><p>Tekstinvoer komt beschikbaar zodra alle drie de deelnemers verbonden zijn.</p><div id="drafts"></div><div id="messages" role="log" aria-label="Tekst binnen deze sessie"></div><form id="textForm"><label>Jouw live tekst<textarea id="text" rows="2" maxlength="5000" disabled></textarea></label><button disabled>Tekst afronden</button></form></section>
</section></main><script src="tolk.js?v=20261027-inline-interpreter"></script><script src="support-queue.js?v=20261027-support-tc"></script></body></html>
