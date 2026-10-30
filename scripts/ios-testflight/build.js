const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { output, project } = require("./prepare");

const reports = path.join(output, "reports");
const secretNames = ["IOS_DISTRIBUTION_P12_BASE64", "IOS_DISTRIBUTION_P12_PASSWORD", "IOS_PROVISION_PROFILE_BASE64", "IOS_ASC_KEY_P8", "IOS_ASC_KEY_ID", "IOS_ASC_ISSUER_ID"];
const secrets = Object.fromEntries(secretNames.map(name => [name, process.env[name]]));
const environment = { ...process.env };
for (const name of Object.keys(environment)) if (name.startsWith("IOS_")) delete environment[name];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: project, env: environment, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 900000, ...options });
  if (result.error || result.status !== 0) throw new Error(path.basename(command) + " failed; check the build diagnostic log.");
  return result.stdout || "";
}

function logged(command, args, filename, options = {}) {
  const logfile = path.join(output, filename);
  const descriptor = fs.openSync(logfile, "w", 0o600);
  try { return run(command, args, { ...options, stdio: ["ignore", descriptor, descriptor] }); }
  catch (error) {
    let detail = fs.readFileSync(logfile, "utf8").split(/\r?\n/).filter(line => /error:|error\]|Error Domain|ERROR|BUILD FAILED|EXPORT FAILED/i.test(line)).slice(-12).join("\n");
    for (const value of Object.values(secrets)) if (value) detail = detail.split(value).join("[redacted]");
    console.error(detail.slice(-5000));
    throw error;
  } finally { fs.closeSync(descriptor); }
}

function parseProfile(xml) {
  return JSON.parse(run("python3", ["-c", "import sys,plistlib,json,base64; print(json.dumps(plistlib.loads(sys.stdin.buffer.read()), default=lambda value: base64.b64encode(value).decode() if isinstance(value,bytes) else value.isoformat()))"], { input: xml }));
}

function validateProfile(profile, config) {
  if (!profile.TeamIdentifier?.includes(config.teamId)
      || profile.Entitlements?.["application-identifier"] !== config.teamId + "." + config.bundleId
      || profile.Entitlements?.["com.apple.developer.team-identifier"] !== config.teamId
      || profile.Entitlements?.["get-task-allow"] !== false
      || profile.ProvisionedDevices || profile.ProvisionsAllDevices
      || !profile.DeveloperCertificates?.length || !/^[a-f0-9-]{36}$/i.test(profile.UUID)
      || !Number.isFinite(Date.parse(profile.ExpirationDate)) || Date.parse(profile.ExpirationDate) <= Date.now()) {
    throw new Error("Provisioning profile is not valid for this App Store Connect app.");
  }
}

