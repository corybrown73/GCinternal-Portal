import type { IntakeAnswers } from "./intake-answers";
import {
  isSolutionKind,
  normalizeServices,
  solutionBall,
  solutionStatus,
  SOLUTION_LABEL,
  type ServiceSpec,
} from "./onboarding-services";
import type { Timeline } from "./onboarding-timeline";
import { shortDay } from "./onboarding-timeline";
import { isPreClose, normalizeStage, type AccountStage } from "./presale-stages";
import { HOMEWORK_KEYS, type HomeworkKey } from "./welcome";

/**
 * The customer's view of where their implementation is: the six stages
 * with the one they are in, who has the ball on each thing they bought,
 * and the dated things that are theirs to do. Read from the same deal
 * stage, plan and solutions the team works from — the customer never sees
 * a second model — said in their words.
 */
export type JourneyStageKey =
  "pre_kickoff" | "kickoff" | "get_it_working" | "make_it_yours" | "make_it_run" | "complete";

export type JourneyStage = {
  key: JourneyStageKey;
  label: string;
  state: "done" | "now" | "later";
  /** One line, for the customer, on what the stage is. */
  blurb: string;
};

export type SolutionBallView = {
  id: string;
  name: string;
  kind: string;
  /** In the customer's words. */
  status: string;
  /** Who holds it: us, you, or nobody because it is finished. */
  who: "us" | "you" | "done";
  /** The date it is wanted by, when one is set — ball.date, else the solution's own due date. */
  when: string | null;
  /** The customer can say "tested, it works" and hand the ball back. */
  canConfirm: boolean;
  note: string | null;
  /**
   * The person explicitly recorded as responsible for this ball. Read from
   * the solution's own `ball`, never from solutionBall()'s computed
   * default (which may stand in the project lead's name when nobody has
   * actually been named) — null here means no one was named, not that the
   * lead is assumed.
   */
  responsiblePerson: string | null;
  /**
   * Which side an explicitly-recorded ball marks as blocked. Read from the
   * solution's own `ball.who`, never inferred from status or default — null
   * unless a person actually recorded a blocked ball.
   */
  blocked: "customer" | "internal" | null;
  /**
   * The explicitly-recorded ball's own date. Distinct from `when` (which
   * also falls back to the solution's due date) — null unless a person set
   * a ball with a date, so a missing ball date is never read as "waiting
   * since" anything.
   */
  ballDate: string | null;
  /**
   * The solution's own due date (the customer's date for their part), kept
   * separate from the ball's date so one is never mistaken for a stage
   * deadline or for the other.
   */
  dueDate: string | null;
};

export type YourItem = {
  what: string;
  /** ISO date when dated, else a short phrase ("Week 4") or null. */
  by: string | null;
  kind: "meeting" | "homework" | "solution" | "parking";
};

export type CustomerJourney = {
  stages: JourneyStage[];
  current: JourneyStage;
  /** The sentence under the title: where we are and what that means. */
  headline: string;
  solutions: SolutionBallView[];
  yours: YourItem[];
};

const JOURNEY: ReadonlyArray<Omit<JourneyStage, "state">> = [
  {
    key: "pre_kickoff",
    label: "Intake & Process",
    blurb: "Before we meet: your team and ours get ready, and the first meeting is booked.",
  },
  {
    key: "kickoff",
    label: "Kickoff",
    blurb: "The first meeting: we walk your process together and agree the plan and dates.",
  },
  {
    key: "get_it_working",
    label: "Get it working",
    blurb: "One form, one real job, end to end — the plan and dates agreed.",
  },
  {
    key: "make_it_yours",
    label: "Make it yours",
    blurb: "Your forms, PDFs and connections built, and tested by you on real work.",
  },
  {
    key: "make_it_run",
    label: "Make it run",
    blurb: "Your crew runs it day to day. Go-Live is the day it is simply how work gets done.",
  },
  {
    key: "complete",
    label: "Graduate",
    blurb: "Proven in real use, and handed to the team that looks after you from here.",
  },
];

const STAGE_TO_KEY: Partial<Record<AccountStage, JourneyStageKey>> = {
  closed_won: "pre_kickoff",
  field_fusion_setup: "pre_kickoff",
  onboarding_kickoff: "pre_kickoff",
  kickoff: "kickoff",
  get_it_working: "get_it_working",
  make_it_yours: "make_it_yours",
  make_it_run: "make_it_run",
  onboarding_complete: "complete",
};

/** The customer's words for where a solution is. */
export const CUSTOMER_SOLUTION_STATUS: Record<ReturnType<typeof solutionStatus>, string> = {
  feasibility: "Checking it can be built as sold",
  define: "Being defined with you",
  build: "Being built",
  accept: "Your turn to test it",
  accepted: "Accepted — it works",
  descoped: "Not going ahead, as agreed",
  transferred: "Handled separately",
};

