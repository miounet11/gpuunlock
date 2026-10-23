# SPDX-License-Identifier: GPL-2.0-only
import ctypes as C
import importlib.util
from pathlib import Path
from unittest import TestCase, mock

spec = importlib.util.spec_from_file_location(
    "sm_rates", Path(__file__).resolve().parents[1] / "tools/read_sm_rates.py")
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class SmRateProbeTests(TestCase):
    def test_only_alloc_and_the_one_public_getter_are_sent(self):
        requests = []

        def ioctl(fd, code, buffer, mutate):
            requests.append(code)
            self.assertEqual(fd, 7)
            if code == probe.ioctl_number(0x2B, probe.Alloc):
                p = probe.Alloc.from_buffer(buffer)
                self.assertIn(p.cls, (0x41, 0x80, 0x2080))
                p.new = 100 + len(requests)
            elif code == probe.ioctl_number(0x2A, probe.Control):
                p = probe.Control.from_buffer(buffer)
                self.assertEqual(p.cmd, probe.GET_SM_RATES)
                rates = C.cast(p.params, C.POINTER(probe.Rates)).contents
                rates.fmla32 = 1
                rates.imla2 = 1
                rates.imla4 = 1
            else:
                self.fail("unexpected ioctl")

        with mock.patch.object(probe, "gpu_identity", return_value=["GPU-exact, test"]), \
             mock.patch.object(probe.os, "open", side_effect=[7, 8]), \
             mock.patch.object(probe.os, "close") as close:
            result = probe.read_rates("GPU-exact", ioctl)
        self.assertEqual(result["rates"]["fmla32"], 1)
        self.assertEqual(len(requests), 4)
        self.assertEqual(close.call_args_list, [mock.call(8), mock.call(7)])

    def test_wrong_identity_prevents_any_device_open(self):
        with mock.patch.object(probe, "gpu_identity", return_value=["GPU-other, test"]), \
             mock.patch.object(probe.os, "open") as open_device:
            with self.assertRaisesRegex(RuntimeError, "exact supplied UUID"):
                probe.read_rates("GPU-exact")
            open_device.assert_not_called()

    def test_failed_getter_does_not_report_zero_as_full_speed(self):
        def ioctl(fd, code, buffer, mutate):
            if code == probe.ioctl_number(0x2B, probe.Alloc):
                probe.Alloc.from_buffer(buffer).new = 1
            else:
                probe.Control.from_buffer(buffer).status = 0x56

        with mock.patch.object(probe, "gpu_identity", return_value=["GPU-exact, test"]), \
             mock.patch.object(probe.os, "open", side_effect=[7, 8]), \
             mock.patch.object(probe.os, "close") as close:
            with self.assertRaisesRegex(RuntimeError, "status 0x56"):
                probe.read_rates("GPU-exact", ioctl)
        self.assertEqual(close.call_count, 2)
