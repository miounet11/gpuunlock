import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BENCH_RUNS } from "@/data/benchmarks";
import { MODE_GROUPS, groupBySlug, groupForRow, type ModeGroup } from "@/data/modes";
import { breadcrumbLd, jsonLdGraph, pageLd } from "@/lib/jsonld";
import { pageMeta } from "@/lib/seo";

// Only groups that actually carry a measurement get a page. A page whose table is empty
// would be a thin page that claims coverage it does not have — and `best` below would be
// undefined, which crashes the render.
function measuredFor(group: ModeGroup) {
  return BENCH_RUNS.flatMap((run) =>
    run.rows
      .filter((r) => groupForRow(r.cardSlug, r.mode, r.iters) === group.id)
      .map((r) => ({
        card: run.card,
        cardSlug: run.cardSlug,
        chip: run.chip,
        sms: run.sms,
        driver: run.driver,
        mode: r.mode,
        unit: r.unit,
        stock: r.stock,
        unlocked: r.unlocked,
        ratio: r.ratio,
        iters: r.iters,
        note: r.note,
        ceiling: r.ceiling,
        ceilingKind: r.ceilingKind,
        ceilingBasis: r.ceilingBasis,
      })),
  );
}

const MEASURED_GROUPS = MODE_GROUPS.filter((g) => measuredFor(g).length > 0);

// The evidence files spell the same unit two ways ("TF/s" on the 4090 run, "TFLOP/s" on
// the 4070 Ti SUPER run). Keeping that verbatim in the data is right; printing both in one
// table is not, so the page shows a single spelling. The number is untouched.
function unitOf(r: { unit: string }): string {
  return r.unit === "TF/s" ? "TFLOP/s" : r.unit;
}

export function generateStaticParams() {
  return MEASURED_GROUPS.map((g) => ({ mode: g.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; mode: string }>;
}) {
  const { locale, mode } = await params;
  const group = groupBySlug(mode);
  if (!group) return {};
  const t = await getTranslations({ locale, namespace: "bench.modes" });
  const name = t(`${group.id}.name`);
  return pageMeta({
    locale,
    path: `/benchmarks/${group.id}`,
    title: `${name} — ${t("metaSuffix")}`,
    description: t(`${group.id}.body`),
    keywords: [group.matches.join(" "), "gpu unlock benchmark", "tensor core rate"],
  });
}

export default async function ModePage({
  params,
}: {
  params: Promise<{ locale: string; mode: string }>;
}) {
  const { locale, mode } = await params;
  setRequestLocale(locale);
  const group = groupBySlug(mode);
  if (!group) notFound();

  const rows = measuredFor(group);
  // Reachable only if a card lost its measurement while the route stayed statically
  // generated; better a 404 than an empty table presented as coverage.
  if (rows.length === 0) notFound();

  const t = await getTranslations("bench.modes");
  const tBench = await getTranslations("bench");
  const name = t(`${group.id}.name`);
  const best = rows.reduce((a, b) => (b.ratio > a.ratio ? b : a), rows[0]);
  const ceilingRows = rows.filter((r) => r.ceiling !== undefined);
  const changed = rows.filter((r) => r.ratio >= 1.01).length;

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([
              pageLd(locale, `/benchmarks/${group.id}`, name, {
                description: t(`${group.id}.body`),
                type: "TechArticle",
              }),
              breadcrumbLd(locale, [
                { name: "GPU Unlock", path: "" },
                { name: tBench("title"), path: "/benchmarks" },
                { name, path: `/benchmarks/${group.id}` },
              ]),
            ]),
          ),
        }}
      />
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">GPU Unlock</Link>
        <span className="sep">/</span>
        <Link href="/benchmarks">{tBench("title")}</Link>
        <span className="sep">/</span>
        <span aria-current="page">{name}</span>
      </nav>

      <header className="page-head">
        <h1>{name}</h1>
        <p className="page-intro">{t(`${group.id}.body`)}</p>
        <p className="meta">
          <code>{group.matches.join(", ")}</code> · {group.unit} ·{" "}
          <span className={`badge ${group.gated ? "measured" : "untested"}`}>
            {group.gated ? t("gatedYes") : t("gatedNo")}
          </span>
        </p>
        <div className="stat-row">
          <div className="stat">
            <span className="v">{rows.length}</span>
            <span className="k">{t("statRows")}</span>
          </div>
          <div className="stat">
            <span className="v">{changed}</span>
            <span className="k">{t("statChanged")}</span>
          </div>
          <div className="stat">
            <span className="v">{best.ratio.toFixed(2)}×</span>
            <span className="k">{t("statPeak")}</span>
          </div>
        </div>
      </header>

      <div className="callout">
        <p>
          <strong>{t("methodTitle")}</strong>
        </p>
        <p>{group.method}</p>
      </div>

      {/* Only shown when a row carries a ceiling, and always with its derivation. The
          distance to the peak is the finding: one GEMM at a third of the dense rate is
          not the same statement as an issue-rate loop at the limit. */}
      {ceilingRows.length > 0 && (
        <div className="callout">
          <p>
            <strong>{t("ceilingTitle")}</strong>
          </p>
          {ceilingRows.map((r) => (
            <p key={`${r.cardSlug}-${r.mode}`} className="meta">
              {t("ceilingRow", {
                card: r.card,
                value: r.unlocked.toFixed(0),
                unit: r.unit,
                ceiling: r.ceiling!.toFixed(0),
                pct: ((r.unlocked / r.ceiling!) * 100).toFixed(1),
              })}
              <br />
              <span className="meta">{r.ceilingBasis}</span>
            </p>
          ))}
        </div>
      )}

      <section className="section">
        <h2>{t("tableTitle")}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tBench("colMode")}</th>
                <th className="num">{t("colStock")}</th>
                <th className="num">{t("colUnlocked")}</th>
                <th className="num">{t("colGain")}</th>
                <th>{t("colCard")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.cardSlug}-${r.mode}-${r.iters}`}>
                  <td>
                    <code>{r.mode}</code>
                  </td>
                  <td className="num">
                    {r.stock.toFixed(2)} {unitOf(r)}
                  </td>
                  <td className="num">
                    {r.unlocked.toFixed(2)} {unitOf(r)}
                  </td>
                  <td className="num">
                    <strong>{r.ratio.toFixed(2)}×</strong>
                  </td>
                  <td>
                    <Link href={`/gpus/${r.cardSlug}`}>{r.card}</Link>
                    <span className="meta"> · {r.sms} SMs</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="meta">{t("tableNote")}</p>
      </section>

      <section className="section">
        <h2>{t("coverageTitle")}</h2>
        <p>{t("coverageBody")}</p>
      </section>

      <section className="section">
        <h2>{t("otherModes")}</h2>
        <ul className="link-list">
          {MODE_GROUPS.filter((g) => g.id !== group.id && measuredFor(g).length > 0).map((g) => (
            <li key={g.id}>
              <Link href={`/benchmarks/${g.id}`}>{t(`${g.id}.name`)}</Link>
              <span className="meta"> · {measuredFor(g).length}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
