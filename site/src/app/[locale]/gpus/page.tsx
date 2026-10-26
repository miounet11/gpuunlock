import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { DEVICES, acceptedCount, type DeviceStatus } from "@/data/devices";
import { GpuExplorer, type GpuExplorerLabels } from "@/components/gpu-explorer";
import { breadcrumbLd, jsonLdGraph, pageLd } from "@/lib/jsonld";
import { pageMeta } from "@/lib/seo";
import { installUrl } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "gpus" });
  return pageMeta({
    locale,
    path: "/gpus",
    title: t("title"),
    description: t("description"),
    keywords: ["gpu unlock supported cards", "nvidia pci id unlock", "RTX 4090 10de:2684", "RTX 3090 10de:2204"],
  });
}

const ORDER: DeviceStatus[] = ["measured", "reported", "partial", "untested", "unsupported"];

export default async function GpusIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("gpus");
  const tExplorer = await getTranslations("gpus.explorer");

  const labels: GpuExplorerLabels = {
    searchPlaceholder: tExplorer("searchPlaceholder"),
    searchLabel: tExplorer("searchLabel"),
    filterLabel: tExplorer("filterLabel"),
    all: tExplorer("all"),
    sortLabel: tExplorer("sortLabel"),
    sortName: tExplorer("sortName"),
    sortChip: tExplorer("sortChip"),
    sortStatus: tExplorer("sortStatus"),
    sortGain: tExplorer("sortGain"),
    sortPci: tExplorer("sortPci"),
    resultOne: tExplorer("resultOne"),
    resultMany: tExplorer("resultMany"),
    emptyTitle: tExplorer("emptyTitle"),
    emptyBody: tExplorer("emptyBody"),
    clear: tExplorer("clear"),
    noGain: tExplorer("noGain"),
    status: {
      measured: t("status.measured"),
      reported: t("status.reported"),
      partial: t("status.partial"),
      untested: t("status.untested"),
      unsupported: t("status.unsupported"),
    },
  };

  // Only the fields the table renders cross to the client. `sources` and the long `notes`
  // stay server-side, which keeps the serialised payload small on a 30-card index.
  const payload = DEVICES.map((d) => ({
    slug: d.slug,
    name: d.name,
    chip: d.chip,
    pciId: d.pciId,
    vendor: d.vendor,
    status: d.status,
    gainMin: d.gainMin,
    gainMax: d.gainMax,
    fork: d.fork,
    notes: d.notes,
    sources: [],
  }));

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([
              pageLd(locale, "/gpus", t("title"), { description: t("description"), type: "CollectionPage" }),
              breadcrumbLd(locale, [
                { name: "GPU Unlock", path: "" },
                { name: t("title"), path: "/gpus" },
              ]),
              {
                "@type": "ItemList",
                name: t("title"),
                numberOfItems: DEVICES.length,
                itemListElement: DEVICES.map((d, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  name: `${d.name} (${d.pciId})`,
                  url: `https://gpuunlock.com/${locale}/gpus/${d.slug}`,
                })),
              },
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
            <span className="v">{acceptedCount()}</span>
            <span className="k">{t("statIds")}</span>
          </div>
          <div className="stat">
            <span className="v">{DEVICES.length}</span>
            <span className="k">{t("statDescribed")}</span>
          </div>
          <div className="stat">
            <span className="v">{DEVICES.filter((d) => d.status === "measured").length}</span>
            <span className="k">{t("statMeasured")}</span>
          </div>
        </div>
        <p className="meta">{t("summary", { total: acceptedCount(), cards: DEVICES.length })}</p>
      </header>

      <section className="section">
        <h2>{t("explorerTitle")}</h2>
        <GpuExplorer devices={payload} labels={labels} />
      </section>

      <section className="section">
        <h2>{t("legendTitle")}</h2>
        <div className="grid">
          {ORDER.map((status) => {
            const items = DEVICES.filter((d) => d.status === status);
            if (items.length === 0) return null;
            return (
              <div className="card" key={status}>
                <div className="card-head">
                  <span className={`badge ${status}`}>{t(`status.${status}`)}</span>
                  <span className="meta">{items.length}</span>
                </div>
                <p className="meta">{t(`statusExplain.${status}`)}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h2>{t("idsTitle")}</h2>
        <p>{t("idsBody")}</p>
        <p className="meta">
          <a href={installUrl(locale, "/install")} rel="noopener noreferrer">
            {t("installLink")}
          </a>
        </p>
      </section>
    </div>
  );
}
