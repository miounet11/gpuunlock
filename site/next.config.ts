import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // One canonical host. The apex is what people type and what the GitHub README links, so it wins;
  // www redirects to it rather than the other way round.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.gpuunlock.com" }],
        destination: "https://gpuunlock.com/:path*",
        permanent: true,
      },
      // The build-and-install walkthrough belongs to gpu-unlock.com. Keeping a second copy
      // here made the two hosts serve the same article under two names.
      {
        source: "/:locale/install",
        destination: "https://gpu-unlock.com/:locale/install",
        statusCode: 301,
      },
      {
        source: "/:locale/faq",
        destination: "https://gpu-unlock.com/:locale/faq",
        statusCode: 301,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
