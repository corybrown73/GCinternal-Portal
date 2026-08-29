import { useMemo } from "react";

export type TeamOption = { id: string; name: string; role: string };

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

/**
 * Ownership is picked in two steps: the team first, then a person from that
 * team. Keeps the person list short and makes it obvious which team carries the
 * work. No flat list of everyone.
 */
export function OwnerPicker({
  team,
  group,
  ownerId,
  disabled,
  onChange,
  personLabel = "Person",
}: {
  team: TeamOption[];
  group: string;
  ownerId: string;
  disabled?: boolean;
  onChange: (next: { group: string; ownerId: string }) => void;
  personLabel?: string;
}) {
  const groups = useMemo(
    () => Array.from(new Set(team.map((t) => t.role))).sort((a, b) => a.localeCompare(b)),
    [team],
  );
  const people = useMemo(() => (group ? team.filter((t) => t.role === group) : []), [team, group]);

  return (
    <>
      <label className="block space-y-0.5">
        <span className={labelClass}>Team</span>
        <select
          className={inputClass}
          aria-label="Owning team"
          value={group}
          disabled={disabled}
          onChange={(e) => onChange({ group: e.target.value, ownerId: "" })}
        >
          <option value="">Not chosen</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-0.5">
        <span className={labelClass}>{personLabel}</span>
        <select
          className={inputClass}
          aria-label={personLabel}
          value={ownerId}
          disabled={disabled || group === ""}
          onChange={(e) => onChange({ group, ownerId: e.target.value })}
        >
          <option value="">{group === "" ? "Choose a team first" : "Unassigned"}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/** Team of the person currently assigned, so an existing owner prefills cleanly. */
export function groupOf(team: TeamOption[], ownerId: string | null | undefined) {
  if (!ownerId) return "";
  return team.find((t) => t.id === ownerId)?.role ?? "";
}
