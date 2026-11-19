"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { baseline, check, readReference } = require("./check-baseline");
const root = path.resolve(__dirname, "../..");

function element(source, selector) {
  const opening = selector.exec(source);
  if (!opening) throw new Error("Missing pinned UI element.");
  const tag = /^<([a-z]+)/i.exec(opening[0])[1];
  const tokens = new RegExp("</?" + tag + "\\b[^>]*>", "gi");
  tokens.lastIndex = opening.index;
  let depth = 0;
  for (let token; (token = tokens.exec(source));) {
    depth += token[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return source.slice(opening.index, tokens.lastIndex);
  }
  throw new Error("Unbalanced pinned UI element.");
}

function createContent() {
  check();
  const reference = name => readReference(name).toString("utf8");
  const original = reference("chat.html");
  const account = element(original, /<div\b[^>]*\bid="accountDialog"[^>]*>/);
  const header = element(account, /<div\b[^>]*\bclass="modal-header"[^>]*>/);
  const authentication = element(account, /<section\b[^>]*\bclass="modal-section account-auth-section"[^>]*>/);
  const actions = element(account, /<div\b[^>]*\bclass="modal-actions"[^>]*>/);
  const legacy = reference("chat-client.js");
  const icon = /\bsettings:\s*\{\s*viewBox:\s*"([\d -]+)",\s*paths:\s*(\[[^\]]*\])/.exec(legacy);
  if (!icon) throw new Error("Missing pinned settings symbol.");
  const paths = JSON.parse(icon[2]);
  if (!paths.length || paths.some(value => typeof value !== "string" || !/^[a-zA-Z0-9., -]+$/.test(value))) throw new Error("Invalid settings symbol.");
  const symbol = '<svg viewBox="' + icon[1] + '" fill="currentColor" aria-hidden="true">'
    + paths.map(value => '<path d="' + value + '"/>').join("") + "</svg>";
  const footer = actions.replace(/<span class="material-icon" data-icon="settings"[^>]*><\/span>/, symbol);
  const html = `<!doctype html><html lang="nl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' capacitor:; style-src 'self' capacitor:; img-src 'self' capacitor:; connect-src 'none'; media-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>TeleTypTel</title><link rel="stylesheet" href="chat-client.css"><link rel="stylesheet" href="xmpp-availability.css"><link rel="stylesheet" href="hybrid-login.css">
<script src="ui-language.js" defer></script><script src="native-session.js" defer></script><script src="login-presentation.js" defer></script>
</head><body class="account-gate account-booting" data-theme="light">
<section id="hybridStartup" class="xmpp-availability native-startup" open aria-label="TeleTypTel starten"><div class="xmpp-availability__panel">
<img class="xmpp-availability__brand" src="assets/brand/teletyptel-logo-header@2x.png" width="599" height="128" alt="TeleTypTel">
<div id="hybridProgress" class="xmpp-availability__progress" role="progressbar" aria-label="Bezig"></div>
<p id="hybridStartupStatus" role="status" aria-live="polite">TeleTypTel starten…</p>
<div class="xmpp-availability__actions"><button id="hybridRetry" type="button" hidden>Opnieuw proberen</button><button id="hybridCancel" type="button" hidden>Annuleren</button><button id="hybridBack" type="button" hidden>Terug naar aanmelden</button></div>
</div></section>
<div id="accountDialog" class="modal-shell account-start-dialog" hidden role="dialog" aria-modal="true" aria-labelledby="accountDialogTitle">
<div class="modal-card account-dialog-card">${header}<div class="modal-body account-dialog-body">
<div id="dialogAccountStatus" class="dialog-status" role="status" aria-live="polite"></div>${authentication}
<p id="hybridFeatureNotice" class="security-status">Deze hybride testversie ondersteunt nu aanmelden met een XMPP-account. Andere aanmeldopties worden nog aangesloten.</p>
</div>${footer}</div></div>
<main id="hybridConnected" hidden><header class="topbar"><img src="assets/brand/teletyptel-logo-header@2x.png" width="240" height="51" alt="TeleTypTel"><span id="connectionSummary" role="status">XMPP verbonden</span><button id="hybridLogout" class="icon-button logout-icon-button" type="button" aria-label="Uitloggen"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 4H4v16h5m6-13 5 5-5 5m-7-5h12"/></svg></button></header><p>De native sessie is verbonden. De contactenlijst, chat en oproepen worden nog aangesloten.</p></main>
</body></html>`;
  if (/\bon\w+\s*=|<script\b[^>]*>(?!\s*<\/script>)/i.test(html)) throw new Error("Executable legacy HTML is not allowed.");
  const files = {};
  const add = (name, mime, data) => { files[name] = { mime, base64: Buffer.from(data).toString("base64") }; };
  add("chat.html", "text/html", html);
  const styles = ["chat-client.css", "xmpp-availability.css"];
  const images = new Set(["assets/brand/teletyptel-logo-header@2x.png"]);
  for (const name of styles) {
    const css = reference(name);
    add(name, "text/css", css);
    for (const match of css.matchAll(/url\(["']?(assets\/[a-zA-Z0-9_@./-]+)["']?\)/g)) images.add(match[1]);
  }
  for (const name of images) add(name, name.endsWith(".svg") ? "image/svg+xml" : "image/png", readReference(name));
  for (const [name, mime] of [["native-session.js", "text/javascript"], ["login-presentation.js", "text/javascript"], ["hybrid-login.css", "text/css"]]) {
    add(name, mime, fs.readFileSync(path.join(root, "mobile/ios-hybrid/Web", name)));
  }
  const translations = {};
  for (const line of reference("lang/ned.lng").split(/\r?\n/)) {
    const match = /^([a-zA-Z0-9_.-]+)=(.*)$/.exec(line);
    if (match) translations[match[1]] = match[2];
  }
  add("ui-language.js", "text/javascript", "window.TeleTypTelHybridTranslations=Object.freeze(" + JSON.stringify(translations).replace(/</g, "\\u003c") + ");\n");
  return { version: 1, revision: baseline.revision, files };
}

if (require.main === module) {
  const destination = process.env.TELETYPTEL_HYBRID_CONTENT;
  const temporary = process.env.RUNNER_TEMP;
  if (!destination || !temporary || path.resolve(destination) !== path.join(path.resolve(temporary), "teletyptel-hybrid-content.json")) {
    throw new Error("Content output is restricted to the disposable CI runner.");
  }
  const content = createContent();
  fs.writeFileSync(destination, JSON.stringify(content), { flag: "wx" });
  process.stdout.write(JSON.stringify({ files: Object.keys(content.files).length, revision: content.revision }) + "\n");
}

module.exports = { createContent, element };
