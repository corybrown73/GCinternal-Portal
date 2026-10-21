/**
 * Who owns a deal, and what "unclaimed" and "carrying" mean — one place.
 *
 * THE DEFINITIONS (QA 7.5, 7.6, 8.1). Every surface that says "TIS: …",
 * "Unclaimed", "No implementation owner", "Unassigned" or "N active" reads
 * them from here:
 *
 * - CLAIMED OWNER: once the deal has a project (the newest non-superseded
 *   one), that project's `implementations.owner_id` is the answer, empty
 *   included: a person who clears the owner on the customer page means
 *   "nobody", and the ledger must not bring the old name back. Before the
 *   project exists, the newest row of the deal's claim ledger
 *   (`portal_assignments`) names the owner; else nobody. Every ledger write
 *   on a deal with a project (assignDeal) writes the project's owner too,
 *   and Start onboarding copies the ledger's owner onto the new project, so
 *   the two only part when a person changes the project's owner by hand.
 * - UNCLAIMED: in a stage where somebody should own it — Negotiate &
 *   Finalize (the TIS joins the closing call) through Make it run — and no
 *   claimed owner. Prospect is Sales's; Graduate is done.
 * - THE ACTIVE BOOK: what an owner carries — projects not superseded, not
 *   graduated, not test accounts (src/lib/test-accounts.ts). Workload
 *   ("N active" in the Assign picker, "Who carries what" on Reports) counts
 *   this book by claimed owner, so the two agree.
 *
 * Pure: the loaders gather the rows, this decides.
 */

import { isTestAccount } from "./test-accounts";

export type ClaimedOwner = {
  /** A team_members id. */
  id: string;
  /** Where the answer came from; the ledger only answers for a deal with no project. */
  source: "implementation" | "ledger";
};

/** The newest ledger row for the deal (team_member_id is NOT NULL in the table). */
export type LedgerAssignment = { deal_id?: string | null; team_member_id: string | null };

/**
 * `implementation` is the deal's live project, or null/omitted when it has
 * none. When it is given, its owner_id decides, null meaning nobody.
 */
export function resolveClaimedOwner(input: {
  deal?: { id: string } | null;
  implementation?: { owner_id: string | null } | null;
  assignment?: LedgerAssignment | null;
}): ClaimedOwner | null {
  if (input.implementation) {
    const implOwner = input.implementation.owner_id ?? null;
    return implOwner ? { id: String(implOwner), source: "implementation" } : null;
  }
  const a = input.assignment;
  // A row for another deal is not this deal's claim.
  if (a && input.deal && a.deal_id && a.deal_id !== input.deal.id) return null;
  if (a?.team_member_id) return { id: String(a.team_member_id), source: "ledger" };
  return null;
}

/** Newest ledger row per deal, from rows ordered newest first. */
export function latestAssignments<T extends LedgerAssignment>(
  rowsNewestFirst: ReadonlyArray<T> | null | undefined,
): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of rowsNewestFirst ?? []) {
    if (r.deal_id && !out.has(r.deal_id)) out.set(r.deal_id, r);
  }
  return out;
}

/** Newest non-superseded project per deal, from rows ordered newest first. */
export function latestImplementations<
  T extends { deal_id: string | null; superseded_by_implementation_id?: string | null },
>(rowsNewestFirst: ReadonlyArray<T> | null | undefined): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of rowsNewestFirst ?? []) {
    if (!r.deal_id || r.superseded_by_implementation_id) continue;
    if (!out.has(r.deal_id)) out.set(r.deal_id, r);
  }
  return out;
}

/** The claimed owner for every deal that has one. */
export function claimedOwnersByDeal(
  implementationsNewestFirst: ReadonlyArray<{
    deal_id: string | null;
    owner_id: string | null;
    superseded_by_implementation_id?: string | null;
  }> | null,
  ledgerNewestFirst: ReadonlyArray<LedgerAssignment> | null,
): Map<string, ClaimedOwner> {
  const impls = latestImplementations(implementationsNewestFirst);
  const ledger = latestAssignments(ledgerNewestFirst);
  const out = new Map<string, ClaimedOwner>();
  for (const dealId of new Set([...impls.keys(), ...ledger.keys()])) {
    const owner = resolveClaimedOwner({
      deal: { id: dealId },
      implementation: impls.get(dealId) ?? null,
      assignment: ledger.get(dealId) ?? null,
    });
    if (owner) out.set(dealId, owner);
  }
  return out;
}

/** Stages where a deal should have an owner: Negotiate & Finalize through Make it run. */
export const OWNED_STAGES: ReadonlyArray<string> = [
  "negotiate",
  "closed_won",
  "field_fusion_setup",
  "onboarding_kickoff",
  "kickoff",
  "get_it_working",
  "make_it_yours",
  "make_it_run",
  // The legacy middle stage some history still names.
  "in_onboarding",
];

/** The terminal stage: a graduated deal is owned by nobody's workload. */
export const GRADUATED_STAGE = "onboarding_complete";

/** Nobody owns it, in a stage where somebody should. */
export function isUnclaimed(stage: string | null | undefined, ownerId: string | null): boolean {
  return Boolean(stage && OWNED_STAGES.includes(stage)) && !ownerId;
}

/** In the active book: not superseded, not graduated, not a test account. */
export function inActiveBook(row: {
  stage: string | null | undefined;
  superseded?: boolean | null;
  closed?: boolean | null;
  is_test?: boolean | null;
}): boolean {
  return !row.superseded && !row.closed && row.stage !== GRADUATED_STAGE && !isTestAccount(row);
}

/** What each owner carries: active-book rows per claimed owner. */
export function workloadByOwner(
  rows: ReadonlyArray<{
    ownerId: string | null;
    stage: string | null | undefined;
    superseded?: boolean | null;
    closed?: boolean | null;
    is_test?: boolean | null;
  }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.ownerId || !inActiveBook(r)) continue;
    out.set(r.ownerId, (out.get(r.ownerId) ?? 0) + 1);
  }
  return out;
}
