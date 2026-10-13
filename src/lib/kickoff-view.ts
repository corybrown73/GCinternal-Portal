import type { ImplementationFocusView, WelcomeView } from "./welcome";
import type { Timeline } from "./onboarding-timeline";
import { shortDay } from "./onboarding-timeline";
import type { CustomerJourney, JourneyStage } from "./welcome-journey";

/**
 * Pure data-shaping for Kickoff View's six fixed screens, kept separate
 * from their JSX (src/components/kickoff-view.tsx) so the rules that
 * matter — what counts as agreed, which actions are due before the next
 * session, which dates a slide may show — are testable without rendering.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (value: string | null | undefined): value is string =>
  Boolean(value && ISO_DATE.test(value));

/** Shown on a workflow answer nobody has saved yet. Never filled from anywhere else. */
export const KICKOFF_TO_CONFIRM = "To confirm together.";

export type KickoffFocusContent =
  | { state: "empty" }
  | { state: "proposed"; items: string[] }
  | { state: "agreed"; items: string[] };

/**
 * What the scope may say — never the source provenance (SOW/Intake/Gong) or
 * review flags implementationFocus (or its presentation-only fallback) also
 * carries. Returning only item text makes it structurally impossible for a
 * slide to leak a source chip or a conflict warning.
 *
 * PRECEDENCE: a saved item — agreed or still proposed — always wins, in its
 * saved state. ONE EXCEPTION: a list the AI reading saved on its own
 * (`aiFilled`, nobody pressed Generate) has had no review, so while it is
 * unvalidated its flagged items stay off the slide. A person's save of the
 * list, or Confirm, lifts that.
 *
 * `fallbackItems` (proposeImplementationFocus's output, read fresh on every
 * view, never persisted) is used only when nothing has been saved at all,
 * and always renders as "proposed". Only `reviewFlag === null` candidates
 * are customer-safe.
 */
export function kickoffFocusContent(
  focus: Pick<ImplementationFocusView, "items" | "validatedAt" | "aiFilled"> | null | undefined,
  fallbackItems?: ImplementationFocusView["items"] | null,
): KickoffFocusContent {
  const saved = focus?.items ?? [];
  const unreviewed = Boolean(focus?.aiFilled) && !focus?.validatedAt;
  const items = unreviewed ? saved.filter((i) => i.reviewFlag === null) : saved;
  if (items.length) {
    return {
      state: focus?.validatedAt ? "agreed" : "proposed",
      items: items.map((i) => i.text),
    };
  }
  // An AI-written list with nothing customer-safe on it is not replaced
  // by the fallback: the fallback is the same anchors, filtered the same way.
  if (saved.length) return { state: "empty" };
  const safeFallback = (fallbackItems ?? []).filter((i) => i.reviewFlag === null);
  if (!safeFallback.length) return { state: "empty" };
  return { state: "proposed", items: safeFallback.map((i) => i.text) };
}

/**
 * The customer's stated business outcome, when the handoff has a shared,
 * answered one. Never a stand-in from the account background.
 */
