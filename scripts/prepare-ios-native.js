const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const webRTC = require("./ios-testflight/native-webrtc");
const { providerPlist } = require("./native-provider-config");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "mobile/ios-native");
const coreFiles = ["Startup.swift", "XMPPProbeStream.swift", "XMPPAvailabilityClient.swift",
  "NativeAccountClient.swift", "NativeAccountWebSession.swift", "NativeSocialAccountClient.swift", "NativeTranslation.swift", "NativeTwoFactorAccountClient.swift", "XMPPSessionStream.swift", "NativeXMPPConnection.swift", "NativeLoginModel.swift", "NativeSavedLogin.swift", "NativeRoster.swift", "NativeChat.swift", "NativeArchive.swift", "NativeMUC.swift", "NativeGroupModel.swift", "NativeGroupInvitations.swift", "NativeIncomingCall.swift", "NativeCallCoordinator.swift", "NativeJingleTransport.swift", "NativeJingleMedia.swift", "NativeLocalMediaSDP.swift", "NativeJingleSession.swift"];
const appFiles = ["App/TeleTypTelNativeApp.swift", "App/NativeInvitationViews.swift", "App/NativeGroupsView.swift", "App/NativeProviderSDK.swift", "App/NativeTranslationView.swift", "App/NativeBiometricLoginVault.swift", "App/NativeChatView.swift", "App/NativeBackgroundController.swift", "App/NativeCallPlatform.swift", "App/NativeCallMedia.swift", "App/NativeCallController.swift", "App/NativeTotalConversationView.swift", "App/NativeMediaCapture.swift", "App/NativeMediaPeer.swift", "App/NativeActivePeerNegotiating.swift", "App/NativeIncomingPeerNegotiator.swift", "App/NativeOutgoingPeerNegotiator.swift"];
const mediaFiles = ["NativeT140Session.swift", "NativeWebRTCChannel.swift"];
coreFiles.push("NativeGroupManagement.swift", "NativeAccountFeatures.swift", "NativeMessageActions.swift", "NativeAvatars.swift", "NativeChatInteractions.swift", "NativeHistory.swift", "NativeDialing.swift");
appFiles.push("App/NativeGroupManagementView.swift", "App/NativeAccountSettingsView.swift", "App/NativeAttachmentsView.swift", "App/NativeFeatureFixture.swift", "App/NativeWebStyle.swift", "App/NativeMessageActionsView.swift", "App/NativeDeviceHistory.swift", "App/NativeChatEnhancements.swift", "App/NativeDialerView.swift");

