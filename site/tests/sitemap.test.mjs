import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sitemap = readFileSync(
  new URL("../src/app/sitemap.ts", import.meta.url),
  "utf8",
);

// The file explains the old behaviour in a comment, so stripping comments first keeps the
// assertions about code rather than about prose.
const code = sitemap
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("sitemap does not stamp every URL with the build time", () => {
  // `lastModified: new Date()` told crawlers that all 133 URLs changed on every deploy,
  // which made lastmod useless. Pin the replacement so it cannot come back.
  assert.doesNotMatch(
    code,
    /lastModified:\s*new Date\(\)/,
    "sitemap must derive lastmod from source history, not the build clock",
  );
  assert.match(code, /execFileSync/, "sitemap must ask git for commit dates");
  assert.match(code, /--format=%cI/, "sitemap must use committer ISO dates");
});

test("each route declares the files it is built from", () => {
  // A page whose data is edited should move only its own lastmod.
  for (const key of ['""', '"/gpus"', '"/benchmarks"', '"/windows"']) {
    assert.ok(
      sitemap.includes(`${key}:`),
      `pageSources must cover ${key || "the home page"}`,
    );
  }
  assert.match(sitemap, /cardSource/, "per-card pages need their own source set");
});

test("a build without git history still yields a valid date", () => {
  // Shallow clones and tarballs have no history; the fallback must be a fixed date so the
  // output stays deterministic instead of injecting the build clock.
  assert.match(sitemap, /const FALLBACK = new Date\("\d{4}-\d{2}-\d{2}T/, "fallback must be a fixed date");
  assert.match(sitemap, /catch/, "git failure must be caught, not thrown");
});
