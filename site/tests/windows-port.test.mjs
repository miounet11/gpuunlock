// Integrity for the Windows / UEFI port page.
//
// This data is transcribed from another repository's README, so the failure modes differ
// from the Linux tables: the risk is not drift between two lists on this site but a claim
// the upstream does not make. These checks pin the boundaries that would turn a transcription
// error into a false compatibility promise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  WINDOWS_CARDS,
  WINDOWS_LICENSE,
  WINDOWS_MEASUREMENTS,
  WINDOWS_PATHS,
  WINDOWS_RELEASE,
  WINDOWS_REPO,
  WINDOWS_REQUIREMENTS,
  WINDOWS_SCOPE,
  WINDOWS_STEPS,
  WINDOWS_TEARDOWN,
  windowsDocUrl,
} from "../src/data/windows-port.ts";

const LOCALES = ["en", "zh", "ja", "de", "fr", "es", "pt"];

test("the release tag is a real tag string, not a placeholder", () => {
  assert.match(WINDOWS_RELEASE, /^v\d+\.\d+\.\d+$/);
  assert.equal(WINDOWS_REPO, "https://github.com/impacifist/Windows-GPU-UNLOCK");
});

test("doc links are pinned to a tag unless a branch is explicitly justified", () => {
  // A branch link silently re-points at whatever upstream does next, so every guide must
  // name a ref. Only the USB guide is allowed on main because it postdates the tag.
  for (const p of WINDOWS_PATHS) {
    const url = windowsDocUrl(p.guide, p.ref);
    assert.match(
      url,
      /\/blob\/(v\d+\.\d+\.\d+|main)\//,
      `${p.name}: guide URL is not pinned: ${url}`,
    );
    if (p.ref === "main") {
      assert.match(p.name, /USB/, `${p.name}: only the USB route may track main`);
    } else {
      assert.equal(p.ref, undefined, `${p.name}: unexpected ref ${p.ref}`);
    }
  }
});

test("every card's route names a system, because reports are per board", () => {
  // Upstream files these by board, not by GPU model. A row without a board would imply the
  // model is covered everywhere.
  assert.ok(WINDOWS_CARDS.length > 0);
  for (const c of WINDOWS_CARDS) {
    assert.ok(c.card && c.chip, `card row missing a name or chip: ${JSON.stringify(c)}`);
    assert.match(c.chip, /^GA\d{3}$/);
    if (c.status === "upstream-target") {
      assert.match(
        c.route,
        /No dedicated profile/i,
        `${c.card}: an upstream target must not claim a working route`,
      );
    } else {
      assert.match(
        c.route,
        /\(.+/,
        `${c.card}: a recorded/reported row must name the board it was seen on`,
      );
    }
  }
});

test("statuses are limited to the three the upstream actually reports", () => {
  const allowed = new Set(["recorded", "reported", "upstream-target"]);
  for (const c of WINDOWS_CARDS) {
    assert.ok(allowed.has(c.status), `${c.card}: unknown status ${c.status}`);
  }
});

test("install steps have unique ids and none of them runs inside Windows", () => {
  const ids = WINDOWS_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate windows step id");
  assert.ok(WINDOWS_STEPS.length > 0);
  for (const s of WINDOWS_STEPS) {
    assert.ok(s.title && s.body, `step ${s.id} is missing copy`);
    assert.doesNotMatch(
      s.body,
      /\b(?:scheduled task|registry key|device manager)\b/i,
      `step ${s.id}: this is an EFI payload, not a Windows-side tool`,
    );
  }
});

test("no measurement is quoted as a stock-vs-unlocked gain", () => {
  // The port publishes no before/after pair. Printing a multiplier would invent one.
  assert.ok(WINDOWS_MEASUREMENTS.length > 0);
  for (const m of WINDOWS_MEASUREMENTS) {
    assert.ok(m.path && m.value, `measurement missing a path or value`);
    assert.doesNotMatch(
      m.value,
      /×|x\s*$|\d+(?:\.\d+)?\s*%/,
      `${m.path}: "${m.value}" reads as a gain; the port publishes no ratio`,
    );
  }
});

test("the scope list says the tag is source-only and carries no verified-machine claim", () => {
  // WINDOWS_SCOPE is the release-scope list, not the Linux boundary. It has one job:
  // stop a reader from assuming the tag ships binaries or covers another machine.
  const scope = WINDOWS_SCOPE.join(" ");
  assert.match(scope, /source-only|pre-release/i);
  assert.match(scope, /not bundled/i);
  assert.match(scope, /does not add another verified machine/i);
});

test("the copy draws the Linux boundary and refuses a gain number", () => {
  // These claims live in the page messages, so check them where a reader sees them.
  const en = JSON.parse(
    readFileSync(new URL("../messages/en.json", import.meta.url), "utf8"),
  );
  const w = en.windows;
  assert.match(w.lead, /EFI System Partition/i);
  assert.match(w.lead, /no stock-vs-unlocked pair/i);
  assert.match(w.linuxBody, /not apply to Windows|Linux install/i);
  assert.match(w.measureBody, /not a gain/i);
});

test("drivers, firmware and licence boundaries are stated", () => {
  assert.ok(WINDOWS_REQUIREMENTS.length > 0);
  assert.ok(WINDOWS_TEARDOWN.length > 0, "a boot-path change needs an exit route");
  assert.match(WINDOWS_LICENSE, /GPL|MIT|proprietary/i);
});

test("the page copy exists in every locale and names the upstream repo", () => {
  for (const loc of LOCALES) {
    const m = JSON.parse(
      readFileSync(new URL(`../messages/${loc}.json`, import.meta.url), "utf8"),
    );
    assert.ok(m.windows, `${loc}.json: windows namespace missing`);
    for (const key of ["title", "description", "repoLink", "faqLink"]) {
      assert.ok(m.windows[key], `${loc}.json: windows.${key} missing`);
    }
  }
});

test("the Windows site pages do not link to the redirecting in-app paths", () => {
  // /:locale/install and /:locale/faq are 301'd to the sibling host by next.config.ts.
  // An in-app <Link> to them costs a hop and hides a cross-host jump behind a redirect.
  const page = readFileSync(
    new URL("../src/app/[locale]/windows/page.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    page,
    /<Link href="\/(?:install|faq)"/,
    "windows page must link to the install host absolutely, not through a redirect",
  );
});

test("the recorded release is restated in the copy, so a bump cannot be half-applied", () => {
  // WINDOWS_RELEASE feeds both the doc URLs and the scope sentence. Bumping the constant
  // without re-pinning the guides would silently mix two releases on one page.
  const en = JSON.parse(
    readFileSync(new URL("../messages/en.json", import.meta.url), "utf8"),
  );
  const scope = WINDOWS_SCOPE.join(" ");
  assert.ok(
    scope.includes(WINDOWS_RELEASE),
    `the scope list must name ${WINDOWS_RELEASE}`,
  );
  for (const loc of LOCALES) {
    const m = JSON.parse(
      readFileSync(new URL(`../messages/${loc}.json`, import.meta.url), "utf8"),
    );
    assert.ok(
      m.windows.scopeBody.includes("{release}"),
      `${loc}.json: windows.scopeBody must interpolate {release} instead of hardcoding it`,
    );
  }
  assert.ok(en.windows.title.length > 0);
});
