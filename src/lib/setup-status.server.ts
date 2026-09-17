import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = () => supabaseAdmin as any;

/**
 * Is the tool set up to run an account end to end? Asked by the deal page
 * and the admin page so nobody finds out the pool is empty by watching an
 * account go unassigned.
 */
export type SetupStatus = {
  aiConfigured: boolean;
  emailLive: boolean;
  poolSize: number;
  profiles: { total: number; missingPhoto: number; missingBooking: number };
  me: { photo: boolean; booking: boolean; title: boolean };
};

export async function loadSetupStatus(profileId: string): Promise<SetupStatus> {
  const [{ data: pool }, { data: profiles }, { data: me }] = await Promise.all([
    db().from("portal_assignment_pool").select("team_member_id").eq("active", true),
    db()
      .from("portal_profiles")
      .select("id,photo_path,booking_url,role")
      .in("role", ["implementation", "onboarding", "manager", "tam_se"]),
    db()
      .from("portal_profiles")
      .select("photo_path,booking_url,title")
      .eq("id", profileId)
      .maybeSingle(),
  ]);
  const rows = (profiles ?? []) as Array<{ photo_path: string | null; booking_url: string | null }>;
  const mode = process.env["EMAIL_MODE"] ?? (process.env["RESEND_API_KEY"] ? "send" : "log");
  return {
    aiConfigured: Boolean(process.env["ANTHROPIC_API_KEY"]),
    emailLive: mode === "send",
    poolSize: (pool ?? []).length,
    profiles: {
      total: rows.length,
      missingPhoto: rows.filter((r) => !r.photo_path).length,
      missingBooking: rows.filter((r) => !r.booking_url).length,
    },
    me: {
      photo: Boolean(me?.photo_path),
      booking: Boolean(me?.booking_url),
      title: Boolean(me?.title),
    },
  };
}
