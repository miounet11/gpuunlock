export const SITE = "https://gpuunlock.com";
export const SITE_NAME = "GPU Unlock";

export const REPOS = {
  ampere: "https://github.com/Zagitta/gpu-unlock",
  ada: "https://github.com/JustAResearcher/gpu-unlock-ada",
  // The merged public repository: both upstream forks plus the site's own usage notes.
  usage: "https://github.com/miounet11/gpuunlock",
} as const;

export function absUrl(path: string): string {
  return `${SITE}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Locale-prefixed absolute URL. Every locale is served with a prefix, including English. */
export function localeUrl(locale: string, path = ""): string {
  return absUrl(`/${locale}${path}`);
}
