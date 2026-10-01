import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Star } from "lucide-react";

import { ask } from "@/components/ui/ask";
import { canManage, useProfile } from "@/lib/auth";
import type { DealData } from "@/lib/deal-query";
import { getTeamOptions } from "@/lib/hub.functions";
import { readIntake } from "@/lib/intake-answers";
import {
  BALL_LABEL,
  isSolutionKind,
  normalizeServices,
  SOLUTION_LABEL,
  SOLUTION_STATUS_LABEL,
  SOLUTION_STEPS,
  solutionBall,
  solutionStatus,
  type ServiceSpec,
} from "@/lib/onboarding-services";
import { shortDay } from "@/lib/onboarding-timeline";
import { setSolutionDisposition, updateSolution } from "@/lib/presale.functions";
import { cn } from "@/lib/utils";

const inputClass =
  "h-7 rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60";

/**
 * THE PURCHASED SOLUTIONS, one row each: what it is, who owns it, where it
 * is (Define → Build → Accept → Accepted), whether it must be ready before
 * go-live, who has the ball, how it will be accepted, and how it ended.
 * The steps themselves are ticked on the plan; this is where the decisions
 * live. A customer's own first form is not a solution and is not here.
 */
export function SolutionsCard({ deal, editable }: { deal: DealData; editable: boolean }) {
  const intake = readIntake(deal.account.intake);
  const services = normalizeServices(
    intake.timeline.services as ServiceSpec[],
    intake.timeline,
  ).filter((s) => isSolutionKind(s.kind));
  const team = useQuery({ queryKey: ["team-options"], queryFn: () => getTeamOptions() });
  if (!services.length) return null;
  const completed = intake.timeline.completed;
  const open = services.filter(
    (s) => !s.disposition && solutionStatus(s, completed) !== "accepted",
  );
  return (
    <section className="rounded-lg border border-border bg-card" aria-label="Purchased solutions">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3.5">
        <h2 className="text-[15px] font-semibold">
          Purchased solutions{" "}
          <span className="text-[12px] font-normal text-muted-foreground">
            · {services.length} · {open.length} open
          </span>
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Launch-critical ones must be Accepted before Operational Go-Live.
        </p>
      </div>
      <ul className="mt-2 divide-y divide-border">
        {services.map((s) => (
          <SolutionRow
            key={s.id}
            deal={deal}
            s={s}
            completed={completed}
            team={team.data ?? []}
            editable={editable}
          />
        ))}
      </ul>
    </section>
  );
}

