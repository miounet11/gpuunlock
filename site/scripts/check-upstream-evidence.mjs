// The site publishes numbers copied from docs/evidence/, which itself is copied from the
// upstream forks. Both copies can move without anyone noticing: the fork can re-run a
// benchmark, or someone can edit a local data row and leave the evidence behind.
//
// `npm test` already proves the data file agrees with the local evidence. What it cannot
// prove is that the local evidence still agrees with upstream, because that needs network
// access and a test run must not. This script does that half, and CI runs it on a schedule
// so a moved upstream shows up as a failing job instead of silently stale numbers.
//
// Exit codes: 0 = in sync, 1 = drift found, 2 = could not check (network/API problem).
// Keeping "could not check" separate from "drift" matters: a flaky network must not look
// like a benchmark change, and it must not pass silently either.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Overridable so the unreachable-upstream path can be tested without touching the
// network. Nothing in CI sets it.
const UPSTREAM =
  process.env.EVIDENCE_UPSTREAM ??
  "https://raw.githubusercontent.com/JustAResearcher/gpu-unlock-ada/main/docs/evidence";
const EVIDENCE = fileURLToPath(new URL("../../docs/evidence/", import.meta.url));
const DIRS = ["rtx4090", "ada2705"];

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

/** Names listed in a SHA256SUMS file, in file order. */
function listedFiles(sums) {
  return sums
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => l.trim().split(/\s+/)[1]);
}

const problems = [];
let networkError = null;

for (const dir of DIRS) {
  let upstreamSums;
  try {
    upstreamSums = await fetchText(`${UPSTREAM}/${dir}/SHA256SUMS`);
  } catch (err) {
    networkError = err;
    break;
  }

  const localSums = readFileSync(`${EVIDENCE}${dir}/SHA256SUMS`, "utf8");
  if (localSums !== upstreamSums) {
    // A byte difference in the manifest is the actual signal: it covers both a moved
    // hash (same file name, new content) and an added or removed file.
    problems.push(`${dir}/SHA256SUMS differs from upstream`);
    const up = listedFiles(upstreamSums);
    const local = listedFiles(localSums);
    for (const name of up.filter((n) => !local.includes(n))) {
      problems.push(`  ${dir}/${name} exists upstream but not locally`);
    }
    for (const name of local.filter((n) => !up.includes(n))) {
      problems.push(`  ${dir}/${name} exists locally but not upstream`);
    }
    for (const line of localSums.split("\n").filter((l) => l.trim())) {
      const [hash, name] = line.trim().split(/\s+/);
      const upLine = upstreamSums.split("\n").find((l) => l.trim().endsWith(` ${name}`));
      if (upLine && !upLine.trim().startsWith(hash)) {
        problems.push(`  ${dir}/${name} has the same name but different content upstream`);
      }
    }
  }

  // The manifest is only worth comparing if the files it names are actually present
  // locally. A missing file means `npm test`'s evidence reads would fail with ENOENT,
  // which is a worse error message than this one.
  const present = new Set(readdirSync(`${EVIDENCE}${dir}`));
  for (const name of listedFiles(localSums)) {
    if (!present.has(name)) problems.push(`${dir}/${name} is listed in SHA256SUMS but missing locally`);
  }
}

if (networkError) {
  console.error(`could not reach upstream: ${networkError.message}`);
  console.error("This is an outage or a network block, not evidence of drift.");
  process.exit(2);
}

if (problems.length > 0) {
  console.error("upstream evidence drift:");
  for (const p of problems) console.error(p);
  console.error("\nCopy docs/evidence/ from upstream, then re-run `npm test` to see which rows moved.");
  process.exit(1);
}

console.log(`upstream evidence in sync (${DIRS.join(", ")})`);
