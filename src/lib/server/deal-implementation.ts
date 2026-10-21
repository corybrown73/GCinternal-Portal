/**
 * The project a deal's own reads should follow: the deal's live one.
 *
 * WHY NOT "THE CUSTOMER'S NEWEST". An existing customer has one project per
 * deal. Picking the newest by customer_id hands deal A's context, deck and
 * attachments the plan of deal B the day B is created. The deal's own row
 * (deal_id), not superseded, newest first, is the right one. When the deal
 * has none, the customer's newest live row stands in only if it is a legacy
 * project with no deal link: another deal's project is never this one's.
 *
 * The client is passed in so the same lookup serves the service-role reads
 * here and the brief's own client.
 */
export async function liveImplementationForDeal<T = Record<string, unknown>>(
  client: unknown,
  args: { dealId: string; customerId: string | null | undefined; select: string },
): Promise<T | null> {
  const db = client as any;
  const { data: byDeal } = await db
    .from("implementations")
    .select(args.select)
    .eq("deal_id", args.dealId)
    .is("superseded_by_implementation_id", null)
    .is("closed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byDeal) return byDeal as T;
  if (!args.customerId) return null;
  const { data: byCustomer } = await db
    .from("implementations")
    .select(args.select)
    .eq("customer_id", args.customerId)
    .is("deal_id", null)
    .is("superseded_by_implementation_id", null)
    .is("closed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (byCustomer as T | null) ?? null;
}
