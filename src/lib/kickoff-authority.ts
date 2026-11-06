/**
 * Who may record that a kickoff was held, or take that back.
 *
 * THE APPROVED RULE. The assigned TIS may; both Implementation Team Leads may on
 * any post-sale implementation, without becoming its owner; an explicitly
 * authorised covering specialist may for the implementations they cover; an
 * unrelated internal user may not.
 *
 * WHAT THE CODE CAN ENFORCE TODAY: THE ASSIGNED TIS ONLY.
 *
 * The assigned TIS is implementations.owner_id. A signed-in person maps to a
 * team member through portal_profiles.team_member_id, and the match is exact.
 *
 * The two Team Leads cannot be identified safely from existing data. Checked:
 *   - portal_profiles.role has no implementation-lead value. The management
 *     group is MANAGE_ROLES (admin, super_admin, manager). "manager" covers every
 *     manager, not two people, so granting it would be the unrestricted manager
 *     access the rule forbids. admin and super_admin are broader still.
 *   - team_members.role is a copy of the profile role (0025), so it adds nothing.
 *   - implementation_role_assignments (0014) holds work-item roles per
 *     implementation (for example implementation_manager, the TIS). It is not
 *     read by any code, and it names no lead.
 *   - Covering is recorded nowhere, and the ownership module says it is a
 *     default view, not an access control.
 *
 * So the Team Lead and covering rules need the leadership model: a recorded,
 * per-person authority that the database enforces. Until it exists, this rule
 * is the whole of the enforcement. A Team Lead who is not the assigned TIS is
 * refused. Hardcoded names, a role-wide grant, and a parallel temporary
 * permission store were all considered and rejected.
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
