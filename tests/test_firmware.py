# SPDX-License-Identifier: GPL-2.0-only
"""Pin the separate V67 chains and their payload-to-DMEM bookkeeping."""
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware"))
import generate_v67  # noqa: E402


class FirmwareTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((ROOT / "firmware/artifacts-610.43.03.json").read_text())

    def test_ad102_exact_payload_and_fill(self):
        payload = generate_v67.build_ad102_payload()
        entry = self.manifest["generated_ad102_payload"]
        digest = hashlib.sha256(payload).hexdigest()
        self.assertEqual(len(payload), 64000)
        self.assertEqual(digest, "44c36b2d6b3424e53e18f3e55db85c833655de071ce66ce42749588a4a7dc8cb")
        self.assertEqual(digest, generate_v67.AD102_PAYLOAD_SHA256)
        self.assertEqual(digest, entry["sha256"])
        self.assertEqual(len(payload), entry["size"])
        overrides = {int(word["offset"], 0): int(word["value"], 0)
                     for word in entry["overrides"]}
        self.assertEqual(len(overrides), 25)
        for offset in range(0, len(payload), 4):
            self.assertEqual(struct.unpack_from("<I", payload, offset)[0],
                             overrides.get(offset, 0x19c), hex(offset))

    def test_ad102_ordered_arguments_marker_and_cleanup(self):
        payload = generate_v67.build_ad102_payload()
        entry = self.manifest["generated_ad102_payload"]
        writes = entry["ordered_writes"]
        expected = [
            (0x1fa7cc, 0xfffff0ff, 0xf960, 0xf948),
            (0x9a0148, 0xffffffff, 0xf984, 0xf974),
            (0x1fa7c4, 0xffffffff, 0xf9a8, 0xf998),
            (0x823804, 0xffffffff, 0xf9cc, 0xf9bc),
        ]
        actual = [tuple(int(write[field], 0) for field in
                        ("address", "value", "address_offset", "value_offset"))
                  for write in writes]
        self.assertEqual(actual, expected)
        for address, value, address_offset, value_offset in actual:
            self.assertEqual(struct.unpack_from("<I", payload, address_offset)[0], address)
            self.assertEqual(struct.unpack_from("<I", payload, value_offset)[0], value)
        for offset_key, value_key, offset, value in (
            ("mailbox0_marker_offset", "mailbox0_marker", 0xf9e0, 0x67b00001),
            ("cleanup_entry_offset", "cleanup_entry", 0xf9fc, 0x771e),
        ):
            self.assertEqual(int(entry[offset_key], 0), offset)
            self.assertEqual(int(entry[value_key], 0), value)
            self.assertEqual(struct.unpack_from("<I", payload, offset)[0], value)

    def test_per_chip_dmem_offsets_and_ga102_compatibility(self):
        for key, payload, return_gadget, plm_offset in (
            ("generated_payload", generate_v67.build_payload(), 0xd44, 0xf960),
            ("generated_ad102_payload", generate_v67.build_ad102_payload(), 0x21b2, 0xf9cc),
        ):
            with self.subTest(key=key):
                entry = self.manifest[key]
                stack = entry["stack_map"]
                base = int(entry["dmem_base"], 0)
                self.assertEqual(base, 0x600)
                for name, expected_dmem, expected_offset, value in (
                    ("active_canary", 0xff4c, 0xf94c, 0x19c),
                    ("initial_return_slot", 0xff50, 0xf950, return_gadget),
                ):
                    offset = int(stack[name + "_payload_offset"], 0)
                    self.assertEqual(offset, expected_offset)
                    self.assertEqual(int(stack[name + "_dmem"], 0), expected_dmem)
                    self.assertEqual(base + offset, expected_dmem)
                    self.assertEqual(struct.unpack_from("<I", payload, offset)[0], value)
                self.assertEqual(struct.unpack_from("<I", payload, plm_offset)[0], 0x823804)
        self.assertEqual(hashlib.sha256(generate_v67.build_payload()).hexdigest(),
                         "2a0aa1f86d0b6afff5214d641d87d46dc98ef06ed908ff05d0ddbad5ffb7e197")

    def test_firmware_install_includes_both_payloads_and_licenses(self):
        payloads = {
            "v67-ga102-610.43.03.bin": generate_v67.build_payload(),
            "v67-ad102-610.43.03-four-plm.bin": generate_v67.build_ad102_payload(),
        }
        with tempfile.TemporaryDirectory() as directory:
            assets = Path(directory) / "assets"
            destination = Path(directory) / "install"
            assets.mkdir()
            expected = set(self.manifest["derived_assets"]) | {"gsp_ga10x.bin"} | set(payloads)
            self.assertEqual(len(expected), 9)
            for filename in expected:
                (assets / filename).write_bytes(payloads.get(filename, b"fixture"))
            (assets / "NVIDIA-LICENSE").write_text("fixture license\n")
            subprocess.run(["make", "-s", f"ASSETS={assets}", f"DESTDIR={destination}",
                            "install-firmware"], cwd=ROOT, check=True)
            installed = destination / "usr/lib/firmware/gpu-unlock/610.43.03"
            self.assertEqual({path.name for path in installed.iterdir()}, expected)
            for filename, payload in payloads.items():
                self.assertEqual((installed / filename).read_bytes(), payload)
            licenses = destination / "usr/share/licenses/gpu-unlock-firmware"
            self.assertEqual((licenses / "GPL-2.0.txt").read_bytes(),
                             (ROOT / "licenses/GPL-2.0.txt").read_bytes())
            self.assertEqual((licenses / "NOTICE.md").read_bytes(),
                             (ROOT / "firmware/NOTICE.md").read_bytes())
            self.assertEqual((licenses / "NVIDIA-LICENSE").read_text(), "fixture license\n")
