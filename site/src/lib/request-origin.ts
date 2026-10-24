/**
 * Rebuilds the public origin of a proxied request.
 *
 * Next.js derives the request origin from the address the standalone server was started on
 * (here 127.0.0.1:3300), not from the Host header, so a redirect composed from request.url
 * points at the internal address. The proxy's forwarded headers carry the public host, so
 * rebuild the origin from them before the URL is used to build a redirect.
 */
export type PublicOrigin = {
  /** The public host, without a port. */
  host: string;
  /** "http" or "https". */
  protocol: string;
};

/**
 * Reads the public origin from the forwarded headers, falling back to the Host header and
 * then to the request URL itself. The port is always dropped: the public URL uses the
 * default port for its protocol, while the internal URL carries the server's port.
 */
export function publicOrigin(
  headers: { get(name: string): string | null },
  url: URL,
): PublicOrigin | null {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return null;

  // A forwarded host may carry a port. Keep only the host part.
  const bare = host.split(",")[0].trim();
  const hostOnly = bare.startsWith("[")
    ? bare.slice(0, bare.indexOf("]") + 1)
    : bare.split(":")[0];

  const protocol = headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? url.protocol.replace(":", "");

  return { host: hostOnly, protocol };
}
