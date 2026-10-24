# SM89 tensor issue-rate probe

`tensor_modes_issue.cu` measures register-resident FP16/FP32, TF32/FP32, and
unsigned INT4/INT32 `mma.sync` instruction issue rates. Each warp keeps eight
independent accumulator chains in flight. `tensor_modes_driver_runner.py`
times 20,000 iterations three times, then checks all 270,336 output cells
per mode against the expected all-ones result. It requires the exact GPU UUID,
power cap, and cubin SHA-256 so a different card or binary cannot silently
enter a matched comparison.

Build on Linux with the CUDA toolkit for an SM89 card:

```sh
nvcc -ptx -arch=sm_89 -O3 -std=c++17 \
  -o tensor_modes_issue_sm89.ptx diagnostics/bench/tensor_modes_issue.cu
ptxas -arch=sm_89 -O3 -o tensor_modes_issue_sm89.cubin \
  tensor_modes_issue_sm89.ptx
sha256sum tensor_modes_issue_sm89.cubin
python3 diagnostics/bench/tensor_modes_driver_runner.py \
  tensor_modes_issue_sm89.cubin \
  --sha256 PASTE-THE-CUBIN-SHA256 \
  --expect-uuid GPU-PASTE-YOUR-EXACT-UUID \
  --expect-power-limit 240
```

Set `--expect-power-limit` to the cap actually used on your card. Run only
when the GPU is free of customer and owner workloads. For a stock/unlocked
comparison, use the **same card, cubin, power cap, driver, launch settings,
and clock policy** in both states. Record live clocks and restore the original
workload afterward.

This is an instruction-throughput probe, not a GEMM or inference benchmark.
All-one inputs check the exercised arithmetic path but do not validate general
numeric accuracy or predict application speedup. The
[RTX 4070 Ti SUPER report](../../docs/ada-2705-report.md) records one matched
240 W comparison and its limits.
