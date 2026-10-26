import { test } from "node:test";
import assert from "node:assert/strict";
import { BENCH_RUNS, FP8_CUTLASS } from "../src/data/benchmarks.ts";
import { MODE_GROUPS, groupForRow, groupBySlug } from "../src/data/modes.ts";
import { DEVICES } from "../src/data/devices.ts";

const allRows = BENCH_RUNS.flatMap((run) =>
  run.rows.map((r) => ({ ...r, chip: run.chip, sms: run.sms })),
);
const groupIds = new Set(MODE_GROUPS.map((g) => g.id));

test("every row maps to a registered group", () => {
  for (const r of allRows) {
    const g = groupForRow(r.cardSlug, r.mode, r.iters);
    assert.ok(groupIds.has(g), `${r.cardSlug} ${r.mode} -> unknown group ${g}`);
  }
});

test("the two f16/f32 quantities are kept apart", () => {
  // Turing rows are cuBLAS GEMM; Ada rows are register-resident issue rate. Putting them
  // in one group would invite a comparison nobody measured.
  const turing = allRows.filter((r) => r.cardSlug === "rtx-2080-ti");
  assert.ok(turing.length > 0);
  for (const r of turing) {
    assert.equal(groupForRow(r.cardSlug, r.mode, r.iters), "gemm-f16-f32");
  }
  const adaF16 = allRows.filter(
    (r) => r.cardSlug !== "rtx-2080-ti" && r.mode === "f16/f32",
  );
  assert.ok(adaF16.length > 0);
  for (const r of adaF16) {
    assert.equal(groupForRow(r.cardSlug, r.mode, r.iters), "tensor-f16-f32");
  }
});

test("ratio agrees with unlocked / stock", () => {
  for (const r of allRows) {
    const derived = Math.round((r.unlocked / r.stock) * 1000) / 1000;
    assert.ok(
      Math.abs(derived - r.ratio) <= 0.006,
      `${r.cardSlug} ${r.mode}: ratio ${r.ratio} vs derived ${derived}`,
    );
  }
});

test("the FP8 pair is its own quantity and is not folded into a core group", () => {
  const derived = Math.round((FP8_CUTLASS.unlocked.gflops / FP8_CUTLASS.stock.gflops) * 1000) / 1000;
  assert.ok(Math.abs(derived - FP8_CUTLASS.ratio) <= 0.006);
  const fp8Rows = allRows.filter((r) => r.mode === "e4m3/f32");
  assert.equal(fp8Rows.length, 1, "the FP8 row should appear exactly once");
  assert.equal(fp8Rows[0].unit, "GFLOP/s", "FP8 is reported in GFLOP/s, not TFLOP/s");
});

test("the CUTLASS row is marked as a different harness, not a normal loop row", async () => {
  const { harnessOf, splitByHarness } = await import("../src/data/benchmarks.ts");

  // The FP8 number came from the CUTLASS profiler, not the MMA issue-rate loop. If it
  // lost its harness marker it would render inside the "same binary, stock vs unlocked"
  // table and imply a shared method.
  const fp8 = allRows.filter((r) => r.mode === "e4m3/f32");
  assert.equal(fp8.length, 1);
  assert.equal(harnessOf(fp8[0]), "cutlass");

  // Every other row is the standard harness, and none of them may claim CUTLASS.
  for (const r of allRows.filter((x) => x.mode !== "e4m3/f32")) {
    assert.equal(harnessOf(r), "mma-loop", `${r.cardSlug} ${r.mode} should be mma-loop`);
  }

  const split = splitByHarness(allRows);
  assert.equal(split.cutlass.length, 1);
  assert.equal(split.mma.length, allRows.length - 1);
  assert.ok(split.mma.every((r) => r.unit !== "GFLOP/s"), "no CUTLASS unit may leak into the loop table");
});

test("both detail-page tables have labels in every locale", async () => {
  const { readFileSync } = await import("node:fs");
  for (const loc of ["en", "zh", "ja", "de", "fr", "es", "pt"]) {
    const m = JSON.parse(
      readFileSync(new URL(`../messages/${loc}.json`, import.meta.url), "utf8"),
    );
    for (const key of ["cutlassTitle", "cutlassNote", "benchNote"]) {
      assert.ok(m.device[key], `${loc}.json device.${key} is missing`);
    }
    assert.notEqual(
      m.device.cutlassTitle,
      m.device.benchTitle,
      `${loc}.json: the CUTLASS heading must not reuse the loop heading`,
    );
  }
});

