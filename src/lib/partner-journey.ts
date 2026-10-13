import {
  PARTNER_JOURNEY,
  type PartnerStageKey,
  type StageOwner,
  type StageVisibility,
  stageOwner,
} from "./partner-implementation";
import { isPreClose } from "./presale-stages";
import { railStatuses, type RailStatus, type StepperStage } from "./stage-flow";

/**
 * Progress for a Partner Implementation, read from the implementation's own
 * records. This is the one read model both views use:
 *   - Current Implementation: all seven stages, every work item, for the TIS.
 *   - Customer Dashboard: the five customer stages, the customer's own open
 *     actions, and recorded milestones only.
 * It stores nothing and decides nothing new: a stage's status comes from the
 * same railStatuses() rule the standard rail uses, and its dates come only from
 * recorded targets and completions.
 *
 * Pure: the rows are read by partner-journey.server.ts and passed in here, so
 * the same fixtures can be tested without a database.
 */

/** What the customer sees where no target or completion is recorded. */
export const TO_BE_CONFIRMED = "To be confirmed";

export type PartnerWorkItemRow = {
  id: string;
  stage_key: string | null;
  title: string;
  party: string;
  visibility: string;
  status: string;
  is_gate: boolean;
  due_at: string | null;
};

export type PartnerMilestoneRow = {
  name: string;
  stage: string | null;
  status: string;
  target_date: string | null;
  completed_date: string | null;
};

export type PartnerProgressInput = {
  /** implementations.current_stage. */
  currentStage: string | null;
  /** The deal's current stage (portal_accounts.stage). Past Closed Won, Pre-Sale & POC is done. */
  dealStage: string | null;
  /** The deal's own stage transitions (portal_stage_transitions). Source of Pre-Sale & POC's date. */
  dealTransitions: ReadonlyArray<{ to_stage: string; occurred_at: string }>;
  /** stage_instances for this implementation: a done stage is `status = 'done'`. */
  stageInstances: ReadonlyArray<{ stage_key: string; status: string; gate_mode: string | null }>;
  /** implementation_stage_history: an exited row is a recorded completion. */
  stageHistory: ReadonlyArray<{ stage: string; exited_at: string | null }>;
  /** milestones: a stage's recorded target, and its completion when completed. */
  milestones: ReadonlyArray<PartnerMilestoneRow>;
  /** work_items with their stage_key resolved from stage_instance_id. */
  workItems: ReadonlyArray<PartnerWorkItemRow & { stage_key: string | null }>;
};

/** A work item as the TIS sees it: every party, gate and status. */
export type PartnerWorkItem = {
  id: string;
  title: string;
  party: string;
  visibility: string;
  status: string;
  isGate: boolean;
  dueAt: string | null;
};

export type PartnerStageProgress = {
  key: PartnerStageKey;
  label: string;
  position: number;
  visibility: StageVisibility;
  owner: StageOwner;
  status: RailStatus;
  /** Before the current stage: the stepper's check mark. */
  passed: boolean;
  gateMode: string | null;
  hasRecords: boolean;
  /** The earliest recorded target for this stage, else null (To be confirmed). */
  targetDate: string | null;
  /** The recorded completion for a completed stage, else null (To be confirmed). */
  completedDate: string | null;
  /** Every work item on this stage, for the TIS. */
  items: PartnerWorkItem[];
  /** Customer-facing tasks only: customer party, shared, not skipped. */
  customerTasks: Array<{ id: string; title: string; done: boolean; blocked: boolean }>;
};

export type PartnerMilestone = {
  name: string;
  stage: PartnerStageKey | null;
  status: string;
  targetDate: string | null;
  completedDate: string | null;
};

export type PartnerProgress = {
  /** The stage the implementation is in, when it is a partner stage. */
  current: PartnerStageKey | null;
  currentLabel: string | null;
  /** All seven stages, in order. */
  stages: PartnerStageProgress[];
  milestones: PartnerMilestone[];
};

const PRE_SALE_KEY: PartnerStageKey = "pre_sale_poc";

