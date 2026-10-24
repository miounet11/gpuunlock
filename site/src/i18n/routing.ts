import { defineRouting } from "next-intl/routing";

export const locales = ["en", "zh", "ja", "de", "fr", "es", "pt"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales: [...locales],
  defaultLocale: "en",
  localePrefix: "always",
});
