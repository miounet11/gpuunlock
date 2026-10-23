# Ada port status

This branch integrates the published AD102-family four-PLM payload and
Linux transaction from `elias-gaeros/gpu-unlock` (commit
`4ec490d49c1cc292c0b4cd5ce5a801b5d2c396dc`), which credits
`TOTORONG/AD103_win_unlocker` (revision
`51df9c17ec89eb8486df52cc9079dde4bd1f9974`). The fork reports a physical
RTX 4090 result and TOTORONG reports a different AD103 RTX 4080 result. This
branch subsequently completed a physical RTX 4070 Ti SUPER `10de:2705` canary:
the stock driver loaded, the NVIDIA RM getter reported full FP32-accumulate
issue rate, and matched CUDA instructions ran at approximately twice their
stock rate. Two cold starts and two later ordinary warm reboots succeeded on
that card; the last warm reboot selected a persistent Ada EFI default. See
[the 2705 canary report](ada-2705-report.md). The path still
requires an extra exact-card opt-in and other Ada IDs remain excluded.

## Verified on October 23, 2026

- NVIDIA's pinned AD102 archive was extracted and checked independently of the
  Ampere archive. Its production image is 56,832 bytes, with data at 32,256 and
  its signature patch at 32,272. The matching GSP boot image is 36,864 bytes.
- `firmware/ada-610.43.03.json` pins both source files, the three stock Ada
  assets, the shared GSP and the published four-PLM payload. The pinned GSP
  contains an Ada signature section at offset 84,267,118 with size 4,096,
  distinct from GA10x. The generated payload SHA-256 is
  `44c36b2d6b3424e53e18f3e55db85c833655de071ce66ce42749588a4a7dc8cb`.
- The kernel now carries separate GA10x and AD10x asset profiles: Booter file,
  exact geometry, GSP signature section, GSP boot image size and payload.
  RTX 4090 `10de:2684` is selected by the fork's existing allowlist. The
  `10de:2705` canary requires `ad103_experimental=1` plus a single exact PCI
  address; it is never selected by `targets=all`.
- The normal firmware build and locally built packages include the three pinned
  stock Ada files, the shared GSP and the four-PLM Ada V67 image. The install
  test checks their hashes.
- DMA cleanup now uses the validated Booter allocation length rather than an
  Ampere constant. The older DRM aperture helper provides build compatibility
  with the target's Ubuntu 5.15 kernel.
- The merged four-PLM module compiled against the canary's
  `5.15.0-177-generic` headers, SHA-256
  `a2afbed0b203025b01544dd150643bfe5049d1565174047eeda78c82296be2fa`.
  All 22 host test methods passed, including mocked GA/AD transactions.
  The module was first loaded from a one-time cold-boot initramfs for the
  exact 2705 canary. Later warm-boot tests selected that same image through
  a one-shot entry and then a persistent EFI default; the normal stock entry
  file remains available.
- The published debug test key independently reproduced the AES-zero control
  `717d1494eaca317ff106195258b38377`. The guarded decoder decrypted the
  pinned GA102 and AD102 debug-code ranges. A second implementation using
  .NET AES produced byte-identical output. The decoded code SHA-256 values are
  `bdb38e3e2920888f3d6c36cfba19b1aacd7b5407bbad80b842a4d0d6d7040c99`
  (GA102) and
  `7cdc788c0732c64d655349bda821e78a3ebb0155324a9f439cc1714ccd8a8a85`
  (AD102). Decrypted binaries remain outside Git.
- The public gist calls that AES control an all-`FF` plaintext. Independent
  .NET and PyCryptodome checks show it is the all-zero plaintext; encrypting
  16 all-`FF` bytes instead gives `fd7e5b57768a309baabcc6903118c8f5`.
  The decoder uses the verified zero control and checks real image padding.
- Applying that public debug key to the pinned production code yielded zero
  matching 16-byte plaintext blocks at the same offsets as debug: 0/2,192 on
  GA102 and 0/2,000 on AD102. The resulting first secure-code block also
  differs. This trial does not decode or identify the production instructions.
- The decoded images disassemble as Falcon FUC5 code. The local listings
  contain 11,153 GA102 and 10,384 AD102 parsed instructions. The direct-call
  targets checked so far fall on decoded instruction boundaries.

## Physical Ada baseline

