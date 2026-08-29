/**
 * Stage segments — the one place Phase 6 turns recorded history into observations.
 *
 * `implementation_stage_history` is the AUTHORITY on stage transitions
 * (`hub.server.ts` says so where it syncs the mirror). `stage_instances` is a
 * read cache: migration 0015 created a row for every implementation and stamped
 * `provenance` because most of those rows were not observed —
 * `backfill_inferred` deduced the state from stage ORDER alone, and even
 * `backfill_observed` collapsed a re-entered stage into one
 * min(entered_at)..max(exited_at) span that swallows the time spent elsewhere.
 *
 * So this module does not "filter out inferred rows". It cannot see instance
 * rows at all: it accepts history rows and nothing else, and that is the whole
 * enforcement mechanism. Targets, which are template facts rather than
 * observations, arrive separately (see `dwell.ts`).
 *
 * Pure: no imports beyond formatting/lifecycle helpers, no I/O.
 */
import { normalizeStage, stageLabel } from "../hub-format";
import type { LifecycleStageId } from "../lifecycle";

export const DAY_MS = 86_400_000;

/** The shape this module reads. Deliberately narrower than the table. */
export type HistoryRow = {
  implementation_id: string;
  stage: string;
  entered_at: string;
  exited_at: string | null;
};

/** A completed transition: someone entered a stage and later left it. */
export type StageSegment = {
  implementation_id: string;
  /** Normalized lifecycle id — legacy spellings alias forward, never dropped. */
  stage: LifecycleStageId;
  stage_label: string;
  entered_at: string;
  exited_at: string;
  days: number;
};

/** A stage entered and not yet left. Reported, never mixed into a distribution. */
export type OpenStageSegment = {
  implementation_id: string;
  stage: LifecycleStageId;
  stage_label: string;
  entered_at: string;
  days_so_far: number;
};

export type ExclusionReason =
  /** No exited_at: the stage has not finished, so there is no dwell to observe. */
  | "still_open"
  /** Pre-handoff or unknown vocabulary — an upstream step this app does not own. */
  | "stage_not_in_lifecycle"
  /** exited_at before entered_at. The table has no DB guard; this is a defect. */
  | "impossible_interval"
  /** entered_at missing or unparseable. */
  | "unusable_timestamp";

export const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  still_open: "Stage still open — no completed dwell to observe",
  stage_not_in_lifecycle: "Stage is outside this lifecycle (upstream or unknown)",
  impossible_interval: "Exit recorded before entry — data defect, not a dwell",
  unusable_timestamp: "Entry timestamp missing or unreadable",
};

export type Exclusion = {
  reason: ExclusionReason;
  implementation_id: string;
  stage: string;
  entered_at: string | null;
  exited_at: string | null;
};

export type StageSegments = {
  completed: StageSegment[];
  open: OpenStageSegment[];
  /** Every row that produced no observation, named — never silently dropped. */
  excluded: Exclusion[];
  /** Counts per reason, for the "n observations, m excluded" line. */
  excluded_by_reason: Record<ExclusionReason, number>;
  rows_read: number;
};

const parse = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/** Whole days between two instants, floored at zero. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = parse(fromIso);
  const to = parse(toIso);
  if (from == null || to == null) return 0;
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

/**
 * Split recorded history into observations, open stages and named exclusions.
 *
 * A zero-day segment is KEPT: someone really did click through in a day, and
 * dropping it would be an unstated opinion about which recorded facts count.
 */
export function stageSegments(rows: readonly HistoryRow[], now: Date = new Date()): StageSegments {
  const completed: StageSegment[] = [];
  const open: OpenStageSegment[] = [];
  const excluded: Exclusion[] = [];
  const nowMs = now.getTime();

  for (const row of rows) {
    const record = {
      implementation_id: row.implementation_id,
      stage: row.stage,
      entered_at: row.entered_at ?? null,
      exited_at: row.exited_at ?? null,
    };
    const stage = normalizeStage(row.stage);
    if (!stage) {
      excluded.push({ ...record, reason: "stage_not_in_lifecycle" });
      continue;
    }
    const entered = parse(row.entered_at);
    if (entered == null) {
      excluded.push({ ...record, reason: "unusable_timestamp" });
      continue;
    }
    const label = stageLabel(stage);

    if (!row.exited_at) {
      open.push({
        implementation_id: row.implementation_id,
        stage,
        stage_label: label,
        entered_at: row.entered_at,
        days_so_far: Math.max(0, Math.round((nowMs - entered) / DAY_MS)),
      });
      excluded.push({ ...record, reason: "still_open" });
      continue;
    }
    const exited = parse(row.exited_at);
    if (exited == null) {
      excluded.push({ ...record, reason: "unusable_timestamp" });
      continue;
    }
    if (exited < entered) {
      excluded.push({ ...record, reason: "impossible_interval" });
      continue;
    }

    completed.push({
      implementation_id: row.implementation_id,
      stage,
      stage_label: label,
      entered_at: row.entered_at,
      exited_at: row.exited_at,
      days: Math.max(0, Math.round((exited - entered) / DAY_MS)),
    });
  }

  const byReason: Record<ExclusionReason, number> = {
    still_open: 0,
    stage_not_in_lifecycle: 0,
    impossible_interval: 0,
    unusable_timestamp: 0,
  };
  for (const e of excluded) byReason[e.reason] += 1;

  completed.sort((a, b) => a.entered_at.localeCompare(b.entered_at));
  open.sort((a, b) => a.entered_at.localeCompare(b.entered_at));

  return {
    completed,
    open,
    excluded,
    excluded_by_reason: byReason,
    rows_read: rows.length,
  };
}

/** Completed segments for one implementation, oldest first. */
export function segmentsFor(segments: StageSegments, implementationId: string): StageSegment[] {
  return segments.completed.filter((s) => s.implementation_id === implementationId);
}

/** The open segment for one implementation, if history has one. */
export function openSegmentFor(
  segments: StageSegments,
  implementationId: string,
): OpenStageSegment | null {
  return segments.open.find((s) => s.implementation_id === implementationId) ?? null;
}
