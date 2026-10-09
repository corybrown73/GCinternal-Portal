import {
  firstFormName,
  flowAnswered,
  isServicesOnly,
  readIntake,
  type IntakeAnswers,
} from "./intake-answers";
import {
  launchCriticalOpen,
  normalizeServices,
  SOLUTION_LABEL,
  SOLUTION_STATUS_LABEL,
  solutionStatus,
  undispositioned,
  type ServiceSpec,
} from "./onboarding-services";
import type { AccountStage } from "./presale-stages";
import { handoffChecks } from "./sales-handoff";
import { TEAM_ZONE, shortDay, type Timeline } from "./onboarding-timeline";

/**
 * The deal's stages as a checklist: what each stage asks of the person who
 * owns it, and when the deal moves on by itself.
 *
 *   Closed Won    the type of deal · assigned · the Gong brief · the SOW ·
 *                 review what the AI filled and approve → Pre-kickoff
 *   Pre-kickoff   reply to the AE · the Salesloft cadence ·
 *                 book the kickoff call                 → Onboarding
 *   Onboarding    the training calls, the first form live, every service
 *                 the SOW bought, and the graduation checks
 *                                                       → Complete (a person presses it)
 *
 * Pure, so the page, the server that moves the stage, and the tests all read
 * the same rules. A stage moves forward only, and only when every task in it
 * is done; nothing here ever moves a deal back.
 */

/**
 * The four kinds of deal, in the team's words, each with the one line that
 * says how its onboarding runs. One question decides which plan the deal
 * gets; everything downstream reads it.
 */
export const DEAL_TYPES = [
  {
    path: "new_logo",
    label: "New logo",
    plan: "First GoCanvas rollout on the Implementation Playbook: three 60-minute core meetings — Get it working, Make it yours, Make it run — Functional by business day 15, inside a 30-day window.",
  },
  {
    path: "existing",
    label: "Existing account",
    plan: "Already on GoCanvas, buying more: three core meetings over 15 business days to get the form ready, then the integration or services.",
  },
  {
    path: "dm_conversion",
    label: "Device Magic → GoCanvas",
    plan: "Moving off Device Magic: their most-used form rebuilt with them and run alongside DM, live in 15 business days.",
  },
  {
    path: "field_fusion",
    label: "Field Fusion",
    plan: "Forms already built: Liesl's setup check, then three 30-minute training sessions over two weeks.",
  },
] as const;

export type FlowStageKey =
  | "prospect"
  | "negotiate"
  | "closed_won"
  | "field_fusion"
  | "pre_kickoff"
  | "kickoff"
  | "get_it_working"
  | "make_it_yours"
  | "make_it_run"
  | "complete";

/**
 * The deal's rail, in order, with the stepper's word for each stage. One
 * list: the checklist, the stepper and the deal's stage badge all read it,
 * so a deal never shows one stage in the header and another on the rail.
 * Field Fusion setup appears only for deals on that path.
 */
export const FLOW_STAGES: ReadonlyArray<{ key: FlowStageKey; stage: AccountStage; label: string }> =
  [
    { key: "prospect", stage: "prospect", label: "Prospect" },
    { key: "negotiate", stage: "negotiate", label: "Negotiate & Finalize" },
    { key: "closed_won", stage: "closed_won", label: "Closed Won" },
    { key: "field_fusion", stage: "field_fusion_setup", label: "Field Fusion setup" },
    { key: "pre_kickoff", stage: "onboarding_kickoff", label: "Intake & Process" },
    { key: "kickoff", stage: "kickoff", label: "Kickoff" },
    { key: "get_it_working", stage: "get_it_working", label: "Get it working" },
    { key: "make_it_yours", stage: "make_it_yours", label: "Make it yours" },
    { key: "make_it_run", stage: "make_it_run", label: "Make it run" },
    { key: "complete", stage: "onboarding_complete", label: "Graduate" },
  ];

/** The three stages between Pre-Kickoff and Implementation Complete, as flow keys. */
export const ONBOARDING_FLOW_KEYS: ReadonlyArray<FlowStageKey> = [
  "get_it_working",
  "make_it_yours",
  "make_it_run",
];

/**
 * The six-stage canonical journey Customer 360's Current Implementation tab
 * shows: Intake & Process through Implementation Complete. Prospect,
 * Negotiate & Finalize, Closed Won and Field Fusion setup precede it and are
 * Sales' and the handoff's stages, not the implementation's.
 */
export const CANONICAL_JOURNEY_KEYS: ReadonlyArray<FlowStageKey> = [
  "pre_kickoff",
  "kickoff",
  "get_it_working",
  "make_it_yours",
  "make_it_run",
  "complete",
];

/** A stage whose tasks are the plan's steps: the three middle ones and Complete. */
export function isWorkingStageKey(key: FlowStageKey | null | undefined): boolean {
  return (
    key === "get_it_working" ||
    key === "make_it_yours" ||
    key === "make_it_run" ||
    key === "complete"
  );
}

/**
 * The gate a stage ends at (the operating model): what has to be true to
 * move on, however many sessions it takes. Shown under the stage name and
 * named in the move's note.
 */
export const STAGE_GATE: Partial<Record<FlowStageKey, string>> = {
  pre_kickoff: "Ready for Kickoff",
  kickoff: "Kickoff held",
  get_it_working: "Working end to end",
  make_it_yours: "Ready to run",
  make_it_run: "Operational Go-Live",
  complete: "Complete — Proven or Not Proven",
};

export function flowLabel(key: FlowStageKey): string {
  return FLOW_STAGES.find((s) => s.key === key)!.label;
}

/**
 * The planned date a canonical stage closes on, read straight off the plan's
 * own milestones — never a stored per-stage field, never invented. Kickoff
 * closes at the Kickoff call itself; Make It Yours at the Stage 2 call; Make
 * It Run at the plan's Functional/Go-Live date, since that is the milestone
 * that actually ends it. Intake & Process ends when Kickoff is BOOKED, not
 * when it's held — booking has no planned date of its own to be early or
 * late against, so it gets no target here. Get It Working closes on two
 * ticks (the baseline, one submission end to end) and Graduate on the
 * close-out and graduation checks — neither is a scheduled date either.
 */
