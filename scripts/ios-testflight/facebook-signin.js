const fs = require("node:fs");
const path = require("node:path");

const sdkVersion = "18.1.1";
const disabledFlags = ["FacebookAutoInitEnabled", "FacebookAutoLogAppEventsEnabled", "FacebookAdvertiserIDCollectionEnabled", "FacebookSKAdNetworkReportEnabled"];

function validateConfig(config, required = true) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Invalid Facebook configuration");
  const { appId, clientToken } = config;
  if (appId === undefined && clientToken === undefined && !required) return null;
  if (typeof appId !== "string" || !/^[1-9][0-9]{0,31}$/.test(appId)
      || typeof clientToken !== "string" || !clientToken.length || clientToken.length > 1024
      || /[\s\x00-\x1f\x7f\ufffe\uffff]/u.test(clientToken)) {
    throw new Error("Facebook requires both IOS_FACEBOOK_APP_ID and IOS_FACEBOOK_CLIENT_TOKEN, or appId and clientToken in ignored facebook.local.json");
  }
  return { appId, clientToken };
}

function loadConfig({ env = process.env, file = path.join(__dirname, "facebook.local.json"), required = true } = {}) {
  if (env.IOS_FACEBOOK_APP_ID !== undefined || env.IOS_FACEBOOK_CLIENT_TOKEN !== undefined) {
    return validateConfig({ appId: env.IOS_FACEBOOK_APP_ID, clientToken: env.IOS_FACEBOOK_CLIENT_TOKEN }, required);
  }
  let config = {};
  try { config = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT") throw new Error("Cannot read Facebook local configuration as JSON");
  }
  return validateConfig(config, required);
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}

function plistEntries(config) {
  const privacy = disabledFlags.map(key => `<key>${key}</key><false/>\n`).join("")
    + "<key>FacebookLoggingBehavior</key><array/>\n";
  if (!config) return privacy + "<key>TeleTypTelFacebookEnabled</key><false/>\n";
  validateConfig(config);
  return privacy + "<key>TeleTypTelFacebookEnabled</key><true/>\n"
    + `<key>FacebookAppID</key><string>${escapeXml(config.appId)}</string>\n`
    + `<key>FacebookClientToken</key><string>${escapeXml(config.clientToken)}</string>\n`
    + "<key>FacebookDisplayName</key><string>TeleTypTel</string>\n";
}

function urlType(config) {
  if (!config) return "";
  validateConfig(config);
  return `<dict><key>CFBundleURLSchemes</key><array><string>fb${escapeXml(config.appId)}</string></array></dict>`;
}

function configureDelegate(source) {
  const launch = "func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {";
  const handler = "return ApplicationDelegateProxy.shared.application(app, open: url, options: options)";
  if (source.includes("FacebookCore") || source.split(launch).length !== 2 || source.split(handler).length !== 2) {
    throw new Error("Review changed Facebook native application delegate");
  }
  return "#if canImport(FacebookCore) && canImport(FacebookLogin)\nimport FacebookCore\nimport FacebookLogin\n#endif\n" + source
    .replace(launch, launch + `
        #if canImport(FacebookCore) && canImport(FacebookLogin)
        if Bundle.main.object(forInfoDictionaryKey: "TeleTypTelFacebookEnabled") as? Bool == true {
            AppEvents.shared.flushBehavior = .explicitOnly
            _ = ApplicationDelegate.shared.application(application, didFinishLaunchingWithOptions: launchOptions)
            Settings.shared.isAutoLogAppEventsEnabled = false
            Settings.shared.isAdvertiserIDCollectionEnabled = false
            Settings.shared.isSKAdNetworkReportEnabled = false
            Settings.shared.loggingBehaviors = []
        }
        #endif`)
    .replace(handler, `#if canImport(FacebookCore) && canImport(FacebookLogin)
        if Bundle.main.object(forInfoDictionaryKey: "TeleTypTelFacebookEnabled") as? Bool == true,
           let appID = Bundle.main.object(forInfoDictionaryKey: "FacebookAppID") as? String,
           url.scheme == "fb" + appID,
           ApplicationDelegate.shared.application(app, open: url, options: options) { return true }
        #endif
        ` + handler);
}

function addFacebookPackage(source) {
  if (/facebook-ios-sdk|FacebookCore|FacebookLogin/.test(source)) throw new Error("Review existing Facebook dependency before modifying staging");
  const capacitor = '.product(name: "Capacitor", package: "capacitor-swift-pm")';
  if (!source.includes("    dependencies: [") || !source.includes(capacitor)) throw new Error("Review changed Capacitor Swift package");
  return source.replace("    dependencies: [", `    dependencies: [\n        .package(url: "https://github.com/meta/facebook-ios-sdk.git", exact: "${sdkVersion}"),`)
    .replace(capacitor, '.product(name: "FacebookCore", package: "facebook-ios-sdk"),\n                .product(name: "FacebookLogin", package: "facebook-ios-sdk"),\n                ' + capacitor);
}

function configureFacebookPackage(project) {
  const file = path.join(project, "ios/App/CapApp-SPM/Package.swift");
  fs.writeFileSync(file, addFacebookPackage(fs.readFileSync(file, "utf8")));
}

function validateStagedConfig(plist, { required = false, expected } = {}) {
  const fail = () => { throw new Error("Facebook staging configuration is missing or inconsistent; prepare again with complete Facebook configuration"); };
  if (disabledFlags.some(key => plist[key] !== false) || !Array.isArray(plist.FacebookLoggingBehavior)
      || plist.FacebookLoggingBehavior.length || plist.NSUserTrackingUsageDescription !== undefined) fail();
  if (plist.TeleTypTelFacebookEnabled === false && !required && !expected) {
    if (plist.FacebookAppID !== undefined || plist.FacebookClientToken !== undefined) fail();
    return null;
  }
  if (plist.TeleTypTelFacebookEnabled !== true) fail();
  const config = validateConfig({ appId: plist.FacebookAppID, clientToken: plist.FacebookClientToken });
  const schemes = (plist.CFBundleURLTypes || []).flatMap(entry => entry.CFBundleURLSchemes || []);
  if (!schemes.includes("fb" + config.appId)
      || expected && (expected.appId !== config.appId || expected.clientToken !== config.clientToken)) fail();
  return config;
}

module.exports = { sdkVersion, loadConfig, plistEntries, urlType, configureDelegate, addFacebookPackage, configureFacebookPackage, validateStagedConfig };
