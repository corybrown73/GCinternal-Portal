import { businessDaysBetween, type ServicePlan, type Timeline } from "./onboarding-timeline";
import { toolByKey, toolFromName } from "./onboarding-tools";
import type { ServiceSpec } from "./onboarding-services";

/**
 * How long things actually take, against how long we said.
 *
 * EVERY NUMBER IS ALREADY RECORDED. A plan gives each step a planned date;
 * a person marks the step done on a date. The difference, in business
 * days, is the slip. Roll that up by tool (QuickBooks Online, Power BI),
 * by kind (integration, custom PDF, form build), by path, and by step —
 * and the questions "what usually runs late" and "which step slips" have
 * answers from the record instead of from memory. Nothing is entered for
 * the analytics; the analytics read what the plan already keeps.
 *
 * Pure: hand it timelines, get tables. The server only loads.
 */

export type Outcome = {
  dealId: string;
  account: string;
  path: "new_logo" | "existing" | "dm_conversion" | "field_fusion";
  /** "phase1" for the form; else the service's kind. */
  kind: string;
  kindLabel: string;
  /** The tool key when it is a known system, else the service's own name. */
  tool: string;
  toolLabel: string;
  phase: number;
  /** Planned length, business days, first step to last. */
  plannedDays: number;
  /** Actual length once done, else null. */
  actualDays: number | null;
  /** Business days the last step landed after its planned date; null until done. */
  slipDays: number | null;
  /** In-flight: business days past the planned end as of today; 0 when not yet due. */
  overdueDays: number;
  status: "done" | "on_track" | "late" | "waiting";
  plannedEnd: string;
  doneOn: string | null;
  /** Per-step slip for the steps that are done. */
  steps: Array<{ key: string; label: string; slipDays: number }>;
};

export function outcomesFor(
  input: { dealId: string; account: string; timeline: Timeline; services: ServiceSpec[] },
  today: string,
): Outcome[] {
  const t = input.timeline;
  const out: Outcome[] = [];
  const live = t.milestones[t.milestones.length - 1]!;
  const first = t.milestones[0]!;

  // Phase 1: the form itself.
  out.push(
    outcome({
      dealId: input.dealId,
      account: input.account,
      path: t.path,
      kind: "phase1",
      kindLabel: t.path === "existing" ? "Form review" : "First form build",
      tool: t.path === "existing" ? "form_review" : "form_build",
      toolLabel:
        t.path === "existing" ? "Form review for the integration" : "First form (15 business days)",
      phase: 1,
      plannedStart: first.plannedDate,
      plannedEnd: live.plannedDate,
      actualStart: first.plannedDate,
      doneOn: live.doneOn,
      steps: t.milestones,
      today,
    }),
  );

  const specByKey = new Map(input.services.map((s) => [s.id, s]));
  const plans: ServicePlan[] = [...t.alongside, ...t.phases.flatMap((p) => p.services)];
  for (const p of plans) {
    const spec = specByKey.get(p.id);
    const tool =
      toolByKey(spec?.tool ?? null) ??
      (p.kind === "integration" || p.kind === "analytics" ? toolFromName(p.name) : null);
    const ms = p.milestones;
    out.push(
      outcome({
        dealId: input.dealId,
        account: input.account,
        path: t.path,
        kind: p.kind,
        kindLabel: p.label,
        tool: tool?.key ?? `name:${p.name.trim().toLowerCase()}`,
        toolLabel: tool?.name ?? p.name,
        phase: p.phase,
        plannedStart: ms[0]!.plannedDate,
        plannedEnd: ms[ms.length - 1]!.plannedDate,
        actualStart: ms[0]!.doneOn ?? ms[0]!.plannedDate,
        doneOn: p.doneOn,
        steps: ms,
        today,
      }),
    );
  }
  return out;
}

