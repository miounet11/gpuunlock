# RTX 4070 Ti SUPER 10de:2705 evidence

The `stock-*` and `unlocked-*` files are unedited stdout from the same
compiled CUDA binaries on one card, at a 240 W cap. Each MMA mode used 20,000
iterations and three repetitions. Numeric stdout reports cuBLAS-versus-CPU
checks of 65,536 cells for FP16/FP32 and BF16/FP32.

`sm-rates.json` contains the selected read-only NVIDIA RM getter values; the
private GPU UUID is omitted. `transaction-excerpt.txt` contains selected
current-boot kernel messages, with the host name removed. It is an excerpt,
not a complete kernel log. `mining-recovery-excerpt.txt` contains two fresh
accepted-share lines from the restored owner miner; credentials are excluded.

The original RTX 4090 report belongs to a different card, driver and host.
See [the 2705 report](../../ada-2705-report.md) for scope and limitations.
