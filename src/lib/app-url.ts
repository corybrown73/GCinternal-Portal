import { getRequest } from "@tanstack/react-start/server";

/**
 * The public base URL, in one place.
 *
 * WHY THIS EXISTS. Nine modules each carried their own private copy of
 *
 *     process.env["APP_URL"] ?? "http://localhost:3000"
 *
 * and every one of them builds a link that leaves the building: a customer's
 * plan link, an internal invite, a TAM approve/decline button, a ticket
 * notification. Nine copies of a fallback is nine chances to ship
 * "http://localhost:3000/plan/…" to a customer, and the failure is silent —
 * the email sends, the link renders, nothing throws, and the recipient gets a
 * URL that only works on the machine that generated it.
 *
 * It also matters right now for a second reason: pointing the app at its own
 * domain is a ONE-VALUE change, and a one-value change should have one place
 * to make it.
 */

const DEV_FALLBACK = "http://localhost:3000";

let warned = false;

/**
 * The origin every emailed and shared link is built from. No trailing slash.
 *
 * Warns once per process when it is unset outside development, because a
 * production deploy sending localhost links is the exact failure this module
 * exists to make visible — and it is invisible in every other way.
 */
export function appUrl(): string {
  const configured = process.env["APP_URL"];
  if (configured) return configured.replace(/\/+$/, "");

  // Inside a request, the host the person is using is the right origin: a
  // link minted on gcinternalportal.com should not point at the deployment's
  // vercel.app alias because the variable was never set.
  const fromRequest = requestOrigin();
  // A request that reached the deployment's own vercel.app alias still mints
  // links on the production domain: Vercel names that domain itself.
  const production = process.env["VERCEL_PROJECT_PRODUCTION_URL"];
  if (fromRequest && /\.vercel\.app$/i.test(new URL(fromRequest).hostname) && production) {
    return `https://${production.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }
  if (fromRequest) return fromRequest;

  if (!warned && process.env["NODE_ENV"] === "production") {
    warned = true;
    console.error(
      "APP_URL_UNSET every emailed and shared link will point at " +
        `${DEV_FALLBACK}, which works only on the machine that generated it.`,
    );
  }
  return DEV_FALLBACK;
}

function requestOrigin(): string | null {
  try {
    // Guarded: this module is also imported where no request exists (a cron
    // route, a test), and getRequest throws outside one.
    const req = getRequest() as Request | undefined;
    const h = req?.headers;
    if (!h) return null;
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return null;
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host.split(",")[0]!.trim()}`;
  } catch {
    return null;
  }
}

/** Test seam: the once-per-process warning is state. */
export function resetAppUrlWarning(): void {
  warned = false;
}
