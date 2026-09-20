import { markForService, KIND_MARKS, type BrandMark } from "./brand-marks";
import type { IntakeAnswers } from "./intake-answers";
import type { ServiceKind } from "./onboarding-services";
import type { Timeline } from "./onboarding-timeline";
import type { ServiceSpec } from "./onboarding-services";

/**
 * What we are building for this customer, as a checklist of things.
 *
 * One entry per deliverable: the first form, then every service the SOW
 * bought, each with the mark for what it is and where it stands. Same
 * inputs as the plan, so the strip and the plan never disagree about
 * whether the QuickBooks integration is done.
 */
export type DeliverableState = "done" | "active" | "upcoming";

export type Deliverable = {
  id: string;
  kind: ServiceKind | "form";
  label: string;
  /** "Phase 1 · alongside the form", "Phase 2", "Live Sep 29". */
  sublabel: string;
  phase: number;
  state: DeliverableState;
  mark: BrandMark;
};

function shortDay(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function deliverablesFor(intake: IntakeAnswers, t: Timeline): Deliverable[] {
  const out: Deliverable[] = [];
  const existing = intake.path === "existing";

  const formName =
    intake.wanted_forms[0]?.name ??
    intake.uploaded_forms[0]?.name ??
    (existing ? "Form review" : "First form");
  out.push({
    id: "form",
    kind: "form",
    label: formName,
    sublabel: t.liveDoneOn
      ? `${existing ? "Ready" : "Live"} ${shortDay(t.liveDoneOn)}`
      : `Phase 1 · ${existing ? "ready" : "live"} ${shortDay(t.liveDate)}`,
    phase: 1,
    state: t.liveDoneOn ? "done" : t.currentPhase === 1 ? "active" : "upcoming",
    mark: KIND_MARKS.form,
  });

  for (const f of intake.wanted_forms.slice(1)) {
    out.push({
      id: `form:${f.name}`,
      kind: "form",
      label: f.name,
      sublabel: "After the first form",
      phase: 2,
      state: "upcoming",
      mark: KIND_MARKS.form,
    });
  }

  const services = [
    ...t.alongside.map((s) => ({ s, phase: 1 })),
    ...t.phases.flatMap((ph) => ph.services.map((s) => ({ s, phase: ph.phase }))),
  ];
  for (const { s, phase } of services) {
    const state: DeliverableState = s.doneOn
      ? "done"
      : !t.allDone && phase === t.currentPhase
        ? "active"
        : "upcoming";
    out.push({
      id: s.id,
      kind: s.kind,
      label: s.name || s.label,
      sublabel: s.doneOn
        ? `Live ${shortDay(s.doneOn)}`
        : phase === 1
          ? "Phase 1 · alongside the form"
          : `Phase ${phase} · ${shortDay(s.startsOn)} → ${shortDay(s.endsOn)}`,
      phase,
      state,
      mark: markForService({ kind: s.kind, name: s.name, tool: toolKeyOf(s) }),
    });
  }
  return out;
}

function toolKeyOf(s: { id: string }): string | null {
  // ServicePlan carries no tool key; the intake's ServiceSpec does. The name
  // resolves the brand either way, so this only matters for a renamed service.
  return (s as { tool?: string | null }).tool ?? null;
}

/**
 * The marks alone, from the intake, for a card with no room for states —
 * the pipeline board. First form, then every service, deduped by mark.
 */
export function marksForIntake(intake: IntakeAnswers): BrandMark[] {
  const hasForm = intake.wanted_forms.length > 0 || intake.uploaded_forms.length > 0;
  const marks: BrandMark[] = hasForm ? [KIND_MARKS.form] : [];
  for (const s of (intake.timeline.services ?? []) as ServiceSpec[]) {
    marks.push(markForService({ kind: s.kind, name: s.name, tool: s.tool ?? null }));
  }
  const seen = new Set<string>();
  return marks.filter((m) => {
    const key = `${m.kind}:${m.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** One phase of the build: its state, its dates, and what is in it. */
export type DeliverablePhase = {
  phase: number;
  label: string;
  state: DeliverableState;
  /** "Sep 9 → Sep 18", "Live Sep 18", "Earliest Sep 21 → Oct 5". For a tooltip; the plan has the detail. */
  when: string;
  /** What opens it, for a phase that has not opened. */
  gate: string | null;
  items: Deliverable[];
};

/**
 * The build as phases, left to right: the form first, then what waits on
 * it. Each item inside is a mark and a name; the dates live on the plan
 * below, where somebody reading for the full picture scrolls anyway.
 */
export function deliverablePhases(intake: IntakeAnswers, t: Timeline): DeliverablePhase[] {
  const items = deliverablesFor(intake, t);
  const byPhase = new Map<number, Deliverable[]>();
  for (const d of items) byPhase.set(d.phase, [...(byPhase.get(d.phase) ?? []), d]);
  const existing = intake.path === "existing";

  const out: DeliverablePhase[] = [];
  out.push({
    phase: 1,
    label: "Phase 1",
    state: t.liveDoneOn ? "done" : t.currentPhase === 1 ? "active" : "upcoming",
    when: t.liveDoneOn
      ? `${existing ? "Ready" : "Live"} ${shortDay(t.liveDoneOn)}`
      : `${shortDay(t.closeDate)} → ${shortDay(t.liveDate)}`,
    gate: null,
    items: byPhase.get(1) ?? [],
  });
  const known = new Set([1, ...t.phases.map((p) => p.phase)]);
  for (const ph of t.phases) {
    out.push({
      phase: ph.phase,
      label: ph.label.replace(/\s*·.*$/, ""),
      state: ph.done ? "done" : t.currentPhase === ph.phase ? "active" : "upcoming",
      when: ph.done
        ? `Live ${shortDay(ph.endsOn!)}`
        : `${ph.tentative ? "Earliest " : ""}${shortDay(ph.startsOn!)} → ${shortDay(ph.endsOn!)}`,
      gate: ph.tentative ? ph.gate : null,
      items: byPhase.get(ph.phase) ?? [],
    });
  }
  // Later forms with no service phase of their own: after the first form.
  for (const [phase, list] of byPhase) {
    if (known.has(phase)) continue;
    out.push({
      phase,
      label: `Phase ${phase}`,
      state: "upcoming",
      when: "After the first form",
      gate: null,
      items: list,
    });
  }
  return out.sort((a, b) => a.phase - b.phase);
}
