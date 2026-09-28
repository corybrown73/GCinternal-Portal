import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { missingForClosedWon, type WonGateMissing } from "../won-gate";

const db = () => supabaseAdmin as any;

/** What the deal lacks for Closed Won, read from the record. */
export async function closedWonMissing(dealId: string): Promise<WonGateMissing[]> {
  const [{ count: reports }, { data: row }] = await Promise.all([
    db()
      .from("portal_gong_reports")
      .select("id", { count: "exact", head: true })
      .eq("account_id", dealId),
    db()
      .from("portal_accounts")
      .select("sow_document_path, sow_reference")
      .eq("id", dealId)
      .maybeSingle(),
  ]);
  return missingForClosedWon({
    reports: reports ?? 0,
    sowPath: row?.sow_document_path ?? null,
    sowReference: row?.sow_reference ?? null,
  });
}