export function stageTargetDate(key: FlowStageKey, timeline: Timeline | null): string | null {
  if (!timeline) return null;
  const dateOf = (milestoneKey: string) =>
    timeline.milestones.find((m) => m.key === milestoneKey)?.date ?? null;
  switch (key) {
    case "kickoff":
      return dateOf("kickoff");
    case "make_it_yours":
      return dateOf("working");
    case "make_it_run":
      return dateOf("live");
    default:
      return null;
  }
}

/**
 * The most recent transition into a given account stage, from the deal's
 * own stage history — the same record StageHistory already reads, so
 * "when did this stage start" never disagrees with it. Null when the
 * stage was never entered, or has no transition row yet.
 */
export function latestStageTransition<T extends { to_stage: string; occurred_at: string }>(
  history: readonly T[],
  stage: AccountStage | null | undefined,
): T | null {
  if (!stage) return null;
  const entries = [...history]
    .filter((t) => t.to_stage === stage)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return entries[0] ?? null;
}

/**
 * The one date Current Implementation's journey rail shows per canonical
 * stage, reusing the same sources StageTiming already reads — never a
 * stored per-stage field, never invented:
 *
 *   completed  when the deal actually moved past it — the next stage's own
 *              transition row, the same record StageHistory reads, so a
 *              scheduled call never passes for the stage's real close.
 *              Complete has no next stage to read, so it reads the
 *              operating model's own finish stamp (`intake.outcome.at`)
 *              instead.
 *   current    the plan's own target for it (stageTargetDate) — "Target".
 *   upcoming   the same plan date, ahead of it — "Planned".
 *   skipped    none: its badge already says "Skipped".
 *
 * Null whenever the source it would read does not exist (no transition
 * recorded yet, or the plan has no milestone to date that stage) — the
 * caller shows nothing rather than guess.
 */
export function journeyStageDate(
  key: FlowStageKey,
  status: "completed" | "current" | "upcoming" | "skipped",
  history: readonly { to_stage: string; occurred_at: string }[],
  timeline: Timeline | null,
  outcomeAt: string | null,
): { label: string; text: string } | null {
  if (status === "skipped") return null;
  if (status === "completed") {
    if (key === "complete") {
      return outcomeAt ? { label: "Completed", text: stampDay(outcomeAt) } : null;
    }
    const nextKey = CANONICAL_JOURNEY_KEYS[CANONICAL_JOURNEY_KEYS.indexOf(key) + 1];
    const nextStage = nextKey ? FLOW_STAGES.find((s) => s.key === nextKey)?.stage : undefined;
    const t = latestStageTransition(history, nextStage);
    return t ? { label: "Completed", text: stampDay(t.occurred_at) } : null;
  }
  const target = stageTargetDate(key, timeline);
  if (!target) return null;
  return { label: status === "current" ? "Target" : "Planned", text: shortDay(target) };
}

/**
 * Whether the implementation's target has moved from its agreed baseline —
 * the trigger for showing "Target changed". False whenever either date is
 * unknown: a baseline that was never locked is not a disagreement.
 */
export function targetDidChange(
  baseline: string | null | undefined,
  target: string | null | undefined,
): boolean {
  return Boolean(baseline && target && baseline !== target);
}

export type TaskAction =
  | "deal_type"
  | "prep"
  | "book_core"
  | "assign"
  | "notes"
  | "sow"
  | "review"
  | "reply_ae"
  | "cadence"
  | "kickoff"
  | "field_fusion"
  | "intake"
  | "process_understanding"
  | "process_call"
  | "solution"
  | "tick"
  | "graduate"
  | "upload_brief";

export type FlowTask = {
  key: string;
  label: string;
  /** One sentence: what doing it means. */
  hint: string;
  done: boolean;
  /** What the done task says in place of its hint: "Dana Whitfield", "SOW on file". */
  summary: string | null;
  action: TaskAction;
  /** Why it cannot be done yet, naming the task that has to come first. */
  locked: string | null;
  /** The plan's date for it, on the Onboarding stage. */
  date?: string | null;
  /** The key a tick writes to `timeline.completed`, on the Onboarding stage. */
  doneKey?: string;
  /** A heading the task sits under, for a run of related ticks. */
  group?: string;
  /** Offered, never required: does not hold a stage back. */
  optional?: boolean;
};

export type StageFlowInput = {
  stage: string;
  intake: unknown;
  /** The implementation owner's name, when there is one. */
  owner: string | null;
  gongReports: number;
  hasSow: boolean;
  /** An AI brief has completed. */
  hasBrief: boolean;
  /** The customer's welcome link exists. */
  hasLink: boolean;
  /** The plan, for the Onboarding stage's tasks. Optional: the server does not need it. */
  timeline?: Timeline | null;
  /**
   * The post-implementation brief is attached (an account_files row titled
   * GRADUATION_BRIEF_TITLE) — read by the caller, which has the attachments
   * query; this module stays pure. Optional: callers that never render the
   * Graduate stage (the digest, the board) do not need to check.
   */
  hasGraduationBrief?: boolean;
};

/** The exact, fixed title the Graduation task's upload looks for — never a
 * title a person types, so "is it attached" never depends on word choice. */
export const GRADUATION_BRIEF_TITLE = "Post-implementation brief";

export type StageFlow = {
  /** Where the deal is, in the checklist's terms. Null before Closed Won. */
  current: FlowStageKey | null;
  stages: Array<{ key: FlowStageKey; label: string; tasks: FlowTask[]; done: boolean }>;
  /** The stage the deal should move to now, when its checklist says so. */
  advanceTo: AccountStage | null;
};

/** The cadence we run in Salesloft until the first meeting is on the calendar. */
export const KICKOFF_CADENCE: ReadonlyArray<{ day: string; step: string }> = [
  {
    day: "Day 0",
    step: "Reply-all to the AE's email: intro, the welcome page, two times for the first meeting",
  },
  { day: "Day 1", step: "Call the champion; leave a voicemail and follow with a short email" },
  { day: "Day 3", step: "Call again; email one time slot with a calendar hold" },
  { day: "Day 5", step: "Email with the AE copied: what they lose by waiting" },
  { day: "Day 7", step: "Escalate to the AE to get the first meeting on the calendar" },
];

/**
 * A reading whose job has not touched the record for this long is not
 * coming back: a step runs under five minutes and the cron reclaims a
 * stale lock after six, so a spinner past eight minutes without a
 * heartbeat is a spinner for nothing.
 */
export const READING_STALE_MS = 8 * 60 * 1000;

