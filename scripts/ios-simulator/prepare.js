const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const output = path.join(root, "artifacts/ios-simulator");
const project = path.join(output, "project");
const assets = [
  "chat.html", "chat-client.js", "chat-client.css", "chat-dialer.js", "chat-dialer.css",
  "jingle-history.js", "chat-xmpp-translation.js", "chat-translation.js", "chat-interpreter.js",
  "mobile-navigation.js", "vendor/qrcode.js", "lang/ned.lng", "lang/eng.lng",
  "assets/brand/teletyptel-logo-header.png", "assets/brand/teletyptel-logo-header@2x.png",
  "assets/brand/teletyptel-icon-192.png", "assets/icons/chevron-down-icon.svg",
  "assets/backgrounds/teletyptel-bg-wide-1.png", "assets/backgrounds/teletyptel-bg-wide-2.png",
  "assets/backgrounds/teletyptel-bg-wide-3.png", "assets/backgrounds/teletyptel-bg-mobile.png"
];

function tracked(file) {
  return execFileSync("git", ["show", "HEAD:" + file], { cwd: root, maxBuffer: 20 * 1024 * 1024 });
}

function write(relative, content) {
  const target = path.resolve(project, relative);
  if (!target.startsWith(project + path.sep)) throw new Error("Fixture path escapes staging directory");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function prepare() {
  if (fs.existsSync(project)) throw new Error("Fixture project already exists. Use a fresh checkout or remove only artifacts/ios-simulator/project before preparing again.");
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const manifest = { revision, source: "committed-files-only", files: [], network: "mocked; no WAMP, Google or external account access" };
  for (const asset of assets) {
    const content = tracked("php/public/" + asset);
    manifest.files.push({ file: "php/public/" + asset, sha256: crypto.createHash("sha256").update(content).digest("hex") });
    write("www/" + asset, content);
  }
  let html = fs.readFileSync(path.join(project, "www/chat.html"), "utf8");
  html = html.replace(/<link[^>]+rel="(?:manifest|icon|apple-touch-icon)"[^>]*>/g, "");
  html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; connect-src \'none\'; media-src \'none\'; frame-src \'none\'; object-src \'none\'; worker-src \'none\'; base-uri \'none\'; form-action \'none\'">\n'
    + '<script src="fixture-data.js"></script><script src="fixture-bootstrap.js"></script>');
  html = html.replace("</body>", '<script src="fixture-run.js"></script></body>');
  write("www/index.html", html);
  write("www/chat.html", html);
  const source = fs.readFileSync(path.join(project, "www/chat-client.js"), "utf8");
  if (!source.trimEnd().endsWith("})();")) throw new Error("Messenger IIFE changed; review test instrumentation");
  write("www/chat-client.js", source.replace(/\}\)\(\);\s*$/, fs.readFileSync(path.join(__dirname, "fixture-hook.js"), "utf8") + "\n})();\n"));
  for (const name of ["fixture-bootstrap.js", "fixture-run.js"]) write("www/" + name, fs.readFileSync(path.join(__dirname, name)));
  const languages = Object.fromEntries(["ned", "eng"].map((language) => ["/lang/" + language + ".lng", tracked("php/public/lang/" + language + ".lng").toString("utf8")]));
  write("www/fixture-data.js", "window.iosFixtureLanguages = " + JSON.stringify(languages) + ";\n");
  const nativeFiles = execFileSync("git", ["ls-files", "ios/App", "ios/debug.xcconfig"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/);
  for (const file of nativeFiles) {
    if (!/\.(swift|pbxproj|plist|storyboard|xcconfig|json|png)$/.test(file)
        || /(?:public\/|capacitor\.config|config\.xml|xcuserdata|Package\.resolved)/.test(file)) continue;
    write(file, tracked(file));
  }
  const delegatePath = "ios/App/App/AppDelegate.swift";
  write(delegatePath, "import WebKit\n" + tracked(delegatePath).toString("utf8") + "\n"
    + fs.readFileSync(path.join(__dirname, "SimulatorTestViewController.swift"), "utf8"));
  const storyboard = "ios/App/App/Base.lproj/Main.storyboard";
  write(storyboard, tracked(storyboard).toString("utf8").replace('customClass="CAPBridgeViewController" customModule="Capacitor"',
    'customClass="SimulatorTestViewController" customModule="App" customModuleProvider="target"'));
  write("capacitor.config.json", JSON.stringify({
    appId: "com.tiedragon.teletyptel.simulator", appName: "TeleTypTel Simulator Test", webDir: "www",
    loggingBehavior: "none", server: { hostname: "localhost", iosScheme: "capacitor" },
    ios: { contentInset: "always" }, plugins: { CapacitorHttp: { enabled: false } }
  }, null, 2));
  write("package.json", JSON.stringify({ name: "teletyptel-simulator-fixture", version: "1.0.0", private: true,
    dependencies: { "@capacitor/core": "8.4.3", "@capacitor/ios": "8.4.3" } }, null, 2));
  fs.symlinkSync(path.join(__dirname, "node_modules"), path.join(project, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  fs.writeFileSync(path.join(output, "source-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("Prepared isolated iOS fixture from committed revision " + revision);
  return { project, output, manifest };
}

if (require.main === module) prepare();
module.exports = { root, output, project, assets, prepare };
