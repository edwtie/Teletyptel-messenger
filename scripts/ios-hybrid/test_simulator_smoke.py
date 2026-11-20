import json
import runpy
import subprocess
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


module = runpy.run_path(str(Path(__file__).with_name("simulator-smoke.py")))
runtime = "com.apple.CoreSimulator.SimRuntime.iOS-27-2"
identifier = "92FA1CA9-EA61-434B-AACA-0A76FE5ECBD4"


def device(name, state="Shutdown", available=True):
    return dict(name=name, state=state, isAvailable=available, udid=identifier)


class SimulatorSmokeTests(unittest.TestCase):
    def test_selects_ready_device_of_requested_family(self):
        devices = {runtime: [device("iPad", "Booted"), device("iPhone B"), device("iPhone A", "Booted")]}
        self.assertEqual(module["select_device"](devices, "iPhone")["name"], "iPhone A")
        self.assertEqual(module["select_device"](devices, "iPad")["name"], "iPad")

    def test_wrong_runtime_unavailable_and_transitional_devices_are_excluded(self):
        devices = {runtime: [device("iPhone", available=False), device("iPhone", "Creating")],
                   "iOS-26": [device("iPhone", "Booted")]}
        with self.assertRaises(RuntimeError):
            module["select_device"](devices, "iPhone")

    def test_runs_real_ui_suite_on_inventory_udid_and_propagates_failure(self):
        inventory = Mock(stdout=json.dumps({"devices": {runtime: [device("iPhone")]}}))
        with patch("platform.machine", return_value="arm64"), patch.dict("os.environ", RUNNER_TEMP="/tmp"), \
                patch("subprocess.run", side_effect=[inventory, subprocess.CalledProcessError(65, "test")]) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                module["smoke"]("iPhone")
        self.assertEqual(run.call_count, 2)
        first, second = run.call_args_list
        self.assertEqual(first.args[0], ["xcrun", "simctl", "list", "devices", "available", "-j"])
        self.assertEqual(second.args[0][:2], ["xcodebuild", "test"])
        self.assertIn("platform=iOS Simulator,arch=arm64,id=" + identifier, second.args[0])
        self.assertIn("-only-testing:NativeStartupUITests/HybridStartupUITests", second.args[0])
        self.assertTrue(second.kwargs["check"])


if __name__ == "__main__":
    unittest.main()
