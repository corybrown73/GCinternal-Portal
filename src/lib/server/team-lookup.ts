import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * A team member from what a sender wrote: an email, or a full name. The
 * Salesforce "TIS assigned" field is a User lookup; a Flow can send the
 * user's email, a Zap often has only the name. Both resolve here, exactly
 * and case-insensitively, against the active team. Nothing fuzzy: assigning
 * the wrong person is worse than assigning nobody, and nobody is what the
 * rule then fixes.
 */
export async function resolveTeamMember(
  emailOrName: string,
): Promise<{ id: string; name: string; email: string | null } | null> {
  const db = supabaseAdmin as any;
  const q = emailOrName.trim();
  if (!q) return null;
  const col = q.includes("@") ? "email" : "name";
  const { data } = await db
    .from("team_members")
    .select("id,name,email")
    .eq("active", true)
    .ilike(col, q)
    .limit(2);
  const rows = (data ?? []) as Array<{ id: string; name: string; email: string | null }>;
  // Two people with the same name is nobody: let the rule decide.
  if (rows.length !== 1) return null;
  return rows[0]!;
}
