# RTX 4090 evidence excerpts

These files support the [RTX 4090 experiment report](../../../rtx4090-register-report.md).
The successful firmware transaction was measured on 2026-10-23, using one
RTX 4090 and one successful cold power-on. The implementation preceded the
publication cleanup; the cleaned module needs an independent hardware repeat.

| File | Contents |
|---|---|
| [baseline.txt](baseline.txt) | Original benchmark stdout, 20,000 iterations, three repetitions per mode |
| [unlocked-20000.txt](unlocked-20000.txt) | Original unlocked benchmark stdout, 20,000 iterations, three repetitions per mode |
| [unlocked-40000.txt](unlocked-40000.txt) | Original unlocked repeat stdout, 40,000 iterations, three repetitions per mode |
| [registers.txt](registers.txt) | Selected cold, firmware, payload, selector, FLR, independent post-unload, post-driver and post-benchmark messages |
| [telemetry-summary.json](telemetry-summary.json) | Summary of 100 ms telemetry samples across the two unlocked invocations |
| [SHA256SUMS](SHA256SUMS) | Checksums for the evidence files above |

The benchmark text is copied unchanged. Its `TF/s` label also covers integer
operation rates; the report labels those `TOP/s`. It counts two operations per
multiply-accumulate and uses no sparsity multiplier. The baseline was collected
before the successful unlock's cold power-on. Benchmark kernels, launch shape,
timing method and build flags were the same before and after unlock; comments
were clarified during publication cleanup.

Register excerpts preserve the original register values and message contents
except that wall-clock timestamps, PCI location prefixes and host-assigned BAR0
address/length metadata were removed. Section labels identify sampling stages.
The telemetry summary omits its original wall-clock start/end fields. It records
32 total samples and the ranges/means of the 26 active samples; the power range
includes a transition into load and is not a per-kernel peak measurement.
These are selected evidence excerpts, not a complete raw machine-log archive.

Check the included files from this directory with:

```sh
sha256sum -c SHA256SUMS
```

The AD102 payload comes from
[TOTORONG/AD103_win_unlocker](https://huggingface.co/TOTORONG/AD103_win_unlocker)
and the Linux loader derives from
[Zagitta/gpu-unlock](https://github.com/Zagitta/gpu-unlock). See the report and
[firmware notice](../../../firmware/NOTICE.md) for provenance and licensing.
