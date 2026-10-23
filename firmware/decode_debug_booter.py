#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
"""Decode pinned debug Booters for private offline analysis, with a key control.

Requires PyCryptodome. Reads no GPU devices and generates no unlock payload.
The supplied debug test key must first match the published GA102 AES-zero
control, which is present in the pinned GA102 image. Never prints or saves it.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import struct

from extract_boot_assets import _array_bytes, PINNED, ADA_PINNED

ZERO_MARKER = bytes.fromhex("717d1494eaca317ff106195258b38377")
DEBUG_HASHES = {
    "GA102": "0f85e7fec6467d3bc6aa342bfa676dbabc8294b768ca22a7ebc5cf0242747fc1",
    "AD102": "8f1edc1cc980208eae1a25334d5f32e972b8cce3ad997c1d93a232be825b7441",
}


def aes_cipher(key: bytes):
    if len(key) != 16:
        raise ValueError("expected a 16-byte debug test key")
    try:
        from Crypto.Cipher import AES
    except ImportError as error:
        raise RuntimeError("install PyCryptodome to use the offline decoder") from error
    return AES.new(key, AES.MODE_ECB)


def validate_key(key: bytes) -> None:
    if aes_cipher(key).encrypt(bytes(16)) != ZERO_MARKER:
        raise ValueError("debug key failed the independent published AES-zero control")


def read_key(path: Path) -> bytes:
    if not path.is_file():
        raise ValueError("debug key input must be a regular file")
    with path.open("rb") as stream:
        data = stream.read(129)
    if len(data) > 128:
        raise ValueError("debug key file exceeds the small input limit")
    if len(data) == 16:
        return data
    try:
        text = data.decode("ascii").strip()
        if len(text) != 32:
            raise ValueError()
        key = bytes.fromhex(text)
    except (ValueError, UnicodeDecodeError):
        raise ValueError("key file must contain 16 raw bytes or 32 hexadecimal characters") from None
    if len(key) != 16:
        raise ValueError("invalid debug key length")
    return key


def decode_code(image: bytes, header: bytes, key: bytes) -> bytes:
    if len(header) != 36:
        raise ValueError("unexpected debug Booter descriptor")
    os_code, os_size, data_offset, data_size, applications, code_offset, code_size, _, _ = struct.unpack("<9I", header)
    if (applications != 1 or os_code != 0 or os_size != 256 or code_offset != 256
            or code_offset + code_size != data_offset or data_offset + data_size != len(image)
            or not code_size or code_size % 16):
        raise ValueError("unexpected code/DMEM geometry")
    # Keep virtual addresses intact. Never decrypt the NS prefix or the DMEM.
    return image[:code_offset] + aes_cipher(key).decrypt(image[code_offset:data_offset])


def extract_debug(source_root: Path, chip: str) -> tuple[bytes, bytes]:
    pins = PINNED if chip == "GA102" else ADA_PINNED
    name = f"g_bindata_kgspGetBinArchiveBooterLoadUcode_{chip}.c"
    data = (source_root / "src/nvidia/generated" / name).read_bytes()
    if hashlib.sha256(data).hexdigest() != pins[name]:
        raise ValueError("pinned NVIDIA source mismatch: " + chip)
    text = data.decode("ascii")
    image = _array_bytes(text, "IMAGE_DBG")[0]
    header = _array_bytes(text, "HEADER_DBG")[0]
    if hashlib.sha256(image).hexdigest() != DEBUG_HASHES[chip]:
        raise ValueError("pinned debug image mismatch: " + chip)
    if header != _array_bytes(text, "HEADER_PROD")[0]:
        raise ValueError("debug and production geometries differ: " + chip)
    return image, header


def decode_images(source_root: Path, output: Path, key: bytes) -> dict:
    validate_key(key)
    images = {chip: extract_debug(source_root, chip) for chip in DEBUG_HASHES}
    ga_image, ga_header = images["GA102"]
    ga_code_end = struct.unpack("<9I", ga_header)[2]
    control_offsets = [offset for offset in range(256, ga_code_end, 16)
                       if ga_image[offset:offset + 16] == ZERO_MARKER]
    if not control_offsets:
        raise ValueError("known-answer marker absent from pinned control image")
    decoded = {chip: decode_code(image, header, key)
               for chip, (image, header) in images.items()}
    if any(decoded["GA102"][offset:offset + 16] != bytes(16) for offset in control_offsets):
        raise ValueError("decrypted control padding differs from the known answer")
    report = {
        "status": "offline debug code only; no payload or hardware execution verified",
        "control": "published AES-zero known answer and pinned GA102 padding",
        "control_offsets": control_offsets,
        "images": {chip: {"code_bytes": len(code), "code_sha256": hashlib.sha256(code).hexdigest(),
                          "secure_code_base": 256} for chip, code in decoded.items()},
        "limits": "Ada instruction boundaries, control flow, canary layout and continuation semantics still require independent analysis. Decrypting debug code does not prove production code identity or an unlock.",
    }
    # All verification precedes creation of output files. Refuse overwrite.
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    for chip, code in decoded.items():
        (output / f"{chip.lower()}-debug-imem.bin").write_bytes(code)
    (output / "decode-report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path, help="new private analysis directory")
    parser.add_argument("--debug-key-file", type=Path, required=True)
    args = parser.parse_args()
    report = decode_images(args.source, args.output, read_key(args.debug_key_file))
    print(json.dumps(report))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, RuntimeError) as error:
        raise SystemExit(str(error))
