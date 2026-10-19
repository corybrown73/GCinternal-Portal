import { z } from "zod";

/**
 * Who is signed in, read from the server session. The auth middleware puts the
 * caller's portal profile on the request context; a request's body is never a
 * source of identity.
 */

const profileId = z.string().uuid();

/**
 * The signed-in user's profile id. Throws when the session has no usable id, so
 * a request without an identity does nothing and records nothing.
 */
export function signedInProfileId(profile: { id?: unknown } | null | undefined): string {
  const id = profileId.safeParse(profile?.id);
  if (!id.success) throw new Error("Unauthorized: no signed-in user for this request");
  return id.data;
}

/**
 * The team member the signed-in user is linked to, or null when the login has
 * no team member link. An unusable link is treated as no link, never as a value
 * taken from the request.
 */
export function signedInTeamMemberId(
  profile: { team_member_id?: unknown } | null | undefined,
): string | null {
  const id = profileId.safeParse(profile?.team_member_id);
  return id.success ? id.data : null;
}
