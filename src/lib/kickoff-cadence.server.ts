import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = () => supabaseAdmin as any;
const CONFIG_KEY = "kickoff_cadence";

/**
 * Which Salesloft cadence the implementation owner adds a new account to
 * while the first meeting is being booked. Deployment-wide, in
 * `portal_app_config`: the Hub has to say WHICH cadence, not assume the
 * reader knows the process. Empty until a manager names it.
 */
export type KickoffCadence = { name: string; url: string | null };

export async function loadKickoffCadence(): Promise<KickoffCadence> {
  try {
    const { data } = await db()
      .from("portal_app_config")
      .select("value")
      .eq("key", CONFIG_KEY)
      .maybeSingle();
    const v = (data?.value ?? {}) as Partial<KickoffCadence>;
    return {
      name: typeof v.name === "string" ? v.name.trim() : "",
      url: typeof v.url === "string" && v.url.trim() ? v.url.trim() : null,
    };
  } catch (e) {
    console.error("[cadence] could not read kickoff_cadence", e);
    return { name: "", url: null };
  }
}

export async function saveKickoffCadence(next: KickoffCadence): Promise<KickoffCadence> {
  const { error } = await db()
    .from("portal_app_config")
    .upsert({ key: CONFIG_KEY, value: next }, { onConflict: "key" });
  if (error) throw new Error(`Could not save the cadence: ${error.message}`);
  return loadKickoffCadence();
}
