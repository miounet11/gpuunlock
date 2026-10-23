#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
"""Compare known Ampere payload gadgets with decoded Ada debug code.

The report establishes matching *instruction shapes*, not semantic equivalence
or a working Ada ROP chain. Both listings must accompany the pinned private
decoded debug images and pass trace_booter_stack's byte/hash checks first.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re

from trace_booter_stack import IMAGE_HASHES, read_instructions
import hashlib


PAIRS = (
    (0x0D03, 0x2171, 26, "register helper called by the Ampere tail"),
    (0x0D44, 0x21B2, 6, "canary epilogue and register carry"),
    (0x1FCE, 0x33FC, 6, "two-register transfer and epilogue"),
    (0x1101, 0x256F, 20, "register write wrapper prefix"),
    (0x84C8, 0x7A02, 10, "outer wrapper epilogue"),
    (0x81EE, 0x771E, 8, "secure-exit prefix"),
)

IMMEDIATE = re.compile(r"0x[0-9a-f]+")


def listing(directory: Path, chip: str) -> dict[int, str]:
    image = (directory / f"{chip}-debug-imem.bin").read_bytes()
    if hashlib.sha256(image).hexdigest() != IMAGE_HASHES[chip]:
        raise ValueError(f"{chip}: decoded image hash mismatch")
    return read_instructions(directory / f"{chip}.asm", image)


def window(ops: dict[int, str], address: int, count: int) -> list[str]:
    addresses = sorted(ops)
    try:
        index = addresses.index(address)
    except ValueError as error:
        raise ValueError(f"no instruction at {address:#x}") from error
    return [ops[where] for where in addresses[index : index + count]]


def shape(operation: str) -> str:
    return IMMEDIATE.sub("IMM", operation)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    ga = listing(args.directory, "ga102")
    ad = listing(args.directory, "ad102")
    matches = []
    for ga_addr, ad_addr, count, role in PAIRS:
        ga_ops = window(ga, ga_addr, count)
        ad_ops = window(ad, ad_addr, count)
        same = [shape(op) for op in ga_ops] == [shape(op) for op in ad_ops]
        matches.append({"ga": hex(ga_addr), "ada": hex(ad_addr), "instructions": count,
                        "normalized_shape_equal": same, "role": role})
        if not same:
            raise ValueError(f"candidate {ga_addr:#x} -> {ad_addr:#x} diverges")

    ada_helper_calls = []
    ad_addresses = sorted(ad)
    for index, address in enumerate(ad_addresses):
        if ad[address] != "lcall 0x2171":
            continue
        previous = ad[ad_addresses[index - 1]] if index else ""
        ada_helper_calls.append({"callsite": hex(address), "previous_instruction": previous})
    if any(call["previous_instruction"] == "mov b32 $r12 $r0" for call in ada_helper_calls):
        raise ValueError("the presumed missing Ampere call sequence has an Ada match")

    print(json.dumps({"matched_gadgets": matches,
                      "ga_tail": "0x5789: mov r12,r0; lcall 0x0d03",
                      "ada_helper_calls": ada_helper_calls,
                      "missing_exact_tail_match": True,
                      "limits": "Static debug-code shapes only; ROP state and production-code identity unverified."}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(str(error))
