import type { ImplementationFocusItem, IntakeAnswers } from "./intake-answers";
import type { Timeline } from "./onboarding-timeline";
import type { CustomerPrompt } from "./sales-handoff";
import type { CustomerJourney } from "./welcome-journey";

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
  a: Pick<IntakeAnswers, "implementation_focus">,
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
  nextUseCases: Array<{ name: string; objective: string | null }>;
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
  /** Present when the viewer is internal and a link has been issued. */
  shareUrl: string | null;
  /** The link as a QR (PNG data URL), made on the server. Internal only. */
  qrDataUrl: string | null;
  sharedAt: string | null;
  openedAt: string | null;
  /** Screen keys the presenter switched off for this customer. Both modes honour it. */
  hiddenScreens: string[];
  /** Text rewritten in place on the page, by text key. Both modes read it. */
  textOverrides: Record<string, string>;
  /** New logo or existing account — the words on every screen follow it. */
  path: "new_logo" | "existing" | "dm_conversion" | "field_fusion";
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
};

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
