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

  if (!warned && process.env["NODE_ENV"] === "production") {
    warned = true;
    console.error(
      "APP_URL_UNSET every emailed and shared link will point at " +
        `${DEV_FALLBACK}, which works only on the machine that generated it.`,
    );
  }
  return DEV_FALLBACK;
}

/** Test seam: the once-per-process warning is state. */
export function resetAppUrlWarning(): void {
  warned = false;
}
