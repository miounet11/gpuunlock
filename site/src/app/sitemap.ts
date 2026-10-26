import { execFileSync } from "node:child_process";
import type { MetadataRoute } from "next";
import { DEVICES } from "@/data/devices";
import { BENCH_RUNS } from "@/data/benchmarks";
import { measuredGroups } from "@/data/modes";
import { SITE } from "@/lib/site";

/**
 * `lastModified: new Date()` stamps every URL with the build time, so each deploy told
 * crawlers that all 133 pages had changed at once and the field stopped carrying any
 * signal. Ask git for the last commit that touched the files a page is built from, and
 * fall back to a fixed date when the build runs without history (shallow clone, tarball).
 */
const FALLBACK = new Date("2026-10-25T00:00:00Z");

function lastCommitFor(paths: string[]): Date {
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", ...paths],
      { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return out ? new Date(out) : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

// Which files actually feed each route. A page whose data changes should move its own
// lastmod, not drag the whole sitemap forward.
const DATA = ["src/data/devices.ts", "src/data/benchmarks.ts"];
const MESSAGES = ["messages/en.json"];
const pageSources: Record<string, string[]> = {
  "": [...DATA, ...MESSAGES, "src/app/[locale]/page.tsx"],
  "/gpus": [...DATA, ...MESSAGES, "src/app/[locale]/gpus/page.tsx"],
  "/benchmarks": [...DATA, ...MESSAGES, "src/app/[locale]/benchmarks/page.tsx"],
  "/windows": ["src/data/windows-port.ts", ...MESSAGES, "src/app/[locale]/windows/page.tsx"],
};
const cardSource = [...DATA, ...MESSAGES, "src/app/[locale]/gpus/[slug]/page.tsx"];
// Mode pages are built from the mode registry plus the same measured rows.
const modeSource = [
  "src/data/modes.ts",
  ...DATA,
  ...MESSAGES,
  "src/app/[locale]/benchmarks/[mode]/page.tsx",
];

const LOCALES = ["en", "zh", "ja", "de", "fr", "es", "pt"] as const;

// The card list and the same-card measurements live on this site; the build-and-install
// walkthrough lives on gpu-unlock.com. Each host keeps its own half of the project, so the
// two sitemaps do not overlap.
const PATHS = [
  "",
  "/gpus",
  "/benchmarks",
  "/windows",
  ...DEVICES.map((d) => `/gpus/${d.slug}`),
  // Only modes that carry a measurement: a mode page exists solely where rows do, so
  // listing a group without rows would advertise a URL the build never emits.
  ...measuredGroups(BENCH_RUNS.flatMap((r) => r.rows)).map((id) => `/benchmarks/${id}`),
];

export default function sitemap(): MetadataRoute.Sitemap {
  // One git call per distinct source set, not per URL: 133 URLs collapse to 5 lookups.
  const stamp = new Map<string, Date>();
  const modifiedFor = (path: string): Date => {
    const sources = pageSources[path] ?? (path.startsWith("/benchmarks/") ? modeSource : cardSource);
    const key = sources.join("|");
    if (!stamp.has(key)) stamp.set(key, lastCommitFor(sources));
    return stamp.get(key)!;
  };

  return LOCALES.flatMap((locale) =>
    PATHS.map((path) => ({
      url: `${SITE}/${locale}${path}`,
      lastModified: modifiedFor(path),
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority:
        path === ""
          ? 1
          : path.startsWith("/gpus/") || path.startsWith("/benchmarks/")
            ? 0.6
            : 0.8,
      alternates: {
        languages: Object.fromEntries(
          LOCALES.map((l) => [l, `${SITE}/${l}${path}`]),
        ),
      },
    })),
  );
}
