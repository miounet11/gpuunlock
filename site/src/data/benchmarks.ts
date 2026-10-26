// Same-card stock-vs-unlocked measurements published in the upstream evidence folders.
// Nothing here is extrapolated: each row is one line of a file under docs/evidence/.
//
//   RTX 4090    docs/evidence/rtx4090/{baseline,unlocked-20000,unlocked-40000}.txt
//   RTX 4070 Ti SUPER  docs/evidence/ada2705/tensor-modes-comparison.json
//   RTX 2080 Ti  nlzy/turing-unlock README, cuBLAS FP16-with-FP32-accumulate table

/**
 * Which program produced the number. This is not cosmetic: the MMA-loop rows are the
 * register-resident issue-rate harness, while the CUTLASS row is a single 4096³ kernel
 * timed by the CUTLASS profiler. They answer different questions and must not be read as
 * one table, so the row carries its harness and the page renders them apart.
 */
export type Harness = "mma-loop" | "cutlass";

export interface BenchRow {
  card: string;
  cardSlug: string;
  pciId: string;
  mode: string;
  unit: string;
  stock: number;
  unlocked: number;
  /** unlocked / stock. 1.00 means the unlock did nothing for this path. */
  ratio: number;
  iters: number;
  /** Defaults to "mma-loop" when omitted; the runner was the standard harness. */
  harness?: Harness;
  /**
   * Dense peak for this quantity at this card's own configuration. Only set when the
   * repository carries a number for the same thing; a peak borrowed from a different
   * quantity would turn "at the limit" into a claim nobody measured.
   */
  ceiling?: number;
  /** "spec" = published by the vendor; "derived" = scaled from a published figure. */
  ceilingKind?: "spec" | "derived";
  /** Where the number comes from, including the arithmetic when it was scaled. */
  ceilingBasis?: string;
  note?: string;
}

export interface BenchRun {
  card: string;
  cardSlug: string;
  chip: string;
  sms: number;
  driver: string;
  powerLimitW: number | null;
  source: string;
  rows: BenchRow[];
}

