// Next's standalone output is a self-contained server tree, but it deliberately leaves out
// the two directories the server does not import: `public/` and `.next/static`. A process
// started from `.next/standalone` therefore serves every JS/CSS chunk and every file under
// public/ as a 404, while `next start` from the repo root still looks fine. That difference
// is why this runs as `postbuild` instead of being documented as a deploy step.
//
// Overwrites, so running it twice or after a server-side copy is harmless. Skips when the
// build did not produce a standalone tree (for example a test run with a different distDir).

import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const distDir = process.env.NEXT_DIST_DIR || ".next";
const standalone = join(root, distDir, "standalone");

if (!existsSync(standalone)) {
  console.log("standalone skip  no standalone tree in this build");
  process.exit(0);
}

const pairs = [
  [join(root, "public"), join(standalone, "public")],
  [join(root, distDir, "static"), join(standalone, distDir, "static")],
];

for (const [from, to] of pairs) {
  // A build that silently copied nothing is the failure this script exists to prevent, so
  // a missing source is an error rather than a skip.
  if (!existsSync(from)) throw new Error(`missing build input: ${from}`);
  cpSync(from, to, { recursive: true });
  console.log(`standalone copy  ${from.replace(`${root}/`, "")} -> ${to.replace(`${root}/`, "")}`);
}
