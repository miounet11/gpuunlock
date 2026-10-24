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
      languages: Object.fromEntries(
        ["en", "zh", "ja", "de", "fr", "es", "pt"].map((l) => [
          l,
          `${SITE}/${l}${opts.path}`,
        ]),
      ),
    },
    openGraph: {
      type: "website",
      url,
      siteName: SITE_NAME,
      title: opts.title,
      description: opts.description,
      locale: opts.locale,
    },
    twitter: { card: "summary_large_image", title: opts.title, description: opts.description },
  };
}
