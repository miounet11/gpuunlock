# GPU Unlock 1.1.1 release notes

This source release adds a reproducible SM89 tensor instruction probe and
sanitized same-card stock/unlocked evidence for TF32 and unsigned INT4. It
does not change the tested Ada unlock transaction; the kernel module and DKMS
package only update their version metadata from 1.1.0 to 1.1.1.

On one RTX 4070 Ti SUPER (`10de:2705`) with NVIDIA driver `580.178.04` and
the same 240 W cap, the same cubin and CUDA Driver API runner measured:

| Register-resident mode | Stock | Unlocked | Ratio |
| --- | ---: | ---: | ---: |
| FP16 inputs, FP32 accumulate (control) | 94.96 TF/s | 188.97 TF/s | 1.99× |
| TF32 inputs, FP32 accumulate | 47.49 TF/s | 94.51 TF/s | 1.99× |
| Unsigned INT4 inputs, INT32 accumulate | 754.81 TOP/s | 754.68 TOP/s | 1.00× |

All three modes checked 270,336 output cells with zero mismatches in each
state. These all-one, register-resident loops measure instruction issue rate,
not application GEMM or inference speed. The [canary report](ada-2705-report.md)
and [raw numeric outputs](evidence/ada2705/README.md) include the exact
scope, source/cubin hashes, three repetitions and limits. The benchmark
source and Linux reproduction command are in
[`diagnostics/bench/`](../diagnostics/bench/README.md).

The earlier FP16 and BF16 modes with FP32 accumulation also doubled on this
card. FP16 with FP16 accumulation, INT8, and scalar FP32 did not improve;
one matched CUTLASS FP8/FP32 GEMM was effectively unchanged. TF32 is the
additional **measured** gain. Other tensor modes and real workloads require
separate matched tests.

The RTX 4070 Ti SUPER path remains experimental and exact-device opt-in. The
same card also reapplied the unlock on two ordinary warm reboots, including
one selected by a persistent EFI default; this does not establish the same
behavior on other boards. Preserve a normal boot entry and follow the
[Quick Start](../QUICKSTART.md) for first cold test, verification and rollback.

The source archive contains GPL-2.0-only module, generator, packaging and
benchmark source, with no NVIDIA firmware binaries. NVIDIA inputs are fetched
by pinned hashes and generated locally under NVIDIA's separate license.
