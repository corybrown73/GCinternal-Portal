import { kickoffGraduationTarget } from "./kickoff-view";
import type { Milestone } from "./onboarding-timeline";
import { HOMEWORK_TEXT } from "./welcome-journey";
import { HOMEWORK_KEYS, type HomeworkKey, type WelcomeView } from "./welcome";

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
 * Progress for the six-segment bar, from the stage journey. The next milestone
 * is the earliest step not done that is still ahead today; when none is ahead
 * (or today is not known yet), it is the earliest step not done.
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

  const open = view.timeline.milestones
    .filter((m) => !m.doneOn)
    .sort((a, b) => a.date.localeCompare(b.date));
  const ahead = today ? open.filter((m) => m.date >= today) : [];
  const next = ahead[0] ?? open[0];
  const nextMilestone = next
    ? next.kind === "call" && !next.time
      ? { label: next.label, date: null, status: "to_schedule" as const }
      : {
          label: next.label,
          date: next.date,
          status: next.kind === "call" ? ("booked" as const) : ("planned" as const),
        }
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
  kind: "homework" | "testing" | "solution" | "change";
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
  };

  for (const key of HOMEWORK_KEYS) {
    items.push({
      ...blank,
      id: `homework:${key}`,
      kind: "homework",
      what: texts[key],
      due: isIsoDate(homeworkDate) ? homeworkDate : null,
      done: Boolean(view.homeworkDone[key]),
      homeworkKey: key,
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

  for (const [index, p] of (view.parkingLot ?? []).entries()) {
    if (p.owner !== "customer" || (p.status !== "open" && p.status !== "scheduled")) continue;
    items.push({
      ...blank,
      id: `change:${index}`,
      kind: "change",
      what: p.request,
      due: isIsoDate(p.target) ? p.target : null,
      dueText: p.target && !isIsoDate(p.target) ? p.target : null,
    });
  }

  // Dated items first, earliest first; undated items keep the order above.
  return items.sort((a, b) =>
    a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : 0,
  );
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

export type GocanvasWorkItem = {
  id: string;
  what: string;
  /** The customer-words status for a solution, or the change's state for a change. */
  status: string;
  owner: string | null;
  due: string | null;
  dueText: string | null;
  /** A shared change, owned by both teams. */
  shared: boolean;
};

/**
 * GoCanvas-owned work from the solutions and the change list. Internal notes
 * and blockers never appear here: the customer's view has already removed them,
 * and this reads only the name, the customer's status and the recorded date.
 */
export function gocanvasWork(
  view: Pick<WelcomeView, "journey" | "parkingLot">,
): GocanvasWorkItem[] {
  const items: GocanvasWorkItem[] = [];
  for (const s of view.journey?.solutions ?? []) {
    if (s.who !== "us") continue;
    items.push({
      id: `solution:${s.id}`,
      what: s.name,
      status: s.status,
      owner: s.responsiblePerson,
      due: isIsoDate(s.when) ? s.when : null,
      dueText: null,
      shared: false,
    });
  }
  for (const [index, p] of (view.parkingLot ?? []).entries()) {
    if (p.owner !== "gocanvas" && p.owner !== "both") continue;
    if (p.status !== "open" && p.status !== "scheduled") continue;
    items.push({
      id: `change:${index}`,
      what: p.request,
      status: p.status === "scheduled" ? "Scheduled" : "Open",
      owner: null,
      due: isIsoDate(p.target) ? p.target : null,
      dueText: p.target && !isIsoDate(p.target) ? p.target : null,
      shared: p.owner === "both",
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