export const HOMEWORK_TEXT: Record<HomeworkKey, string> = {
  app: "Download the GoCanvas app and log in",
  user: "Add one field user who will test on a real job",
  list: "Send us the customer or site list to load",
};

export function customerJourney(input: {
  stage: AccountStage | string | null | undefined;
  intake: IntakeAnswers;
  timeline: Timeline | null;
  homeworkDone: Record<string, string>;
  parkingLot: ReadonlyArray<{ request: string; target: string; status: string; owner?: string }>;
  leadName: string | null;
}): CustomerJourney | null {
  const stage = input.stage ? normalizeStage(String(input.stage)) : null;
  if (!stage || isPreClose(stage)) return null;
  const nowKey = STAGE_TO_KEY[stage] ?? "pre_kickoff";
  const at = JOURNEY.findIndex((s) => s.key === nowKey);
  const stages: JourneyStage[] = JOURNEY.map((s, i) => ({
    ...s,
    state: i < at ? "done" : i === at ? "now" : "later",
  }));
  const current = stages[at]!;

  const completed = input.intake.timeline.completed;
  const services = normalizeServices(
    input.intake.timeline.services as ServiceSpec[],
    input.intake.timeline,
  ).filter((s) => isSolutionKind(s.kind));
  const solutions: SolutionBallView[] = services.map((s) => {
    const status = solutionStatus(s, completed);
    const ball = solutionBall(s, completed, input.leadName);
    const finished = status === "accepted" || status === "descoped" || status === "transferred";
    const who: SolutionBallView["who"] = finished
      ? "done"
      : ball?.who === "customer" || ball?.who === "blocked_customer"
        ? "you"
        : "us";
    return {
      id: s.id,
      name: s.name,
      kind: SOLUTION_LABEL[s.kind] ?? s.kind,
      status: CUSTOMER_SOLUTION_STATUS[status],
      who,
      when: ball?.date ?? s.due ?? null,
      canConfirm: who === "you" && status === "accept" && !completed[`${s.id}:review`],
      note: ball?.note ?? null,
      // Explicit source truth only — s.ball, never solutionBall()'s
      // computed default, which may carry the project lead's name or the
      // solution's due date as a stand-in for an unset ball.
      responsiblePerson: s.ball?.person ?? null,
      blocked:
        s.ball?.who === "blocked_customer"
          ? "customer"
          : s.ball?.who === "blocked_internal"
            ? "internal"
            : null,
      ballDate: s.ball?.date ?? null,
      dueDate: s.due ?? null,
    };
  });

  const yours: YourItem[] = [];
  const t = input.timeline;
  if (t) {
    const calls = t.milestones
      .filter((m) => m.kind === "call" && !m.serviceId)
      .sort((a, b) => a.date.localeCompare(b.date));
    const next = calls.find((m) => !m.doneOn);
    // Only a booked call carries a date: the plan's day for an unbooked one
    // is ours to fix, and shown to the customer it reads as an appointment.
    if (next) yours.push({ what: next.label, by: next.time ? next.date : null, kind: "meeting" });
    const first = calls[0];
    const held = calls.filter((m) => m.doneOn).length;
    if (first?.doneOn && held === 1) {
      const working = calls[1];
      for (const k of HOMEWORK_KEYS) {
        if (!input.homeworkDone[k]) {
          yours.push({ what: HOMEWORK_TEXT[k], by: working?.date ?? null, kind: "homework" });
        }
      }
    }
  }
  for (const s of solutions) {
    if (s.who === "you") {
      yours.push({ what: `Test ${s.name} on real work`, by: s.when, kind: "solution" });
    }
  }
  for (const p of input.parkingLot) {
    if ((p.status === "open" || p.status === "scheduled") && p.owner === "customer") {
      yours.push({ what: p.request, by: p.target || null, kind: "parking" });
    }
  }
  const isIso = (s: string | null) => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));
  yours.sort((a, b) => {
    if (isIso(a.by) && isIso(b.by)) return a.by!.localeCompare(b.by!);
    if (isIso(a.by)) return -1;
    if (isIso(b.by)) return 1;
    return 0;
  });

  const yourCount = yours.length;
  const headline =
    current.key === "complete"
      ? "Your implementation is complete. From here the same format runs for whatever you add."
      : yourCount
        ? `You are in ${current.label}. ${yourCount === 1 ? "One thing is" : `${yourCount} things are`} yours to do — listed below with the date each is wanted by.`
        : `You are in ${current.label}. Nothing is waiting on you right now${input.leadName ? ` — ${input.leadName} has the ball` : ""}.`;

  return { stages, current, headline, solutions, yours };
}

/** "by Oct 7" / "by Week 4" / "" for the customer's list. */
export function byLabel(by: string | null): string {
  if (!by) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(by) ? `by ${shortDay(by)}` : `by ${by}`;
}
