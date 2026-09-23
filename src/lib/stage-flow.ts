import { flowAnswered, readIntake, type IntakeAnswers } from "./intake-answers";
import type { AccountStage } from "./presale-stages";
import type { Timeline } from "./onboarding-timeline";

/**
 * The deal's stages as a checklist: what each stage asks of the person who
 * owns it, and when the deal moves on by itself.
 *
 *   Closed Won    assign it · the Gong recording · the SOW · the flow ·
 *                 generate the welcome brief            → Pre-kickoff
 *   Pre-kickoff   reply to the AE · the Salesloft cadence ·
 *                 book the kickoff call                 → Onboarding
 *   Onboarding    the three training days, the form, the field test, the
 *                 first process live, and every service the SOW bought
 *                                                       → Complete (a person presses it)
 *
 * Pure, so the page, the server that moves the stage, and the tests all read
 * the same rules. A stage moves forward only, and only when every task in it
 * is done; nothing here ever moves a deal back.
 */

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
  | "assign"
  | "notes"
  | "sow"
  | "flow"
  | "generate"
  | "reply_ae"
  | "cadence"
  | "kickoff"
  | "field_fusion"
  | "tick";

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
  const before: string[] = [];
  if (!hasNotes) before.push("the Gong recording");
  if (!paperDone) before.push("the SOW");
  if (!flowDone) before.push("the flow");
  return [
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
      label: "Add the Gong recording",
      hint: "Paste the Gong transcript or the call notes. The brief is written from them.",
      done: hasNotes,
      summary: hasNotes
        ? `${input.gongReports} call note${input.gongReports === 1 ? "" : "s"} on file`
        : null,
      action: "notes",
      locked: null,
    },
    {
      key: "sow",
      label: "Upload the SOW",
      hint: "The signed SOW. Integrations and services come from it, never from the notes.",
      done: paperDone,
      summary: input.hasSow ? "SOW on file" : a.has_sow === false ? "No SOW — core only" : null,
      action: "sow",
      locked: null,
    },
    {
      key: "flow",
      label: "Confirm the onboarding flow",
      hint: "Pre-picked from the calls. Check it, and name the first form.",
      done: flowDone,
      summary: flowDone ? flowSummary(a) : null,
      action: "flow",
      locked: null,
    },
    {
      key: "generate",
      label: "Generate the welcome brief",
      hint: "Writes the brief, reads the SOW into the plan, and builds the kickoff deck and the customer's page.",
      done: built,
      summary: built ? "Brief and kickoff deck ready" : null,
      action: "generate",
      locked: before.length ? `Needs ${joinAnd(before)} first` : null,
    },
  ];
}

function preKickoffTasks(a: IntakeAnswers): FlowTask[] {
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

function onboardingTasks(a: IntakeAnswers, t: Timeline | null | undefined): FlowTask[] {
  if (!t) return [];
  const completed = a.timeline.completed;
  const out: FlowTask[] = [];
  const buildsAForm = !t.training && !(a.path === "existing" && t.existingBuild === "review");
  for (const m of t.milestones) {
    if (m.key === "close" || m.kind === "homework") continue;
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
    // "Form built" is its own tick: day 2 teaches the build, and the form is
    // finished when it is finished — sometimes on the call, sometimes after.
    if (m.key === "working" && buildsAForm) {
      out.push({
        key: "form_built",
        label: "Form built",
        hint: "The form is finished and published: lists, logic, calculations, the PDF.",
        done: Boolean(completed["form_built"]),
        summary: completed["form_built"] ? `Done ${completed["form_built"]}` : null,
        action: "tick",
        locked: null,
        date: m.date,
        doneKey: "form_built",
      });
    }
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
  return out;
}

export function stageFlow(input: StageFlowInput): StageFlow {
  const a = readIntake(input.intake);
  const current = flowStageOf(input.stage);
  const cw = closedWonTasks(a, input, current !== null);
  const pk = preKickoffTasks(a);
  const ob = onboardingTasks(a, input.timeline);
  const allDone = (ts: FlowTask[]) => ts.length > 0 && ts.every((x) => x.done);

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
  const first = a.wanted_forms[0]?.name ?? a.uploaded_forms[0]?.name ?? null;
  return first ? `${head} · ${first}` : head;
}

function joinAnd(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
