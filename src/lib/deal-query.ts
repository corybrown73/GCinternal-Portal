import { queryOptions } from "@tanstack/react-query";

import { getDeal } from "./presale.functions";

/** The deal record, as the deal route and the customer's Pre-kickoff tab both load it. */
export const dealQuery = (dealId: string) =>
  queryOptions({
    queryKey: ["deal", dealId],
    queryFn: () => getDeal({ data: { dealId } }),
  });

export type DealData = NonNullable<Awaited<ReturnType<typeof getDeal>>>;
