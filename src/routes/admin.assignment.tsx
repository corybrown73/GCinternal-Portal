import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageBody, PageHeader } from "@/components/page";
import { Panel } from "@/components/record";
import { describeBreakdown, type AssignmentRules } from "@/lib/assignment";
import {
  getAssignmentSettings,
  saveAssignmentRules,
  setAssignmentPoolMember,
} from "@/lib/assignment.functions";
import { fmtDateTime } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

/**
 * Who gets the account, and why.
 *
 * The pool: which team members are in rotation, at what capacity, what each
 * is carrying right now, and who is next. The rules: what makes a deal
 * heavy. The ledger: every pick, with its weight and whether the rule or a
 * person made it. A manager reads this page and can answer "why did Priya
 * get that one" without asking anybody.
 */
export const Route = createFileRoute("/admin/assignment")({
  head: () => ({ meta: [{ title: "Assignment — Admin" }] }),
  component: AssignmentPage,
});

const input =
  "h-7 rounded-sm border border-border bg-background px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60";

function AssignmentPage() {
  const qc = useQueryClient();
  const load = useServerFn(getAssignmentSettings);
  const save = useServerFn(saveAssignmentRules);
  const setMember = useServerFn(setAssignmentPoolMember);
  const q = useQuery({ queryKey: ["assignment-settings"], queryFn: () => load() });
  const [rules, setRules] = useState<AssignmentRules | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (q.data && !rules) setRules(q.data.rules);
  }, [q.data, rules]);

  const saveM = useMutation({
    mutationFn: (r: AssignmentRules) => save({ data: r }),
    onMutate: () => setError(null),
    onSuccess: (r) => {
      setRules(r);
      void qc.invalidateQueries({ queryKey: ["assignment-settings"] });
    },
    onError: (e) => setError((e as Error).message),
  });
  const memberM = useMutation({
    mutationFn: (args: { teamMemberId: string; active: boolean; capacity?: number }) =>
      setMember({ data: args }),
    onMutate: () => setError(null),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["assignment-settings"] }),
    onError: (e) => setError((e as Error).message),
  });

  const pool = q.data?.pool ?? [];
  const inRotation = pool.filter((p) => p.inPool && p.active);
  const next = inRotation.find((p) => p.rank === 1);

  return (
    <>
      <PageHeader
        title="Assignment"
        description="Who gets the next account. Every closed-won deal carries a weight; whoever is carrying the least gets it, so the person who just took the heavy integration is skipped on the next small one."
        actions={
          next ? (
            <span className="rounded-sm bg-primary/10 px-2 py-1 text-[12px] font-medium text-primary">
              Next up: {next.name}
            </span>
          ) : (
            <span className="rounded-sm bg-amber-500/10 px-2 py-1 text-[12px] text-amber-700 dark:text-amber-400">
              Nobody in rotation — closed-won deals will wait for a manual pick
            </span>
          )
        }
      />
      <PageBody className="space-y-4">
        {error ? (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        ) : null}

        {/* The pool */}
        <Panel title="The pool" count={inRotation.length} level="primary">
          {q.isPending ? (
            <p className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-1.5">In rotation</th>
                  <th className="px-3 py-1.5">Person</th>
                  <th className="px-3 py-1.5">Capacity</th>
                  <th className="px-3 py-1.5">Carrying ({rules?.window_days ?? 30}d)</th>
                  <th className="px-3 py-1.5">Last handed</th>
                  <th className="px-3 py-1.5">Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pool.map((p) => (
                  <tr key={p.teamMemberId} className={cn(p.rank === 1 && "bg-primary/5")}>
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-primary"
                        checked={p.inPool && p.active}
                        disabled={memberM.isPending}
                        onChange={(e) =>
                          memberM.mutate({ teamMemberId: p.teamMemberId, active: e.target.checked })
                        }
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-1.5 text-muted-foreground">
                        {p.role ?? ""}
                        {p.email ? ` · ${p.email}` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        className={input}
                        value={String(p.capacity)}
                        disabled={memberM.isPending || !(p.inPool && p.active)}
                        onChange={(e) =>
                          memberM.mutate({
                            teamMemberId: p.teamMemberId,
                            active: true,
                            capacity: Number(e.target.value),
                          })
                        }
                        title="Load is divided by capacity. 0.5 is picked half as often; 2 twice as often."
                      >
                        {["0.5", "0.75", "1", "1.5", "2"].map((c) => (
                          <option key={c} value={c}>
                            {c}×
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5 font-mono">
                      {p.load}
                      {p.capacity !== 1 ? (
                        <span className="text-muted-foreground">
                          {" "}
                          → {p.effectiveLoad.toFixed(1)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {p.lastAssignedAt ? fmtDateTime(p.lastAssignedAt) : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      {p.rank ? (
                        <span
                          className={cn(
                            "rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
                            p.rank === 1 ? "bg-primary text-primary-foreground" : "bg-muted",
                          )}
                        >
                          {p.rank === 1 ? "Next" : `#${p.rank}`}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* The rules */}
        {rules ? (
          <Panel
            title="What makes a deal heavy"
            level="supporting"
            action={
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={saveM.isPending}
                onClick={() => saveM.mutate(rules)}
              >
                {saveM.isPending ? "Saving…" : "Save rules"}
              </button>
            }
          >
            <div className="grid gap-4 px-3 py-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="flex items-center justify-between gap-2 text-[12px]">
                  <span>Counting window (days)</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    className={cn(input, "w-20")}
                    value={rules.window_days}
                    onChange={(e) =>
                      setRules({ ...rules, window_days: Number(e.target.value) || 1 })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-[12px]">
                  <span>Every deal is at least</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    className={cn(input, "w-20")}
                    value={rules.base_points}
                    onChange={(e) =>
                      setRules({ ...rules, base_points: Number(e.target.value) || 0 })
                    }
                  />
                </label>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Integration tier → points
                </p>
                <div className="grid grid-cols-6 gap-1">
                  {["0", "1", "2", "3", "4", "5"].map((t) => (
                    <label key={t} className="text-[11px] text-muted-foreground">
                      T{t}
                      <input
                        type="number"
                        min={0}
                        max={20}
                        className={cn(input, "w-full")}
                        value={rules.integration_points[t] ?? 0}
                        onChange={(e) =>
                          setRules({
                            ...rules,
                            integration_points: {
                              ...rules.integration_points,
                              [t]: Number(e.target.value) || 0,
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <Bands
                  title="ARR bands"
                  unit="$"
                  bands={rules.arr_bands}
                  onChange={(b) => setRules({ ...rules, arr_bands: b })}
                />
                <Bands
                  title="Seat bands"
                  unit="seats"
                  bands={rules.seat_bands}
                  onChange={(b) => setRules({ ...rules, seat_bands: b })}
                />
                <p className="text-[11px] text-muted-foreground">
                  A deal gets the points of the highest band it reaches. Example: $90k, 120 seats,
                  tier 3 → {rules.base_points} base + ARR + seats + integration.
                </p>
              </div>
            </div>
          </Panel>
        ) : null}

        {/* The ledger */}
        <Panel title="Recent assignments" count={q.data?.recent.length ?? 0} level="supporting">
          {q.data?.recent.length ? (
            <ul className="divide-y divide-border">
              {q.data.recent.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-[12px]"
                >
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {fmtDateTime(a.createdAt)}
                  </span>
                  <Link
                    to="/deals/$dealId"
                    params={{ dealId: a.dealId }}
                    className="font-medium hover:underline"
                  >
                    {a.dealName ?? "Deal"}
                  </Link>
                  <span>→ {a.assigneeName ?? "—"}</span>
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    w{a.weight} · {describeBreakdown(a.breakdown)}
                  </span>
                  <span
                    className={cn(
                      "rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                      a.source === "auto"
                        ? "bg-primary/10 text-primary"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {a.source}
                  </span>
                  {a.note ? <span className="text-muted-foreground">{a.note}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-[12px] text-muted-foreground">
              Nothing assigned yet. The next closed-won deal will land here.
            </p>
          )}
        </Panel>
      </PageBody>
    </>
  );
}

function Bands({
  title,
  unit,
  bands,
  onChange,
}: {
  title: string;
  unit: string;
  bands: Array<{ min: number; points: number }>;
  onChange: (b: Array<{ min: number; points: number }>) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="space-y-1">
        {bands.map((b, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px]">
            <span className="w-8 text-muted-foreground">≥</span>
            <input
              type="number"
              min={0}
              className={cn(input, "w-28")}
              value={b.min}
              onChange={(e) => {
                const next = bands.slice();
                next[i] = { ...b, min: Number(e.target.value) || 0 };
                onChange(next);
              }}
            />
            <span className="text-muted-foreground">{unit} →</span>
            <input
              type="number"
              min={0}
              max={20}
              className={cn(input, "w-16")}
              value={b.points}
              onChange={(e) => {
                const next = bands.slice();
                next[i] = { ...b, points: Number(e.target.value) || 0 };
                onChange(next);
              }}
            />
            <span className="text-muted-foreground">pts</span>
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-destructive"
              onClick={() => onChange(bands.filter((_, j) => j !== i))}
            >
              remove
            </button>
          </div>
        ))}
        {bands.length < 8 ? (
          <button
            type="button"
            className="text-[11px] text-primary hover:underline"
            onClick={() => onChange([...bands, { min: 0, points: 1 }])}
          >
            + add a band
          </button>
        ) : null}
      </div>
    </div>
  );
}
