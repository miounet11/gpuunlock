/**
 * The other sites on the same host, linked from this one's footer.
 *
 * This is a reciprocal arrangement, not a directory: each entry is a site that links back
 * here from its own footer, so adding one without adding the reverse link would leave the
 * pair one-sided.
 *
 * Two fields exist because the sites do not agree on how a locale appears in a URL, and
 * guessing "just append /<locale>" produced four 404s the first time:
 *
 *   * `localeMap` — that site uses a different code than ours. CleanYourTV spells Chinese
 *     `zh-CN` and Portuguese `pt-BR`.
 *   * `monolingual` — the site serves one language at every path, so adding a prefix at all
 *     is a 404. Android Ad Cleaner is Chinese-only and has no locale routes.
 *
 * Both were verified by fetching each origin's locale path before being written down; see
 * tests/friends.test.mjs, which pins the shape so a new entry has to decide explicitly.
 *
 * `slug` keys the localized description in messages/*.json. It is a separate field because
 * the visible name contains dots, and a dot inside an i18n key reads as a nesting separator.
 */
export interface FriendSite {
  /** Registrable name, used as the link text. */
  name: string;
  /** Key suffix for `nav.footerFriend_<slug>`; no dots. */
  slug: string;
  /** Public origin, canonical after redirects (www only where the site requires it). */
  origin: string;
  /** Entry path on that origin, without a locale prefix. Empty means the locale is the whole path. */
  path: string;
  /** That site's code for our locale, where it differs. Missing keys fall back to our own. */
  localeMap?: Readonly<Record<string, string>>;
  /** The origin serves one language at every path; do not prefix. */
  monolingual?: boolean;
  /**
   * That site ends locale paths with a slash (`/en/`, `/zh-CN/`) and 301s without it. Set this
   * so the link is the final URL; leaving it off costs a redirect on every click.
   */
  trailingSlash?: boolean;
  /** Fallback clause used when a locale has not translated the description yet. */
  description: string;
}

export const FRIEND_SITES: readonly FriendSite[] = [
  {
    name: "gpu-unlock.com",
    slug: "gpuunlockInstall",
    origin: "https://gpu-unlock.com",
    path: "",
    description: "Build, boot order and verification steps for the unlock",
  },
  {
    name: "stratat.com",
    slug: "stratat",
    origin: "https://www.stratat.com",
    path: "",
    description: "Inference economics on your own NVIDIA GPUs",
  },
  {
    name: "cleanyourtv.cc",
    slug: "cleanyourtv",
    origin: "https://www.cleanyourtv.cc",
    path: "",
    localeMap: { zh: "zh-CN", pt: "pt-BR" },
    trailingSlash: true,
    description: "A quiet Android TV launcher, without ads or recommendations",
  },
  {
    name: "jevcode.ai",
    slug: "jevcode",
    origin: "https://www.jevcode.ai",
    path: "",
    description: "Concepts, API and ecosystem notes for clavue-jev",
  },
  {
    name: "androidadcleaner.com",
    slug: "androidadcleaner",
    origin: "https://www.androidadcleaner.com",
    path: "",
    monolingual: true,
    description: "Turn off vendor bloat ads over adb, no root required",
  },
] as const;

/**
 * The URL a reader on `locale` should land on.
 *
 * The locale prefix is not universal: CleanYourTV spells Chinese `zh-CN`, and Android Ad
 * Cleaner serves one language at `/` for every locale. Both were checked against the live
 * hosts, which is why the fields above exist instead of a single `origin + /locale`.
 */
export function friendUrl(site: FriendSite, locale: string): string {
  if (site.monolingual) return `${site.origin}${site.path || "/"}`;
  const target = site.localeMap?.[locale] ?? locale;
  return `${site.origin}/${target}${site.path}${site.trailingSlash ? "/" : ""}`;
}