function projectText() {
  const objects = new Map();
  const identifier = name => crypto.createHash("sha256").update("teletyptel-native:" + name).digest("hex").slice(0, 24).toUpperCase();
  const quote = value => JSON.stringify(value);
  const list = values => "(" + values.join(", ") + ")";
  const object = (name, value) => {
    const key = identifier(name);
    if (objects.has(key)) throw new Error("Duplicate Xcode object");
    objects.set(key, value);
    return key;
  };
  const refs = [];
  const buildFiles = [];
  for (const file of [...appFiles, ...coreFiles.map(file => "Core/" + file), ...mediaFiles.map(file => "Media/" + file)]) {
    const ref = object(file, `{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ${quote(file)}; sourceTree = "<group>";}`);
    refs.push(ref);
    buildFiles.push(object(file + "-build", `{isa = PBXBuildFile; fileRef = ${ref};}`));
  }
  const assets = object("assets", '{isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>";}');
  refs.push(assets);
  const assetBuild = object("assets-build", `{isa = PBXBuildFile; fileRef = ${assets};}`);
  const testRef = object("test-file", '{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = UITests/NativeStartupUITests.swift; sourceTree = "<group>";}');
  refs.push(testRef);
  const testBuild = object("test-build", `{isa = PBXBuildFile; fileRef = ${testRef};}`);
  const app = object("app", '{isa = PBXFileReference; explicitFileType = wrapper.application; path = TeleTypTelNative.app; sourceTree = BUILT_PRODUCTS_DIR;}');
  const tests = object("tests", '{isa = PBXFileReference; explicitFileType = wrapper.cfbundle; path = NativeStartupUITests.xctest; sourceTree = BUILT_PRODUCTS_DIR;}');
  const products = object("products", `{isa = PBXGroup; name = Products; children = ${list([app, tests])}; sourceTree = "<group>";}`);
  const main = object("main", `{isa = PBXGroup; children = ${list([...refs, products])}; sourceTree = "<group>";}`);
  const phase = (name, type, files) => object(name, `{isa = ${type}; buildActionMask = 2147483647; files = ${list(files)}; runOnlyForDeploymentPostprocessing = 0;}`);
  const rtcPackage = object("webrtc-package", `{isa = XCRemoteSwiftPackageReference; repositoryURL = "https://github.com/stasel/WebRTC.git"; requirement = {kind = revision; revision = ${quote(webRTC.revision)};};}`);
  const rtcProduct = object("webrtc-product", `{isa = XCSwiftPackageProductDependency; package = ${rtcPackage}; productName = WebRTC;}`);
  const rtcBuild = object("webrtc-build", `{isa = PBXBuildFile; productRef = ${rtcProduct};}`);
  const providerPackages = [];
  const providerProducts = [];
  const providerBuilds = [];
  for (const [name, url, version, products] of [
    ["google", "https://github.com/google/GoogleSignIn-iOS.git", "9.0.0", ["GoogleSignIn"]],
    ["facebook", "https://github.com/meta/facebook-ios-sdk.git", "18.1.1", ["FacebookCore", "FacebookLogin"]]
  ]) {
    const pkg = object(name + "-package", `{isa = XCRemoteSwiftPackageReference; repositoryURL = ${quote(url)}; requirement = {kind = exactVersion; version = ${quote(version)};};}`);
    providerPackages.push(pkg);
    for (const name of products) {
      const product = object(name + "-product", `{isa = XCSwiftPackageProductDependency; package = ${pkg}; productName = ${quote(name)};}`);
      providerProducts.push(product);
      providerBuilds.push(object(name + "-build", `{isa = PBXBuildFile; productRef = ${product};}`));
    }
  }
  const appPhases = [phase("sources", "PBXSourcesBuildPhase", buildFiles), phase("frameworks", "PBXFrameworksBuildPhase", [rtcBuild, ...providerBuilds]), phase("resources", "PBXResourcesBuildPhase", [assetBuild])];
  const testPhases = [phase("test-sources", "PBXSourcesBuildPhase", [testBuild]), phase("test-frameworks", "PBXFrameworksBuildPhase", []), phase("test-resources", "PBXResourcesBuildPhase", [])];
  const configurations = (name, settings) => {
    const configs = ["Debug", "Release"].map(mode => object(name + mode,
      `{isa = XCBuildConfiguration; name = ${mode}; buildSettings = {${settings} SWIFT_OPTIMIZATION_LEVEL = ${quote(mode === "Debug" ? "-Onone" : "-O")}; SWIFT_ACTIVE_COMPILATION_CONDITIONS = ${quote(mode === "Debug" ? "DEBUG" : "")};};}`));
    return object(name + "-configs", `{isa = XCConfigurationList; buildConfigurations = ${list(configs)}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;}`);
  };
  const common = 'IPHONEOS_DEPLOYMENT_TARGET = 16.0; SDKROOT = iphoneos; SWIFT_VERSION = 5.0; CLANG_ENABLE_MODULES = YES; TARGETED_DEVICE_FAMILY = "1,2"; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; CODE_SIGNING_ALLOWED = NO;';
  const projectConfigs = configurations("project", common);
  const appConfigs = configurations("app", 'PRODUCT_NAME = TeleTypTelNative; PRODUCT_BUNDLE_IDENTIFIER = com.tiedragon.teletyptel.nativepreview; INFOPLIST_FILE = App/Info.plist;');
  const testConfigs = configurations("test", 'PRODUCT_NAME = NativeStartupUITests; PRODUCT_BUNDLE_IDENTIFIER = com.tiedragon.teletyptel.nativepreview.uitests; GENERATE_INFOPLIST_FILE = YES; TEST_TARGET_NAME = TeleTypTelNative;');
  const proxy = object("proxy", `{isa = PBXContainerItemProxy; containerPortal = ${identifier("project")}; proxyType = 1; remoteGlobalIDString = ${identifier("target")}; remoteInfo = TeleTypTelNative;}`);
  const dependency = object("test-dependency", `{isa = PBXTargetDependency; target = ${identifier("target")}; targetProxy = ${proxy};}`);
  const target = object("target", `{isa = PBXNativeTarget; name = TeleTypTelNative; productName = TeleTypTelNative; productType = "com.apple.product-type.application"; productReference = ${app}; buildConfigurationList = ${appConfigs}; buildPhases = ${list(appPhases)}; packageProductDependencies = ${list([rtcProduct, ...providerProducts])}; dependencies = (); buildRules = ();}`);
  const testTarget = object("test-target", `{isa = PBXNativeTarget; name = NativeStartupUITests; productName = NativeStartupUITests; productType = "com.apple.product-type.bundle.ui-testing"; productReference = ${tests}; buildConfigurationList = ${testConfigs}; buildPhases = ${list(testPhases)}; dependencies = ${list([dependency])}; buildRules = ();}`);
  object("project", `{isa = PBXProject; attributes = {LastUpgradeCheck = 1600;}; buildConfigurationList = ${projectConfigs}; compatibilityVersion = "Xcode 14.0"; developmentRegion = nl; knownRegions = (nl, en, Base); mainGroup = ${main}; productRefGroup = ${products}; projectDirPath = ""; projectRoot = ""; packageReferences = ${list([rtcPackage, ...providerPackages])}; targets = ${list([target, testTarget])};}`);
  const project = `// !$*UTF8*$!\n{archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n${[...objects].map(([key, value]) => `${key} = ${value};`).join("\n")}\n}; rootObject = ${identifier("project")};}\n`;
  const reference = (id, file, name) => `<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${id}" BuildableName="${file}" BlueprintName="${name}" ReferencedContainer="container:TeleTypTelNative.xcodeproj"/>`;
  const appReference = reference(target, "TeleTypTelNative.app", "TeleTypTelNative");
  const scheme = `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries>
<BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES">${appReference}</BuildActionEntry>
</BuildActionEntries></BuildAction>
<TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO">${reference(testTarget, "NativeStartupUITests.xctest", "NativeStartupUITests")}</TestableReference></Testables></TestAction>
<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="NO"><BuildableProductRunnable runnableDebuggingMode="0">${appReference}</BuildableProductRunnable></LaunchAction>
<AnalyzeAction buildConfiguration="Debug"/>
</Scheme>`;
  return { project, scheme };
}

