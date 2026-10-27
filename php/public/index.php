<?php
declare(strict_types=1);

$installed = is_file(dirname(__DIR__) . DIRECTORY_SEPARATOR . 'config.php');
$testerEmail = 'contact@teletolk.nl';
$testerMailto = 'mailto:' . $testerEmail
    . '?subject=' . rawurlencode('Aanmelding tester TeleTypTel')
    . '&body=' . rawurlencode("Hallo TeleTypTel,\n\nIk wil mij aanmelden als tester.\n\nNaam:\nE-mail:\nIk kan testen met: telefoon / tablet / computer\n\nGroet,");

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function siteIcon(string $name): string
{
    return '<svg class="site-icon" aria-hidden="true" focusable="false"><use href="assets/icons/site.svg#' . e($name) . '"></use></svg>';
}
?>
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="TeleTypTel brengt tekst, beeld en geluid bij elkaar. Ontdek de messenger, meld je aan of help mee als tester.">
  <meta name="theme-color" content="#173b64">
  <title>TeleTypTel · Een gesprek op jouw manier</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="assets/brand/teletyptel-icon-192.png">
  <link rel="stylesheet" href="site.css?v=20261027-new-features">
  <link rel="stylesheet" href="support-chat.css?v=20261027-close-all">
  <link rel="stylesheet" href="support-call.css?v=20261027-close-all">
  <link rel="stylesheet" href="support-translation.css?v=20261027-close-all">
  <script src="support-language.js?v=20261027-close-all" defer></script><script src="support-translation.js?v=20261027-close-all" defer></script>
  <script src="support-call.js?v=20261027-close-all" defer></script>
  <link rel="stylesheet" href="support-attachments.css?v=20261027-close-all"><script src="support-attachments.js?v=20261027-close-all" defer></script><script src="support-chat.js?v=20261027-close-all" defer></script>
