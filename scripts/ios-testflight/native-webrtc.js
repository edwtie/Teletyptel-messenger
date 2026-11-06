const fs = require("node:fs");
const path = require("node:path");

const revision = "c6cde72c7638acf8dc2b070aaecca054e9e20720";
const version = "157.0.0";
const checksum = "ffb1221be2138ecc6bc92300ae4f0157e18694d652db9921e4251992ea91a328";

function addPackage(source) {
  const dependencies = /^    dependencies: \[/gm;
  const capacitor = '.product(name: "Capacitor", package: "capacitor-swift-pm")';
  if (source.includes("WebRTC") || [...source.matchAll(dependencies)].length !== 1 || source.split(capacitor).length !== 2) {
    throw new Error("Review changed WebRTC or Capacitor dependencies before modifying staging");
  }
  return source.replace(dependencies, '    dependencies: [\n        .package(url: "https://github.com/stasel/WebRTC.git", revision: "' + revision + '"),')
    .replace(capacitor, '.product(name: "WebRTC", package: "WebRTC"),\n                ' + capacitor);
}

function configurePackage(project, enabled) {
  if (!enabled) return;
  const file = path.join(project, "ios/App/CapApp-SPM/Package.swift");
  fs.writeFileSync(file, addPackage(fs.readFileSync(file, "utf8")));
}

module.exports = { revision, version, checksum, addPackage, configurePackage };
