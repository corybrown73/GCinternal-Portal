import type { WelcomeView } from "./welcome";

/**
 * Whether the internal deck warns before it is shared, and what it says.
 *
 * WARN, NEVER BLOCK. An unreviewed deck still presents, prints and exports;
 * the banner and the confirm on "Copy customer link" only make sure nobody
 * sends the customer an AI reading nobody checked. Internal only: the
 * customer's view carries no `reviewed` (null), so this is always null there.
 */
export function deckReviewWarning(
  view: Pick<WelcomeView, "readiness" | "reviewed" | "aiReading">,
): { headline: string; items: string[] } | null {
  if (view.reviewed === null || view.reviewed === undefined) return null;
  const items = view.readiness.map((r) => r.label);
  if (view.reviewed && !items.length) return null;
  const reading = view.aiReading ? `AI reading ${view.aiReading}` : "no AI reading yet";
  return {
    headline: view.reviewed
      ? "Reviewed, but still blank. Check before sharing."
      : `Not reviewed: ${reading}. Check before sharing.`,
    items,
  };
}

/** True when "Copy customer link" asks first: the deck has not been reviewed. */
export function shareNeedsConfirm(view: Pick<WelcomeView, "reviewed">): boolean {
  return view.reviewed === false;
}

/** The question "Copy customer link" asks on an unreviewed deck. */
export const SHARE_CONFIRM = {
  title: "Share a deck nobody has reviewed?",
  body: "This deck has not been reviewed yet (Closed Won → Review). The customer will see what the AI reading wrote.",
  confirmLabel: "Share anyway",
} as const;
