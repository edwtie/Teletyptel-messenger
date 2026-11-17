"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const simulator = require("../scripts/native-simulator-session");
const freshID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const existingID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const runtime = "com.apple.CoreSimulator.SimRuntime.iOS-18-6";
const template = { name: "iPad Pro 11-inch (M4)", udid: existingID, isAvailable: true,
  deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4" };
const inventory = { devices: { [runtime]: [template] } };

function session({ source = inventory, family = "iPad", prefix = "release-startup", created = freshID, failure,
                   developerDirectory = "/fixture/Xcode.app/Contents/Developer" } = {}) {
  const calls = [];
  const logged = (name, command, args) => {
    calls.push({ name, command, args });
    if (name === failure) throw new Error("fixture preparation failure");
    return name.endsWith("-create") ? created : "";
  };
  return { calls, run: () => simulator.prepare({ inventory: source, family, reports: "/fixture/reports", prefix, logged, developerDirectory }) };
}

test("Simulator tests use a new device of the selected family and runtime, with the display initialized before testing", () => {
  const fixture = session();
  const result = fixture.run();
  assert.deepEqual(result, { name: template.name, udid: freshID, runtime, fresh: true });
  assert.deepEqual(fixture.calls.map(call => call.name), ["release-startup-create", "release-startup-boot", "release-startup-window", "release-startup-display"]);
  assert.deepEqual(fixture.calls[0].args.slice(-2), [template.deviceTypeIdentifier, runtime]);
  assert.deepEqual(fixture.calls[1].args, ["simctl", "bootstatus", freshID, "-b"]);
  assert.deepEqual(fixture.calls[2], { name: "release-startup-window", command: "open", args: ["-a", path.join("/fixture/Xcode.app/Contents/Developer", "Applications", "Simulator.app"), "--args", "-CurrentDeviceUDID", freshID] });
  assert.deepEqual(fixture.calls[3].args.slice(0, 4), ["simctl", "io", freshID, "screenshot"]);
  assert.ok(fixture.calls.every(call => !call.args.includes(existingID) && !call.args.includes("erase") && !call.args.includes("delete") && !call.args.includes("shutdown")));
});

test("Missing devices, unavailable or mismatched types and malformed scopes fail rather than reusing a stale simulator", () => {
  for (const options of [{ family: "other" }, { prefix: "../other" }, { developerDirectory: "relative-path" }, { source: { devices: {} } },
    { source: { devices: { [runtime]: [{ ...template, isAvailable: false }] } } },
    { source: { devices: { [runtime]: [{ ...template, deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-16" }] } } },
    { source: { devices: { "com.apple.CoreSimulator.SimRuntime.tvOS-18-6": [template] } } }]) {
    const fixture = session(options);
    assert.throws(fixture.run);
    assert.equal(fixture.calls.length, 0);
  }
});

test("Creating, booting, opening or rendering failures propagate without deleting devices or declaring a UI pass", () => {
  for (const suffix of ["create", "boot", "window", "display"]) {
    const fixture = session({ failure: "release-startup-" + suffix });
    assert.throws(fixture.run, /fixture preparation failure/);
    assert.equal(fixture.calls.at(-1).name, "release-startup-" + suffix);
  }
  for (const created of ["", "booted", existingID, "bad\n" + freshID]) {
    const fixture = session({ created });
    assert.throws(fixture.run, /Expected a fresh/);
    assert.equal(fixture.calls.length, 1);
  }
});
