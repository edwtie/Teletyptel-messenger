"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const hash = data => crypto.createHash("sha256").update(data).digest("hex");
const rendererVersion = "2.6.2";

function catalogue(source) {
  const match = /const smiles = (\[[\s\S]*?\n  \])\.map\(/.exec(source);
  if (!match) throw new Error("Web smiley catalogue was not found");
  const names = new Set();
  const codes = new Set();
  return JSON.parse(match[1]).map(([name, fileName, aliases]) => {
    if (!/^[a-z0-9]+$/.test(name) || names.has(name) || !new RegExp("^" + name + "\\.(gif|svg)$").test(fileName) ||
        !Array.isArray(aliases) || !aliases.length || aliases.some(code => typeof code !== "string" || !code.length || code.length > 16 || codes.has(code))) {
      throw new Error("Invalid or duplicate web smiley entry");
    }
    names.add(name); aliases.forEach(code => codes.add(code));
    return { name, fileName, codes: aliases, assetName: "WebSmiley_" + name };
  });
}

function sources(root) {
  return catalogue(fs.readFileSync(path.join(root, "php/public/chat-client.js"), "utf8")).map(entry => {
    const original = path.join(root, "php/public/smileys", entry.fileName);
    const fileName = fs.existsSync(original) ? entry.fileName : entry.fileName.replace(/\.[^.]+$/, ".svg");
    const data = fs.readFileSync(path.join(root, "php/public/smileys", fileName));
    return { ...entry, fileName, data, animated: fileName.endsWith(".gif") };
  });
}

function render(root, rendererDirectory) {
  if (require(path.join(rendererDirectory, "package.json")).version !== rendererVersion) throw new Error("Unexpected SVG renderer version");
  const { Resvg } = require(rendererDirectory);
  const directory = path.join(root, "mobile/ios-native/Resources/Smileys");
  fs.mkdirSync(directory, { recursive: true });
  const manifest = { renderer: "@resvg/resvg-js@" + rendererVersion, entries: {} };
  for (const entry of sources(root).filter(entry => !entry.animated)) {
    const svg = entry.data.toString("utf8");
    if (/(?:href|xlink:href)\s*=\s*["'](?:https?:|file:|\/\/)|<!ENTITY|<script/i.test(svg)) throw new Error("External SVG resources are not allowed");
    const png = new Resvg(svg, { fitTo: { mode: "width", value: 96 }, font: { loadSystemFonts: false } }).render().asPng();
    fs.writeFileSync(path.join(directory, entry.name + ".png"), png);
    manifest.entries[entry.name] = { source: entry.fileName, sourceSHA256: hash(entry.data), pngSHA256: hash(png) };
  }
  fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

function assets(root) {
  const directory = path.join(root, "mobile/ios-native/Resources/Smileys");
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
  if (manifest.renderer !== "@resvg/resvg-js@" + rendererVersion) throw new Error("Unexpected smiley asset provenance");
  const output = {};
  const entries = sources(root);
  for (const entry of entries) {
    const info = { author: "xcode", version: 1 };
    if (entry.animated) {
      output[`Assets.xcassets/${entry.assetName}.dataset/smiley.gif`] = entry.data;
      output[`Assets.xcassets/${entry.assetName}.dataset/Contents.json`] = JSON.stringify({ data: [{ idiom: "universal", filename: "smiley.gif" }], info });
    } else {
      const expected = manifest.entries[entry.name];
      const png = fs.readFileSync(path.join(directory, entry.name + ".png"));
      if (expected?.source !== entry.fileName || expected.sourceSHA256 !== hash(entry.data) || expected.pngSHA256 !== hash(png)) {
        throw new Error("Regenerate native smiley: " + entry.name);
      }
      output[`Assets.xcassets/${entry.assetName}.imageset/smiley.png`] = png;
      output[`Assets.xcassets/${entry.assetName}.imageset/Contents.json`] = JSON.stringify({ images: [{ idiom: "universal", filename: "smiley.png", scale: "3x" }],
        properties: { "template-rendering-intent": "original" }, info });
    }
  }
  output["Assets.xcassets/WebSmileyCatalogue.dataset/catalogue.json"] = JSON.stringify(entries.map(({ data, ...entry }) => entry));
  output["Assets.xcassets/WebSmileyCatalogue.dataset/Contents.json"] = JSON.stringify({ data: [{ idiom: "universal", filename: "catalogue.json" }], info: { author: "xcode", version: 1 } });
  return output;
}

if (require.main === module) {
  if (process.argv[2] !== "--render" || !process.argv[3]) throw new Error("Usage: node scripts/native-smiley-assets.js --render <pinned-resvg-module-directory>");
  render(path.resolve(__dirname, ".."), path.resolve(process.argv[3]));
}
module.exports = { catalogue, sources, assets, render };
