import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { DEVICES, getDevice } from "@/data/devices";
import { BENCH_RUNS } from "@/data/benchmarks";
import { breadcrumbLd, jsonLdGraph, nodeId, pageLd } from "@/lib/jsonld";
import { pageMeta } from "@/lib/seo";
import { SITE } from "@/lib/site";

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
  const tStatus = await getTranslations("gpus");
  const run = BENCH_RUNS.find((r) => r.cardSlug === d.slug);
  const url = `${SITE}/${locale}/gpus/${d.slug}`;

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

      <h2>{t("statusTitle")}</h2>
      <p>{d.notes}</p>

      {run ? (
        <>
          <h2>{t("benchTitle")}</h2>
          <p className="meta">
            {t("benchMeta", { sms: run.sms, driver: run.driver })}
          </p>
          <table>
            <thead>
              <tr>
                <th>{t("colMode")}</th>
                <th>{t("colStock")}</th>
                <th>{t("colUnlocked")}</th>
                <th>{t("colGain")}</th>
              </tr>
            </thead>
            <tbody>
              {run.rows.map((r) => (
                <tr key={r.mode}>
                  <td>
                    <code>{r.mode}</code>
                  </td>
                  <td>
                    {r.stock.toFixed(2)} {r.unit}
                  </td>
                  <td>
                    {r.unlocked.toFixed(2)} {r.unit}
                  </td>
                  <td>
                    <strong>{r.ratio.toFixed(2)}×</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="meta">{t("benchNote")}</p>
        </>
      ) : (
        <>
          <h2>{t("benchTitle")}</h2>
          <p>{t("noBench")}</p>
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
        <Link href="/install">{t("installLink")}</Link> · <Link href="/gpus">{t("backLink")}</Link>
      </p>
    </div>
  );
}
