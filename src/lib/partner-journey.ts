import {
  PARTNER_JOURNEY,
  type PartnerStageKey,
  type StageOwner,
  type StageVisibility,
  stageOwner,
} from "./partner-implementation";
import { isPreClose } from "./presale-stages";
import { railStatuses, type RailStatus } from "./stage-flow";

/**
 * Progress for a Partner Implementation, read from the implementation's own
 * records. This is the one read model both views use: Current Implementation
 * (all seven stages, internal) and the Customer Dashboard (the five customer
 * stages). It stores nothing and decides nothing new: a stage's status comes
 * from the same railStatuses() rule the standard rail uses, and its dates
 * come only from recorded targets and completions.
 *
 * Pure: the rows are read by partner-journey.server.ts and passed in here, so
 * the same fixtures can be tested without a database.
 */

/** What the customer sees where no target or completion is recorded. */
export const TO_BE_CONFIRMED = "To be confirmed";

export type PartnerProgressInput = {
  /** implementations.current_stage. */
  currentStage: string | null;
  /** The deal's current stage (portal_accounts.stage). Past Closed Won, Pre-Sale & POC is done. */
  dealStage: string | null;
  /** The deal's own stage transitions (portal_stage_transitions). Source of Pre-Sale & POC's date. */
  dealTransitions: ReadonlyArray<{ to_stage: string; occurred_at: string }>;
  /** stage_instances for this implementation: a done stage is `status = 'done'`. */
  stageInstances: ReadonlyArray<{ stage_key: string; status: string }>;
  /** implementation_stage_history: an exited row is a recorded completion. */
  stageHistory: ReadonlyArray<{ stage: string; exited_at: string | null }>;
  /** milestones: a stage's recorded target, and its completion when completed. */
  milestones: ReadonlyArray<{
    stage: string | null;
    status: string;
    target_date: string | null;
    completed_date: string | null;
  }>;
  /**
   * work_items with their stage_key resolved from stage_instance_id. Only
   * customer-party, shared items are ever shown to the customer.
   */
  workItems: ReadonlyArray<{
    stage_key: string | null;
    title: string;
    party: string;
    visibility: string;
    status: string;
  }>;
};

export type PartnerStageProgress = {
  key: PartnerStageKey;
  label: string;
  position: number;
  visibility: StageVisibility;
  owner: StageOwner;
  status: RailStatus;
  hasRecords: boolean;
  /** The earliest recorded target for this stage, else null (To be confirmed). */
  targetDate: string | null;
  /** The recorded completion for a completed stage, else null (To be confirmed). */
  completedDate: string | null;
  /** Customer-facing tasks only: customer party, shared, not skipped. */
  customerTasks: Array<{ title: string; done: boolean }>;
};

export type PartnerProgress = {
  /** The stage the implementation is in, when it is a partner stage. */
  current: PartnerStageKey | null;
  currentLabel: string | null;
  /** All seven stages, in order. */
  stages: PartnerStageProgress[];
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
 * recorded dates and its customer-facing tasks.
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
    const customerTasks = input.workItems
      .filter(
        (w) =>
          w.stage_key === def.key &&
          w.party === "customer" &&
          w.visibility === "shared" &&
          w.status !== "skipped",
      )
      .map((w) => ({ title: w.title, done: w.status === "done" }));
    return {
      key: def.key,
      label: def.label,
      position: def.position,
      visibility: def.visibility,
      owner: stageOwner(def.key),
      status: status.status,
      hasRecords: status.hasRecords,
      targetDate: def.key === PRE_SALE_KEY ? null : targetDate,
      completedDate,
      customerTasks,
    };
  });

  return {
    current,
    currentLabel: current ? (PARTNER_JOURNEY.find((s) => s.key === current)?.label ?? null) : null,
    stages,
  };
}

export type CustomerPartnerStage = {
  key: PartnerStageKey;
  label: string;
  status: Exclude<RailStatus, "skipped">;
  targetDate: string | null;
  completedDate: string | null;
  customerTasks: Array<{ title: string; done: boolean }>;
};

/**
 * The customer's five stages, from Partner Setup & Connection onward. A stage
 * the rail marks Skipped is left out, exactly as the standard journey leaves
 * out a genuinely skipped stage.
 */
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
