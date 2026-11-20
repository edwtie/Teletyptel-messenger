import argparse
import json
import os
import platform
import subprocess


def select_device(devices, kind):
    runtime = "com.apple.CoreSimulator.SimRuntime.iOS-27-2"
    candidates = [device for device in devices.get(runtime, [])
                  if device.get("isAvailable") and device["name"].startswith(kind)
                  and device["state"] in ("Booted", "Shutdown")]
    if not candidates:
        raise RuntimeError(f"Geen beschikbare {kind}-simulator op iOS 27.2")
    return max(candidates, key=lambda device: (device["state"] == "Booted", device["name"], device["udid"]))


def smoke(kind):
    architecture = platform.machine()
    if architecture not in ("arm64", "x86_64"):
        raise RuntimeError("Unsupported runner architecture")
    inventory = subprocess.run(["xcrun", "simctl", "list", "devices", "available", "-j"],
                               capture_output=True, text=True, check=True, timeout=60)
    device = select_device(json.loads(inventory.stdout)["devices"], kind)
    identifier = device["udid"]
    print(f"UI-test op bestaande {device['name']} ({identifier}, {device['state']}, iOS 27.2)", flush=True)
    subprocess.run(["xcodebuild", "test", "-project", "artifacts/ios-native-hybrid-validation/TeleTypTelNative.xcodeproj",
                    "-scheme", "TeleTypTelNative", "-configuration", "Debug", "-destination",
                    f"platform=iOS Simulator,arch={architecture},id={identifier}", "-derivedDataPath",
                    os.path.join(os.environ["RUNNER_TEMP"], "teletyptel-hybrid-app"),
                    "-only-testing:NativeStartupUITests/HybridStartupUITests", "-parallel-testing-enabled", "NO",
                    f"ARCHS={architecture}", "ONLY_ACTIVE_ARCH=YES", "CODE_SIGNING_ALLOWED=NO"], check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("device", choices=("iPhone", "iPad"))
    smoke(parser.parse_args().device)
