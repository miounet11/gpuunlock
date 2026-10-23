# SPDX-License-Identifier: GPL-2.0-only
"""Exercise the stock Ada extraction against pinned NVIDIA source, without a GPU."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware"))
import extract_boot_assets as extract

SOURCE = Path(os.environ.get("GPU_UNLOCK_NVIDIA_SOURCE", "/nonexistent"))


@unittest.skipUnless((SOURCE / "src/nvidia/generated").is_dir(),
                     "set GPU_UNLOCK_NVIDIA_SOURCE to the pinned NVIDIA source root")
class AdaAssetTests(unittest.TestCase):
    def test_real_ada_geometry_and_descriptor(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "assets"
            extract.extract_assets(SOURCE, output, "ad102")
            manifest = json.loads(extract.ADA_MANIFEST.read_text())
            published = json.loads((ROOT / "firmware/artifacts-610.43.03.json").read_text())
            self.assertEqual(manifest["payload"]["sha256"],
                             published["generated_ad102_payload"]["sha256"])
            for name, digest in manifest["derived_assets"].items():
                self.assertEqual(hashlib.sha256((output / name).read_bytes()).hexdigest(), digest)
            bundle = (output / "booter_load_ad102.bin").read_bytes()
            self.assertEqual(struct.unpack_from("<II", bundle), (extract.MAGIC, 1))
            header = struct.unpack_from("<14I", bundle, 8)
            self.assertEqual(header, (0, 256, 32256, 24576, 1, 256, 32000,
                                      256, 0, 32272, 3, 1, 2, 768))
            self.assertEqual(struct.unpack_from("<II", bundle, 64), (56832, 768))
            self.assertEqual(len(bundle), 72 + 56832 + 768)
            descriptor = struct.unpack("<21I", (output / "gsp_boot_desc_ad102.bin").read_bytes())
            self.assertEqual((descriptor[0], descriptor[1], descriptor[3], descriptor[19]),
                             (5, 32768, 34944, 36864))
            self.assertFalse((output / manifest["payload"]["filename"]).exists())

    def test_source_mutation_rejected_before_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            generated = root / "src/nvidia/generated"
            generated.mkdir(parents=True)
            for name in extract.ADA_PINNED:
                shutil.copyfile(SOURCE / "src/nvidia/generated" / name, generated / name)
            booter = generated / next(iter(extract.ADA_PINNED))
            booter.write_bytes(booter.read_bytes() + b"\n")
            with self.assertRaisesRegex(ValueError, "pinned generated source mismatch"):
                extract.extract_assets(root, root / "output", "ad102")
            self.assertFalse((root / "output").exists())

    def test_ampere_source_cannot_be_renamed_into_ada(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            generated = root / "src/nvidia/generated"
            generated.mkdir(parents=True)
            for name in extract.ADA_PINNED:
                shutil.copyfile(SOURCE / "src/nvidia/generated" / name.replace("AD102", "GA102"),
                                generated / name)
            with self.assertRaisesRegex(ValueError, "pinned generated source mismatch"):
                extract.extract_assets(root, root / "output", "ad102")

    def test_default_ampere_outputs_stay_pinned(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            extract.extract_assets(SOURCE, output)
            self.assertTrue((output / "booter_load_ga102.bin").is_file())
            self.assertFalse((output / "booter_load_ad102.bin").exists())


class ProfileValidationTests(unittest.TestCase):
    def test_unknown_profile_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "unsupported firmware profile"):
            extract.extract_assets(Path("/nonexistent"), Path("/unused"), "ga102/../ad102")
