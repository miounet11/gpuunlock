// Benchmark modes, grouped by what they actually exercise.
//
// This file is metadata only: it names the paths and explains them. The measured numbers
// stay in benchmarks.ts, which is a line-for-line copy of the upstream evidence files.
//
// Two of these groups are deliberately separate even though both print "f16/f32":
//
//   Ada issue-rate   register-resident `mma.sync` issue rate, all-one inputs, 8 chains
//                    (diagnostics/bench/tensor_modes_issue.cu, docs/evidence/ada2705)
//   Turing GEMM      cuBLAS FP16-in/FP32-accumulate GEMM at four M.N.K sizes
//                    (nlzy/turing-unlock README)
//
// A 2.0x on the first and a 1.36x on the second are not the same quantity, so averaging
// them or plotting them on one axis would invent a comparison that nobody made.

export type ModeGroupId =
  | "tensor-f16-f32"
  | "tensor-bf16-f32"
  | "tensor-f16-f16"
  | "tensor-tf32"
  | "tensor-int8"
  | "tensor-int4"
  | "tensor-fp8"
  | "dp4a"
  | "fp32-ffma"
  | "gemm-f16-f32";

export interface ModeGroup {
  id: ModeGroupId;
  /** Mode string as printed in the evidence files, used to match rows. */
  matches: string[];
  /** What the measurement exercises, in one sentence. */
  exercises: string;
  /** The unit the rows are printed in. */
  unit: string;
  /** Rate-limited by the SM speed-select fuse? Decides whether an unlock can move it. */
  gated: boolean;
  /** Where the number comes from, verbatim from the evidence folder. */
  method: string;
}

export const MODE_GROUPS: ModeGroup[] = [
  {
    id: "tensor-f16-f16",
    matches: ["f16/f16"],
    exercises: "FP16 multiply with an FP16 accumulator, full tensor-core rate",
    unit: "TF/s",
    gated: false,
    method:
      "Register-resident mma.m16n16k16 issue rate, 8 independent accumulator chains per warp, best of three timed runs",
  },
  {
    id: "tensor-f16-f32",
    matches: ["f16/f32"],
    exercises: "FP16 multiply with an FP32 accumulator, the shape most inference kernels use",
    unit: "TF/s",
    gated: true,
    method:
      "Register-resident mma.m16n16k16 issue rate, 8 independent accumulator chains per warp, best of three timed runs",
  },
  {
    id: "tensor-bf16-f32",
    matches: ["bf16/f32"],
    exercises: "BF16 multiply with an FP32 accumulator",
    unit: "TF/s",
    gated: true,
    method:
      "Register-resident mma.m16n16k16 issue rate, 8 independent accumulator chains per warp, best of three timed runs",
  },
  {
    id: "tensor-tf32",
    matches: ["tf32"],
    exercises: "TF32 multiply with an FP32 accumulator",
    unit: "TFLOP/s",
    gated: true,
    method:
      "Register-resident MMA issue rate at a 240 W cap, 20,000 iterations, three timed reps, all 270,336 output cells checked per state",
  },
  {
    id: "tensor-int8",
    matches: ["s8/s32"],
    exercises: "INT8 multiply with an INT32 accumulator",
    unit: "TF/s",
    gated: false,
    method:
      "Register-resident mma.m16n16k16 issue rate, 8 independent accumulator chains per warp, best of three timed runs",
  },
  {
    id: "tensor-int4",
    matches: ["u4/s32"],
    exercises: "Unsigned INT4 multiply with an INT32 accumulator",
    unit: "TOP/s",
    gated: false,
    method:
      "Register-resident MMA issue rate at a 240 W cap, 20,000 iterations, three timed reps, all 270,336 output cells checked per state",
  },
  {
    id: "tensor-fp8",
    matches: ["e4m3/f32"],
    exercises: "E4M3 FP8 multiply with an FP32 accumulator through CUTLASS",
    unit: "GFLOP/s",
    gated: false,
    method:
      "CUTLASS 4.8.1 profiler, one cutlass_tensorop_s16832gemm_e4m3_128x128_64x3_tn_align16 kernel, 4096³, 10 warmups, 20 profiling iterations, device reference required",
  },
  {
    id: "dp4a",
    matches: ["dp4a"],
    exercises: "The integer dot-product instruction, 4 INT8 MACs per lane",
    unit: "TF/s",
    gated: false,
    method:
      "Register-resident dp4a.s32.s32 issue rate, 8 independent accumulator chains per warp, best of three timed runs",
  },
  {
    id: "fp32-ffma",
    matches: ["ffma"],
    exercises: "Scalar FP32 fused multiply-add, the CUDA-core path",
    unit: "TF/s",
    gated: false,
    method:
      "Register-resident fma.rn.f32 issue rate, 8 independent accumulator chains per warp, best of three timed runs",
  },
  {
    id: "gemm-f16-f32",
    matches: ["f16/f32"],
    exercises:
      "FP16 multiply with an FP32 accumulator, measured as a cuBLAS GEMM at four M.N.K sizes",
    unit: "TFLOP/s",
    gated: true,
    method:
      "cuBLAS GEMM, M.N.K 1024/2048/4096/8192, as tabulated in the nlzy/turing-unlock README",
  },
];

const BY_ID = new Map(MODE_GROUPS.map((g) => [g.id, g]));

export function getModeGroup(id: string): ModeGroup | undefined {
  return BY_ID.get(id as ModeGroupId);
}

/**
 * Which group a measured row belongs to. `f16/f32` is ambiguous — the Turing run is a
 * GEMM and the Ada runs are issue-rate — so the card decides, not the mode string.
 */
export function groupForRow(cardSlug: string, mode: string, iters: number): ModeGroupId {
  if (mode === "f16/f32" && cardSlug === "rtx-2080-ti") return "gemm-f16-f32";
  const hit = MODE_GROUPS.find((g) => g.id !== "gemm-f16-f32" && g.matches.includes(mode));
  // Every measured row currently maps; a new mode must be registered here rather than
  // silently landing in a wrong group.
  return hit ? hit.id : "fp32-ffma";
}

/** Groups that at least one card has actually measured. */
export function measuredGroups(rowsByCard: { cardSlug: string; mode: string; iters: number }[]): ModeGroupId[] {
  const seen = new Set<ModeGroupId>();
  for (const r of rowsByCard) seen.add(groupForRow(r.cardSlug, r.mode, r.iters));
  return MODE_GROUPS.filter((g) => seen.has(g.id)).map((g) => g.id);
}

/** Index slug for a group page. "tensor-f16-f32" -> "tensor-f16-f32". */
export function groupSlug(id: ModeGroupId): string {
  return id;
}

export function groupBySlug(slug: string): ModeGroup | undefined {
  return MODE_GROUPS.find((g) => groupSlug(g.id) === slug);
}
