import json
import os
import platform
import subprocess
from uuid import UUID


def simctl(*arguments, **kwargs):
    return subprocess.run(["xcrun", "simctl", *arguments], **kwargs)


def booted(output, returncode):
    lines = {line.strip() for line in output.splitlines()}
    return returncode == 0 and "Data Migration Failed" not in lines


def smoke(kind, runtime, device_type, architecture):
    for attempt in (1, 2):
        identifier = str(UUID(simctl("create", f"TeleTypTel-{kind}-{attempt}", device_type, runtime,
                                     capture_output=True, text=True, check=True, timeout=90).stdout.strip()))
        print(f"{kind}: simulatorstart {attempt}/2 ({identifier})", flush=True)
        try:
            try:
                status = simctl("bootstatus", identifier, "-b", stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, timeout=420)
                print(status.stdout, flush=True)
                ready = booted(status.stdout, status.returncode)
            except subprocess.TimeoutExpired:
                print(f"{kind}: simulatorstart duurde langer dan 420 seconden", flush=True)
                ready = False
            if not ready:
                if attempt == 2:
                    raise RuntimeError(f"{kind}: simulator niet gereed; app-test niet gestart")
                continue
            subprocess.run(["xcodebuild", "test", "-project", "artifacts/ios-native-hybrid-validation/TeleTypTelNative.xcodeproj",
                            "-scheme", "TeleTypTelNative", "-configuration", "Debug", "-destination",
                            f"platform=iOS Simulator,arch={architecture},id={identifier}", "-derivedDataPath",
                            os.path.join(os.environ["RUNNER_TEMP"], "teletyptel-hybrid-app"),
                            "-only-testing:NativeStartupUITests/HybridStartupUITests", "-parallel-testing-enabled", "NO",
                            f"ARCHS={architecture}", "ONLY_ACTIVE_ARCH=YES", "CODE_SIGNING_ALLOWED=NO"], check=True)
            return
        finally:
            try:
                simctl("shutdown", identifier, timeout=60)
            finally:
                simctl("delete", identifier, check=True, timeout=60)


def main():
    architecture = platform.machine()
    if architecture not in ("arm64", "x86_64"):
        raise RuntimeError("Unsupported runner architecture")
    devices = json.loads(simctl("list", "devices", "available", "-j", capture_output=True, text=True, check=True).stdout)["devices"]
    for kind in ("iPhone", "iPad"):
        candidates = sorted((device["name"], runtime, device["deviceTypeIdentifier"])
                            for runtime, values in devices.items() if runtime.endswith(".iOS-27-2")
                            for device in values if device.get("isAvailable") and device["name"].startswith(kind))
        if not candidates:
            raise RuntimeError("Missing simulator: " + kind)
        name, runtime, device_type = candidates[-1]
        print("Starting UI test on", name, runtime, flush=True)
        smoke(kind, runtime, device_type, architecture)


if __name__ == "__main__":
    main()
