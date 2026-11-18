"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { variants, caseID } = require("./catalogue");

function scenarioForName(name) {
  const navigation = /^visual-navigation-(contacts|main-menu|chat)-(portrait|landscape)-(light|dark)(?:_|$)/.exec(name);
  if (navigation) return { screen: navigation[1], orientation: navigation[2], theme: navigation[3], priority: 3 };
  const palette = /^web-palette-(login|contacts|main-menu|settings|conversation-menu|chat-portrait|chat-landscape|tc-portrait|tc-landscape|tc-controls)-(light|dark)(?:_|$)/.exec(name);
  if (palette) {
    const [screen, explicitOrientation] = ({ settings: ["appearance"], "chat-portrait": ["chat", "portrait"], "chat-landscape": ["chat", "landscape"], "tc-portrait": ["tc", "portrait"], "tc-landscape": ["tc", "landscape"], "tc-controls": ["call-controls", "portrait"] })[palette[1]] || [palette[1]];
    return { screen, orientation: explicitOrientation || "portrait", theme: palette[2], priority: 1 };
  }
  const inventory = /^visual-(dialer|history|archive|appearance|profile-edit|account|groups|translation)-(portrait|landscape)-(light|dark)(?:_|$)/.exec(name);
  if (inventory) return { screen: inventory[1], orientation: inventory[2], theme: inventory[3], priority: 2 };
  const startup = /^visual-(login|login-settings|startup-checking|startup-offline|startup-certificate|two-factor-login)-(portrait|landscape)-(light|dark)(?:_|$)/.exec(name);
  if (startup) return { screen: startup[1], orientation: startup[2], theme: startup[3], priority: 2 };
  const messageMenu = /^visual-message-menu-(portrait|landscape)-(light|dark)(?:_|$)/.exec(name);
  if (messageMenu) return { screen: "message-menu", orientation: messageMenu[1], theme: messageMenu[2], priority: 2 };
  const smileys = /^web-smileys-(portrait|landscape)(?:_|$)/.exec(name);
  if (smileys) return { screen: "smileys", orientation: smileys[1], theme: "light", priority: 1 };
  return null;
}

function pngSize(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Evidence is not a PNG");
  const storedWidth = bytes.readUInt32BE(16);
  const storedHeight = bytes.readUInt32BE(20);
  if (!storedWidth || !storedHeight || storedWidth * storedHeight > 20000000) throw new Error("Oversized PNG");
  let orientation = 1;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) throw new Error("Invalid PNG chunk");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "eXIf") {
      const tiff = bytes.subarray(offset + 8, offset + 8 + length);
      if (tiff.length < 10) throw new Error("Invalid TIFF header");
      const byteOrder = tiff.toString("ascii", 0, 2);
      if (!["MM", "II"].includes(byteOrder)) throw new Error("Unsupported TIFF byte order");
      const short = position => byteOrder === "MM" ? tiff.readUInt16BE(position) : tiff.readUInt16LE(position);
      const long = position => byteOrder === "MM" ? tiff.readUInt32BE(position) : tiff.readUInt32LE(position);
      if (short(2) !== 42) throw new Error("Invalid TIFF signature");
      const directory = long(4);
      if (directory > tiff.length - 2) throw new Error("Invalid TIFF directory");
      const count = short(directory);
      if (count > 64 || directory + 2 + count * 12 > tiff.length) throw new Error("Invalid TIFF entries");
      for (let entry = directory + 2; entry < directory + 2 + count * 12; entry += 12) {
        if (short(entry) === 0x112) {
          if (short(entry + 2) !== 3 || long(entry + 4) !== 1) throw new Error("Unsupported orientation type");
          orientation = short(entry + 8);
        }
      }
    }
    offset += length + 12;
  }
  if (![1, 3, 6, 8].includes(orientation)) throw new Error("Unsupported mirrored EXIF orientation");
  const rotated = orientation === 6 || orientation === 8;
  return { width: rotated ? storedHeight : storedWidth, height: rotated ? storedWidth : storedHeight, storedWidth, storedHeight, orientation };
}

function importedName(filename) {
  if (typeof filename !== "string" || !/^[a-zA-Z0-9_.-]+\.(?:png|json|txt)$/.test(filename)) throw new Error("Invalid exported evidence filename");
  return filename;
}

