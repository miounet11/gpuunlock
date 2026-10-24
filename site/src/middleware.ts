import { NextRequest, type NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { publicOrigin } from "./lib/request-origin";

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest): NextResponse {
  // Next builds the request origin from the address the server was started on, so behind a
  // reverse proxy the locale redirect for "/" answers with
  // `location: https://localhost:3300/en`, which sends visitors off-site. Rebuild the origin
  // from the forwarded headers before handing the request to next-intl, which composes the
  // redirect URL from request.url.
  //
  // Only safe methods are rebuilt: a request whose body has already been read cannot be
  // cloned, and no route under this matcher accepts a body.
  if (request.method === "GET" || request.method === "HEAD") {
    const url = new URL(request.url);
    const origin = publicOrigin(request.headers, url);

    if (origin) {
      const rebuilt = new URL(url.toString());
      rebuilt.protocol = `${origin.protocol}:`;
      rebuilt.host = origin.host;
      // Setting .host keeps the port of the original URL, which is the port the Node
      // server listens on. The public URL carries the default port, so drop it.
      rebuilt.port = "";

      if (rebuilt.toString() !== url.toString()) {
        return intlMiddleware(new NextRequest(rebuilt, request));
      }
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/", "/(en|zh|ja|de|fr|es|pt)/:path*"],
};
