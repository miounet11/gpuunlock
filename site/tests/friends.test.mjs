// The footer's friend links are reciprocal by design: every site listed here must link back
// from its own footer. These assertions pin the things that can silently rot — a description
// that only exists in en.json, a locale prefix on a site that does not serve one, a typo in an
// origin that would send a reader to a parked domain.
//
// The first version of the footer appended "/<locale>" to every origin, which 404'd on two of
// the five targets. The locale-shape fields and their assertions exist because of that.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const LOCALES = ["en", "zh", "ja", "de", "fr", "es", "pt"];

const friendsSrc = read("../src/data/friends.ts");
const layout = read("../src/app/[locale]/layout.tsx");

/** One object literal per entry; fields are read individually so optional ones can be absent. */
const ENTRIES = friendsSrc
  .slice(friendsSrc.indexOf("FRIEND_SITES"), friendsSrc.indexOf("as const;"))
  .split(/\n  \{\n/)
  .slice(1)
  .map((block) => {
    const field = (name) => block.match(new RegExp(`${name}:\\s*"([^"]*)"`))?.[1];
    const localeMapBody = block.match(/localeMap:\s*\{([^}]*)\}/)?.[1];
    const localeMap = localeMapBody
      ? Object.fromEntries(
          [...localeMapBody.matchAll(/(\w+):\s*"([^"]+)"/g)].map(([, k, v]) => [k, v]),
        )
      : undefined;
    return {
      name: field("name"),
      slug: field("slug"),
      origin: field("origin"),
      path: field("path") ?? "",
      localeMap,
      monolingual: /monolingual:\s*true/.test(block),
      trailingSlash: /trailingSlash:\s*true/.test(block),
    };
  });

test("every entry parses with the fields the footer needs", () => {
  assert.ok(ENTRIES.length >= 5, `expected at least 5 entries, parsed ${ENTRIES.length}`);
  for (const e of ENTRIES) {
    assert.ok(e.name, "entry is missing name");
    assert.ok(e.slug, `${e.name}: missing slug`);
    assert.ok(e.origin, `${e.name}: missing origin`);
  }
});

test("every origin is https with no trailing slash", () => {
  for (const e of ENTRIES) {
    assert.match(e.origin, /^https:\/\/[a-z0-9.-]+$/, `${e.name}: ${e.origin}`);
  }
});

test("slugs are i18n-safe: no dots, since a dot in a key reads as a nesting separator", () => {
  const seen = new Set();
  for (const e of ENTRIES) {
    assert.doesNotMatch(e.slug, /\./, `${e.name}: slug must not contain a dot`);
    assert.match(e.slug, /^[A-Za-z][A-Za-z0-9]*$/, `${e.name}: ${e.slug}`);
    assert.ok(!seen.has(e.slug), `duplicate slug ${e.slug}`);
    seen.add(e.slug);
  }
});

test("Cleanyourtv maps the two codes it spells differently", () => {
  // Verified against the live host: /zh and /pt are 404 there, /zh-CN/ and /pt-BR/ are 200.
  const cyt = ENTRIES.find((e) => e.origin === "https://www.cleanyourtv.cc");
  assert.ok(cyt, "cleanyourtv entry missing");
  assert.deepEqual(cyt.localeMap, { zh: "zh-CN", pt: "pt-BR" });
});

test("Android Ad Cleaner is marked monolingual", () => {
  // It serves one language at every path; /zh and /en are both 404 there.
  const aac = ENTRIES.find((e) => e.origin === "https://www.androidadcleaner.com");
  assert.ok(aac, "androidadcleaner entry missing");
  assert.equal(aac.monolingual, true, "prefixing a locale on this origin would 404");
});

test("no entry is both monolingual and locale-mapped", () => {
  for (const e of ENTRIES) {
    assert.ok(
      !(e.monolingual && e.localeMap),
      `${e.name}: a monolingual site has no locale codes to map`,
    );
    assert.ok(
      !(e.monolingual && e.trailingSlash),
      `${e.name}: a monolingual entry has no locale path to terminate`,
    );
  }
});

