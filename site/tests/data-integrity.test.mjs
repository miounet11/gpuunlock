// Data integrity for the site's device and benchmark tables.
//
// The tables are hand-maintained from upstream repositories, so the failure modes
// that matter are drift between them: a device whose PCI id is not in the accepted
// list, a benchmark row pointing at a device that no longer exists, a chip group
// that lost its ids, and locale files that fell out of sync after an edit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { DEVICES, ACCEPTED_IDS, acceptedCount, getDevice } from "../src/data/devices.ts";
import { BENCH_RUNS, FP8_CUTLASS } from "../src/data/benchmarks.ts";
import { INSTALL_STEPS, REQUIREMENTS } from "../src/data/install.ts";

const LOCALES = ["en", "zh", "ja", "de", "fr", "es", "pt"];
const loadMessages = (loc) =>
  JSON.parse(readFileSync(new URL(`../messages/${loc}.json`, import.meta.url), "utf8"));

test("every device page has a unique slug", () => {
  const slugs = DEVICES.map((d) => d.slug);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate slug in DEVICES");
});

test("every device PCI id is in the accepted list for its own chip", () => {
  for (const d of DEVICES) {
    const ids = ACCEPTED_IDS[d.chip];
    assert.ok(ids, `${d.slug}: chip ${d.chip} has no ACCEPTED_IDS group`);
    const id = d.pciId.replace(/^10de:/, "0x");
    assert.ok(ids.includes(id), `${d.slug}: ${d.pciId} missing from ACCEPTED_IDS.${d.chip}`);
  }
});

test("accepted ids are well formed and counts stay stable", () => {
  for (const [chip, ids] of Object.entries(ACCEPTED_IDS)) {
    assert.ok(ids.length > 0, `${chip} has an empty list`);
    for (const id of ids) assert.match(id, /^0x[0-9a-f]{4}$/, `${chip}: bad id ${id}`);
    assert.equal(new Set(ids).size, ids.length, `${chip} has duplicate ids`);
  }
  assert.equal(acceptedCount(), Object.values(ACCEPTED_IDS).flat().length);
  // AD102 1 + AD103 1 + GA102 12 + GA103 1 + GA104 30 + GA106 9 + TU102 5 + TU104 7 + TU106 7
  assert.equal(acceptedCount(), 72, "accepted id count changed; check the tables");
});

test("turing ids match the upstream module's list exactly", () => {
  assert.deepEqual(ACCEPTED_IDS.TU102, ["0x1e03", "0x1e04", "0x1e07", "0x1e2d", "0x1e2e"]);
  assert.deepEqual(ACCEPTED_IDS.TU104, ["0x1e81", "0x1e82", "0x1e84", "0x1e87", "0x1e89", "0x1ec2", "0x1ec7"]);
  assert.deepEqual(ACCEPTED_IDS.TU106, ["0x1f02", "0x1f03", "0x1f06", "0x1f07", "0x1f08", "0x1f42", "0x1f47"]);
});

test("fork tags agree with the architecture", () => {
  const allowed = new Set(["both", "ada", "ampere", "turing"]);
  for (const d of DEVICES) {
    assert.ok(allowed.has(d.fork), `${d.slug}: unknown fork ${d.fork}`);
    if (d.chip.startsWith("TU")) {
      assert.equal(d.fork, "turing", `${d.slug}: Turing cards must use fork=turing`);
    } else {
      assert.notEqual(d.fork, "turing", `${d.slug}: ${d.chip} is not a Turing card`);
    }
  }
});

test("measured devices carry a gain range, untested ones do not", () => {
  for (const d of DEVICES) {
    if (d.status === "measured" || d.status === "reported") {
      assert.equal(typeof d.gainMin, "number", `${d.slug}: ${d.status} needs gainMin`);
      assert.equal(typeof d.gainMax, "number", `${d.slug}: ${d.status} needs gainMax`);
      assert.ok(d.gainMin <= d.gainMax, `${d.slug}: gainMin > gainMax`);
    } else {
      assert.equal(d.gainMin, null, `${d.slug}: ${d.status} must not claim a gain`);
      assert.equal(d.gainMax, null, `${d.slug}: ${d.status} must not claim a gain`);
    }
    assert.ok(d.sources.length > 0, `${d.slug}: no source`);
  }
});

test("every device resolves through getDevice", () => {
  for (const d of DEVICES) assert.equal(getDevice(d.slug), d);
  assert.equal(getDevice("no-such-card"), undefined);
});

test("benchmark runs point at real devices and agree on chip", () => {
  for (const run of BENCH_RUNS) {
    const d = getDevice(run.cardSlug);
    assert.ok(d, `benchmark ${run.card} has no device page (${run.cardSlug})`);
    assert.equal(run.chip, d.chip, `${run.cardSlug}: chip mismatch`);
    assert.ok(run.rows.length > 0, `${run.cardSlug}: no rows`);
    for (const row of run.rows) {
      assert.equal(row.cardSlug, run.cardSlug);
      assert.equal(row.pciId, d.pciId, `${run.cardSlug}: row PCI id differs from the device page`);
      assert.ok(row.stock > 0, `${run.cardSlug}: non-positive stock value`);
      const expected = row.unlocked / row.stock;
      assert.ok(
        Math.abs(row.ratio - expected) < 0.02,
        `${run.cardSlug} ${row.mode}: ratio ${row.ratio} != unlocked/stock ${expected.toFixed(4)}`,
      );
    }
  }
});

test("the 2080 Ti benchmark is the Turing row set", () => {
  const run = BENCH_RUNS.find((r) => r.cardSlug === "rtx-2080-ti");
  assert.ok(run, "Turing benchmark missing");
  assert.equal(run.chip, "TU102");
  assert.deepEqual(run.rows.map((r) => r.iters), [1024, 2048, 4096, 8192]);
  assert.ok(run.rows.every((r) => r.ratio > 1.3), "Turing rows should show the measured gain");
  assert.match(FP8_CUTLASS.ratio.toFixed(4), /^1\.0029$/);
});

test("install steps mention the Turing opt-in and keep unique ids", () => {
  const ids = INSTALL_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate install step id");
  const turing = INSTALL_STEPS.find((s) => s.id === "turing");
  assert.ok(turing, "Turing install step missing");
  assert.match(turing.code, /turing_unlock\.targets=all/);
  assert.match(turing.code, /nlzy\/turing-unlock/);
  assert.ok(REQUIREMENTS.length > 0);
});

test("all locales expose the same message keys", () => {
  const flatten = (obj, prefix = "") =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
    );
  const base = flatten(loadMessages("en")).sort();
  for (const loc of LOCALES) {
    const keys = flatten(loadMessages(loc)).sort();
    assert.deepEqual(keys, base, `${loc}.json does not match en.json key set`);
  }
});

test("every locale names the upstream repositories", () => {
  for (const loc of LOCALES) {
    const m = loadMessages(loc);
    for (const key of ["upstreamAmpere", "upstreamAda", "upstreamUsage", "upstreamTuring"]) {
      assert.ok(m.home[key], `${loc}.json: home.${key} missing`);
    }
    for (const key of ["repoAmpere", "repoAda", "repoMerged", "repoTuring"]) {
      assert.ok(m.install[key], `${loc}.json: install.${key} missing`);
    }
  }
});
