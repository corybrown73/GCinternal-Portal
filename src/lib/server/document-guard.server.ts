import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { IntakeAnswers } from "@/lib/intake-answers";
import { documentRefusal, type GeneratedDocument } from "@/lib/document-guard";

import { liveImplementationForDeal } from "./deal-implementation";

const db = () => supabaseAdmin as any;

/**
 * Refuses a document for a partner project or deal. Every generator calls this
 * before it builds, stores or files anything, so no entry point can skip it:
 * the rule is enforced here, not by hiding a button.
 *
 * `known` is what the caller has already read. Anything it leaves out is read
 * from the deal, so a caller can never reach the generator with the rule unread.
 */
export async function assertDocumentAllowed(
  document: GeneratedDocument,
  dealId: string,
  known: { customerId?: string | null; intake?: unknown } = {},
): Promise<void> {
  let customerId = known.customerId;
  let intake = known.intake;
  if (customerId === undefined || intake === undefined) {
    const { data: deal } = await db()
      .from("portal_accounts")
      .select("customer_id,intake")
      .eq("id", dealId)
      .maybeSingle();
    customerId =
      customerId === undefined ? ((deal?.customer_id as string | null) ?? null) : customerId;
    intake = intake === undefined ? (deal?.intake ?? null) : intake;
  }

  const implementation = await liveImplementationForDeal<{
    journey_type: string | null;
    partner_key: string | null;
  }>(db(), { dealId, customerId, select: "journey_type,partner_key" });

  // Only the path is needed to tell a partner deal apart; the rest of the intake stays unread here.
  const path = (intake as { path?: unknown } | null)?.path;
  const reason = documentRefusal(document, {
    implementation,
    intake: path === undefined ? null : { path: path as IntakeAnswers["path"] },
  });
  if (reason) throw new Error(reason);
}
