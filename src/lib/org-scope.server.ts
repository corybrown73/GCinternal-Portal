import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = () => supabaseAdmin as any;

/**
 * The organisation a signed-in person belongs to, read from the database. A
 * request never supplies an organisation or profile to trust: the caller's
 * profile comes from the session, and its organisation from here.
 */
export async function callerOrgId(profileId: string): Promise<string> {
  const { data, error } = await db()
    .from("portal_profiles")
    .select("org_id")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.org_id) throw new Error("Forbidden: your login is not linked to an organisation");
  return String(data.org_id);
}

/** Throws unless the implementation exists and sits in the given organisation. */
export async function assertImplementationInOrg(implementationId: string, orgId: string) {
  const { data, error } = await db()
    .from("implementations")
    .select("org_id")
    .eq("id", implementationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || String(data.org_id) !== orgId) {
    throw new Error("Not found: that implementation is not in your organisation");
  }
}
