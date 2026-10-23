#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
"""Audit the signature DMA stack entry in pinned, decoded debug Booters.

This is offline research. It traces only the observed call chain and assumes
intervening subroutine calls return with a balanced stack. It neither generates
an unlock payload nor proves that production firmware has identical code.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re


IMAGE_HASHES = {
    "ga102": "bdb38e3e2920888f3d6c36cfba19b1aacd7b5407bbad80b842a4d0d6d7040c99",
    "ad102": "7cdc788c0732c64d655349bda821e78a3ebb0155324a9f439cc1714ccd8a8a85",
}

# Each event is (address, exact instruction, stack bytes used). Falcon lcall
# pushes one dword; mpush rN pushes r0..rN, or (N+1) dwords.
PATHS = {
    "ga102": (
        (0x541, "lcall 0x82ef", 4),
        (0x82EF, "add $sp -0x10", 16),
        (0x82F6, "mpush $r0", 4),
        (0x8441, "lcall 0x84a5", 4),
        (0x84A5, "add $sp -0x4", 4),
        (0x84AC, "mpush $r0", 4),
        (0x84B8, "lcall 0x22cb", 4),
        (0x22CB, "add $sp -0x1c", 28),
        (0x22D2, "mpush $r6", 28),
        (0x22D6, "add $sp -0x10", 16),
        (0x276A, "lcall 0x3715", 4),
        (0x3715, "add $sp -0xc", 12),
        (0x371C, "mpush $r7", 32),
        (0x3720, "add $sp -0xc", 12),
        (0x3781, "lcall 0x55b", 4),
        (0x55B, "add $sp -0x4", 4),
        (0x55E, "mpush $r6", 28),
    ),
    "ad102": (
        (0x541, "lcall 0x781f", 4),
        (0x781F, "add $sp -0x10", 16),
        (0x7826, "mpush $r0", 4),
        (0x797B, "lcall 0x79df", 4),
        (0x79DF, "add $sp -0x4", 4),
        (0x79E6, "mpush $r0", 4),
        (0x79F2, "lcall 0x36f9", 4),
        (0x36F9, "add $sp -0x1c", 28),
        (0x3700, "mpush $r6", 28),
        (0x3704, "add $sp -0x10", 16),
        (0x3B98, "lcall 0x4b55", 4),
        (0x4B55, "add $sp -0xc", 12),
        (0x4B5C, "mpush $r7", 32),
        (0x4B60, "add $sp -0xc", 12),
        (0x4BC1, "lcall 0x1cd7", 4),
        (0x1CD7, "add $sp -0x4", 4),
        (0x1CDA, "mpush $r6", 28),
    ),
}

CHECKS = {
    "ga102": {
        0x567: "mov $r15 0x6140",
        0x573: "mov $r9 $sp",
        0x576: "add b32 $r9 $r9 0x1c",
        0x57B: "st b32 D[$r9] $r15",
        0x3770: "ld b32 $r13 D[$r10+0x50]",
        0x377B: "mov $r10 0x600",
        0x3785: "ld b32 $r9 D[$r1+0x50]",
    },
    "ad102": {
        0x1CE3: "mov $r15 0x5f50",
        0x1CEF: "mov $r9 $sp",
        0x1CF2: "add b32 $r9 $r9 0x1c",
        0x1CF7: "st b32 D[$r9] $r15",
        0x4BB0: "ld b32 $r13 D[$r10+0x50]",
        0x4BBB: "mov $r10 0x600",
        0x4BC5: "ld b32 $r9 D[$r1+0x50]",
    },
}

FRAME_REGIONS = {
    "ga102": ((0x82EF, 0x8441), (0x84A5, 0x84B8),
              (0x22CB, 0x276A), (0x3715, 0x3781), (0x55B, 0x560)),
    "ad102": ((0x781F, 0x797B), (0x79DF, 0x79F2),
              (0x36F9, 0x3B98), (0x4B55, 0x4BC1), (0x1CD7, 0x1CDC)),
}

LINE = re.compile(r"^([0-9a-f]{8}):\s+((?:[0-9a-f]{2}\s+)+)\s*(?:[BC]\s+)?(.+)$")


def read_instructions(assembly: Path, image: bytes) -> dict[int, str]:
    instructions = {}
    for line in assembly.read_text().splitlines():
        match = LINE.match(line)
        if not match:
            continue
        address = int(match.group(1), 16)
        encoded = bytes.fromhex(match.group(2))
        if image[address : address + len(encoded)] != encoded:
            raise ValueError(f"disassembly byte mismatch at {address:#x}")
        if address in instructions:
            raise ValueError(f"duplicate instruction at {address:#x}")
        instructions[address] = match.group(3).strip()
    return instructions


def verify(instructions: dict[int, str], address: int, operation: str) -> None:
    actual = instructions.get(address)
    if actual != operation:
        raise ValueError(f"{address:#x}: expected {operation!r}, found {actual!r}")


def audit(directory: Path, chip: str) -> dict:
    image = (directory / f"{chip}-debug-imem.bin").read_bytes()
    digest = hashlib.sha256(image).hexdigest()
    if digest != IMAGE_HASHES[chip]:
        raise ValueError(f"{chip}: decoded image hash mismatch")
    instructions = read_instructions(directory / f"{chip}.asm", image)
    for address, operation in CHECKS[chip].items():
        verify(instructions, address, operation)

    counted_frame_ops = {address for address, _, _ in PATHS[chip]}
    for begin, end in FRAME_REGIONS[chip]:
        for address, operation in instructions.items():
            if begin <= address < end and (operation.startswith(("add $sp ", "mpush ", "mov $sp "))
                    and address not in counted_frame_ops):
                raise ValueError(f"{chip}: unaccounted stack operation at {address:#x}: {operation}")

    sp = 0x10000
    trace = []
    dma_return_slot = None
    for address, operation, stack_bytes in PATHS[chip]:
        verify(instructions, address, operation)
        sp -= stack_bytes
        trace.append({"address": hex(address), "operation": operation, "sp_after": hex(sp)})
        if operation in ("lcall 0x55b", "lcall 0x1cd7"):
            dma_return_slot = sp

    if dma_return_slot != 0xFF50 or sp + 0x1C != 0xFF4C:
        raise ValueError(f"{chip}: stack layout diverged from audited path")
    guard = 0x6140 if chip == "ga102" else 0x5F50
    copy_start, copy_length = 0x600, 0xFA00
    if not (copy_start <= guard < copy_start + copy_length
            and copy_start <= sp + 0x1C < copy_start + copy_length
            and copy_start <= dma_return_slot < copy_start + copy_length):
        raise ValueError(f"{chip}: the proposed copy would miss a required stack slot")

    return {
        "decoded_debug_image_sha256": digest,
        "parsed_instructions": len(instructions),
        "signature_length_source": "WPR metadata offset +0x50",
        "dma_destination": hex(copy_start),
        "dma_return_slot": hex(dma_return_slot),
        "dma_saved_canary_slot": hex(sp + 0x1C),
        "canary_global": hex(guard),
        "candidate_copy_end_exclusive": hex(copy_start + copy_length),
        "trace": trace,
        "limits": "Static debug-code path only. No production-code identity, full control flow, or payload execution verified.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="private decoded images and envydis listings")
    args = parser.parse_args()
    print(json.dumps({chip: audit(args.directory, chip) for chip in PATHS}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(str(error))
