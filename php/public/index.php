<?php
declare(strict_types=1);

$configPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'config.php';
$installed = is_file($configPath);
$chatUrl = 'chat.html';
$installUrl = 'install.php';
$adminUrl = 'admin.php';

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
      border-bottom: 1px solid #d8e6ff;
      background: rgba(255, 255, 255, .94);
      padding: 10px 22px;
      backdrop-filter: blur(12px);
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
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      background: #f0fdf4;
      color: #14532d;
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
        linear-gradient(90deg, rgba(248, 251, 255, .98) 0%, rgba(248, 251, 255, .86) 46%, rgba(248, 251, 255, .18) 100%),
        url("assets/backgrounds/teletyptel-bg-wide-1.png") center right / cover no-repeat;
    }

    .hero-inner {
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

    .feature-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }

    .feature,
    .notice,
    .quick-links {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 16px;
    }

    .feature {
      display: grid;
      gap: 8px;
    }

    .feature strong,
    .notice strong {
      font-size: 18px;
    }

    .feature p,
    .notice p {
      margin: 0;
      color: var(--muted);
      line-height: 1.45;
    }

    .quick-links {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
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
          linear-gradient(180deg, rgba(248, 251, 255, .98) 0%, rgba(248, 251, 255, .82) 58%, rgba(248, 251, 255, .35) 100%),
          url("assets/backgrounds/teletyptel-bg-mobile.png") center bottom / cover no-repeat;
      }

      .hero-inner {
        padding: 40px 0 52px;
      }

      .feature-grid {
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
          <span class="eyebrow">Realtime tekst, chat en Total Conversation</span>
          <h1 id="hero-title">TeleTypTel</h1>
          <p>Een toegankelijke communicatie-app voor teksttelefonie, RTT, gesprekken, groepen en bewaarde Total Conversation-geschiedenis.</p>
        </div>
        <div class="actions" aria-label="Snel starten">
          <a class="button primary" href="<?php echo e($installed ? $chatUrl : $installUrl); ?>">
            <?php echo $installed ? 'TeleTypTel openen' : 'Installatie starten'; ?>
          </a>
          <a class="button" href="<?php echo e($chatUrl); ?>">Webapp openen</a>
          <a class="button" href="dev.html">Status bekijken</a>
        </div>
      </div>
    </section>

    <section class="content" aria-label="TeleTypTel informatie">
      <div class="feature-grid">
        <article class="feature">
          <strong>Voor doven en slechthorenden</strong>
          <p>RTT en tekstcommunicatie blijven zichtbaar tijdens chat en gesprekken, met aandacht voor toegankelijkheid.</p>
        </article>
        <article class="feature">
          <strong>1-op-1 en groepen</strong>
          <p>Gebruik XMPP voor contacten, groepsgesprekken en aanwezigheid, klaar voor verdere ejabberd-integratie.</p>
        </article>
        <article class="feature">
          <strong>Geschiedenis met bewaartermijn</strong>
          <p>Total Conversation-geschiedenis kan worden bewaard met een maximale termijn en AVG-uitleg.</p>
        </article>
      </div>

      <section class="notice" aria-label="Beta status">
        <strong>Beta-opbouw</strong>
        <p>TeleTypTel is in opbouw richting beta. Test eerst lokaal of op de ontwikkelomgeving voordat je naar een VPS of productieomgeving gaat.</p>
      </section>

      <section class="quick-links" aria-label="Beheer">
        <div>
          <strong>Beheer en installatie</strong>
          <span>Gebruik de beheerlinks alleen op een vertrouwde server.</span>
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
