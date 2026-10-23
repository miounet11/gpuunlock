# SPDX-License-Identifier: GPL-2.0-only
import importlib.util
from pathlib import Path
import struct
import sys
import tempfile
from unittest import TestCase, mock, skipUnless

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware"))
import decode_debug_booter as decoder

HAS_CRYPTO = importlib.util.find_spec("Crypto") is not None


@skipUnless(HAS_CRYPTO, "optional offline decoder requires PyCryptodome")
class DebugDecoderTests(TestCase):
    def test_standard_aes_control(self):
        self.assertEqual(decoder.aes_cipher(bytes(16)).encrypt(bytes(16)).hex(),
                         "66e94bd4ef8a2c3b884cfa59ca342b2e")

    def test_wrong_key_never_reads_firmware_or_creates_outputs(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "must-not-exist"
            with mock.patch.object(decoder, "extract_debug") as extract:
                with self.assertRaisesRegex(ValueError, "AES-zero control"):
                    decoder.decode_images(Path("nonexistent"), output, bytes(16))
                extract.assert_not_called()
            self.assertFalse(output.exists())

    def test_code_range_preserves_addresses_and_excludes_dmem(self):
        key = bytes(range(16))
        ns = bytes([0xA5]) * 256
        plaintext = bytes(range(32))
        dmem = bytes([0xC3]) * 256
        image = ns + decoder.aes_cipher(key).encrypt(plaintext) + dmem
        header = struct.pack("<9I", 0, 256, 288, 256, 1, 256, 32, 256, 0)
        self.assertEqual(decoder.decode_code(image, header, key), ns + plaintext)
        corrupt = struct.pack("<9I", 0, 256, 287, 257, 1, 256, 31, 256, 0)
        with self.assertRaisesRegex(ValueError, "geometry"):
            decoder.decode_code(image, corrupt, key)


class DebugKeyInputTests(TestCase):
    def test_key_file_formats_and_rejection(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "debug-key"
            key = bytes(range(16))
            path.write_bytes(key)
            self.assertEqual(decoder.read_key(path), key)
            path.write_text(key.hex() + "\n")
            self.assertEqual(decoder.read_key(path), key)
            path.write_text("00")
            with self.assertRaisesRegex(ValueError, "16 raw bytes"):
                decoder.read_key(path)
            path.write_bytes(bytes(1024))
            with self.assertRaisesRegex(ValueError, "small input limit"):
                decoder.read_key(path)