function dateOnly(stamp: string | null | undefined): string | null {
  const date = stamp?.slice(0, 10) ?? null;
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function earliest(values: ReadonlyArray<string | null>): string | null {
  const present = values.filter((v): v is string => Boolean(v)).sort();
  return present[0] ?? null;
}

function latest(values: ReadonlyArray<string | null>): string | null {
  const present = values.filter((v): v is string => Boolean(v)).sort();
  return present[present.length - 1] ?? null;
}

function isPartnerStageKey(key: string | null): key is PartnerStageKey {
  return key !== null && PARTNER_JOURNEY.some((s) => s.key === key);
}

/**
 * The seven stages of a Partner Implementation, with each one's status, its
 * recorded dates and its work items.
 *
 * Pre-Sale & POC is done when the deal has reached Closed Won: its stage is
 * past the pre-close stages, or a Closed Won transition is recorded. Its date
 * is that recorded transition, else To be confirmed. Every other stage is done
 * when its stage instance is done, and its completion date is the stage's
 * recorded exit (falling back to its completed milestone). Nothing is estimated.
 */
export function partnerProgress(input: PartnerProgressInput): PartnerProgress {
  const closedWon = input.dealTransitions
    .filter((t) => t.to_stage === "closed_won")
    .map((t) => dateOnly(t.occurred_at));
  const reachedClosedWon =
    closedWon.some(Boolean) || (input.dealStage !== null && !isPreClose(input.dealStage));
  const doneKeys = new Set(
    input.stageInstances.filter((s) => s.status === "done").map((s) => s.stage_key),
  );
  const isDone = (key: PartnerStageKey) =>
    key === PRE_SALE_KEY ? reachedClosedWon : doneKeys.has(key);

  const current = isPartnerStageKey(input.currentStage) ? input.currentStage : null;

  const rail = railStatuses(
    PARTNER_JOURNEY.map((def) => ({
      key: def.key,
      done: isDone(def.key),
      tasks: input.workItems.filter((w) => w.stage_key === def.key),
    })),
    current,
  );
  const statusByKey = new Map(rail.map((r) => [r.key, r]));
  const currentPosition = current ? PARTNER_JOURNEY.find((s) => s.key === current)!.position : null;

  const stages: PartnerStageProgress[] = PARTNER_JOURNEY.map((def) => {
    const status = statusByKey.get(def.key)!;
    const milestones = input.milestones.filter((m) => m.stage === def.key);
    const exits = input.stageHistory
      .filter((h) => h.stage === def.key)
      .map((h) => dateOnly(h.exited_at));
    const completedMilestone = milestones
      .filter((m) => m.status === "completed")
      .map((m) => dateOnly(m.completed_date));
    const completedDate =
      status.status !== "completed"
        ? null
        : def.key === PRE_SALE_KEY
          ? earliest(closedWon)
          : (latest(exits) ?? latest(completedMilestone));
    const targetDate = earliest(milestones.map((m) => dateOnly(m.target_date)));
    const items = input.workItems
      .filter((w) => w.stage_key === def.key)
      .map((w) => ({
        id: w.id,
        title: w.title,
        party: w.party,
        visibility: w.visibility,
        status: w.status,
        isGate: w.is_gate,
        dueAt: w.due_at,
      }));
    const customerTasks = items
      .filter((w) => w.party === "customer" && w.visibility === "shared" && w.status !== "skipped")
      .map((w) => ({
        id: w.id,
        title: w.title,
        done: w.status === "done",
        blocked: w.status === "blocked",
      }));
    return {
      key: def.key,
      label: def.label,
      position: def.position,
      visibility: def.visibility,
      owner: stageOwner(def.key),
      status: status.status,
      passed: currentPosition !== null && def.position < currentPosition,
      gateMode: input.stageInstances.find((s) => s.stage_key === def.key)?.gate_mode ?? null,
      hasRecords: status.hasRecords,
      targetDate: def.key === PRE_SALE_KEY ? null : targetDate,
      completedDate,
      items,
      customerTasks,
    };
  });

  const milestones: PartnerMilestone[] = input.milestones.map((m) => ({
    name: m.name,
    stage: isPartnerStageKey(m.stage) ? m.stage : null,
    status: m.status,
    targetDate: dateOnly(m.target_date),
    completedDate: dateOnly(m.completed_date),
  }));

  return {
    current,
    currentLabel: current ? (PARTNER_JOURNEY.find((s) => s.key === current)?.label ?? null) : null,
    stages,
    milestones,
  };
}

/* ------------------------------------------------------------ Current Implementation */

/**
 * The seven partner stages, shaped for the existing stepper. Dates are the
 * recorded target (upcoming and current) or completion (done), each with
 * To be confirmed where nothing is recorded. Nothing is estimated.
 */
export function partnerStepperStages(progress: PartnerProgress): StepperStage[] {
  return progress.stages.map((s) => ({
    key: s.key,
    label: s.label,
    status: s.status,
    isCurrent: s.key === progress.current,
    passed: s.passed,
    date:
      s.status === "completed"
        ? { label: "Completed", text: s.completedDate ?? TO_BE_CONFIRMED }
        : s.status === "skipped"
          ? null
          : {
              label: s.status === "current" ? "Target" : "Planned",
              text: s.targetDate ?? TO_BE_CONFIRMED,
            },
  }));
}

/* ------------------------------------------------------------------ Customer Dashboard */

/**
 * The customer's five stages, from Partner Setup & Connection onward. A stage
 * the rail marks Skipped is left out, exactly as the standard journey leaves
 * out a genuinely skipped stage.
 */
export type CustomerPartnerStage = {
  key: PartnerStageKey;
  label: string;
  status: Exclude<RailStatus, "skipped">;
  targetDate: string | null;
  completedDate: string | null;
  customerTasks: Array<{ id: string; title: string; done: boolean; blocked: boolean }>;
};

export function customerPartnerStages(progress: PartnerProgress): CustomerPartnerStage[] {
  return progress.stages.flatMap((s) => {
    if (s.visibility !== "customer" || s.status === "skipped") return [];
    return [
      {
        key: s.key,
        label: s.label,
        status: s.status,
        targetDate: s.targetDate,
        completedDate: s.completedDate,
        customerTasks: s.customerTasks,
      },
    ];
  });
}

/** Shown on the customer's dashboard while the implementation is still in its internal planning stage. */
export const CUSTOMER_PLANNING_LABEL = "Planning with you";

/**
 * The customer's view of a partner implementation: what the dashboard shows,
 * from the same progress the TIS view reads. Only customer-party, shared
 * actions and recorded milestones are included; nothing internal reaches it.
 */
export type PartnerDashboardView = {
  /** The stage the customer is in: a customer stage's label, or the planning label. */
  currentLabel: string | null;
  /** Five stages, in order, with the bar's state for each. */
  stages: Array<{
    key: PartnerStageKey;
    label: string;
    state: "done" | "now" | "later";
    targetDate: string | null;
    completedDate: string | null;
  }>;
  /** Open customer actions on the current stage, in plan order. */
  actions: Array<{ id: string; title: string; blocked: boolean }>;
  /** Blocked customer actions, shown under progress and blockers. */
  blockers: Array<{ id: string; title: string }>;
  /** The earliest recorded milestone still ahead with a target date, else null. */
  nextMilestone: { name: string; date: string } | null;
  /** The recorded target for Roll Out & Graduation, else null. */
  graduationTarget: string | null;
};

export function partnerDashboardView(progress: PartnerProgress): PartnerDashboardView {
  const current = progress.current
    ? progress.stages.find((s) => s.key === progress.current)
    : undefined;
  // A blocked action is shown once, under blockers, as the standard dashboard does.
  const openActions = (current?.customerTasks ?? []).filter((t) => !t.done && !t.blocked);
  const pending = progress.milestones
    .filter((m) => m.status !== "completed" && m.completedDate === null && m.targetDate !== null)
    .sort((a, b) => a.targetDate!.localeCompare(b.targetDate!))[0];
  const graduation = progress.milestones.find(
    (m) => m.stage === "roll_out" && m.targetDate !== null,
  );
  return {
    currentLabel:
      progress.current && current?.visibility === "customer"
        ? current.label
        : progress.current
          ? CUSTOMER_PLANNING_LABEL
          : null,
    stages: customerPartnerStages(progress).map((s) => ({
      key: s.key,
      label: s.label,
      state: s.status === "completed" ? "done" : s.status === "current" ? "now" : "later",
      targetDate: s.targetDate,
      completedDate: s.completedDate,
    })),
    actions: openActions.map((t) => ({ id: t.id, title: t.title, blocked: t.blocked })),
    blockers: (current?.customerTasks ?? [])
      .filter((t) => t.blocked && !t.done)
      .map((t) => ({ id: t.id, title: t.title })),
    nextMilestone: pending ? { name: pending.name, date: pending.targetDate! } : null,
    graduationTarget: graduation?.targetDate ?? null,
  };
}

/* ------------------------------------------------------------ Implementation status */

/**
 * The status strip for a partner implementation, read from the current stage's
 * own work items. Gate items come first: they are what stands between the stage
 * and the next one. Nothing is inferred from the deal stage.
 */
export function partnerWorkspace(progress: PartnerProgress): {
  stageLabel: string;
  nextAction: string;
  waitingOn: string;
} {
  const current = progress.stages.find((s) => s.key === progress.current);
  const open = (current?.items ?? []).filter((i) => i.status !== "done" && i.status !== "skipped");
  const next = open.find((i) => i.isGate) ?? open[0] ?? null;
  return {
    stageLabel: progress.currentLabel ?? "Not started",
    nextAction: next ? next.title : "Nothing open",
    waitingOn: next
      ? open.length > 1
        ? `${next.title} (+${open.length - 1} more)`
        : next.title
      : "Nothing on anyone's desk",
  };
}
