import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BENCH_RUNS, FP8_CUTLASS } from "@/data/benchmarks";
import { MODE_GROUPS, groupForRow } from "@/data/modes";
import { BenchExplorer, type BenchLabels, type BenchTableRow } from "@/components/bench-explorer";
import { breadcrumbLd, jsonLdGraph, pageLd } from "@/lib/jsonld";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "bench" });
  return pageMeta({
    locale,
    path: "/benchmarks",
    title: t("title"),
    description: t("description"),
    keywords: ["rtx 4090 unlock benchmark", "bf16 tensor core unlock", "gpu unlock speedup", "sm speed select benchmark"],
  });
}

export default async function Benchmarks({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("bench");
  const tEx = await getTranslations("bench.explorer");
  const tModes = await getTranslations("bench.modes");

  const labels: BenchLabels = {
    colCard: tEx("colCard"),
    colMode: tEx("colMode"),
    colStock: tEx("colStock"),
    colUnlocked: tEx("colUnlocked"),
    colGain: tEx("colGain"),
    filterLabel: tEx("filterLabel"),
    viewAll: tEx("viewAll"),
    viewChanged: tEx("viewChanged"),
    viewFlat: tEx("viewFlat"),
    searchLabel: tEx("searchLabel"),
    searchPlaceholder: tEx("searchPlaceholder"),
    resultOne: tEx("resultOne"),
    resultMany: tEx("resultMany"),
    emptyTitle: tEx("emptyTitle"),
    emptyBody: tEx("emptyBody"),
    clear: tEx("clear"),
    sortLabel: tEx("sortLabel"),
  };

  // One flat row list: the explorer filters across cards, which a per-card table cannot do.
  const rows: BenchTableRow[] = BENCH_RUNS.flatMap((run) =>
    run.rows.map((r) => ({
      card: run.card,
      cardSlug: run.cardSlug,
      slug: run.cardSlug,
      chip: run.chip,
      pciId: r.pciId,
      mode: r.mode,
      unit: r.unit,
      stock: r.stock,
      unlocked: r.unlocked,
      ratio: r.ratio,
      iters: r.iters,
      note: r.note,
    })),
  );

  // Rows grouped by what they measure, so the mode cards and the flat table agree.
  const groupedModes = MODE_GROUPS.map((group) => ({
    group,
    rows: rows.filter((r) => groupForRow(r.slug, r.mode, r.iters) === group.id),
  })).filter((g) => g.rows.length > 0);

  const measuredCards = BENCH_RUNS.length;
  const flatRows = rows.filter((r) => r.ratio < 1.01).length;
  const peak = rows.reduce((best, r) => (r.ratio > best.ratio ? r : best), rows[0]);

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([
              pageLd(locale, "/benchmarks", t("title"), { description: t("description"), type: "CollectionPage" }),
              breadcrumbLd(locale, [
                { name: "GPU Unlock", path: "" },
                { name: t("title"), path: "/benchmarks" },
              ]),
            ]),
          ),
        }}
      />
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">GPU Unlock</Link>
        <span className="sep">/</span>
        <span aria-current="page">{t("title")}</span>
      </nav>

      <header className="page-head">
        <h1>{t("title")}</h1>
        <p className="page-intro">{t("description")}</p>
        <div className="stat-row">
          <div className="stat">
            <span className="v">{rows.length}</span>
            <span className="k">{t("statRows")}</span>
          </div>
          <div className="stat">
            <span className="v">{measuredCards}</span>
            <span className="k">{t("statCards")}</span>
          </div>
          <div className="stat">
            <span className="v">{peak.ratio.toFixed(2)}×</span>
            <span className="k">{t("statPeak")}</span>
          </div>
          <div className="stat">
            <span className="v">{flatRows}</span>
            <span className="k">{t("statFlat")}</span>
          </div>
        </div>
      </header>

      <div className="callout">
        <p>
          <strong>{t("methodTitle")}</strong>
        </p>
        <p>{t("methodBody")}</p>
      </div>

      <section className="section">
        <h2>{t("modesTitle")}</h2>
        <p>{t("modesBody")}</p>
        <div className="grid">
          {groupedModes.map(({ group, rows: gRows }) => {
            const best = gRows.reduce((a, b) => (b.ratio > a.ratio ? b : a), gRows[0]);
            return (
              <article className="card" key={group.id}>
                <div className="card-head">
                  <Link className="card-title" href={`/benchmarks/${group.id}`}>
                    {tModes(`${group.id}.name`)}
                  </Link>
                  <span className={group.gated ? "badge partial" : "badge"}>
                    {group.gated ? tModes("gatedYes") : tModes("gatedNo")}
                  </span>
                </div>
                <p className="meta">
                  {gRows.length} {tModes("statRows")} ·{" "}
                  {gRows.filter((r) => r.ratio >= 1.01).length} {tModes("statChanged")} ·{" "}
                  {best.ratio.toFixed(2)}× {tModes("statPeak")}
                </p>
                <p>{tModes(`${group.id}.body`)}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h2>{t("tableTitle")}</h2>
        <BenchExplorer rows={rows} labels={labels} />
      </section>

      <section className="section">
        <h2>{t("runsTitle")}</h2>
        <div className="grid">
          {BENCH_RUNS.map((run) => (
            <article className="card" key={run.cardSlug}>
              <div className="card-head">
                <Link className="card-title" href={`/gpus/${run.cardSlug}`}>
                  {run.card}
                </Link>
                <span className="badge">{run.chip}</span>
              </div>
              <p className="meta">{t("runMeta", { chip: run.chip, sms: run.sms, driver: run.driver })}</p>
              <p className="meta">
                {run.rows.length} {t("statRows")} · {run.powerLimitW ? `${run.powerLimitW} W` : "—"}
              </p>
              <a className="card-link" href={run.source} rel="noopener noreferrer">
                {t("sourceLink")}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>{t("fp8Title")}</h2>
        <p>{t("fp8Body")}</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("colRun")}</th>
                <th className="num">{t("colMs")}</th>
                <th className="num">{t("colGflops")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("stock")}</td>
                <td className="num">{FP8_CUTLASS.stock.ms.toFixed(5)}</td>
                <td className="num">{FP8_CUTLASS.stock.gflops.toFixed(1)}</td>
              </tr>
              <tr>
                <td>{t("unlocked")}</td>
                <td className="num">{FP8_CUTLASS.unlocked.ms.toFixed(5)}</td>
                <td className="num">{FP8_CUTLASS.unlocked.gflops.toFixed(1)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="meta">
          {FP8_CUTLASS.card} · <code>{FP8_CUTLASS.kernel}</code> ·{" "}
          <span className="badge partial">{FP8_CUTLASS.ratio}×</span>
        </p>
      </section>

      <section className="section">
        <h2>{t("readTitle")}</h2>
        <p>{t("readBody")}</p>
      </section>
    </div>
  );
}
