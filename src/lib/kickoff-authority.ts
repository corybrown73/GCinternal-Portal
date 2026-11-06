/**
 * Who may record that a kickoff was held, or take that back.
 *
 * THE APPROVED RULE. The assigned TIS may; either Implementation Team Lead may
 * across all implementations; an explicitly authorised covering specialist may
 * for the implementations they cover; an unassigned specialist may not.
 *
 * WHAT THE CODE CAN ENFORCE TODAY. Only the first. The assigned TIS is
 * implementations.owner_id, and a signed-in person maps to a team member through
 * portal_profiles.team_member_id. Nothing in the schema marks someone as an
 * Implementation Team Lead, and covering is recorded nowhere: the ownership
 * module says plainly that it is a default view, not an access control. So
 * until the leadership and coverage model exists, this rule is the whole of the
 * enforcement. A team lead who is not the assigned TIS is refused, and can
 * become the assigned TIS on the implementation to act. This is a deliberate,
 * narrow control; it is not a broad internal-user grant.
 */
export function kickoffHeldChanged(previous: unknown, next: unknown): boolean {
  return Boolean(previous) !== Boolean(next);
}

export function canChangeKickoffHeld(input: {
  actorTeamMemberId: string | null;
  ownerTeamMemberId: string | null;
  hasImplementation: boolean;
}): boolean {
  return (
    input.hasImplementation &&
    Boolean(input.actorTeamMemberId) &&
    input.actorTeamMemberId === input.ownerTeamMemberId
  );
}
