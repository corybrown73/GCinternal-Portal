import type { DealAssignment } from "@/lib/assignment.server";

/**
 * Every active team member, in two groups: the rotation first, with rank
 * and load, then everyone else. The person who already owns the account
 * — the Field Fusion setup owner, say — is always listed, in the pool or
 * not, so a picker never hides the name the header shows.
 */
export function MemberOptions({ members }: { members: DealAssignment["members"] }) {
  const rotation = members.filter((m) => m.inPool);
  const others = members.filter((m) => !m.inPool);
  return (
    <>
      <optgroup label="In rotation">
        {rotation.map((p) => (
          <option key={p.teamMemberId} value={p.teamMemberId}>
            {p.name}
            {p.rank ? ` (#${p.rank}, carrying ${p.load})` : ""}
          </option>
        ))}
      </optgroup>
      {others.length ? (
        <optgroup label="Not in rotation">
          {others.map((p) => (
            <option key={p.teamMemberId} value={p.teamMemberId}>
              {p.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}
