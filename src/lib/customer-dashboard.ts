import { kickoffGraduationTarget } from "./kickoff-view";
import { TESTING_HOMEWORK_COPY, type Milestone } from "./onboarding-timeline";
import { HOMEWORK_TEXT } from "./welcome-journey";
import { HOMEWORK_KEYS, type HomeworkKey, type WelcomeView } from "./welcome";
import type { PartnerDashboardView } from "./partner-journey";

/**
 * The customer's living implementation dashboard, as plain data. Every value
 * is read from a record the Hub already holds — the stage journey, the plan's
 * milestones, the solutions, the change list, the agreed scope, the help picks
 * and the lead's profile. Nothing here creates a date, a person, an owner or a
 * completion. A missing value is returned as null, and the page says so.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (value: string | null | undefined): value is string =>
  Boolean(value && ISO_DATE.test(value));

/** The canonical six-stage journey, in order. Labels match the journey itself. */
export const DASHBOARD_STAGES = [
  { key: "pre_kickoff", label: "Intake & Process" },
  { key: "kickoff", label: "Kickoff" },
  { key: "get_it_working", label: "Get It Working" },
  { key: "make_it_yours", label: "Make It Yours" },
  { key: "make_it_run", label: "Make It Run" },
  { key: "complete", label: "Graduate" },
] as const;

export type DashboardStage = {
  key: string;
  label: string;
  /** From the stage state alone — never from elapsed days or a task count. */
  state: "done" | "now" | "later";
};

/** The plan's sales step. It describes the close, so it is never the next milestone. */
const SALES_MILESTONE_KEYS: ReadonlySet<string> = new Set(["close"]);

export type DashboardHeader = {
  /** False before the account is set up: there is no stage to show yet. */
  started: boolean;
  currentLabel: string | null;
  stages: DashboardStage[];
  /** The earliest recorded milestone not yet done. A call without a booked time is never "booked". */
  nextMilestone: {
    label: string;
    date: string | null;
    status: "booked" | "planned" | "to_schedule";
  } | null;
  graduation: { current: string | null; original: string | null; moved: boolean };
};

/**
 * Progress for the segment bar, from the stage journey. The next milestone is
 * the earliest unfinished implementation step still ahead today; failing that,
 * the current stage's recorded target; failing that, the earliest unfinished
 * implementation step. Null when none of those is recorded.
 */
export function dashboardHeader(
  view: Pick<WelcomeView, "journey" | "timeline">,
  today: string | null = null,
): DashboardHeader {
  const journey = view.journey ?? null;
  // The bar shows the stages the customer's journey actually has: a stage the
  // plan explicitly skipped is not in it, so the bar is not padded with it.
  // Before the account is set up there is no journey yet, so all six show.
  const stages: DashboardStage[] = journey
    ? journey.stages.map((s) => ({
        key: s.key,
        label: DASHBOARD_STAGES.find((d) => d.key === s.key)?.label ?? s.label,
        state: s.state,
      }))
    : DASHBOARD_STAGES.map((s) => ({ key: s.key, label: s.label, state: "later" as const }));

  // The next milestone is an implementation step. The sales step that closed
  // the deal is history, never "next", whether or not it was ticked.
  const open = view.timeline.milestones
    .filter((m) => !m.doneOn && !SALES_MILESTONE_KEYS.has(m.key))
    .sort((a, b) => a.date.localeCompare(b.date));
  const ahead = today ? open.filter((m) => m.date >= today) : [];
  const next = ahead[0];
  const currentStage = journey?.current ?? null;
  const stageTarget = currentStage?.target?.currentDate ?? null;
  const milestoneFact = (m: Milestone): DashboardHeader["nextMilestone"] =>
    m.kind === "call" && !m.time
      ? { label: m.label, date: null, status: "to_schedule" }
      : {
          label: m.label,
          date: m.date,
          status: m.kind === "call" ? "booked" : "planned",
        };
  const nextMilestone: DashboardHeader["nextMilestone"] = next
    ? milestoneFact(next)
    : currentStage && isIsoDate(stageTarget)
      ? { label: `${currentStage.label} target`, date: stageTarget, status: "planned" }
      : open[0]
        ? milestoneFact(open[0])
        : null;

  const complete = journey?.stages.find((s) => s.key === "complete")?.target ?? null;
  const current = kickoffGraduationTarget(journey);
  const original = complete && isIsoDate(complete.originalDate) ? complete.originalDate : null;
  return {
    started: Boolean(journey),
    currentLabel: journey?.current.label ?? null,
    stages,
    nextMilestone,
    graduation: {
      current,
      original,
      moved: Boolean(original && current && original !== current),
    },
  };
}

