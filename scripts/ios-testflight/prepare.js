const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { settings } = require("./settings");

const root = path.resolve(__dirname, "../..");
const output = path.join(root, "artifacts/ios-testflight");
const project = path.join(output, "project");
const webAssets = ["index.html", "offline.html", "shell.js", "shell.css"];

function prepare() {
  const config = settings(process.env.IOS_SERVER_URL, process.env.IOS_BUILD_NUMBER || "1.0");
  if (fs.existsSync(project)) throw new Error("Staging project already exists. Use a fresh checkout; do not overwrite signing outputs.");
  function write(file, content) {
    const target = path.resolve(project, file);
    if (!target.startsWith(project + path.sep)) throw new Error("Staging path escaped project");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const files = execFileSync("git", ["ls-files", "ios/App", "ios/debug.xcconfig"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/)
    .filter(file => /\.(swift|pbxproj|plist|storyboard|xcconfig|json|png)$/.test(file)
      && !/(?:public\/|capacitor\.config|xcuserdata|Package\.resolved)/.test(file));
  for (const file of files) write(file, execFileSync("git", ["show", "HEAD:" + file], { cwd: root, maxBuffer: 20 * 1024 * 1024 }));
  for (const file of webAssets) write("www/" + file, fs.readFileSync(path.join(__dirname, "www", file)));
  write("www/chat.html", fs.readFileSync(path.join(__dirname, "www/index.html")));
  write("www/connection.js", "window.teletyptelServer = " + JSON.stringify(config.serverUrl) + ";\n");
  const delegate = "ios/App/App/AppDelegate.swift";
  write(delegate, "import WebKit\n" + fs.readFileSync(path.join(project, delegate), "utf8") + "\n"
    + fs.readFileSync(path.join(__dirname, "LanViewController.swift"), "utf8"));
  const storyboard = "ios/App/App/Base.lproj/Main.storyboard";
  const originalStoryboard = fs.readFileSync(path.join(project, storyboard), "utf8");
  const marker = 'customClass="CAPBridgeViewController" customModule="Capacitor"';
  if (!originalStoryboard.includes(marker)) throw new Error("Review changed native storyboard");
  write(storyboard, originalStoryboard.replace(marker, 'customClass="LanViewController" customModule="App" customModuleProvider="target"'));
  const plist = "ios/App/App/Info.plist";
  const originalPlist = fs.readFileSync(path.join(project, plist), "utf8");
  const escape = value => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
  write(plist, originalPlist.replace("<dict>", "<dict>\n"
    + "<key>NSLocalNetworkUsageDescription</key><string>TeleTypTel maakt verbinding met jouw testserver op hetzelfde wifi-netwerk.</string>\n"
    + "<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>\n"
    + "<key>TeleTypTelServerHost</key><string>" + escape(new URL(config.serverUrl).hostname) + "</string>\n"));
  write("capacitor.config.json", JSON.stringify(config.capacitor, null, 2));
  write("package.json", JSON.stringify({ name: "teletyptel-ios-lan-test", version: "1.0.0", private: true,
    dependencies: { "@capacitor/core": "8.4.3", "@capacitor/ios": "8.4.3" } }, null, 2));
  fs.symlinkSync(path.join(__dirname, "node_modules"), path.join(project, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  fs.writeFileSync(path.join(output, "settings.json"), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(output, "source.json"), JSON.stringify({ revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), nativeFiles: files, webAssets }, null, 2));
  console.log("Prepared real-server iOS shell; no PHP, user data, simulator fixtures or signing assets bundled.");
}

if (require.main === module) prepare();
module.exports = { root, output, project, webAssets, prepare };
