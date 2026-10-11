import { missingForClosedWon, type WonGateMissing } from "./won-gate";
import type { AccountStage } from "./presale-stages";

/**
 * Entering a deal by hand: which stages it may start in, and what the
 * Closed Won notice still holds once the record changes. Pure, so the
 * modal, the deal page and the server read the same rules.
 */

/**
 * The stages "New account" offers. A hand-entered deal is selling, closing
 * or closed; every stage after the close is reached by the checklist, never
 * typed in.
 */
export const NEW_DEAL_STAGES = ["prospect", "negotiate", "closed_won"] as const satisfies Readonly<
  AccountStage[]
>;
export type NewDealStage = (typeof NEW_DEAL_STAGES)[number];

export function isNewDealStage(stage: string | null | undefined): stage is NewDealStage {
  return (NEW_DEAL_STAGES as readonly string[]).includes(stage ?? "");
}

/** A TIS is brought in from Negotiate & Finalize on; a bare Prospect has nobody to bring in yet. */
export function canAssignAtEntry(stage: NewDealStage): boolean {
  return stage !== "prospect";
}

/**
 * The pieces a refused Closed Won move named that the record still lacks.
 * A notice set when the move was refused goes stale the moment the SOW or
 * the notes land; reading it through the record keeps it true.
 */
export function liveWonGateMissing(
  missing: readonly WonGateMissing[] | null,
  facts: {
    reports: number;
    sowPath: string | null | undefined;
    sowReference: string | null | undefined;
  },
): WonGateMissing[] {
  if (!missing) return [];
  const now = new Set(missingForClosedWon(facts));
  return missing.filter((m) => m === "checklist" || now.has(m));
}

/**
 * The customer a closing deal joins. An "existing account" deal names it on
 * the deal page; any other type, or a deal already linked, joins nobody by
 * this route.
 */
export function existingCustomerAtClose(
  intake: { path: string | null; existing_customer_id?: string | null },
  linkedCustomerId: string | null,
): string | null {
  if (linkedCustomerId) return null;
  if (intake.path !== "existing") return null;
  return intake.existing_customer_id ?? null;
}

/**
 * settleNewDeal's refusal for a deal that has already left Prospect. The
 * dialog reads it on a retry: the first try moved the deal, so the job is
 * done and the deal page is where to go.
 */
export const ALREADY_STAGED = "This deal already has its stage. Move it from the deal page.";

/**
 * The refusal handed from the New account dialog to the deal page, as a
 * search param (`?gate=notes,sow`), so the page opens on what is missing
 * instead of a bare "Not closed yet".
 */
export function gateParam(missing: readonly WonGateMissing[]): string {
  return missing.join(",");
}

/** The missing pieces a `?gate=` param names; null for none or nonsense. */
export function parseGateParam(raw: unknown): WonGateMissing[] | null {
  if (typeof raw !== "string") return null;
  const keys = raw
    .split(",")
    .map((k) => k.trim())
    .filter((k): k is "notes" | "sow" => k === "notes" || k === "sow");
  return keys.length ? [...new Set(keys)] : null;
}

/** The hold note in Stage history: what was missing, in words, without the gate's machine tag. */
export function heldNote(
  enteredAs: string,
  heldAt: string,
  missing: readonly WonGateMissing[],
  labels: Record<WonGateMissing, string>,
): string {
  const named = missing.map((m) => labels[m]).filter(Boolean);
  return `Entered as ${enteredAs}; held at ${heldAt}${named.length ? ` — no ${named.join(" and no ")} yet` : ""}`;
}
