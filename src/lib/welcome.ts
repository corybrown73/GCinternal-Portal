import type { ImplementationFocusItem, IntakeAnswers } from "./intake-answers";
import type { Timeline } from "./onboarding-timeline";
import type { CustomerPrompt } from "./sales-handoff";
import type { CustomerJourney } from "./welcome-journey";
import type { PurchasedSolutionView } from "./purchased-solutions";

/**
 * The workflow in the customer's own terms — before field work, during it,
 * after submission — as the Welcome pipeline exposes it. Camelcase here;
 * the persisted intake field (`workflow_story`) stays snake_case.
 */
export type WorkflowStoryView = {
  before: string | null;
  during: string | null;
  after: string | null;
  validatedAt: string | null;
  validatedBy: string | null;
};

/**
 * What this implementation will actually deliver, as the Welcome pipeline
 * exposes it. Camelcase here; the persisted intake field
 * (`implementation_focus`) stays snake_case. See intake-answers.ts for the
 * product rules this shape carries: SOW/intake/Gong provenance per item,
 * proposed vs. agreed, and the review flags that keep a Gong-only or
 * conflicting item from reading as agreed.
 */
export type ImplementationFocusView = {
  items: Array<{
    id: string;
    text: string;
    status: "proposed" | "agreed";
    sources: Array<{ type: "sow" | "intake" | "gong"; label: string | null; quote: string | null }>;
    reviewFlag: "gong_only" | "conflict" | null;
  }>;
  validatedAt: string | null;
  validatedBy: string | null;
  /**
   * True while the saved list is the AI reading's — written by the
   * automatic apply, not generated or edited by a person on the panel. A
   * flagged item on such a list has had no review, so Kickoff View keeps
   * it off the slide until a person confirms the list.
   */
  aiFilled?: boolean;
};

/** The stored workflow_story, as the Welcome pipeline exposes it. Pure — no defaults to invent. */
export function workflowStoryView(a: Pick<IntakeAnswers, "workflow_story">): WorkflowStoryView {
  const w = a.workflow_story;
  return {
    before: w.before,
    during: w.during,
    after: w.after,
    validatedAt: w.validated_at,
    validatedBy: w.validated_by,
  };
}

/** The stored implementation_focus, as the Welcome pipeline exposes it. */
export function implementationFocusView(
  a: Pick<IntakeAnswers, "implementation_focus" | "ai_filled">,
): ImplementationFocusView {
  const f = a.implementation_focus;
  return {
    items: f.items.map((i) => ({
      id: i.id,
      text: i.text,
      status: i.status,
      sources: i.sources.map((s) => ({ type: s.type, label: s.label, quote: s.quote })),
      reviewFlag: i.review_flag,
    })),
    validatedAt: f.validated_at,
    validatedBy: f.validated_by,
    aiFilled: a.ai_filled.includes("implementation_focus"),
  };
}

/**
 * A presentation-only proposed Implementation Focus — proposeImplementationFocus's
 * output (SOW/Intake/Gong evidence, never generated prose), in the same
 * item shape implementationFocusView uses, so Kickoff View can treat a
 * saved item and a proposed one identically once text is extracted. Used
 * only when nothing has been saved yet; never persisted by being read.
 */
export function implementationFocusFallbackView(
  items: ReadonlyArray<ImplementationFocusItem> | null,
): ImplementationFocusView["items"] {
  if (!items) return [];
  return items.map((i) => ({
    id: i.id,
    text: i.text,
    status: i.status,
    sources: i.sources.map((s) => ({ type: s.type, label: s.label, quote: s.quote })),
    reviewFlag: i.review_flag,
  }));
}

/**
 * What the welcome page renders. Built on the server from the deal, the
 * intake and the plan; the same object whether the viewer is the rep in
 * the portal, the customer on their link, or the print dialog.
 */
