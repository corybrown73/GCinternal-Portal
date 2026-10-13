/**
 * Test accounts (0085): QA rehearsals, Field Fusion dry runs and probes that
 * live in production beside real customers.
 *
 * THE RULE. A deal or a customer with `is_test` set is a test account, and so
 * is anything hanging off one (a deal whose customer is flagged, a project on
 * either). Test accounts are left out of every count by default — Home,
 * Reports, the Customers list, the Pipeline subtitle, nudges, stall alerts,
 * the weekly digest and the daily report — and come back on the lists that
 * offer "Show test accounts". The deal page itself always opens.
 *
 * Pure, so the loaders, the sweeps and the tests share one reading.
 */

export type MaybeTest = { is_test?: boolean | null } | null | undefined;

/** True when any of the rows (deal, customer…) is flagged. A missing column reads as real. */
export function isTestAccount(...rows: MaybeTest[]): boolean {
  return rows.some((r) => r?.is_test === true);
}

/** The rows a count may include: everything when asked for, else the real ones. */
export function excludeTests<T>(
  rows: ReadonlyArray<T>,
  isTest: (row: T) => boolean,
  includeTests = false,
): T[] {
  return includeTests ? [...rows] : rows.filter((r) => !isTest(r));
}

/** The URL search param behind the "Show test accounts" switch. */
export const SHOW_TESTS_PARAM = "tests";

/** `?tests=1` (or true) shows them; anything else, or nothing, hides them. */
export function readShowTests(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === "1" || raw === "true";
}

/** Why a deal reads as a test account, for its "Test account" switch. */
export type TestFlagState = {
  /** The effective flag: the deal or its customer is marked. */
  isTest: boolean;
  /** Which record carries it: the deal's own flag wins the label. */
  carriedBy: "deal" | "customer" | null;
  /** Other deals of the same customer still marked test. */
  otherFlaggedDeals: number;
};

export function testFlagState(input: {
  deal: MaybeTest;
  customer: MaybeTest;
  otherFlaggedDeals?: number;
}): TestFlagState {
  const carriedBy = isTestAccount(input.deal)
    ? "deal"
    : isTestAccount(input.customer)
      ? "customer"
      : null;
  return {
    isTest: carriedBy !== null,
    carriedBy,
    otherFlaggedDeals: Math.max(0, input.otherFlaggedDeals ?? 0),
  };
}

/**
 * Clearing a deal clears its customer only when no other deal of that
 * customer is still marked: the customer is flagged on their account too.
 */
export function clearsCustomer(otherFlaggedDeals: number): boolean {
  return otherFlaggedDeals <= 0;
}
