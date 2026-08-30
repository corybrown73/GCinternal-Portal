/**
 * Who can be handed a ticket.
 *
 * WHY THIS IS ITS OWN MODULE. The routing screen's "Fallback person" picker was
 * reported as broken because it lists two people while the TIS journal picker on
 * Customer 360 lists the whole staff directory. The pickers read different
 * tables — `portal_profiles` here, `team_members` there — and the suggested fix
 * was to point them both at the directory.
 *
 * That would be wrong. A journal author is a NAME: we record who did the thing.
 * A ticket assignee is an ACCOUNT: `tickets.assigned_to` and
 * `ticket_routing.fallback_profile_id` both reference `portal_profiles` because
 * the assignee has to sign in to see the ticket and work it. Offering a
 * directory row with no login would let a manager route a queue to somebody who
 * can never open it, and the ticket would sit there looking assigned.
 *
 * So the picker is right and the list is short for a real reason: only two
 * people have been invited. The fix is to say so, and to point at the invite
 * flow, rather than to widen the list into a lie.
 */

export type AssignableProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
};

/** `Joy Jenkins · Implementation`, falling back to the email if unnamed. */
export function assigneeLabel(
  profile: AssignableProfile,
  humanizeRole: (role: string) => string,
): string {
  const name = profile.full_name?.trim() || profile.email;
  return `${name} · ${humanizeRole(profile.role)}`;
}

/**
 * The sentence under the picker, or null when there is nothing to explain.
 *
 * `directory` is active `team_members`; `assignable` is internal
 * `portal_profiles`. The gap between them is the set of people you can name in
 * a journal but cannot route a ticket to.
 */
export function unlinkedStaffNote(counts: {
  assignable: number;
  directory: number;
}): string | null {
  const { assignable, directory } = counts;

  if (assignable === 0) {
    return "Nobody can be a fallback yet: a fallback has to sign in to work the ticket, and no one has accepted an invite.";
  }

  // The directory can legitimately be the smaller of the two — a portal account
  // need not have a directory row — and then there is nothing missing to report.
  const missing = directory - assignable;
  if (missing <= 0) return null;

  const people = missing === 1 ? "person" : "people";
  return `${assignable} of ${directory} in the team directory can be a fallback. A fallback has to sign in to work the ticket, so ${missing} ${people} in the directory can be named in a journal but not routed a queue.`;
}
