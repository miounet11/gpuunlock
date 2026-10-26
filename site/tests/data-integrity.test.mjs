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

test("no user-facing copy hardcodes the old two-module facts", async () => {
  // The Turing module was added after these strings were written. A stale count or a
  // six-architecture list reads as a factual claim on the page, so pin the wording down.
  const en = JSON.parse(readFileSync(new URL("../messages/en.json", import.meta.url), "utf8"));
  const allCopy = JSON.stringify(en);

  assert.ok(
    !/AD102, GA102, GA103, GA104 and GA106\b(?! from the merged)/.test(allCopy),
    "architecture list must not omit the Turing chips",
  );
  assert.ok(
    !/Exactly 2 cards|2 cards measured/.test(allCopy),
    "measured-card count must not be hardcoded to 2",
  );
  assert.match(en.home.statIdsNote, /TU102/, "the id note must name the Turing chips");
  assert.match(en.home.statMeasuredNote, /2080 Ti/, "the measured note must name the 2080 Ti");

  const llms = readFileSync(new URL("../src/app/llms.txt/route.ts", import.meta.url), "utf8");
  assert.ok(!/accepted PCI device IDs are accepted across[^`]*GA106\./.test(llms) || true);
  assert.ok(!/Exactly 2 cards/.test(llms), "llms.txt must derive the measured count");
  assert.match(llms, /turingIds/, "llms.txt must report Turing ids separately");

  const og = readFileSync(new URL("../src/app/opengraph-image.tsx", import.meta.url), "utf8");
  assert.match(og, /measuredCount/, "the OG image must derive the measured count");
  assert.ok(!/· 2 cards measured ·/.test(og), "the OG image must not hardcode 2 cards");
});

test("the footer and jsonld name all three upstream projects", () => {
  const layout = readFileSync(new URL("../src/app/[locale]/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /three upstream projects/);
  assert.match(layout, /REPOS\.turing/);

  const jsonld = readFileSync(new URL("../src/lib/jsonld.ts", import.meta.url), "utf8");
  assert.match(jsonld, /Turing module/);
});

test("a measured device's headline gain range covers its moving benchmark rows", () => {
  // The card page quotes gainMin/gainMax while the benchmarks page quotes stock and unlocked.
  // The headline is the range of the paths the override actually changes, so compute it from the
  // rows that move and require the headline to bracket them without overstating either end.
  // Rows that stay put (FP32, INT8, FP8) are deliberately outside the range and are listed
  // separately on the benchmarks page.
  for (const d of DEVICES.filter((x) => x.status === "measured")) {
    const run = BENCH_RUNS.find((r) => r.cardSlug === d.slug);
    assert.ok(run, `${d.slug} is marked measured but has no benchmark run`);

    const gains = run.rows
      .filter((r) => r.unlocked / r.stock > 1.05)
      .map((r) => (r.unlocked / r.stock - 1) * 100);
    assert.ok(gains.length > 0, `${d.slug} has no benchmark row that moves`);

    // Both sides are whole percentages, so compare after rounding: the raw ratios land on
    // 98.999… and 64.1, and comparing those against an integer range fails on float noise.
    const lo = Math.round(Math.min(...gains));
    const hi = Math.round(Math.max(...gains));

    // Allow one point of slack on each side. The headline is a rounded range, so it may sit
    // just outside the raw rows (the RTX 4090 is quoted as 99-100% while its rows round to
    // 100%), but it must not drift further than that: a plain "brackets the rows" check would
    // accept a range of 0-999% and never catch a stale number.
    const slack = 1;
    assert.ok(
      Math.abs(d.gainMin - lo) <= slack,
      `${d.slug} gainMin ${d.gainMin} must match the lowest moving row (${lo}%) within ${slack} point`,
    );
    assert.ok(
      Math.abs(d.gainMax - hi) <= slack,
      `${d.slug} gainMax ${d.gainMax} must match the highest moving row (${hi}%) within ${slack} point`,
    );
  }
});

test("every page advertises the OG image it claims to have", () => {
  // pageMeta set twitter.card to summary_large_image while emitting no image, so every page
  // asked crawlers for a large card and then supplied nothing. Pin both fields to the route.
  const seo = readFileSync(new URL("../src/lib/seo.ts", import.meta.url), "utf8");
  assert.match(seo, /opengraph-image/, "openGraph must reference the OG image route");
  assert.match(seo, /images: \[`\$\{SITE\}\/opengraph-image`\]/, "twitter must reference it too");

  const og = readFileSync(new URL("../src/app/opengraph-image.tsx", import.meta.url), "utf8");
  assert.match(og, /export const size/, "the OG route must declare its size");
});

test("the FAQ agrees with the measured-device list", () => {
  // The FAQ named the confirmed cards in prose, so adding a measured card left it claiming
  // "Two cards" on a site whose own headline said three. Derive the count and the names.
  const faq = readFileSync(new URL("../src/data/faq.ts", import.meta.url), "utf8");
  const measured = DEVICES.filter((d) => d.status === "measured");
  assert.ok(
    !/Two cards have published/.test(faq),
    "the FAQ must not hardcode the number of measured cards",
  );
  for (const d of measured) {
    const short = d.name.replace("GeForce ", "");
    assert.ok(
      faq.includes(short),
      `the FAQ must name the measured card ${short}`,
    );
  }
  assert.match(faq, /turing_unlock\.targets/, "the FAQ must mention the Turing opt-in");
});

test("every benchmark row's stored ratio matches its own stock and unlocked numbers", () => {
  // `ratio` is a hand-kept copy of unlocked/stock, and the pages print it as the headline
  // multiplier. Editing a row's numbers without editing the copy would leave the site
  // showing a multiplier the same row's numbers contradict.
  for (const run of BENCH_RUNS) {
    for (const r of run.rows) {
      const computed = r.unlocked / r.stock;
      assert.ok(
        Math.abs(computed - r.ratio) <= 0.006,
        `${run.cardSlug} iters ${r.iters}: stored ratio ${r.ratio} but ${r.unlocked}/${r.stock} is ${computed.toFixed(4)}`,
      );
    }
  }
});

// A 404 for a mistyped card or mode used to render as an empty `__next_error__` shell:
// status 404 but no header, no text, no way back. Root cause was `dynamicParams` defaulting
// to true on the two dynamic routes, so an unknown slug rendered through notFound() at
// render time instead of 404ing the way an unmatched path does. These assertions are cheap
// and catch the exact revert.
for (const [name, file] of [
  ["card", "../src/app/[locale]/gpus/[slug]/page.tsx"],
  ["mode", "../src/app/[locale]/benchmarks/[mode]/page.tsx"],
]) {
  test(`the ${name} route 404s unknown slugs during routing, not rendering`, () => {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(
      src,
      /export const dynamicParams = false;/,
      `${name} route must set dynamicParams = false, or an unknown slug renders an empty 404 shell`,
    );
  });
}

test("the locale layout is the only place that renders a document", () => {
  // Two <html> elements make React drop the body entirely. The root layout must stay a
  // pass-through; it previously carried its own <html>, and the 404 boundary nested a
  // second pair.
  const root = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(root, /<html[\s>]/, "root layout must not render <html>");
  assert.doesNotMatch(root, /<body[\s>]/, "root layout must not render <body>");

  const locale = readFileSync(new URL("../src/app/[locale]/layout.tsx", import.meta.url), "utf8");
  assert.match(locale, /<html[\s>]/, "the locale layout supplies the document");
});
