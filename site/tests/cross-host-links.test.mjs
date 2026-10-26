import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(tsx?|mjs)$/.test(name)) out.push(rel);
  }
  return out;
}

// /install and /faq were moved to gpu-unlock.com. An in-app Link to either still works
// (the redirect catches it), but it costs a hop and hides a host change behind a 301 —
// the visitor lands somewhere the page never said they were going. Link absolutely.
const MOVED = ["/install", "/faq"];

test("no page links to a route that was moved to the install host", () => {
  const files = walk("src/app").concat(walk("src/components"));
  const offenders = [];

  for (const file of files) {
    const src = read(file);
    for (const path of MOVED) {
      // Match Link href="/install" and href={"/install"}, not absolute URLs.
      const re = new RegExp(`<Link[^>]*href=["']${path}["']`, "g");
      if (re.test(src)) offenders.push(`${file} -> Link ${path}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `moved routes must be linked as absolute cross-host URLs:\n${offenders.join("\n")}`,
  );
});

test("installUrl produces the host the redirect actually points at", () => {
  // The redirect target and the helper have to agree, or a link and a redirect would send
  // one visitor to two different hosts for the same path.
  const site = read("src/lib/site.ts");
  const config = read("next.config.ts");

  const installSite = site.match(/INSTALL_SITE\s*=\s*"([^"]+)"/)?.[1];
  assert.ok(installSite, "INSTALL_SITE must be a literal so it can be checked");

  const redirected = [...config.matchAll(/destination:\s*"([^"]+)\/:locale\/install"/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(
    redirected,
    [installSite],
    "the /install redirect must land on INSTALL_SITE",
  );

  assert.match(site, /export function installUrl/, "installUrl helper must exist");
});
