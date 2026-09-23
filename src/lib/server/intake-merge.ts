import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Merge keys into a deal's intake in one statement (0062): top-level keys
 * from `patch`, and `timeline` keys into intake.timeline. For anything that
 * writes after a long model call — a whole-object write there loses what a
 * person typed, or what another AI step saved, in the meantime.
 */
export async function mergeIntake(
  dealId: string,
  patch: Record<string, unknown>,
  timeline?: Record<string, unknown> | null,
): Promise<void> {
  const { error } = await (supabaseAdmin as any).rpc("portal_merge_intake", {
    p_account: dealId,
    p_patch: { ...patch, updated_at: new Date().toISOString() },
    p_timeline: timeline ?? null,
  });
  if (error) throw new Error(`Could not save the intake: ${error.message}`);
}
