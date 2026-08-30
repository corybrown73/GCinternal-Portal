import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Users } from "lucide-react";

import { getTeamOptions } from "@/lib/hub.functions";
import { cn } from "@/lib/utils";

/**
 * Whose accounts this page is showing, and how to change it.
 *
 * Two things this is careful about.
 *
 * It always SAYS whose book is on screen, even on the default. A list filtered
 * to your own accounts that does not mention it is how somebody concludes an
 * account was deleted, or that the hub has lost half the pipeline — and the
 * first time that happens they stop trusting every number on the page.
 *
 * And it is a view switch, not a permission. There is no request, no approval
 * and no audit ceremony around covering for a colleague, because covering for
 * somebody on leave is a Tuesday. The label makes it obvious when you are in
 * someone else's book so you do not act on it thinking it is yours.
 */

export type ScopeState = {
  mode: "mine" | "all" | "person";
  person_id: string | null;
  label: string;
  viewer_name: string;
};

export function ScopeSwitch({
  scope,
  onChange,
}: {
  scope: ScopeState | undefined;
  /** Receives the URL parameter value: null for the default, else "all" or "owner:<id>". */
  onChange: (param: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const team = useQuery({
    queryKey: ["team-options"],
    queryFn: () => getTeamOptions(),
    // Only when the menu is actually opened: the default view must not pay for
    // a team list nobody looked at.
    enabled: open,
  });

  if (!scope) return null;

  const covering = scope.mode === "person";
  const everything = scope.mode === "all";

  const choose = (param: string | null) => {
    onChange(param);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px]",
          covering
            ? "border-foreground bg-foreground/5 font-medium"
            : everything
              ? "border-foreground/40"
              : "border-border text-muted-foreground",
        )}
        aria-expanded={open}
      >
        <Users className="h-3 w-3" />
        {scope.label}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open ? (
        <>
          {/* Click-away. A menu that only closes on re-clicking its own button
              is a menu people leave open by accident. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 max-h-80 w-64 overflow-auto rounded-md border border-border bg-card py-1 shadow-md">
            <Row
              label={`${scope.viewer_name}'s accounts`}
              hint="Your own book. The default."
              active={scope.mode === "mine"}
              onClick={() => choose(null)}
            />
            <Row
              label="All accounts"
              hint="Everything, whoever owns it."
              active={everything}
              onClick={() => choose("all")}
            />
            <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Covering for
            </p>
            {team.isLoading ? (
              <p className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</p>
            ) : (team.data ?? []).length === 0 ? (
              <p className="px-3 py-2 text-[12px] text-muted-foreground">No team members yet.</p>
            ) : (
              (team.data ?? []).map((m: { id: string; name: string; role?: string }) => (
                <Row
                  key={m.id}
                  label={m.name}
                  hint={m.role ?? undefined}
                  active={scope.person_id === m.id}
                  onClick={() => choose(`owner:${m.id}`)}
                />
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Row({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint?: string | undefined;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-muted"
    >
      <Check className={cn("h-3 w-3 shrink-0", active ? "opacity-100" : "opacity-0")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? <span className="shrink-0 text-[10px] text-muted-foreground">{hint}</span> : null}
    </button>
  );
}
