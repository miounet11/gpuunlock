// Pull docs/evidence/ back into sync with upstream.
//
// check-upstream-evidence.mjs answers "did upstream move?". This answers the next question:
// "make it match again". Run it after that check exits 1, or on a schedule before a build.
//
//   node scripts/sync-upstream-evidence.mjs            # download what differs
//   node scripts/sync-upstream-evidence.mjs --dry-run  # print the plan, write nothing
//
// Only files named in the upstream SHA256SUMS are written, and every byte is checked
// against the hash it is declared with before it lands. A manifest that does not describe
// what was downloaded is rejected wholesale: writing unverified bytes into the tree is
// worse than staying stale, because every test below this depends on those files being the
// ones the numbers came from.
//
// Files present locally but absent upstream are left alone and reported. Deleting from a
// tree that tests read is the caller's decision, not this script's.
//
// Exit codes: 0 = in sync after the run, 1 = files changed (review the diff), 2 = could not
// complete (network problem, hash mismatch). 1 is not a failure; it means `git status` now
// has something to show.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const UPSTREAM =
  process.env.EVIDENCE_UPSTREAM ??
  "https://raw.githubusercontent.com/JustAResearcher/gpu-unlock-ada/main/docs/evidence";
const EVIDENCE = fileURLToPath(new URL("../../docs/evidence/", import.meta.url));
const DIRS = ["rtx4090", "ada2705"];
const dryRun = process.argv.includes("--dry-run");

async function fetchBytes(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

let changed = 0;
let failed = null;

for (const dir of DIRS) {
  let sumsBuf;
  try {
    sumsBuf = await fetchBytes(`${UPSTREAM}/${dir}/SHA256SUMS`);
  } catch (err) {
    failed = err;
    break;
  }
  const sums = sumsBuf.toString("utf8");

  // Parse the whole manifest before touching the tree, so a malformed file cannot leave a
  // half-updated directory behind.
  const entries = [];
  for (const line of sums.split("\n")) {
    if (!line.trim()) continue;
    const [hash, name] = line.trim().split(/\s+/);
    if (!/^[0-9a-f]{64}$/.test(hash) || !name) {
      failed = new Error(`${dir}/SHA256SUMS has a malformed line: ${line.trim()}`);
      break;
    }
    entries.push({ hash, name });
  }
  if (failed) break;

  // Download and verify everything first. Writes happen only after the batch is proven.
  const fetched = [];
  for (const { hash, name } of entries) {
    const localPath = `${EVIDENCE}${dir}/${name}`;
    const local = existsSync(localPath) ? readFileSync(localPath) : null;
    if (local && sha256(local) === hash) continue; // already correct

    let buf;
    try {
      buf = await fetchBytes(`${UPSTREAM}/${dir}/${name}`);
    } catch (err) {
      failed = err;
      break;
    }
    const actual = sha256(buf);
    if (actual !== hash) {
      // A mismatch means the manifest and the files disagree upstream, or the transfer was
      // corrupted. Either way the local tree must not be touched.
      failed = new Error(
        `${dir}/${name}: downloaded bytes hash to ${actual.slice(0, 12)} but the manifest says ${hash.slice(0, 12)}`,
      );
      break;
    }
    fetched.push({ name, buf, replaced: local !== null });
  }
  if (failed) break;

  if (fetched.length === 0) {
    console.log(`${dir}: already in sync`);
    continue;
  }
  for (const { name, buf, replaced } of fetched) {
    if (dryRun) console.log(`${dir}/${name}: would ${replaced ? "replace" : "add"}`);
    else writeFileSync(`${EVIDENCE}${dir}/${name}`, buf);
    changed++;
  }
  if (!dryRun) {
    writeFileSync(`${EVIDENCE}${dir}/SHA256SUMS`, sumsBuf);
    console.log(`${dir}: updated ${fetched.length} file(s)`);
  }
}

if (failed) {
  console.error(failed.message);
  console.error("Nothing was written.");
  process.exit(2);
}

if (changed === 0) {
  console.log("evidence already matches upstream");
  process.exit(0);
}
console.log(
  dryRun
    ? `${changed} file(s) would change`
    : `${changed} file(s) changed — run \`npm test\` to see which data rows moved`,
);
process.exit(dryRun ? 0 : 1);
