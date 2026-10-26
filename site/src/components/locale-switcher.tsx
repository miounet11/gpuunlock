"use client";

import { useParams } from "next/navigation";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, type Locale } from "@/i18n/routing";

const LABELS: Record<Locale, string> = {
  en: "EN",
  zh: "中文",
  ja: "日本語",
  de: "DE",
  fr: "FR",
  es: "ES",
  pt: "PT",
};

/**
 * Switches locale without leaving the current page. `usePathname` from the i18n navigation
 * helper strips the prefix, so re-replacing the same path with a new locale preserves the
 * route instead of bouncing the visitor back to the home page.
 */
export function LocaleSwitcher({ label }: { label: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const [pending, startTransition] = useTransition();
  const current = params.locale as Locale;

  return (
    <div className="lang-switch" role="group" aria-label={label}>
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          aria-current={locale === current ? "true" : undefined}
          disabled={pending}
          onClick={() =>
            startTransition(() => {
              router.replace(pathname, { locale });
            })
          }
        >
          {LABELS[locale]}
        </button>
      ))}
    </div>
  );
}
