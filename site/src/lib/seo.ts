import type { Metadata } from "next";
import { SITE, SITE_NAME } from "./site";

export function pageMeta(opts: {
  locale: string;
  path: string;
  title: string;
  description: string;
  keywords?: string[];
}): Metadata {
  const url = `${SITE}/${opts.locale}${opts.path}`;
  // The root layout appends "· GPU Unlock" to every title. A title that already names the
  // site would come out as "… — GPU Unlock support · GPU Unlock", which is what happened on
  // 111 pages before this check. `absolute` opts out of the template instead of asking every
  // locale's copy to avoid the brand name — copy changes then cannot reintroduce the echo.
  // Compared on a normalized copy: the copy calls the site "GPU UNLOCK" in the Windows
  // title and "GPU-Unlock" in German, and a plain substring check missed both, leaving 22
  // pages with the echo still in place.
  const norm = (s: string) => s.toLowerCase().replace(/[\s-]+/g, " ");
  const title = norm(opts.title).includes(norm(SITE_NAME))
    ? { absolute: opts.title }
    : opts.title;
  return {
    title,
    description: opts.description,
    keywords: opts.keywords,
    alternates: {
      canonical: url,
      languages: {
        ...Object.fromEntries(
          ["en", "zh", "ja", "de", "fr", "es", "pt"].map((l) => [
            l,
            `${SITE}/${l}${opts.path}`,
          ]),
        ),
        // Without x-default a search engine sees seven equally good candidates and picks
        // one for a visitor whose language matches none of them. English is the published
        // default everywhere else on this site (root redirect, og:locale fallbacks), so
        // naming it here keeps the two stories the same.
        "x-default": `${SITE}/en${opts.path}`,
      },
    },
    openGraph: {
      type: "website",
      url,
      siteName: SITE_NAME,
      title: opts.title,
      description: opts.description,
      locale: opts.locale,
      // The route lives at the app root, so the URL is absolute and shared by every page.
      // Without this the pages advertised summary_large_image with no image at all.
      images: [{ url: `${SITE}/opengraph-image`, width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
      images: [`${SITE}/opengraph-image`],
    },
  };
}
