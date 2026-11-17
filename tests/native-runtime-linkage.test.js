"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { projectText } = require("../scripts/prepare-ios-native");
const runtime = require("../scripts/native-runtime-linkage");
const startup = require("../scripts/native-release-startup");
const dependency = "@rpath/WebRTC.framework/WebRTC";
const loadCommands = "Load command 9\n          cmd LC_RPATH\n      cmdsize 48\n         path @executable_path/Frameworks (offset 12)\n";
const root = path.resolve(__dirname, "..");

test("Debug and Release app targets retain inherited paths and resolve the embedded WebRTC framework", () => {
  for (const options of [{}, { pushTest: { bundleId: "com.tiedragon.teletyptel", environment: "production", testOnly: true },
    archive: { version: "1.0", buildNumber: "17.2" } }]) {
    const source = projectText(options).project;
    assert.equal(source.split('LD_RUNPATH_SEARCH_PATHS = ("$(inherited)", "@executable_path/Frameworks");').length, 3);
  }
  assert.deepEqual(runtime.runpaths(loadCommands), ["@executable_path/Frameworks"]);
  assert.deepEqual(runtime.runpaths(loadCommands.replaceAll("\n", "\r\n")), ["@executable_path/Frameworks"]);
  assert.deepEqual(runtime.runpaths("cmd LC_RPATH\n cmdsize 40\n path /usr/lib/swift (offset 12)\n"), ["/usr/lib/swift"]);
  assert.deepEqual(runtime.runpaths("cmd LC_LOAD_DYLIB\n cmdsize 40\n path @executable_path/Frameworks (offset 12)\n"), []);
});

test("Runtime inspection rejects the observed device crash even when WebRTC was copied into the app", context => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "tc-runtime-linkage-"));
  const app = path.join(temporary, "TeleTypTelNative.app");
  const frameworks = path.join(app, "Frameworks"), framework = path.join(frameworks, "WebRTC.framework");
  fs.mkdirSync(framework, { recursive: true });
  const executable = path.join(app, "TeleTypTelNative"), library = path.join(framework, "WebRTC");
  fs.writeFileSync(executable, "fixture"); fs.writeFileSync(library, "fixture");
  context.after(() => {
    for (const file of [executable, library]) if (fs.existsSync(file)) fs.unlinkSync(file);
    for (const directory of [framework, frameworks, app, temporary]) fs.rmdirSync(directory);
  });
  const execute = (changes = {}) => (command, args) => {
    if (command === "otool" && args[0] === "-l" && args[1] === executable) return changes.paths ?? loadCommands;
    if (command === "otool" && args[0] === "-L" && args[1] === executable) return changes.dependency ?? "app:\n\t" + dependency + " (compatibility version 0.0.0, current version 0.0.0)\n";
    if (command === "otool" && args[0] === "-D" && args[1] === library) return changes.installName ?? "framework:\n" + dependency + "\n";
    if (command === "lipo" && args[0] === "-archs" && args[1] === executable) return changes.appArchitecture ?? "arm64\n";
    if (command === "lipo" && args[0] === "-archs" && args[1] === library) return changes.frameworkArchitecture ?? "arm64\n";
    throw new Error("Unexpected binary inspection command");
  };
  assert.deepEqual(runtime.inspect(app, execute()), { webRTCEmbedded: true, frameworkRunpath: true, deviceArchitecture: "arm64" });
  for (const change of [{ paths: "cmd LC_RPATH\ncmdsize 40\npath /usr/lib/swift (offset 12)\n" },
    { paths: loadCommands.replace("@executable_path/Frameworks", "/runner/build/Frameworks") },
    { dependency: "app:\n\t/runner/build/WebRTC.framework/WebRTC (compatibility version 0.0.0)" },
    { installName: "framework:\n/runner/build/WebRTC.framework/WebRTC\n" },
    { appArchitecture: "x86_64" }, { frameworkArchitecture: "x86_64" }]) {
    assert.throws(() => runtime.inspect(app, execute(change)));
  }
  fs.unlinkSync(library);
  assert.throws(() => runtime.inspect(app, execute()));
});

