import type { MetadataRoute } from "next";
import { DEVICES } from "@/data/devices";
import { SITE } from "@/lib/site";

const LOCALES = ["en", "zh", "ja", "de", "fr", "es", "pt"] as const;

const PATHS = [
  "",
  "/gpus",
  "/benchmarks",
  "/install",
  "/faq",
  ...DEVICES.map((d) => `/gpus/${d.slug}`),
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return LOCALES.flatMap((locale) =>
    PATHS.map((path) => ({
      url: `${SITE}/${locale}${path}`,
      lastModified,
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : path.startsWith("/gpus/") ? 0.6 : 0.8,
      alternates: {
        languages: Object.fromEntries(
          LOCALES.map((l) => [l, `${SITE}/${l}${path}`]),
        ),
      },
    })),
  );
}
