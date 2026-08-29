/**
 * Which account (customers row) does a presale deal hand off to?
 *
 * Phase 1 of the multi-implementation work (docs/design/multi-implementation.md
 * §7 rules 1-2). Kept pure and free of any database access so the rule that
 * matters — "never match an account by name, never silently create a duplicate"
 * — is unit-testable on its own.
 *
 * Identity comes from Salesforce or from a human's explicit choice. There is
 * deliberately NO name comparison anywhere in this file: silently merging two
 * companies that happen to share a name is worse than one duplicate account.
 */

export interface HandoffChoice {
  /** An existing account the user picked in the UI. */
  customerId?: string | null;
  /** The user explicitly asked for a brand-new account. */
  createNew?: boolean;
}

export interface HandoffInput {
  /** `account_model`. When off, the legacy behavior below is reproduced exactly. */
  flagOn: boolean;
  /** `portal_accounts.customer_id` — the account this deal is already linked to. */
  linkedCustomerId: string | null;
  /**
   * The `customers.id` whose `salesforce_account_id` equals the deal's
   * `salesforce_id`. Null when the deal has no Salesforce id or nothing matched.
   */
  salesforceMatchCustomerId: string | null;
  choice: HandoffChoice;
}

export type HandoffDecision =
  /** Legacy (flag off) dead-end: the deal is linked, so do nothing. */
  | { action: "already_linked"; customerId: string }
  | {
      action: "use_existing";
      customerId: string;
      matchedBy: "deal_link" | "salesforce" | "chosen";
    }
  | { action: "create_new" }
  /** No identity and no instruction — the caller must ask a human. */
  | { action: "needs_choice"; reason: "no_salesforce_match" }
  /** The picked account contradicts an identity we already hold. */
  | {
      action: "conflict";
      reason: "deal_link_differs" | "salesforce_match_differs";
      customerId: string;
    };

export function resolveHandoffCustomer(input: HandoffInput): HandoffDecision {
  const picked = input.choice.customerId ?? null;

  // Flag off: byte-identical to the pre-Phase-1 behavior — the already-linked
  // dead-end, otherwise always a brand-new account. Any choice is ignored.
  if (!input.flagOn) {
    return input.linkedCustomerId
      ? { action: "already_linked", customerId: input.linkedCustomerId }
      : { action: "create_new" };
  }

  // An existing link is the strongest identity: a second handoff adds another
  // implementation under the same account rather than dead-ending.
  if (input.linkedCustomerId) {
    if (picked && picked !== input.linkedCustomerId) {
      return {
        action: "conflict",
        reason: "deal_link_differs",
        customerId: input.linkedCustomerId,
      };
    }
    return { action: "use_existing", customerId: input.linkedCustomerId, matchedBy: "deal_link" };
  }

  // Salesforce id is the only automatic match. Never name.
  if (input.salesforceMatchCustomerId) {
    if (picked && picked !== input.salesforceMatchCustomerId) {
      return {
        action: "conflict",
        reason: "salesforce_match_differs",
        customerId: input.salesforceMatchCustomerId,
      };
    }
    return {
      action: "use_existing",
      customerId: input.salesforceMatchCustomerId,
      matchedBy: "salesforce",
    };
  }

  if (picked) return { action: "use_existing", customerId: picked, matchedBy: "chosen" };
  if (input.choice.createNew === true) return { action: "create_new" };

  return { action: "needs_choice", reason: "no_salesforce_match" };
}

/** Message shown when a picked account contradicts a match we already hold. */
export function handoffConflictMessage(
  decision: Extract<HandoffDecision, { action: "conflict" }>,
): string {
  return decision.reason === "deal_link_differs"
    ? "This deal is already linked to a different account. Reload the deal and try again."
    : "This deal's Salesforce id already belongs to a different account. Reload the deal and try again.";
}