function SolutionRow({
  deal,
  s,
  completed,
  team,
  editable,
}: {
  deal: DealData;
  s: ServiceSpec;
  completed: Record<string, string>;
  team: Array<{ id: string; name: string; role: string }>;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const { profile } = useProfile();
  const update = useServerFn(updateSolution);
  const dispose = useServerFn(setSolutionDisposition);
  const [acceptance, setAcceptance] = useState(s.acceptance ?? "");
  const done = () => void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] });
  const m = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      update({ data: { dealId: deal.account.id, id: s.id, patch } as never }),
    onSuccess: done,
  });
  const d = useMutation({
    mutationFn: (
      disposition: { kind: "accepted" | "descoped" | "transferred"; reason: string | null } | null,
    ) => dispose({ data: { dealId: deal.account.id, id: s.id, disposition } }),
    onSuccess: done,
  });
  const status = solutionStatus(s, completed);
  const ownerName = team.find((t) => t.id === s.owner_id)?.name ?? null;
  const ball = solutionBall(s, completed, ownerName);
  const ended = Boolean(s.disposition) || status === "accepted";
  const busy = m.isPending || d.isPending;
  const err = (m.error ?? d.error) as Error | null;
  const stepDone = (key: string) => Boolean(completed[`${s.id}:${key}`]);
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm border border-border px-1.5 py-px text-[10px] uppercase tracking-wider text-muted-foreground">
          {SOLUTION_LABEL[s.kind]}
        </span>
        <span className="text-[13px] font-medium">{s.name}</span>
        <button
          type="button"
          title={
            s.launch_critical
              ? "Launch-critical: must be Accepted before Operational Go-Live"
              : "Not launch-critical: can finish after go-live"
          }
          disabled={!editable || busy || ended}
          onClick={() => m.mutate({ launch_critical: !s.launch_critical })}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm px-1.5 py-px text-[11px]",
            s.launch_critical
              ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          <Star className="h-3 w-3" fill={s.launch_critical ? "currentColor" : "none"} />
          {s.launch_critical ? "Launch-critical" : "Not launch-critical"}
        </button>
        <span
          className={cn(
            "ml-auto rounded-sm px-1.5 py-px text-[11px] font-medium",
            status === "accepted"
              ? "bg-status-ontrack text-status-ontrack-foreground"
              : status === "descoped" || status === "transferred"
                ? "bg-muted text-muted-foreground"
                : "bg-primary/10 text-primary",
          )}
        >
          {SOLUTION_STATUS_LABEL[status]}
        </span>
      </div>
      {/* The steps, as the model names them; ticked on the plan. */}
      <ol className="flex flex-wrap items-center gap-1 text-[11px]">
        {SOLUTION_STEPS.map((st, i) => {
          const on = stepDone(st.key) || status === "accepted";
          return (
            <li key={st.key} className="flex items-center gap-1">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-px",
                  on
                    ? "border-status-ontrack-foreground/40 bg-status-ontrack/60 text-status-ontrack-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {on ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
                {st.label}
              </span>
              {i < SOLUTION_STEPS.length - 1 ? (
                <span className="text-muted-foreground">→</span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div className="grid gap-2 text-[12px] sm:grid-cols-3">
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Owner
          </span>
          <select
            className={cn(inputClass, "mt-0.5 w-full")}
            value={s.owner_id ?? ""}
            disabled={!editable || busy}
            onChange={(e) => m.mutate({ owner_id: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Customer's date
          </span>
          <input
            type="date"
            className={cn(inputClass, "mt-0.5 w-full")}
            value={s.due ?? ""}
            disabled={!editable || busy}
            onChange={(e) => m.mutate({ due: e.target.value || null })}
          />
        </label>
        <div className="block">
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Who has the ball
          </span>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {ball ? (
              <span
                className={cn(
                  "rounded-sm px-1.5 py-px text-[11px] font-medium",
                  ball.who.startsWith("blocked")
                    ? "bg-status-blocked text-status-blocked-foreground"
                    : ball.who === "customer"
                      ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                      : "bg-muted text-foreground",
                )}
              >
                {BALL_LABEL[ball.who]}
                {ball.person ? ` · ${ball.person}` : ""}
                {ball.date ? ` · by ${shortDay(ball.date)}` : ""}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">—</span>
            )}
            {editable && !ended ? (
              <select
                className={inputClass}
                value={s.ball?.who ?? ""}
                disabled={busy}
                onChange={(e) =>
                  m.mutate({
                    ball: e.target.value
                      ? {
                          who: e.target.value,
                          person: ball?.person ?? null,
                          date: ball?.date ?? null,
                          note: null,
                        }
                      : null,
                  })
                }
                title="Set by hand, or leave it to follow the steps"
              >
                <option value="">Follows the steps</option>
                {(Object.keys(BALL_LABEL) as Array<keyof typeof BALL_LABEL>).map((k) => (
                  <option key={k} value={k}>
                    {BALL_LABEL[k]}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      </div>
      <label className="block text-[12px]">
        <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          How it is accepted
        </span>
        <input
          className={cn(inputClass, "mt-0.5 w-full")}
          value={acceptance}
          placeholder="One sentence from the SOW: end-to-end submission on real data; test records sync…"
          disabled={!editable || busy}
          onChange={(e) => setAcceptance(e.target.value)}
          onBlur={() => {
            if (acceptance.trim() !== (s.acceptance ?? ""))
              m.mutate({ acceptance: acceptance.trim() || null });
          }}
        />
      </label>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <label className="inline-flex items-center gap-1 text-muted-foreground">
          <input
            type="checkbox"
            checked={Boolean(s.feasibility_needed)}
            disabled={!editable || busy || ended}
            onChange={(e) => m.mutate({ feasibility_needed: e.target.checked })}
          />
          Not sure it can be done (Feasibility first)
        </label>
        <label className="inline-flex items-center gap-1 text-muted-foreground">
          <input
            type="checkbox"
            checked={Boolean(s.modifies_production)}
            disabled={!editable || busy || ended}
            onChange={(e) => m.mutate({ modifies_production: e.target.checked })}
          />
          Changes something already live
        </label>
        <span className="ml-auto flex flex-wrap items-center gap-1">
          {s.disposition ? (
            <>
              <span className="text-muted-foreground">
                {SOLUTION_STATUS_LABEL[s.disposition.kind]}
                {s.disposition.reason ? ` — ${s.disposition.reason}` : ""}
              </span>
              {editable ? (
                <button
                  type="button"
                  className="rounded-sm border border-border px-2 py-0.5 hover:bg-muted"
                  disabled={busy}
                  onClick={() => d.mutate(null)}
                >
                  Reopen
                </button>
              ) : null}
            </>
          ) : editable ? (
            <>
              {status !== "accepted" ? (
                <button
                  type="button"
                  className="rounded-sm bg-primary px-2 py-0.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  disabled={busy}
                  title="It meets the agreed acceptance and we can show it"
                  onClick={async () => {
                    const why = await ask({
                      title: `Accept ${s.name}?`,
                      body: s.acceptance?.trim()
                        ? `Acceptance: ${s.acceptance.trim()}`
                        : "It meets the agreed acceptance, and we can show it.",
                      confirmLabel: "Accepted",
                      prompt: { label: "Evidence (optional)", required: false },
                    });
                    if (why === false || why === null) return;
                    d.mutate({
                      kind: "accepted",
                      reason: typeof why === "string" && why.trim() ? why.trim() : null,
                    });
                  }}
                >
                  Accepted
                </button>
              ) : null}
              <DecisionButton
                label="Descope"
                allowed={canManage(profile?.role) || profile?.id === deal.account.am_owner_id}
                busy={busy}
                onDecide={(reason) => d.mutate({ kind: "descoped", reason })}
                title={`Descope ${s.name}?`}
                body="Removed from scope, with the customer and the AM; a change order if money is involved."
              />
              <DecisionButton
                label="Transfer"
                allowed={canManage(profile?.role) || profile?.id === deal.account.am_owner_id}
                busy={busy}
                onDecide={(reason) => d.mutate({ kind: "transferred", reason })}
                title={`Transfer ${s.name}?`}
                body="Handed to another team, who now own it. Say who."
              />
            </>
          ) : null}
        </span>
      </div>
      {err ? <p className="text-[11px] text-destructive">{err.message}</p> : null}
    </li>
  );
}

/** Descoped and Transferred are the AM's or a manager's call: the button says so to everyone else. */
function DecisionButton({
  label,
  allowed,
  busy,
  onDecide,
  title,
  body,
}: {
  label: string;
  allowed: boolean;
  busy: boolean;
  onDecide: (reason: string) => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      className="rounded-sm border border-border px-2 py-0.5 hover:bg-muted disabled:opacity-50"
      disabled={busy || !allowed}
      title={allowed ? body : "The AM's or a manager's call — ask them"}
      onClick={async () => {
        const why = await ask({
          title,
          body,
          confirmLabel: label,
          destructive: true,
          prompt: { label: "Why", required: true },
        });
        if (typeof why === "string" && why.trim()) onDecide(why.trim());
      }}
    >
      {label}
    </button>
  );
}