test("Cleanyourtv 301s without a trailing slash, so the link includes one", () => {
  // /en and /zh-CN both answer 301 -> the same URL with a slash; linking the final form
  // spares every click a hop.
  const cyt = ENTRIES.find((e) => e.origin === "https://www.cleanyourtv.cc");
  assert.equal(cyt.trailingSlash, true);
});

test("the helper owns URL shape, so the layout cannot drift", () => {
  assert.match(layout, /friendUrl\(site, locale\)/, "the footer must call the helper");
  assert.doesNotMatch(
    layout,
    /site\.origin\}\/\$\{locale\}/,
    "inline interpolation is what produced the 404s; keep it in friendUrl",
  );
  const helper = friendsSrc.slice(friendsSrc.indexOf("export function friendUrl"));
  assert.match(helper, /if \(site\.monolingual\) return/, "monolingual must short-circuit");
  assert.match(helper, /site\.localeMap\?\.\[locale\] \?\? locale/, "unmapped locales fall back");
  assert.match(helper, /site\.trailingSlash \? "\/" : ""/, "the slash must come from the entry");
});

test("friendUrl builds the URLs the live hosts actually serve", async () => {
  // Written against the observed responses: /en 301s on CleanYourTV, /zh 404s there,
  // Android Ad Cleaner 404s on both. Expectations are the final URL, not the redirect.
  const { FRIEND_SITES, friendUrl } = await import("../src/data/friends.ts");
  const url = (origin, locale) => friendUrl(FRIEND_SITES.find((s) => s.origin === origin), locale);

  assert.equal(url("https://www.cleanyourtv.cc", "zh"), "https://www.cleanyourtv.cc/zh-CN/");
  assert.equal(url("https://www.cleanyourtv.cc", "pt"), "https://www.cleanyourtv.cc/pt-BR/");
  assert.equal(url("https://www.cleanyourtv.cc", "en"), "https://www.cleanyourtv.cc/en/");
  assert.equal(url("https://www.androidadcleaner.com", "zh"), "https://www.androidadcleaner.com/");
  assert.equal(url("https://www.androidadcleaner.com", "ja"), "https://www.androidadcleaner.com/");
  assert.equal(url("https://www.stratat.com", "zh"), "https://www.stratat.com/zh");
  assert.equal(url("https://www.jevcode.ai", "pt"), "https://www.jevcode.ai/pt");
  assert.equal(url("https://gpu-unlock.com", "de"), "https://gpu-unlock.com/de");
});

test("the install host stays in the data list but out of the rendered group", () => {
  // gpu-unlock.com is already linked three times under Sister site; showing it twice in one
  // footer is a duplicate, but removing it from the list would hide the reciprocal pair.
  assert.ok(ENTRIES.some((e) => e.origin === "https://gpu-unlock.com"));
  assert.match(layout, /FRIEND_SITES\.filter\(\(site\) => site\.origin !== INSTALL_SITE\)/);
});

test("every locale carries a translated description for every friend", () => {
  for (const loc of LOCALES) {
    const { nav } = JSON.parse(read(`../messages/${loc}.json`));
    assert.ok(nav.footerFriends, `${loc}: nav.footerFriends missing`);
    for (const e of ENTRIES) {
      const key = `footerFriend_${e.slug}`;
      assert.ok(nav[key], `${loc}.json: nav.${key} missing`);
      assert.doesNotMatch(nav[key], /footerFriend_|undefined/, `${loc}.json: nav.${key} is a placeholder`);
    }
  }
});

test("friend links are rel=friend and opened without an opener", () => {
  // `friend` is what distinguishes a reciprocal partner link from a paid or incidental one.
  assert.match(layout, /rel="friend noopener noreferrer"/);
});

test("the friend group is rendered from the data module, not hand-written in the layout", () => {
  assert.match(layout, /FRIEND_SITES\.filter/, "the footer must iterate the list");
  assert.doesNotMatch(
    layout,
    /href="https:\/\/www\.stratat\.com/,
    "hardcoding a friend origin would let the two lists drift",
  );
});
