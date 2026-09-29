import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { companyNameFrom } from "../company-name";
import { customerFacingName } from "../names";

const db = () => supabaseAdmin as any;

/**
 * The name a customer reads, for a surface that starts from an
 * implementation or a customer rather than the deal: the shared plan, the
 * plan email, the portal invite, the portal itself. The deal behind the
 * project holds the customer-facing name (typed, or cleaned); a project
 * with no deal gets the cleaned customer name.
 */
export async function customerFacingNameFor(args: {
  implementationId?: string | null;
  customerId?: string | null;
  fallback: string;
}): Promise<string> {
  try {
    let dealId: string | null = null;
    if (args.implementationId) {
      const { data } = await db()
        .from("implementations")
        .select("deal_id")
        .eq("id", args.implementationId)
        .maybeSingle();
      dealId = (data?.deal_id as string | null) ?? null;
    }
    if (!dealId && args.customerId) {
      const { data } = await db()
        .from("portal_accounts")
        .select("id")
        .eq("customer_id", args.customerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      dealId = (data?.id as string | null) ?? null;
    }
    if (dealId) {
      const { data: deal } = await db()
        .from("portal_accounts")
        .select("name,display_name")
        .eq("id", dealId)
        .maybeSingle();
      if (deal) return customerFacingName(deal) || companyNameFrom(args.fallback) || args.fallback;
    }
  } catch (e) {
    console.error("[customer-facing-name] lookup failed; using the cleaned name", e);
  }
  return companyNameFrom(args.fallback) || args.fallback;
}
