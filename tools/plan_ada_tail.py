#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
"""Explore an Ada ROP tail in memory without writing a firmware payload.

The plan assumes the decoded AD102 debug code, and models only stack pops and
the two branch outcomes of the candidate tail. It does not prove the helper's
side effects, production address identity, hardware register map, or boot.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "firmware"))
from generate_v67 import PAYLOAD_SHA256, build_payload  # noqa: E402
from trace_booter_stack import IMAGE_HASHES, read_instructions, verify  # noqa: E402


WORD_PATCHES = {
    # Existing GA102 gadget words translated to decoded AD102 addresses.
    0xF950: 0x21B2,
    0xF968: 0x33FC,
    0xF97C: 0x256F,
    0xF980: 0x7A02,
    0xF98C: 0x7A02,
    0xF998: 0x33FC,
    0xF9BC: 0x21B2,  # subsequently overwritten; no longer a return slot
    0xF9D4: 0x33FC,
    0xF9E8: 0x21C0,
    0xF9EC: 0x771E,
    # Ada-specific tail: r3, r2 and r1 alias the helper's output slot.
    0xF954: 0xFFBC,
    0xF99C: 0xFFBC,
    0xF9A0: 0xFFBC,
    0xF9AC: 0x22E2,
    0xF9CC: 0,  # keeps the helper-error branch away from another I/O call
}

TAIL_INSTRUCTIONS = {
    0x2171: "add $sp -0x4",
    0x2178: "mpush $r3",
    0x21BD: "mpopaddret $r3 0x4",
    0x256F: "add $sp -0x4",
    0x2572: "mpush $r3",
    0x2581: "add b32 $r2 $r2 0x10",
    0x2584: "st b32 D[$r2] $r9",
    0x25C4: "mpopaddret $r3 0x4",
    0x21C0: "add $sp -0x8",
    0x21C3: "mov $r15 0x5f50",
    0x21C7: "mpush $r5",
    0x21CE: "add b32 $r9 $r9 0x1c",
    0x21D3: "st b32 D[$r9] $r15",
    0x21D5: "mov $r0 0x1c",
    0x21D7: "shr b8 $r9 $r10 0x4",
    0x21DA: "cmp b8 $r9 0x2",
    0x21DD: "bra a 0x223f",
    0x2258: "mpopaddret $r5 0x8",
    0x22E2: "mov b32 $r12 $r1",
    0x22E4: "lcall 0x2171",
    0x22E8: "bra b32 $r10 0x0 ne 0x22fb",
    0x22EC: "ld b32 $r15 D[$r2]",
    0x22EE: "ld b32 $r9 D[$r1]",
    0x22F0: "cmp b8 $r15 $r9",
    0x22F2: "bra ne 0x22d2",
    0x22F5: "st b8 D[$r3] $r15",
    0x22F7: "lbra 0x2327",
    0x22FB: "mov $r9 $sp",
    0x22FE: "add b32 $r9 $r9 0x1c",
    0x2301: "ld b32 $r12 D[$r9]",
    0x2303: "clear b8 $r9",
    0x2305: "st b8 D[$r3] $r9",
    0x2307: "bra b32 $r12 0x0 e 0x2325",
    0x2325: "mov $r10 0x1a",
    0x2327: "mov $r9 $sp",
    0x232A: "add b32 $r9 $r9 0x20",
    0x232D: "ld b32 $r15 D[$r9]",
    0x232F: "mov $r9 0x5f50",
    0x2333: "ld b32 $r9 D[$r9]",
    0x2335: "cmp b32 $r15 $r9",
    0x233E: "mpopaddret $r5 0xc",
    0x33FC: "mov b32 $r11 $r10",
    0x33FE: "mov b32 $r10 $r0",
    0x3400: "cmp b32 $r15 $r9",
    0x3409: "mpopaddret $r2 0x4",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="private decoded AD102 image and envydis listing")
    args = parser.parse_args()
    image = (args.directory / "ad102-debug-imem.bin").read_bytes()
    if hashlib.sha256(image).hexdigest() != IMAGE_HASHES["ad102"]:
        raise ValueError("decoded AD102 debug image hash mismatch")
    instructions = read_instructions(args.directory / "ad102.asm", image)
    for address, operation in TAIL_INSTRUCTIONS.items():
        verify(instructions, address, operation)

    payload = bytearray(build_payload())
    if hashlib.sha256(payload).hexdigest() != PAYLOAD_SHA256:
        raise ValueError("GA102 V67 seed hash mismatch")
    for offset, value in WORD_PATCHES.items():
        struct.pack_into("<I", payload, offset, value)

    def dword(address: int) -> int:
        return struct.unpack_from("<I", payload, address - 0x600)[0]

    def popaddret(sp: int, highest_reg: int, extra: int) -> tuple[int, int, dict[int, int]]:
        regs = {}
        for reg in range(highest_reg, -1, -1):
            regs[reg] = dword(sp)
            sp += 4
        sp += extra
        target = dword(sp)
        return target, sp + 4, regs

    # Up to the second 0x33fc transfer, only the named stack operations matter.
    pc, sp, first_regs = popaddret(0xFF30, 6, 4)
    if pc != 0x21B2 or first_regs[0] != 0xFFFFFFFF:
        raise ValueError("first Ada gadget layout mismatch")
    pc, sp, second_regs = popaddret(sp, 3, 4)
    if pc != 0x33FC or second_regs[0] != 0x823804:
        raise ValueError("register-write address layout mismatch")
    pc, sp, third_regs = popaddret(sp, 2, 4)
    if pc != 0x256F or third_regs[0] != 0:
        raise ValueError("register-write entry layout mismatch")
    if dword(sp) != 0x7A02:
        raise ValueError("register-write frame return mismatch")
    sp += 4  # 0x256f's balanced function frame returns through its entry SP
    pc, sp, _ = popaddret(sp, 0, 4)
    if pc != 0x7A02:
        raise ValueError("first outer epilogue mismatch")
    pc, sp, reg0 = popaddret(sp, 0, 4)
    if pc != 0x33FC or reg0[0] != 0:
        raise ValueError("second outer epilogue mismatch")
    pc, sp, tail_regs = popaddret(sp, 2, 4)
    if pc != 0x22E2 or sp != 0xFFB0:
        raise ValueError("candidate tail entry mismatch")
    if (tail_regs[2], tail_regs[1], tail_regs[0], second_regs[3]) != (0xFFBC,) * 4:
        raise ValueError("candidate helper pointer alias mismatch")
    if dword(0x5F50) != dword(0xFFD0) or dword(0xFFCC) != 0:
        raise ValueError("tail canary or error-path guard mismatch")

    # With r1 == r2 == r3 == 0xFFBC, the helper-success comparison is
    # identical regardless of the helper's output. Its byte store writes the
    # low byte back to that same slot. The helper-error path writes zero there,
    # then D[SP+0x1c] == 0 skips its further I/O call.
    outcomes = []
    pre_branch_payload = bytes(payload)
    for helper_result in ("zero/success", "nonzero/error"):
        payload = bytearray(pre_branch_payload)
        return_pc, return_sp, _ = popaddret(sp, 5, 12)
        if return_pc != 0x33FC or return_sp != 0xFFD8:
            raise ValueError("candidate Ada tail epilogue mismatch")
        skip_pc, skip_sp, skip_regs = popaddret(return_sp, 2, 4)
        if skip_pc != 0x21C0 or skip_sp != 0xFFEC or skip_regs[0] != 0x19C:
            raise ValueError(f"candidate outer skip-function linkage mismatch: "
                             f"pc={skip_pc:#x}, sp={skip_sp:#x}, r0={skip_regs[0]:#x}")
        # The 0x21c0 prologue saves its canary at SP+0x1c, overwriting its
        # already-consumed entry word at 0xffe8. r10 receives the popped r0
        # fill value 0x19c; its low-byte upper nibble is 0x9, so the 'above 2'
        # branch goes straight to the epilogue at 0x223f.
        if ((skip_regs[0] & 0xFF) >> 4) <= 2:
            raise ValueError("candidate skip branch does not bypass its body")
        struct.pack_into("<I", payload, 0xFFE8 - 0x600, dword(0x5F50))
        skip_frame_sp = skip_sp - 8 - 24
        if skip_frame_sp != 0xFFCC or dword(skip_frame_sp + 0x1C) != dword(0x5F50):
            raise ValueError("candidate skip-function canary mismatch")
        exit_pc, exit_sp, _ = popaddret(skip_frame_sp, 5, 8)
        if exit_pc != 0x771E or exit_sp != 0xFFF0:
            raise ValueError(f"candidate secure-exit linkage mismatch: "
                             f"pc={exit_pc:#x}, sp={exit_sp:#x}")
        outcomes.append({"helper_result": helper_result,
                         "tail_branch": "0x22f7 -> 0x2327" if helper_result.startswith("zero")
                                        else "0x22fb -> 0x2325 -> 0x2327",
                         "tail_return_slot": "0xffd4", "next_pc": hex(return_pc),
                         "skip_function_pc": hex(skip_pc),
                         "exit_pc": hex(exit_pc), "sp_at_exit": hex(exit_sp)})

    print(json.dumps({
        "status": "static Ada debug-code hypothesis only; do not execute",
        "ad102_debug_code_sha256": IMAGE_HASHES["ad102"],
        "candidate_patch_words": {hex(0x600 + offset): hex(value)
                                  for offset, value in sorted(WORD_PATCHES.items())},
        "first_register_write_intent": {"address": "0x823804", "value": "0xffffffff"},
        "helper_entry": "0x2171", "tail_callsite": "0x22e2",
        "aliased_output_pointer": "0xffbc",
        "tail_saved_canary_slot": "0xffd0",
        "branch_outcomes": outcomes,
        "unverified": [
            "helper 0x2171 side effects and completion",
            "branch behavior beyond the listed instructions",
            "production Booter instruction identity and address correspondence",
            "Ada FEAT_OVR register address and privileges",
            "signature metadata restoration and stock-driver handoff",
            "runtime correctness and tensor throughput",
        ],
    }, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(str(error))
