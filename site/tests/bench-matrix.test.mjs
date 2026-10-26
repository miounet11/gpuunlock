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