async function build() {
  if (process.platform !== "darwin") throw new Error("This build requires the GitHub macOS runner.");
  const upload = process.argv.includes("--upload-internal");
  if (!upload && !process.argv.includes("--unsigned")) throw new Error("Choose --unsigned or --upload-internal explicitly.");
  if (upload && secretNames.some(name => !secrets[name])) throw new Error("Missing protected environment secrets");
  process.umask(0o077);
  fs.mkdirSync(reports, { recursive: true });
  const config = JSON.parse(fs.readFileSync(path.join(output, "settings.json"), "utf8"));
  const result = { bundleId: config.bundleId, version: "1.0", buildNumber: config.buildNumber, internalTestOnly: true, uploaded: false, passed: false };
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "teletyptel-signing-"));
  const keychain = path.join(temporary, "signing.keychain-db");
  let installedProfile;
  let apiKeyFile;
  try {
    fs.writeFileSync(path.join(reports, "xcode-version.txt"), run("xcodebuild", ["-version"]));
    fs.copyFileSync(path.join(output, "source.json"), path.join(reports, "source.json"));
    logged(process.execPath, [path.join(__dirname, "node_modules/@capacitor/cli/bin/capacitor"), "sync", "ios"], "capacitor-sync.log");
    require("./google-signin").configureGooglePackage(project);
    const bundledStart = path.join(project, "ios/App/App/public", config.capacitor.server.appStartPath.replace(/^\/+/, ""));
    if (!fs.existsSync(bundledStart)) throw new Error("Missing native startup asset; Capacitor would exit before connecting");
    run("swift", [path.join(__dirname, "opaque-icon.swift"), path.join(project, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")]);
    const alpha = run("sips", ["-g", "hasAlpha", path.join(project, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")]);
    if (!/hasAlpha: no/.test(alpha)) throw new Error("App Store icon must be opaque");
    const projectFile = path.join(project, "ios/App/App.xcodeproj/project.pbxproj");
    let projectText = fs.readFileSync(projectFile, "utf8").replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, "CURRENT_PROJECT_VERSION = " + config.buildNumber + ";");
    const archive = path.join(output, "TeleTypTel.xcarchive");
    const buildArgs = ["-project", "ios/App/App.xcodeproj", "-scheme", "App", "-configuration", "Release", "-destination", "generic/platform=iOS", "-derivedDataPath", path.join(output, "DerivedData")];
    let profile;
    if (upload) {
      const certificateFile = path.join(temporary, "distribution.p12");
      const profileFile = path.join(temporary, "app-store.mobileprovision");
      fs.writeFileSync(certificateFile, Buffer.from(secrets.IOS_DISTRIBUTION_P12_BASE64, "base64"), { mode: 0o600 });
      fs.writeFileSync(profileFile, Buffer.from(secrets.IOS_PROVISION_PROFILE_BASE64, "base64"), { mode: 0o600 });
      profile = parseProfile(run("security", ["cms", "-D", "-i", profileFile]));
      validateProfile(profile, config);
      const password = crypto.randomBytes(32).toString("hex");
      run("security", ["create-keychain", "-p", password, keychain]);
      run("security", ["set-keychain-settings", "-lut", "21600", keychain]);
      run("security", ["unlock-keychain", "-p", password, keychain]);
      run("security", ["import", certificateFile, "-P", secrets.IOS_DISTRIBUTION_P12_PASSWORD, "-t", "cert", "-f", "pkcs12", "-k", keychain, "-T", "/usr/bin/codesign"]);
      run("security", ["set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-k", password, keychain]);
      run("security", ["list-keychains", "-d", "user", "-s", keychain]);
      const identities = run("security", ["find-identity", "-v", "-p", "codesigning", keychain]);
      const matchingCertificate = profile.DeveloperCertificates.map(value => new crypto.X509Certificate(Buffer.from(value, "base64")))
        .find(certificate => identities.includes(certificate.fingerprint.replaceAll(":", "")) && certificate.subject.includes("OU=" + config.teamId));
      if (!matchingCertificate) throw new Error("No trusted signing identity matches this profile");
      const profileDirectory = path.join(os.homedir(), "Library/MobileDevice/Provisioning Profiles");
      fs.mkdirSync(profileDirectory, { recursive: true });
      const profileDestination = path.join(profileDirectory, profile.UUID + ".mobileprovision");
      fs.copyFileSync(profileFile, profileDestination, fs.constants.COPYFILE_EXCL);
      installedProfile = profileDestination;
      projectText = projectText.replace(/CODE_SIGN_STYLE = Automatic;/g, "CODE_SIGN_STYLE = Manual;\n\t\t\t\tCODE_SIGN_IDENTITY = \"Apple Distribution\";\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = \"" + profile.UUID + "\";");
      if (!projectText.includes("DEVELOPMENT_TEAM = " + config.teamId + ";")) throw new Error("Native project team is not configured");
    }
    fs.writeFileSync(projectFile, projectText);
    if (!upload) {
      logged("xcodebuild", [...buildArgs, "CODE_SIGNING_ALLOWED=NO", "build"], "xcode-build.log");
      await require("./launch-smoke").launchSmoke({ run, logged, config, reports });
      result.passed = true;
      result.scope = "unsigned device compilation and Release Simulator startup regression; no physical iPhone network or media verification";
    } else {
      logged("xcodebuild", [...buildArgs, "-archivePath", archive, "archive"], "xcode-archive.log");
      const app = path.join(archive, "Products/Applications/App.app");
      run("codesign", ["--verify", "--deep", "--strict", app]);
      if (run("plutil", ["-extract", "CFBundleIdentifier", "raw", "-o", "-", path.join(app, "Info.plist")]).trim() !== config.bundleId) throw new Error("Archived wrong bundle ID");
      const exportJson = path.join(output, "export-options.json");
      const exportPlist = path.join(output, "export-options.plist");
      fs.writeFileSync(exportJson, JSON.stringify({ method: "app-store-connect", destination: "export", signingStyle: "manual", signingCertificate: "Apple Distribution", teamID: config.teamId,
        provisioningProfiles: { [config.bundleId]: profile.UUID }, manageAppVersionAndBuildNumber: false, uploadSymbols: false, testFlightInternalTestingOnly: true }));
      run("plutil", ["-convert", "xml1", "-o", exportPlist, exportJson]);
      const exportDirectory = path.join(output, "export");
      logged("xcodebuild", ["-exportArchive", "-archivePath", archive, "-exportPath", exportDirectory, "-exportOptionsPlist", exportPlist], "xcode-export.log");
      const packages = fs.readdirSync(exportDirectory).filter(file => file.endsWith(".ipa"));
      if (packages.length !== 1) throw new Error("Expected one signed iPhone IPA");
      if (!/^[A-Z0-9]{10}$/.test(secrets.IOS_ASC_KEY_ID) || !/^[a-f0-9-]{36}$/i.test(secrets.IOS_ASC_ISSUER_ID)) throw new Error("Invalid Apple API identifiers");
      const privateKeys = path.join(os.homedir(), ".appstoreconnect/private_keys");
      fs.mkdirSync(privateKeys, { recursive: true, mode: 0o700 });
      const keyDestination = path.join(privateKeys, "AuthKey_" + secrets.IOS_ASC_KEY_ID + ".p8");
      fs.writeFileSync(keyDestination, secrets.IOS_ASC_KEY_P8, { flag: "wx", mode: 0o600 });
      apiKeyFile = keyDestination;
      logged("xcrun", ["altool", "--upload-app", "--type", "ios", "--file", path.join(exportDirectory, packages[0]), "--apiKey", secrets.IOS_ASC_KEY_ID, "--apiIssuer", secrets.IOS_ASC_ISSUER_ID, "--output-format", "json"], "apple-upload.log");
      result.uploaded = true;
      result.passed = true;
      result.scope = "signed internal TestFlight upload; Apple processing and physical iPhone tests still required";
    }
  } catch (error) {
    result.error = error.message;
    throw error;
  } finally {
    fs.writeFileSync(path.join(reports, "result.json"), JSON.stringify(result, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "### TeleTypTel iOS\n```json\n" + JSON.stringify(result, null, 2) + "\n```\n");
    if (apiKeyFile && fs.existsSync(apiKeyFile)) fs.unlinkSync(apiKeyFile);
    if (installedProfile && fs.existsSync(installedProfile)) fs.unlinkSync(installedProfile);
    if (fs.existsSync(keychain)) { try { run("security", ["delete-keychain", keychain]); } catch { console.error("Runner keychain cleanup failed; runner disposal is required."); } }
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (require.main === module) build().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { validateProfile };
