import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_SCOPE, parseScope, type OwnerScope, type Viewer } from "./ownership";

const db = () => supabaseAdmin as any;

/**
 * A scope with the people in it resolved.
 *
 * The VIEWER IS NEVER TAKEN FROM THE CLIENT. `resolveScope` is handed the
 * profile id the auth middleware put on the request context, and looks up the
 * rest. A caller can ask to see all accounts or somebody else's — that is
 * allowed and is the point — but it cannot ask to be somebody else.
 */
export type ResolvedScope = {
  scope: OwnerScope;
  viewer: Viewer;
  /** Fully resolved, when the scope names a person and they could be found. */
  person: Viewer | null;
  /** For the header. */
  personName: string | null;
};

/**
 * A person has a `portal_profiles` row and, usually, a `team_members` row
 * linked to it. Delivery ownership points at the second; the pre-sale account
 * owners point at the first. Somebody with no team_members row still gets a
 * working "mine" — it just cannot match on the delivery fields, which is the
 * honest answer rather than a crash or an empty page.
 */
export async function viewerFor(profileId: string): Promise<Viewer> {
  const { data } = await db()
    .from("portal_profiles")
    .select("id, full_name, email, team_member_id")
    .eq("id", profileId)
    .maybeSingle();
  return {
    profileId,
    teamMemberId: data?.team_member_id ?? null,
    name: data?.full_name || data?.email || "You",
  };
}

async function viewerForTeamMember(teamMemberId: string): Promise<{
  viewer: Viewer | null;
  name: string | null;
}> {
  const [{ data: member }, { data: profile }] = await Promise.all([
    db().from("team_members").select("id, name").eq("id", teamMemberId).maybeSingle(),
    db()
      .from("portal_profiles")
      .select("id, full_name, email, team_member_id")
      .eq("team_member_id", teamMemberId)
      .maybeSingle(),
  ]);
  if (!member) return { viewer: null, name: null };
  // A team member who has never signed in has no profile. They can still be
  // scoped to — on the two team_member fields — so covering for somebody who
  // does not use the hub still works.
  return {
    viewer: profile
      ? {
          profileId: profile.id,
          teamMemberId,
          name: profile.full_name || profile.email || member.name,
        }
      : null,
    name: member.name,
  };
}

export async function resolveScope(
  profileId: string,
  raw: string | null | undefined,
): Promise<ResolvedScope> {
  const viewer = await viewerFor(profileId);
  const scope = parseScope(raw);

  if (scope.mode !== "person" || !scope.personId) {
    return {
      scope: scope.mode === "person" ? DEFAULT_SCOPE : scope,
      viewer,
      person: null,
      personName: null,
    };
  }

  const { viewer: person, name } = await viewerForTeamMember(scope.personId);
  if (!name) {
    // An owner id that resolves to nobody falls back to the viewer's own book,
    // not to everything. A stale link should show less, never more.
    return { scope: DEFAULT_SCOPE, viewer, person: null, personName: null };
  }
  return { scope, viewer, person, personName: name };
}
