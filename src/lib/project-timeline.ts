import { normalizeStage, stageLabel } from "./hub-format";
import { LIFECYCLE_STAGES } from "./lifecycle";
import { datePace, dwellPace, worstPace, type Pace } from "./pace";

/**
 * One customer, many projects, each with its OWN stages.
 *
 * The top bar used to render `LIFECYCLE_STAGES` — the eight new-logo stages —
 * on every page, for every account, highlighting nothing. That was wrong twice
 * over. It was wrong about the customer, because a customer runs several
 * projects at once and they start on different days and move at different
 * speeds. And it was wrong about the project, because Phase 2 already gives
 * every implementation its own `stage_instances`: an integration journey's
 * stages are Discovery / Design / Build / Validate-Iterate / Launch, and
 * printing "Handoff → Plan Internally → …" over the top of one is simply false.
 *
 * So this module derives a rail FROM THE RECORD. Nothing here reaches for a
 * hardcoded array unless the record has nothing to offer, and when it does
 * fall back it says so out loud (`source: "lifecycle_default"`) so the UI can
 * draw a default differently from a plan. A house default that looks like a
 * plan is the same failure `pace.ts` refuses when it will not call a missing
 * target "on pace".
 *
 * Everything here is pure. The colours come from `pace.ts` and its three rules
 * are inherited unchanged: on-pace is not a colour, every level carries a
 * written reason, and no target is never good news.
 */

/** A `stage_instances` row, narrowed to what a rail needs (0014). */
export type StageInstanceRow = {
  stage_key: string;
  name: string;
  position: number;
  status: "pending" | "active" | "done" | "skipped" | string;
  entered_at: string | null;
  exited_at: string | null;
  target_duration_days: number | null;
  provenance?: string | null;
};

/** Where a stage sits relative to the one the project is in now. */
export type RailStageState = "past" | "current" | "future" | "skipped";

export type RailStage = {
  key: string;
  name: string;
  state: RailStageState;
  /** 1-based, for "Stage 4 of 8" and for screen readers. */
  position: number;
  target_duration_days: number | null;
  entered_at: string | null;
  /** Whole days spent in this stage, where both ends are known. */
  days: number | null;
  /**
   * True when this row's timestamps were deduced at backfill rather than
   * observed (0014). Rendered, never hidden — an inferred date should not look
   * like one somebody recorded.
   */
  inferred: boolean;
};

/**
 * Where the rail came from. `lifecycle_default` means this project has no
 * stage instances and we are drawing the house default; the UI must say so.
 */
export type TimelineSource = "stage_instances" | "lifecycle_default";

export type ProjectTimeline = {
  id: string;
  name: string;
  source: TimelineSource;
  stages: RailStage[];
  /** 1-based index of the current stage; 0 when it is not on the rail at all. */
  position: number;
  total: number;
  currentStageName: string;
  /** Time in the current stage against THAT stage's own target duration. */
  dwell: Pace;
  /** The target launch date, against today or the actual launch. */
  launch: Pace;
  /** The worse of the two — what the lane is coloured by. */
  overall: Pace;
  /** When this project started; projects on one customer start on different days. */
  startedAt: string | null;
  targetLaunchDate: string | null;
  actualLaunchDate: string | null;
  /**
   * Every stage finished or deliberately skipped. Only ever true for a real
   * plan: a default rail is not evidence that anything was completed.
   */
  isComplete: boolean;
  /** Hangs off a parent implementation (0010) — an add-on, not a new logo. */
  isAddOn: boolean;
};

export type TimelineInput = {
  id: string;
  name: string;
  current_stage: string | null;
  stage_entered_at?: string | null;
  created_at?: string | null;
  contract_start_date?: string | null;
  target_launch_date?: string | null;
  actual_launch_date?: string | null;
  parent_implementation_id?: string | null;
  /** This project's own stages, if a journey has been applied to it. */
  stages?: StageInstanceRow[] | null;
};

const dayMs = 86_400_000;

function wholeDays(from: string | null | undefined, to: Date | string | null): number | null {
  if (!from || !to) return null;
  const a = new Date(from);
  const b = typeof to === "string" ? new Date(to) : to;
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / dayMs));
}

const isFinished = (status: string) => status === "done" || status === "skipped";

