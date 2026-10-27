import { sameName } from "./complete-solutions-sow";

/**
 * Purchased scope, checked against the deal's purchase record.
 *
 * The purchase record (the services on the deal intake) is what the customer
 * bought as recorded by the sale. The signed SOW is the reference for the scope
 * that was agreed. A solution either delivers an item from the purchase record,
 * or it does not; this module says which, and never changes either side.
 *
 *   - a purchased solution links to a record by id once one is set, or by name
 *     when the names match;
 *   - a purchased solution that matches no record is flagged;
 *   - a purchase record that no active solution delivers is flagged;
 *   - a requested solution is not part of purchased scope and is not checked.
 *
 * Nothing here writes. A link is recorded by the database function that saves a
 * reviewed set, and only when the person confirms it.
 */

export type PurchaseRecord = { id: string; name: string; kind: string };

export type PurchaseSolution = {
  id: string;
  title: string;
  scope: "purchased" | "requested";
  purchasedServiceId: string | null;
  archived: boolean;
};

export type PurchaseCheck = {
  /** False when the implementation has no deal, so there is no purchase record to check against. */
  hasRecord: boolean;
  /** Active purchased solutions that match no purchase record item. */
  solutionsWithoutRecord: Array<{ solutionId: string; title: string }>;
  /** Purchase record items that no active solution delivers. */
  recordsWithoutSolution: PurchaseRecord[];
};

/** The purchase record item a solution title names, when exactly one does. */
export function purchaseFor(
  title: string,
  records: ReadonlyArray<PurchaseRecord>,
): PurchaseRecord | null {
  const matches = records.filter((r) => sameName(r.name, title));
  return matches.length === 1 ? matches[0]! : null;
}

export function reconcilePurchased(input: {
  hasRecord: boolean;
  solutions: ReadonlyArray<PurchaseSolution>;
  records: ReadonlyArray<PurchaseRecord>;
}): PurchaseCheck {
  if (!input.hasRecord) {
    return { hasRecord: false, solutionsWithoutRecord: [], recordsWithoutSolution: [] };
  }
  const active = input.solutions.filter((s) => !s.archived);
  const purchased = active.filter((s) => s.scope === "purchased");
  const recordIds = new Set(input.records.map((r) => r.id));

  const linkedIds = new Set(
    active.map((s) => s.purchasedServiceId).filter((id): id is string => id !== null),
  );

  const solutionsWithoutRecord = purchased
    .filter((s) => {
      if (s.purchasedServiceId && recordIds.has(s.purchasedServiceId)) return false;
      return purchaseFor(s.title, input.records) === null;
    })
    .map((s) => ({ solutionId: s.id, title: s.title }));

  const recordsWithoutSolution = input.records.filter((r) => {
    if (linkedIds.has(r.id)) return false;
    return !active.some((s) => sameName(s.title, r.name));
  });

  return { hasRecord: true, solutionsWithoutRecord, recordsWithoutSolution };
}
