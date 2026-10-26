import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
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
} from "@/data/windows-port";
import { breadcrumbLd, jsonLdGraph, pageLd } from "@/lib/jsonld";
import { pageMeta } from "@/lib/seo";
import { installUrl } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "windows" });
  return pageMeta({
    locale,
    path: "/windows",
    title: t("title"),
    description: t("description"),
    keywords: [
      "gpu unlock windows", "uefi gpu unlock", "RTX 3090 unlock windows",
      "efi payload nvidia", "Windows GPU UNLOCK", "headless boot windows",
    ],
  });
}

export default async function Windows({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("windows");
  const statusKey: Record<string, string> = {
    recorded: "statusRecorded",
    reported: "statusReported",
    "upstream-target": "statusUpstream",
  };

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([
              pageLd(locale, "/windows", t("title"), {
                description: t("description"),
                type: "TechArticle",
              }),
              breadcrumbLd(locale, [
                { name: "GPU Unlock", path: "" },
                { name: t("title"), path: "/windows" },
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
      <h1>{t("h1")}</h1>
      <p className="page-intro">{t("lead")}</p>

      <div className="callout">
        <p>
          <strong>{t("linuxTitle")}</strong>
        </p>
        <p>{t("linuxBody")}</p>
      </div>

      <h2>{t("scopeTitle")}</h2>
      <p>{t("scopeBody", { release: WINDOWS_RELEASE })}</p>
      <ul>
        {WINDOWS_SCOPE.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>

      <h2>{t("cardsTitle")}</h2>
      <p>{t("cardsBody")}</p>
      <table>
        <thead>
          <tr>
            <th>{t("colCard")}</th>
            <th>{t("colChip")}</th>
            <th>{t("colStatus")}</th>
            <th>{t("colRoute")}</th>
          </tr>
        </thead>
        <tbody>
          {WINDOWS_CARDS.map((c) => (
            <tr key={c.card}>
              <td>
                <strong>{c.card}</strong>
              </td>
              <td>{c.chip}</td>
              <td>{t(statusKey[c.status])}</td>
              <td>{c.route}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>{t("pathsTitle")}</h2>
      <p>{t("pathsBody")}</p>
      <table>
        <thead>
          <tr>
            <th>{t("colPath")}</th>
            <th>{t("colDisplay")}</th>
            <th>{t("colGuide")}</th>
          </tr>
        </thead>
        <tbody>
          {WINDOWS_PATHS.map((p) => (
            <tr key={p.name}>
              <td>
                <strong>{p.name}</strong>
              </td>
              <td>{p.display}</td>
              <td>
                <a href={windowsDocUrl(p.guide, p.ref)} rel="noopener noreferrer">
                  {t("guideLink")}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>{t("reqTitle")}</h2>
      <ul>
        {WINDOWS_REQUIREMENTS.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      <h2>{t("stepsTitle")}</h2>
      {WINDOWS_STEPS.map((s, i) => (
        <section key={s.id}>
          <h3>
            {i + 1}. {s.title}
          </h3>
          <p>{s.body}</p>
          {s.code ? (
            <pre>
              <code>{s.code}</code>
            </pre>
          ) : null}
          {s.note ? (
            <p className="meta">
              <em>{s.note}</em>
            </p>
          ) : null}
        </section>
      ))}

      <h2>{t("measureTitle")}</h2>
      <p>{t("measureBody")}</p>
      <table>
        <thead>
          <tr>
            <th>{t("colMode")}</th>
            <th>{t("colValue")}</th>
          </tr>
        </thead>
        <tbody>
          {WINDOWS_MEASUREMENTS.map((m) => (
            <tr key={m.path}>
              <td>
                <code>{m.path}</code>
              </td>
              <td>{m.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>{t("teardownTitle")}</h2>
      <p>{t("teardownBody")}</p>
      <ul>
        {WINDOWS_TEARDOWN.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>

      <h2>{t("licenseTitle")}</h2>
      <p>{WINDOWS_LICENSE}</p>

      <p>
        <a href={WINDOWS_REPO} rel="noopener noreferrer">
          {t("repoLink")}
        </a>
      </p>
      <p className="meta">
        <a href={installUrl(locale, "/faq")} rel="noopener noreferrer">
          {t("faqLink")}
        </a>
      </p>
    </div>
  );
}
