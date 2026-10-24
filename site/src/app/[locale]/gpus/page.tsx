import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { DEVICES, acceptedCount, type DeviceStatus } from "@/data/devices";
import { breadcrumbLd, jsonLdGraph, pageLd } from "@/lib/jsonld";
import { pageMeta } from "@/lib/seo";

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
  const groups = ORDER.map((status) => ({
    status,
    items: DEVICES.filter((d) => d.status === status),
  })).filter((g) => g.items.length > 0);

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
      <h1>{t("title")}</h1>
      <p className="page-intro">{t("description")}</p>
      <p className="meta">{t("summary", { total: acceptedCount(), cards: DEVICES.length })}</p>

      {groups.map((g) => (
        <section key={g.status}>
          <h2>{t(`statusHeading.${g.status}`)}</h2>
          <p className="meta">{t(`statusExplain.${g.status}`)}</p>
          <ul className="gpu-list">
            {g.items.map((d) => (
              <li key={d.slug}>
                <Link className="name" href={`/gpus/${d.slug}`}>
                  {d.name}
                </Link>
                <span className="pid">{d.pciId}</span>
                <span className="badge">{d.chip}</span>
                {d.gainMin ? (
                  <span className="meta">
                    +{d.gainMin}
                    {d.gainMax && d.gainMax !== d.gainMin ? `–${d.gainMax}` : ""}%
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <h2>{t("idsTitle")}</h2>
      <p>{t("idsBody")}</p>
      <p className="meta">
        <Link href="/install">{t("installLink")}</Link>
      </p>
    </div>
  );
}