export type WelcomeView = {
  dealId: string;
  clientName: string;
  industry: string | null;
  /** The lucide icon name for the industry. */
  icon: string;
  timeline: Timeline;
  lead: string | null;
  fieldTester: string | null;
  fieldTesterDue: string | null;
  /** "person" when a person named them; "ai" when the reading proposed the name, shown as to confirm. */
  fieldTesterSource: "ai" | "person" | null;
  /** The process today, in their words. Null → a generic "paper and retyping". */
  currentProcess: string | null;
  /** "person" when a person wrote or confirmed it; "ai" when it is the brief's paraphrase. */
  currentProcessSource: "ai" | "person" | null;
  team: {
    lead: string | null;
    /** How to reach the lead. On the closing screen. */
    leadEmail: string | null;
    /** The lead's face, title and booking link, from their profile. */
    leadCard: {
      title: string | null;
      bookingUrl: string | null;
      photoUrl: string | null;
      bio: string | null;
    } | null;
    accountManager: string | null;
    solutionsEngineer: string | null;
    champion: { name: string; role: string | null } | null;
    /** Other customer-side people the notes named. On the team screen after the champion. */
    others?: Array<{ name: string; role: string | null; does?: string | null }>;
  };
  firstForm: {
    name: string;
    objective: string | null;
    source: "library" | "uploaded" | "typed" | "tbd";
  } | null;
  /** "person" when a person named or chose the first form; "ai" when the reading read it from the SOW or the calls, shown as to confirm. */
  firstFormSource: "ai" | "person" | null;
  /** Uploaded source forms, signed for internal review only. */
  formArtifacts: Array<{ name: string; url: string }>;
  nextUseCases: Array<{ name: string; objective: string | null }>;
  /** All purchased plan lines, projected without internal clarification data. */
  purchasedSolutions: PurchasedSolutionView[];
  /** Signed, short-lived. null → the icon composition. */
  photoUrl: string | null;
  /** Uploaded logos, tool key → signed URL, for the marks on the phase cards. */
  toolMarks?: Record<string, string>;
  clientLogoUrl: string | null;
  /** Homework key → ISO timestamp when the customer ticked it. */
  homeworkDone: Record<string, string>;
  /**
   * What is still blank before the page should go to a customer. Empty means
   * ready. Internal only; the customer's view carries an empty list.
   */
  readiness: Array<{ key: string; label: string; hint: string }>;
  /** Internal only: the AI reading's status, null when none ran or on the customer's copy. */
  aiReading?: "queued" | "running" | "done" | "failed" | null;
  /** Internal only: the Review step was approved (handoff_tasks.reviewed). Null on the customer's copy. */
  reviewed?: boolean | null;
  /** Present when the viewer is internal and a link has been issued. */
  shareUrl: string | null;
  /** The link as a QR (PNG data URL), made on the server. Internal only. */
  qrDataUrl: string | null;
  sharedAt: string | null;
  /** When the customer last opened the link (stamped at most every 15 minutes). Internal only. */
  openedAt: string | null;
  /** When the current link was issued; a replaced link has a new date. Internal only. */
  issuedAt?: string | null;
  /** Screen keys the presenter switched off for this customer. Both modes honour it. */
  hiddenScreens: string[];
  /** Text rewritten in place on the page, by text key. Both modes read it. */
  textOverrides: Record<string, string>;
  /** New logo or existing account — the words on every screen follow it. */
  path: "new_logo" | "existing" | "dm_conversion" | "field_fusion" | "partner_implementation";
  /** "Get started on your own": the help articles picked for this customer. */
  helpPicks: Array<{
    article_id: string;
    title: string;
    url: string;
    why: string;
    when: string | null;
  }>;
  /** Article id → when the customer first opened it. Internal only. */
  helpOpened: Record<string, string>;
  /** The tracked-link base for the customer's page (`/go/{token}`); null internally. */
  goBase: string | null;
  /**
   * The parking lot, as the customer sees it: what came up, when it will be
   * handled, where it stands. Dropped items are left off their page.
   */
  /**
   * "Before kickoff": what we know so far (to confirm) and what we still
   * need (to answer). Null until the questions have been sent.
   */
  intake?: CustomerPrompt | null;
  /**
   * Where we are, for the customer: the five stages, who has the ball on
   * each thing they bought, what is theirs to do. Null before the close.
   */
  journey?: CustomerJourney | null;
  /**
   * A Partner Implementation's dashboard, from its own progress. Set only for
   * the partner journey; a partner deal has no six-stage journey (journey is
   * null), so the partner stages are never forced through it.
   */
  partner?: import("./partner-journey").PartnerDashboardView | null;
  /**
   * True when the deal IS a Partner Implementation but its progress could not
   * be read. The dashboard then says so, with no stages, dates or tasks, and
   * never falls back to the six-stage journey.
   */
  partnerUnavailable?: boolean;
  /**
   * The deal's chosen type is a generic Partner Implementation, before or after
   * Closed Won. Its dashboard and deck never show the standard New Logo plan.
   */
  partnerDeal?: boolean;
  /** The registered partner the deal chose, for the partner's own screens. */
  partnerName?: string | null;
  parkingLot?: Array<{
    request: string;
    target: string;
    status: "open" | "scheduled" | "done";
    neededForLaunch: boolean;
    owner?: "gocanvas" | "customer" | "both";
  }>;
  /**
   * Data foundation for the future Kickoff view and the living Implementation
   * Plan — the same implementation truth, not a second one. Not yet rendered
   * by WelcomePage.
   */
  workflowStory?: WorkflowStoryView | null;
  implementationFocus?: ImplementationFocusView | null;
  /**
   * Kickoff View only: a presentation-only proposed focus derived from SOW/
   * Intake/Gong evidence (proposeImplementationFocus), read when
   * implementationFocus has no saved items yet. Never agreed, never
   * persisted — see kickoffFocusContent for the precedence rule.
   */
  implementationFocusFallback?: ImplementationFocusView["items"];
  /**
   * The agreed scope as the customer may read it: text and state only.
   * Computed on the server from the same rules as Kickoff View (kickoffFocusContent),
   * so no source, quote or review flag ever reaches a customer's page.
   */
  customerScope: { state: "empty" | "proposed" | "agreed"; items: string[] };
};

