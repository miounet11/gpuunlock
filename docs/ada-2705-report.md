# RTX 4070 Ti SUPER (10de:2705) Ada canary

On October 23, 2026, the AD102-family four-PLM payload ran on one cold
RTX 4070 Ti SUPER (`10de:2705`, 66 SMs) before the unmodified NVIDIA
`580.178.04` driver. FP16 and BF16 tensor instructions with FP32 accumulation
then issued at about twice their stock rates. This is one physical card and
one cold power-on; it does not establish support for every AD103 board or a
repeatable result across cold boots.
The [evidence directory](evidence/ada2705/README.md) contains unedited
benchmark stdout, selected boot messages, rate readbacks and sanitized mining
recovery lines, each with a SHA-256 manifest.

The Linux kernel was `5.15.0-177-generic`. The source module was built from
commit `a7bcce015fd034cb930f5acc7f2ce4f60158f5bd`; the resulting `.ko`
SHA-256 was `a2afbed0b203025b01544dd150643bfe5049d1565174047eeda78c82296be2fa`.
It was loaded from a one-time initramfs entry with the **single exact PCI
target** and `ad103_experimental=1`. The normal boot entry stayed unchanged.
No host identifiers or customer credentials are included here.
Release 1.1.0 changes only module metadata and the DKMS package version
relative to that tested kernel logic. The 1.1.0 module separately compiled
against the same 5.15 headers, but has not had another cold hardware run.

## Firmware and driver checks

The module loaded the pinned NVIDIA `610.43.03` stock AD102 Booter/GSP assets
and the generated 64,000-byte payload, SHA-256
`44c36b2d6b3424e53e18f3e55db85c833655de071ce66ce42749588a4a7dc8cb`.
The kernel log recorded the expected `0x67b00001` payload marker, halted SEC2,
the three required permission writes, selector readback `SS0=0x88888888`
and `SS1=0x8`, post-FLR persistence of those selectors, and
`gpu_unlock: unlocked`. The fourth, observational FBPA field remained
`0xffffff0f`; it is not counted as an unlocked permission. The stock NVIDIA
driver subsequently loaded and CUDA kernels completed. The current-boot log
scan found no NVRM Xid, GPU-fallen-off, or GSP/SEC2 timeout.

The independent read-only NVIDIA RM getter reported these issue-rate encodings
on the same device before and after the cold transaction:

| Field | Stock | After unlock |
| --- | ---: | ---: |
| FMLA32 | 1 (half) | 0 (full) |
| IMLA2 | 1 (half) | 0 (full) |
| IMLA4 | 1 (half) | 0 (full) |

The other six fields read as 0 on both runs. Register and RM readbacks are
checks of the mechanism; the CUDA timings below provide independent work-rate
evidence.

## Matched CUDA checks

The same `sm_89` benchmark binary ran with 20,000 iterations, three timed
repetitions per mode, and the same 240 W GPU power cap before and after. It
launches register-resident `HMMA`, `IMMA`, `dp4a`, and scalar `FFMA` kernels;
the binary's launch and synchronization errors are checked. The table shows
the best of three runs, with two operations counted per multiply-accumulate.

| Mode | Stock | After unlock | Ratio |
| --- | ---: | ---: | ---: |
| FP16 inputs, FP32 accumulate | 95.0 TF/s | 189.9 TF/s | 2.00× |
| BF16 inputs, FP32 accumulate | 95.0 TF/s | 189.7 TF/s | 2.00× |
| FP16 inputs, FP16 accumulate | 189.9 TF/s | 189.9 TF/s | 1.00× |
| INT8 inputs, INT32 accumulate | 379.5 TOP/s | 379.5 TOP/s | 1.00× |
| `dp4a` | 94.4 TOP/s | 94.4 TOP/s | 1.00× |
| scalar FP32 `ffma` | 45.4 TF/s | 45.5 TF/s | 1.00× |

All three FP16/FP32 repetitions were 95.0 TF/s before and
189.8–189.9 TF/s after. BF16/FP32 was 94.9–95.0 TF/s before and
189.6–189.7 TF/s after. Both runs used the same card and driver. Active
telemetry samples reported 2820 MHz SM clock before and 2670–2820 MHz after;
the cap stayed 240 W. The brief kernels and 200 ms sensor interval do not
establish comparable sustained board or wall power. This instruction benchmark
does not predict the gain of every application. **FP8 was not measured** in
this before/after test, so no FP8 performance claim follows from it.

An independent cuBLAS FP16/FP32 and BF16/FP32 GEMM correctness check compared
65,536 output cells per mode with a CPU reference. Both the stock and unlocked
runs had zero mismatches and maximum absolute error zero for these deterministic
inputs. Other input distributions and larger workloads still need validation.

The owner miner resumed after the benchmarks on the same GPU and 240 W cap,
reconnected to its existing pool, and advanced from 2 to 3 accepted shares
with zero rejected shares in its new process log. This shows workload recovery;
it is not evidence of a mining speedup from the tensor unlock.

## Limits and reproduction

The experiment ran from a one-time boot entry. It did not alter the default
boot entry or install a permanent fleet policy. A second cold-boot reproduction,
representative application GEMM benchmark, longer stability test, and
card-by-card eligibility checks are required before expanding the allowlist.
Never treat `targets=all` as an Ada validation path: the exact `10de:2705`
opt-in is intentional.

The module and payload generator are GPL-2.0-only source. NVIDIA firmware has
separate license terms and is generated locally from pinned inputs during the
package build. The publicly distributable source package contains no NVIDIA
firmware binary.
