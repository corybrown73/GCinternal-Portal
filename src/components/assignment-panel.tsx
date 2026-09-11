import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, UserRoundCheck } from "lucide-react";

import { Panel } from "@/components/record";
import { describeBreakdown } from "@/lib/assignment";
import { assignDealFn, getDealAssignment } from "@/lib/assignment.functions";
import { fmtDateTime } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

/**
 * Who has eyes on this account, and the three things they do first.
 *
 * The owner comes from the project; the pick came from the rule or a
 * person, and the ledger says which. The three steps are read from the
 * record — a Gong report exists, a SOW is on file, the welcome link was
 * created — so nobody ticks a box that the data would contradict.
 */
export function AssignmentPanel({ dealId, editable }: { dealId: string; editable: boolean }) {
  const qc = useQueryClient();
  const load = useServerFn(getDealAssignment);
  const assign = useServerFn(assignDealFn);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<string>("");

  const q = useQuery({
    queryKey: ["assignment", dealId],
    queryFn: () => load({ data: { dealId } }),
    refetchInterval: 15_000,
  });
  const m = useMutation({
    mutationFn: (teamMemberId: string | null) => assign({ data: { dealId, teamMemberId } }),
    onMutate: () => setError(null),
    onSuccess: (r) => {
      if (!r) setError("Nobody is in the assignment pool. Add people under Admin → Assignment.");
      void qc.invalidateQueries({ queryKey: ["assignment", dealId] });
      void qc.invalidateQueries({ queryKey: ["deal", dealId] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const a = q.data;
  const done = a?.steps.filter((s) => s.done).length ?? 0;

  return (
    <Panel
      title="Implementation owner"
      meta={a ? `${done}/${a.steps.length} first steps` : undefined}
      level="primary"
      collapsible
      collapseKey="deal:owner"
      action={
        editable ? (
          <div className="flex items-center gap-1.5">
            <select
              className="h-6 rounded-sm border border-border bg-background px-1.5 text-[11px]"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              disabled={m.isPending || !a}
            >
              <option value="">{a?.nextUp ? `By rule → ${a.nextUp.name}` : "By rule"}</option>
              {(a?.pool ?? []).map((p) => (
                <option key={p.teamMemberId} value={p.teamMemberId}>
                  {p.name}
                  {p.rank ? ` (#${p.rank}, carrying ${p.load})` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={m.isPending || !a}
              onClick={() => m.mutate(pick || null)}
            >
              <UserRoundCheck className="h-3 w-3" />
              {m.isPending ? "Assigning…" : a?.owner ? "Reassign" : "Assign"}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-2.5 px-3 py-2.5">
        {error ? (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        ) : null}
        {!a ? (
          <p className="text-[12px] text-muted-foreground">Loading…</p>
        ) : a.owner ? (
          <div className="text-[12px]">
            <p>
              <span className="font-medium">{a.owner.name}</span>
              {a.owner.email ? (
                <span className="text-muted-foreground"> · {a.owner.email}</span>
              ) : null}
            </p>
            {a.last ? (
              <p className="text-[11px] text-muted-foreground">
                {a.last.source === "auto" ? "By rule" : "By hand"} · {fmtDateTime(a.last.createdAt)}
                {a.last.note ? ` · ${a.last.note}` : ""}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            Nobody yet.{" "}
            {a.nextUp
              ? `The rule would pick ${a.nextUp.name}.`
              : "The pool is empty — add people under Admin → Assignment."}
          </p>
        )}

        <p className="text-[11px] text-muted-foreground">
          Weight {a?.weight ?? "—"}
          {a ? ` · ${describeBreakdown(a.breakdown)}` : ""}
        </p>

        {a ? (
          <ol className="divide-y divide-border rounded-md border border-border bg-background">
            {a.steps.map((s, i) => (
              <li
                key={s.key}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-1.5 text-[12px]",
                  s.done && "bg-emerald-500/5",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-4 w-4 items-center justify-center rounded-sm border text-[10px]",
                    s.done
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {s.done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn(s.done && "text-muted-foreground line-through")}>
                  {s.label}
                </span>
                {!s.done && s.key === "welcome" ? (
                  <Link
                    to="/onboarding-plan/$dealId"
                    params={{ dealId }}
                    className="ml-auto text-[11px] text-primary hover:underline"
                  >
                    Open
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </Panel>
  );
}