/** The automatic reading is queued or running right now (and has not quietly died). */
export function readingInFlight(r: IntakeAnswers["ai_reading"], now = Date.now()): boolean {
  if (r?.status !== "queued" && r?.status !== "running") return false;
  const last = Date.parse(r.heartbeat_at ?? r.started_at);
  return Number.isFinite(last) && now - last < READING_STALE_MS;
}

/** The tasks always present in Intake & Process; a Process Call is added only when needed. */
export const PRE_KICKOFF_TASKS = [
  "intake_complete",
  "prep",
  "process_understanding",
  "kickoff",
] as const;

function flowStageOf(stage: string): FlowStageKey | null {
  switch (stage) {
    case "prospect":
      return "prospect";
    case "negotiate":
      return "negotiate";
    case "closed_won":
      return "closed_won";
    case "field_fusion_setup":
      return "field_fusion";
    case "onboarding_kickoff":
      return "pre_kickoff";
    case "kickoff":
      return "kickoff";
    case "get_it_working":
      return "get_it_working";
    case "make_it_yours":
      return "make_it_yours";
    case "make_it_run":
      return "make_it_run";
    // Retired: the one Onboarding stage became three. History may still say it.
    case "in_onboarding":
      return "get_it_working";
    case "onboarding_complete":
      return "complete";
    default:
      return null;
  }
}

function closedWonTasks(
  a: IntakeAnswers,
  input: StageFlowInput,
  /** The TIS can be assigned: the deal is closed, or at Negotiate & Finalize. */
  assignable: boolean,
): FlowTask[] {
  const hasNotes = input.gongReports > 0;
  const paperDone = input.hasSow || a.has_sow === false;
  const flowDone = a.path !== null && flowAnswered(a);
  const built = input.hasBrief && input.hasLink;
  const reading = a.ai_reading;
  const running = readingInFlight(reading);
  const approved = Boolean(a.handoff_tasks["reviewed"]);
  const before: string[] = [];
  if (a.path === null) before.push("the type of deal");
  if (!hasNotes) before.push("the Gong brief");
  if (!paperDone) before.push("the SOW");
  return [
    {
      key: "type",
      label: "What type of deal is this?",
      hint: "New logo, existing account, Device Magic → GoCanvas, or Field Fusion. The plan, the deck and the training all follow it.",
      done: a.path !== null,
      summary: a.path ? DEAL_TYPES.find((t) => t.path === a.path)!.label : null,
      action: "deal_type",
      locked: null,
    },
    {
      key: "assign",
      label: "Assign an owner",
      hint: "Who runs this onboarding. Assigned at Negotiate & Finalize so they can join the closing call; they get the email with everything below.",
      done: Boolean(input.owner),
      summary: input.owner,
      action: "assign",
      // Sales brings the TIS in before the close: from Negotiate & Finalize
      // on. A bare Prospect has nobody to bring in yet.
      locked: assignable ? null : "Assigned at Negotiate & Finalize or Closed Won",
    },
    {
      key: "notes",
      label: "Add the Gong brief",
      hint: "Upload the Gong brief (.md) or paste the call notes. The AI reads it on its own.",
      done: hasNotes,
      summary: hasNotes
        ? `${input.gongReports} call note${input.gongReports === 1 ? "" : "s"} on file`
        : null,
      action: "notes",
      locked: null,
    },
    {
      key: "sow",
      label: "Add the SOW",
      hint: "The signed SOW. Integrations and services come from it, never from the notes.",
      done: paperDone,
      summary: input.hasSow ? "SOW on file" : a.has_sow === false ? "No SOW — core only" : null,
      action: "sow",
      locked: null,
    },
    {
      key: "review",
      label: "Review what the AI filled, and approve",
      hint: "The flow, the forms, the process and the plan, read from the Gong brief and the SOW. Fix anything wrong, then approve.",
      done: approved && flowDone && built,
      summary:
        approved && flowDone && built
          ? flowSummary(a)
          : running
            ? "AI is reading the Gong brief and the SOW…"
            : null,
      action: "review",
      locked: before.length ? `Needs ${joinAnd(before)} first` : null,
    },
  ];
}

/** The starting solution, prepared from the Gong brief, the SOW and the customer's intake. */
export const PREP_ITEMS = [
  {
    key: "prep_process",
    label: "Process map",
    hint: "Their workflow, start to finish: field activity → submission → what happens next → where it lands.",
  },
  {
    key: "prep_form",
    label: "Starting form (POC)",
    hint: "A first version of their form built from the brief, the SOW and their intake, so Kickoff validates instead of starting blank.",
  },
  {
    key: "prep_data",
    label: "Reference-data example",
    hint: "One of their lists — customers, sites, parts — structured the way the form will use it.",
  },
] as const;

/**
 * The three core meetings. No longer booked together here — Pre-Kickoff
 * books only Kickoff — but the plan still names them, and the booking
 * history for an account that booked all three before this change still
 * reads by these labels.
 */
export const CORE_MEETINGS = [
  { key: "kickoff", label: "Stage 1 — Get it working" },
  { key: "working", label: "Stage 2 — Make it yours" },
  { key: "adjust", label: "Stage 3 — Make it run" },
] as const;

/**
 * Intake & Process: the TIS prepares for Kickoff from what is already known
 * — the Gong brief and the SOW (both from Closed Won, read as context, not
 * re-checked here), and the customer's own GoCanvas-native Pre-Kickoff
 * Intake. A Process Call is booked only when that is not enough. Field
 * Fusion has its own handoff from the setup owner and skips straight to
 * booking Kickoff.
 */
