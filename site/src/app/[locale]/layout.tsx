import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { SITE_NAME, REPOS , INSTALL_SITE } from "@/lib/site";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const nav = (messages.nav ?? {}) as Record<string, string>;

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <a className="skip-link" href="#main">
            {nav.skip ?? "Skip to content"}
          </a>
          <header className="site-header">
            <div className="inner">
              <Link href="/" className="brand">
                GPU<span>Unlock</span>
              </Link>
              <nav className="site-nav" aria-label={nav.label ?? "Main"}>
                <Link href="/gpus">{nav.gpus ?? "Cards"}</Link>
                <Link href="/benchmarks">{nav.benchmarks ?? "Benchmarks"}</Link>
                {/* The build-and-install walkthrough is the other half of the project and
                    lives on gpu-unlock.com. One page per topic, on one host each. */}
                <a href={`${INSTALL_SITE}/${locale}/install`} rel="noopener noreferrer">
                  {nav.install ?? "Install guide"}
                </a>
                <a href={`${INSTALL_SITE}/${locale}/faq`} rel="noopener noreferrer">
                  {nav.faq ?? "FAQ"}
                </a>
                <a href={REPOS.usage} rel="noopener noreferrer">
                  GitHub
                </a>
              </nav>
            </div>
          </header>
          <main id="main">{children}</main>
          <footer className="site-footer">
            <div className="inner">
              <p>
                {SITE_NAME} documents three upstream projects:{" "}
                <a href={REPOS.ampere} rel="noopener noreferrer">
                  Zagitta/gpu-unlock
                </a>{" "}
                (Ampere),{" "}
                <a href={REPOS.ada} rel="noopener noreferrer">
                  JustAResearcher/gpu-unlock-ada
                </a>{" "}
                (Ada, merged into this repository) and{" "}
                <a href={REPOS.turing} rel="noopener noreferrer">
                  nlzy/turing-unlock
                </a>{" "}
                (Turing).
              </p>
              <p className="meta">
                Source available under GPL-2.0-only. NVIDIA firmware remains under its own terms.
                Not affiliated with NVIDIA.
              </p>
            </div>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
