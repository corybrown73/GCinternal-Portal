import { isManagerRole } from "./roles";

/**
 * Who may record that a kickoff was held, or take that back.
 *
 * THE ROLES, as the business defines them (they describe responsibilities, not
 * people, and are read from portal_profiles.role):
 *   - super_admin, admin, manager: may act on any post-sale implementation. A
 *     manager is an Implementation Team Lead. Nobody is named in code.
 *   - implementation: a Technical Implementation Specialist. May act only on an
 *     implementation they are the assigned primary TIS of
 *     (implementations.owner_id).
 *   - every other role: no additional permission here.
 *
 * Coverage for an unassigned TIS is a separate future workstream and is not
 * granted here. Being granted a role applies these rules automatically.
 *
 * Acting never changes implementations.owner_id: the check only reads it.
 */

/** Why the act is allowed: by management, or as the assigned TIS. */
export type KickoffHeldBasis = "management" | "assigned_tis";

export function kickoffHeldChanged(previous: unknown, next: unknown): boolean {
  return Boolean(previous) !== Boolean(next);
}

export function kickoffHeldBasis(input: {
  role: string | null | undefined;
  actorTeamMemberId: string | null;
  ownerTeamMemberId: string | null;
  hasImplementation: boolean;
}): KickoffHeldBasis | null {
  if (!input.hasImplementation) return null;
  if (isManagerRole(input.role)) return "management";
  if (
    input.role === "implementation" &&
    Boolean(input.actorTeamMemberId) &&
    input.actorTeamMemberId === input.ownerTeamMemberId
  ) {
    return "assigned_tis";
  }
  return null;
}

export function canChangeKickoffHeld(input: Parameters<typeof kickoffHeldBasis>[0]): boolean {
  return kickoffHeldBasis(input) !== null;
}