function outcome(a: {
  dealId: string;
  account: string;
  path: "new_logo" | "existing" | "dm_conversion" | "field_fusion";
  kind: string;
  kindLabel: string;
  tool: string;
  toolLabel: string;
  phase: number;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string;
  doneOn: string | null;
  steps: ReadonlyArray<{ key: string; label: string; plannedDate: string; doneOn: string | null }>;
  today: string;
}): Outcome {
  const plannedDays = businessDaysBetween(a.plannedStart, a.plannedEnd);
  const actualDays = a.doneOn ? businessDaysBetween(a.actualStart, a.doneOn) : null;
  const slipDays = a.doneOn ? businessDaysBetween(a.plannedEnd, a.doneOn) : null;
  const overdueDays = a.doneOn ? 0 : Math.max(0, businessDaysBetween(a.plannedEnd, a.today));
  const started = a.today >= a.plannedStart || a.steps.some((s) => s.doneOn);
  const status: Outcome["status"] = a.doneOn
    ? "done"
    : !started
      ? "waiting"
      : overdueDays > 0
        ? "late"
        : "on_track";
  return {
    dealId: a.dealId,
    account: a.account,
    path: a.path,
    kind: a.kind,
    kindLabel: a.kindLabel,
    tool: a.tool,
    toolLabel: a.toolLabel,
    phase: a.phase,
    plannedDays,
    actualDays,
    slipDays,
    overdueDays,
    status,
    plannedEnd: a.plannedEnd,
    doneOn: a.doneOn,
    steps: a.steps
      .filter((s) => s.doneOn)
      .map((s) => ({
        key: s.key,
        label: s.label,
        slipDays: businessDaysBetween(s.plannedDate, s.doneOn!),
      })),
  };
}

export type Rollup = {
  key: string;
  label: string;
  count: number;
  done: number;
  inFlight: number;
  late: number;
  avgPlannedDays: number | null;
  avgActualDays: number | null;
  avgSlipDays: number | null;
  /** Of the done ones, the share that landed on or before the planned end. */
  onTimePct: number | null;
  /** The step that slips most on average, when any step has slipped. */
  worstStep: { label: string; avgSlipDays: number } | null;
};

export function rollup(
  rows: Outcome[],
  by: (o: Outcome) => { key: string; label: string },
): Rollup[] {
  const groups = new Map<string, { label: string; rows: Outcome[] }>();
  for (const r of rows) {
    const g = by(r);
    const cur = groups.get(g.key) ?? { label: g.label, rows: [] };
    cur.rows.push(r);
    groups.set(g.key, cur);
  }
  const avg = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
  return [...groups.entries()]
    .map(([key, g]) => {
      const done = g.rows.filter((r) => r.status === "done");
      const stepSlips = new Map<string, number[]>();
      for (const r of g.rows)
        for (const s of r.steps)
          stepSlips.set(s.label, [...(stepSlips.get(s.label) ?? []), s.slipDays]);
      let worstStep: Rollup["worstStep"] = null;
      for (const [label, xs] of stepSlips) {
        const a = avg(xs)!;
        if (a > 0 && (!worstStep || a > worstStep.avgSlipDays))
          worstStep = { label, avgSlipDays: a };
      }
      return {
        key,
        label: g.label,
        count: g.rows.length,
        done: done.length,
        inFlight: g.rows.filter((r) => r.status === "on_track" || r.status === "late").length,
        late: g.rows.filter(
          (r) => r.status === "late" || (r.status === "done" && (r.slipDays ?? 0) > 0),
        ).length,
        avgPlannedDays: avg(g.rows.map((r) => r.plannedDays)),
        avgActualDays: avg(done.map((r) => r.actualDays!)),
        avgSlipDays: avg(done.map((r) => r.slipDays!)),
        onTimePct: done.length
          ? Math.round((done.filter((r) => (r.slipDays ?? 0) <= 0).length / done.length) * 100)
          : null,
        worstStep,
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export const byTool = (o: Outcome) => ({ key: o.tool, label: o.toolLabel });
export const byKind = (o: Outcome) => ({ key: o.kind, label: o.kindLabel });
export const byPath = (o: Outcome) => ({
  key: o.path,
  label:
    o.path === "existing"
      ? "Existing account · services"
      : o.path === "dm_conversion"
        ? "Device Magic conversion"
        : o.path === "field_fusion"
          ? "Field Fusion · training"
          : "New customer · implementation",
});

/** Steps across everything, ranked by average slip. The answer to "where do we lose days". */
export function stepSlips(
  rows: Outcome[],
): Array<{ label: string; kindLabel: string; n: number; avgSlipDays: number }> {
  const m = new Map<string, { label: string; kindLabel: string; xs: number[] }>();
  for (const r of rows)
    for (const s of r.steps) {
      const k = `${r.kind}:${s.label}`;
      const cur = m.get(k) ?? { label: s.label, kindLabel: r.kindLabel, xs: [] };
      cur.xs.push(s.slipDays);
      m.set(k, cur);
    }
  return [...m.values()]
    .map((g) => ({
      label: g.label,
      kindLabel: g.kindLabel,
      n: g.xs.length,
      avgSlipDays: Math.round((g.xs.reduce((a, b) => a + b, 0) / g.xs.length) * 10) / 10,
    }))
    .filter((g) => g.n >= 1)
    .sort((a, b) => b.avgSlipDays - a.avgSlipDays);
}