test("measured cards all exist in the device list", () => {
  const slugs = new Set(DEVICES.map((d) => d.slug));
  for (const run of BENCH_RUNS) {
    assert.ok(slugs.has(run.cardSlug), `${run.cardSlug} is measured but not listed`);
  }
});

test("cards with no gain figures carry no measured rows", () => {
  const measured = new Set(BENCH_RUNS.map((r) => r.cardSlug));
  for (const d of DEVICES) {
    if (d.gainMin === null) {
      assert.ok(!measured.has(d.slug), `${d.slug} has no gain but appears in BENCH_RUNS`);
    }
  }
});

test("each group page slug resolves back to its group", () => {
  for (const g of MODE_GROUPS) {
    assert.equal(groupBySlug(g.id)?.id, g.id);
  }
  assert.equal(groupBySlug("not-a-mode"), undefined);
});

test("every group is reachable from at least one measured row or is gated off", () => {
  // A registered group with no rows is fine only while nothing claims it was measured.
  const used = new Set(allRows.map((r) => groupForRow(r.cardSlug, r.mode, r.iters)));
  for (const g of MODE_GROUPS) {
    if (!used.has(g.id)) {
      assert.equal(g.id === "tensor-fp8", false, "FP8 is measured, it must have rows");
    }
  }
});

