import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { audit } from "./server/audit";
import { clearsCustomer, testFlagState, type TestFlagState } from "./test-accounts";

const db = () => supabaseAdmin as any;

/**
 * How many other deals of this customer are marked test. Zero before 0085
 * is applied (the column is missing and the read errors).
 */
export async function otherFlaggedDeals(customerId: string, dealId: string): Promise<number> {
  const { data, error } = await db()
    .from("portal_accounts")
    .select("id")
    .eq("customer_id", customerId)
    .eq("is_test", true)
    .neq("id", dealId);
  if (error) return 0;
  return (data ?? []).length;
}

/** The deal page's reading of the flag: effective, which record, siblings. */
export async function loadTestFlagState(deal: {
  id: string;
  customer_id?: string | null;
  is_test?: boolean | null;
}): Promise<TestFlagState> {
  const customerId = deal.customer_id ?? null;
  if (!customerId) return testFlagState({ deal, customer: null });
  const [{ data: customer }, others] = await Promise.all([
    db().from("customers").select("*").eq("id", customerId).maybeSingle(),
    otherFlaggedDeals(customerId, deal.id),
  ]);
  return testFlagState({
    deal,
    customer: (customer as { is_test?: boolean | null } | null) ?? null,
    otherFlaggedDeals: others,
  });
}

/**
 * Flag a deal, and the customer it became, as a test account (0085), or
 * clear it. Marking marks both, because the counts on Home, Reports and the
 * Customers list are per project, and a project hangs off the customer as
 * well as the deal. Clearing clears the deal, and the customer only when no
 * other deal of that customer is still marked; otherwise the customer stays
 * marked and the result says how many deals keep it so. The role check is
 * the server function's.
 */
export async function setTestAccount(
  actorProfileId: string,
  dealId: string,
  isTest: boolean,
): Promise<{
  dealId: string;
  customerId: string | null;
  isTest: boolean;
  /** Clearing left the customer marked because of these other deals. */
  customerKeptBy: number;
}> {
  const { data: deal, error } = await db()
    .from("portal_accounts")
    .select("id,name,customer_id")
    .eq("id", dealId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the deal: ${error.message}`);
  if (!deal) throw new Error("Deal not found");

  const { error: dealError } = await db()
    .from("portal_accounts")
    .update({ is_test: isTest })
    .eq("id", dealId);
  if (dealError) throw new Error(`Could not mark the deal: ${dealError.message}`);

  const customerId = (deal.customer_id as string | null) ?? null;
  let customerKeptBy = 0;
  if (customerId) {
    const others = isTest ? 0 : await otherFlaggedDeals(customerId, dealId);
    if (isTest || clearsCustomer(others)) {
      const { error: customerError } = await db()
        .from("customers")
        .update({ is_test: isTest })
        .eq("id", customerId);
      if (customerError) throw new Error(`Could not mark the customer: ${customerError.message}`);
    } else {
      customerKeptBy = others;
    }
  }

  await audit({
    actor_type: "user",
    actor_id: actorProfileId,
    action: isTest ? "account.marked_test" : "account.marked_real",
    entity_type: "account",
    entity_id: dealId,
    payload: {
      name: deal.name ?? null,
      customer_id: customerId,
      is_test: isTest,
      ...(customerKeptBy ? { customer_kept_by_other_deals: customerKeptBy } : {}),
    },
  });
  return { dealId, customerId, isTest, customerKeptBy };
}