/**
 * The customer's copy of the page: the same shape the page renders, with
 * every internal-only field emptied. Assignable to WelcomeView, so the one
 * page component renders either.
 */
export type CustomerDashboardView = Omit<
  WelcomeView,
  | "dealId"
  | "aiReading"
  | "reviewed"
  | "readiness"
  | "formArtifacts"
  | "shareUrl"
  | "qrDataUrl"
  | "sharedAt"
  | "openedAt"
  | "helpOpened"
  | "implementationFocus"
  | "implementationFocusFallback"
> & {
  dealId: "";
  aiReading: null;
  reviewed: null;
  readiness: [];
  formArtifacts: [];
  shareUrl: null;
  qrDataUrl: null;
  sharedAt: null;
  openedAt: null;
  helpOpened: Record<string, never>;
  implementationFocus: null;
  implementationFocusFallback: [];
};

/*
 * THE ALLOW-LIST. What the customer's copy may carry, field by field. A key
 * not named here never reaches a customer's browser, so a field added to
 * WelcomeView later stays internal until someone adds it here on purpose.
 * Leaves: "prim" (a string, number, boolean or null; anything else is
 * dropped), "prims" (a list of those), "value" (either), "record" (an object
 * of those, e.g. homework key → date). A function shapes the value itself.
 */
type Leaf = "prim" | "prims" | "value" | "record";
type Shape = Leaf | ((v: unknown) => unknown) | { readonly [k: string]: Shape } | readonly [Shape];

const isPrim = (v: unknown) =>
  v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";

function project(value: unknown, shape: Shape): unknown {
  if (typeof shape === "function") return value == null ? value : shape(value);
  if (shape === "prim") return isPrim(value) ? value : undefined;
  if (shape === "prims") return Array.isArray(value) ? value.filter(isPrim) : undefined;
  if (shape === "value")
    return isPrim(value) ? value : Array.isArray(value) ? value.filter(isPrim) : undefined;
  if (value === null || value === undefined) return value;
  if (shape === "record") {
    if (typeof value !== "object" || Array.isArray(value)) return undefined;
    return Object.fromEntries(Object.entries(value).filter(([, v]) => isPrim(v)));
  }
  if (Array.isArray(shape)) {
    return Array.isArray(value) ? value.map((v) => project(v, shape[0] as Shape)) : undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(shape as Record<string, Shape>)) {
    if (k in value) out[k] = project((value as Record<string, unknown>)[k], s);
  }
  return out;
}