/** The homework text the page shows: the kickoff step's own list when the plan has one, else the standard three. */
export function homeworkTexts(view: Pick<WelcomeView, "timeline">): Record<HomeworkKey, string> {
  const fromPlan = view.timeline.milestones.find((m) => m.key === "kickoff")?.homework ?? [];
  return {
    app: fromPlan[0] ?? HOMEWORK_TEXT.app,
    user: fromPlan[1] ?? HOMEWORK_TEXT.user,
    list: fromPlan[2] ?? HOMEWORK_TEXT.list,
  };
}

/* ------------------------------------------------ What needs your attention */

export type AttentionItem = {
  id: string;
  /** "action" is a partner implementation's customer action on the current stage. */
  kind: "homework" | "testing" | "solution" | "change" | "action";
  what: string;
  /** A named person, only when one is recorded. */
  owner: string | null;
  /** An ISO date, only when one is recorded. */
  due: string | null;
  /** A recorded target that is not a date, shown as written. */
  dueText: string | null;
  /** Homework: ticked done. */
  done: boolean;
  homeworkKey: HomeworkKey | null;
  /** Solution: the customer can say it works and hand the ball back. */
  solutionId: string | null;
  canConfirm: boolean;
  /** An AI-proposed name, shown as to confirm. */
  toConfirm: boolean;
  /**
   * Homework only: the recorded action that now carries this work, so the
   * preparation row shows no plan date of its own. The row stays ticked as before.
   */
  coveredBy: "testing" | null;
};

/**
 * Everything waiting on the customer, from the same records the customer's
 * existing controls write to: the homework ticks, the solutions they test, and
 * the change list items whose owner is the customer. Shared items are not
 * here: they are not the customer's alone.
 */
export function attentionItems(
  view: Pick<
    WelcomeView,
    | "timeline"
    | "journey"
    | "parkingLot"
    | "fieldTester"
    | "fieldTesterDue"
    | "fieldTesterSource"
    | "homeworkDone"
  >,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const texts = homeworkTexts(view);
  const homeworkDate = view.timeline.milestones.find((m) => m.key === "homework")?.date ?? null;
  const blank = {
    owner: null,
    due: null,
    dueText: null,
    done: false,
    homeworkKey: null,
    solutionId: null,
    canConfirm: false,
    toConfirm: false,
    coveredBy: null,
  };

  for (const key of HOMEWORK_KEYS) {
    // The plan's testing preparation is covered by the recorded tester's own
    // action (below), which carries their name and deadline. Its plan date is
    // not a second deadline for the same work, so it is not shown.
    const covered = Boolean(view.fieldTester) && texts[key] === TESTING_HOMEWORK_COPY;
    items.push({
      ...blank,
      id: `homework:${key}`,
      kind: "homework",
      what: texts[key],
      due: !covered && isIsoDate(homeworkDate) ? homeworkDate : null,
      done: Boolean(view.homeworkDone[key]),
      homeworkKey: key,
      coveredBy: covered ? "testing" : null,
    });
  }

  if (view.fieldTester) {
    items.push({
      ...blank,
      id: "testing",
      kind: "testing",
      what: "Test the form on real work",
      owner: view.fieldTester,
      due: isIsoDate(view.fieldTesterDue) ? view.fieldTesterDue : null,
      toConfirm: view.fieldTesterSource === "ai",
    });
  }

  for (const s of view.journey?.solutions ?? []) {
    // A solution the customer is blocking is shown once, under progress and blockers.
    if (s.who !== "you" || s.blocked === "customer") continue;
    items.push({
      ...blank,
      id: `solution:${s.id}`,
      kind: "solution",
      what: `Test ${s.name} on real work`,
      owner: s.responsiblePerson,
      due: isIsoDate(s.when) ? s.when : null,
      dueText: isIsoDate(s.when) || !s.when ? null : s.when,
      solutionId: s.id,
      canConfirm: s.canConfirm,
    });
  }

  items.push(...changeAttention(view.parkingLot));

  // Dated items first, earliest first; undated items keep the order above.
  return items.sort((a, b) =>
    a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : 0,
  );
}

/** The change list items whose owner is the customer and that are still open. Shared by both journeys. */
function changeAttention(parkingLot: WelcomeView["parkingLot"]): AttentionItem[] {
  const blank = {
    owner: null,
    due: null,
    dueText: null,
    done: false,
    homeworkKey: null,
    solutionId: null,
    canConfirm: false,
    toConfirm: false,
    coveredBy: null,
  };
  return (parkingLot ?? []).flatMap((p, index) => {
    if (p.owner !== "customer" || (p.status !== "open" && p.status !== "scheduled")) return [];
    return [
      {
        ...blank,
        id: `change:${index}`,
        kind: "change" as const,
        what: p.request,
        due: isIsoDate(p.target) ? p.target : null,
        dueText: p.target && !isIsoDate(p.target) ? p.target : null,
      },
    ];
  });
}

