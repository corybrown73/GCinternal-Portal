import type { IntakeAnswers } from "./intake-answers";
import type { Milestone, Timeline } from "./onboarding-timeline";
import { dayCounter } from "./onboarding-timeline";
import type { ParkingItem } from "./parking-lot.server";
import {
  flowLabel,
  taskKind,
  type FlowStageKey,
  type FlowTask,
  type StageFlow,
  type TaskKind,
  ONBOARDING_FLOW_KEYS,
  STAGE_GATE,
} from "./stage-flow";

/**
 * The implementation owner's workspace: one screen that answers, in order,
 * where are we, what do I do now, what am I waiting on, what is my next
 * step, when is the next meeting. It reads the same checklist, plan,
 * parking lot and homework the rest of the page reads — nothing here is a
 * second model — and shows only the window of work before the next stage.
 * Between Stage 1 and Stage 2 the owner sees what has to happen before
 * Stage 2, not the road to close-out.
 */

export type WorkItem = FlowTask & { kind: TaskKind };

export type Waiting = {
  who: "customer" | "gocanvas";
  what: string;
  /** ISO date or timestamp, when known. */
  since: string | null;
  source: "homework" | "parking_lot" | "reply" | "link" | "recap" | "between";
};

export type NextMeeting = {
  key: string;
  label: string;
  /** The plan's date. */
  date: string;
  /** "HH:MM" when booked. */
  time: string | null;
  booked: boolean;
  /** Business-day distance today → date; negative once it has passed. */
  minutes: number | null;
};

export type Workspace = {
  where: {
    stage: FlowStageKey | null;
    stageLabel: string;
    /** The gate this stage ends at (the operating model), or null before the close. */
    gate: string | null;
    /** "Day 6 of 15" and its second line, once the deal has closed. */
    day: { label: string; detail: string; state: string } | null;
    /** The plan's finish line: a target, said as one. */
    target: { word: string; date: string } | null;
  };
  /** What this window is: "Before Stage 1", "Between Stage 1 and Stage 2", "After Stage 3". */
  windowLabel: string;
  /** The window's items, in the checklist's order. */
  now: WorkItem[];
  /** The first open, unlocked, required item. */
  nextStep: WorkItem | null;
  nextMeeting: NextMeeting | null;
  waiting: Waiting[];
  /** Open parking-lot items on our side, for the count. */
  ourOpen: number;
};

export type WorkspaceInput = {
  flow: StageFlow;
  intake: IntakeAnswers;
  timeline: Timeline | null;
  today: string;
  parkingLot: ParkingItem[];
  /** The customer's ticks on their welcome page, when the page has loaded them. */
  homeworkDone: Record<string, string>;
  /** The welcome link: sent and opened stamps, when known. */
  link: { sharedAt: string | null; openedAt: string | null } | null;
};

const HOMEWORK_LABEL: Record<string, string> = {
  app: "Install the app",
  user: "Add a field user",
  list: "Send us their list",
};

function isMeeting(t: FlowTask): boolean {
  return taskKind(t) === "meeting";
}

function withKind(t: FlowTask): WorkItem {
  return { ...t, kind: taskKind(t) };
}

