const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Focused update checks new logic and unsigned SDK compilation, never simulator/media/upload", () => {
  const source = read("scripts/check-ios-native-update.js");
  assert.match(source, /NativeContactTests\|NativePresentationTests\|NativeServicesTests\.testNativeAvatar/);
  assert.match(source, /"--filter", result\.swiftTestFilter/);
  assert.match(source, /CODE_SIGNING_ALLOWED=NO/);
  assert.match(source, /generic\/platform=iOS/);
  assert.doesNotMatch(source, /simctl|build-for-testing|test-without-building|checkMedia\(|altool|notarytool|match\(|signingPackage/);
  const workflow = read(".github/workflows/ios-native-preview.yml");
  assert.match(workflow, /default: full/);
  assert.match(workflow, /node scripts\/check-ios-native\.js/);
  assert.match(workflow, /node scripts\/check-ios-native-update\.js/);
});

test("New views and bounded models are included without optional live capabilities", () => {
  const { projectText } = require("../scripts/prepare-ios-native");
  const text = projectText().project;
  for (const file of ["Core/NativeContactEditing.swift", "Core/NativePresentationPreferences.swift", "Core/NativeAvatarEditing.swift",
    "App/NativeNewContactView.swift", "App/NativeAppearanceView.swift", "App/NativeHistoryBrowserView.swift", "App/NativeAvatarEditorView.swift"]) assert.ok(text.includes(file), file);
  const avatar = read("mobile/ios-native/App/NativeAvatarEditorView.swift");
  assert.match(avatar, /read\(upToCount: 20 \* 1024 \* 1024 \+ 1\)/);
  assert.match(avatar, /format\.scale = 1/);
  assert.match(avatar, /Profielfoto opslaan/);
  assert.doesNotMatch(avatar, /requestAuthorization|PHPhotoLibrary\.shared|http:\/\//);
  assert.doesNotMatch(read("mobile/ios-native/App/Info.plist"), /aps-environment/);
});
