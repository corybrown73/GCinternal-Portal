import type { DealAssignment } from "@/lib/assignment.server";

/**
 * The owner picker's people, in two groups: the rotation first, with what
 * each person owns today and who is next up, then the implementation roles
 * outside it. The server has already narrowed the list (pickerMembers): the
 * rotation, TIS / implementation / onboarding / manager, anyone who owns
 * active work today, and the person who owns the account now — the Field
 * Fusion setup owner, say — so a picker never hides the name the header shows.
 *
 * "Next up" is the rotation's pick, ranked by recent hand-offs (the window's
 * weighted load), not by the "N active" count beside each name; the label
 * says so, so the two never look like they disagree.
 */
export function MemberOptions({ members }: { members: DealAssignment["members"] }) {
  const rotation = members.filter((m) => m.inPool);
  const others = members.filter((m) => !m.inPool);
  return (
    <>
      <optgroup label="In rotation">
        {rotation.map((p) => (
          <option
            key={p.teamMemberId}
            value={p.teamMemberId}
            title={
              p.rank === 1
                ? "Next up: the fewest recent hand-offs, weighted by deal size. The active count is what they own today."
                : undefined
            }
          >
            {p.name} — {activeLabel(p.owned)}
            {p.rank === 1 ? " · next up (fewest recent hand-offs)" : ""}
          </option>
        ))}
      </optgroup>
      {others.length ? (
        <optgroup label="Not in rotation">
          {others.map((p) => (
            <option key={p.teamMemberId} value={p.teamMemberId}>
              {p.name} — {activeLabel(p.owned)}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}

/** "3 active accounts": what they own today, the count Reports shows too. */
function activeLabel(n: number | undefined): string {
  const count = n ?? 0;
  return `${count} active account${count === 1 ? "" : "s"}`;
}
