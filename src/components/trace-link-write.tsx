import { useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Panel } from "@/components/record";
import { getSolutionTrace, linkDecision, unlinkDecision } from "@/lib/hygiene.functions";

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50";

/**
 * The one trace link a person draws by hand.
 *
 * Everything else in the traceability spine is derived in the database from
 * foreign keys that already exist (requirement → solution, entity → evidence,
 * entity → approval), so it needs no UI and cannot drift from the records it
 * describes. Decision ↔ technical solution has no foreign key behind it, which
 * is why the "decisions behind this solution" list has always been empty.
 *
 * Both ends must sit on the same implementation — the spine is walked outward
 * eight hops, so a cross-customer edge would put one customer's decision on
 * another customer's page. The server re-checks that; this only offers
 * decisions that already pass it.
 */
export function SolutionDecisionLinks({ solutionId }: { solutionId: string }) {
  const queryClient = useQueryClient();
  const link = useServerFn(linkDecision);
  const unlink = useServerFn(unlinkDecision);
  const [pick, setPick] = useState("");

  const view = useQuery(
    queryOptions({
      queryKey: ["solution-trace", solutionId],
      queryFn: () => getSolutionTrace({ data: { solutionId } }),
    }),
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["solution-trace", solutionId] });
    void queryClient.invalidateQueries({ queryKey: ["technical-solution", solutionId] });
  };

  const linkMutation = useMutation({
    mutationFn: (decisionId: string) => link({ data: { decisionId, solutionId } }),
    onSuccess: () => {
      invalidate();
      setPick("");
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => unlink({ data: { linkId, solutionId } }),
    onSuccess: invalidate,
  });

  if (!view.data?.enabled) return null;

  const { links, candidates } = view.data;

  return (
    <Panel title="Decisions behind this solution" level="supporting" count={links.length}>
      <p className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
        The only trace link drawn by hand. Every other edge in the traceability spine is derived
        from a foreign key, so it cannot drift; this one has no foreign key behind it.
      </p>
      {links.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-muted-foreground">No decisions linked yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[12px]">{l.decision_title}</span>
              {l.source === "manual" ? (
                <button
                  type="button"
                  className={buttonClass}
                  disabled={unlinkMutation.isPending}
                  onClick={() => unlinkMutation.mutate(l.id)}
                >
                  Unlink
                </button>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Derived
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <select
          className={inputClass}
          aria-label="Decision to link"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
        >
          <option value="">
            {candidates.length
              ? "Pick a decision…"
              : "No unlinked decisions on this implementation"}
          </option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={buttonClass}
          disabled={!pick || linkMutation.isPending}
          onClick={() => linkMutation.mutate(pick)}
        >
          Link
        </button>
      </div>

      {linkMutation.isError ? (
        <p className="px-3 pb-2 text-[11px] text-destructive">
          {(linkMutation.error as Error).message}
        </p>
      ) : null}
    </Panel>
  );
}
