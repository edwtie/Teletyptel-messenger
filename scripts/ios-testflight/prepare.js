const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { settings } = require("./settings");
const google = require("./google-signin");
const facebook = require("./facebook-signin");
const { bundleFrontend } = require("./bundle-frontend");
const callPush = require("./call-push");

const root = path.resolve(__dirname, "../..");
const stagingName = process.env.IOS_STAGING_NAME || "ios-testflight";
if (!/^ios-[a-z0-9-]+$/.test(stagingName)) throw new Error("Invalid isolated iOS staging name");
const output = path.join(root, "artifacts", stagingName);
const project = path.join(output, "project");
const webAssets = ["index.html", "offline.html", "shell.js", "shell.css"];

function prepare() {
  const facebookConfig = facebook.loadConfig({ required: !process.argv.includes("--allow-unconfigured-facebook") || process.argv.includes("--require-facebook") });
  const config = settings(process.env.IOS_SERVER_URL, process.env.IOS_BUILD_NUMBER || "1.0");
  config.callPushPreview = callPush.previewEnabled(process.env.IOS_CALL_PUSH_PREVIEW);
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
  write("ios/App/App/Base.lproj/LaunchScreen.storyboard", fs.readFileSync(path.join(__dirname, "LaunchScreen.storyboard")));
  const launchAssets = "ios/App/App/Assets.xcassets/TeleTypTelLaunch.imageset/";
  write(launchAssets + "logo.png", fs.readFileSync(path.join(root, "php/public/assets/brand/teletyptel-logo-header@2x.png")));
  write(launchAssets + "Contents.json", JSON.stringify({
    images: [{ idiom: "universal", filename: "logo.png", scale: "2x" }],
    info: { version: 1, author: "xcode" }
  }, null, 2));
  for (const file of webAssets) write("www/" + file, fs.readFileSync(path.join(__dirname, "www", file)));
  const frontendAssets = bundleFrontend(write, config.serverUrl);
  const delegate = "ios/App/App/AppDelegate.swift";
  const originalDelegate = callPush.configureDelegate(fs.readFileSync(path.join(project, delegate), "utf8"));
  const urlHandler = "return ApplicationDelegateProxy.shared.application(app, open: url, options: options)";
  if (!originalDelegate.includes(urlHandler)) throw new Error("Review changed native URL handler");
  write(delegate, "import WebKit\nimport GoogleSignIn\n" + facebook.configureDelegate(originalDelegate.replace(urlHandler,
    "if GIDSignIn.sharedInstance.handle(url) { return true }\n        " + urlHandler)) + "\n"
    + fs.readFileSync(path.join(__dirname, "LanViewController.swift"), "utf8") + "\n"
    + fs.readFileSync(path.join(__dirname, "GoogleSignInPlugin.swift"), "utf8") + "\n"
    + fs.readFileSync(path.join(__dirname, "FacebookSignInPlugin.swift"), "utf8") + "\n"
    + fs.readFileSync(path.join(__dirname, "ContactsPlugin.swift"), "utf8") + "\n"
    + fs.readFileSync(path.join(__dirname, "IncomingCallPlugin.swift"), "utf8") + "\n"
    + fs.readFileSync(path.join(__dirname, "NativeCallControl.swift"), "utf8") + "\n"
    + fs.readFileSync(path.join(__dirname, "CallMediaProfile.swift"), "utf8") + "\n"
    + fs.readFileSync(path.join(__dirname, "NativeT140Session.swift"), "utf8") + "\n"
    + (config.callPushPreview ? fs.readFileSync(path.join(__dirname, "NativeWebRTCChannel.swift"), "utf8") + "\n" : "")
    + (config.callPushPreview ? fs.readFileSync(path.join(__dirname, "NativeJingleRtt.swift"), "utf8") + "\n" : "")
    + fs.readFileSync(path.join(__dirname, "VoipCallPlugin.swift"), "utf8") + "\n"
    + fs.readFileSync(path.join(__dirname, "ServerBridge.swift"), "utf8") + "\n"
    + fs.readFileSync(path.join(__dirname, "BiometricSession.swift"), "utf8"));
  const storyboard = "ios/App/App/Base.lproj/Main.storyboard";
  const originalStoryboard = fs.readFileSync(path.join(project, storyboard), "utf8");
  const marker = 'customClass="CAPBridgeViewController" customModule="Capacitor"';
  if (!originalStoryboard.includes(marker)) throw new Error("Review changed native storyboard");
  write(storyboard, originalStoryboard.replace(marker, 'customClass="LanViewController" customModule="App" customModuleProvider="target"'));
  const plist = "ios/App/App/Info.plist";
  let originalPlist = fs.readFileSync(path.join(project, plist), "utf8");
  const encryptionKeys = originalPlist.match(/<key>ITSAppUsesNonExemptEncryption<\/key>/g) || [];
  if (encryptionKeys.length > 1 || (encryptionKeys.length === 1
      && !/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\s*\/>/.test(originalPlist))) {
    throw new Error("Review changed encryption export declaration before building.");
  }
  if (!encryptionKeys.length) {
    originalPlist = originalPlist.replace("<dict>", "<dict>\n<key>ITSAppUsesNonExemptEncryption</key><false/>\n");
  }
  if (!originalPlist.includes("<dict>") || /<key>(?:CFBundleURLTypes|Facebook[^<]*|TeleTypTelFacebookEnabled|NSUserTrackingUsageDescription)<\/key>/.test(originalPlist)) {
    throw new Error("Review existing native URL schemes or Facebook privacy configuration");
  }
  const escape = value => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
  write(plist, originalPlist.replace("<dict>", "<dict>\n"
    + callPush.plistEntries(config.callPushPreview)
    + "<key>NSLocalNetworkUsageDescription</key><string>TeleTypTel maakt verbinding met jouw testserver op hetzelfde wifi-netwerk.</string>\n"
    + "<key>NSFaceIDUsageDescription</key><string>Alleen met jouw toestemming gebruikt TeleTypTel Face ID om je bewaarde aanmeldsessie op deze iPhone te ontgrendelen.</string>\n"
    + "<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>\n"
    + "<key>GIDClientID</key><string>" + google.clientId + "</string>\n"
    + "<key>GIDServerClientID</key><string>" + google.serverClientId + "</string>\n"
    + "<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLSchemes</key><array><string>" + google.urlScheme + "</string></array></dict>" + facebook.urlType(facebookConfig) + "</array>\n"
    + facebook.plistEntries(facebookConfig)
    + "<key>TeleTypTelServerOrigin</key><string>" + escape(new URL(config.serverUrl).origin) + "</string>\n"
    + "<key>TeleTypTelServerHost</key><string>" + escape(new URL(config.serverUrl).hostname) + "</string>\n"));
  write("capacitor.config.json", JSON.stringify(config.capacitor, null, 2));
  callPush.configureProject(project, config.callPushPreview);
  write("package.json", JSON.stringify({ name: "teletyptel-ios-lan-test", version: "1.0.0", private: true,
    dependencies: { "@capacitor/core": "8.4.3", "@capacitor/ios": "8.4.3", "@capacitor/keyboard": "8.0.6" } }, null, 2));
  fs.symlinkSync(path.join(__dirname, "node_modules"), path.join(project, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  fs.writeFileSync(path.join(output, "settings.json"), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(output, "source.json"), JSON.stringify({ revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), nativeFiles: files, webAssets, frontendAssets }, null, 2));
  console.log("Prepared bundled Messenger with a scoped HTTPS server bridge; no PHP, user data, demos or signing assets bundled.");
}

if (require.main === module) prepare();
module.exports = { root, output, project, webAssets, prepare };
