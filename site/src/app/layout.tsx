import type { Metadata } from "next";
import { SITE, SITE_NAME } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: `${SITE_NAME} — NVIDIA SM speed-select override documentation`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Which NVIDIA cards the GPU Unlock kernel module supports, what the same-card benchmarks actually measured, and how to install it on Ampere, Ada and Turing.",
  // No `robots` here on purpose. Next already emits `noindex` for the 404 boundary, and an
  // explicit `index, follow` on this layout landed next to it — every 404 carried both
  // tags, contradicting itself. Absence of the tag means indexable, which is what every
  // real page wants, so the declaration was doing nothing except fighting the 404.
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
