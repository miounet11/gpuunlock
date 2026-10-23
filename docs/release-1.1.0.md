# GPU Unlock 1.1.0 release notes

This release adds an exact-device Ada path for RTX 4070 Ti SUPER
(`10de:2705`) to the RTX 4090 and existing Ampere paths. On one cold
`10de:2705` card with NVIDIA driver `580.178.04`, FP16/BF16 tensor
instructions with FP32 accumulation ran at approximately twice the stock
issue rate under the same 240 W cap. INT8 and scalar modes did not improve;
FP8 was not measured.
The [canary report](ada-2705-report.md) records the stock/unlocked runs,
readbacks, numerical checks, and one-card limits.

The 2705 path is **experimental and opt-in**. `gpu_unlock.targets=all` never
selects it. A test boot needs `gpu_unlock.targets=<exact full PCI address>`
and `gpu_unlock.ad103_experimental=1`, with the module loaded before NVIDIA
on a genuinely cold card. Preserve a normal boot entry so the option can be
removed after any failed attempt. The code has not been qualified on other
Ada IDs, every 2705 board, or every driver revision.

Download the GPL-2.0-only source from the release or clone the repository,
then use `make install` on a supported distribution. The build fetches
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
produced fresh accepted pool shares with zero rejects. Repeat cold boots,
larger application workloads, and long-duration stability remain follow-up
qualification steps before broad deployment.
