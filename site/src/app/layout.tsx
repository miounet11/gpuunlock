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
    "Which NVIDIA cards the GPU Unlock kernel module supports, what the same-card benchmarks actually measured, and how to install it on Ampere and Ada.",
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
