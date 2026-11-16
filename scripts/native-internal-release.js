"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { prepare } = require("./prepare-ios-native");
const push = require("./native-call-push-config");
const metadata = require("./native-archive-config");
const bundleId = "com.tiedragon.teletyptel", teamId = "H29RTRBD9D";
const pushTest = { bundleId, environment: "production", testOnly: true };

function providers(environment) {
  const google = require("./ios-testflight/google-signin");
  if (typeof environment.IOS_FACEBOOK_APP_ID !== "string" || typeof environment.IOS_FACEBOOK_CLIENT_TOKEN !== "string") throw new Error("Missing protected provider configuration");
  const facebook = require("./ios-testflight/facebook-signin").loadConfig({ env: {
    IOS_FACEBOOK_APP_ID: environment.IOS_FACEBOOK_APP_ID, IOS_FACEBOOK_CLIENT_TOKEN: environment.IOS_FACEBOOK_CLIENT_TOKEN
  }, required: true });
  if (facebook.appId !== "926375633763307") throw new Error("Review production Facebook registration");
  return { bundleId, google: { clientId: google.clientId, serverClientId: google.serverClientId }, facebook };
}

function validateEntitlements(value) {
  const allowed = ["application-identifier", "com.apple.developer.team-identifier", "aps-environment", "get-task-allow", "beta-reports-active", "keychain-access-groups"];
  if (!value || Object.keys(value).some(key => !allowed.includes(key))
      || value["application-identifier"] !== teamId + "." + bundleId
      || value["com.apple.developer.team-identifier"] !== teamId || value["aps-environment"] !== "production"
      || value["get-task-allow"] !== false
      || Object.hasOwn(value, "keychain-access-groups") && (!Array.isArray(value["keychain-access-groups"])
        || value["keychain-access-groups"].some(group => group !== teamId + "." + bundleId))) {
    throw new Error("Signed native entitlements do not match the internal APNs target");
  }
}

function validateApp(app, expected) {
  if (app.TeleTypTelProviderBundleID !== bundleId || app.GIDClientID !== expected.google.clientId
      || app.GIDServerClientID !== expected.google.serverClientId || app.FacebookAppID !== expected.facebook.appId
      || app.FacebookClientToken !== expected.facebook.clientToken || app.TeleTypTelFacebookEnabled !== true) {
    throw new Error("Production provider configuration changed during signing");
  }
  for (const key of ["FacebookAutoInitEnabled", "FacebookAutoLogAppEventsEnabled", "FacebookAdvertiserIDCollectionEnabled", "FacebookSKAdNetworkReportEnabled"]) {
    if (app[key] !== false) throw new Error("Unexpected provider tracking configuration");
  }
}

function validatePrivacy(value) {
  const entries = value?.NSPrivacyAccessedAPITypes;
  if (!Array.isArray(entries) || entries.length !== 2) throw new Error("Missing native reason-API manifest");
  for (const [category, reason] of [["UserDefaults", "CA92.1"], ["SystemBootTime", "35F9.1"]]) {
    if (!entries.some(entry => entry.NSPrivacyAccessedAPIType === "NSPrivacyAccessedAPICategory" + category
        && Array.isArray(entry.NSPrivacyAccessedAPITypeReasons) && entry.NSPrivacyAccessedAPITypeReasons.join(",") === reason)) {
      throw new Error("Native reason-API manifest changed");
    }
  }
}

function signingProject(source, uuid, fingerprint) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(uuid)
      || !/^[A-F0-9]{40}$/.test(fingerprint)) throw new Error("Invalid native signing identity");
  const marker = "INFOPLIST_FILE = App/Info.plist;";
  if (source.split(marker).length !== 3) throw new Error("Review native app target signing settings");
  return source.replaceAll(marker, marker + ' CODE_SIGNING_ALLOWED = YES; CODE_SIGN_STYLE = Manual; DEVELOPMENT_TEAM = '
    + teamId + '; CODE_SIGN_IDENTITY = "' + fingerprint + '"; PROVISIONING_PROFILE_SPECIFIER = "' + uuid + '";');
}

