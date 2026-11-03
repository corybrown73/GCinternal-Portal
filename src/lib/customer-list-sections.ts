import { GRADUATED_STAGE } from "./claimed-owner";

/**
 * How the Customers list divides its rows between the main table and the graduated
 * section beneath it.
 *
 * Graduation is the deal's stage, GRADUATED_STAGE: the same state the Stage column
 * shows. It is not inferred from health or from dates.
 *
 * Which filters apply where:
 * - Scope and the test-account toggle are applied by the server, to the rows this
 *   module receives. Both sections, and their counts, follow them.
 * - The status (health) filter and the sort apply to both sections.
 * - The stage filter applies to both sections. A stage other than graduated leaves
 *   nothing for the graduated section, so the section is hidden. Selecting the
 *   graduated stage shows that section, expanded, and leaves the main table empty.
 */

/** A row the list can split: it needs the deal stage, and whether it is a test account. */
export type SplittableRow = { deal_stage: string | null; is_test?: boolean };

export function isGraduatedRow(row: { deal_stage: string | null }): boolean {
  return row.deal_stage === GRADUATED_STAGE;
}

/** Splits rows in one pass. Order within each part is the order given. */
export function partitionCustomerRows<T extends { deal_stage: string | null }>(
  rows: readonly T[],
): { active: T[]; graduated: T[] } {
  const active: T[] = [];
  const graduated: T[] = [];
  for (const row of rows) {
    if (isGraduatedRow(row)) graduated.push(row);
    else active.push(row);
  }
  return { active, graduated };
}

/**
 * Whether the graduated section is offered at all for a stage filter. Hidden when the
 * filter names a stage other than graduated, since no graduated row can match it.
 */
export function graduatedSectionOffered(stageFilter: string | undefined): boolean {
  return stageFilter === undefined || stageFilter === GRADUATED_STAGE;
}

/**
 * The number in "Graduated customers (X)": the graduated rows that remain after the
 * filters, leaving test accounts out, as the rest of the list does.
 */
export function graduatedCount(graduated: readonly SplittableRow[]): number {
  return graduated.filter((row) => !row.is_test).length;
}

/**
 * Whether the main (active) table is shown. Selecting the graduated stage hides it:
 * an empty active table above the graduated section would only be noise.
 */
export function showActiveTable(stageFilter: string | undefined): boolean {
  return stageFilter !== GRADUATED_STAGE;
}

/**
 * A reader's click on the graduated section, kept for the stage filter it was made under.
 * A click made under one stage filter does not carry over to another.
 */
export type GraduatedChoice = { forStage: string | undefined; open: boolean } | null;

/**
 * Whether the graduated section is expanded. Collapsed by default; expanded by default
 * when the graduated stage is selected. A click made under the same stage filter wins.
 */
export function graduatedSectionOpen(
  choice: GraduatedChoice,
  stageFilter: string | undefined,
): boolean {
  if (choice && choice.forStage === stageFilter) return choice.open;
  return stageFilter === GRADUATED_STAGE;
}

/**
 * The empty-state message for a section. `filtered` is true when a stage or status
 * filter is applied, so the message can tell the reader that clearing one may help.
 */
export function customerListEmptyMessage(
  section: "active" | "graduated",
  filtered: boolean,
): string {
  if (section === "graduated") {
    return filtered
      ? "No graduated customers match these filters. Try clearing a filter."
      : "No graduated customers in this view.";
  }
  return filtered
    ? "No active customers match these filters. Try clearing a filter."
    : "No active customers in this view.";
}