export const BENCH_RUNS: BenchRun[] = [
  {
    card: "GeForce RTX 4090",
    cardSlug: "rtx-4090",
    chip: "AD102",
    sms: 128,
    driver: "unrecorded in the evidence file",
    powerLimitW: 450,
    source: "https://github.com/JustAResearcher/gpu-unlock-ada/tree/main/docs/evidence/rtx4090",
    rows: [
      { card: "RTX 4090", cardSlug: "rtx-4090", pciId: "10de:2684", mode: "f16/f16", unit: "TF/s", stock: 325.7, unlocked: 331.6, ratio: 1.018, iters: 20000, note: "stock run includes one slow sample (306.3); best-of-three" },
      { card: "RTX 4090", cardSlug: "rtx-4090", pciId: "10de:2684", mode: "f16/f32", unit: "TF/s", stock: 165.6, unlocked: 330.8, ratio: 1.998, iters: 20000 },
      { card: "RTX 4090", cardSlug: "rtx-4090", pciId: "10de:2684", mode: "bf16/f32", unit: "TF/s", stock: 165.5, unlocked: 330.3, ratio: 1.996, iters: 20000 },
      { card: "RTX 4090", cardSlug: "rtx-4090", pciId: "10de:2684", mode: "s8/s32", unit: "TF/s", stock: 661.6, unlocked: 659.5, ratio: 0.997, iters: 20000, note: "already at full rate before the unlock" },
      { card: "RTX 4090", cardSlug: "rtx-4090", pciId: "10de:2684", mode: "dp4a", unit: "TF/s", stock: 164.5, unlocked: 164.1, ratio: 0.998, iters: 20000 },
      { card: "RTX 4090", cardSlug: "rtx-4090", pciId: "10de:2684", mode: "ffma", unit: "TF/s", stock: 79.1, unlocked: 79.1, ratio: 1.0, iters: 20000, note: "FP32 was never rate-limited" },
    ],
  },
  {
    card: "GeForce RTX 4070 Ti SUPER",
    cardSlug: "rtx-4070-ti-super",
    chip: "AD103",
    sms: 66,
    driver: "580.178.04",
    powerLimitW: 240,
    source: "https://github.com/JustAResearcher/gpu-unlock-ada/tree/main/docs/evidence/ada2705",
    rows: [
      { card: "RTX 4070 Ti SUPER", cardSlug: "rtx-4070-ti-super", pciId: "10de:2705", mode: "f16/f32", unit: "TFLOP/s", stock: 94.96, unlocked: 188.97, ratio: 1.99, iters: 20000 },
      { card: "RTX 4070 Ti SUPER", cardSlug: "rtx-4070-ti-super", pciId: "10de:2705", mode: "tf32", unit: "TFLOP/s", stock: 47.49, unlocked: 94.51, ratio: 1.99, iters: 20000 },
      { card: "RTX 4070 Ti SUPER", cardSlug: "rtx-4070-ti-super", pciId: "10de:2705", mode: "u4/s32", unit: "TOP/s", stock: 754.81, unlocked: 754.68, ratio: 1.0, iters: 20000, note: "integer path, unaffected" },
      // Same evidence folder, separate CUTLASS profiler run. In GFLOP/s rather than
      // TFLOP/s, which is why the unit is carried per row and not per group.
      // The one row in this file with a ceiling the repository can show its working for.
      // 330.3 TFLOP/s is the Ada whitepaper's RTX 4090 FP8 dense figure at 128 SMs and
      // 2.52 GHz; scaling to this card's 66 SMs and 2.61 GHz gives ~176.4 TFLOP/s, which
      // is docs/ada-2705-report.md's own arithmetic. The measured value sits near a
      // third of that because it is one 4096³ GEMM, not an issue-rate peak — showing
      // the distance is the point, not hiding it.
      { card: "RTX 4070 Ti SUPER", cardSlug: "rtx-4070-ti-super", pciId: "10de:2705", mode: "e4m3/f32", unit: "GFLOP/s", stock: 59325.8, unlocked: 59495.0, ratio: 1.003, iters: 20, harness: "cutlass", ceiling: 176400, ceilingKind: "derived", ceilingBasis: "330.3 TFLOP/s (Ada whitepaper, RTX 4090, 128 SMs, 2.52 GHz, FP8 dense) × 66/128 SMs × 2.61/2.52 GHz = ~176.4 TFLOP/s", note: "CUTLASS 4.8.1, 4096³, device reference required" },
    ],
  },
  {
    card: "GeForce RTX 2080 Ti",
    cardSlug: "rtx-2080-ti",
    chip: "TU102",
    sms: 68,
    driver: "575.51.03",
    powerLimitW: 250,
    source: "https://github.com/nlzy/turing-unlock",
    rows: [
      { card: "RTX 2080 Ti", cardSlug: "rtx-2080-ti", pciId: "10de:1e07", mode: "f16/f32", unit: "TFLOP/s", stock: 50.3, unlocked: 68.3, ratio: 1.36, iters: 1024, note: "M.N.K 1024: 88.4% to 120.0% of the 56.9 TFLOP/s peak" },
      { card: "RTX 2080 Ti", cardSlug: "rtx-2080-ti", pciId: "10de:1e07", mode: "f16/f32", unit: "TFLOP/s", stock: 55.7, unlocked: 91.4, ratio: 1.64, iters: 2048, note: "M.N.K 2048: 97.9% to 160.6% of peak" },
      { card: "RTX 2080 Ti", cardSlug: "rtx-2080-ti", pciId: "10de:1e07", mode: "f16/f32", unit: "TFLOP/s", stock: 53.7, unlocked: 81.7, ratio: 1.52, iters: 4096, note: "M.N.K 4096: 94.4% to 143.6% of peak" },
      { card: "RTX 2080 Ti", cardSlug: "rtx-2080-ti", pciId: "10de:1e07", mode: "f16/f32", unit: "TFLOP/s", stock: 52.8, unlocked: 77.9, ratio: 1.48, iters: 8192, note: "M.N.K 8192: 92.8% to 136.9% of peak" },
    ],
  },
];

/** A row's harness, with the implicit default made explicit. */
export function harnessOf(row: { harness?: Harness }): Harness {
  return row.harness ?? "mma-loop";
}

/**
 * Split rows by harness so a page can label each block. Returns the standard harness
 * first; the CUTLASS block is empty for cards that were not profiled with it.
 */
export function splitByHarness<T extends { harness?: Harness }>(rows: T[]) {
  return {
    mma: rows.filter((r) => harnessOf(r) === "mma-loop"),
    cutlass: rows.filter((r) => harnessOf(r) === "cutlass"),
  };
}

/** The E4M3 FP8 CUTLASS pair, which the fork measured separately and which did not move. */
export const FP8_CUTLASS = {
  card: "RTX 4070 Ti SUPER",
  kernel: "cutlass_tensorop_s16832gemm_e4m3_128x128_64x3_tn_align16",
  stock: { ms: 2.31724, gflops: 59325.8 },
  unlocked: { ms: 2.31066, gflops: 59495.0 },
  ratio: 1.0029,
  source: "https://github.com/JustAResearcher/gpu-unlock-ada/blob/main/docs/evidence/ada2705/README.md",
};
