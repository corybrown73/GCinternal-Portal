import type { QueryClient } from "@tanstack/react-query";

/**
 * The cached views that show whether a deal's paperwork is in: the deal
 * page, its pulse (the guide's next step), the customer's page, Home, the
 * welcome page and the board. After a SOW or a contract lands, or a no-SOW
 * reason is written, every one of them is refetched, so no open card keeps
 * asking for paper that is already on file.
 *
 * Prefix keys: ["customer360"] covers every customer page, ["home"] every
 * scope. Without a deal id (the customer page does not always know it),
 * every deal's queries are refreshed.
 */
export function paperworkQueryKeys(dealId: string | null | undefined): ReadonlyArray<unknown[]> {
  const perDeal = dealId
    ? [
        ["deal", dealId],
        ["deal-pulse", dealId],
        ["welcome", dealId],
      ]
    : [["deal"], ["deal-pulse"], ["welcome"]];
  return [...perDeal, ["customer360"], ["home"], ["pipeline"]];
}

export async function invalidatePaperwork(
  qc: Pick<QueryClient, "invalidateQueries">,
  dealId: string | null | undefined,
): Promise<void> {
  await Promise.all(
    paperworkQueryKeys(dealId).map((queryKey) => qc.invalidateQueries({ queryKey })),
  );
}
