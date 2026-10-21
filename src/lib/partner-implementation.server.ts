import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { isPartnerJourney } from "./partner-implementation";

const db = () => supabaseAdmin as any;

/**
 * Whether a deal's implementation runs the generic partner journey. Read from
 * the stored journey type and partner, the same test every partner path uses:
 * a standard or legacy Field Fusion implementation is never a partner journey.
 * The newest implementation decides, as it does for the owner lookups.
 */
export async function dealHasPartnerJourney(dealId: string): Promise<boolean> {
  const { data, error } = await db()
    .from("implementations")
    .select("journey_type,partner_key")
    .eq("deal_id", dealId)
    .is("superseded_by_implementation_id", null)
    .is("closed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not read the implementation for the deal: ${error.message}`);
  return data
    ? isPartnerJourney(data as { journey_type: string | null; partner_key: string | null })
    : false;
}
