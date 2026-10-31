const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const entryFiles = ["chat.html", "chat-client.css", "chat-client.js", "chat-dialer.css", "chat-dialer.js",
  "jingle-history.js", "chat-xmpp-translation.js", "chat-translation.js", "native-google.js",
  "chat-interpreter.js", "mobile-navigation.js", "vendor/qrcode.js", "favicon.ico"];

function assetFiles() {
  const tracked = execFileSync("git", ["ls-files", "php/public"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/);
  const assets = tracked.map(file => file.replace(/^php\/public\//, ""))
    .filter(file => /^(?:assets\/(?:brand|backgrounds|icons)\/|smileys\/)[a-zA-Z0-9_@./-]+\.(?:png|svg|gif|jpg|webp)$/.test(file)
      || /^lang\/[a-z]+\.lng$/.test(file));
  return [...new Set([...entryFiles, ...assets])].sort();
}

function bundleFrontend(write, serverUrl) {
  const manifest = [];
  for (const file of assetFiles()) {
    const source = path.join(root, "php/public", file);
    if (fs.lstatSync(source).isSymbolicLink()) throw new Error("Frontend assets must not be symbolic links");
    let content = fs.readFileSync(source);
    if (file === "chat.html") {
      const html = content.toString().replace(/\s*<link rel="manifest"[^>]+>/, "")
        .replace("<head>", '<head>\n  <script src="connection.js"></script>\n  <script src="native-server.js"></script>\n  <script src="native-keyboard.js"></script>\n  <link rel="stylesheet" href="native-startup.css">')
        .replace('<body class="account-booting">', '<body class="account-booting">\n  <section class="native-startup" role="status" aria-label="TeleTypTel"><img src="assets/brand/teletyptel-logo-header@2x.png" width="599" height="128" alt="TeleTypTel"><p>Verbinding controleren… / Connecting…</p></section>')
        .replace(/href="(tolk\/|admin\/#[^"]*|aanmelden\/)"/g,
          (_, target) => 'href="' + new URL(target, serverUrl).href + '"');
      content = Buffer.from(html);
    }
    write("www/" + file, content);
    manifest.push({ file, sha256: crypto.createHash("sha256").update(content).digest("hex") });
  }
  write("www/native-server.js", fs.readFileSync(path.join(__dirname, "www/native-server.js")));
  write("www/native-keyboard.js", fs.readFileSync(path.join(__dirname, "www/native-keyboard.js")));
  write("www/native-startup.css", fs.readFileSync(path.join(__dirname, "www/native-startup.css")));
  write("www/connection.js", "window.teletyptelServer = " + JSON.stringify(serverUrl) + ";\n");
  return manifest;
}

module.exports = { assetFiles, bundleFrontend };
