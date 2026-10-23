# GPU Unlock 1.1.0 release notes

This release adds an exact-device Ada path for RTX 4070 Ti SUPER
(`10de:2705`) to the RTX 4090 and existing Ampere paths. On one cold
`10de:2705` card with NVIDIA driver `580.178.04`, FP16/BF16 tensor
instructions with FP32 accumulation ran at approximately twice the stock
issue rate under the same 240 W cap. INT8 and scalar modes did not improve.
A matched E4M3 FP8/FP32 CUTLASS GEMM passed verification at **59.326 TF/s
stock → 59.495 TF/s unlocked**, a 0.3% difference. This one FP8 kernel did
not show a meaningful gain; other FP8 kernels remain untested.
The [canary report](ada-2705-report.md) records the stock/unlocked runs,
readbacks, numerical checks, and one-card limits.
NVIDIA CUTLASS Profiler independently reported **177.5 TF/s FP16/FP32** and
**176.3 TF/s BF16/FP32** for verified 4096³ GEMMs on the unlocked card; its
[captured output](evidence/ada2705/README.md) is included. No same-card stock
CUTLASS result was collected, so these are absolute rates rather than a
third-party before/after ratio.
Both FP8 outputs, the exact kernel, and CUDA 12.8 compatibility patch are in
the same evidence directory. NVIDIA's official 706 AI TOPS 4070 Ti SUPER line
does not state the same FP8/FP32 dense-GEMM mode. The [canary report](ada-2705-report.md)
derives a mode-specific architectural peak and explains why it is not an
expected result for this GEMM.

The 2705 path is **experimental and opt-in**. `gpu_unlock.targets=all` never
selects it. A test boot needs `gpu_unlock.targets=<exact full PCI address>`
and `gpu_unlock.ad103_experimental=1`, with the module loaded before NVIDIA
on a genuinely cold card. Preserve a normal boot entry so the option can be
removed after any failed attempt. The code has not been qualified on other
Ada IDs, every 2705 board, or every driver revision.

Clone the GPL-2.0-only repository and use `make install` on a supported
distribution; [Quick Start](../QUICKSTART.md) has copy-paste commands. The
source tarball is provided for review and package builders. The build fetches
SHA-pinned NVIDIA `610.43.03` inputs and generates the required firmware
locally. This source release contains **no NVIDIA firmware binary**. The
generated firmware retains NVIDIA's separate license and notice; review
`firmware/NOTICE.md` before redistributing any resulting binary package.
Do not treat a locally generated firmware package as entirely open source.

The module's source, payload construction, packaging recipes, and host tests
are provided with the GPL-2.0-only source. The Ada payload construction is
credited to TOTORONG's `AD103_win_unlocker`; the Linux loader derives from
Zagitta's `gpu-unlock`, and the RTX 4090 integration/report derives from
elias-gaeros's fork. The original RTX 4090 report describes a separate
single-card result on driver `615.78.08`.

The baseline and unlocked tests on the 2705 canary used the same GPU and
checked CUDA binary. The owner miner resumed at its existing 240 W cap and
produced fresh accepted pool shares with zero rejects. A second full AC cycle
restored the unlock readbacks after the stock FP8 run, and the owner miner
again submitted an accepted share. More cards and cold
boots, larger application workloads, and long-duration stability remain follow-up
qualification steps before broad deployment.
