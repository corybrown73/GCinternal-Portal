import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Panel } from "@/components/record";
import { getOnboardingPlans, setOnboardingPlans } from "@/lib/onboarding-plans.functions";
import { planProblems } from "@/lib/onboarding-plans";
import {
  applyPlanOverrides,
  basePlanFor,
  PLAN_KEY_LABEL,
  PLAN_KEYS,
  withPlanOverrides,
  type MilestoneOverride,
  type PlanKey,
  type PlanOverrides,
} from "@/lib/onboarding-timeline";
import { cn } from "@/lib/utils";

/**
 * The onboarding plans, as written, with room to move a day.
 *
 * The plans are the team's standard and live in code — three core meetings,
 * Functional on business day 15. This panel is for the odd case: a step
 * that needs a different day, a call that runs longer, a label the team
 * says differently. Every deal of that type follows a change here; a date a
 * person moved on one deal's plan still wins over it.
 */

const input =
  "h-7 rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground disabled:opacity-50";

export function OnboardingPlansPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["onboarding-plans"], queryFn: () => getOnboardingPlans() });
  const save = useServerFn(setOnboardingPlans);
  const [key, setKey] = useState<PlanKey>("new_logo");
  const [draft, setDraft] = useState<PlanOverrides | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plans: PlanOverrides = draft ?? q.data ?? {};
  const base = basePlanFor(key);
  const overrides = plans[key] ?? {};
  const effective = withPlanOverrides(base, overrides);
  const problems = planProblems({ [key]: overrides });
  const dirty = draft !== null;

  const edit = (mKey: string, patch: Partial<MilestoneOverride>) => {
    setError(null);
    setDraft((d) => {
      const cur = d ?? q.data ?? {};
      const plan: Record<string, MilestoneOverride> = { ...(cur[key] ?? {}) };
      const row: MilestoneOverride = { ...(plan[mKey] ?? {}), ...patch };
      // An emptied field is the default again, not a stored blank.
      for (const k of Object.keys(row) as Array<keyof MilestoneOverride>) {
        if (row[k] === undefined) delete row[k];
      }
      if (Object.keys(row).length) plan[mKey] = row;
      else delete plan[mKey];
      const next: PlanOverrides = { ...cur };
      if (Object.keys(plan).length) next[key] = plan;
      else delete next[key];
      return next;
    });
  };
  const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v));

  const m = useMutation({
    mutationFn: () => save({ data: { plans } }),
    onSuccess: (saved) => {
      applyPlanOverrides(saved);
      setDraft(null);
      void qc.invalidateQueries();
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <Panel
      title="Onboarding plans"
      meta="The plans as written, in business days from the close. Change a day here only for the odd case — every deal of that type follows."
    >
      <div className="space-y-3 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={cn(input, "h-8")}
            value={key}
            onChange={(e) => setKey(e.target.value as PlanKey)}
          >
            {PLAN_KEYS.map((k) => (
              <option key={k} value={k}>
                {PLAN_KEY_LABEL[k]}
                {plans[k] && Object.keys(plans[k]!).length ? " · changed" : ""}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-muted-foreground">
            Ends on business day {effective[effective.length - 1]?.day} ·{" "}
            {effective.filter((x) => x.kind === "call").length} calls
          </span>
        </div>
        <table className="w-full text-[12px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 font-medium">Step</th>
              <th className="py-1 pr-2 font-medium">Day</th>
              <th className="py-1 pr-2 font-medium">Through</th>
              <th className="py-1 pr-2 font-medium">Minutes</th>
              <th className="py-1 font-medium">Label</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {base.map((step) => {
              const o = overrides[step.key] ?? {};
              const spans = step.throughDay !== undefined || step.kind === "build";
              return (
                <tr key={step.key}>
                  <td className="py-1.5 pr-2 align-top">
                    <span className="font-medium">{step.label}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {step.kind} · default day {step.day}
                      {step.throughDay !== undefined ? `–${step.throughDay}` : ""}
                      {step.minutes ? ` · ${step.minutes} min` : ""}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 align-top">
                    <input
                      type="number"
                      min={0}
                      max={90}
                      className={cn(input, "w-16")}
                      placeholder={String(step.day)}
                      value={o.day ?? ""}
                      disabled={step.key === "close"}
                      onChange={(e) => edit(step.key, { day: num(e.target.value) })}
                    />
                  </td>
                  <td className="py-1.5 pr-2 align-top">
                    {spans ? (
                      <input
                        type="number"
                        min={0}
                        max={120}
                        className={cn(input, "w-16")}
                        placeholder={step.throughDay !== undefined ? String(step.throughDay) : "—"}
                        value={o.throughDay ?? ""}
                        onChange={(e) => edit(step.key, { throughDay: num(e.target.value) })}
                      />
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-2 align-top">
                    {step.kind === "call" ? (
                      <input
                        type="number"
                        min={15}
                        max={240}
                        step={15}
                        className={cn(input, "w-16")}
                        placeholder={String(step.minutes ?? 60)}
                        value={o.minutes ?? ""}
                        onChange={(e) => edit(step.key, { minutes: num(e.target.value) })}
                      />
                    ) : null}
                  </td>
                  <td className="py-1.5 align-top">
                    <input
                      className={cn(input, "w-full")}
                      placeholder={step.label}
                      value={o.label ?? ""}
                      onChange={(e) =>
                        edit(step.key, {
                          label: e.target.value === "" ? undefined : e.target.value,
                        })
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {problems.length ? (
          <ul className="space-y-0.5 text-[12px] text-amber-800 dark:text-amber-300">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={!dirty || m.isPending || problems.length > 0}
            onClick={() => m.mutate()}
          >
            {m.isPending ? "Saving…" : "Save the plans"}
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-sm border border-border px-3 text-[12px] hover:bg-muted disabled:opacity-50"
            disabled={!(plans[key] && Object.keys(plans[key]!).length) || m.isPending}
            onClick={() => {
              setError(null);
              setDraft((d) => {
                const next: PlanOverrides = { ...(d ?? q.data ?? {}) };
                delete next[key];
                return next;
              });
            }}
          >
            Back to the plan as written
          </button>
          {dirty ? (
            <button
              type="button"
              className="text-[12px] text-muted-foreground hover:underline"
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              Discard changes
            </button>
          ) : null}
          {error ? <p className="w-full text-[12px] text-destructive">{error}</p> : null}
        </div>
      </div>
    </Panel>
  );
}