function preKickoffTasks(a: IntakeAnswers): FlowTask[] {
  if (a.path === "field_fusion") return [kickoffBookingTask(a)];
  const t = a.handoff_tasks;
  const customerIntake = handoffChecks(a);
  const prepDone = PREP_ITEMS.filter((p) => t[p.key]).length;
  // Services and nothing to build: one walkthrough, not a solution to prepare.
  const booking = isServicesOnly(a)
    ? {
        ...kickoffBookingTask(a),
        label: "Book the services walkthrough",
        hint: "One call: what was bought, who does what, and the dates. Every service starts the day after it.",
      }
    : kickoffBookingTask(a);
  return [
    {
      key: "intake_complete",
      label: "Customer Pre-Kickoff Intake completed",
      hint: "Their answers — on their welcome page, or in GoCanvas: the process today, who is in the field, who will be in the room. Tick it if they answered elsewhere.",
      // Their answers on the welcome page (src/lib/sales-handoff.ts) count
      // without a tick; a tick records an intake that came in another way.
      done: Boolean(t["intake_complete"]) || customerIntake.customerReady.done,
      summary: t["intake_complete"]
        ? `Done ${stampDay(t["intake_complete"])}`
        : customerIntake.customerReady.done
          ? customerIntake.customerReady.overridden
            ? `Going ahead: ${a.handoff.customer_ready_override!.reason}`
            : "Their answers are in"
          : customerIntake.status === "sent"
            ? `With the customer since ${stampDay(a.handoff.sent_to_customer_at!)}`
            : null,
      action: "intake",
      locked: null,
    },
    {
      key: "prep",
      label: "Starting solution prepared",
      hint: "A first version built from the brief, the SOW and their intake, so Kickoff validates instead of starting blank.",
      done: prepDone === PREP_ITEMS.length,
      summary:
        prepDone === PREP_ITEMS.length
          ? "Ready: process map, starting form, one real list"
          : prepDone
            ? `${prepDone} of ${PREP_ITEMS.length} in hand`
            : null,
      action: "prep",
      locked: null,
    },
    ...processCallTasks(a),
    booking,
  ];
}

/**
 * "Do you have enough process understanding to prepare for Kickoff?" — the
 * TIS's own call, captured either way (so how often the intake is enough is
 * reportable later). Yes needs no more; No adds the Process Call itself,
 * required before the gate clears.
 */
function processCallTasks(a: IntakeAnswers): FlowTask[] {
  const t = a.handoff_tasks;
  const decision = t["process_understanding"];
  const out: FlowTask[] = [
    {
      key: "process_understanding",
      label: "Enough process understanding to prepare for Kickoff?",
      hint: "From the brief, the SOW and their intake. Yes moves on; No books a Process Call first.",
      done: decision === "yes" || decision === "no",
      summary:
        decision === "yes"
          ? "Yes — no Process Call needed"
          : decision === "no"
            ? "No — Process Call required"
            : null,
      action: "process_understanding",
      locked: null,
    },
  ];
  if (decision === "no") {
    out.push({
      key: "process_call_held",
      label: "Hold the Process Call",
      hint: "The call that fills in what the intake did not answer.",
      done: Boolean(t["process_call_held"]),
      summary: t["process_call_held"] ? `Done ${stampDay(t["process_call_held"])}` : null,
      action: "process_call",
      locked: null,
    });
  }
  return out;
}

/**
 * The plan's timeline after booking meetings: each key's date and time, and
 * the zone they are in. One helper for the single kickoff, the three core
 * meetings and Sales booking the first meeting before the close — so the
 * TIS's checklist finds the booking wherever it was made.
 */
export function bookMeetingPatch(
  t: IntakeAnswers["timeline"],
  bookings: ReadonlyArray<{ key: string; date: string; time: string }>,
  zone: string | null,
): IntakeAnswers["timeline"] {
  const real = bookings.filter((b) => b.date && b.time);
  return {
    ...t,
    overrides: { ...t.overrides, ...Object.fromEntries(real.map((b) => [b.key, b.date])) },
    times: { ...t.times, ...Object.fromEntries(real.map((b) => [b.key, b.time])) },
    timezone: zone || null,
  };
}

/**
 * The day a tick was made, on the team's clock. The stamp is UTC, and after
 * 8 pm Eastern that is tomorrow's date: "Replied Sep 25" for a reply sent
 * on the 24th.
 */
export function stampDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: TEAM_ZONE,
  });
}

