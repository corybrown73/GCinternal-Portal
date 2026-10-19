/**
 * The customer-facing link pages: the dashboard (/welcome), the shared plan
 * (/plan, /view) and the tracked help links (/go). Their URLs carry a secret
 * token, so they are never indexed, never cached by a shared cache, and never
 * leak through a Referer header. Sent as real response headers by the request
 * middleware in src/start.ts, so they hold even though routes render in the
 * browser (defaultSsr: false) and the page's own meta tags only appear after
 * its script runs.
 */
export const PUBLIC_LINK_HEADERS: Readonly<Record<string, string>> = {
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store, private",
};

const PUBLIC_LINK_PREFIXES = ["/welcome/", "/plan/", "/view/", "/go/"];

/** True for a path under one of the token-bearing link pages. */
export function isPublicLinkPath(pathname: string): boolean {
  return PUBLIC_LINK_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * The response with the link headers set. A response whose headers are
 * immutable (a redirect, a fetched response) is copied first.
 */
export function withPublicLinkHeaders(response: Response): Response {
  try {
    for (const [k, v] of Object.entries(PUBLIC_LINK_HEADERS)) response.headers.set(k, v);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(PUBLIC_LINK_HEADERS)) headers.set(k, v);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
