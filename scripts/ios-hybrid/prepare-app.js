"use strict";

const fs = require("node:fs");
const path = require("node:path");
const native = require("../prepare-ios-native");
const root = path.resolve(__dirname, "../..");

function prepare() {
  if (!process.env.RUNNER_TEMP || process.env.GITHUB_ACTIONS !== "true") throw new Error("The isolated app may only be assembled on the disposable CI runner.");
  const payload = process.env.TELETYPTEL_HYBRID_CONTENT;
  if (!payload || path.resolve(payload) !== path.join(path.resolve(process.env.RUNNER_TEMP), "teletyptel-hybrid-content.json")) {
    throw new Error("Missing isolated hybrid content.");
  }
  const directory = native.prepare("ios-native-hybrid-validation");
  const hybrid = path.join(directory, "Hybrid");
  fs.mkdirSync(hybrid);
  const files = [];
  for (const source of ["Sources/TeleTypTelHybridBridge", "App"]) {
    const sourceDirectory = path.join(root, "mobile/ios-hybrid", source);
    for (const file of fs.readdirSync(sourceDirectory).filter(file => /^[A-Za-z0-9_-]+\.swift$/.test(file))) {
      if (files.includes(file)) throw new Error("Duplicate hybrid source file.");
      files.push(file);
      fs.copyFileSync(path.join(sourceDirectory, file), path.join(hybrid, file));
    }
  }
  fs.copyFileSync(payload, path.join(hybrid, "hybrid-content.json"));
  fs.copyFileSync(path.join(root, "mobile/ios-hybrid/UITests/HybridStartupUITests.swift"), path.join(directory, "UITests/NativeStartupUITests.swift"));
  const original = path.join(directory, "App/TeleTypTelNativeApp.swift");
  const application = fs.readFileSync(original, "utf8");
  if ((application.match(/@main/g) || []).length !== 1) throw new Error("Expected exactly one original app entrypoint.");
  fs.writeFileSync(original, application.replace("@main", ""));
  const generated = native.projectText({ hybrid: true, extraSources: files.map(file => "Hybrid/" + file), extraResources: ["Hybrid/hybrid-content.json"] });
  fs.writeFileSync(path.join(directory, "TeleTypTelNative.xcodeproj/project.pbxproj"), generated.project);
  return directory;
}

if (require.main === module) process.stdout.write(prepare() + "\n");
module.exports = { prepare };
