// The front end is a client-rendered SPA, so link-preview crawlers (which don't run JS) only see
// the static shell. Its shared tags live in web/nuxt.config.ts; the per-URL ones are added here.

/** The canonical URL of a page: the app's own origin and the path, without query or hash. */
export function canonicalUrl(appUrl: string, pathname: string): string {
  return new URL(pathname, appUrl).href;
}

/** Adds og:url and a canonical link for this page to an HTML response from the static assets. */
export function withPageMeta(response: Response, appUrl: string, pathname: string): Response {
  if (!response.headers.get("Content-Type")?.startsWith("text/html")) return response;
  const href = escapeAttr(canonicalUrl(appUrl, pathname));
  return new HTMLRewriter()
    .on("head", {
      element(head) {
        head.append(`<link rel="canonical" href="${href}"><meta property="og:url" content="${href}">`, { html: true });
      },
    })
    .transform(response);
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
