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
  return {
    title: opts.title,
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
