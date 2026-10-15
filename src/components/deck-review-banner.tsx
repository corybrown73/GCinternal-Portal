import { AlertTriangle } from "lucide-react";

import { deckReviewWarning } from "@/lib/deck-review";
import type { WelcomeView } from "@/lib/welcome";

/**
 * The internal deck's "check before sharing" line. Never printed, never in
 * the PowerPoint (the export renders the screens only) and never on the
 * customer's link (their view has no review state).
 */
export function DeckReviewBanner({ view }: { view: WelcomeView }) {
  const warning = deckReviewWarning(view);
  if (!warning) return null;
  return (
    <div
      role="status"
      data-testid="deck-review-banner"
      className="print:hidden border-b border-amber-300 bg-amber-50 px-4 py-2 text-[12px] text-amber-900"
    >
      <p className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {warning.headline}
      </p>
      {warning.items.length ? (
        <p className="mt-0.5 text-amber-800">{warning.items.join(" · ")}</p>
      ) : null}
    </div>
  );
}
