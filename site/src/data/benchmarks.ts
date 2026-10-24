// Same-card stock-vs-unlocked measurements published in the upstream evidence folders.
// Nothing here is extrapolated: each row is one line of a file under docs/evidence/.
//
//   RTX 4090    docs/evidence/rtx4090/{baseline,unlocked-20000,unlocked-40000}.txt
//   RTX 4070 Ti SUPER  docs/evidence/ada2705/tensor-modes-comparison.json

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
    ],
  },
];

/** The E4M3 FP8 CUTLASS pair, which the fork measured separately and which did not move. */
export const FP8_CUTLASS = {
  card: "RTX 4070 Ti SUPER",
  kernel: "cutlass_tensorop_s16832gemm_e4m3_128x128_64x3_tn_align16",
  stock: { ms: 2.31724, gflops: 59325.8 },
  unlocked: { ms: 2.31066, gflops: 59495.0 },
  ratio: 1.0029,
  source: "https://github.com/JustAResearcher/gpu-unlock-ada/blob/main/docs/evidence/ada2705/README.md",
};
