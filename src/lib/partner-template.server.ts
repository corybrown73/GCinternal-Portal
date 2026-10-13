import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { liveTemplateId, PARTNER_TEMPLATE_KEY } from "./partner-implementation";

const db = () => supabaseAdmin as any;

/**
 * The live partner journey template's id. Throws before anything is written
 * when none is published: a new partner implementation is refused, never
 * started on the standard journey.
 */
export async function requireLivePartnerTemplate(): Promise<string> {
  const { data } = await db()
    .from("journey_templates")
    .select("id,key,status,superseded_by_id")
    .eq("key", PARTNER_TEMPLATE_KEY);
  const id = liveTemplateId((data ?? []) as Parameters<typeof liveTemplateId>[0]);
  if (!id) {
    throw new Error(
      "The partner implementation journey is not published, so this implementation was not started. No standard journey was applied.",
    );
  }
  return id;
}
