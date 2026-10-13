import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { setDealTestFlag } from "@/lib/presale.functions";
import type { TestFlagState } from "@/lib/test-accounts";

/**
 * "Test account" (0085), on the deal's Details for managers and admins.
 * Shows the flag every count reads: the deal's own, or its customer's.
 * Marking writes the deal and the customer it became; clearing clears the
 * deal, and the customer only when no other deal of it is still marked.
 * The page itself always opens.
 */
export function TestAccountSwitch({ dealId, state }: { dealId: string; state: TestFlagState }) {
  const queryClient = useQueryClient();
  const save = useServerFn(setDealTestFlag);
  const flag = useMutation({
    mutationFn: (on: boolean) => save({ data: { dealId, isTest: on } }),
    // Returned, so the mutation stays pending until the fresh data is in and
    // the box never flips back to its old state for a moment.
    onSuccess: () =>
      Promise.all(
        // Every list that counts it: the deal, the board, Home and the
        // Customers list (both keyed under "home"), Home's deal inbox, the
        // Assign picker's counts, Reports.
        [
          ["deal", dealId],
          ["pipeline"],
          ["home"],
          ["deal-inbox"],
          ["assignment"],
          ["leadership"],
          ["pipeline-report"],
          ["ttv-report"],
        ].map((key) => queryClient.invalidateQueries({ queryKey: key })),
      ),
  });
  const kept = flag.isSuccess && !flag.variables ? flag.data.customerKeptBy : 0;
  return (
    <div className="inline-flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
      <label
        className="inline-flex cursor-pointer items-center gap-1.5"
        title="A test account is left out of Home, Reports, the Customers list, nudges and alerts"
      >
        <input
          type="checkbox"
          className="h-3.5 w-3.5"
          checked={flag.isPending ? Boolean(flag.variables) : state.isTest}
          disabled={flag.isPending}
          onChange={(e) => flag.mutate(e.target.checked)}
        />
        Test account
      </label>
      {!flag.isPending && state.carriedBy === "customer" ? (
        <span>· Test because its customer is marked test</span>
      ) : null}
      {!flag.isPending && kept > 0 ? (
        <span role="status">
          · The customer stays marked test because {kept} other deal{kept === 1 ? "" : "s"} of it{" "}
          {kept === 1 ? "is" : "are"}
        </span>
      ) : null}
      {flag.isError ? (
        <span role="alert" className="text-destructive">
          · not saved: {(flag.error as Error).message}
        </span>
      ) : null}
    </div>
  );
}

/** The read-only line for people who cannot change the flag. */
export function testAccountLabel(state: TestFlagState): string | null {
  if (state.carriedBy === "deal") return "Test account";
  if (state.carriedBy === "customer") return "Test account (its customer is marked test)";
  return null;
}