The read-only RM getter in `tools/read_sm_rates.py` was run on the single
RTX 4070 Ti SUPER canary, PCI ID `10de:2705`, driver 580.178.04. The exact
GPU UUID was checked privately, and BAR0 is 16 MiB. It reported:

| Field | Encoding |
| --- | ---: |
| FMLA32 | 1 (half rate) |
| IMLA2 | 1 (half rate) |
| IMLA4 | 1 (half rate) |
| IMLA0, FMLA16, DP, FFMA, IMLA1, IMLA3 | 0 (full rate) |

The exact meaning of IMLA2 and IMLA4 for individual instructions is not inferred
here. The query does not map BARs, write GPU registers, submit firmware, reset
the GPU, create a CUDA context, or execute a GPU kernel. It creates temporary
RM client/device/subdevice handles and closes the file descriptors on exit.

Fresh host-account rental counters and clients were empty, rented volume was
zero, VMs were disabled, and local Docker had no containers. The existing
owner miner kept its process identity during the latest build. Its 240 W limit and
loaded 2670/810 MHz clocks matched before and after the read-only query and
CPU-only builds. This describes the pre-canary baseline; the later guarded
benchmark briefly paused and restored owner mining, followed by fresh accepted
shares and zero new rejects.

## Remaining work

The original decoder-material gap is resolved. The published four-PLM chain
reproduces its pinned hash, and TOTORONG's selected-path model passes against
our independently decoded AD102 debug image. The exact 2705 canary then
validated production execution and NVIDIA 580.178.04 handoff on one physical
board, with a matching 240 W stock/unlocked benchmark and numerical check.
Further independent cold boots, larger application GEMMs, extended stability,
and other Ada cards remain unverified. No fleet-wide opt-in has been enabled.

The earlier one-write tail hypothesis below is retained as research history.
It is superseded by the published four-PLM payload and must not be used for a
hardware attempt.

The signature-copy path is structurally the same in both decoded images:
`WprMeta+0x50` supplies the DMA length, the destination is DMEM `0x600`, and
the comparison of the copied length happens *after* the DMA helper returns.
`tools/trace_booter_stack.py` checks the decoded image hashes and the actual
instruction bytes, then accounts for each call, frame allocation and `mpush`
from `_start` to that DMA helper. On both GA102 and AD102, the saved DMA return
address is at DMEM `0xFF50`, its saved canary is at `0xFF4C`, and the stack
pointer after `mpush $r6` is `0xFF30`. The global canary differs: `0x6140` on
GA102 and `0x5F50` on AD102. A candidate copy from `0x600` through `0xFFFF`
would cover all three slots. The GA102 result independently reproduces the
known Ampere layout. This trace assumes intervening calls return with balanced
stacks and does not prove the production firmware has identical code.

The local gadget comparison checks exact decoded instruction bytes and then
compares instruction shapes with immediate values masked. The following
correspondences matched over their audited instruction windows:

| GA102 debug IMEM | AD102 debug IMEM | Role in the Ampere chain |
| ---: | ---: | --- |
| `0x0D03` | `0x2171` | helper called by the later register operation |
| `0x0D44` | `0x21B2` | epilogue and register transfer |
| `0x1FCE` | `0x33FC` | two-register transfer and epilogue |
| `0x1101` | `0x256F` | register-write wrapper prefix |
| `0x84C8` | `0x7A02` | outer wrapper epilogue |
| `0x81EE` | `0x771E` | secure-exit prefix |

The Ampere tail enters `0x5789` at `mov r12,r0; lcall 0x0D03`. There is no
matching Ada callsite for `mov r12,r0; lcall 0x2171`. The three direct Ada
calls to that helper instead source `r12` from `r2` or `r1`; their surrounding
frame and exit behavior differ. This is an exact porting gap, not evidence that
an alternate chain cannot be built. Masked-immediate similarity alone does not
establish an Ada payload.