function prepare(name, { providers = null } = {}) {
  if (!/^ios-native-[a-z0-9-]+$/.test(name || "")) throw new Error("Use an isolated ios-native-* staging name");
  const directory = path.join(root, "artifacts", name);
  if (fs.existsSync(directory)) throw new Error("Staging already exists; choose a fresh name");
  const write = (file, content) => {
    const target = path.resolve(directory, file);
    if (!target.startsWith(directory + path.sep)) throw new Error("Invalid staging path");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  for (const file of coreFiles) write("Core/" + file, fs.readFileSync(path.join(source, "Sources/TeleTypTelCore", file)));
  for (const file of mediaFiles) write("Media/" + file, fs.readFileSync(path.join(root, "scripts/ios-testflight", file)));
  for (const file of [...appFiles, "App/Info.plist", "UITests/NativeStartupUITests.swift"]) {
    const content = fs.readFileSync(path.join(source, file));
    write(file, file === "App/Info.plist" ? providerPlist(content.toString("utf8"), providers) : content);
  }
  write("Assets.xcassets/Contents.json", JSON.stringify({ info: { author: "xcode", version: 1 } }));
  write("Assets.xcassets/TeleTypTelLogo.imageset/logo.png", fs.readFileSync(path.join(root, "php/public/assets/brand/teletyptel-logo-header@2x.png")));
  write("Assets.xcassets/TeleTypTelLogo.imageset/Contents.json", JSON.stringify({ images: [{ idiom: "universal", filename: "logo.png", scale: "2x" }], info: { author: "xcode", version: 1 } }));
  for (const [name, file] of [["ChatBackground", "teletyptel-bg-mobile.png"], ["ChatBackgroundWide", "teletyptel-bg-wide-1.png"]]) {
    write(`Assets.xcassets/${name}.imageset/background.png`, fs.readFileSync(path.join(root, "php/public/assets/backgrounds", file)));
    write(`Assets.xcassets/${name}.imageset/Contents.json`, JSON.stringify({ images: [{ idiom: "universal", filename: "background.png" }], info: { author: "xcode", version: 1 } }));
  }
  const generated = projectText();
  write("TeleTypTelNative.xcodeproj/project.pbxproj", generated.project);
  write("TeleTypTelNative.xcodeproj/xcshareddata/xcschemes/TeleTypTelNative.xcscheme", generated.scheme);
  return directory;
}

if (require.main === module) {
  const providers = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], "utf8")) : null;
  console.log(prepare(process.argv[2], { providers }));
}
module.exports = { prepare, projectText };
