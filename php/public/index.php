<?php
declare(strict_types=1);

$configPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'config.php';
$installed = is_file($configPath);
$chatUrl = 'chat.html';
$installUrl = 'install.php';
$adminUrl = 'admin.php';
$testerEmail = 'contact@teletolk.nl';
$testerMailto = 'mailto:' . $testerEmail
    . '?subject=' . rawurlencode('Aanmelding tester TeleTypTel')
    . '&body=' . rawurlencode("Hallo TeleTypTel,\n\nIk wil mij aanmelden als tester.\n\nNaam:\nE-mail:\nIk kan testen met: telefoon / tablet / computer\nToegankelijkheidsbehoefte of ervaring:\n\nGroet,");

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
?>
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TeleTypTel</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="assets/brand/teletyptel-icon-192.png">
  <style>
    :root {
      color-scheme: light;
      --accent: #2563eb;
      --accent-strong: #1d4ed8;
      --orange: #f28c18;
      --green: #15803d;
      --ink: #0f172a;
      --muted: #475569;
      --line: #bfd7ff;
      --soft: #eef5ff;
      --panel: rgba(255, 255, 255, .92);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: #f8fbff;
      color: var(--ink);
      font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    }

    a {
      color: inherit;
    }

    .site-header {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid rgba(216, 230, 255, .76);
      background: rgba(255, 255, 255, .72);
      padding: 12px 24px;
      backdrop-filter: blur(18px);
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      text-decoration: none;
    }

    .brand img {
      display: block;
      width: 194px;
      max-width: min(48vw, 194px);
      height: auto;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(191, 215, 255, .86);
      border-radius: 6px;
      background: rgba(255, 255, 255, .74);
      color: #334155;
      padding: 7px 10px;
      font-size: 14px;
      white-space: nowrap;
    }

    .status-pill.not-installed {
      border-color: #fed7aa;
      background: #fff7ed;
      color: #7c2d12;
    }

    .status-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--green);
    }

    .not-installed .status-dot {
      background: var(--orange);
    }

    main {
      display: grid;
      gap: 28px;
    }

    .hero {
      position: relative;
      display: grid;
      align-items: end;
      min-height: min(660px, calc(100vh - 74px));
      overflow: hidden;
      border-bottom: 1px solid #d8e6ff;
      background:
        linear-gradient(90deg, rgba(248, 251, 255, .99) 0%, rgba(248, 251, 255, .9) 48%, rgba(248, 251, 255, .2) 100%),
        url("assets/backgrounds/teletyptel-bg-wide-1.png") center right / cover no-repeat;
    }

    .hero::before {
      content: "";
      position: absolute;
      inset: -18% -8% 0 30%;
      background:
        linear-gradient(112deg, transparent 0 34%, rgba(255, 255, 255, .84) 43%, rgba(255, 255, 255, .36) 49%, transparent 62%),
        linear-gradient(122deg, transparent 0 52%, rgba(37, 99, 235, .1) 59%, transparent 70%);
      filter: blur(.4px);
      pointer-events: none;
    }

    .hero::after {
      content: "";
      position: absolute;
      right: clamp(22px, 9vw, 160px);
      bottom: 0;
      width: min(360px, 34vw);
      height: min(500px, 58vh);
      border: 1px solid rgba(191, 215, 255, .58);
      border-bottom: 0;
      border-radius: 34px 34px 0 0;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, .54), rgba(255, 255, 255, .16)),
        linear-gradient(135deg, rgba(37, 99, 235, .14), rgba(242, 140, 24, .1));
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .76), 0 24px 80px rgba(37, 99, 235, .16);
      opacity: .58;
      pointer-events: none;
    }

    .hero-inner {
      position: relative;
      z-index: 1;
      display: grid;
      gap: 22px;
      width: min(1120px, calc(100% - 44px));
      margin: 0 auto;
      padding: 56px 0 64px;
    }

    .hero-copy {
      display: grid;
      gap: 16px;
      max-width: 720px;
    }

    .eyebrow {
      color: var(--accent);
      font-weight: 800;
      letter-spacing: 0;
    }

    .teaser-mark {
      display: inline-flex;
      width: fit-content;
      border: 1px solid rgba(191, 215, 255, .9);
      border-radius: 999px;
      background: rgba(255, 255, 255, .72);
      color: #334155;
      padding: 7px 12px;
      font-size: 14px;
      font-weight: 800;
    }

    .return-line {
      margin: 0;
      max-width: 940px;
      color: #071526;
      font-size: clamp(40px, 6.6vw, 84px);
      font-weight: 900;
      line-height: 1.02;
      letter-spacing: 0;
    }

    .return-line span {
      color: var(--orange);
    }

    h1 {
      margin: 0;
      color: #071526;
      font-size: clamp(42px, 7vw, 76px);
      line-height: .98;
      letter-spacing: 0;
    }

    .hero-copy p {
      margin: 0;
      max-width: 650px;
      color: #26364d;
      font-size: clamp(18px, 2vw, 24px);
      line-height: 1.42;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }

    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      border: 1px solid var(--accent);
      border-radius: 6px;
      background: #ffffff;
      color: var(--accent);
      padding: 10px 16px;
      font-weight: 700;
      text-decoration: none;
      box-shadow: 0 10px 28px rgba(37, 99, 235, .12);
    }

    .button.primary {
      background: var(--accent);
      color: #ffffff;
    }

    .button:hover {
      border-color: var(--accent-strong);
      background: #eaf2ff;
      color: var(--accent-strong);
    }

    .button.primary:hover {
      background: var(--accent-strong);
      color: #ffffff;
    }

    .content {
      display: grid;
      gap: 22px;
      width: min(1120px, calc(100% - 44px));
      margin: 0 auto 44px;
    }

    .quiet-note,
    .quick-links,
    .story,
    .teaser-film,
    .tester-call {
      border: 1px solid rgba(191, 215, 255, .82);
      border-radius: 8px;
      background: rgba(255, 255, 255, .82);
      padding: 16px;
      box-shadow: 0 18px 54px rgba(37, 99, 235, .08);
    }

    .quiet-note strong {
      font-size: 18px;
    }

    .quiet-note p {
      margin: 0;
      color: var(--muted);
      line-height: 1.45;
    }

    .story,
    .teaser-film,
    .tester-call {
      display: grid;
      gap: 10px;
      padding: 20px;
    }

    .story h2,
    .teaser-film h2,
    .tester-call h2 {
      margin: 0;
      font-size: clamp(26px, 4vw, 42px);
      line-height: 1.08;
      letter-spacing: 0;
    }

    .story p,
    .teaser-film p,
    .tester-call p {
      margin: 0;
      max-width: 860px;
      color: var(--muted);
      font-size: 17px;
      line-height: 1.5;
    }

    .film-stage {
      position: relative;
      display: grid;
      gap: 14px;
      overflow: hidden;
      min-height: 320px;
      border: 1px solid rgba(191, 215, 255, .76);
      border-radius: 12px;
      background:
        linear-gradient(110deg, rgba(255, 255, 255, .96), rgba(238, 245, 255, .8) 52%, rgba(255, 255, 255, .52)),
        url("assets/backgrounds/teletyptel-bg-wide-3.png") center right / cover no-repeat;
      padding: 20px;
    }

    .film-stage::before {
      content: "";
      position: absolute;
      inset: -20% -20% 0 24%;
      background: linear-gradient(118deg, transparent 0 34%, rgba(255, 255, 255, .88) 44%, rgba(255, 255, 255, .24) 56%, transparent 68%);
      pointer-events: none;
    }

    .film-strip {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      align-items: stretch;
    }

    .film-scene {
      display: grid;
      align-content: space-between;
      gap: 20px;
      min-height: 230px;
      border: 1px solid rgba(191, 215, 255, .84);
      border-radius: 10px;
      background: rgba(255, 255, 255, .78);
      padding: 16px;
      box-shadow: 0 18px 48px rgba(37, 99, 235, .1);
    }

    .film-scene span {
      color: var(--accent);
      font-size: 13px;
      font-weight: 800;
    }

    .film-scene strong {
      color: #071526;
      font-size: clamp(22px, 3vw, 34px);
      line-height: 1.08;
    }

    .film-scene p {
      color: var(--muted);
      font-size: 15px;
    }

    .chat-bubbles {
      display: grid;
      gap: 8px;
      align-content: start;
    }

    .bubble {
      width: fit-content;
      max-width: 92%;
      border-radius: 12px;
      background: #eef5ff;
      color: #26364d;
      padding: 8px 10px;
      font-size: 14px;
      line-height: 1.25;
    }

    .bubble.self {
      justify-self: end;
      background: #dbeafe;
      color: #12376d;
    }

    .tester-call {
      background:
        linear-gradient(90deg, rgba(248, 251, 255, .96), rgba(255, 255, 255, .82)),
        url("assets/backgrounds/teletyptel-bg-wide-2.png") center right / cover no-repeat;
    }

    .tester-points {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin: 4px 0;
      padding: 0;
      list-style: none;
    }

    .tester-points li {
      border: 1px solid #d8e6ff;
      border-radius: 8px;
      background: rgba(255, 255, 255, .86);
      padding: 12px;
      color: #26364d;
      font-weight: 700;
    }

    .quick-links {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      opacity: .78;
    }

    .quick-links div {
      display: grid;
      gap: 4px;
    }

    .quick-links strong {
      font-size: 20px;
    }

    .quick-links span {
      color: var(--muted);
    }

    .link-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    @media (max-width: 820px) {
      .site-header {
        align-items: flex-start;
        flex-direction: column;
      }

      .hero {
        min-height: auto;
        background:
          linear-gradient(180deg, rgba(248, 251, 255, .99) 0%, rgba(248, 251, 255, .86) 58%, rgba(248, 251, 255, .4) 100%),
          url("assets/backgrounds/teletyptel-bg-mobile.png") center bottom / cover no-repeat;
      }

      .hero::before {
        inset: 0 -60% 18% 8%;
      }

      .hero::after {
        right: 18px;
        width: 180px;
        height: 260px;
        opacity: .34;
      }

      .hero-inner {
        padding: 40px 0 52px;
      }

      .tester-points {
        grid-template-columns: minmax(0, 1fr);
      }

      .film-strip {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  </style>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="index.php" aria-label="TeleTypTel">
      <img src="assets/brand/teletyptel-logo-header.png" srcset="assets/brand/teletyptel-logo-header@2x.png 2x" alt="TeleTypTel">
    </a>
    <div class="status-pill<?php echo $installed ? '' : ' not-installed'; ?>">
      <span class="status-dot" aria-hidden="true"></span>
      <span><?php echo $installed ? 'Server ingesteld' : 'Installatie nodig'; ?></span>
    </div>
  </header>

  <main>
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-inner">
        <div class="hero-copy">
          <span class="teaser-mark">Beperkte testgroep opent binnenkort</span>
          <h1 id="hero-title">TeleTypTel</h1>
          <p class="return-line">We zijn <span>TERUG</span> met nieuwste technologie.</p>
          <p>Een vertrouwd idee keert terug in een nieuwe vorm. Nog niet alles wordt onthuld, maar het licht gaat langzaam aan.</p>
        </div>
        <div class="actions" aria-label="Snel starten">
          <a class="button primary" href="<?php echo e($testerMailto); ?>">Inschrijven als tester</a>
          <a class="button" href="#testers">Meer over testen</a>
        </div>
      </div>
    </section>

    <section class="content" aria-label="TeleTypTel informatie">
      <section class="story" aria-labelledby="history-title">
        <h2 id="history-title">Geschiedenis van TeleTypTel</h2>
        <p>TeleTypTel bouwt voort op het oude idee van teksttelefonie: direct kunnen typen, lezen en reageren wanneer gewone spraak niet vanzelfsprekend is. De nieuwe versie blijft nog even onder de radar, maar de richting is duidelijk: toegankelijk communiceren met moderne technologie.</p>
      </section>

      <section class="quiet-note" aria-label="Beperkte onthulling">
        <strong>Nog niet volledig onthuld</strong>
        <p>We houden de details bewust klein totdat de eerste testgroep klaarstaat. Eerst testen, dan pas groot naar buiten.</p>
      </section>

      <section class="teaser-film" aria-labelledby="film-title">
        <h2 id="film-title">Het filmpje begint stil.</h2>
        <p>Doven appen. Vrienden komen erbij. Iedereen probeert elkaar te volgen. Dan verschijnt langzaam iets nieuws.</p>
        <div class="film-stage" aria-label="Teaserfilm scènes">
          <div class="film-strip">
            <article class="film-scene">
              <span>Scene 1</span>
              <strong>Appen gaat door.</strong>
              <div class="chat-bubbles" aria-hidden="true">
                <div class="bubble">Ben je er?</div>
                <div class="bubble self">Ja, ik lees mee.</div>
              </div>
              <p>Doven gebruiken wat er is. Snel, bekend, maar niet altijd gemaakt voor elk gesprek.</p>
            </article>
            <article class="film-scene">
              <span>Scene 2</span>
              <strong>Vrienden haken aan.</strong>
              <div class="chat-bubbles" aria-hidden="true">
                <div class="bubble">Ik kom erbij.</div>
                <div class="bubble self">Wacht, ik typ nog.</div>
              </div>
              <p>Gesprekken lopen door elkaar. Iedereen wil meedoen, maar duidelijkheid blijft belangrijk.</p>
            </article>
            <article class="film-scene">
              <span>Scene 3</span>
              <strong>Dan gaat het licht aan.</strong>
              <div class="chat-bubbles" aria-hidden="true">
                <div class="bubble">TeleTypTel?</div>
                <div class="bubble self">Binnenkort.</div>
              </div>
              <p>Een vertrouwd idee keert terug met nieuwe technologie. Nog even geheim.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="testers" class="tester-call" aria-labelledby="tester-title">
        <h2 id="tester-title">We zoeken testers</h2>
        <p>Voor de volgende stap zoeken we een beperkte groep testers. We willen rustig testen op verschillende apparaten, met mensen die duidelijke en toegankelijke communicatie belangrijk vinden.</p>
        <ul class="tester-points">
          <li>Telefoons</li>
          <li>Tablets</li>
          <li>Computers en laptops</li>
        </ul>
        <div class="actions">
          <a class="button primary" href="<?php echo e($testerMailto); ?>">Inschrijven als tester</a>
          <a class="button" href="mailto:<?php echo e($testerEmail); ?>">Vraag stellen</a>
        </div>
      </section>

      <section class="quick-links" aria-label="Beheer">
        <div>
          <strong>Voor beheerders</strong>
          <span>Installatie en beheer zijn bedoeld voor een vertrouwde server.</span>
        </div>
        <nav class="link-row" aria-label="Beheerlinks">
          <a class="button" href="<?php echo e($installUrl); ?>">Installatie</a>
          <a class="button" href="<?php echo e($adminUrl); ?>">Admin</a>
          <a class="button" href="cert-install.html">Certificaat</a>
        </nav>
      </section>
    </section>
  </main>
</body>
</html>
