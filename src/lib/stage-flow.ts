import { firstFormName, flowAnswered, readIntake, type IntakeAnswers } from "./intake-answers";
import type { AccountStage } from "./presale-stages";
import type { Timeline } from "./onboarding-timeline";

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
    plan: "First GoCanvas rollout: three 60-minute training days, first form live in 15 business days.",
  },
  {
    path: "existing",
    label: "Existing account",
    plan: "Already on GoCanvas, buying more: a form review, then the integration or services — 2 to 6 weeks.",
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
  "closed_won" | "field_fusion" | "pre_kickoff" | "onboarding" | "complete";

export const FLOW_STAGES: ReadonlyArray<{ key: FlowStageKey; stage: AccountStage; label: string }> =
  [
    { key: "closed_won", stage: "closed_won", label: "Closed Won" },
    { key: "pre_kickoff", stage: "onboarding_kickoff", label: "Pre-kickoff" },
    { key: "onboarding", stage: "in_onboarding", label: "Onboarding" },
    { key: "complete", stage: "onboarding_complete", label: "Complete" },
  ];

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
  | "tick"
  | "graduate";

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
};

export type StageFlow = {
  /** Where the deal is, in the checklist's terms. Null before Closed Won. */
  current: FlowStageKey | null;
  stages: Array<{ key: FlowStageKey; label: string; tasks: FlowTask[]; done: boolean }>;
  /** The stage the deal should move to now, when its checklist says so. */
  advanceTo: AccountStage | null;
};

/** The cadence we run in Salesloft until the kickoff is on the calendar. */
export const KICKOFF_CADENCE: ReadonlyArray<{ day: string; step: string }> = [
  { day: "Day 0", step: "Reply-all to the AE's email: intro, the welcome page, two kickoff times" },
  { day: "Day 1", step: "Call the champion; leave a voicemail and follow with a short email" },
  { day: "Day 3", step: "Call again; email one time slot with a calendar hold" },
  { day: "Day 5", step: "Email with the AE copied: what they lose by waiting" },
  { day: "Day 7", step: "Escalate to the AE to get the kickoff on the calendar" },
];

/** A reading that started this long ago and never finished died with its request. */
export const READING_STALE_MS = 6 * 60 * 1000;

/** The automatic reading is running right now (and has not quietly died). */
export function readingInFlight(r: IntakeAnswers["ai_reading"], now = Date.now()): boolean {
  return r?.status === "running" && now - Date.parse(r.started_at) < READING_STALE_MS;
}

export const PRE_KICKOFF_TASKS = ["reply_ae", "cadence", "kickoff"] as const;

function flowStageOf(stage: string): FlowStageKey | null {
  switch (stage) {
    case "closed_won":
      return "closed_won";
    case "field_fusion_setup":
      return "field_fusion";
    case "onboarding_kickoff":
      return "pre_kickoff";
    case "in_onboarding":
      return "onboarding";
    case "onboarding_complete":
      return "complete";
    default:
      return null;
  }
}