export function kickoffBusinessOutcome(view: Pick<WelcomeView, "intake">): string | null {
  const known = view.intake?.known.find((k) => k.key === "business_outcome");
  if (!known) return null;
  const v = known.value;
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Whether the outcome on screen is the customer's confirmed words. An
 * answer the AI read out of the calls, or Sales typed, is shown with a
 * "to confirm" marker until the customer confirms it on their page.
 */
export function kickoffBusinessOutcomeConfirmed(view: Pick<WelcomeView, "intake">): boolean {
  return Boolean(view.intake?.known.find((k) => k.key === "business_outcome")?.confirmed);
}

/* ------------------------------------------------ 2. Your workflow */

/**
 * The three permanent guiding questions. They stay on the slide whether or
 * not the workflow has been captured.
 */
export const KICKOFF_WORKFLOW_QUESTIONS = {
  before: "What information needs to reach the worker?",
  during: "What information does the worker need to capture?",
  after: "Where does the information go, and what happens next?",
} as const;

/**
 * The saved Before / During / After words, from the dedicated workflow fields
 * only (Presenter Workspace Section 2). A blank field is null, which the slide
 * shows as KICKOFF_TO_CONFIRM. Nothing else — no discovery notes, no account
 * history, no outcome — is ever used to fill a column.
 */
export function kickoffWorkflowFields(
  story:
    | Pick<NonNullable<WelcomeView["workflowStory"]>, "before" | "during" | "after">
    | null
    | undefined,
): { before: string | null; during: string | null; after: string | null } {
  const clean = (text: string | null | undefined) => (text && text.trim() ? text : null);
  return {
    before: clean(story?.before),
    during: clean(story?.during),
    after: clean(story?.after),
  };
}

/**
 * Whether the workflow on screen still needs the customer's word: a saved
 * story nobody has validated, or nothing saved at all. Only a story with
 * `validatedAt` set is shown as confirmed.
 */
export function kickoffWorkflowConfirmed(
  story: Pick<NonNullable<WelcomeView["workflowStory"]>, "validatedAt"> | null | undefined,
): boolean {
  return Boolean(story?.validatedAt);
}

/** Long saved answers keep their full text; the slide sets them smaller so they still fit. */
export const KICKOFF_LONG_TEXT = 240;

/* -------------------------------------------- 3. Your implementation journey */

/**
 * The four upcoming stages, explained for this customer. The wording is the
 * standard stage explanation; the personalised lines come from
 * kickoffUpcomingDetails and are added only when the record holds them.
 */
export type UpcomingStageKey = "get_it_working" | "make_it_yours" | "make_it_run" | "complete";

export const KICKOFF_UPCOMING: ReadonlyArray<{
  key: UpcomingStageKey;
  label: string;
  text: string;
}> = [
  {
    key: "get_it_working",
    label: "Get It Working",
    text: "Get the first working form ready to test together.",
  },
  {
    key: "make_it_yours",
    label: "Make It Yours",
    text: "Refine the solution around how the customer's team actually works.",
  },
  {
    key: "make_it_run",
    label: "Make It Run",
    text: "Test the solution in real-world conditions, capture feedback and make final agreed improvements.",
  },
  {
    key: "complete",
    label: "Graduate",
    text: "Confirm the solution is operational, record acceptance and hand over ongoing ownership.",
  },
];

/**
 * Personalised lines for each upcoming stage, built only from recorded
 * implementation details. A stage with nothing recorded gets no lines, and
 * the slide shows the standard explanation alone. Nothing here invents
 * training, integration work or deliverables.
 */
export function kickoffUpcomingDetails(
  view: Pick<
    WelcomeView,
    | "firstForm"
    | "workflowStory"
    | "implementationFocus"
    | "implementationFocusFallback"
    | "journey"
    | "fieldTester"
    | "fieldTesterDue"
    | "fieldTesterSource"
    | "parkingLot"
  >,
): Partial<Record<UpcomingStageKey, string[]>> {
  const lines: Partial<Record<UpcomingStageKey, string[]>> = {};
  const story = view.workflowStory;
  const workflowSaved = Boolean(story && (story.before || story.during || story.after));
  const scope = kickoffFocusContent(view.implementationFocus, view.implementationFocusFallback);
  const scopeItems = scope.state === "empty" ? [] : scope.items;
  const services = (view.journey?.solutions ?? []).map((s) => s.name);
  const openChanges = (view.parkingLot ?? []).filter(
    (item) => item.status === "open" || item.status === "scheduled",
  ).length;

  const getItWorking: string[] = [];
  if (view.firstForm?.name) getItWorking.push(`First form: ${view.firstForm.name}`);
  if (workflowSaved) {
    getItWorking.push(
      kickoffWorkflowConfirmed(story)
        ? "Workflow: confirmed with you"
        : "Workflow: proposed, to confirm together",
    );
  }
  if (getItWorking.length) lines.get_it_working = getItWorking;

  const makeItYours: string[] = [];
  if (scopeItems.length) {
    makeItYours.push(`Scope: ${scopeItems.slice(0, 2).join("; ")}`);
  }
  if (services.length) makeItYours.push(`Purchased: ${services.slice(0, 3).join(", ")}`);
  if (makeItYours.length) lines.make_it_yours = makeItYours;

  if (view.fieldTester) {
    const due = isIsoDate(view.fieldTesterDue) ? ` · by ${shortDay(view.fieldTesterDue)}` : "";
    const confirm = view.fieldTesterSource === "ai" ? " (to confirm)" : "";
    lines.make_it_run = [`Testing: ${view.fieldTester}${due}${confirm}`];
  }

  if (openChanges) lines.complete = [`Open changes to close: ${openChanges}`];
  return lines;
}

/**
 * The Graduate target as the stage timeline shows it — the same agreed stage
 * target, read from the same place — so the cover can never disagree with it.
 * Null until the target has been agreed.
 */
export function kickoffGraduationTarget(
  journey: Pick<CustomerJourney, "stages"> | null | undefined,
): string | null {
  const stage: JourneyStage | undefined = journey?.stages.find((s) => s.key === "complete");
  const date = stage?.target?.currentDate ?? null;
  return isIsoDate(date) ? date : null;
}

/**
 * The customer's journey rail reads "we are at Kickoff right now" whenever the
 * account's stage is still pre_kickoff, since the customer is in the Kickoff
 * call. Pure rendering reshape; the underlying stage is never changed.
 */
export function kickoffJourneyStages(
  journey: Pick<CustomerJourney, "stages" | "current">,
): JourneyStage[] {
  if (journey.current.key !== "pre_kickoff") return journey.stages;
  return journey.stages.map((s) => {
    if (s.key === "pre_kickoff") return { ...s, state: "done" as const };
    if (s.key === "kickoff") return { ...s, state: "now" as const };
    return s;
  });
}

/** Screen 3: a short outcome-oriented line per canonical stage. Presentation copy only. */
export const KICKOFF_STAGE_OUTCOME: Record<string, string> = {
  pre_kickoff: "Understand the work and prepare",
  kickoff: "Validate the process and first objective",
  get_it_working: "Prove the workflow end to end",
  make_it_yours: "Use it on real work and adjust",
  make_it_run: "Run it as the normal process",
  complete: "Confirm it is operational and hand off cleanly",
};

/* ----------------------------------- 4. What we expect from each other */

/**
 * The standard expectations slide. The same for every implementation: it is
 * never personalised from Gong, intake, industry, tier or services. Nothing
 * here is a response deadline, a penalty or a contractual term.
 */
export const KICKOFF_EXPECTATIONS = {
  title: "We build it together.",
  accent: "You learn to run it.",
  lede: "A successful implementation takes commitment from both teams.",
  columns: [
    {
      icon: "Wrench",
      label: "GoCanvas",
      role: "We lead and guide",
      items: [
        "Come prepared with an initial solution and plan.",
        "Lead working sessions and guide decisions.",
        "Build and refine agreed functionality.",
        "Provide training and practical guidance.",
        "Communicate progress, risks and blockers.",
        "Document agreed actions and decisions.",
      ],
    },
    {
      icon: "Handshake",
      label: "Together",
      role: "We keep things moving",
      items: [
        "Attend and participate in working sessions.",
        "Agree on actions, owners and deadlines.",
        "Communicate blockers and delays early.",
        "Discuss scope or timeline changes before proceeding.",
        "Review progress and confirm readiness for the next stage.",
      ],
    },
    {
      icon: "HardHat",
      label: "Your Team",
      role: "You participate and own",
      items: [
        "Explain your real-world processes and requirements.",
        "Provide necessary access and timely decisions.",
        "Identify a decision-maker and form owner.",
        "Test the solution using real work scenarios.",
        "Provide clear, timely feedback.",
        "Complete agreed actions between sessions.",
        "Prepare your team for day-to-day use.",
      ],
    },
  ],
  momentum: {
    title: "Keep the momentum between sessions.",
    text: "Test, share feedback and complete agreed actions between meetings. Raise blockers early so we can adjust the plan together.",
  },
} as const;

/* ----------------------------------------------- 5. Let's work on Form V1 */

/** The three steps of the form review, in the order we take them. */
export const KICKOFF_FORM_STEPS: ReadonlyArray<{ label: string; text: string }> = [
  { label: "Review", text: "Walk through the form together." },
  { label: "Refine", text: "Make agreed changes live." },
  { label: "Test", text: "Agree on one real-world test." },
];

/**
 * How many leading items fit a column. A rough line budget: each item costs the
 * lines its text will take, so one long saved answer cannot push the slide past
 * its frame. Always shows at least one item, and never more than `max`.
 */
export function kickoffFitCount<T>(
  items: readonly T[],
  linesFor: (item: T) => number,
  budget: number,
  max: number,
): number {
  let used = 0;
  let count = 0;
  for (const item of items) {
    if (count >= max) break;
    const cost = linesFor(item);
    if (count > 0 && used + cost > budget) break;
    used += cost;
    count += 1;
  }
  return count;
}

/** The recorded changes to the first form still open, in the words the Hub holds. */
export type KickoffChange = {
  request: string;
  status: "open" | "scheduled";
  /** Who makes the change, in the customer's words. */
  owner: "GoCanvas" | "Your team" | "Both";
  target: string | null;
};

const CHANGE_OWNER: Record<"gocanvas" | "customer" | "both", KickoffChange["owner"]> = {
  gocanvas: "GoCanvas",
  customer: "Your team",
  both: "Both",
};

/**
 * Changes to make before the test: open and scheduled items from the existing
 * change list, in the recorded order. Done items are left off. The source and
 * any provenance stay internal; only the words, status and owner are returned.
 */
export function kickoffChanges(
  parkingLot: NonNullable<WelcomeView["parkingLot"]> | null | undefined,
): KickoffChange[] {
  return (parkingLot ?? [])
    .filter((item) => item.status === "open" || item.status === "scheduled")
    .map((item) => ({
      request: item.request,
      status: item.status as "open" | "scheduled",
      owner: CHANGE_OWNER[item.owner ?? "customer"],
      target: item.target?.trim() ? item.target : null,
    }));
}

/* ------------------------------------------------- 6. Your next move */

/** The next working session after kickoff, as the plan holds it. */
export type KickoffSession = {
  label: string;
  date: string;
  time: string | null;
  /** True only when a time is set: the session is confirmed. */
  booked: boolean;
};

/**
 * The next working session that has not yet been held. Null when the plan has
 * none left. Booked means a time is set; an unbooked session's date is only
 * the plan's day, never a confirmed meeting.
 */
export function nextWorkingSession(milestones: Timeline["milestones"]): KickoffSession | null {
  const next = milestones
    .filter((m) => m.kind === "call" && !m.serviceId && m.key !== "kickoff" && !m.doneOn)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return null;
  return { label: next.label, date: next.date, time: next.time, booked: Boolean(next.time) };
}

/**
 * One action or commitment for the "Before we meet again" slide. `due` is set
 * only from a recorded ISO date; text targets such as "Before the test" are
 * not dates, so they are never placed in a window.
 */
export type KickoffMoveItem = {
  /** Stable across both columns, so a shared item is counted once. */
  id: string;
  what: string;
  due: string | null;
  person: string | null;
  /** The commitment belongs to both teams. */
  shared: boolean;
  /** Confirmed when a person has scheduled it or it is part of the agreed services. */
  confirmed: boolean;
};

export type KickoffMoveSources = { ours: KickoffMoveItem[]; theirs: KickoffMoveItem[] };

type MoveView = Pick<
  WelcomeView,
  "journey" | "parkingLot" | "fieldTester" | "fieldTesterDue" | "fieldTesterSource"
>;

/** Every recorded GoCanvas and customer action, before any date window is applied. */
export function kickoffMoveSources(view: MoveView): KickoffMoveSources {
  const ours: KickoffMoveItem[] = [];
  const theirs: KickoffMoveItem[] = [];

  for (const s of view.journey?.solutions ?? []) {
    if (s.who === "done") continue;
    const item: KickoffMoveItem = {
      id: `solution:${s.id}`,
      what: `${s.name}: ${s.status}`,
      due: isIsoDate(s.when) ? s.when : null,
      person: s.responsiblePerson,
      shared: false,
      confirmed: true,
    };
    (s.who === "us" ? ours : theirs).push(item);
  }

  for (const [index, p] of (view.parkingLot ?? []).entries()) {
    if (p.status !== "open" && p.status !== "scheduled") continue;
    const side = p.owner ?? "customer";
    const item: KickoffMoveItem = {
      id: `change:${index}:${p.request}`,
      what: p.request,
      due: isIsoDate(p.target) ? p.target : null,
      person: null,
      shared: side === "both",
      confirmed: p.status === "scheduled",
    };
    if (side === "gocanvas" || side === "both") ours.push(item);
    if (side === "customer" || side === "both") theirs.push(item);
  }

  if (view.fieldTester) {
    theirs.push({
      id: "testing",
      what: "Test the form on real work",
      due: isIsoDate(view.fieldTesterDue) ? view.fieldTesterDue : null,
      person: view.fieldTester,
      shared: false,
      confirmed: view.fieldTesterSource === "person",
    });
  }

  // Homework is the customer's own: due by the next working session, already dated in the journey.
  for (const y of view.journey?.yours ?? []) {
    if (y.kind !== "homework") continue;
    theirs.push({
      id: `homework:${y.what}`,
      what: y.what,
      due: isIsoDate(y.by) ? y.by : null,
      person: null,
      shared: false,
      confirmed: true,
    });
  }

  return { ours, theirs };
}

export type KickoffMoveSplit = {
  ours: KickoffMoveItem[];
  theirs: KickoffMoveItem[];
  /** Distinct actions with no recorded date, so they cannot be placed in the window. */
  undated: number;
};

const byDueThenWords = (a: KickoffMoveItem, b: KickoffMoveItem) =>
  (a.due ?? "").localeCompare(b.due ?? "") || a.what.localeCompare(b.what);

/**
 * The slide's window. With a booked next session, only actions due on or
 * before its date are shown; later ones are left out. Without one, no cutoff
 * is invented: every dated action is shown, and the caller says the session
 * still needs booking. Undated items are counted, never shown as due.
 */
export function kickoffMoveSplit(
  sources: KickoffMoveSources,
  cutoff: string | null,
): KickoffMoveSplit {
  const inWindow = (item: KickoffMoveItem) =>
    isIsoDate(item.due) && (cutoff === null || item.due <= cutoff);
  const every = new Map<string, KickoffMoveItem>();
  for (const item of [...sources.ours, ...sources.theirs]) every.set(item.id, item);
  const undated = [...every.values()].filter((item) => !isIsoDate(item.due)).length;
  return {
    ours: sources.ours.filter(inWindow).sort(byDueThenWords),
    theirs: sources.theirs.filter(inWindow).sort(byDueThenWords),
    undated,
  };
}

/** The closing action — testing-oriented, never administrative. */
export function kickoffNextStepText(firstFormName: string | null): string {
  const target = firstFormName?.trim() || "your GoCanvas workflow";
  return `Put it to work. Test ${target} on a real job and see what needs to change.`;
}

/** Screen 6 headline and supporting line: fixed copy, the same for every account. */
export const KICKOFF_NEXT_HEADLINE = { title: "Before we meet", accent: "again" } as const;
export const KICKOFF_NEXT_LEDE =
  "Here's what each team has agreed to complete before our next session.";

/** Screen 1: the lightweight "today we'll…" promise — what this call does, not an agenda. */
export const KICKOFF_PROMISE: ReadonlyArray<{ icon: string; text: string }> = [
  { icon: "Search", text: "Confirm how the work really happens" },
  { icon: "Target", text: "Agree what we're getting working first" },
  { icon: "Rocket", text: "Get you ready to test it on real work" },
];