test("every key the mode pages read exists in every locale", async () => {
  // A key filed under the wrong namespace renders as MISSING_MESSAGE at build time and
  // ships an empty heading. This checks the two namespaces the mode pages actually use.
  const { readFileSync } = await import("node:fs");
  const flat = (obj, prefix = "") =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === "object" ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`],
    );

  const benchKeys = ["modesTitle", "modesBody", "title"];
  const modeKeys = [
    "colStock",
    "colUnlocked",
    "colGain",
    "colCard",
    "coverageTitle",
    "coverageBody",
    "gatedYes",
    "gatedNo",
    "metaSuffix",
    "methodTitle",
    "otherModes",
    "statChanged",
    "statPeak",
    "statRows",
    "tableNote",
    "tableTitle",
    ...MODE_GROUPS.flatMap((g) => [`${g.id}.name`, `${g.id}.body`]),
  ];

  for (const loc of ["en", "zh", "ja", "de", "fr", "es", "pt"]) {
    const m = JSON.parse(
      readFileSync(new URL(`../messages/${loc}.json`, import.meta.url), "utf8"),
    );
    const bench = new Set(flat(m.bench ?? {}));
    for (const k of benchKeys) {
      assert.ok(bench.has(k), `${loc}.json: bench.${k} is missing`);
    }
    const modes = new Set(flat(m.bench?.modes ?? {}) .map((k) => k));
    for (const k of modeKeys) {
      assert.ok(modes.has(k), `${loc}.json: bench.modes.${k} is missing`);
    }
  }
});

test("family membership follows the chip prefix, not a hand-kept list", async () => {
  const { familyOf, referenceCardFor, familyCoverage } = await import("../src/data/families.ts");
  assert.equal(familyOf("AD102"), "Ada");
  assert.equal(familyOf("GA104"), "Ampere");
  assert.equal(familyOf("TU106"), "Turing");
  assert.equal(familyOf("unknown"), null);

  // Ampere has boards listed but not one same-card measurement, so it must not be
  // handed a stand-in card.
  assert.equal(referenceCardFor("Ampere"), null);
  assert.equal(referenceCardFor("Ada"), "rtx-4090");
  assert.equal(referenceCardFor("Turing"), "rtx-2080-ti");

  const ada = familyCoverage(DEVICES, "Ada");
  assert.equal(ada.total, 2);
  assert.equal(ada.measured, 2);
  const amp = familyCoverage(DEVICES, "Ampere");
  assert.ok(amp.total > 0);
  assert.equal(amp.measured, 0, "no Ampere board has a same-card run in this repo");
});

test("a ceiling basis shows a number or a source, not a bare claim", () => {
  // "the same rate" is an assertion; "189.6–189.7 vs 189.8–189.9, docs/..." is evidence.
  // Every basis must carry at least one figure or a path, so a later edit cannot replace
  // the derivation with prose that asserts the conclusion.
  for (const r of allRows) {
    if (!r.ceilingBasis) continue;
    const hasFigure = /\d/.test(r.ceilingBasis);
    const hasSource = /\.md|whitepaper|README/i.test(r.ceilingBasis);
    assert.ok(
      hasFigure || hasSource,
      `${r.cardSlug} ${r.mode}: ceilingBasis states no figure and cites no source`,
    );
  }
});

test("a ceiling is never published alone", () => {
  for (const r of allRows) {
    if (r.ceiling === undefined) continue;
    assert.ok(r.ceilingKind, `${r.cardSlug} ${r.mode}: ceiling without ceilingKind`);
    assert.ok(r.ceilingBasis, `${r.cardSlug} ${r.mode}: ceiling without ceilingBasis`);
    assert.ok(["spec", "derived"].includes(r.ceilingKind), "unexpected ceilingKind");
    assert.ok(r.ceiling > 0);
  }
});

test("an unlocked value above the ceiling only happens where the notes already say so", () => {
  // The ceiling is the stock specification, so an unlock that clears it is a result,
  // not a data error: the 2080 Ti rows reach 160.6% of spec. What must never happen is
  // a row silently overshooting with no note recording it. The margin below is generous
  // (3×) so this catches a typo, not a legitimate result.
  for (const r of allRows) {
    if (r.ceiling === undefined) continue;
    if (r.unlocked > r.ceiling * 1.05) {
      assert.ok(
        r.note && /%/.test(r.note),
        `${r.cardSlug} ${r.mode}: ${r.unlocked} exceeds the ${r.ceiling} ceiling but no note records it`,
      );
      assert.ok(
        r.unlocked <= r.ceiling * 3,
        `${r.cardSlug} ${r.mode}: ${r.unlocked} is beyond any plausible reading of the ceiling`,
      );
    }
  }
});

test("the scaled FP8 ceiling reproduces from its stated arithmetic", () => {
  // If the basis prose and the number drift apart, the page would cite a derivation
  // that does not produce the figure shown next to it.
  const fp8 = allRows.find((r) => r.mode === "e4m3/f32");
  assert.ok(fp8?.ceiling);
  const scaled = 330.3 * (66 / 128) * (2.61 / 2.52);
  assert.ok(
    Math.abs(fp8.ceiling - scaled * 1000) < 200,
    `ceiling ${fp8.ceiling} GFLOP/s vs recomputed ${(scaled * 1000).toFixed(0)}`,
  );
  assert.equal(fp8.ceilingKind, "derived");
});

test("the ceiling block has labels in every locale", async () => {
  const { readFileSync } = await import("node:fs");
  for (const loc of ["en", "zh", "ja", "de", "fr", "es", "pt"]) {
    const m = JSON.parse(
      readFileSync(new URL(`../messages/${loc}.json`, import.meta.url), "utf8"),
    );
    for (const key of ["ceilingTitle", "ceilingRow"]) {
      assert.ok(m.bench.modes[key], `${loc}.json bench.modes.${key} is missing`);
    }
    // A translator dropping a placeholder would render a literal "{pct}".
    for (const ph of ["{card}", "{value}", "{ceiling}", "{pct}"]) {
      assert.ok(
        m.bench.modes.ceilingRow.includes(ph),
        `${loc}.json ceilingRow is missing ${ph}`,
      );
    }
  }
});

test("a ceiling is only placed on a row whose unit matches it", () => {
  // Three quantities carry a peak: FP16/BF16 tensor rate in TFLOP/s, Turing FP16→FP32 in
  // TFLOP/s, and FP8 in GFLOP/s. A ceiling on any other row would compare across
  // quantities that share no unit.
  const withCeiling = allRows.filter((r) => r.ceiling !== undefined);
  const allowed = new Set(["e4m3/f32", "f16/f16", "f16/f32", "bf16/f32"]);
  for (const r of withCeiling) {
    assert.ok(allowed.has(r.mode), `${r.cardSlug} ${r.mode} should not carry a ceiling`);
    // Only the FP8 row is in GFLOP/s; everything else is TFLOP/s. Getting this wrong is
    // a factor-of-1000 error, so it is checked per row rather than per file. The 4090
    // rows spell the unit "TF/s" while others use "TFLOP/s", so the check normalises
    // first — matching the literal alone would silently skip the 4090's three rows.
    const unit = r.unit === "TF/s" ? "TFLOP/s" : r.unit;
    // Enumerated rather than "anything else is TFLOP/s": a new unit must fail here
    // instead of being validated against the wrong magnitude table.
    const magnitude = { "GFLOP/s": [1000, Infinity], "TFLOP/s": [0, 1000] }[unit];
    assert.ok(magnitude, `${r.cardSlug} ${r.mode}: unhandled unit ${r.unit}`);
    assert.ok(
      r.ceiling > magnitude[0] && r.ceiling <= magnitude[1],
      `${unit} ceiling ${r.ceiling} is outside the expected magnitude`,
    );
  }
  // Every measured card with a published peak, and no card without one.
  assert.deepEqual(
    [...new Set(withCeiling.map((r) => r.cardSlug))].sort(),
    ["rtx-2080-ti", "rtx-4070-ti-super", "rtx-4090"],
  );

  // Guard the normalisation above: the 4090 is the only card spelling TFLOP/s as "TF/s".
  // If that alias ever stops appearing, this test is no longer exercising the branch it
  // was written for and should be revisited rather than left silently passing.
  const aliased = withCeiling.filter((r) => r.unit === "TF/s");
  assert.equal(aliased.length, 3, "the three 4090 rows should still spell TFLOP/s as TF/s");
  assert.ok(
    aliased.every((r) => r.cardSlug === "rtx-4090"),
    "only the 4090 uses the TF/s spelling",
  );
});

test("the Ada FP16 ceiling reproduces from the whitepaper divisor", () => {
  // 330.3 ÷ 128 ÷ 2.52 GHz = 1.024 TFLOP/s per GHz per SM, i.e. 1024 FLOP/cycle/SM.
  // That divisor is what both Ada cards are checked against.
  const perCycle = 330.3 / (128 * 2.52); // TFLOP/s per GHz per SM
  assert.ok(Math.abs(perCycle - 1.024) < 0.001, `divisor drifted to ${perCycle.toFixed(4)}`);

  const r4090 = allRows.find((r) => r.cardSlug === "rtx-4090" && r.mode === "f16/f16");
  assert.ok(Math.abs(r4090.ceiling - 128 * perCycle * 2.52) < 0.2);

  const super070 = allRows.find(
    (r) => r.cardSlug === "rtx-4070-ti-super" && r.mode === "f16/f32",
  );
  const derived = 66 * perCycle * 2.82;
  assert.ok(
    Math.abs(super070.ceiling - derived) < 0.2,
    `4070 Ti SUPER ceiling ${super070.ceiling} vs recomputed ${derived.toFixed(1)}`,
  );
  // The two facts that make the divisor credible: the locked FP16→FP16 path already ran
  // at the derived peak, and the unlocked FP16→FP32 path lands within 1% of it.
  assert.ok(super070.unlocked / super070.ceiling > 0.98, "unlock should reach the peak");
});

test("the Turing ceiling reproduces from its stated arithmetic", () => {
  const row = allRows.find((r) => r.cardSlug === "rtx-2080-ti" && r.ceiling !== undefined);
  assert.ok(row?.ceiling);
  const derived = (68 * 512 * 1.635) / 1000; // SMs × FLOP/cycle/SM × GHz -> TFLOP/s
  assert.ok(
    Math.abs(row.ceiling - derived) < 0.1,
    `ceiling ${row.ceiling} vs recomputed ${derived.toFixed(2)}`,
  );
  // Every percentage the notes quote must come back out of the same divisor.
  for (const r of allRows.filter((x) => x.cardSlug === "rtx-2080-ti")) {
    for (const pct of (r.note ?? "").matchAll(/(\d+\.\d)%/g)) {
      const value = (Number(pct[1]) / 100) * r.ceiling;
      const measured = [r.stock, r.unlocked].some((v) => Math.abs(v - value) < 0.08);
      assert.ok(measured, `${r.cardSlug} ${r.mode}: ${pct[1]}% does not map to a measured value`);
    }
  }
});