/* --------------------------------------------- Partner implementations */

/**
 * The header for a partner implementation, in the same shape the standard
 * header takes, so the existing bar, facts and full-journey card read it
 * unchanged. Dates are recorded targets only; the rest says To be confirmed.
 */
export function partnerDashboardHeader(partner: PartnerDashboardView): DashboardHeader {
  return {
    started: partner.stages.length > 0,
    currentLabel: partner.currentLabel,
    stages: partner.stages.map((s) => ({ key: s.key, label: s.label, state: s.state })),
    nextMilestone: partner.nextMilestone
      ? { label: partner.nextMilestone.name, date: partner.nextMilestone.date, status: "planned" }
      : null,
    graduation: {
      current: isIsoDate(partner.graduationTarget) ? partner.graduationTarget : null,
      original: null,
      moved: false,
    },
  };
}

/**
 * What needs the customer on a partner implementation: their open actions on
 * the current stage, and the change list items they own. Homework, testing and
 * the standard solutions are kickoff-only and do not apply to a partner.
 */
export function partnerAttentionItems(
  view: Pick<WelcomeView, "partner" | "parkingLot">,
): AttentionItem[] {
  const actions = (view.partner?.actions ?? []).map((a) => ({
    id: `action:${a.id}`,
    kind: "action" as const,
    what: a.title,
    owner: null,
    due: null,
    dueText: null,
    done: false,
    homeworkKey: null,
    solutionId: null,
    canConfirm: false,
    toConfirm: false,
    coveredBy: null,
  }));
  return [...actions, ...changeAttention(view.parkingLot)];
}

/** Partner blockers: the customer's own actions recorded as blocked on the current stage. */
export function partnerBlockerItems(
  partner: PartnerDashboardView | null | undefined,
): BlockerItem[] {
  return (partner?.blockers ?? []).map((b) => ({
    id: `action:${b.id}`,
    what: b.title,
    status: "Recorded as blocked",
    owner: null,
    due: null,
    dueText: null,
  }));
}

/* ------------------------------------------------ What GoCanvas is working on */

export type BlockerItem = {
  id: string;
  what: string;
  /** The customer's status for the service, in their words. */
  status: string;
  owner: string | null;
  due: string | null;
  dueText: string | null;
};

/**
 * Recorded blockers that are waiting on the customer, from the solutions the
 * journey already holds. A blocker recorded on the GoCanvas side is internal and
 * never reaches the customer's copy (see customerWelcomeView), so it cannot appear
 * here. Nothing is predicted: a service is listed only when someone recorded it as
 * blocked on the customer.
 */
export function blockerItems(view: Pick<WelcomeView, "journey">): BlockerItem[] {
  return (view.journey?.solutions ?? [])
    .filter((s) => s.blocked === "customer" && s.who !== "done")
    .map((s) => ({
      id: `solution:${s.id}`,
      what: s.name,
      status: s.status,
      owner: s.responsiblePerson,
      due: isIsoDate(s.when) ? s.when : null,
      dueText: null,
    }));
}

/**
 * Where a piece of GoCanvas's work stands, from what is recorded. Only these
 * four states exist. Proposed scope is "not started", never underway, and a
 * step with no recorded status says so rather than guessing.
 */
export type GocanvasWorkState = "not_started" | "in_progress" | "completed" | "no_status";

export const GOCANVAS_WORK_STATE_LABEL: Record<GocanvasWorkState, string> = {
  not_started: "Not started yet",
  in_progress: "Work in progress",
  completed: "Completed",
  no_status: "No work status recorded",
};

export type GocanvasWorkItem = {
  id: string;
  what: string;
  state: GocanvasWorkState;
  owner: string | null;
  due: string | null;
  dueText: string | null;
  /** A shared change, owned by both teams. */
  shared: boolean;
};

/** A solution's recorded stage, read as GoCanvas work. Accept is the customer's turn, so it is not GoCanvas work. */
const SOLUTION_WORK_STATE: Partial<Record<string, GocanvasWorkState>> = {
  feasibility: "not_started",
  define: "not_started",
  build: "in_progress",
  accepted: "completed",
};

/**
 * GoCanvas's work, from the recorded solutions, the change list and the plan's
 * GoCanvas-owned milestones. Internal notes, issues, risks and blockers never
 * appear here: this reads only the name, the recorded stage or done stamp, the
 * named person and the recorded date.
 */
