# RTX 4090 (AD102) speed-select unlock: experiment and results

**An RTX 4090 unlock was demonstrated on 2026-10-23. FP16 and BF16 tensor
throughput with FP32 accumulation approximately doubled, and the override
survived FLR, stock NVIDIA initialization and CUDA load.**

| Instruction mode | Baseline | Unlocked, 20k iterations | Unlocked, 40k iterations |
|---|---:|---:|---:|
| FP16 / FP32 accumulate | 165.6 TF/s | **331.6 TF/s** | **330.8 TF/s** |
| BF16 / FP32 accumulate | 165.5 TF/s | **330.6 TF/s** | **330.3 TF/s** |
| FP16 / FP16 accumulate | 325.7 TF/s | 306.3 TF/s | 331.6 TF/s |
| INT8 / INT32 accumulate | 661.6 TOP/s | 661.4 TOP/s | 659.5 TOP/s |
| `dp4a` | 164.5 TOP/s | 164.4 TOP/s | 164.1 TOP/s |
| scalar FP32 `ffma` | 79.1 TF/s | 79.1 TF/s | 79.1 TF/s |

The AD102 payload and the analysis needed to construct it come from
**[TOTORONG/AD103_win_unlocker](https://huggingface.co/TOTORONG/AD103_win_unlocker)**.
The Linux loader and boot packaging derive from
**[Zagitta/gpu-unlock](https://github.com/Zagitta/gpu-unlock)**. This work
integrates the public payload, adds AD102 asset selection and transaction checks,
and measures the result on an RTX 4090. It does not claim original discovery of
the AD102 chain.

This report covers one physical card and one successful cold power-on. Baseline
measurements were collected before that successful power-on; this is a comparison
using the same benchmark kernels, launch geometry, timing method and build flags,
not an in-place baseline measured before firmware execution on the successful
cold boot. Independent cold-boot reproduction and representative numerical
workload validation remain pending. The successful experiment used the
implementation before the publication cleanup. The cleaned module retains the
normal `targets=` interface and has host-side validation; it has not yet had a
separate hardware confirmation.

The [evidence directory](docs/evidence/rtx4090/README.md) contains the original
benchmark text and selected sanitized register-log excerpts. These excerpts
support the principal result and do not constitute a complete machine log.

## 1. Test configuration and inputs

| Item | Value |
|---|---|
| Device | NVIDIA GeForce RTX 4090, `10de:2684`, AD102, 128 SMs, compute capability 8.9 |
| Chip register | `PMC_BOOT_0 = 0x192000a1` |
| Kernel | Linux `7.2.4` |
| Confirmation driver | unmodified NVIDIA `615.78.08` |
| Generated firmware inputs | pinned NVIDIA `610.43.03` source and binary package |
| AD102 payload | `v67-ad102-610.43.03-four-plm.bin`, 64,000 bytes |
| Payload SHA-256 | `44c36b2d6b3424e53e18f3e55db85c833655de071ce66ce42749588a4a7dc8cb` |
| Booter asset | `booter_load_ad102.bin`, 57,672 bytes |
| Booter SHA-256 | `6ee05b20e1dc244c08c052f36ef28469b8d09f4955d1fe33e48a179e11a7fd49` |
| Benchmark build | `nvcc -O3 -arch=sm_89` |
| Power limit / reported maximum SM clock | 450 W / 3135 MHz |

All nine generated assets matched the manifest's pins before the firmware run.
The reproduced AD102 payload also matched the published generator and shipped
payload byte-for-byte. Firmware integrity checks are implemented in
[firmware/generate_v67.py](firmware/generate_v67.py),
[firmware/extract_boot_assets.py](firmware/extract_boot_assets.py) and the
[artifact manifest](firmware/artifacts-610.43.03.json). Licensing and the pinned
upstream revision are recorded in [firmware/NOTICE.md](firmware/NOTICE.md).

## 2. Mechanism: why no locally decrypted firmware was needed

Direct host writes to the feature permission register and speed selectors were
ignored both on a cold card and after FWSEC-FRTS alone. The missing step was a
protected-register write performed by authenticated firmware with the necessary
privilege.

The AD103 project published an AD102-family V67 data payload already derived
from decrypted debug-booter analysis. Its instruction addresses supplied the
plaintext-derived knowledge that was missing from the Linux port. This module
loads the unchanged signed production booter; SEC2 authenticates and decrypts
that booter internally. The crafted signature data overwrites stack slots and
redirects returns through existing authenticated booter instructions. Those
instructions perform the protected writes. Host-provided executable code is
not introduced into the authenticated image.

The successful run establishes that this chain's selected addresses work in the
tested production booter. It does not establish equality of the complete debug
and production plaintext images, and no decrypted firmware file is distributed
by this repository.

The transaction is:

1. Claim an eligible cold card, save PCI state and allocate DMA buffers.
2. Run the board ROM's signed FWSEC-FRTS firmware on the GSP Falcon to establish
   the firmware reservation.
3. Start the signed AD102 booter on SEC2 with the crafted V67 signature data.
   The published chain targets WPR_CFG, FBPA, WPR and FEAT permissions, requests
   mailbox marker `0x67b00001` and halts.
4. Require the marker, SEC2 HALT, accessible PCI/BAR state and the expected
   WPR_CFG, WPR and FEAT permission readbacks before host selector writes.
5. Apply SS0 `0x88888888` and SS1 `0x8`; require their readbacks and all nine
   effective speed-select fields to be zero.
6. Perform PCIe FLR, verify reset containment and retained FEAT/selector state,
   restore PCI state and release resources.
7. Let the stock NVIDIA driver initialize the card, then verify the registers
   and benchmark the same instruction modes.

The payload attempts four permission stores in this order, according to its
published model: WPR_CFG (`0x1fa7cc`) → FBPA (`0x9a0148`) → WPR (`0x1fa7c4`) →
FEAT (`0x823804`). The observed permission transitions and terminal marker support
the chain's execution. The exact internal store order was not independently
observed on a bus trace. FBPA did not change and is observational rather than a
required success condition.

The AD102 payload is `0xfa00` bytes of repeated `0x0000019c` words, patched between
`0xf948` and `0xf9fc`. The canary and return slot are at file offsets
`0xf94c`/`0xf950`, corresponding to DMEM addresses `0xff4c`/`0xff50` with the
modeled copy base `0x600`. Its FEAT target word is at file offset `0xf9cc`;
GA102 uses `0xf960`. Treating file offsets as DMEM addresses would misdescribe
the stack layout.

## 3. Measured firmware transaction

No NVIDIA driver had loaded before the successful transaction. Exactly one
FWSEC start, one AD102 SEC2 start and one FLR were issued during that power-on.
The legacy capture and host-write probe paths were disabled for this run and
have been removed from the public module.

| Stage | Required evidence | Observed |
|---|---|---|
| Asset integrity | correct payload and booter pins | passed |
| Cold state | no bound driver, bus mastering off, WPR2 down, FEAT permission closed | passed |
| FWSEC | scratch `0`, expected FRTS/WPR2 reservation | passed |
| Payload | marker `0x67b00001`, SEC2 HALT, required permissions and accessible PCI/BAR | passed |
| Selectors | SS0/SS1 `0x88888888`/`0x8`, effective readout zero | passed |
| Reset | FLR `0`, FEAT/selector state retained, WPR2 down, DMA contained | passed |
| Driver | same FEAT/selector/readout values after stock initialization | passed |
| Performance | increase beyond baseline variation, with scalar/integer controls | passed |

FWSEC returned scratch `0` and WPR2 low/high `0x05ff2000:0x05ff2e00`.
Approximately 234 ms after SEC2 start, the payload gate completed with mailbox
`0x67b00001`, CPUCTL `0x10` and the required permission values. Host writes then
changed the effective readout from `0x00410080` to zero.

| Register | Cold | After payload, before selectors | After FLR and module unload |
|---|---|---|---|
| WPR_CFG PLM `0x001fa7cc` | `0x0004cb8f` | `0xfffff0ff` | `0x0004cb8f` |
| FBPA PLM `0x009a0148` | `0xffffff0f` | `0xffffff0f` | `0xffffff0f` |
| WPR PLM `0x001fa7c4` | `0x0004cb8f` | `0xffffffff` | `0x0004cb8f` |
| FEAT PLM `0x00823804` | `0xffffff8f` | `0xffffffff` | `0xffffffff` |
| SS0 `0x0082381c` | `0x44023025` | `0x44023025` | `0x88888888` |
| SS1 `0x00823820` | `0x00000007` | `0x00000007` | `0x00000008` |
| Effective readout `0x00823818` | `0x00410080` | `0x00410080` | `0x00000000` |

Only four of the 31 sampled feature-cluster words changed between cold state and
the independent post-unload sample: FEAT PLM, SS0, SS1 and effective readout.
The OTP fuse words still reported `FMLA32`, `IMLA2` and `IMLA4` as `1`. This is a
feature override, not an OTP fuse rewrite. WPR/WPR_CFG returned to their original
values at FLR while the FEAT override persisted. The unchanged FBPA value does
not establish that its attempted store was unnecessary or that it is physically
read-only.

The module restored PCI command `0x3`, verified GSP halted, WPR2 down and no
pending transactions, released DMA, and left no retained module reference.
Successful module removal preceded an independent read-only register sample.
NVIDIA `615.78.08` was then loaded and initialized the GPU. Separate samples
after driver initialization and after CUDA benchmarks still showed FEAT PLM
`0xffffffff`, SS0 `0x88888888`, SS1 `0x8` and effective readout zero. No NVIDIA
Xid/error was found in the collected kernel journal after confirmation.

The evidence for these transitions is in
[registers.txt](docs/evidence/rtx4090/registers.txt). A successful module load
return alone is insufficient: per-card failures are logged without necessarily
failing module initialization. The stage readbacks and independent samples are
what establish this result.

## 4. Benchmark method and limits

The [CUDA benchmark](diagnostics/bench/mma_bench.cu) measures instruction issue
throughput rather than end-to-end GEMM or an application. Its loops keep operands
and accumulators in registers, with no memory traffic inside the timed loop:

- WMMA m16n16k16 for FP16/FP16, FP16/FP32, BF16/FP32 and INT8/INT32;
- eight independent tensor accumulator chains per warp, and 32 independent
  chains for scalar `dp4a` and FP32 FMA;
- 1,056 blocks of 256 threads (eight warps); the card reports 128 active SMs;
- one warm-up launch before each CUDA-event timed launch, three timed
  repetitions per mode, reporting the best;
- 20,000 iterations for the baseline and first unlocked invocation, then
  40,000 iterations for the unlocked repeat.

The publication cleanup updates historical benchmark comments; kernels, launch
geometry, operation counting, timing and build flags match the measured runs.

```sh
mkdir -p build
nvcc -O3 -arch=sm_89 -o build/mma_bench diagnostics/bench/mma_bench.cu
build/mma_bench 20000 3
build/mma_bench 40000 3
```

These commands require CUDA and a loaded NVIDIA driver; they belong after a
completed unlock and driver handoff.

The benchmark counts two operations per multiply-accumulate. WMMA uses
`16 × 16 × 16 × 2 = 8192` operations per call per warp; `dp4a` and scalar FMA
counts are per lane. The raw program prints `TF/s` for every mode, including
integer operations; the report labels integer results `TOP/s` to state the
units correctly. No sparsity multiplier is used.

Generated-code inspection before the successful unlock found the intended
`HMMA.16816.F16`, `HMMA.16816.F32`, `HMMA.16816.F32.BF16`, `IMMA.16816.S8.S8`,
`IDP.4A.S8.S8` and `FFMA` instructions in the respective loops. Earlier baseline
runs at 10k, 20k and 40k iterations gave stable FP32-accumulate, integer and
scalar rates, consistent with real timed loops rather than eliminated work.
The accumulator results are only kept live to inhibit compiler elimination;
the program does not compare numerical results to a reference.

The full principal samples are retained in
[baseline.txt](docs/evidence/rtx4090/baseline.txt),
[unlocked-20000.txt](docs/evidence/rtx4090/unlocked-20000.txt) and
[unlocked-40000.txt](docs/evidence/rtx4090/unlocked-40000.txt).

| Mode | Baseline runs | Unlocked 20k runs | Unlocked 40k runs |
|---|---|---|---|
| FP16 / FP16 | 306.3 / 306.3 / 325.7 | 306.3 / 306.3 / 306.3 | 331.6 / 331.6 / 330.9 |
| FP16 / FP32 | 165.6 / 165.6 / 165.6 | 331.6 / 331.6 / 331.6 | 330.8 / 330.8 / 330.8 |
| BF16 / FP32 | 165.4 / 165.5 / 165.5 | 329.5 / 330.6 / 329.6 | 330.3 / 328.3 / 328.2 |
| INT8 / INT32 | 661.5 / 661.6 / 661.4 | 661.4 / 661.3 / 661.3 | 659.5 / 659.4 / 659.4 |
| `dp4a` | 164.5 / 164.5 / 164.5 | 164.4 / 164.4 / 164.4 | 164.1 / 164.0 / 164.1 |
| scalar FP32 | 79.1 / 79.1 / 79.1 | 79.1 / 79.0 / 79.1 | 79.0 / 79.1 / 79.1 |

FP16/FP32 improved by **2.002×** and BF16/FP32 by **1.998×** in the 20k best
samples. The longer repeat confirmed the increase. FP16/FP16's first group was
sensitive to clock ramp both before and after unlock; the longer unlocked run
reached 331.6 TF/s. INT8, `dp4a` and scalar FP32 remained near baseline. These
measurements do not support a claim that INT8 throughput doubled.

Across the two unlocked invocations, 100 ms telemetry sampling yielded 32
samples, 26 with nonzero utilization. Active-sample SM clocks were
2550–2760 MHz, memory 10251 MHz, power 23.81–224.89 W and temperature 35–52 °C.
The low power value includes a transition into load; sampled readings are not
per-kernel peaks. The power limit remained 450 W and the reported maximum SM
clock 3135 MHz. No power limit, clock setting or driver patch was applied for
the unlock comparison.

## 5. Register reference and earlier observations

These are BAR0 offsets. Feature names follow the
[public Ampere/CMP register reference](https://gist.github.com/nvlight/813a866dc69d417497a427f4208321ff).
The AD102 experiment measured values at those offsets; it does not independently
establish every name or field mapping.

| Offset | Name | Cold value / interpretation |
|---|---|---|
| `0x00820000` | FUSECTRL | `0xe0040000` |
| `0x008200fc` | FUSE_SS_PLM | `0xffffffff` |
| `0x0082038c` | SECURE_FEAT_OVR_QUADRO_WR_SECURE | `1` |
| `0x0082059c` | FUSE_SS_FFMA | `0` |
| `0x008207d4` | FUSE_SS_FMLA16 | `0` |
| `0x008207d8` | FUSE_SS_FMLA32 | `1` |
| `0x008207dc` / `0x008207e0` | FUSE_SS_IMLA0 / IMLA1 | `0` / `0` |
| `0x008207e4` / `0x008207e8` / `0x008207ec` | FUSE_SS_IMLA2 / IMLA3 / IMLA4 | `1` / `0` / `1` |
| `0x00823804` | FEAT_OVR_PLM | `0xffffff8f`, permission gate |
| `0x00823814` | FEAT_READOUT_0 | `0x00000233` |
| `0x00823818` | FEAT_READOUT_1 | `0x00410080`, nine 3-bit fields under mask `0x07ffffff` |
| `0x0082381c` | FEAT_OVR_SM_SPEED_SELECT | `0x44023025` on the successful power-on |
| `0x00823820` | FEAT_OVR_SM_SPEED_SELECT_1 | `0x7` |
| `0x00409664` / `0x00409668` | FECS selector / readout copies | `0xbadf5040` cold and with driver bound |
| `0x00504204` | SM_ISSUE_RATE_MODIFIER | `5`, unchanged by driver |
| `0x001fa824` / `0x001fa828` | WPR2 low / high | `0x1ffffe00` / `0` cold |
| `0x00824140` / `0x008241e0` | booter / FWSEC fuse | `1` / `1` |

Cold `FEAT_READOUT_1` decodes from low field to high as
`0 0 2 0 0 2 0 2 0`. The mapping of those three reduced fields to the named
FMLA/IMLA fuse words is not established. Each SS0 nibble has an enable bit at
bit 3 and a 3-bit value; `8` enables a zero-value override. SS1 uses a 4-bit
selector. Its isolated effect on performance has not been measured.
The high byte of cold SS0 varied between earlier power-ons while all override
enable bits stayed clear; its meaning is unverified.

SEC2 is at `0x00840000`, its FBIF at `0x00840600` and Falcon2 window at
`0x00841000`. GSP equivalents are `0x00110000`, `0x00110600` and `0x00111000`.
Falcon CPUCTL offset `0x100` reports HALT as `0x10`; mailbox0/1 are at
`0x040`/`0x044`. An EXIT interrupt alone does not prove payload execution:
earlier negative controls produced EXIT even when host-written instructions
were refused. The explicit marker, HALT and independent permission readbacks
are all required.

Earlier experiments on this card also found:

- Host PLM/selector writes were ignored before the signed payload, including
  after successful FWSEC-FRTS alone.
- The GA102 booter halted without opening FEAT permissions on AD102. Selecting
  the AD102 booter and AD102 chain was necessary for the demonstrated result.
- The tested SEC2 boot modes did not execute unsigned host microprograms.
  A self-loop, a DMEM store and instruction-count timing controls did not show
  execution, despite an EXIT status.
- Tested PIO/DMA/tag/port paths could not extract loaded secure IMEM blocks;
  secure reads returned `0xdead5ec1`, while plain readable blocks were not
  fetchable as executable code. ROM inspection did not yield a plaintext
  Falcon image.
- Earlier cold-versus-driver samples left the 31 feature-cluster words unchanged.
  The successful unlock additionally shows that stock initialization preserved
  the modified FEAT/selector state.

These are bounded observations from the investigation, not proofs that all
possible firmware extraction or authentication attacks are impossible. Research
probe and capture modules used for them are excluded from the public module.

The tested AD102 booter geometry is image size `0xde00`, OS data
`0x7e00`/`0x6000`, application code offset/size `0x100`/`0x7d00`, and signature
patch offset `0x7e10`. The GSP boot image is 36,864 bytes with descriptor code
`0x4800` and data `0x800`. The board ROM's FWSEC DMEM length was `0xd80`,
requiring 14 rounded 256-byte DMA blocks. Transfer validation must allow the
unaligned length while checking its rounded bounds.

## 6. Public module behavior and reproduction

The [README](README.md) describes package installation and the normal boot
interface. `gpu_unlock.targets=` is the opt-in. RTX 4090 `10de:2684` selects
AD102 assets automatically; legacy accepted GA102/GA104 IDs keep their original
path. Other Ada IDs are rejected. A common Ada booter archive is not evidence
that this module is safe or effective on every Ada chip.

The module requires an unbound, powered card with bus mastering off and an
eligible since-power-on firmware state. It stops before selector application
if the payload marker, HALT or required permissions fail. It verifies selector
readbacks and effective readout before and after FLR, along with PCI identity,
BAR stability and reset containment. An inaccessible all-ones MMIO read cannot
by itself be treated as an open permission register.

When firmware may still access DMA and reset containment cannot be verified,
the module keeps its buffers and reference until power-off. It must not be
force-unloaded in that state. The successful experiment released these resources;
retention is a failure path, not a necessary part of a successful handoff.

For a hardware reproduction, use a full power-off and let the initramfs module
run before any GPU driver. Do not use `nvidia-smi`, CUDA, NVML or
`nvidia-modprobe` as a pre-unlock check: they can load NVIDIA by name. A normal
modprobe blacklist alone does not prevent that. Keep the kernel log and inspect
all transaction stages. Do not map BAR0 with a second experiment module while
`gpu_unlock` is executing. The independent sampler was used only after the
unlock module had unwound and been removed, and later with NVIDIA bound.

After a successful FLR handoff, initialize the stock driver, read the selectors
and effective readout independently, then run the benchmark. After a failed or
retained firmware run, power off before a new attempt; a warm reboot is not a
fresh card. Power-off persistence of the override is not claimed.

The experiment's host validation passed 13 tests, including complete mocked
AD102 transactions and negative cases for missing/wrong markers, permission
mismatch, marker before HALT, selector rejection, effective-readout rejection or
loss, corrupted payload copy, metadata races and DMA retention. The module and
read-only sampler also built with LLVM. The public cleanup removes research
parameters and capture paths while retaining the normal transaction checks.
The cleaned publication tree passes nine host tests, including seven C
components and full mocked GA102/AD102 transactions, plus LLVM module and sampler
builds. Passing a host test suite or module build does not replace a hardware repeat.

## 7. Attribution and open work

The decisive AD102 reference is
[TOTORONG/AD103_win_unlocker](https://huggingface.co/TOTORONG/AD103_win_unlocker),
particularly `source/firmware-tools/ad102_payload.py`,
`docs/ANALYSIS.en.md`, the published AD102 booter disassembly excerpts and the
shipped four-PLM payload. That project reports approximately doubled
FP32-accumulate throughput on its RTX 4080/AD103 setup. Those external results
are attribution and context; the measurements above are the RTX 4090 result.

The Linux module derives from
[Zagitta/gpu-unlock](https://github.com/Zagitta/gpu-unlock), whose GA102 V67
lineage includes
[WildFlash1st/cmp90hx-unlock](https://github.com/WildFlash1st/cmp90hx-unlock).
Nouveau's Falcon and GSP loader code, NVIDIA's published open-module source and
[envytools](https://github.com/envytools/envytools) informed the loading and
register investigation. Source provenance, pinned hashes and preserved GPL/MIT
notices are in [firmware/NOTICE.md](firmware/NOTICE.md),
[firmware/artifacts-610.43.03.json](firmware/artifacts-610.43.03.json) and
[licenses/](licenses/). NVIDIA firmware retains its own license terms.

The next useful checks are an independent cold-power-on reproduction using the
cleaned module, a representative numerical workload with reference comparisons,
and longer sustained-load validation. Remaining technical questions include
the effective-readout field mapping, the isolated SS1 effect, the necessity of
each intermediate WPR/WPR_CFG/FBPA store, the AD102 scrubber reservation rule,
and compatibility beyond the specific production booter and RTX 4090 tested.