test("Release startup requires a real UI assertion and propagates build, boot and launch failures", () => {
  const device = { name: "iPhone 17 Pro", udid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", isAvailable: true,
    deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro" };
  for (const failure of [null, "release-startup-create", "release-startup-build", "release-startup-boot", "release-startup-window", "release-startup-display", "release-startup-test"]) {
    const calls = []; let collected = 0;
    const logged = (name, command, args) => {
      calls.push({ name, command, args });
      if (name === failure) throw new Error("fixture failure");
      if (name === "release-startup-developer-directory") return "/fixture/Xcode.app/Contents/Developer\n";
      if (name === "release-startup-create") return "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb\n";
      return name === "release-simulator-inventory" ? JSON.stringify({ devices: { "com.apple.CoreSimulator.SimRuntime.iOS-26-2": [device] } }) : "";
    };
    const operation = () => startup.check({ directory: "/fixture", reports: "/fixture/reports", family: "iPhone", logged,
      collect: () => { collected++; } });
    if (failure) assert.throws(operation, /fixture failure/);
    else {
      const result = operation();
      assert.equal(result.startupUIVisible, true); assert.equal(result.configuration, "Release");
      assert.equal(result.physicalDeviceTested, false);
      assert.equal(result.freshSimulator, true);
      assert.ok(calls.findIndex(call => call.name === "release-startup-display") < calls.findIndex(call => call.name === "release-startup-build"));
      const launch = calls.find(call => call.name === "release-startup-test");
      assert.ok(launch.args.includes("test-without-building"));
      assert.ok(launch.args.includes("-only-testing:NativeStartupUITests/NativeStartupUITests/testStartupDoesNotOpenKeyboardOrShowAuthenticatedState"));
      assert.ok(launch.args.includes("Release")); assert.ok(!launch.args.includes("Debug"));
      assert.ok(launch.args.includes("platform=iOS Simulator,id=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"));
    }
    assert.equal(collected, 1);
  }
  assert.throws(() => startup.check({ family: "other" }), /Select one/);
});

test("Archive and exported IPA linkage checks run before upload and no signing material is published", () => {
  const read = file => fs.readFileSync(path.join(root, file), "utf8");
  const release = read("scripts/native-internal-release.js");
  assert.ok(release.indexOf("result.archiveRuntime = runtime.inspect") < release.indexOf('stage = "export internal package"'));
  assert.ok(release.indexOf("result.exportedRuntime = runtime.inspect") < release.indexOf('stage = "upload internal TestFlight"'));
  assert.match(release, /"ditto", \["-x", "-k"/);
  assert.match(release, /codesign", \["--verify", "--deep", "--strict", exportedApp\]/);
  const archive = read("scripts/check-ios-native-archive.js");
  assert.match(archive, /result.runtimeLinkage = runtime.inspect/);
  assert.match(archive, /result.releaseStartup = startup.check/);
  const workflow = read(".github/workflows/ios-native-preview.yml");
  assert.match(workflow, /needs: native-preview/);
  assert.match(workflow, /node --test tests\/native-archive.test.js tests\/native-internal-release.test.js tests\/native-runtime-linkage.test.js/);
  assert.match(workflow, /name: ios-native-preview-\$\{\{ github.run_id \}\}-\$\{\{ matrix.family \}\}-attempt-\$\{\{ github.run_attempt \}\}/);
  assert.match(workflow, /name: native-internal-upload-\$\{\{ github.run_id \}\}-attempt-\$\{\{ github.run_attempt \}\}/);
  assert.doesNotMatch(workflow, /overwrite: true/);
});

test("Native workflow pins verified Node 24 action runtimes without changing the build's Node version or hiding warnings", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ios-native-preview.yml"), "utf8");
  const pins = new Map([
    ["actions/checkout", "fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09"],
    ["actions/setup-node", "249970729cb0ef3589644e2896645e5dc5ba9c38"],
    ["actions/upload-artifact", "b7c566a772e6b6bfb58ed0dc250532a479d7789f"]
  ]);
  const actions = [...workflow.matchAll(/uses: (actions\/[a-z-]+)@([^\s]+)/g)];
  assert.equal(actions.length, 6);
  for (const [action, commit] of pins) {
    const references = actions.filter(match => match[1] === action);
    assert.equal(references.length, 2);
    for (const reference of references) assert.equal(reference[2], commit);
  }
  assert.equal((workflow.match(/node-version: 22/g) ?? []).length, 2);
  assert.doesNotMatch(workflow, /11d5960a326750d5838078e36cf38b85af677262|49933ea5288caeca8642d1e84afbd3f7d6820020|ea165f8d65b6e75b540449e92b4886f43607fa02/);
  assert.doesNotMatch(workflow, /ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION|FORCE_JAVASCRIPT_ACTIONS_TO_NODE24|persist-credentials: true/);
});
