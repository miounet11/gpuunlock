import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { DEVICES, acceptedCount } from "@/data/devices";
import { BENCH_RUNS } from "@/data/benchmarks";
import { GainChart } from "@/components/gain-chart";
import { jsonLdGraph, organizationLd, pageLd, websiteLd } from "@/lib/jsonld";
import { pageMeta } from "@/lib/seo";
import { REPOS, SITE , INSTALL_SITE } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return pageMeta({
    locale,
    path: "",
    title: t("title"),
    description: t("description"),
    keywords: [
      "gpu unlock", "nvidia gpu unlock", "SM speed select override", "RTX 4090 unlock",
      "RTX 3090 unlock", "gpu_unlock kernel module", "ampere unlock", "ada unlock",
    ],
  });
}

/**
 * The headline rows: the paths where the override moved the rate by more than 10%.
 * Derived from BENCH_RUNS rather than written out, so the chart cannot drift from the
 * benchmarks page it links to.
 */
const HEADLINE_GAINS = BENCH_RUNS.flatMap((run) =>
  run.rows
    .filter((r) => r.ratio > 1.1)
    .map((r) => ({ label: r.mode, sub: `${r.card} · ${r.unit}`, ratio: r.ratio })),
);

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const measured = DEVICES.filter((d) => d.status === "measured");
  const reported = DEVICES.filter((d) => d.status === "reported");

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([
              organizationLd(),
              websiteLd(locale),
              pageLd(locale, "", t("title"), { description: t("description") }),
              {
                "@type": "TechArticle",
                "@id": `${SITE}/${locale}#article`,
                headline: t("h1"),
                description: t("description"),
                inLanguage: locale,
                about: ["NVIDIA GPU", "kernel module", "SM speed select override"],
              },
            ]),
          ),
        }}
      />

      <h1>{t("h1")}</h1>
      <p className="lead">{t("lead")}</p>

      <div className="grid" style={{ marginTop: "2rem" }}>
        <div className="card">
          <div className="stat">
            <span className="v">{acceptedCount()}</span>
            <span className="k">{t("statIds")}</span>
          </div>
          <p className="meta">{t("statIdsNote")}</p>
        </div>
        <div className="card">
          <div className="stat">
            <span className="v">{measured.length}</span>
            <span className="k">{t("statMeasured")}</span>
          </div>
          <p className="meta">{t("statMeasuredNote")}</p>
        </div>
        <div className="card">
          <div className="stat">
            <span className="v">2×</span>
            <span className="k">{t("statGain")}</span>
          </div>
          <p className="meta">{t("statGainNote")}</p>
        </div>
      </div>

      <h2>{t("whatTitle")}</h2>
      <p>{t("whatBody")}</p>
      <div className="callout">
        <p>
          <strong>{t("whatWarnTitle")}</strong>
        </p>
        <p>{t("whatWarnBody")}</p>
      </div>

      <h2>{t("chartTitle")}</h2>
      <p>{t("benchBody")}</p>
      {/* Only the paths the override actually moves. A 1.00× row rendered as a full bar
          would read as a gain, so the flat rows stay on the benchmarks page. */}
      <GainChart
        data={HEADLINE_GAINS}
        labels={{
          stock: t("chartStock"),
          peak: t("chartPeak"),
          caption: t("chartCaption"),
        }}
      />
      <p className="meta">
        <Link href="/benchmarks">{t("seeAllBench")}</Link>
      </p>

      <h2>{t("cardsTitle")}</h2>
      <p>{t("cardsBody")}</p>
      <ul className="gpu-list">
        {measured.map((d) => (
          <li key={d.slug}>
            <Link className="name" href={`/gpus/${d.slug}`}>
              {d.name}
            </Link>
            <span className="pid">{d.pciId}</span>
            <span className="badge measured">{d.chip}</span>
            {d.gainMin ? (
              <span className="meta">
                +{d.gainMin}
                {d.gainMax && d.gainMax !== d.gainMin ? `–${d.gainMax}` : ""}%
              </span>
            ) : null}
          </li>
        ))}
        {reported.slice(0, 5).map((d) => (
          <li key={d.slug}>
            <Link className="name" href={`/gpus/${d.slug}`}>
              {d.name}
            </Link>
            <span className="pid">{d.pciId}</span>
            <span className="badge reported">{d.chip}</span>
          </li>
        ))}
      </ul>
      <p className="meta">
        <Link href="/gpus">{t("cardCount", { count: DEVICES.length })}</Link>
      </p>

      <h2>{t("startTitle")}</h2>
      <ol>
        <li>
          <Link href="/gpus">{t("startStep1")}</Link>
        </li>
        <li>
          <Link href="/benchmarks">{t("startStep2")}</Link>
        </li>
        <li>
          <a href={`${INSTALL_SITE}/${locale}/install`} rel="noopener noreferrer">
            {t("startStep3")}
          </a>
        </li>
      </ol>

      <h2>{t("upstreamTitle")}</h2>
      <p>{t("upstreamBody")}</p>
      <ul>
        <li>
          <a href={REPOS.ampere} rel="noopener noreferrer">
            Zagitta/gpu-unlock
          </a>{" "}
          — {t("upstreamAmpere")}
        </li>
        <li>
          <a href={REPOS.ada} rel="noopener noreferrer">
            JustAResearcher/gpu-unlock-ada
          </a>{" "}
          — {t("upstreamAda")}
        </li>
        <li>
          <a href={REPOS.usage} rel="noopener noreferrer">
            miounet11/gpuunlock
          </a>{" "}
          — {t("upstreamUsage")}
        </li>
        <li>
          <a href={REPOS.turing} rel="noopener noreferrer">
            nlzy/turing-unlock
          </a>{" "}
          — {t("upstreamTuring")}
        </li>
      </ul>
    </div>
  );
}
