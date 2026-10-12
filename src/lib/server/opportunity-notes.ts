import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * The opportunity's notes, as a call-notes row on the deal. Salesforce (and
 * a Zap) send them with the close; they used to land in the record's
 * summary only, which no reading looked at and the "Read again" button did
 * not count. One row per opportunity: the title carries `[sf:<id>]` when
 * the sender knows it (the pull does; the API may not, and then it is one
 * row per deal), a replay with the same text adds nothing, and an edited
 * Description replaces the row's text instead of standing beside the stale
 * one. The reading's hash covers the text, so the edit is seen as new.
 */
export const OPPORTUNITY_NOTES_TITLE = "Salesforce opportunity notes";

const db = () => supabaseAdmin as any;

export function opportunityNotesTitle(opportunityId: string | null | undefined): string {
  return opportunityId
    ? `${OPPORTUNITY_NOTES_TITLE} [sf:${opportunityId}]`
    : OPPORTUNITY_NOTES_TITLE;
}

export async function storeOpportunityNotes(
  dealId: string,
  notes: string,
  source: { opportunityId?: string | null | undefined } = {},
): Promise<{ stored: boolean; replaced: boolean }> {
  const text = notes.trim();
  if (!text) return { stored: false, replaced: false };
  const title = opportunityNotesTitle(source.opportunityId);
  const { data: existing } = await db()
    .from("portal_gong_reports")
    .select("id,content_md")
    .eq("account_id", dealId)
    .eq("title", title)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    if (existing.content_md === text) return { stored: false, replaced: false };
    const { error } = await db()
      .from("portal_gong_reports")
      .update({ content_md: text })
      .eq("id", existing.id);
    if (error) throw new Error(`Could not update the opportunity notes: ${error.message}`);
    return { stored: true, replaced: true };
  }
  const { error } = await db().from("portal_gong_reports").insert({
    account_id: dealId,
    report_type: "call_notes",
    title,
    content_md: text,
    uploaded_by: null,
  });
  if (error) throw new Error(`Could not store the opportunity notes: ${error.message}`);
  return { stored: true, replaced: false };
}
