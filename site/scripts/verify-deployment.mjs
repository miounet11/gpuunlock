// Compares what this build produces against what the live host actually serves.
//
// The gap this closes was found by hand: the built sitemap had 203 URLs while
// https://gpuunlock.com/sitemap.xml had 126, and ten mode pages plus /en/windows returned 404
// in production. Every local check passed the whole time, because `npm test` and
// `npm run build` only ever look at the working tree.
//
// Read-only: it fetches, it never deploys. Deploying needs server credentials; knowing whether
// a deploy landed does not.
//
//   node scripts/verify-deployment.mjs             # compare sitemap and spot-check every URL
//   node scripts/verify-deployment.mjs --sample 20 # check only N URLs per locale
//
// Exit codes: 0 = live matches this build, 1 = live is missing or failing pages, 2 = could not
// check (network). Same split as the evidence check: an outage must not read as a bad deploy,
// and must not pass silently either.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HOST = process.env.DEPLOY_HOST ?? "https://gpuunlock.com";
const distDir = process.env.NEXT_DIST_DIR || ".next";
const sitemapBody = join(process.cwd(), distDir, "server", "app", "sitemap.xml.body");

const sampleArg = process.argv.indexOf("--sample");
const sampleSize = sampleArg > -1 ? Number(process.argv[sampleArg + 1]) : null;
if (sampleArg > -1 && (!Number.isInteger(sampleSize) || sampleSize < 1)) {
  console.error("--sample needs a positive integer");
  process.exit(2);
}

if (!existsSync(sitemapBody)) {
  console.error(`no sitemap at ${sitemapBody} — run \`npm run build\` first`);
  process.exit(2);
}

// The sitemap holds absolute URLs for the production origin. When HOST points somewhere
// else (a local server, a staging host), only the path is meaningful, so the origin is
// rewritten — otherwise the "check HOST" flag would read the sitemap from one host and then
// request every page from another, which is exactly the bug this flag exists to avoid.
const builtOrigin = [...readFileSync(sitemapBody, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (m) => m[1],
);
const built = builtOrigin.map((u) => u.replace(/^https?:\/\/[^/]+/, HOST));
if (built.length === 0) {
  console.error("the built sitemap contains no URLs");
  process.exit(2);
}

async function get(url, method = "GET") {
  return fetch(url, { method, redirect: "manual", signal: AbortSignal.timeout(20000) });
}

/**
 * One retry, because a single TCP or TLS hiccup is common on a mobile link and must not be
 * reported as a broken page. Observed while writing this: a run logged
 * `TypeError .../gpus/rtx-3090` while `curl` fetched the same URL with 200 three times in a
 * row. A network error that survives the retry is still reported separately from a 404,
 * since only one of the two means the deploy is wrong.
 */
async function getWithRetry(url, method) {
  try {
    return await get(url, method);
  } catch {
    return get(url, method);
  }
}

// A stale deploy is the expected failure, so read the live sitemap first: it names the URLs
// that exist over there, which is more useful than 203 individual 404s.
let live;
try {
  const res = await get(`${HOST}/sitemap.xml`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${HOST}/sitemap.xml`);
  // Normalised the same way as `built`: a server on any host still emits absolute URLs for
  // the production origin, so comparing full strings would call every URL "missing".
  live = new Set(
    [...((await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g))].map((m) =>
      m[1].replace(/^https?:\/\/[^/]+/, HOST),
    ),
  );
} catch (err) {
  console.error(`could not read the live sitemap: ${err.message}`);
  console.error("This is an outage or a network block, not evidence that a deploy is missing.");
  process.exit(2);
}

const missing = built.filter((u) => !live.has(u));
const extra = [...live].filter((u) => !built.includes(u));

console.log(`built ${built.length} urls, live ${live.size} urls`);
if (missing.length > 0) console.log(`  ${missing.length} built url(s) not in the live sitemap`);
if (extra.length > 0) console.log(`  ${extra.length} live url(s) not in this build`);

// Paths are reported by shape, not one line each: the 10 mode pages are one fact, not ten.
if (missing.length > 0) {
  const shapes = new Map();
  for (const u of missing) {
    const shape = u.replace(`${HOST}/(en|zh|ja|de|fr|es|pt)`, "/:locale").replace(/\/[^/]+$/, "/:slug");
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
  }
  for (const [shape, n] of [...shapes].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`    ${n} × ${shape}`);
  }
}

// The sitemap is only a claim. Check the pages themselves return 200, since a route can be in
// the sitemap and still 500 because a build-time data read broke at runtime.
const toCheck = sampleSize === null ? built : built.slice(0, sampleSize);
const failures = [];
const unreachable = [];
const CONCURRENCY = 8;
let cursor = 0;

async function worker() {
  while (cursor < toCheck.length) {
    const url = toCheck[cursor++];
    try {
      const res = await getWithRetry(url, "HEAD");
      // HEAD is cheap but some hosts answer it differently from GET; fall back before
      // reporting a failure so a HEAD quirk never looks like a broken page.
      const status = res.status === 405 || res.status === 501 ? (await getWithRetry(url)).status : res.status;
      if (status !== 200) failures.push(`${status} ${url}`);
    } catch (err) {
      unreachable.push(`${err.name} ${url}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`checked ${toCheck.length} url(s), ${failures.length} did not return 200`);
for (const f of failures.slice(0, 20)) console.log(`    ${f}`);
if (failures.length > 20) console.log(`    ... ${failures.length - 20} more`);

if (unreachable.length > 0) {
  // Distinct from a bad status: these may be fine, we just could not see them.
  console.log(`${unreachable.length} url(s) could not be fetched after a retry`);
  for (const f of unreachable.slice(0, 10)) console.log(`    ${f}`);
  if (unreachable.length > 10) console.log(`    ... ${unreachable.length - 10} more`);
}

if (missing.length > 0 || extra.length > 0 || failures.length > 0) process.exit(1);
if (unreachable.length > 0) {
  console.log("the deploy looks stale or fine, but the network was unreliable — re-run");
  process.exit(2);
}
console.log(`live ${HOST} matches this build`);