const MILESTONE_FIELDS: Shape = {
  key: "prim",
  day: "prim",
  throughDay: "prim",
  label: "prim",
  owner: "prim",
  kind: "prim",
  minutes: "prim",
  detail: "prim",
  homework: "prims",
  icon: "prim",
  date: "prim",
  doneOn: "prim",
  time: "prim",
  phase: "prim",
  serviceId: "prim",
};
/** A plan step: its date as it stands. Whether and from where it was moved is ours. */
const MILESTONE: Shape = (m) => {
  const out = project(m, MILESTONE_FIELDS) as Record<string, unknown>;
  return { ...out, moved: false, shifted: false, plannedDate: out["date"] };
};
const SERVICE_PLAN: Shape = {
  id: "prim",
  kind: "prim",
  label: "prim",
  name: "prim",
  phase: "prim",
  weeks: "prim",
  tier: "prim",
  icon: "prim",
  startsOn: "prim",
  endsOn: "prim",
  doneOn: "prim",
  needs: "prim",
  milestones: [MILESTONE],
};
const TIMELINE: Shape = {
  closeDate: "prim",
  path: "prim",
  training: "prim",
  servicesOnly: "prim",
  holidays: "prims",
  edited: "prim",
  existingBuild: "prim",
  milestones: [MILESTONE],
  liveDate: "prim",
  liveDoneOn: "prim",
  timezone: "prim",
  progress: { done: "prim", total: "prim" },
  alongside: [SERVICE_PLAN],
  phases: [
    {
      phase: "prim",
      label: "prim",
      gate: "prim",
      tentative: "prim",
      startsOn: "prim",
      endsOn: "prim",
      done: "prim",
      services: [SERVICE_PLAN],
    },
  ],
  currentPhase: "prim",
  allDone: "prim",
  integration: {
    tier: "prim",
    name: "prim",
    weeks: "prim",
    summary: "prim",
    target: "prim",
    startsOn: "prim",
    endsOn: "prim",
    provenOn: "prim",
    tentative: "prim",
    milestones: [MILESTONE],
  },
};
const JOURNEY_STAGE: Shape = {
  key: "prim",
  label: "prim",
  state: "prim",
  blurb: "prim",
  target: { originalDate: "prim", currentDate: "prim", actualDate: "prim" },
};
const SOLUTION_FIELDS: Shape = {
  id: "prim",
  name: "prim",
  kind: "prim",
  status: "prim",
  statusKey: "prim",
  who: "prim",
  when: "prim",
  canConfirm: "prim",
  responsiblePerson: "prim",
  ballDate: "prim",
  dueDate: "prim",
};
/**
 * A solution, for the customer: never the internal note, and a blocker only
 * when it is waiting on the customer — one recorded on the GoCanvas side is
 * internal and never leaves the server.
 */
const SOLUTION: Shape = (s) => ({
  ...(project(s, SOLUTION_FIELDS) as Record<string, unknown>),
  note: null,
  blocked: (s as { blocked?: unknown }).blocked === "customer" ? "customer" : null,
});
/** Only the homework keys the page ticks, each with its date. */
const HOMEWORK_DONE: Shape = (v) =>
  Object.fromEntries(
    Object.entries((v ?? {}) as Record<string, unknown>).filter(
      ([k, at]) => (HOMEWORK_KEYS as readonly string[]).includes(k) && typeof at === "string",
    ),
  );
/** The handoff questions on the customer's page: what is known, what is still needed. */
const CUSTOMER_INTAKE: Shape = {
  known: [{ key: "prim", ask: "prim", value: "value", confirmed: "prim" }],
  needed: [{ key: "prim", ask: "prim", hint: "prim", kind: "prim" }],
};
const CUSTOMER_VIEW: Shape = {
  clientName: "prim",
  industry: "prim",
  icon: "prim",
  timeline: TIMELINE,
  lead: "prim",
  fieldTester: "prim",
  fieldTesterDue: "prim",
  fieldTesterSource: "prim",
  team: {
    lead: "prim",
    leadEmail: "prim",
    leadCard: { title: "prim", bookingUrl: "prim", photoUrl: "prim", bio: "prim" },
    accountManager: "prim",
    solutionsEngineer: "prim",
    champion: { name: "prim", role: "prim" },
    others: [{ name: "prim", role: "prim", does: "prim" }],
  },
  firstForm: { name: "prim", objective: "prim", source: "prim" },
  firstFormSource: "prim",
  nextUseCases: [{ name: "prim", objective: "prim" }],
  purchasedSolutions: [
    { name: "prim", kind: "prim", phase: "prim", tool: "prim", acceptance: "prim" },
  ],
  photoUrl: "prim",
  toolMarks: "record",
  clientLogoUrl: "prim",
  homeworkDone: HOMEWORK_DONE,
  hiddenScreens: "prims",
  textOverrides: "record",
  path: "prim",
  helpPicks: [{ article_id: "prim", title: "prim", url: "prim", why: "prim", when: "prim" }],
  goBase: "prim",
  intake: CUSTOMER_INTAKE,
  journey: {
    stages: [JOURNEY_STAGE],
    current: JOURNEY_STAGE,
    headline: "prim",
    solutions: [SOLUTION],
    yours: [{ what: "prim", by: "prim", kind: "prim", ownerSide: "prim", ownerName: "prim" }],
  },
  partner: {
    currentLabel: "prim",
    stages: [
      { key: "prim", label: "prim", state: "prim", targetDate: "prim", completedDate: "prim" },
    ],
    actions: [{ id: "prim", title: "prim", blocked: "prim" }],
    blockers: [{ id: "prim", title: "prim" }],
    nextMilestone: { name: "prim", date: "prim" },
    graduationTarget: "prim",
  },
  partnerUnavailable: "prim",
  partnerDeal: "prim",
  partnerName: "prim",
  parkingLot: [
    { request: "prim", target: "prim", status: "prim", neededForLaunch: "prim", owner: "prim" },
  ],
  customerScope: { state: "prim", items: "prims" },
};

