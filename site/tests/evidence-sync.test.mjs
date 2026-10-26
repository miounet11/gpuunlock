// Every number the site publishes must still be findable in the raw evidence under
// docs/evidence/. The data file is hand-maintained while the evidence files are copied
// from the runners, so the two drift the moment someone edits one and not the other.
// This test is the sync check: it reads the source-of-truth files directly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BENCH_RUNS } from "../src/data/benchmarks.ts";

const EVIDENCE = new URL("../../docs/evidence/", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, EVIDENCE), "utf8");

/**
 * Parse the plain-text runner output:
 *
 *   mode       best TF/s   all runs
 *   f16/f16        325.7 306.3/306.3/325.7
 *
 * Returns mode -> best value. The column header says "TF/s" for every mode, including
 * the integer ones; the unit correction lives in the data file, not here.
 */
function parseRunner(text) {
  const out = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^([a-z0-9/]+)\s+([\d.]+)\s+[\d./]+$/i);
    if (m) out.set(m[1], Number(m[2]));
  }
  return out;
}

const row = (cardSlug, mode, iters) =>
  BENCH_RUNS.flatMap((r) => r.rows).find(
    (r) => r.cardSlug === cardSlug && r.mode === mode && (iters === undefined || r.iters === iters),
  );

test("the 4090 rows match the evidence file each one names", () => {
  const stock = parseRunner(read("rtx4090/baseline.txt"));
  assert.ok(stock.size >= 6, `parsed only ${stock.size} modes from baseline.txt`);

  // The 4090 has two unlocked passes: a 20,000-iteration run and a 40,000-iteration
  // repeat. The published unlocked column comes from the repeat, which is why every row
  // carries unlockedIters. Reading a fixed file here would compare the stock column of
  // one configuration against the unlocked column of another.
  const unlockedByIters = new Map([
    [20000, parseRunner(read("rtx4090/unlocked-20000.txt"))],
    [40000, parseRunner(read("rtx4090/unlocked-40000.txt"))],
  ]);
  for (const [iters, table] of unlockedByIters) {
    assert.ok(table.size >= 6, `parsed only ${table.size} modes for iters=${iters}`);
  }

  const rows = BENCH_RUNS.find((r) => r.cardSlug === "rtx-4090").rows;
  assert.equal(rows.length, stock.size, "every measured 4090 mode should have a row");

  for (const r of rows) {
    assert.ok(stock.has(r.mode), `${r.mode} is not in baseline.txt`);
    const unlockedIters = r.unlockedIters ?? r.iters;
    const unlocked = unlockedByIters.get(unlockedIters);
    assert.ok(unlocked, `${r.mode}: no evidence file for unlockedIters=${unlockedIters}`);
    assert.ok(unlocked.has(r.mode), `${r.mode} is not in the iters=${unlockedIters} run`);
    // The runner prints one decimal; the data file keeps the same precision, so an
    // exact comparison is right here and a mismatch means someone retyped a number.
    assert.equal(r.stock, stock.get(r.mode), `${r.mode}: stock drifted from baseline.txt`);
    assert.equal(
      r.unlocked,
      unlocked.get(r.mode),
      `${r.mode}: unlocked drifted from the iters=${unlockedIters} run`,
    );
  }
});

test("every 4090 row names the unlocked run it was taken from", () => {
  // Both unlocked passes exist, so a missing unlockedIters would make the row ambiguous
  // about which one its unlocked column came from.
  const rows = BENCH_RUNS.find((r) => r.cardSlug === "rtx-4090").rows;
  for (const r of rows) {
    assert.ok(
      r.unlockedIters === 20000 || r.unlockedIters === 40000,
      `${r.mode}: unlockedIters must name 20000 or 40000, got ${r.unlockedIters}`,
    );
  }
  // The two passes must actually disagree for at least one mode, or carrying both
  // numbers would be pointless bookkeeping.
  const a = parseRunner(read("rtx4090/unlocked-20000.txt"));
  const b = parseRunner(read("rtx4090/unlocked-40000.txt"));
  assert.notEqual(a.get("f16/f16"), b.get("f16/f16"), "the two unlocked passes should differ");
});

test("the 4090 f16/f16 note still describes the slow sample it cites", () => {
  // The note says the stock run includes one slow sample at 306.3. If that sample ever
  // disappears from the evidence, the note would be explaining nothing.
  const text = read("rtx4090/baseline.txt");
  const line = text.split("\n").find((l) => l.startsWith("f16/f16"));
  assert.ok(line.includes("306.3"), "the slow sample the note cites is gone");
  const r = row("rtx-4090", "f16/f16");
  assert.match(r.note ?? "", /306\.3/);
});

