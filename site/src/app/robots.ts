import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    // No `host`. It was emitted as `Host: https://gpuunlock.com` — the directive takes a
    // bare hostname, not a URL, so even the one crawler that once read it would have
    // rejected the value. Yandex retired `Host` in favour of the search console, and no
    // other crawler consumes it, so the line could only ever be wrong.
  };
}
