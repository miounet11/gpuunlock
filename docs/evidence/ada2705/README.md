# RTX 4070 Ti SUPER 10de:2705 evidence

The `stock-*` and `unlocked-*` files are unedited stdout from the same
compiled CUDA binaries on one card, at a 240 W cap. Each MMA mode used 20,000
iterations and three repetitions. Numeric stdout reports cuBLAS-versus-CPU
checks of 65,536 cells for FP16/FP32 and BF16/FP32.

`sm-rates.json` contains the selected read-only NVIDIA RM getter values; the
private GPU UUID is omitted. `transaction-excerpt.txt` contains selected
current-boot kernel messages, with the host name removed. It is an excerpt,
not a complete kernel log. `mining-recovery-excerpt.txt` contains two fresh
accepted-share lines and a later 17-accepted, zero-rejected status sample from
the restored owner miner; credentials are excluded.

`cutlass-unlocked-f16.txt` and `cutlass-unlocked-bf16.txt` are complete stdout
from NVIDIA CUTLASS Profiler 4.8.1, source commit
`91843b71d90737e0a9b86f7d9df213cff5a3526f`, compiled for `sm_89` with CUDA
12.2.140. Only ANSI color escapes were removed for reading; numeric text and
the CSV result rows were preserved. The profiler binary SHA-256 was
`f8327a220b9ca33a012a36e21c31fdbf15bdac6048a2433a266044100d28d264`.
The exact commands selected one `128x128x32` Tensor Core kernel per datatype,
`m=n=k=4096`, 10 warmups, 20 profiling iterations, and required CUTLASS's
`reference_device` verification. Both outputs say `Disposition: Passed` and
`reference_device: Passed`. cuBLAS was not used as this profiler's reference;
the separate `*-numeric.txt` files document the cuBLAS-versus-CPU check.
These are absolute **unlocked** CUTLASS measurements; no same-card stock
CUTLASS run has been made.

`cutlass-unlocked-e4m3-fp32.txt` is complete ANSI-color-stripped stdout for
an unlocked-only E4M3 FP8 input, FP32 accumulate `4096³` GEMM. It used CUTLASS
4.8.1 at the same source commit, CUDA 12.8, one SM89
`cutlass_tensorop_s16832gemm_e4m3_128x128_64x3_tn_align16` kernel, 10 warmups,
20 profiling iterations, and required device-reference verification. The
binary SHA-256 was
`e4b1fb2a5ab6e75bbb79e06ac620bf8ca29438362e2c326209771432ee57a256`.
The output reports `Disposition: Passed`, `reference_device: Passed`,
`2.31066 ms`, and `59,495 GFLOP/s`. This is one specific GEMM implementation,
not a measured FP8 instruction-issue peak or a before/after result.

The FP8 profiler build needed `cutlass-cuda128-atomic.patch` applied to that
CUTLASS source checkout: four `__nv_atomic_load_n` calls in
`include/cutlass/subbyte_reference.h` gained the explicit
`__NV_THREAD_SCOPE_SYSTEM` argument required by the local CUDA 12.8 compiler.
Its SHA-256 is
`b3b1967ecf3b9dfb31d190bdade67c3d3718089ad45d3624b4c4f8d8362a63ee`.
The kernel was compiled with `CUTLASS_NVCC_ARCHS=89`,
`CUTLASS_ENABLE_CUBLAS=OFF`, `CUTLASS_ENABLE_PROFILER=ON`, and
`CUTLASS_LIBRARY_KERNELS=cutlass_tensorop_s16832gemm_e4m3_128x128_64x3_tn_align16`.
The patch and raw numeric output are included so the exact benchmark tool can
be reproduced. The 240 W cap and unlocked boot were the same as for the FP16
and BF16 profiling; no stock FP8 profiling run was made.

The original RTX 4090 report belongs to a different card, driver and host.
See [the 2705 report](../../ada-2705-report.md) for scope and limitations.
