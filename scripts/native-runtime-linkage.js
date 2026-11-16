"use strict";
const fs = require("node:fs");
const path = require("node:path");

function runpaths(output) {
  return [...output.matchAll(/^\s*cmd LC_RPATH\s*\r?\n\s*cmdsize [0-9]+\s*\r?\n\s*path (.+?) \(offset [0-9]+\)\s*$/gm)].map(match => match[1]);
}

function inspect(appPath, execute) {
  for (const [relative, directory] of [["", true], ["TeleTypTelNative", false], ["Frameworks", true],
    ["Frameworks/WebRTC.framework", true], ["Frameworks/WebRTC.framework/WebRTC", false]]) {
    const stat = fs.lstatSync(path.join(appPath, relative));
    if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) throw new Error("Invalid native runtime bundle entry");
  }
  const executable = path.join(appPath, "TeleTypTelNative");
  const framework = path.join(appPath, "Frameworks/WebRTC.framework/WebRTC");
  if (!runpaths(execute("otool", ["-l", executable])).includes("@executable_path/Frameworks")) {
    throw new Error("Native executable cannot resolve embedded frameworks");
  }
  const dependency = "@rpath/WebRTC.framework/WebRTC";
  if (!execute("otool", ["-L", executable]).split(/\r?\n/).some(line => line.trim().startsWith(dependency + " ("))) {
    throw new Error("Native executable has an unexpected WebRTC dependency");
  }
  if (!execute("otool", ["-D", framework]).split(/\r?\n/).some(line => line.trim() === dependency)) {
    throw new Error("Embedded WebRTC install name changed");
  }
  for (const binary of [executable, framework]) {
    if (!execute("lipo", ["-archs", binary]).trim().split(/\s+/).includes("arm64")) throw new Error("Missing native iOS arm64 runtime");
  }
  return { webRTCEmbedded: true, frameworkRunpath: true, deviceArchitecture: "arm64" };
}

module.exports = { runpaths, inspect };
