import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (rel) => readFileSync(ROOT + rel, "utf8");

const site = read("src/lib/site.ts");
const layout = read("src/app/[locale]/layout.tsx");
const jsonld = read("src/lib/jsonld.ts");

const SITE = site.match(/export const SITE = "([^"]+)"/)?.[1];
const INSTALL_SITE = site.match(/export const INSTALL_SITE = "([^"]+)"/)?.[1];

test("both hosts are declared as literals, so the pairing can be checked", () => {
  assert.equal(SITE, "https://gpuunlock.com");
  assert.equal(INSTALL_SITE, "https://gpu-unlock.com");
  assert.notEqual(SITE, INSTALL_SITE);
});

test("the footer links back to the install host, not only the other way round", () => {
  // The install site already credits this host in its header and footer. A one-way pair
  // leaves this site taking a referral it never returns, which is the thing to prevent.
  const footer = layout.slice(layout.indexOf("<footer"));
  assert.ok(footer.includes("INSTALL_SITE"), "footer must reference INSTALL_SITE");
  assert.ok(
    footer.includes("footerSister"),
    "the reciprocal links need their own labelled group",
  );
  for (const path of ["/install", "/faq"]) {
    assert.ok(
      footer.includes(`\${INSTALL_SITE}/\${locale}${path}`),
      `footer must link to ${path} on the install host`,
    );
  }
});

test("the reciprocity link does not reuse the header's labels", () => {
  // An earlier version wrote nav.install / nav.faq here, which silently renamed the
  // header links. Distinct keys keep the two placements independent.
  const footer = layout.slice(layout.indexOf("<footer"));
  assert.ok(footer.includes("sisterInstall"), "footer install label must be its own key");
  assert.ok(footer.includes("sisterFaq"), "footer FAQ label must be its own key");
  assert.doesNotMatch(
    footer,
    /\{nav\.(install|faq) \?\?/,
    "footer must not reuse the header label keys",
  );
});

test("structured data names the install host as the same publisher", () => {
  assert.ok(
    jsonld.includes("INSTALL_SITE"),
    "organizationLd.sameAs must include the install host",
  );
});

test("every locale carries the sister-site labels", () => {
  for (const loc of ["en", "zh", "ja", "de", "fr", "es", "pt"]) {
    const m = JSON.parse(read(`messages/${loc}.json`));
    for (const key of ["footerSister", "sisterInstall", "sisterFaq"]) {
      assert.ok(m.nav[key], `${loc}.json nav.${key} is missing`);
    }
    // The header labels must survive; they were clobbered once already.
    assert.ok(m.nav.install, `${loc}.json nav.install was lost`);

    // The header renders `nav.faq ?? "FAQ"`. Until this key existed every non-English
    // page silently showed the English fallback, so pin it per locale.
    assert.ok(m.nav.faq, `${loc}.json nav.faq is missing, header would fall back to English`);
    assert.ok(
      m.nav.install !== m.nav.sisterInstall,
      `${loc}.json: header and footer install labels must differ (${m.nav.install})`,
    );
  }
});