/** The rail for one project, read from its own record. */
export function buildProjectTimeline(
  input: TimelineInput,
  now: Date = new Date(),
): ProjectTimeline {
  const rows = [...(input.stages ?? [])].sort((a, b) => a.position - b.position);
  const isAddOn = Boolean(input.parent_implementation_id);
  const launch = datePace(input.target_launch_date, input.actual_launch_date, now);

  if (!rows.length) {
    // No journey has been applied to this project. Draw the house default and
    // flag it as one — see the module note.
    const activeIndex = LIFECYCLE_STAGES.findIndex(
      (s) => s.id === normalizeStage(input.current_stage),
    );
    const stages: RailStage[] = LIFECYCLE_STAGES.map((s, i) => ({
      key: s.id,
      name: s.label,
      state: i === activeIndex ? "current" : i < activeIndex ? "past" : "future",
      position: i + 1,
      target_duration_days: null,
      entered_at: i === activeIndex ? (input.stage_entered_at ?? null) : null,
      days: i === activeIndex ? wholeDays(input.stage_entered_at, now) : null,
      inferred: false,
    }));
    const dwell = dwellPace(input.stage_entered_at, null, now);
    return {
      id: input.id,
      name: input.name,
      source: "lifecycle_default",
      stages,
      position: activeIndex + 1,
      total: stages.length,
      currentStageName:
        activeIndex >= 0 ? stages[activeIndex]!.name : stageLabel(input.current_stage),
      dwell,
      launch,
      overall: worstPace([dwell, launch]),
      startedAt: input.contract_start_date ?? input.created_at ?? null,
      targetLaunchDate: input.target_launch_date ?? null,
      actualLaunchDate: input.actual_launch_date ?? null,
      // A default rail can never evidence completion.
      isComplete: false,
      isAddOn,
    };
  }

  // A real plan. The active row is authoritative; when nothing is active the
  // project has either finished every stage or not entered one yet, and the
  // first unfinished row is the honest answer.
  const explicitActive = rows.findIndex((r) => r.status === "active");
  const firstUnfinished = rows.findIndex((r) => !isFinished(r.status));
  const currentIndex = explicitActive >= 0 ? explicitActive : firstUnfinished;
  const isComplete = firstUnfinished === -1;

  const stages: RailStage[] = rows.map((r, i) => {
    const state: RailStageState =
      r.status === "skipped"
        ? "skipped"
        : i === currentIndex
          ? "current"
          : currentIndex === -1 || i < currentIndex
            ? "past"
            : "future";
    return {
      key: r.stage_key,
      name: r.name,
      state,
      position: i + 1,
      target_duration_days: r.target_duration_days,
      entered_at: r.entered_at,
      days: wholeDays(r.entered_at, r.exited_at ?? (state === "current" ? now : null)),
      inferred: r.provenance === "backfill_inferred",
    };
  });

  const current = currentIndex >= 0 ? rows[currentIndex]! : null;
  const dwell: Pace = isComplete
    ? { level: "done", reason: "Every stage on this project's plan is finished." }
    : dwellPace(
        current?.entered_at ?? input.stage_entered_at ?? null,
        current?.target_duration_days ?? null,
        now,
      );

  return {
    id: input.id,
    name: input.name,
    source: "stage_instances",
    stages,
    position: currentIndex >= 0 ? currentIndex + 1 : stages.length,
    total: stages.length,
    currentStageName: current?.name ?? stages[stages.length - 1]!.name,
    dwell,
    launch,
    overall: worstPace([dwell, launch]),
    startedAt:
      input.contract_start_date ??
      rows.find((r) => r.entered_at)?.entered_at ??
      input.created_at ??
      null,
    targetLaunchDate: input.target_launch_date ?? null,
    actualLaunchDate: input.actual_launch_date ?? null,
    isComplete,
    isAddOn,
  };
}

/**
 * The rail in words.
 *
 * Colour and position are not available to everyone, so every rail carries
 * this as its accessible name. It says the same thing the chips say.
 */
export function railSummary(t: ProjectTimeline): string {
  const where =
    t.position > 0
      ? `Stage ${t.position} of ${t.total}: ${t.currentStageName}.`
      : `Not yet on the rail; the recorded stage is ${t.currentStageName}.`;
  const plan =
    t.source === "stage_instances"
      ? `${t.total}-stage plan for this project.`
      : `No plan has been applied to this project, so the ${t.total} default stages are shown.`;
  const done = t.isComplete ? " Every stage is finished." : "";
  return `${t.name}. ${plan} ${where}${done} ${t.dwell.reason} Target launch: ${t.launch.reason}`;
}

/** A short, colour-free statement of where the project stands. */
export function timelineHeadline(t: ProjectTimeline): string {
  if (t.position > 0) return `Stage ${t.position} of ${t.total} · ${t.currentStageName}`;
  return t.currentStageName;
}

export type TimelineLayout = {
  /** Lanes drawn in full, active first. */
  visible: ProjectTimeline[];
  /** Lanes folded behind a disclosure — quieter, never gone. */
  hidden: ProjectTimeline[];
  /** How many of the customer's projects are finished, across both groups. */
  completeCount: number;
  outstandingCount: number;
};

/**
 * Which lanes get drawn when a customer has a lot of projects.
 *
 * One project needs no chrome at all; three should all be on screen; twelve
 * must not eat the page. The active project is always drawn, outstanding work
 * outranks finished work, and whatever does not fit is folded rather than
 * dropped — a delivered project should stop shouting without disappearing.
 */
export function planTimelineLayout(
  timelines: ProjectTimeline[],
  activeId: string | null,
  maxLanes = 4,
): TimelineLayout {
  const completeCount = timelines.filter((t) => t.isComplete).length;
  const outstandingCount = timelines.length - completeCount;

  const rank = (t: ProjectTimeline) => (t.id === activeId ? 0 : t.isComplete ? 2 : 1);
  const ordered = timelines
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map((x) => x.t);

  const limit = Math.max(1, maxLanes);
  // Folding a single lane away buys nothing and costs a click.
  if (ordered.length <= limit + 1) {
    return { visible: ordered, hidden: [], completeCount, outstandingCount };
  }
  return {
    visible: ordered.slice(0, limit),
    hidden: ordered.slice(limit),
    completeCount,
    outstandingCount,
  };
}