test("the 4070 Ti SUPER rows match the JSON runner output", () => {
  const stock = JSON.parse(read("ada2705/tensor-modes-stock.json"));
  const unlocked = JSON.parse(read("ada2705/tensor-modes-unlocked.json"));

  // The JSON names modes f16_f32 / tf32 / u4_s32; the site writes f16/f32 / tf32 /
  // u4/s32. The mapping is explicit so a renamed mode fails loudly instead of silently
  // skipping its comparison.
  const MAP = { "f16/f32": "f16_f32", tf32: "tf32", "u4/s32": "u4_s32" };
  const rows = BENCH_RUNS.find((r) => r.cardSlug === "rtx-4070-ti-super").rows
    .filter((r) => r.mode !== "e4m3/f32"); // FP8 comes from the CUTLASS files, checked below

  assert.equal(rows.length, Object.keys(MAP).length);
  for (const r of rows) {
    const key = MAP[r.mode];
    assert.ok(key, `${r.mode} has no evidence key mapping`);
    assert.ok(stock.modes[key], `${key} missing from tensor-modes-stock.json`);
    assert.ok(unlocked.modes[key], `${key} missing from tensor-modes-unlocked.json`);

    // The JSON carries full float precision; the site rounds to 2 decimals for 94.96 and
    // keeps 754.81. Compare at the precision actually published.
    const decimals = (String(r.stock).split(".")[1] ?? "").length;
    const tol = 0.5 * 10 ** -decimals + 1e-9;
    assert.ok(
      Math.abs(r.stock - stock.modes[key].best_Top_per_s) <= tol,
      `${r.mode}: stock ${r.stock} vs ${stock.modes[key].best_Top_per_s}`,
    );
    const decU = (String(r.unlocked).split(".")[1] ?? "").length;
    const tolU = 0.5 * 10 ** -decU + 1e-9;
    assert.ok(
      Math.abs(r.unlocked - unlocked.modes[key].best_Top_per_s) <= tolU,
      `${r.mode}: unlocked ${r.unlocked} vs ${unlocked.modes[key].best_Top_per_s}`,
    );

    // A mismatch count above zero would mean the kernel produced wrong output, which
    // would make the timing meaningless regardless of the number.
    assert.equal(stock.modes[key].mismatches, 0, `${key}: stock run had mismatches`);
    assert.equal(unlocked.modes[key].mismatches, 0, `${key}: unlocked run had mismatches`);
  }
});

test("the FP8 row matches the CUTLASS profiler output", () => {
  const stock = read("ada2705/cutlass-stock-e4m3-fp32.txt");
  const unlocked = read("ada2705/cutlass-unlocked-e4m3-fp32.txt");
  const r = row("rtx-4070-ti-super", "e4m3/f32");
  assert.ok(r, "the FP8 row is missing");

  // The profiler prints GFLOP/s among other columns; pull the number that the data
  // file quotes rather than assuming a column position. The decimal part is optional:
  // the unlocked file prints "Math: 59495 GFLOP/s" while the stock file prints
  // "59325.8 GFLOP/s", and requiring a decimal would reject the integer spelling.
  const pick = (text) => {
    const nums = [...text.matchAll(/\b(\d{4,6}(?:\.\d+)?)\b/g)].map((m) => Number(m[1]));
    return nums.find((n) => Math.abs(n - r.stock) < 0.15 || Math.abs(n - r.unlocked) < 0.15);
  };
  assert.ok(pick(stock) !== undefined, `stock FP8 ${r.stock} not found in the profiler output`);
  assert.ok(pick(unlocked) !== undefined, `unlocked FP8 ${r.unlocked} not found`);
});

test("both 4090 evidence files describe the same card and iteration count", () => {
  // A drifted header would mean the comparison is between different configurations.
  for (const file of ["rtx4090/baseline.txt", "rtx4090/unlocked-20000.txt"]) {
    const header = read(file).split("\n")[0];
    assert.match(header, /RTX 4090/, `${file}: header is not the 4090`);
    assert.match(header, /iters=20000/, `${file}: iteration count changed`);
  }
});

test("the 4070 Ti SUPER JSON runs are the same build and card", () => {
  const stock = JSON.parse(read("ada2705/tensor-modes-stock.json"));
  const unlocked = JSON.parse(read("ada2705/tensor-modes-unlocked.json"));
  assert.equal(stock.cubin_sha256, unlocked.cubin_sha256, "the two runs used different cubins");
  assert.equal(stock.iters, unlocked.iters, "iteration counts differ between runs");
  assert.equal(stock.state, "stock");
  assert.equal(unlocked.state, "unlocked");
});