</head>
<body class="public-site">
  <a class="skip-link" href="#inhoud">Naar de inhoud</a>
  <header class="site-header">
    <div class="site-container header-inner">
      <a class="site-brand" href="index.php" aria-label="TeleTypTel — home"><img src="assets/brand/teletyptel-logo-header.png" srcset="assets/brand/teletyptel-logo-header@2x.png 2x" alt="TeleTypTel"></a>
      <nav class="site-nav" aria-label="Hoofdnavigatie">
        <a href="#mogelijkheden">Mogelijkheden</a><a href="#aanmelden">Aanmelden</a><a href="#vragen">Hulp &amp; vragen</a>
      </nav>
      <a class="site-button compact" href="chat.html">Open Messenger <?php echo siteIcon('arrow'); ?></a>
    </div>
  </header>
  <main id="inhoud" tabindex="-1">
    <section class="site-hero site-container" aria-labelledby="hero-title">
      <div class="hero-copy">
        <span class="eyebrow"><span class="eyebrow-line"></span> Opnieuw verbonden. Op jouw manier.</span>
        <h1 id="hero-title">Een gesprek.<br>Meer manieren<br>om <span>mee te doen.</span></h1>
        <p class="hero-description">Typ, lees en zie elkaar. TeleTypTel brengt tekst, beeld en geluid samen, voor doven, slechthorenden én horenden.</p>
        <div class="site-actions">
          <a class="site-button" href="chat.html"><?php echo siteIcon('message'); ?> Open Messenger</a>
          <a class="site-button outline" href="aanmelden/">Aanmelden <?php echo siteIcon('arrow'); ?></a>
        </div>
        <p class="hero-note"><?php echo siteIcon('devices'); ?> Op je telefoon, tablet of computer via de browser.</p>
        <a class="text-link" href="#nieuw">Nieuw: vertaling en een gebarentolk oproepen <?php echo siteIcon('arrow'); ?></a>
      </div>
      <figure class="product-preview">
        <div class="product-preview-heading"><span>Echt TeleTypTel. Geen tekening.</span><span class="release-label">Schermopname</span></div>
        <a href="demo.html" aria-label="Bekijk de echte Messenger-schermen in de demo"><img src="assets/demo/messenger-desktop.png" width="1440" height="960" alt="De echte TeleTypTel Messenger met een fictief voorbeeldgesprek tussen Sam en Noor."></a>
        <figcaption><span>Echte interface met testgegevens.<br>Geen live gesprek of verbinding.</span><a href="demo.html">Bekijk de demo <?php echo siteIcon('arrow'); ?></a></figcaption>
      </figure>
    </section>
    <div class="development-band"><div class="site-container"><span class="release-label">In ontwikkeling</span><p>We bouwen en testen verder. Wil jij meedenken?</p><a href="#testers">Word tester <?php echo siteIcon('arrow'); ?></a></div></div>
    <section class="site-section site-container new-features" id="nieuw" aria-labelledby="new-features-title">
      <div class="section-heading"><div><span class="eyebrow">Nieuw in TeleTypTel</span><h2 id="new-features-title">Meer begrijpen.<br>Meer meedoen.</h2></div><p>Twee nieuwe mogelijkheden om elkaar beter te begrijpen, gewoon in je gesprek.</p></div>
      <div class="feature-grid new-feature-grid">
        <article class="feature-card">
          <div class="new-feature-heading"><span class="icon-tile blue"><svg class="site-icon" aria-hidden="true"><use href="assets/icons/site.svg?v=20261027-new-features#translate"></use></svg></span><span class="release-label">Nieuw</span></div>
          <h3>Vertaling in jouw taal</h3>
          <p>Lees berichten in de taal die jij kiest. Vertaal handmatig of automatisch. Met aparte toestemming zie je ook tijdens live RTT een voorlopige vertaling, van je eigen tekst en die van je gesprekspartner.</p>
          <span class="feature-detail">Na toestemming via Google Cloud Translation. Het origineel blijft zichtbaar. Vertalingen kunnen fouten bevatten.</span>
          <a class="text-link" href="chat.html">Kies je vertaalvoorkeuren in Messenger <svg class="site-icon" aria-hidden="true"><use href="assets/icons/site.svg#arrow"></use></svg></a>
        </article>
        <article class="feature-card">
          <div class="new-feature-heading"><span class="icon-tile green"><svg class="site-icon" aria-hidden="true"><use href="assets/icons/site.svg?v=20261027-new-features#interpreter"></use></svg></span><span class="release-label">Nieuw</span></div>
          <h3>Gebarentolk oproepen</h3>
          <p>Druk op de tolkknop om een beschikbare, goedgekeurde eigen gebarentolk te vragen. Na acceptatie en toestemming sluit de tolk aan in hetzelfde gesprek, met beeld, geluid en live tekst. Geen apart invulscherm.</p>
          <span class="feature-detail">Afhankelijk van de beschikbaarheid van een eigen tolk. Tolkcontact is nog niet aangesloten.</span>
          <a class="text-link" href="chat.html">Open Messenger <svg class="site-icon" aria-hidden="true"><use href="assets/icons/site.svg#arrow"></use></svg></a>
        </article>
      </div>
      <p class="section-note">Nieuwe mogelijkheden in de testversie. Werking en beschikbaarheid hangen af van de server, browser en het apparaat. Je stelt toestemming voor vertaling in bij Instellingen → Privacy.</p>
    </section>
    <section class="site-section site-container" id="mogelijkheden" aria-labelledby="features-title">
      <div class="section-heading"><div><span class="eyebrow">Vertrouwd, maar met meer ruimte</span><h2 id="features-title">Niet iedereen praat hetzelfde.<br>Een goed gesprek verbindt ons.</h2></div><p>Een messenger voor dagelijks contact. Met toegankelijkheid als uitgangspunt, niet als extraatje.</p></div>
      <div class="feature-grid">
        <article class="feature-card"><span class="icon-tile blue"><?php echo siteIcon('message'); ?></span><h3>Laat je woorden zien</h3><p>Chat op je eigen tempo. Met live tekst kun je ook tijdens het typen lezen wat de ander zegt.</p><span class="feature-detail">Chat &amp; real-time tekst</span></article>
        <article class="feature-card"><span class="icon-tile orange"><?php echo siteIcon('video'); ?></span><h3>Meer dan alleen tekst</h3><p>Beeld, geluid en tekst bij elkaar: dat is het idee achter Total Conversation. Kies wat bij jouw gesprek past.</p><span class="feature-detail">Beeld &amp; geluid</span></article>
        <article class="feature-card"><span class="icon-tile green"><?php echo siteIcon('devices'); ?></span><h3>Dichtbij, waar je ook bent</h3><p>Open Messenger in je browser. Een herkenbare plek voor contact, op een groot scherm of in je hand.</p><span class="feature-detail">Telefoon, tablet &amp; computer</span></article>
      </div>
      <p class="section-note">Dit is een testversie. Beschikbaarheid en werking van functies kunnen per apparaat en server verschillen.</p>
    </section>
    <section class="signup-section" id="aanmelden" aria-labelledby="signup-title">
      <div class="site-container signup-layout">
        <div><span class="eyebrow">Een duidelijke start</span><h2 id="signup-title">Jouw account.<br>Jouw volgende stap.</h2><p>Nieuw bij TeleTypTel? Begin met een account in Messenger. Voor een abonnement ga je daarna naar je eigen aanmelding.</p><a class="site-button" href="aanmelden/">Naar mijn aanmelding <?php echo siteIcon('arrow'); ?></a><p class="signup-note">Al een account? Log eerst in bij Messenger.</p></div>
        <ol class="signup-steps">
          <li><span class="step-number">01</span><div><h3>Maak een account of log in</h3><p>Open Messenger en meld je aan met je account of een beschikbare inlogmethode.</p><a href="chat.html">Naar Messenger <?php echo siteIcon('arrow'); ?></a></div></li>
          <li><span class="step-number">02</span><div><h3>Kies een beschikbaar abonnement</h3><p>Op je aanmeldpagina zie je welke abonnementen gepubliceerd zijn en wat daarvoor nodig is.</p></div></li>
          <li><span class="step-number">03</span><div><h3>Controleer en dien je aanvraag in</h3><p>Je ziet alleen je eigen aanvraag. Gevraagde documenten voeg je daar toe, niet via e-mail of chat.</p></div></li>
        </ol>
      </div>
    </section>
    <section class="site-section site-container story-section" aria-labelledby="story-title">
      <div class="story-mark" aria-hidden="true"><?php echo siteIcon('message'); ?><span>Een vertrouwd idee.<br>Een nieuw hoofdstuk.</span></div>
      <div><span class="eyebrow">Het verhaal van TeleTypTel</span><h2 id="story-title">We zijn terug.<br>En we bouwen samen verder.</h2><p>TeleTypTel bouwt voort op teksttelefonie: direct kunnen typen, lezen en reageren als spraak niet vanzelfsprekend is. Die gedachte blijft. De vorm groeit mee.</p><p>Ons doel is een toegankelijke messenger die je samen gebruikt met vrienden, familie en collega's. Geen aparte wereld, maar meer manieren om elkaar te bereiken.</p></div>
    </section>
    <section class="site-container" id="testers" aria-labelledby="testers-title">
      <div class="tester-panel"><div><span class="eyebrow">Jouw ervaring helpt ons verder</span><h2 id="testers-title">Bouw mee door mee te testen.</h2><p>Gebruik jij een telefoon, tablet of computer? Help ons ontdekken wat prettig werkt en wat beter kan. Je hoeft geen technische kennis te hebben.</p><a class="site-button light" href="<?php echo e($testerMailto); ?>"><?php echo siteIcon('mail'); ?> Ik wil helpen testen</a><span class="tester-note">Opent je e-mailprogramma. Deel geen medische gegevens.</span></div><div class="tester-art" aria-hidden="true"><span><?php echo siteIcon('message'); ?></span><span><?php echo siteIcon('video'); ?></span><span><?php echo siteIcon('audio'); ?></span><p>Jouw feedback.<br>Een betere TeleTypTel.</p></div></div>
    </section>
    <section class="site-section site-container faq-layout" id="vragen" aria-labelledby="faq-title">
      <div><span class="eyebrow">Even duidelijk</span><h2 id="faq-title">Waar kunnen<br>we je mee helpen?</h2><p>Staat je vraag er niet bij?</p><a class="text-link" href="mailto:<?php echo e($testerEmail); ?>"><?php echo siteIcon('mail'); ?> Stel ons een vraag</a></div>
      <div class="faq-list">
        <details><summary>Is TeleTypTel alleen voor doven en slechthorenden? <?php echo siteIcon('plus'); ?></summary><p>Nee. TeleTypTel is bedoeld om samen te communiceren, ook met horende vrienden, familie en collega's. Je kiest de manier van communiceren die bij je past.</p></details>
        <details><summary>Moet ik iets installeren? <?php echo siteIcon('plus'); ?></summary><p>De webversie open je in je browser via <a href="chat.html">Open Messenger</a>. Een verbinding met de server is nodig. Voor beeld en geluid vraagt je browser zo nodig toestemming voor camera en microfoon.</p></details>
        <details><summary>Waar vind ik de abonnementen en prijzen? <?php echo siteIcon('plus'); ?></summary><p>Log in bij Messenger en open <a href="aanmelden/">je aanmelding</a>. Daar staan de gepubliceerde abonnementen met de ingestelde prijzen en vereisten. Zie je nog geen abonnementen? Neem dan contact met ons op.</p></details>
        <details><summary>Hoe werkt een aanvraag met zorggegevens? <?php echo siteIcon('plus'); ?></summary><p>De vereisten hangen af van het gekozen abonnement. Als zorgaanmeldingen zijn geactiveerd, toont je eigen aanmelding welke gegevens en documenten nodig zijn. Dien ze alleen daar in. Een aanvraag is geen garantie op vergoeding en activeert niet automatisch een abonnement of factuur.</p></details>
        <details><summary>Kan ik TeleTypTel al gebruiken? <?php echo siteIcon('plus'); ?></summary><p>TeleTypTel is in ontwikkeling. Je kunt de beschikbare testversie openen via Messenger. We testen stap voor stap; nog niet alles is klaar. Deze website en de testversie zijn geen spoeddienst.</p></details>
      </div>
    </section>
  </main>
  <footer class="site-footer"><div class="site-container footer-top"><div><a class="site-brand" href="index.php"><img src="assets/brand/teletyptel-logo-header.png" alt="TeleTypTel"></a><p>Een gesprek op jouw manier.</p></div><nav aria-label="Footernavigatie"><a href="chat.html">Messenger</a><a href="aanmelden/">Mijn aanmelding</a><a href="mailto:<?php echo e($testerEmail); ?>">Contact</a><a href="admin/">Beheerlogin</a></nav></div><div class="site-container footer-bottom"><span>TeleTypTel · Tiedragon Labs</span><span>Testversie · Geen spoeddienst</span><?php if (!$installed): ?><a href="install.php">Server installeren</a><?php endif; ?></div></footer>
</body>
</html>
