import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { INSTALL_STEPS, REQUIREMENTS, FAILURE_MODES } from "@/data/install";
import { breadcrumbLd, jsonLdGraph, pageLd } from "@/lib/jsonld";
import { pageMeta } from "@/lib/seo";
import { REPOS } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "install" });
  return pageMeta({
    locale,
    path: "/install",
    title: t("title"),
    description: t("description"),
    keywords: ["gpu unlock install", "gpu_unlock.targets kernel parameter", "nvidia kernel module install", "mkinitcpio gpu unlock"],
  });
}

export default async function Install({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("install");

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([
              pageLd(locale, "/install", t("title"), { description: t("description"), type: "TechArticle" }),
              breadcrumbLd(locale, [
                { name: "GPU Unlock", path: "" },
                { name: t("title"), path: "/install" },
              ]),
              {
                "@type": "HowTo",
                name: t("title"),
                description: t("description"),
                totalTime: "PT30M",
                tool: [{ "@type": "HowToTool", name: "Linux with kernel headers" }],
                step: INSTALL_STEPS.map((s, i) => ({
                  "@type": "HowToStep",
                  position: i + 1,
                  name: s.title,
                  text: s.body,
                  url: `https://gpuunlock.com/${locale}/install#step-${s.id}`,
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

      <div className="callout warn">
        <p>
          <strong>{t("riskTitle")}</strong>
        </p>
        <p>{t("riskBody")}</p>
      </div>

      <h2>{t("reqTitle")}</h2>
      <ul>
        {REQUIREMENTS.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      {INSTALL_STEPS.map((s, i) => (
        <section key={s.id} id={`step-${s.id}`}>
          <h2>
            {i + 1}. {s.title}
          </h2>
          <p>{s.body}</p>
          {s.code ? <pre><code>{s.code}</code></pre> : null}
          {s.note ? <p className="meta">{s.note}</p> : null}
        </section>
      ))}

      <h2>{t("verifyTitle")}</h2>
      <p>{t("verifyBody")}</p>
      <pre>
        <code>{`journalctl -k -b | grep gpu_unlock\nlspci -nnk -s 0000:21:00.0`}</code>
      </pre>

      <h2>{t("failTitle")}</h2>
      <ul>
        {FAILURE_MODES.map((f) => (
          <li key={f.symptom}>
            <strong>{f.symptom}</strong> — {f.cause}
          </li>
        ))}
      </ul>

      <h2>{t("disableTitle")}</h2>
      <p>{t("disableBody")}</p>

      <h2>{t("reposTitle")}</h2>
      <ul>
        <li>
          <a href={REPOS.ampere} rel="noopener noreferrer">
            Zagitta/gpu-unlock
          </a>{" "}
          — {t("repoAmpere")}
        </li>
        <li>
          <a href={REPOS.ada} rel="noopener noreferrer">
            JustAResearcher/gpu-unlock-ada
          </a>{" "}
          — {t("repoAda")}
        </li>
        <li>
          <a href={REPOS.usage} rel="noopener noreferrer">
            miounet11/gpuunlock
          </a>{" "}
          — {t("repoMerged")}
        </li>
        <li>
          <a href={REPOS.turing} rel="noopener noreferrer">
            nlzy/turing-unlock
          </a>{" "}
          — {t("repoTuring")}
        </li>
      </ul>
      <p className="meta">
        <Link href="/faq">{t("faqLink")}</Link>
      </p>
    </div>
  );
}
