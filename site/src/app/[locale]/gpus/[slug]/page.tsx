import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { DEVICES, getDevice } from "@/data/devices";
import { BENCH_RUNS, splitByHarness } from "@/data/benchmarks";
import { MODE_GROUPS, groupForRow } from "@/data/modes";
import { familyCoverage, familyOf, referenceCardFor } from "@/data/families";
import { breadcrumbLd, jsonLdGraph, nodeId, pageLd } from "@/lib/jsonld";
import { pageMeta } from "@/lib/seo";
import { SITE, installUrl } from "@/lib/site";

export function generateStaticParams() {
  return DEVICES.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const d = getDevice(slug);
  if (!d) return {};
  const t = await getTranslations({ locale, namespace: "device" });
  return pageMeta({
    locale,
    path: `/gpus/${d.slug}`,
    title: t("metaTitle", { name: d.name, id: d.pciId }),
    description: t("metaDescription", { name: d.name, chip: d.chip, id: d.pciId, status: d.status }),
    keywords: [d.name, d.pciId, `${d.chip} unlock`, "gpu unlock"],
  });
}

export default async function DevicePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const d = getDevice(slug);
  if (!d) notFound();
  const t = await getTranslations("device");
  const tModes = await getTranslations("bench.modes");
  const tStatus = await getTranslations("gpus");
  const run = BENCH_RUNS.find((r) => r.cardSlug === d.slug);
  const url = `${SITE}/${locale}/gpus/${d.slug}`;

  // The standard loop and the CUTLASS profile are shown as separate tables.
  const byHarness = splitByHarness(run?.rows ?? []);

  // Within the loop table, rows are grouped by what they exercise. The group decides
  // whether the unlock could move the number at all, which is the question a reader
  // arrives with after seeing two rows change and four stay flat.
  const mmaGroups = MODE_GROUPS.map((group) => ({
    group,
    rows: byHarness.mma.filter(
      (r) => groupForRow(r.cardSlug, r.mode, r.iters) === group.id,
    ),
  })).filter((g) => g.rows.length > 0);

  // What a reader can actually stand this card next to. A generation with no measured
  // board says so instead of borrowing a number from a different chip.
  const family = familyOf(d.chip);
  const referenceSlug = family ? referenceCardFor(family) : null;
  const reference = referenceSlug && referenceSlug !== d.slug ? getDevice(referenceSlug) : null;
  const coverage = family ? familyCoverage(DEVICES, family) : null;

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([
              pageLd(locale, `/gpus/${d.slug}`, `${d.name} (${d.pciId})`, {
                description: d.notes,
                type: "TechArticle",
              }),
              breadcrumbLd(locale, [
                { name: "GPU Unlock", path: "" },
                { name: tStatus("title"), path: "/gpus" },
                { name: d.name, path: `/gpus/${d.slug}` },
              ]),
              {
                "@type": "Product",
                "@id": nodeId(url, "product"),
                name: d.name,
                brand: { "@type": "Brand", name: "NVIDIA" },
                category: "Graphics card",
                description: d.notes,
                additionalProperty: [
                  { "@type": "PropertyValue", name: "PCI ID", value: d.pciId },
                  { "@type": "PropertyValue", name: "Chip", value: d.chip },
                  { "@type": "PropertyValue", name: "Unlock status", value: d.status },
                ],
              },
            ]),
          ),
        }}
      />
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">GPU Unlock</Link>
        <span className="sep">/</span>
        <Link href="/gpus">{tStatus("title")}</Link>
        <span className="sep">/</span>
        <span aria-current="page">{d.name}</span>
      </nav>

      <h1>{d.name}</h1>
      <p className="meta">
        <code>{d.pciId}</code> · {d.chip} ·{" "}
        <span className={`badge ${d.status}`}>{tStatus(`status.${d.status}`)}</span>
      </p>

      {/* Only fields this repository can stand behind. Board spec sheets (SM count, TDP,
          VRAM) are deliberately absent: they would have to come from memory or an
          uncited external database, and a wrong number there reads as fact. */}
      <h2>{t("factsTitle")}</h2>
      <table>
        <tbody>
          <tr>
            <th scope="row">{t("factPci")}</th>
            <td>
              <code>{d.pciId}</code>
            </td>
          </tr>
          <tr>
            <th scope="row">{t("factChip")}</th>
            <td>{d.chip}</td>
          </tr>
          <tr>
            <th scope="row">{t("factModule")}</th>
            <td>{t(`module${d.fork[0].toUpperCase()}${d.fork.slice(1)}`)}</td>
          </tr>
          <tr>
            <th scope="row">{t("factStatus")}</th>
            <td>{tStatus(`status.${d.status}`)}</td>
          </tr>
          <tr>
            <th scope="row">{t("factGain")}</th>
            <td>
              {d.gainMin === null
                ? t("gainNone")
                : d.gainMin === d.gainMax
                  ? `${d.gainMin}%`
                  : `${d.gainMin}–${d.gainMax}%`}
            </td>
          </tr>
          {family && coverage && (
            <>
              <tr>
                <th scope="row">{t("factFamily")}</th>
                <td>{family}</td>
              </tr>
              <tr>
                <th scope="row">{t("factCoverage")}</th>
                <td>
                  {t("coverageOf", {
                    measured: coverage.measured,
                    total: coverage.total,
                  })}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      <h2>{t("statusTitle")}</h2>
      <p>{d.notes}</p>

      {run ? (
        <>
          <h2>{t("benchTitle")}</h2>
          <p className="meta">
            {t("benchMeta", { sms: run.sms, driver: run.driver })}
          </p>
          {mmaGroups.map(({ group, rows: gRows }) => {
            const peak = gRows.reduce((a, b) => (b.ratio > a.ratio ? b : a), gRows[0]);
            return (
              <section key={group.id} className="mode-block">
                <h3>
                  <Link href={`/benchmarks/${group.id}`}>
                    {tModes(`${group.id}.name`)}
                  </Link>
                </h3>
                <p className="meta">
                  <span className={`badge ${group.gated ? "measured" : "reported"}`}>
                    {group.gated ? tModes("gatedYes") : tModes("gatedNo")}
                  </span>{" "}
                  {t("peakLine", { peak: peak.ratio.toFixed(2) })}
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>{t("colMode")}</th>
                      <th>{t("colIters")}</th>
                      <th>{t("colStock")}</th>
                      <th>{t("colUnlocked")}</th>
                      <th>{t("colGain")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gRows.map((r) => (
                      <tr key={`${r.mode}-${r.iters}`}>
                        <td>
                          <code>{r.mode}</code>
                        </td>
                        <td className="num">
                          {r.unlockedIters && r.unlockedIters !== r.iters
                            ? `${r.iters} → ${r.unlockedIters}`
                            : r.iters}
                        </td>
                        <td className="num">
                          {r.stock.toFixed(2)} {r.unit}
                        </td>
                        <td className="num">
                          {r.unlocked.toFixed(2)} {r.unit}
                        </td>
                        <td className="num">
                          <strong>{r.ratio.toFixed(2)}×</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
          <p className="meta">{t("benchNote")}</p>

          {/* A CUTLASS profiler run is not the MMA loop above. Presenting the two as one
              table would imply a common method the evidence does not support. */}
          {byHarness.cutlass.length > 0 && (
            <>
              <h3>{t("cutlassTitle")}</h3>
              <p className="meta">{t("cutlassNote")}</p>
              <table>
                <thead>
                  <tr>
                    <th>{t("colMode")}</th>
                    <th>{t("colIters")}</th>
                    <th>{t("colStock")}</th>
                    <th>{t("colUnlocked")}</th>
                    <th>{t("colGain")}</th>
                  </tr>
                </thead>
                <tbody>
                  {byHarness.cutlass.map((r) => (
                    <tr key={`${r.mode}-${r.iters}`}>
                      <td>
                        <Link href={`/benchmarks/${groupForRow(r.cardSlug, r.mode, r.iters)}`}>
                          <code>{r.mode}</code>
                        </Link>
                      </td>
                      <td className="num">
                        {r.unlockedIters && r.unlockedIters !== r.iters
                          ? `${r.iters} → ${r.unlockedIters}`
                          : r.iters}
                      </td>
                      <td className="num">
                        {r.stock.toFixed(2)} {r.unit}
                      </td>
                      <td className="num">
                        {r.unlocked.toFixed(2)} {r.unit}
                      </td>
                      <td className="num">
                        <strong>{r.ratio.toFixed(2)}×</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      ) : (
        <>
          <h2>{t("benchTitle")}</h2>
          <p>{t("noBench")}</p>
          {reference ? (
            <p className="meta">
              {t("familyRef", { family: family ?? "", name: reference.name })}{" "}
              <Link href={`/gpus/${reference.slug}`}>{reference.name}</Link>
            </p>
          ) : (
            <p className="meta">
              {t("familyNone", { family: family ?? "", total: coverage?.total ?? 0 })}
            </p>
          )}
        </>
      )}

      <h2>{t("sourcesTitle")}</h2>
      <ul>
        {d.sources.map((s) => (
          <li key={s}>
            <a href={s} rel="noopener noreferrer">
              {s.replace("https://github.com/", "")}
            </a>
          </li>
        ))}
      </ul>

      <p className="meta">
        <a href={installUrl(locale, "/install")} rel="noopener noreferrer">
          {t("installLink")}
        </a>{" "}
        · <Link href="/gpus">{t("backLink")}</Link>
      </p>
    </div>
  );
}