function run() {
  if (process.platform !== "darwin" || process.argv.length !== 3 || process.argv[2] !== "--upload-internal") throw new Error("Choose the protected macOS internal-upload path explicitly");
  const names = ["IOS_NATIVE_PROVISION_PROFILE_BASE64", "IOS_DISTRIBUTION_P12_BASE64", "IOS_DISTRIBUTION_P12_PASSWORD", "IOS_ASC_KEY_P8", "IOS_ASC_KEY_ID", "IOS_ASC_ISSUER_ID"];
  const secrets = Object.fromEntries(names.map(name => [name, process.env[name]]));
  if (names.some(name => !secrets[name])) throw new Error("Missing protected native signing configuration");
  if (!/^[A-Z0-9]{10}$/.test(secrets.IOS_ASC_KEY_ID) || !/^[a-f0-9-]{36}$/i.test(secrets.IOS_ASC_ISSUER_ID)) throw new Error("Invalid Apple upload identifiers");
  if (secrets.IOS_ASC_KEY_P8.length > 4096 || crypto.createPrivateKey(secrets.IOS_ASC_KEY_P8).asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new Error("Invalid protected Apple upload key");
  const expected = { version: "1.0", buildNumber: process.env.TELETYPTEL_NATIVE_BUILD_NUMBER };
  metadata.validate(expected, pushTest);
  const configured = providers(process.env);
  process.umask(0o077);
  const directory = prepare("ios-native-internal-" + Date.now(), { archive: expected, pushTest, providers: configured });
  const reports = path.join(directory, "reports"), logs = path.join(directory, "private-logs");
  fs.mkdirSync(reports); fs.mkdirSync(logs);
  const childEnvironment = { ...process.env };
  for (const name of Object.keys(childEnvironment)) if (/^(?:IOS_|TELETYPTEL_APNS_|TELETYPTEL_CALL_)/.test(name)) delete childEnvironment[name];
  let stage = "initialize", temporary, keychain, installedProfile, apiKeyFile;
  let previousKeychains = [];
  const result = { bundleId, ...expected, internalTestOnly: true, unsigned: false, signed: false, uploaded: false,
    apnsActivated: false, physicalDeviceTested: false, privacyReviewRequired: true, exportComplianceReviewRequired: true };
  const command = (name, args, input) => {
    const reply = spawnSync(name, args, { cwd: directory, env: childEnvironment, input, encoding: "utf8", timeout: 1200000, maxBuffer: 40 * 1024 * 1024 });
    if (reply.error || reply.status !== 0) throw new Error("Native internal operation failed");
    return reply.stdout || "";
  };
  const logged = (name, args, filename) => {
    const descriptor = fs.openSync(path.join(logs, filename), "wx", 0o600);
    try {
      const reply = spawnSync(name, args, { cwd: directory, env: childEnvironment, stdio: ["ignore", descriptor, descriptor], timeout: 1200000 });
      if (reply.error || reply.status !== 0) throw new Error("Native internal operation failed");
    } finally { fs.closeSync(descriptor); }
  };
  const plist = file => JSON.parse(command("plutil", ["-convert", "json", "-o", "-", file]));
  const profile = file => JSON.parse(command("python3", ["-c", "import sys,plistlib,json,base64; print(json.dumps(plistlib.loads(sys.stdin.buffer.read()),default=lambda value:base64.b64encode(value).decode() if isinstance(value,bytes) else value.isoformat()))"], command("security", ["cms", "-D", "-i", file])));
  try {
    stage = "validate provisioning";
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), "tc-native-signing-"));
    const profileFile = path.join(temporary, "native.mobileprovision"), certificateFile = path.join(temporary, "distribution.p12");
    fs.writeFileSync(profileFile, Buffer.from(secrets.IOS_NATIVE_PROVISION_PROFILE_BASE64, "base64"), { mode: 0o600 });
    fs.writeFileSync(certificateFile, Buffer.from(secrets.IOS_DISTRIBUTION_P12_BASE64, "base64"), { mode: 0o600 });
    const provision = profile(profileFile); push.validateProfile(provision);
    stage = "import signing identity";
    keychain = path.join(temporary, "native.keychain-db");
    const password = crypto.randomBytes(32).toString("hex");
    previousKeychains = [...command("security", ["list-keychains", "-d", "user"]).matchAll(/"([^"\r\n]+)"/g)].map(match => match[1]);
    command("security", ["create-keychain", "-p", password, keychain]);
    command("security", ["set-keychain-settings", "-lut", "21600", keychain]);
    command("security", ["unlock-keychain", "-p", password, keychain]);
    command("security", ["import", certificateFile, "-P", secrets.IOS_DISTRIBUTION_P12_PASSWORD, "-t", "cert", "-f", "pkcs12", "-k", keychain, "-T", "/usr/bin/codesign"]);
    command("security", ["set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-k", password, keychain]);
    command("security", ["list-keychains", "-d", "user", "-s", keychain, ...previousKeychains]);
    const identities = command("security", ["find-identity", "-v", "-p", "codesigning", keychain]);
    const matching = provision.DeveloperCertificates.map(value => new crypto.X509Certificate(Buffer.from(value, "base64")))
      .find(certificate => identities.includes(certificate.fingerprint.replaceAll(":", "")) && certificate.subject.includes("OU=" + teamId)
        && Date.parse(certificate.validTo) > Date.now());
    if (!matching) throw new Error("No matching trusted distribution certificate");
    const projectFile = path.join(directory, "TeleTypTelNative.xcodeproj/project.pbxproj");
    fs.writeFileSync(projectFile, signingProject(fs.readFileSync(projectFile, "utf8"), provision.UUID, matching.fingerprint.replaceAll(":", "")));
    const profileDirectory = path.join(os.homedir(), "Library/MobileDevice/Provisioning Profiles"); fs.mkdirSync(profileDirectory, { recursive: true });
    const destination = path.join(profileDirectory, provision.UUID + ".mobileprovision");
    fs.copyFileSync(profileFile, destination, fs.constants.COPYFILE_EXCL); installedProfile = destination;
    stage = "build signed archive";
    const icon = path.join(directory, "Assets.xcassets/AppIcon.appiconset/icon.png");
    command("swift", [path.join(__dirname, "ios-testflight/opaque-icon.swift"), icon]);
    if (!/hasAlpha: no/.test(command("sips", ["-g", "hasAlpha", icon]))) throw new Error("Invalid app icon");
    const archive = path.join(directory, "TeleTypTelNative.xcarchive");
    logged("xcodebuild", ["-project", path.join(directory, "TeleTypTelNative.xcodeproj"), "-scheme", "TeleTypTelNative", "-configuration", "Release",
      "-destination", "generic/platform=iOS", "-derivedDataPath", path.join(directory, "DerivedData"), "-archivePath", archive,
      "archive"], "archive.txt");
    stage = "verify signed app";
    const appPath = path.join(archive, "Products/Applications/TeleTypTelNative.app");
    const app = plist(path.join(appPath, "Info.plist"));
    const properties = JSON.parse(command("plutil", ["-extract", "ApplicationProperties", "json", "-o", "-", path.join(archive, "Info.plist")]));
    metadata.inspect({ app, archive: { ApplicationProperties: properties }, expected });
    validateApp(app, configured); validatePrivacy(plist(path.join(appPath, "PrivacyInfo.xcprivacy")));
    command("codesign", ["--verify", "--deep", "--strict", appPath]);
    const entitlements = command("codesign", ["-d", "--entitlements", ":-", appPath]);
    validateEntitlements(JSON.parse(command("plutil", ["-convert", "json", "-o", "-", "-"], entitlements)));
    const embedded = profile(path.join(appPath, "embedded.mobileprovision")); push.validateProfile(embedded);
    if (embedded.UUID !== provision.UUID) throw new Error("Wrong embedded profile");
    result.signed = true;
    stage = "export internal package";
    const exportJson = path.join(directory, "export.json"), exportPlist = path.join(directory, "export.plist"), output = path.join(directory, "export");
    fs.writeFileSync(exportJson, JSON.stringify({ method: "app-store-connect", destination: "export", signingStyle: "manual", signingCertificate: matching.fingerprint.replaceAll(":", ""),
      teamID: teamId, provisioningProfiles: { [bundleId]: provision.UUID }, manageAppVersionAndBuildNumber: false, uploadSymbols: false, testFlightInternalTestingOnly: true }));
    command("plutil", ["-convert", "xml1", "-o", exportPlist, exportJson]);
    logged("xcodebuild", ["-exportArchive", "-archivePath", archive, "-exportPath", output, "-exportOptionsPlist", exportPlist], "export.txt");
    const packages = fs.readdirSync(output).filter(name => name.endsWith(".ipa"));
    if (packages.length !== 1) throw new Error("Unexpected exported packages");
    stage = "upload internal TestFlight";
    const privateKeys = path.join(os.homedir(), ".appstoreconnect/private_keys"); fs.mkdirSync(privateKeys, { recursive: true, mode: 0o700 });
    const keyFile = path.join(privateKeys, "AuthKey_" + secrets.IOS_ASC_KEY_ID + ".p8");
    fs.writeFileSync(keyFile, secrets.IOS_ASC_KEY_P8, { flag: "wx", mode: 0o600 }); apiKeyFile = keyFile;
    logged("xcrun", ["altool", "--upload-app", "--type", "ios", "--file", path.join(output, packages[0]), "--apiKey", secrets.IOS_ASC_KEY_ID,
      "--apiIssuer", secrets.IOS_ASC_ISSUER_ID, "--output-format", "json"], "upload.txt");
    result.uploaded = true;
    result.processingAndCompliancePending = true;
    console.log("Signed native build uploaded for internal TestFlight; Apple processing and device acceptance remain required.");
  } catch {
    result.failedStage = stage;
    console.error("Native internal upload failed at: " + stage + ". Private build logs are not published.");
    process.exitCode = 1;
  } finally {
    for (const file of [apiKeyFile, installedProfile]) if (file) { try { fs.unlinkSync(file); } catch { result.cleanupWarning = true; } }
    if (keychain) {
      try { if (previousKeychains.length) command("security", ["list-keychains", "-d", "user", "-s", ...previousKeychains]); } catch { result.cleanupWarning = true; }
      try { command("security", ["delete-keychain", keychain]); } catch { result.cleanupWarning = true; }
    }
    if (temporary && path.dirname(temporary) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith("tc-native-signing-")) {
      try { fs.rmSync(temporary, { recursive: true, force: true }); } catch { result.cleanupWarning = true; }
    }
    if (result.cleanupWarning) process.exitCode = 1;
    fs.writeFileSync(path.join(reports, "result.json"), JSON.stringify(result, null, 2));
  }
}

if (require.main === module) { try { run(); } catch { console.error("Native internal upload unavailable: verify protected configuration."); process.exitCode = 1; } }
module.exports = { providers, validateEntitlements, validateApp, validatePrivacy, signingProject };
