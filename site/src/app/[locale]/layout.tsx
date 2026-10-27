import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { SITE_NAME, REPOS, INSTALL_SITE } from "@/lib/site";
import { FRIEND_SITES, friendUrl } from "@/data/friends";
import { NavShell } from "@/components/nav-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Applies the stored theme before the first paint. Without this the page renders dark and
 * then flips to light, which is worse than either theme. Kept as a string because it has to
 * be inline in <head>, before any bundle is parsed.
 */
const THEME_BOOTSTRAP = `
(function(){
  try {
    var stored = localStorage.getItem("gpuunlock-theme") || "system";
    var dark = stored === "dark" || (stored === "system" &&
      !window.matchMedia("(prefers-color-scheme: light)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();
`.trim();

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
    <html lang={locale} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <a className="skip-link" href="#main">
            {nav.skip ?? "Skip to content"}
          </a>
          <header className="site-header">
            <div className="inner">
              <Link href="/" className="brand">
                <span className="brand-mark" aria-hidden="true">
                  ⚡
                </span>
                GPU<span>Unlock</span>
              </Link>
              <NavShell
                menuLabel={nav.label ?? "Main"}
                closeLabel={nav.close ?? "Close menu"}
                actions={
                  <>
                    <ThemeToggle
                      label={nav.theme ?? "Theme"}
                      labels={{
                        system: nav.themeSystem ?? "System",
                        light: nav.themeLight ?? "Light",
                        dark: nav.themeDark ?? "Dark",
                      }}
                    />
                    <LocaleSwitcher label={nav.language ?? "Language"} />
                  </>
                }
              >
                <Link href="/gpus" className="nav-link">
                  {nav.gpus ?? "Cards"}
                </Link>
                <Link href="/benchmarks" className="nav-link">
                  {nav.benchmarks ?? "Benchmarks"}
                </Link>
                {/* Windows is a separate EFI implementation, not a fourth Linux module,
                    so it gets its own entry rather than a row in the card list. */}
                <Link href="/windows" className="nav-link">
                  {nav.windows ?? "Windows port"}
                </Link>
                {/* The build-and-install walkthrough is the other half of the project and
                    lives on gpu-unlock.com. One page per topic, on one host each. */}
                <a
                  href={`${INSTALL_SITE}/${locale}/install`}
                  className="nav-link"
                  rel="noopener noreferrer"
                >
                  {nav.install ?? "Install guide"}
                </a>
                <a
                  href={`${INSTALL_SITE}/${locale}/faq`}
                  className="nav-link"
                  rel="noopener noreferrer"
                >
                  {nav.faq ?? "FAQ"}
                </a>
                <a href={REPOS.usage} className="nav-link" rel="noopener noreferrer">
                  GitHub
                </a>
              </NavShell>
            </div>
          </header>
          <main id="main">{children}</main>
          <footer className="site-footer">
            <div className="inner">
              <div className="footer-grid">
                <div>
                  <h3>{SITE_NAME}</h3>
                  <p className="meta">
                    {nav.footerTagline ??
                      "The evidence side of the GPU Unlock project: accepted device IDs and same-card measurements."}
                  </p>
                </div>
                <div>
                  <h3>{nav.footerExplore ?? "Explore"}</h3>
                  <ul>
                    <li>
                      <Link href="/gpus">{nav.gpus ?? "Cards"}</Link>
                    </li>
                    <li>
                      <Link href="/benchmarks">{nav.benchmarks ?? "Benchmarks"}</Link>
                    </li>
                    <li>
                      <Link href="/windows">{nav.windows ?? "Windows port"}</Link>
                    </li>
                  </ul>
                </div>
                <div>
                  {/* Reciprocity matters here: the install site already links back to this
                      one from its header and footer, so a one-way link would leave this host
                      taking a referral it never returns. */}
                  <h3>{nav.footerSister ?? "Sister site"}</h3>
                  <ul>
                    <li>
                      <a href={`${INSTALL_SITE}/${locale}/install`} rel="noopener noreferrer">
                        {nav.sisterInstall ?? "Build and install guide"}
                      </a>
                    </li>
                    <li>
                      <a href={`${INSTALL_SITE}/${locale}/faq`} rel="noopener noreferrer">
                        {nav.sisterFaq ?? "FAQ"}
                      </a>
                    </li>
                    <li>
                      <a href={`${INSTALL_SITE}/${locale}`} rel="noopener noreferrer">
                        {nav.installHome ?? "gpu-unlock.com"}
                      </a>
                    </li>
                  </ul>
                </div>
                <div>
                  {/* The other sites on this host, all of which link back here. gpu-unlock.com
                      is omitted on purpose: the Sister site group above already links to it
                      three times, and repeating it would make the same host appear twice. */}
                  <h3>{nav.footerFriends ?? "Friends"}</h3>
                  <ul>
                    {FRIEND_SITES.filter((site) => site.origin !== INSTALL_SITE).map((site) => (
                      <li key={site.origin}>
                        <a
                          href={friendUrl(site, locale)}
                          rel="friend noopener noreferrer"
                          title={nav[`footerFriend_${site.slug}`] ?? site.description}
                        >
                          {site.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  {/* All three upstream projects are credited here: the merged Ampere/Ada
                      module, the Ada fork, and the Turing module. Omitting one would make the
                      page claim support it cannot attribute. */}
                  <h3>{nav.footerUpstream ?? "Upstream"}</h3>
                  <ul>
                    <li>
                      <a href={REPOS.ampere} rel="noopener noreferrer">
                        Zagitta/gpu-unlock
                      </a>
                    </li>
                    <li>
                      <a href={REPOS.ada} rel="noopener noreferrer">
                        JustAResearcher/gpu-unlock-ada
                      </a>
                    </li>
                    <li>
                      <a href={REPOS.turing} rel="noopener noreferrer">
                        nlzy/turing-unlock
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
              <p className="meta">
                {nav.footerLegal ??
                  "Source available under GPL-2.0-only. NVIDIA firmware remains under its own terms. Not affiliated with NVIDIA."}
              </p>
            </div>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