export function gocanvasWork(
  view: Pick<WelcomeView, "journey" | "parkingLot" | "timeline">,
): GocanvasWorkItem[] {
  const items: GocanvasWorkItem[] = [];
  for (const s of view.journey?.solutions ?? []) {
    const stage = s.statusKey;
    const state = stage ? SOLUTION_WORK_STATE[stage] : s.who === "us" ? "no_status" : undefined;
    if (!state) continue;
    items.push({
      id: `solution:${s.id}`,
      what: s.name,
      state,
      owner: s.responsiblePerson,
      due: state === "completed" ? null : isIsoDate(s.when) ? s.when : null,
      dueText: null,
      shared: false,
    });
  }
  for (const [index, p] of (view.parkingLot ?? []).entries()) {
    if (p.owner !== "gocanvas" && p.owner !== "both") continue;
    const state: GocanvasWorkState | null =
      p.status === "done"
        ? "completed"
        : p.status === "open" || p.status === "scheduled"
          ? "not_started"
          : null;
    if (!state) continue;
    items.push({
      id: `change:${index}`,
      what: p.request,
      state,
      owner: null,
      due: state !== "completed" && isIsoDate(p.target) ? p.target : null,
      dueText: state !== "completed" && p.target && !isIsoDate(p.target) ? p.target : null,
      shared: p.owner === "both",
    });
  }
  // The plan's own GoCanvas steps. The sales close is history, never work.
  for (const m of view.timeline?.milestones ?? []) {
    if (m.owner !== "gocanvas" || SALES_MILESTONE_KEYS.has(m.key)) continue;
    items.push({
      id: `milestone:${m.key}`,
      what: m.label,
      state: m.doneOn ? "completed" : "no_status",
      owner: null,
      due: null,
      dueText: null,
      shared: false,
    });
  }
  return items.sort((a, b) =>
    a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : 0,
  );
}

/* ------------------------------------------------------ Next working session */

export type NextSession = {
  key: string;
  label: string;
  date: string;
  time: string;
  /** The plan's own description of what the session is for. */
  purpose: string;
  /** What the plan asks the team to prepare, when the plan says so. */
  prepare: string[];
};

/**
 * The next working session: a call with a time set, not marked done, and dated
 * today or later. A session whose date has passed is history, even when nobody
 * has marked it done, so it is never presented as upcoming. A planned date with
 * no time is not a meeting. Service-specific calls are excluded, as they are on
 * the journey. Null when today is not known yet, or nothing upcoming is booked.
 * Historical meetings stay in the plan untouched.
 */
export function nextBookedSession(
  milestones: ReadonlyArray<Milestone>,
  today: string | null,
): NextSession | null {
  if (!isIsoDate(today)) return null;
  const next = milestones
    .filter(
      (m) =>
        m.kind === "call" &&
        !m.serviceId &&
        !m.doneOn &&
        Boolean(m.time) &&
        isIsoDate(m.date) &&
        m.date >= today,
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next || !next.time) return null;
  return {
    key: next.key,
    label: next.label,
    date: next.date,
    time: next.time,
    purpose: next.detail,
    prepare: next.homework ?? [],
  };
}

/* ----------------------------------------------- Ideas and requests for later */

export type IdeaItem = {
  id: string;
  what: string;
  target: string | null;
  /**
   * "needed for launch" is stored on the item. Every other request is shown as
   * an open request to review together, never as out of scope.
   */
  category: "needed_for_launch" | "other_request";
};

export function ideasForLater(
  parkingLot: NonNullable<WelcomeView["parkingLot"]> | null | undefined,
): IdeaItem[] {
  return (parkingLot ?? [])
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => p.status === "open" || p.status === "scheduled")
    .map(({ p, index }) => ({
      id: `idea:${index}`,
      what: p.request,
      target: p.target?.trim() ? p.target : null,
      category: p.neededForLaunch ? ("needed_for_launch" as const) : ("other_request" as const),
    }));
}

/* -------------------------------------------------------- Resources and contact */

export type ResourceItem = {
  id: string;
  title: string;
  why: string;
  when: string | null;
  /** The tracked link when the page has one (the customer's link); the article itself otherwise. */
  href: string;
};

/** The help picks chosen for this customer, through the tracked link when there is one. */
export function dashboardResources(
  view: Pick<WelcomeView, "helpPicks" | "goBase">,
): ResourceItem[] {
  return view.helpPicks.map((p) => ({
    id: p.article_id,
    title: p.title,
    why: p.why,
    when: p.when,
    href: view.goBase ? `${view.goBase}/${p.article_id}` : p.url,
  }));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type TisContact = {
  name: string | null;
  /** A valid address from the lead's profile, or null — never a guess. */
  email: string | null;
  /** A mailto link with a customer-specific subject, when there is an address. */
  mailto: string | null;
};

export function tisContact(view: Pick<WelcomeView, "clientName" | "lead" | "team">): TisContact {
  const raw = view.team.leadEmail?.trim() ?? "";
  const email = EMAIL.test(raw) ? raw : null;
  const subject = `${view.clientName} implementation: a question`;
  return {
    name: view.lead,
    email,
    mailto: email ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : null,
  };
}