/** "Tue, Sep 29 at 2:30 PM" — a booked meeting in a person's words, not the record's. */
export function whenLabel(isoDate: string, time: string, zone?: string | null): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const clock = Number.isFinite(h)
    ? `${h % 12 === 0 ? 12 : h % 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
    : time;
  return `${shortDay(isoDate)} at ${clock}${zone ? ` ${zoneShort(zone, isoDate)}` : ""}`;
}

/** "America/Chicago" on a September day → "CDT"; an unknown zone → "". */
export function zoneShort(zone: string, isoDate: string): string {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
        .formatToParts(new Date(`${isoDate}T12:00:00Z`))
        .find((p) => p.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}

/** Only Kickoff gets booked here — no fixed number of meetings. */
function kickoffBookingTask(a: IntakeAnswers): FlowTask {
  const kickoffDate = a.timeline.overrides["kickoff"] ?? null;
  const kickoffTime = a.timeline.times["kickoff"] ?? null;
  const booked = Boolean(kickoffDate && kickoffTime);
  return {
    key: "kickoff",
    label: "Book the kickoff call",
    hint: "The first call. The date and time go on the plan and every date after it follows.",
    done: booked,
    summary: booked ? whenLabel(kickoffDate!, kickoffTime!, a.timeline.timezone) : null,
    action: "kickoff",
    locked: null,
  };
}

/**
 * The Onboarding stage: only what a person can honestly tick and a manager
 * wants to see — each training call held, the first form live, each thing
 * the SOW bought delivered, then the graduation checks. The homework and
 * field-test days stay on the plan, where they are dates, not chores.
 */
/** What "Functional" means: the minimum they can do without us, checked on a call. */
export const FUNCTIONAL = [
  { key: "func_web_login", label: "Logs into the web portal", needs: null },
  { key: "func_mobile_login", label: "Logs into the mobile app", needs: null },
  { key: "func_submit", label: "Opens, completes and submits the main workflow", needs: null },
  { key: "func_output", label: "Gets the output — the PDF, the email", needs: null },
  { key: "func_users", label: "Adds users and updates roles and access", needs: null },
  { key: "func_edit", label: "Makes a basic form edit and republishes", needs: null },
  { key: "func_data_open", label: "Opens the datasets that power the form", needs: "data" },
  { key: "func_data_update", label: "Updates those datasets when things change", needs: "data" },
] as const;
export type FunctionalItem = (typeof FUNCTIONAL)[number];

/**
 * Whether this implementation puts datasets behind the form: a data load in
 * the plan, or a Field Fusion request that named the data sets. Without
 * one, "updates the datasets" is not something they need to be able to do.
 */
export function usesDatasets(a: IntakeAnswers): boolean {
  if (a.timeline.services.some((s) => s.kind === "data_load")) return true;
  if ((a.field_fusion.request?.data_sets.length ?? 0) > 0) return true;
  return false;
}

/**
 * The readiness list for THIS customer: what "without us" means for what we
 * are actually implementing. The data items need datasets; anything the
 * owner took off (`readiness_off`) stays off. Never empty — the core four
 * (log in, submit, get the output, add users) are what every account needs.
 */
export function readinessFor(a: IntakeAnswers): FunctionalItem[] {
  const off = new Set(a.readiness_off);
  const data = usesDatasets(a);
  return FUNCTIONAL.filter((f) => {
    if (f.needs === "data" && !data && !off.has(`+${f.key}`)) return false;
    return !off.has(f.key);
  });
}

/** What kind of thing a task is — a meeting held, something someone does, a handoff, or proof they can run it. */
export type TaskKind = "meeting" | "action" | "gate" | "readiness";

export function taskKind(t: FlowTask): TaskKind {
  if (t.action === "kickoff" || t.action === "book_core") return "meeting";
  if (t.key === "kickoff" || t.key === "working" || t.key === "adjust") return "meeting";
  if (t.key.startsWith("func_") || t.key.startsWith("grad_") || t.action === "graduate")
    return "readiness";
  if (
    t.key === "closeout" ||
    t.action === "solution" ||
    t.action === "review" ||
    t.action === "deal_type" ||
    t.action === "assign" ||
    t.action === "field_fusion"
  )
    return "gate";
  return "action";
}

/**
 * The completed map after one tick, with the rule the checklist and the
 * workspace share: the last readiness tick marks the first form live, so
 * nobody ticks the same fact twice.
 */
export function completedAfterTick(
  a: IntakeAnswers,
  current: Record<string, string>,
  doneKey: string,
  on: boolean,
  today: string,
): Record<string, string> {
  const completed = { ...current };
  if (on) completed[doneKey] = today;
  else delete completed[doneKey];
  const readiness = readinessFor(a);
  if (
    on &&
    !completed["live"] &&
    readiness.some((f) => f.key === doneKey) &&
    readiness.every((f) => completed[f.key])
  ) {
    completed["live"] = today;
  }
  return completed;
}

/**
 * Onboarding on the playbook: each stage held, the work between them done,
 * the Functional checklist (which marks the first form live when it is
 * full), what the SOW bought, the optional activation session, and the
 * close-out that hands the account to Customer Success.
 */
function playbookOnboarding(a: IntakeAnswers, t: Timeline): FlowTask[] {
  const done = a.timeline.completed;
  const tick = (
    key: string,
    label: string,
    hint: string,
    extra: Partial<FlowTask> = {},
  ): FlowTask => ({
    key,
    label,
    hint,
    done: Boolean(done[key]),
    summary: done[key] ? `Done ${shortDay(done[key])}` : null,
    action: "tick",
    locked: null,
    doneKey: key,
    ...extra,
  });
  const at = (k: string) => t.milestones.find((m) => m.key === k);
  const stage = (k: string) => {
    const m = at(k)!;
    return tick(k, m.label, m.detail, {
      date: m.date,
      done: Boolean(m.doneOn),
      summary: m.doneOn ? `Held ${shortDay(m.doneOn)}` : null,
    });
  };
  const out: FlowTask[] = [
    stage("kickoff"),
    tick(
      "between_1",
      "Between 1 and 2: they tested and sent what was missing; we prepared Stage 2",
      "If they have not tested, say so now — do not find out on the Stage 2 call.",
      { date: at("homework")?.date ?? null },
    ),
    stage("working"),
    tick(
      "between_2",
      "Between 2 and 3: real users submitting; outputs and admin prepared",
      "Real submissions in, the agreed fixes made, and the Stage 3 attendees confirmed.",
      { date: at("fieldtest")?.date ?? null },
    ),
    stage("adjust"),
    ...readinessFor(a).map((f) =>
      tick(f.key, f.label, "Checked with them, on their account.", {
        group: "Functional — what they can do without us",
        date: at("live")?.date ?? null,
      }),
    ),
  ];
  const services = [...t.alongside, ...t.phases.flatMap((p) => p.services)];
  for (const s of services) {
    const last = s.milestones[s.milestones.length - 1];
    const key = last?.key ?? `${s.id}:live`;
    out.push({
      key: `svc:${s.id}`,
      label: `${s.name || s.label} complete`,
      hint:
        s.kind === "integration"
          ? "Connected, tested end to end, and live."
          : "Delivered and signed off.",
      done: Boolean(s.doneOn),
      summary: s.doneOn ? `Done ${shortDay(s.doneOn)}` : null,
      action: "tick",
      locked: null,
      date: s.endsOn,
      doneKey: key,
      group: "What the SOW bought",
    });
  }
  out.push(
    tick(
      "activate",
      "Activate & Optimize with their real users",
      "For larger or adoption-sensitive rollouts: watch real users run it, and fix where they hesitate.",
      { optional: true, group: "Week 4" },
    ),
    tick(
      "closeout",
      "Close-out: parking lot reviewed, follow-ups scheduled, handed to Customer Success",
      "The core is done when they are Functional; anything left is scheduled on purpose, not left as unfinished implementation.",
      { group: "Week 4" },
    ),
  );
  return out;
}

function onboardingTasks(a: IntakeAnswers, t: Timeline | null | undefined): FlowTask[] {
  if (!t) return [];
  if (a.path === "new_logo") return playbookOnboarding(a, t);
  const out: FlowTask[] = [];
  for (const m of t.milestones) {
    if (m.kind !== "call" && m.key !== "live") continue;
    out.push({
      key: m.key,
      label: m.label,
      hint: m.detail,
      done: Boolean(m.doneOn),
      summary: m.doneOn ? `Done ${shortDay(m.doneOn)}` : null,
      action: "tick",
      locked: null,
      date: m.date,
      doneKey: m.key,
    });
  }
  const services = [...t.alongside, ...t.phases.flatMap((p) => p.services)];
  for (const s of services) {
    const last = s.milestones[s.milestones.length - 1];
    const key = last?.key ?? `${s.id}:live`;
    out.push({
      key: `svc:${s.id}`,
      label: `${s.name || s.label} complete`,
      hint:
        s.kind === "integration"
          ? "Connected, tested end to end, and live."
          : "Delivered and signed off.",
      done: Boolean(s.doneOn),
      summary: s.doneOn ? `Done ${shortDay(s.doneOn)}` : null,
      action: "tick",
      locked: null,
      date: s.endsOn,
      doneKey: key,
    });
  }
  for (const g of graduationChecks(a, t)) out.push(g);
  return out;
}

/**
 * The plan's steps, dealt to the operating model's stages.
 *
 * Get it working ends at "Working end to end": Stage 1 held, the plan and
 * dates agreed (the baseline), one submission end to end. Make it yours
 * ends at "Ready to run": Stage 2 held, real data in, the readiness list
 * (Functional). Make it run ends at "Operational Go-Live": Stage 3 held,
 * what the SOW bought delivered, real users running it. Implementation
 * Complete is the proof window: the close-out and the graduation checks,
 * then the finish. The same keys on every plan, so one deal works for a
 * new logo, an existing account, a conversion and training alike.
 */
export type TasksByStage = {
  kickoff: FlowTask[];
  get_it_working: FlowTask[];
  make_it_yours: FlowTask[];
  make_it_run: FlowTask[];
  complete: FlowTask[];
};

const GIW_KEYS = new Set(["between_1"]);
const MIY_KEYS = new Set(["working", "between_2"]);
const MIR_KEYS = new Set(["adjust", "live", "activate"]);
const COMPLETE_KEYS = new Set(["closeout"]);

export function tasksByStage(a: IntakeAnswers, t: Timeline | null | undefined): TasksByStage {
  const out: TasksByStage = {
    kickoff: [],
    get_it_working: [],
    make_it_yours: [],
    make_it_run: [],
    complete: [],
  };
  if (!t) return out;
  const done = a.timeline.completed;
  const tick = (
    key: string,
    label: string,
    hint: string,
    extra: Partial<FlowTask> = {},
  ): FlowTask => ({
    key,
    label,
    hint,
    done: Boolean(done[key]),
    summary: done[key] ? `Done ${shortDay(done[key])}` : null,
    action: "tick",
    locked: null,
    doneKey: key,
    ...extra,
  });
  for (const task of onboardingTasks(a, t)) {
    if (task.key === "kickoff") out.kickoff.push(task);
    else if (GIW_KEYS.has(task.key)) out.get_it_working.push(task);
    else if (MIY_KEYS.has(task.key) || task.key.startsWith("func_")) out.make_it_yours.push(task);
    else if (MIR_KEYS.has(task.key) || task.key.startsWith("svc:")) out.make_it_run.push(task);
    else if (COMPLETE_KEYS.has(task.key) || task.key.startsWith("grad_")) out.complete.push(task);
    else out.make_it_run.push(task);
  }
  // The gates' own facts, which no meeting records on its own.
  const afterKickoff = out.get_it_working.findIndex((x) => x.key === "kickoff") + 1;
  out.get_it_working.splice(
    afterKickoff,
    0,
    tick(
      "baseline_locked",
      "Plan and dates agreed with the customer — baseline locked",
      "The go-live the customer agreed to in Stage 1. It never moves; a later change is a new target with a reason.",
      { group: "Working end to end" },
    ),
    tick(
      "e2e_working",
      "One submission went end to end on their account",
      "From the phone to the output, on real data, in their own account — not ours.",
      { group: "Working end to end" },
    ),
  );
  out.make_it_run.push(
    tick(
      "go_live",
      "Operational Go-Live: their people are using it for real",
      "The intended users submit real work without us. Time to value ends here.",
      { group: "Operational Go-Live" },
    ),
  );
  // Purchased solutions: Ready to run waits on every launch-critical one
  // being Accepted; Implementation Complete waits on every one having an
  // ending — Accepted, Descoped or Transferred. Read-only here; the work and
  // the decision live on the Solutions card.
  const services = normalizeServices(a.timeline.services as ServiceSpec[], a.timeline);
  for (const s of launchCriticalOpen(services, done)) {
    out.make_it_yours.push({
      key: `lc:${s.id}`,
      label: `${s.name || SOLUTION_LABEL[s.kind]} accepted (launch-critical)`,
      hint:
        s.acceptance?.trim() ||
        "Must be Accepted before Operational Go-Live. Managed on the Solutions card.",
      done: false,
      summary: `${SOLUTION_STATUS_LABEL[solutionStatus(s, done)]}`,
      action: "solution",
      locked: null,
      group: "Launch-critical solutions",
    });
  }
  for (const s of undispositioned(services, done)) {
    out.complete.push({
      key: `disp:${s.id}`,
      label: `${s.name || SOLUTION_LABEL[s.kind]}: Accepted, Descoped or Transferred`,
      hint: "Every purchased solution ends one of three ways; the TIS cannot decide alone. On the Solutions card.",
      done: false,
      summary: SOLUTION_STATUS_LABEL[solutionStatus(s, done)],
      action: "solution",
      locked: null,
      group: "Closing out solutions",
    });
  }
  return out;
}

/**
 * Graduation: the proof they can run it without us. These gate "Complete",
 * so an account is never closed out while its admin still calls us to add a
 * field. Ticked by the owner; stored with the other handoff ticks.
 */
export const GRADUATION = [
  {
    key: "grad_admin_built",
    label: "Their admin built or changed a form without us",
    hint: "The real test of self-sufficiency: a change we did not make, published by them.",
  },
  {
    key: "grad_second",
    label: "A second form or process is live",
    hint: "The next use case, running — usually the second form from the kickoff list.",
  },
  {
    key: "grad_office",
    label: "The office works from the data",
    hint: "Emails, the PDF, reports or exports in daily use — nobody retyping submissions.",
  },
] as const;

function graduationChecks(a: IntakeAnswers, t: Timeline): FlowTask[] {
  const training = t.training;
  return GRADUATION.filter((g) => !(training && g.key === "grad_second")).map((g) => {
    const on = a.handoff_tasks[g.key];
    return {
      key: g.key,
      label: g.label,
      hint: g.hint,
      done: Boolean(on),
      summary: on ? `Done ${stampDay(on)}` : null,
      action: "graduate" as const,
      locked: null,
      date: null,
    };
  });
}

export function stageFlow(input: StageFlowInput): StageFlow {
  const a = readIntake(input.intake);
  const current = flowStageOf(input.stage);
  const closed = current !== null && current !== "prospect" && current !== "negotiate";
  const cw = closedWonTasks(a, input, closed || current === "negotiate");
  const pk = preKickoffTasks(a);
  const ob = tasksByStage(a, input.timeline);
  // The one Graduation task this module cannot compute itself — whether the
  // brief is attached lives in account_files, which this pure function never
  // reads. First in the stage: the brief is written reviewing the whole
  // engagement, before the close-out and the graduation checks below it.
  const graduationBrief: FlowTask = {
    key: "graduation_brief",
    label: "Upload the post-implementation brief",
    hint: "Attach a brief if one is needed for the Customer Success handoff.",
    done: Boolean(input.hasGraduationBrief),
    summary: input.hasGraduationBrief ? "Attached" : null,
    action: "upload_brief",
    locked: null,
    optional: true,
  };
  const completeTasks = [graduationBrief, ...ob.complete];
  // Without the plan the middle stages have no tasks to judge; they are not
  // passed through on that account.
  const hasPlan = Boolean(input.timeline);
  // Optional tasks are offered, never waited on. A stage with no tasks is
  // not done unless `emptyIsDone`: Closed Won and Pre-Kickoff always have
  // work; a middle stage with nothing for this setup is passed through.
  const allDone = (ts: FlowTask[], emptyIsDone = false) =>
    ts.length > 0 ? ts.every((x) => x.done || x.optional) : emptyIsDone;

  const stages: StageFlow["stages"] = [
    // Prospect has no tasks of its own: the Closed Won ones can be worked
    // ahead, and the deal moves on when it is marked won.
    {
      key: "prospect",
      label: flowLabel("prospect"),
      tasks: [],
      done: closed || current === "negotiate",
    },
    // Negotiate & Finalize is a pre-close wait only the deals in it pass
    // through, so it shows on the rail only while the deal is there.
    ...(current === "negotiate"
      ? [{ key: "negotiate" as const, label: flowLabel("negotiate"), tasks: [], done: false }]
      : []),
    { key: "closed_won", label: flowLabel("closed_won"), tasks: cw, done: allDone(cw) },
    ...(current === "field_fusion" || a.path === "field_fusion"
      ? [
          {
            key: "field_fusion" as const,
            label: flowLabel("field_fusion"),
            tasks: [
              {
                key: "field_fusion",
                label: "Confirm the setup and hand to implementation",
                hint: "Form connected, client trained, a note for implementation.",
                done: Boolean(a.field_fusion.handed_off_at),
                summary: a.field_fusion.handed_off_at ? "Handed to implementation" : null,
                action: "field_fusion" as const,
                locked: null,
              },
            ],
            done: Boolean(a.field_fusion.handed_off_at),
          },
        ]
      : []),
    { key: "pre_kickoff", label: flowLabel("pre_kickoff"), tasks: pk, done: allDone(pk) },
    // Kickoff: the call itself, booked by Pre-Kickoff and held here. Without
    // a plan there is nothing to judge it by, so — like the three middle
    // stages below — it is not passed through on that account.
    {
      key: "kickoff",
      label: flowLabel("kickoff"),
      tasks: ob.kickoff,
      done: allDone(ob.kickoff, hasPlan),
    },
    // The operating model's three middle stages. A stage with nothing to do
    // for this setup (a services-only add-on has no Stage 2) passes on its own.
    {
      key: "get_it_working",
      label: flowLabel("get_it_working"),
      tasks: ob.get_it_working,
      done: allDone(ob.get_it_working, hasPlan),
    },
    {
      key: "make_it_yours",
      label: flowLabel("make_it_yours"),
      tasks: ob.make_it_yours,
      done: allDone(ob.make_it_yours, hasPlan),
    },
    {
      key: "make_it_run",
      label: flowLabel("make_it_run"),
      tasks: ob.make_it_run,
      done: allDone(ob.make_it_run, hasPlan),
    },
    // Implementation Complete is a stage, not a tick: the proof window, the
    // close-out, then the finish — Proven or Not Proven — recorded on the deal.
    {
      key: "complete",
      label: flowLabel("complete"),
      tasks: completeTasks,
      done: current === "complete" && a.outcome !== null,
    },
  ];

  // Forward only, one gate per stage, and as far as the gates allow: a deal
  // that did everything for two stages at once moves two stages. Complete
  // is the last stop; the finish is a person's call.
  let advanceTo: AccountStage | null = null;
  const rail: FlowStageKey[] = [
    "pre_kickoff",
    "kickoff",
    "get_it_working",
    "make_it_yours",
    "make_it_run",
    "complete",
  ];
  const doneAt = (k: FlowStageKey) => Boolean(stages.find((s) => s.key === k)?.done);
  const walkFrom = (k: FlowStageKey): AccountStage | null => {
    let i = rail.indexOf(k);
    let target: FlowStageKey | null = null;
    while (i < rail.length - 1 && doneAt(rail[i]!)) {
      i += 1;
      target = rail[i]!;
    }
    return target ? FLOW_STAGES.find((s) => s.key === target)!.stage : null;
  };
  if (current === "closed_won" && allDone(cw)) {
    // A Field Fusion account goes to its setup stage first (the setup owner
    // hands it on); the checklist never skips it into Pre-Kickoff.
    if (a.path === "field_fusion" && !a.field_fusion.handed_off_at) advanceTo = null;
    else advanceTo = walkFrom("pre_kickoff") ?? "onboarding_kickoff";
  } else if (current && rail.includes(current) && current !== "complete") {
    advanceTo = walkFrom(current);
  }
  return { current, stages, advanceTo };
}

/**
 * The steps still open on the stages a move would skip past: everything
 * from the current stage up to (not including) the target, required and
 * not done. Empty means the move is earned. Pre-Kickoff onward only — the
 * Closed Won work is gated by the close itself.
 */
export function openStepsBefore(flow: StageFlow, toStage: AccountStage): FlowTask[] {
  const target = FLOW_STAGES.find((s) => s.stage === toStage)?.key;
  if (!target) return [];
  const keys = flow.stages.map((s) => s.key);
  const to = keys.indexOf(target);
  if (to < 0) return [];
  const from = Math.max(keys.indexOf(flow.current ?? "prospect"), keys.indexOf("pre_kickoff"));
  if (from < 0 || to <= from) return [];
  return flow.stages
    .slice(from, to)
    .filter((s) => s.key !== "closed_won" && s.key !== "field_fusion")
    .flatMap((s) => s.tasks.filter((t) => !t.done && !t.optional && !t.locked));
}

/**
 * Whether the implementation's transcript panel should offer the "Meeting
 * outcome / Kickoff held" confirmation: only while the deal's actual current
 * stage (never a historical stage picked on the rail) is Kickoff, and the
 * Kickoff task on that stage is not done yet.
 */
export function showKickoffOutcomePrompt(flow: StageFlow): boolean {
  if (flow.current !== "kickoff") return false;
  return !flow.stages.find((s) => s.key === "kickoff")?.done;
}

function flowSummary(a: IntakeAnswers): string {
  const head =
    a.path === "new_logo"
      ? "New logo"
      : a.path === "existing"
        ? "Existing account"
        : a.path === "dm_conversion"
          ? "Device Magic conversion"
          : "Field Fusion";
  if (a.path === "field_fusion" || a.training_only) return `${head} · training`;
  const first = firstFormName(a);
  return first ? `${head} · ${first}` : head;
}

function joinAnd(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/**
 * The one line every list shows for a deal: the next task of the stage it
 * is in, from the same rules as the deal's checklist. Null when the stage
 * has nothing left for a person to do.
 */
export function nextChecklistTask(input: StageFlowInput): string | null {
  const f = stageFlow(input);
  // A prospect's next task is the Closed Won work it can do ahead.
  const key =
    f.current === null || f.current === "prospect" || f.current === "negotiate"
      ? "closed_won"
      : f.current;
  const stage = f.stages.find((s) => s.key === key);
  if (!stage) return null;
  const next = stage.tasks.find((t) => !t.done && !t.locked) ?? stage.tasks.find((t) => !t.done);
  return next?.label ?? null;
}

/**
 * How long a deal may sit in a stage, in business days, before the owner is
 * nudged (warn) and then the managers too (escalate). One table, read by the
 * board, Home and the hourly nudge, so "stuck" means the same everywhere.
 * Onboarding's limit sits past the 15-day plan: the plan's own overdue calls
 * are nudged separately.
 */
export const STAGE_LIMITS: Readonly<Record<string, { warn: number; escalate: number }>> = {
  closed_won: { warn: 2, escalate: 4 },
  field_fusion_setup: { warn: 3, escalate: 5 },
  onboarding_kickoff: { warn: 3, escalate: 5 },
  // Kickoff itself should be brief: booked and held within days.
  kickoff: { warn: 3, escalate: 5 },
  // The three stages inside the 15-business-day plan; placeholders until the
  // team sets them (operating model: "target durations by stage" to validate).
  get_it_working: { warn: 5, escalate: 8 },
  make_it_yours: { warn: 8, escalate: 12 },
  make_it_run: { warn: 8, escalate: 12 },
};

export type StuckLevel = "ok" | "warn" | "escalate";

export function stuckLevel(stage: string, businessDaysInStage: number): StuckLevel {
  const l = STAGE_LIMITS[stage];
  if (!l) return "ok";
  return businessDaysInStage >= l.escalate
    ? "escalate"
    : businessDaysInStage >= l.warn
      ? "warn"
      : "ok";
}

export type Nudge = {
  /** Unique per deal and stage visit, so each is sent once. */
  key: string;
  level: "warn" | "escalate";
  /** Who hears: the owner, or the owner and the managers, or managers only. */
  to: "owner" | "owner_and_managers" | "managers";
  subject: string;
  line: string;
};

/**
 * What the hourly sweep should say about a deal, if anything. Pure: the
 * sweep gathers the facts, this decides, and the audit log makes each
 * nudge go out once. Reads the same checklist and limits as every screen.
 */
export function nudgesFor(args: {
  name: string;
  stage: string;
  /** Business days since the deal entered this stage. */
  businessDaysInStage: number;
  /** ISO timestamp the deal entered the stage: part of every key. */
  enteredAt: string;
  flow: StageFlow;
  /** Business days late, per training call not ticked, on Onboarding. */
  overdueCalls?: Array<{ key: string; label: string; date: string; businessDaysLate: number }>;
}): Nudge[] {
  const out: Nudge[] = [];
  const visit = `${args.stage}@${args.enteredAt.slice(0, 10)}`;
  const current = args.flow.stages.find((s) => s.key === args.flow.current);
  const next = current?.tasks.find((t) => !t.done)?.label ?? null;
  const unowned =
    (args.stage === "closed_won" || args.stage === "negotiate") &&
    !(
      args.flow.stages.find((s) => s.key === "closed_won")?.tasks.find((t) => t.key === "assign")
        ?.done ?? true
    );

  if (unowned && args.businessDaysInStage >= 1) {
    const days = `${args.businessDaysInStage} business day${args.businessDaysInStage === 1 ? "" : "s"}`;
    out.push(
      args.stage === "negotiate"
        ? {
            // The Sales change: a TIS within 24 hours of Negotiate & Finalize,
            // so they can join the closing call.
            key: `${visit}:needs_tis`,
            level: "escalate",
            to: "managers",
            subject: `Needs a TIS: ${args.name}`,
            line: `${args.name} reached Negotiate & Finalize ${days} ago and no TIS is assigned yet. Assign one so they can join the closing call, or ask the pool to claim it.`,
          }
        : {
            key: `${visit}:unclaimed`,
            level: "escalate",
            to: "managers",
            subject: `Unclaimed: ${args.name}`,
            line: `${args.name} closed ${days} ago and nobody owns it yet. Assign it, or ask the pool to claim it.`,
          },
    );
  }
  const level = stuckLevel(args.stage, args.businessDaysInStage);
  if (level !== "ok" && !unowned) {
    const where = current?.label ?? args.stage;
    out.push({
      key: `${visit}:${level}`,
      level,
      to: level === "escalate" ? "owner_and_managers" : "owner",
      subject: `${level === "escalate" ? "Stuck" : "Waiting"}: ${args.name} — ${where}`,
      line: `${args.name} has been in ${where} for ${args.businessDaysInStage} business days${next ? `. Next: ${next}.` : "."}`,
    });
  }
  for (const c of args.overdueCalls ?? []) {
    if (c.businessDaysLate < 2) continue;
    out.push({
      key: `${visit}:overdue:${c.key}`,
      level: "warn",
      to: "owner",
      subject: `Overdue: ${args.name} — ${c.label}`,
      line: `${c.label} was due ${c.date}. Tick it on the checklist if it happened, or move the date on the plan so everything after it moves too.`,
    });
  }
  return out;
}
