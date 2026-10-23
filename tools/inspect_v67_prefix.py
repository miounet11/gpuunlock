#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
"""Trace the known GA102 V67 stack prefix to its unmatched tail helper.

This uses the pinned payload generator and models register pops at named
gadgets. It is a planning aid for the Ada port, not a Falcon emulator or a
generated Ada payload. Internal function calls are treated as balanced.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import struct
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "firmware"))
from generate_v67 import PAYLOAD_SHA256, build_payload  # noqa: E402


def main() -> None:
    payload = build_payload()
    if hashlib.sha256(payload).hexdigest() != PAYLOAD_SHA256:
        raise ValueError("known GA102 V67 payload hash mismatch")

    def dword(address: int) -> int:
        offset = address - 0x600
        if offset < 0 or offset + 4 > len(payload):
            raise ValueError(f"address outside candidate signature copy: {address:#x}")
        return struct.unpack_from("<I", payload, offset)[0]

    sp = 0xFF30  # independently derived by trace_booter_stack.py
    regs = {f"r{n}": 0 for n in range(16)}
    steps = []

    def popaddret(last_register: int, extra_bytes: int, name: str) -> int:
        nonlocal sp
        before = sp
        for number in range(last_register, -1, -1):
            regs[f"r{number}"] = dword(sp)
            sp += 4
        sp += extra_bytes
        address = dword(sp)
        return_address_slot = sp
        sp += 4
        steps.append({"from": name, "sp_before": hex(before),
                      "return_address_slot": hex(return_address_slot),
                      "return_pc": hex(address), "sp_after": hex(sp),
                      "r0": hex(regs["r0"]), "r10": hex(regs["r10"]),
                      "r11": hex(regs["r11"])})
        return address

    if dword(0x6140) != dword(0xFF4C):
        raise ValueError("global and saved canary would differ")
    pc = popaddret(6, 4, "DMA 0x55b epilogue")
    if pc != 0x0D44:
        raise ValueError("unexpected first GA102 gadget")
    regs["r10"] = regs["r0"]
    pc = popaddret(3, 4, "0x0d44")
    if pc != 0x1FCE:
        raise ValueError("unexpected second GA102 gadget")
    regs["r11"], regs["r10"] = regs["r10"], regs["r0"]
    pc = popaddret(2, 4, "0x1fce")
    if pc != 0x1101 or (regs["r10"], regs["r11"]) != (0x823804, 0xFFFFFFFF):
        raise ValueError("GA102 register-write arguments diverged")
    register_write_intent = {"address": hex(regs["r10"]), "value": hex(regs["r11"]),
                             "entry_pc": hex(pc)}

    # 0x1101 saves r0..r3 in its own frame and restores them before returning.
    # Its prologue/calls are not emulated; with a balanced frame, its return
    # address is at the entry SP.
    return_pc = dword(sp)
    steps.append({"from": "0x1101 balanced-frame assumption", "sp_before": hex(sp),
                  "return_address_slot": hex(sp), "return_pc": hex(return_pc),
                  "sp_after": hex(sp + 4)})
    sp += 4
    if return_pc != 0x84C8:
        raise ValueError("register-write wrapper does not return to expected gadget")
    regs["r10"] = regs["r0"]
    pc = popaddret(0, 4, "0x84c8 first pass")
    if pc != 0x84C8:
        raise ValueError("unexpected repeated wrapper epilogue")
    regs["r10"] = regs["r0"]
    pc = popaddret(0, 4, "0x84c8 second pass")
    if pc != 0x1FCE:
        raise ValueError("unexpected later register transfer")
    regs["r11"], regs["r10"] = regs["r10"], regs["r0"]
    pc = popaddret(2, 4, "0x1fce second pass")
    if pc != 0x5789 or (regs["r10"], regs["r11"], regs["r0"]) != (0, 0x8E18, 0xFFBC):
        raise ValueError(f"GA102 tail arguments diverged: pc={pc:#x}, "
                         f"r10={regs['r10']:#x}, r11={regs['r11']:#x}, "
                         f"r0={regs['r0']:#x}, sp={sp:#x}")

    print(json.dumps({"known_ga_payload_sha256": PAYLOAD_SHA256,
                      "global_canary_and_saved_slot": hex(dword(0xFF4C)),
                      "register_write_intent": register_write_intent,
                      "tail_entry_pc": hex(pc),
                      "tail_helper_arguments": {"r10": hex(regs["r10"]),
                                                "r11": hex(regs["r11"]),
                                                "r0_to_r12": hex(regs["r0"])},
                      "steps": steps,
                      "limits": "First GA102 stage and tail entry only. Register writes, branches, helpers and stock continuation are not emulated."}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        raise SystemExit(str(error))