/** The core meetings on the plan, in date order, as the plan holds them. */
function calls(t: Timeline | null): Milestone[] {
  if (!t) return [];
  return t.milestones
    .filter((m) => m.kind === "call" && !m.serviceId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The window of work on the Onboarding stage: everything up to and
 * including the first meeting not yet held, plus any service due by then.
 * Once every meeting is held, what is left — readiness, the services, the
 * close-out.
 */
function onboardingWindow(tasks: FlowTask[]): { items: WorkItem[]; label: string } {
  const meetings = tasks.filter(isMeeting);
  const nextIdx = meetings.findIndex((m) => !m.done);
  if (nextIdx === -1) {
    const last = meetings[meetings.length - 1];
    return {
      items: tasks.filter((x) => !isMeeting(x) || !x.done).map(withKind),
      label: last ? `After ${shortMeeting(last.label)} — finishing` : "Finishing",
    };
  }
  const next = meetings[nextIdx]!;
  const prev = meetings[nextIdx - 1];
  const cutoff = tasks.indexOf(next);
  const before = tasks.slice(0, cutoff + 1);
  // Services in flight alongside, due on or before the next meeting.
  const nextDate = next.date ?? null;
  const alongside = tasks
    .slice(cutoff + 1)
    .filter((x) => x.key.startsWith("svc:") && x.date && nextDate && x.date <= nextDate);
  const items = [...before, ...alongside].map(withKind);
  const label = prev
    ? `Between ${shortMeeting(prev.label)} and ${shortMeeting(next.label)}`
    : `Before ${shortMeeting(next.label)}`;
  return { items, label };
}

/** "Stage 2 — Make it yours" → "Stage 2"; "Session 1 — …" → "Session 1". */
export function shortMeeting(label: string): string {
  const m = label.match(/^(Stage|Session|Training day)\s+\d+/i);
  return m ? m[0] : label.split(" — ")[0]!;
}

export function workspaceFor(input: WorkspaceInput): Workspace {
  const { flow, intake, timeline, today } = input;
  const current = flow.current;
  const stage = flow.stages.find((s) => s.key === current);
  const tasks = stage?.tasks ?? [];

  // WHERE ARE WE.
  const closed = current !== null && current !== "prospect" && current !== "negotiate";
  const day =
    timeline && closed && (current === "pre_kickoff" || ONBOARDING_FLOW_KEYS.includes(current))
      ? (() => {
          const c = dayCounter(timeline, today);
          return { label: c.label, detail: c.detail, state: c.state };
        })()
      : null;
  const target =
    timeline && closed && current !== "complete"
      ? {
          word: intake.path === "new_logo" ? "Functional" : timeline.training ? "Trained" : "Live",
          date: timeline.liveDate,
        }
      : null;

  // WHAT NOW. Closed Won, Field Fusion and Pre-Kickoff are one window each;
  // the three middle stages are each their own window — the stage's work,
  // windowed by its meeting — and Complete is the close-out.
  let now: WorkItem[];
  let windowLabel: string;
  if (current && ONBOARDING_FLOW_KEYS.includes(current)) {
    const w = onboardingWindow(tasks);
    now = w.items;
    windowLabel = `${stage?.label ?? flowLabel(current)} · ${w.label}`;
  } else if (current === "complete") {
    now = tasks.map(withKind);
    windowLabel = intake.outcome
      ? intake.outcome.kind === "proven"
        ? "Complete — Proven"
        : "Complete — Not Proven"
      : "Implementation Complete · the proof window";
  } else if (current === "pre_kickoff") {
    now = tasks.map(withKind);
    const first = calls(timeline)[0];
    windowLabel = first ? `Before ${shortMeeting(first.label)}` : "Before the first meeting";
  } else if (current === "prospect" || current === "negotiate" || current === null) {
    const cw = flow.stages.find((s) => s.key === "closed_won");
    now = (cw?.tasks ?? []).filter((t) => !t.locked).map(withKind);
    windowLabel = "Before the close";
  } else {
    now = tasks.map(withKind);
    windowLabel = stage ? stage.label : flowLabel(current);
  }

  const nextStep = now.find((t) => !t.done && !t.locked && !t.optional) ?? null;

  // NEXT MEETING: the first core call not held, as the plan dates it.
  const upcoming = calls(timeline).find((m) => !m.doneOn) ?? null;
  const booked = upcoming
    ? Boolean(intake.timeline.overrides[upcoming.key] && intake.timeline.times[upcoming.key])
    : false;
  const nextMeeting: NextMeeting | null = upcoming
    ? {
        key: upcoming.key,
        label: upcoming.label,
        date: upcoming.date,
        time: upcoming.time,
        booked,
        minutes: upcoming.minutes ?? intake.timeline.session_minutes ?? null,
      }
    : null;

  // WAITING ON. Only what is genuinely on someone else's desk.
  const waiting: Waiting[] = [];
  const replied = intake.handoff_tasks["reply_ae"] ?? null;
  if (current === "pre_kickoff" && replied && upcoming && !booked) {
    waiting.push({
      who: "customer",
      what: `A time for ${shortMeeting(upcoming.label)} — the reply went out, nothing is on the calendar yet`,
      since: replied,
      source: "reply",
    });
  }
  if (closed && current !== "complete" && input.link?.sharedAt && !input.link.openedAt) {
    waiting.push({
      who: "customer",
      what: "Their welcome page — the link was sent and has not been opened",
      since: input.link.sharedAt,
      source: "link",
    });
  }
  // Between Stage 1 and Stage 2: the homework on their page.
  if (current && ONBOARDING_FLOW_KEYS.includes(current) && timeline) {
    const held = calls(timeline).filter((m) => m.doneOn);
    const first = calls(timeline)[0];
    if (first?.doneOn && !upcoming?.doneOn && held.length === 1) {
      for (const [k, label] of Object.entries(HOMEWORK_LABEL)) {
        if (!input.homeworkDone[k]) {
          waiting.push({ who: "customer", what: label, since: first.doneOn, source: "homework" });
        }
      }
    }
    // The last recap's "their part".
    const lastHeld = held[held.length - 1];
    const recap = lastHeld ? intake.recaps[lastHeld.key] : undefined;
    if (recap?.customer_prep?.trim()) {
      waiting.push({
        who: "customer",
        what: `${recap.customer_prep.trim()} (from the ${shortMeeting(lastHeld!.label)} recap)`,
        since: recap.at ?? lastHeld!.doneOn,
        source: "recap",
      });
    }
    if (recap?.gocanvas_prep?.trim()) {
      waiting.push({
        who: "gocanvas",
        what: `${recap.gocanvas_prep.trim()} (from the ${shortMeeting(lastHeld!.label)} recap)`,
        since: recap.at ?? lastHeld!.doneOn,
        source: "recap",
      });
    }
  }
  for (const p of input.parkingLot) {
    if (p.status !== "open" && p.status !== "scheduled") continue;
    if (p.owner === "gocanvas") continue;
    waiting.push({
      who: "customer",
      what: p.request + (p.target ? ` · by ${p.target}` : ""),
      since: p.created_at,
      source: "parking_lot",
    });
  }
  const ourOpen = input.parkingLot.filter(
    (p) => (p.status === "open" || p.status === "scheduled") && p.owner !== "customer",
  ).length;

  return {
    where: {
      stage: current,
      stageLabel: current ? flowLabel(current) : "—",
      gate: current ? (STAGE_GATE[current] ?? null) : null,
      day,
      target,
    },
    windowLabel,
    now,
    nextStep,
    nextMeeting,
    waiting,
    ourOpen,
  };
}

/** The window's items by kind, in a fixed order, empty kinds left out. */
export const KIND_ORDER: ReadonlyArray<{ kind: TaskKind; label: string; hint: string }> = [
  { kind: "meeting", label: "Meetings", hint: "Held, or on the calendar." },
  { kind: "action", label: "To do", hint: "Something somebody does — you, or them." },
  { kind: "gate", label: "Handoffs", hint: "A line the account crosses once, on purpose." },
  {
    kind: "readiness",
    label: "Readiness — what they can do without us",
    hint: "Checked with them, on their account. Not a tick for us; proof for them.",
  },
];

export function byKind(
  items: WorkItem[],
): Array<{ kind: TaskKind; label: string; hint: string; items: WorkItem[] }> {
  return KIND_ORDER.map((k) => ({ ...k, items: items.filter((i) => i.kind === k.kind) })).filter(
    (g) => g.items.length > 0,
  );
}
