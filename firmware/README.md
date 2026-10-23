# Pinned 610.43.03 firmware

`make inputs` runs `fetch_artifacts.py`, which downloads the NVIDIA open kernel
module source archive and the exact CachyOS `nvidia-utils` package pinned in
`artifacts-610.43.03.json`. Downloads use HTTPS and are checked against their
SHA-256 before they enter the cache; cached files are rechecked on every run.
Nothing downloaded is executed or installed.

`make firmware` then builds the nine files the kernel module loads from
`gpu-unlock/610.43.03/`:

- `generate_v67.py` extracts `gsp_ga10x.bin` and the NVIDIA license from the
  package and generates the 64,000-byte `v67-ga102-610.43.03.bin` and
  `v67-ad102-610.43.03-four-plm.bin` payloads.
- `extract_boot_assets.py` builds `booter_load_ga102.bin`,
  `gsp_boot_ga102.bin` and `gsp_boot_desc_ga102.bin`, plus their three AD102
  equivalents, from the source archive.

The AD102 payload reproduces the four-write chain pinned in the
manifest at SHA-256 `44c36b2d6b3424e53e18f3e55db85c833655de071ce66ce42749588a4a7dc8cb`.
Its ordered targets are WPR_CFG, FBPA, WPR and FEAT_OVR_PLM; the first value is
`0xfffff0ff`, and the other three are `0xffffffff`. It then requests mailbox0
marker `0x67b00001` and cleanup. Runtime readback checks the marker, required
permission registers and SEC2 HALT before applying selectors. The
[RTX 4090 report](../rtx4090-register-report.md) records production execution,
FLR/stock-driver persistence and approximately doubled FP32-accumulate tensor
throughput on one card. This payload and its plaintext-derived instruction
addresses come from [TOTORONG's AD103_win_unlocker](https://huggingface.co/TOTORONG/AD103_win_unlocker).

The manifest records payload offsets separately from DMEM addresses. With the
modeled copy base `0x600`, the canary at payload `0xf94c` lies at DMEM `0xff4c`,
and the return slot at payload `0xf950` lies at DMEM `0xff50`. The AD102
FEAT_OVR_PLM address word is at payload `0xf9cc`; GA102 uses `0xf960`.

Both scripts check every input and output against its pinned SHA-256 before
writing anything. Python 3 and the `zstd` command are required for extraction. See
[NOTICE.md](NOTICE.md) for provenance and licensing.
