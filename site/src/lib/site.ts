export const SITE = "https://gpuunlock.com";
export const SITE_NAME = "GPU Unlock";

/**
 * The companion install site. It owns the build, the boot order and the verification
 * steps; this site owns the accepted device IDs and the same-card measurements. Keeping
 * each half on one host is what stops the two pages from reading as the same article.
 */
export const INSTALL_SITE = "https://gpu-unlock.com";

export const REPOS = {
  ampere: "https://github.com/Zagitta/gpu-unlock",
  ada: "https://github.com/JustAResearcher/gpu-unlock-ada",
  // The merged public repository: both upstream forks plus the site's own usage notes.
  usage: "https://github.com/miounet11/gpuunlock",
  // RTX 20 series: a separate module, not a build of the merged one.
  turing: "https://github.com/nlzy/turing-unlock",
} as const;

export function absUrl(path: string): string {
  return `${SITE}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Locale-prefixed absolute URL. Every locale is served with a prefix, including English. */
export function localeUrl(locale: string, path = ""): string {
  return absUrl(`/${locale}${path}`);
}
