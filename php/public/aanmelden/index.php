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
  <title>Aanmelden · TeleTypTel</title>
  <link rel="icon" href="../favicon.ico" sizes="any">
  <link rel="stylesheet" href="intake.css?v=20260929-website">
  <script src="intake-ui.js" defer></script>
  <script src="intake.js" defer></script>
</head>
<body class="intake-site">
<a class="skip-link" href="#inhoud">Naar de inhoud</a>
<header><a href="../index.php" aria-label="TeleTypTel — home"><img src="../assets/brand/teletyptel-logo-header.png" alt="TeleTypTel"></a><nav aria-label="Hoofdnavigatie"><a href="../index.php">Home</a><a class="button secondary" href="../chat.html">Open Messenger <svg class="intake-icon" aria-hidden="true"><use href="../assets/icons/site.svg#arrow"></use></svg></a></nav></header>
<main id="inhoud" tabindex="-1">
  <div class="intake-intro">
    <span class="eyebrow">Een duidelijke start bij TeleTypTel</span>
    <h1>Jouw aanmelding.<br>Stap voor stap geregeld.</h1>
    <p>Kies een beschikbaar abonnement en bekijk wat daarvoor nodig is. Je kunt je aanvraag hier invullen en later terugkomen.</p>
  </div>
  <ol class="intake-guide" aria-label="Zo werkt aanmelden">
    <li><span>01</span><svg class="intake-icon" aria-hidden="true"><use href="../assets/icons/site.svg#user"></use></svg> Je account</li>
    <li><span>02</span><svg class="intake-icon" aria-hidden="true"><use href="../assets/icons/site.svg#check"></use></svg> Abonnement kiezen</li>
    <li><span>03</span><svg class="intake-icon" aria-hidden="true"><use href="../assets/icons/site.svg#document"></use></svg> Aanvraag indienen</li>
  </ol>
  <p class="muted intake-explanation">Een aanvraag wijzigt nog geen abonnement en maakt geen factuur. Vergoeding is niet gegarandeerd.</p>
  <noscript><p class="notice error">Schakel JavaScript in om je eigen aanmelding veilig te laden en in te dienen.</p></noscript>
  <p id="message" role="status" aria-live="polite" class="notice">Aanmelding laden…</p>
  <section aria-labelledby="accountHeading">
    <h2 id="accountHeading">1. Je eigen account</h2>
    <p id="identity">Log in of maak een account in Messenger, ook via Google. Kom daarna terug naar deze pagina.</p>
    <div class="actions"><a class="button secondary" href="../chat.html" target="_blank" rel="noopener">Account maken / inloggen</a><button id="reload" type="button">Aanmelding laden</button></div>
    <small>Voor deze pagina is een recente aanmelding nodig (15 minuten). Gegevens worden niet in browseropslag bewaard.</small>
  </section>
  <section id="planSection" aria-labelledby="planHeading" hidden>
    <h2 id="planHeading">2. Kies je abonnement</h2>
    <div id="plans" class="grid"></div>
  </section>
  <section id="applicationSection" aria-labelledby="applicationHeading" hidden>
    <h2 id="applicationHeading">3. Je aanvraag</h2>
    <p id="summary"></p><p id="requirements"></p><p id="feedback" class="notice" hidden></p>
    <p id="retention" class="muted"></p>
    <p id="medicalNotice" class="notice" hidden>Alleen jij en apart bevoegde admin/staff kunnen je zorggegevens inzien. Upload alleen de gevraagde stukken, geen identiteitsbewijs of gegevens van anderen. Dit is geen spoeddienst.</p>
    <p><a id="privacyLink" target="_blank" rel="noopener noreferrer" hidden>Privacy-informatie en bewaartermijn lezen</a></p>
    <form id="detailsForm" autocomplete="off" hidden>
      <fieldset id="careFields">
        <legend>Zorggegevens</legend>
        <label>Zorgverzekeraar / label <select id="insurer" name="insurer"></select></label>
        <small id="insurerSource"></small>
        <label id="bsnField" hidden>BSN <input id="bsn" type="password" inputmode="numeric" pattern="[0-9]{8,9}" minlength="8" maxlength="9" autocomplete="off"><small id="bsnHelp"></small></label>
        <div id="uploadFields" hidden>
          <label>Audiogram <input id="audiogram" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"></label>
          <label>Voorschrift van arts/audioloog <input id="prescription" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"></label>
          <small>Beide documenten zijn verplicht. PDF, PNG of JPEG; maximaal 4 MB per bestand. Bestanden worden gecontroleerd en versleuteld opgeslagen.</small>
        </div>
        <button type="submit">Gegevens en gekozen documenten opslaan</button>
      </fieldset>
    </form>
    <div id="stored"></div>
    <p id="bsnValue"></p><button id="revealBsn" type="button" class="secondary" hidden>Eigen BSN kort tonen</button>
    <form id="submitForm" hidden>
      <label><input id="confirmed" type="checkbox" required>Ik heb de gegevens gecontroleerd en, indien van toepassing, de privacy-informatie gelezen. Ik wil deze aanvraag indienen.</label>
      <button type="submit">Aanvraag indienen</button>
    </form>
    <div class="actions"><button id="withdraw" class="danger" type="button">Intrekken en zorggegevens verwijderen</button></div>
  </section>
</main>
<footer class="page-footer"><span>TeleTypTel · Een gesprek op jouw manier.</span><a href="../index.php#vragen">Hulp &amp; vragen</a></footer>
</body>
</html>
