const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "mobile/ios-native");
const coreFiles = ["Startup.swift", "XMPPProbeStream.swift", "XMPPAvailabilityClient.swift",
  "NativeAccountClient.swift", "XMPPSessionStream.swift", "NativeXMPPConnection.swift", "NativeLoginModel.swift", "NativeRoster.swift"];

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
  for (const file of ["App/TeleTypTelNativeApp.swift", ...coreFiles.map(file => "Core/" + file)]) {
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
  const appPhases = [phase("sources", "PBXSourcesBuildPhase", buildFiles), phase("frameworks", "PBXFrameworksBuildPhase", []), phase("resources", "PBXResourcesBuildPhase", [assetBuild])];
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
  const target = object("target", `{isa = PBXNativeTarget; name = TeleTypTelNative; productName = TeleTypTelNative; productType = "com.apple.product-type.application"; productReference = ${app}; buildConfigurationList = ${appConfigs}; buildPhases = ${list(appPhases)}; dependencies = (); buildRules = ();}`);
  const testTarget = object("test-target", `{isa = PBXNativeTarget; name = NativeStartupUITests; productName = NativeStartupUITests; productType = "com.apple.product-type.bundle.ui-testing"; productReference = ${tests}; buildConfigurationList = ${testConfigs}; buildPhases = ${list(testPhases)}; dependencies = ${list([dependency])}; buildRules = ();}`);
  object("project", `{isa = PBXProject; attributes = {LastUpgradeCheck = 1600;}; buildConfigurationList = ${projectConfigs}; compatibilityVersion = "Xcode 14.0"; developmentRegion = nl; knownRegions = (nl, en, Base); mainGroup = ${main}; productRefGroup = ${products}; projectDirPath = ""; projectRoot = ""; targets = ${list([target, testTarget])};}`);
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

function prepare(name) {
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
  for (const file of ["App/TeleTypTelNativeApp.swift", "App/Info.plist", "UITests/NativeStartupUITests.swift"]) {
    write(file, fs.readFileSync(path.join(source, file)));
  }
  write("Assets.xcassets/Contents.json", JSON.stringify({ info: { author: "xcode", version: 1 } }));
  write("Assets.xcassets/TeleTypTelLogo.imageset/logo.png", fs.readFileSync(path.join(root, "php/public/assets/brand/teletyptel-logo-header@2x.png")));
  write("Assets.xcassets/TeleTypTelLogo.imageset/Contents.json", JSON.stringify({ images: [{ idiom: "universal", filename: "logo.png", scale: "2x" }], info: { author: "xcode", version: 1 } }));
  const generated = projectText();
  write("TeleTypTelNative.xcodeproj/project.pbxproj", generated.project);
  write("TeleTypTelNative.xcodeproj/xcshareddata/xcschemes/TeleTypTelNative.xcscheme", generated.scheme);
  return directory;
}

if (require.main === module) console.log(prepare(process.argv[2]));
module.exports = { prepare, projectText };