`tools/inspect_v67_prefix.py` replays the pinned Ampere payload's stack pops
through the unmatched tail entry. It derives the first register-write intent
(`0x823804 <- 0xFFFFFFFF`) and the later `0x5789` entry arguments
(`r10=0`, `r11=0x8E18`, `r0=0xFFBC`, which the gadget copies to `r12`).
The Ada `0x22E2` callsite sources that pointer from `r1`. An offline hypothesis
aliases `r1`, `r2`, and `r3` to the same already-consumed stack word `0xFFBC`.
The pointer equality makes the success-path comparison equal regardless of
the helper's output. Setting the unused `0xFFCC` word to zero makes the helper
error path skip its additional I/O call. `tools/plan_ada_tail.py` verifies the
listed Ada debug-code instructions and traces both branches through the saved
canary at `0xFFD0` to the `0x771E` secure-exit prefix at SP `0xFFF0`.
It deliberately emits a JSON hypothesis, not a runnable payload. It assumes
the helper returns with a balanced stack and preserves its saved registers;
it does not emulate helper side effects, prove production-code identity, or
claim the first register write works on Ada hardware.

Across the secure-code ranges, the two debug archives share 171 distinct
16-byte ciphertext blocks. The production archives share none. One block
containing an Ampere continuation location has an Ada counterpart, but most
payload gadget blocks do not. This establishes useful code-comparison material,
not working Ada gadget addresses or control-flow validity.

The 2705 canary used a target-kernel build, fresh rental/storage/client
checks, full AC cold power, and exact readback gates for marker, HALT,
required permissions, selectors and effective rate. The encrypted debug and
production images differ; this physical result validates the selected chain
on one 2705 board, not every instruction or another board's path. The
[canary report](ada-2705-report.md) records stock-driver handoff, output
equality and matched-binary throughput. Further cards need independent gates.

The unrelated RISC-V interpreter published in the examined CMP reference repo
is not a Falcon FUC5 decoder; its successful mock tests are not accepted as
evidence that an Ada SEC2 payload executes correctly. Envytools' Falcon decoder
was built locally for the real instruction set. REA 6.7.0 can orchestrate
Ghidra analysis, but its raw-binary architecture list does not include Falcon;
no REA or Ghidra installation was required for the verified decoding above.
The current public `faucon` source has an assembler and disassembler but no
implemented CPU emulator; old descriptions of an emulator do not validate
this payload.

## Reproduce stock extraction and host checks

Use NVIDIA open-gpu-kernel-modules revision
`452cec62d827034798072827d3866d1881662b77`. Keep downloaded NVIDIA source and
derived binary assets outside Git and preserve their notices.

```sh
python3 firmware/extract_boot_assets.py /path/to/nvidia-source /tmp/ada-assets --chip ad102
GPU_UNLOCK_NVIDIA_SOURCE=/path/to/nvidia-source make test
python3 tools/read_sm_rates.py --expect-uuid GPU-EXACT-UUID
```

The last command requires the Linux NVIDIA driver and exactly one GPU with the
specified UUID. It is optional and not part of the offline tests. The standard
installation targets generate both pinned Ampere and Ada assets locally. They
do not ship NVIDIA firmware binaries in the source archive.

## Decoder preparation

The decoded binaries and keys remain outside the source archive. No upstream
question or hardware readout has been posted.

`firmware/decode_debug_booter.py` accepts a locally supplied debug test-key file
and refuses it unless it reproduces the published AES-zero control. It checks
the pinned NVIDIA sources and the corresponding control blocks, preserves the
secure-code base at 0x100, excludes DMEM from decryption, and refuses to overwrite
an existing output directory. Keys are neither printed nor saved. Decrypted
binaries remain local and are not inputs to the standard package targets.

```sh
python3 -m pip install -r requirements-research.txt
python3 firmware/decode_debug_booter.py /path/to/nvidia-source /private/new-output \
  --debug-key-file /private/debug-test-key
```

The published debug test key is documented at
`https://gist.github.com/nvlight/fc7479629b0ace094873e58ba7d75eb2/743ca6adaa87034054112936f37e146126b7705c`.
This is a public debug/test key, not a production signing key. Store its local
input file and all decoded output outside Git. The private stack audit can be
repeated with:

```sh
python3 tools/trace_booter_stack.py /private/decoded-listings
python3 tools/compare_booter_gadgets.py /private/decoded-listings
python3 tools/inspect_v67_prefix.py
python3 tools/plan_ada_tail.py /private/decoded-listings
```

The directory must contain the decoded `ga102-debug-imem.bin` and
`ad102-debug-imem.bin` plus their `ga102.asm` and `ad102.asm` envydis listings.
The audit checks only the debug-code path through the signature DMA call.