/**
 * What answering a question on the link sends back: the same allow-list as
 * the page's own `intake`, so a field added to the prompt later never
 * reaches the customer's browser by this path either.
 */
export function customerIntakeView(intake: CustomerPrompt): CustomerPrompt {
  return project(intake, CUSTOMER_INTAKE) as CustomerPrompt;
}

/** What ticking homework on the link sends back: only the keys the page ticks. */
export function customerHomeworkView(record: Record<string, unknown>): Record<string, string> {
  return project(record, HOMEWORK_DONE) as Record<string, string>;
}

/**
 * The customer's copy of the page. The customer's link reads this, never the
 * internal record. Built from the allow-list above, not by copying the
 * internal view and blanking what is known to be internal: the focus
 * provenance and quotes (Gong, SOW, intake), the internal reasons on a
 * solution's note and blocker, who validated the workflow, the review state,
 * the readiness list, the stored link and its QR, and the plan's record of
 * moved dates all stay on the server. The internal preview reads the full
 * record; the TIS's customer preview reads this.
 */
export function customerWelcomeView(view: WelcomeView): CustomerDashboardView {
  const shared = project(view, CUSTOMER_VIEW) as Omit<
    CustomerDashboardView,
    | "dealId"
    | "aiReading"
    | "reviewed"
    | "readiness"
    | "formArtifacts"
    | "shareUrl"
    | "qrDataUrl"
    | "sharedAt"
    | "openedAt"
    | "helpOpened"
    | "implementationFocus"
    | "implementationFocusFallback"
    | "currentProcess"
    | "currentProcessSource"
    | "workflowStory"
  >;
  // Text the AI wrote stays off the customer's page until a person owns it.
  const personProcess = view.currentProcessSource === "ai" ? null : (view.currentProcess ?? null);
  const story = view.workflowStory;
  return {
    ...shared,
    // The Hub's own identifier for the deal never leaves the server on a customer's copy.
    dealId: "",
    // Review state is ours: the customer's copy never carries it.
    aiReading: null,
    reviewed: null,
    readiness: [],
    formArtifacts: [],
    shareUrl: null,
    qrDataUrl: null,
    sharedAt: null,
    openedAt: null,
    helpOpened: {},
    implementationFocus: null,
    implementationFocusFallback: [],
    currentProcess: personProcess,
    currentProcessSource: personProcess ? (view.currentProcessSource ?? null) : null,
    // The workflow story only once a person validated it, and never who did.
    workflowStory:
      story && story.validatedAt
        ? {
            before: story.before,
            during: story.during,
            after: story.after,
            validatedAt: story.validatedAt,
            validatedBy: null,
          }
        : null,
  };
}

/**
 * The lead's booking link is OFF unless it is switched on for this customer.
 * It is not a screen — it is the "Book time with …" link on the team and
 * closing screens — but it lives in the same list, under the same rule, so
 * one switch in the sidebar governs it and nothing about the record changes.
 */
export const BOOKING_KEY = "booking";

/** Whether the lead's booking link is on the page for this customer. */
export function bookingShown(hidden: ReadonlyArray<string>): boolean {
  return isScreenShown(BOOKING_KEY, hidden);
}

/**
 * Screens that are OFF unless the presenter switches them on for this
 * customer: the "at a glance" phase cards and the "today → live" story. Both
 * say things the timeline and the plan already say; five screens is the deck,
 * seven is the long version. They are stored in the same hidden list as a
 * "+key" entry, so nothing about the record's shape changes.
 */
export const OPTIONAL_SCREENS: ReadonlySet<string> = new Set(["overview", "form", BOOKING_KEY]);

export function isScreenShown(key: string, hidden: ReadonlyArray<string>): boolean {
  return OPTIONAL_SCREENS.has(key) ? hidden.includes(`+${key}`) : !hidden.includes(key);
}

/** The hidden list after switching one screen on or off. */
export function toggleScreen(hidden: ReadonlyArray<string>, key: string, show: boolean): string[] {
  if (OPTIONAL_SCREENS.has(key)) {
    const marker = `+${key}`;
    return show ? [...new Set([...hidden, marker])] : hidden.filter((k) => k !== marker);
  }
  return show ? hidden.filter((k) => k !== key) : [...new Set([...hidden, key])];
}

/** The homework items the customer ticks, keyed so a reworded item keeps its tick. */
export const HOMEWORK_KEYS = ["app", "user", "list"] as const;
export type HomeworkKey = (typeof HOMEWORK_KEYS)[number];
