"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { catalogue, sources, assets } = require("../scripts/native-smiley-assets");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Native smileys use the complete ordered web catalogue, including aliases and SVG fallbacks", () => {
  const entries = catalogue(read("php/public/chat-client.js"));
  assert.equal(entries.length, 41);
  assert.deepEqual(entries.slice(0, 6).map(entry => entry.name), ["biggrin", "bonk", "bonk3", "bye", "clown", "confused"]);
  assert.deepEqual(entries.find(entry => entry.name === "worshippy").codes, ["_/-\\o_", "_o_"]);
  assert.deepEqual(entries.find(entry => entry.name === "puh").codes, [":>", ":*"]);
  const resolved = sources(root);
  assert.ok(resolved.filter(entry => !entry.animated).every(entry => !entry.data.toString("utf8").includes("\r\n")));
  assert.equal(resolved.find(entry => entry.name === "smile").fileName, "smile.svg");
  assert.equal(resolved.find(entry => entry.name === "bonk").fileName, "bonk.gif");
  assert.throws(() => catalogue("const smiles = [];"), /not found/);
  const fixture = rows => "const smiles = " + JSON.stringify(rows, null, 2).replace(/\n\]$/, "\n  ]") + ".map(";
  assert.throws(() => catalogue(fixture([["smile", "../smile.svg", [":)"]]])), /Invalid/);
  assert.throws(() => catalogue(fixture([["smile", "smile.svg", [":)"]], ["wink", "wink.svg", [":)"]]])), /Invalid/);
});

test("Staged native images are original GIF bytes or verified rasterizations of the current web SVGs", () => {
  const generated = assets(root);
  const entries = JSON.parse(generated["Assets.xcassets/WebSmileyCatalogue.dataset/catalogue.json"]);
  const digest = data => crypto.createHash("sha256").update(data).digest("hex");
  const manifest = JSON.parse(read("mobile/ios-native/Resources/Smileys/manifest.json"));
  assert.equal(manifest.renderer, "@resvg/resvg-js@2.6.2");
  for (const entry of sources(root)) {
    assert.deepEqual(entries.find(value => value.name === entry.name).codes, entry.codes);
    if (entry.animated) {
      assert.ok(generated[`Assets.xcassets/${entry.assetName}.dataset/smiley.gif`].equals(entry.data));
      assert.equal(JSON.parse(generated[`Assets.xcassets/${entry.assetName}.dataset/Contents.json`]).data[0].idiom, "universal");
    } else {
      const png = generated[`Assets.xcassets/${entry.assetName}.imageset/smiley.png`];
      assert.equal(png.subarray(1, 4).toString(), "PNG");
      assert.equal(png.readUInt32BE(16), 96);
      assert.ok(png.readUInt32BE(20) > 0 && png.readUInt32BE(20) <= 256);
      assert.equal(manifest.entries[entry.name].sourceSHA256, digest(entry.data));
      assert.equal(manifest.entries[entry.name].pngSHA256, digest(png));
      assert.equal(JSON.parse(generated[`Assets.xcassets/${entry.assetName}.imageset/Contents.json`]).properties["template-rendering-intent"], "original");
    }
  }
  assert.match(read("scripts/prepare-ios-native.js"), /require\("\.\/native-smiley-assets"\)\.assets\(root\)/);
  assert.match(read("scripts/prepare-ios-native.js"), /appFiles.push\("App\/NativeSmileys.swift"\)/);
});

test("Direct and group chats share the image picker and insert text codes without sending or changing reactions", () => {
  for (const file of ["NativeChatView.swift", "NativeGroupsView.swift"]) {
    const view = read("mobile/ios-native/App/" + file);
    assert.match(view, /NativeSmileyPicker \{ code in model.setDraft\(NativeSmiley.appending/);
    assert.match(view, /NativeSmileyText\(value:/);
    assert.match(view, /modifier\(NativeWebCompactPopover\(\)\)/);
    assert.doesNotMatch(view, /ForEach\(\["🙂", "👍"/);
    assert.match(view, /NativeInteractionCodec.picker/);
  }
  const view = read("mobile/ios-native/App/NativeSmileys.swift");
  assert.match(view, /count: 6/);
  assert.match(view, /minHeight: 44/);
  assert.match(view, /accessibilityReduceMotion/);
  assert.match(view, /removeAnimation\(forKey: "smiley"\)/);
  assert.match(view, /CGImageSourceCreateImageAtIndex/);
  assert.match(view, /UIImage\(named: smiley.assetName\)/);
  assert.match(view, /guard showSmileys else \{ return Text\(verbatim: value\) \}/);
  assert.match(view, /let matches = NativeSmiley.aliases/);
  assert.match(view, /return first.code.count > second.code.count/);
  assert.match(view, /\.accessibilityLabel\(value\)/);
  assert.doesNotMatch(view, /URLSession|WKWebView|WebKit|sendDraft|sendMessage|react\(/);
  assert.match(read("mobile/ios-native/App/NativeAppearanceView.swift"), /Toggle\("Smileys weergeven", isOn: \$showSmileys\)/);
});

test("Smiley screenshot scope verifies actual bundled image decoding and draft insertion across rotation", () => {
  const selected = require("../scripts/check-ios-native-ui").testsForScope("smileys");
  assert.deepEqual(selected, ["testWebSmileyPickerUsesSharedImagesAndOnlyChangesDraft"]);
  const view = read("mobile/ios-native/UITests/NativeStartupUITests.swift");
  assert.match(view, /XCTAssertEqual\(picker.value as\? String, "41 smileys beschikbaar"\)/);
  assert.match(view, /snapshot\("web-smileys-portrait"\)/);
  assert.match(view, /snapshot\("web-smileys-landscape"\)/);
  assert.match(view, /contains\(":D"\)/);
  assert.match(view, /contains\("8\)7"\)/);
});
