import type { Customer360, ImplementationSummary } from "@/lib/hub-types";
import { dealStageLabel } from "@/lib/deal-stage";
import { journeyPosition } from "@/lib/current-implementation-focus";
import { PARTNERS, isPartnerJourney, type PartnerKey } from "@/lib/partner-implementation";
import type { PartnerProgress } from "@/lib/partner-journey";

/**
 * The Customer 360 header's rules, as pure functions so they are tested without
 * a page. Each value is read from the record or from the partner progress that
 * Current Implementation already reads. Nothing here calculates a stage, a
 * completion or a link destination.
 */

type Impl = NonNullable<Customer360["implementation"]>;

/** Projects newest first, the order the header has always used. */
export function projectsNewestFirst(
  list: ReadonlyArray<ImplementationSummary>,
): ImplementationSummary[] {
  return [...list].sort((a, b) =>
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  );
}

/**
 * A project's name for the header. An add-on that has no name of its own, or
 * whose name is the customer's, reads as "Original project", as before.
 */
export function projectLabel(name: string | null | undefined, customerName: string): string {
  return name && name !== customerName ? name : "Original project";
}

export type HeaderStage =
  | { state: "ready"; label: string; position: { index: number; total: number } | null }
  | { state: "loading"; label: string; position: null }
  | { state: "unavailable"; label: string; position: null };

/**
 * The one stage indicator. A standard implementation shows its deal stage. A
 * partner implementation shows its own journey stage from partner progress.
 * While that progress is loading, or when it cannot be read, the header says so.
 * It never falls back to the standard deal stage.
 */
export function headerStage(
  impl: Pick<Impl, "deal_stage" | "partner_key" | "journey_type">,
  partner: { progress: PartnerProgress | null; loading: boolean; failed: boolean },
): HeaderStage {
  if (!isPartnerJourney(impl)) {
    return { state: "ready", label: dealStageLabel(impl.deal_stage), position: null };
  }
  if (partner.failed) return { state: "unavailable", label: "Stage unavailable", position: null };
  if (partner.loading || !partner.progress)
    return { state: "loading", label: "Loading stage…", position: null };
  const { progress } = partner;
  const position = progress.current
    ? journeyPosition(
        progress.stages.map((s) => s.key),
        progress.current,
      )
    : null;
  return {
    state: "ready",
    label: progress.currentLabel ?? "Not started",
    position: position ? { index: position.index, total: progress.stages.length } : null,
  };
}

/**
 * The Kickoff deck link opens the Kickoff deck page for a deal, as it always
 * has. That page is built from the deal, so it exists for every standard
 * implementation that has a deal. It is not a stored file. A partner journey
 * has no partner-specific destination, so it gets no link.
 */
export function showKickoffDeckLink(
  impl: Pick<Impl, "deal_id" | "journey_type" | "partner_key">,
): boolean {
  return Boolean(impl.deal_id) && !isPartnerJourney(impl);
}

/** Recorded completion, set by a person through Finish. Nothing else implies it. */
export function completedLabel(impl: Pick<Impl, "complete_outcome">): string | null {
  return impl.complete_outcome ? "Completed" : null;
}

/** "Partner · Field Fusion IQ" for a partner implementation, or null for a standard one. */
export function partnerChipLabel(impl: Pick<Impl, "journey_type" | "partner_key">): string | null {
  if (!isPartnerJourney(impl)) return null;
  const name = impl.partner_key
    ? (PARTNERS as Readonly<Record<string, { name: string }>>)[impl.partner_key as PartnerKey]?.name
    : undefined;
  return name ? `Partner · ${name}` : "Partner";
}