function closedWonTasks(a: IntakeAnswers, input: StageFlowInput, closed: boolean): FlowTask[] {
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
      hint: "Who runs this onboarding. They get the email with everything below.",
      done: Boolean(input.owner),
      summary: input.owner,
      action: "assign",
      // The owner is the project's owner, and the project is made at the close.
      locked: closed ? null : "Assigned once the deal is Closed Won",
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

/** The internal prep before Stage 1 (the playbook's "come prepared"). */
export const PREP_ITEMS = [
  {
    key: "prep_process",
    label: "Process map",
    hint: "Their workflow, start to finish: field activity → submission → what happens next → where it lands.",
  },
  {
    key: "prep_form",
    label: "Starting form (POC)",
    hint: "A first version of their form built from the calls, so Stage 1 validates instead of starting blank.",
  },
  {
    key: "prep_data",
    label: "Reference-data example",
    hint: "One of their lists — customers, sites, parts — structured the way the form will use it.",
  },
] as const;

/** The three core meetings, booked at the start (the playbook's rule). */
export const CORE_MEETINGS = [
  { key: "kickoff", label: "Stage 1 — Make It Work" },
  { key: "working", label: "Stage 2 — Make It Work for Them" },
  { key: "adjust", label: "Stage 3 — Make It Operational" },
] as const;

function preKickoffTasks(a: IntakeAnswers): FlowTask[] {
  return a.path === "new_logo" ? playbookPreKickoff(a) : classicPreKickoff(a);
}

/** Pre-kickoff on the playbook: the AE, the cadence, prep, all three meetings booked. */
function playbookPreKickoff(a: IntakeAnswers): FlowTask[] {
  const [reply, cadence] = classicPreKickoff(a);
  const t = a.handoff_tasks;
  const prepDone = PREP_ITEMS.filter((p) => t[p.key]).length;
  const booked = CORE_MEETINGS.filter(
    (m) => a.timeline.overrides[m.key] && a.timeline.times[m.key],
  ).length;
  return [
    reply!,
    cadence!,
    {
      key: "prep",
      label: "Prepare before Stage 1",
      hint: "Stage 1 should validate prepared work, not discover it: a process map, a starting form and one real list.",
      done: prepDone === PREP_ITEMS.length,
      summary: prepDone === PREP_ITEMS.length ? "Process map, starting form and data ready" : null,
      action: "prep",
      locked: null,
    },
    {
      key: "kickoff",
      label: "Book all three core meetings",
      hint: "Stage 1, 2 and 3 on the calendar now, sixty minutes each — the structure that keeps the 30 days from drifting.",
      done: booked === CORE_MEETINGS.length,
      summary:
        booked === CORE_MEETINGS.length
          ? CORE_MEETINGS.map(
              (m) => `${a.timeline.overrides[m.key]} ${a.timeline.times[m.key]}`,
            ).join(" · ")
          : booked
            ? `${booked} of 3 booked`
            : null,
      action: "book_core",
      locked: null,
    },
  ];
}

function classicPreKickoff(a: IntakeAnswers): FlowTask[] {
  const t = a.handoff_tasks;
  const kickoffDate = a.timeline.overrides["kickoff"] ?? null;
  const kickoffTime = a.timeline.times["kickoff"] ?? null;
  const booked = Boolean(kickoffDate && kickoffTime);
  return [
    {
      key: "reply_ae",
      label: "Reply to the AE's email",
      hint: "Reply-all: introduce yourself, share the welcome page, offer two kickoff times.",
      done: Boolean(t["reply_ae"]),
      summary: t["reply_ae"] ? `Replied ${t["reply_ae"].slice(0, 10)}` : null,
      action: "reply_ae",
      locked: null,
    },
    {
      key: "cadence",
      label: "Add them to the Salesloft cadence",
      hint: "Calls and emails on a schedule until the kickoff is on the calendar, so nothing goes quiet.",
      done: Boolean(t["cadence"]),
      summary: t["cadence"] ? `In the cadence since ${t["cadence"].slice(0, 10)}` : null,
      action: "cadence",
      locked: null,
    },
    {
      key: "kickoff",
      label: "Book the kickoff call",
      hint: "Training day 1, sixty minutes. The date and time go on the plan and every date after it follows.",
      done: booked,
      summary: booked ? `${kickoffDate} at ${kickoffTime}` : null,
      action: "kickoff",
      locked: null,
    },
  ];
}

/**
 * The Onboarding stage: only what a person can honestly tick and a manager
 * wants to see — each training call held, the first form live, each thing
 * the SOW bought delivered, then the graduation checks. The homework and
 * field-test days stay on the plan, where they are dates, not chores.
 */
/** What "Functional" means: the minimum they can do without us, checked on a call. */
export const FUNCTIONAL = [
  { key: "func_web_login", label: "Logs into the web portal" },
  { key: "func_mobile_login", label: "Logs into the mobile app" },
  { key: "func_submit", label: "Opens, completes and submits the main workflow" },
  { key: "func_output", label: "Gets the output — the PDF, the email" },
  { key: "func_users", label: "Adds users and updates roles and access" },
  { key: "func_edit", label: "Makes a basic form edit and republishes" },
  { key: "func_data_open", label: "Opens the datasets that power the form" },
  { key: "func_data_update", label: "Updates those datasets when things change" },
] as const;

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
    summary: done[key] ? `Done ${done[key]}` : null,
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
      summary: m.doneOn ? `Held ${m.doneOn}` : null,
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
    ...FUNCTIONAL.map((f) =>
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
      summary: s.doneOn ? `Done ${s.doneOn}` : null,
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
      summary: m.doneOn ? `Done ${m.doneOn}` : null,
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
      summary: s.doneOn ? `Done ${s.doneOn}` : null,
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
      summary: on ? `Done ${on.slice(0, 10)}` : null,
      action: "graduate" as const,
      locked: null,
      date: null,
    };
  });
}

export function stageFlow(input: StageFlowInput): StageFlow {
  const a = readIntake(input.intake);
  const current = flowStageOf(input.stage);
  const cw = closedWonTasks(a, input, current !== null);
  const pk = preKickoffTasks(a);
  const ob = onboardingTasks(a, input.timeline);
  // Optional tasks are offered, never waited on.
  const allDone = (ts: FlowTask[]) => ts.length > 0 && ts.every((x) => x.done || x.optional);

  const stages: StageFlow["stages"] = [
    { key: "closed_won", label: "Closed Won", tasks: cw, done: allDone(cw) },
    ...(current === "field_fusion" || a.path === "field_fusion"
      ? [
          {
            key: "field_fusion" as const,
            label: "Field Fusion setup",
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
    { key: "pre_kickoff", label: "Pre-kickoff", tasks: pk, done: allDone(pk) },
    { key: "onboarding", label: "Onboarding", tasks: ob, done: allDone(ob) },
    { key: "complete", label: "Complete", tasks: [], done: current === "complete" },
  ];

  // Forward only, and one rule per stage. A deal that did everything for
  // two stages at once moves two stages: nobody should have to watch it
  // step through Pre-kickoff to reach Onboarding.
  let advanceTo: AccountStage | null = null;
  if (current === "closed_won" && allDone(cw)) {
    advanceTo = allDone(pk) ? "in_onboarding" : "onboarding_kickoff";
  } else if (current === "pre_kickoff" && allDone(pk)) {
    advanceTo = "in_onboarding";
  }
  return { current, stages, advanceTo };
}

function flowSummary(a: IntakeAnswers): string {
  const head =
    a.path === "new_logo"
      ? "New customer"
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
  const stage = f.stages.find((s) => s.key === (f.current ?? "closed_won"));
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
  in_onboarding: { warn: 20, escalate: 30 },
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
    args.stage === "closed_won" &&
    !(args.flow.stages[0]?.tasks.find((t) => t.key === "assign")?.done ?? true);

  if (unowned && args.businessDaysInStage >= 1) {
    out.push({
      key: `${visit}:unclaimed`,
      level: "escalate",
      to: "managers",
      subject: `Unclaimed: ${args.name}`,
      line: `${args.name} closed ${args.businessDaysInStage} business day${args.businessDaysInStage === 1 ? "" : "s"} ago and nobody owns it yet. Assign it, or ask the pool to claim it.`,
    });
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
