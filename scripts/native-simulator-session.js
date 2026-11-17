"use strict";
const path = require("node:path");
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function prepare({ inventory, family, reports, prefix, logged, developerDirectory = process.env.DEVELOPER_DIR }) {
  if (!["iPhone", "iPad"].includes(family) || typeof prefix !== "string" || !/^[a-zA-Z0-9-]+$/.test(prefix)) throw new Error("Invalid simulator session scope");
  const developer = developerDirectory || logged(prefix + "-developer-directory", "xcode-select", ["--print-path"]).trim();
  if (typeof developer !== "string" || !path.isAbsolute(developer) || !developer.endsWith("/Contents/Developer")) throw new Error("Expected an Xcode developer directory");
  const candidates = Object.entries(inventory.devices || {})
    .filter(([runtime]) => /^com\.apple\.CoreSimulator\.SimRuntime\.iOS-\d+(?:-\d+){0,2}$/.test(runtime))
    .flatMap(([runtime, devices]) => devices.filter(device => device.isAvailable === true && device.name.startsWith(family))
      .map(device => ({ ...device, runtime })));
  const template = candidates.find(device => typeof device.deviceTypeIdentifier === "string"
    && device.deviceTypeIdentifier.startsWith("com.apple.CoreSimulator.SimDeviceType." + family)
    && /^[a-zA-Z0-9.-]+$/.test(device.deviceTypeIdentifier));
  if (!template) throw new Error("Missing " + family + " simulator type; no silent coverage skip");
  const deviceID = logged(prefix + "-create", "xcrun", ["simctl", "create", "TeleTypTel " + family + " " + Date.now(),
    template.deviceTypeIdentifier, template.runtime]).trim();
  if (!uuid.test(deviceID) || deviceID.toLowerCase() === template.udid?.toLowerCase()) throw new Error("Expected a fresh simulator identifier");
  logged(prefix + "-boot", "xcrun", ["simctl", "bootstatus", deviceID, "-b"]);
  logged(prefix + "-window", "open", ["-a", path.join(developer, "Applications", "Simulator.app"), "--args", "-CurrentDeviceUDID", deviceID]);
  logged(prefix + "-display", "xcrun", ["simctl", "io", deviceID, "screenshot", path.join(reports, prefix + "-display.png")]);
  return { name: template.name, udid: deviceID, runtime: template.runtime, fresh: true };
}

module.exports = { prepare };
