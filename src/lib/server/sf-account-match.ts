import { sfId18 } from "./sf-id";

/**
 * PLAN.md decision 4, as one pure decision.
 *
 * The presale upsert matches on `salesforce_id` first and falls back to a
 * case-insensitive name match. That fallback stays — a Zapier payload without
 * an id still has to find its deal — but a NAME match must never overwrite a
 * Salesforce id the row already carries. Two accounts that happen to share a
 * name are not the same account, and the recorded id is the stronger evidence;
 * silently repointing it makes every downstream join wrong in a way nobody can
 * see. So a conflicting id is reported in the audit payload, never applied.
 *
 * Stamping an id onto a row that has none is a fill, not an overwrite, and is
 * allowed: it adds evidence rather than replacing it.
 */
export type SfIdWriteDecision = {
  /** The normalized value to store, or null to leave the column alone. */
  write: string | null;
  /** Set when an incoming id was refused because the row already has another. */
  conflict: { kept: string; rejected: string } | null;
};

export function resolveSalesforceIdWrite(args: {
  matchedBy: "salesforce_id" | "name" | null;
  incoming: string | null | undefined;
  existing: string | null | undefined;
}): SfIdWriteDecision {
  const incoming = sfId18(args.incoming ?? null);
  if (!incoming) return { write: null, conflict: null };

  if (
    args.matchedBy === "name" &&
    args.existing != null &&
    args.existing !== "" &&
    args.existing !== incoming
  ) {
    return { write: null, conflict: { kept: args.existing, rejected: incoming } };
  }

  return { write: incoming, conflict: null };
}
