import runpy
import subprocess
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from uuid import uuid4


smoke = runpy.run_path(str(Path(__file__).with_name("simulator-smoke.py")))["smoke"]


class SimulatorSmokeTests(unittest.TestCase):
    def exercise(self, statuses, app_error=None):
        created, deleted = [], []
        statuses = iter(statuses)

        def control(command, *arguments, **kwargs):
            if command == "create":
                created.append(str(uuid4()))
                return Mock(stdout=created[-1])
            if command == "bootstatus":
                return Mock(stdout=next(statuses), returncode=0)
            if command == "delete":
                deleted.append(arguments[0])

        with patch.dict(smoke.__globals__, simctl=control), patch.dict("os.environ", RUNNER_TEMP="/tmp"), \
                patch("subprocess.run", side_effect=app_error) as build:
            try:
                smoke("iPhone", "runtime", "type", "arm64")
            finally:
                self.assertEqual(created, deleted)
                self.assertEqual(len(created), len(set(created)))
                self.attempts, self.test_calls = len(created), build.call_count

    def test_terminal_migration_failure_even_with_zero_exit(self):
        self.exercise(["Status=3, isTerminal=YES\n\tData Migration Failed\n", "Finished"])
        self.assertEqual((self.attempts, self.test_calls), (2, 1))

    def test_no_app_test_after_two_failed_boots(self):
        with self.assertRaises(RuntimeError):
            self.exercise(["Data Migration Failed"] * 2)
        self.assertEqual((self.attempts, self.test_calls), (2, 0))

    def test_failed_app_assertion_is_not_retried(self):
        with self.assertRaises(subprocess.CalledProcessError):
            self.exercise(["Finished"], subprocess.CalledProcessError(65, "xcodebuild"))
        self.assertEqual((self.attempts, self.test_calls), (1, 1))


if __name__ == "__main__":
    unittest.main()