function measuredVariant(variant, viewport, imageSize) {
  if (!viewport) return { ...variant };
  const values = [viewport.x, viewport.y, viewport.width, viewport.height];
  if (viewport.source !== "measured-safe-area" || viewport.scale !== variant.scale || !values.every(Number.isSafeInteger) || viewport.x < 0 || viewport.y < 0 || viewport.width <= 0 || viewport.height <= 0 || !imageSize || viewport.x + viewport.width > imageSize.width || viewport.y + viewport.height > imageSize.height) throw new Error("Invalid measured native viewport");
  const width = viewport.width / variant.scale;
  const height = viewport.height / variant.scale;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || (width > height) !== (variant.orientation === "landscape")) throw new Error("Measured native viewport does not have an exact supported CSS size");
  return { ...variant, width, height };
}

function importCaptures({ sources, output, revision, runURL }) {
  if (!/^[a-f0-9]{40}$/.test(revision || "")) throw new Error("An exact native source commit is required");
  if (!output || fs.existsSync(output)) throw new Error("Choose a new native evidence directory");
  const selected = new Map();
  const superseded = [];
  for (const { family, directory } of sources) {
    if (!["iPhone", "iPad"].includes(family)) throw new Error("Unknown native device family");
    const prefix = family.toLowerCase() + "-";
    const manifestFile = path.join(directory, prefix + "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    for (const test of manifest) for (const attachment of test.attachments || []) {
      const scenario = scenarioForName(attachment.suggestedHumanReadableName || "");
      if (!scenario || !attachment.exportedFileName?.endsWith(".png")) continue;
      const variant = variants.find(entry => entry.family === family && entry.orientation === scenario.orientation && entry.theme === scenario.theme);
      const file = prefix + importedName(attachment.exportedFileName);
      const bytes = fs.readFileSync(path.join(directory, file));
      const size = pngSize(bytes);
      if ((size.width > size.height) !== (scenario.orientation === "landscape")) throw new Error("Screenshot orientation disagrees with its declared scenario: " + file);
      const id = caseID(scenario.screen, variant);
      const entry = { id, screen: scenario.screen, ...variant, sourceFile: path.join(directory, file), file: id + ".png", imageSize: size, attachment: attachment.suggestedHumanReadableName, status: "native-captured-only", fixture: "isolated-native-connected-v1", sha256: crypto.createHash("sha256").update(bytes).digest("hex"), priority: scenario.priority };
      const baseName = attachment.suggestedHumanReadableName.split(/_\d+_/)[0].replace(/\.png$/, "");
      const metrics = (test.attachments || []).find(candidate => candidate.suggestedHumanReadableName?.startsWith(baseName + "-geometry") && /\.(?:json|txt)$/.test(candidate.exportedFileName || ""));
      if (metrics) {
        const geometry = JSON.parse(fs.readFileSync(path.join(directory, prefix + importedName(metrics.exportedFileName)), "utf8"));
        if (geometry.name !== baseName || geometry.schema !== 1 || geometry.units !== "points") throw new Error("Geometry does not belong to its screenshot");
        entry.geometry = geometry;
        if (geometry.viewport) {
          Object.assign(entry, measuredVariant(variant, geometry.viewport, size));
          entry.viewport = geometry.viewport;
        }
      }
      const existing = selected.get(id);
      if (existing) {
        if (existing.priority === entry.priority) throw new Error("Ambiguous duplicate native case: " + id);
        superseded.push({ id, attachment: existing.priority < entry.priority ? existing.attachment : entry.attachment });
        if (existing.priority > entry.priority) continue;
      }
      selected.set(id, entry);
    }
  }
  fs.mkdirSync(output, { recursive: true });
  const captures = [...selected.values()].map(({ sourceFile, priority, ...entry }) => { fs.copyFileSync(sourceFile, path.join(output, entry.file), fs.constants.COPYFILE_EXCL); return entry; });
  const result = { revision, runURL, origin: "Actual XCTest simulator attachments; no generated mockups", viewportPolicy: "Full unmodified screenshots retained. No inferred crop, normalization, scaling or ignored regions; explicit measured safe-area metadata still required for strict acceptance.", superseded, captures };
  fs.writeFileSync(path.join(output, "native-manifest.json"), JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  try {
    const [directory, output, revision, runURL] = process.argv.slice(2);
    const result = importCaptures({ sources: ["iPhone", "iPad"].map(family => ({ family, directory: path.resolve(directory) })), output: path.resolve(output), revision, runURL });
    console.log("Imported " + result.captures.length + " actual native screenshots");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { scenarioForName, pngSize, measuredVariant, importCaptures };
