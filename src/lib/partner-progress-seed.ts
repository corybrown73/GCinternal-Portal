import type { PartnerProgress } from "./partner-journey";

/**
 * How long a partner progress read stays fresh on the page. The changes made
 * here invalidate it, so this only stops a page that has just loaded from
 * reading the same records again.
 */
export const PARTNER_PROGRESS_STALE_MS = 30_000;

/**
 * The selected partner project's progress, when the record already carries it
 * for this implementation. Otherwise undefined, and the query reads it.
 */
export function seededPartnerProgress(
  record: {
    partner_progress?: { implementation_id: string; progress: PartnerProgress } | null;
  },
  implementationId: string,
): PartnerProgress | undefined {
  const seed = record.partner_progress;
  return seed && seed.implementation_id === implementationId ? seed.progress : undefined;
}
