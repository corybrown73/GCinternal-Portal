import type { ImplementationFocusView, WelcomeView, WorkflowStoryView } from "./welcome";
import type { CustomerJourney, JourneyStage } from "./welcome-journey";

/**
 * Pure data-shaping for Kickoff View's five fixed screens, kept separate
 * from their JSX (src/components/kickoff-view.tsx) so the rules that
 * matter — what counts as agreed, when the workflow story is worth
 * showing, how a long focus list is grouped for the slide — are testable
 * without rendering anything.
 */

export type KickoffFocusContent =
  | { state: "empty" }
  | { state: "proposed"; items: string[] }
  | { state: "agreed"; items: string[] };

/**
 * What the "Our focus" screen may say — never the source provenance
 * (SOW/Intake/Gong) or review flags implementationFocus (or its
 * presentation-only fallback) also carries. Returning only item text makes
 * it structurally impossible for that screen to leak a source chip or a
 * conflict warning: there is nothing here to render one from.
 *
 * PRECEDENCE: a saved item — agreed or still proposed — always wins, in
 * its saved state, exactly as saved: items deliberately generated or
 * edited in the Hub are the TIS's own working proposal, so they are never
 * re-filtered by review_flag here.
 *
 * `fallbackItems` (proposeImplementationFocus's output, read fresh on
 * every view, never persisted) is used only when nothing has been saved
 * at all, and always renders as "proposed": a presentation-time proposal
 * is never agreed implementation truth. Unlike saved items, a fallback
 * candidate reaches a customer automatically, with no TIS review in
 * between — so only `reviewFlag === null` candidates are customer-safe.
 * A candidate flagged "gong_only" (named only on a sales call, never
 * purchased) or "conflict" (disagrees with what was actually bought)
 * stays internal review context: it is left out of the slide, never
 * mutated or deleted, available to the TIS exactly as
 * proposeImplementationFocus produced it everywhere else in the Hub.
 */
export function kickoffFocusContent(
  focus: Pick<ImplementationFocusView, "items" | "validatedAt"> | null | undefined,
  fallbackItems?: ImplementationFocusView["items"] | null,
): KickoffFocusContent {
  const items = focus?.items ?? [];
  if (items.length) {
    return {
      state: focus?.validatedAt ? "agreed" : "proposed",
      items: items.map((i) => i.text),
    };
  }
  const safeFallback = (fallbackItems ?? []).filter((i) => i.reviewFlag === null);
  if (!safeFallback.length) return { state: "empty" };
  return { state: "proposed", items: safeFallback.map((i) => i.text) };
}

export type KickoffFocusGroups = {
  now: string[];
  next: string[];
  later: string[];
};

/**
 * NOW/NEXT/LATER grouping for the "Our focus" screen — a pure
 * presentation reshaping of kickoffFocusContent's already-safe item text.
 * NOW is the single leading item (the dominant visual), NEXT the next
 * couple, LATER a short tail; anything beyond a small, deliberate display
 * cap is left off the slide rather than overflowing it. This may cap,
 * group or omit already-available text — it may never invent an item that
 * was not already in the list.
 */
export function kickoffFocusGroups(items: readonly string[]): KickoffFocusGroups {
  return {
    now: items.slice(0, 1),
    next: items.slice(1, 3),
    later: items.slice(3, 6),
  };
}

export type KickoffWorkflowContent = Pick<WorkflowStoryView, "before" | "during" | "after"> | null;

/**
 * The Before/During/After story, when there is one worth showing. Null
 * means the caller falls back to kickoffWorkflowFallback instead — never
 * three empty columns.
 */
export function kickoffWorkflowStory(
  story: Pick<WorkflowStoryView, "before" | "during" | "after"> | null | undefined,
): KickoffWorkflowContent {
  if (!story || !(story.before || story.during || story.after)) return null;
  return { before: story.before, during: story.during, after: story.after };
}

/**
 * A presentation-only Before/During/After hypothesis, built only from
 * structured facts the Welcome page already carries (the current process,
 * the first form being implemented, the stated business outcome) — never
 * invented, never persisted. Used only when workflow_story has nothing
 * saved. Null when there isn't enough evidence for any leg, so the caller
 * shows a validation-oriented screen instead of three empty columns.
 */
export function kickoffWorkflowFallback(input: {
  currentProcess: string | null;
  firstFormName: string | null;
  businessOutcome: string | null;
}): KickoffWorkflowContent {
  const before = input.currentProcess;
  const during = input.firstFormName ? `Running ${input.firstFormName} on the job.` : null;
  const after = input.businessOutcome;
  if (!before && !during && !after) return null;
  return { before, during, after };
}

/**
 * Trims a presentation string to a safe slide length — never mid-word,
 * never inventing or paraphrasing content. Only shortens what is already
 * there, for the "concise, not paragraph-heavy" rule on the Workflow and
 * Focus slides.
 */
export function kickoffConcise(text: string | null, maxLen = 130): string | null {
  if (!text) return text;
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  const cut = trimmed.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : maxLen)}…`;
}

/**
 * "Your workflow" — the merged recognition/validation screen's content, in
 * one call: saved workflow_story wins outright; otherwise the structured
 * fallback; either way, trimmed to a safe, concise slide length. Null
 * means there isn't enough evidence for any leg at all, so the screen
 * shows a validation-oriented message instead of a process diagram.
 */
export function kickoffWorkflowSlide(input: {
  workflowStory: Pick<WorkflowStoryView, "before" | "during" | "after"> | null | undefined;
  currentProcess: string | null;
  firstFormName: string | null;
  businessOutcome: string | null;
}): KickoffWorkflowContent {
  const story =
    kickoffWorkflowStory(input.workflowStory) ??
    kickoffWorkflowFallback({
      currentProcess: input.currentProcess,
      firstFormName: input.firstFormName,
      businessOutcome: input.businessOutcome,
    });
  if (!story) return null;
  return {
    before: kickoffConcise(story.before),
    during: kickoffConcise(story.during),
    after: kickoffConcise(story.after),
  };
}

/** The customer's stated business outcome, when the handoff has a shared, answered one. */
export function kickoffBusinessOutcome(view: Pick<WelcomeView, "intake">): string | null {
  const known = view.intake?.known.find((k) => k.key === "business_outcome");
  if (!known) return null;
  const v = known.value;
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * The deck's closing action — always testing-oriented, never
 * administrative. Deliberately does NOT read from view.journey.yours[0]:
 * that list also carries homework ("download the app"), parking-lot items
 * and other waiting/administrative asks, none of which belong as the one
 * thing a customer remembers leaving a Kickoff call. Uses the customer's
 * own first-form name when there is one; falls back to a safe, generic
 * line otherwise. Presentation only — this never reads or writes the
 * actual journey "who has the ball" truth.
 */
export function kickoffNextStepText(firstFormName: string | null): string {
  const target = firstFormName?.trim() || "your GoCanvas workflow";
  return `Put it to work. Test ${target} on a real job and see what needs to change.`;
}

/**
 * Kickoff View IS the presentation used during the Kickoff call, so its
 * path-to-launch rail must read as "we are at Kickoff right now" whenever
 * the account's actual stage is still pre_kickoff (before the call has
 * happened) — showing "Intake & Process" as the current stage while the
 * customer is literally sitting in the Kickoff meeting is presentation
 * truth drift, not implementation truth.
 *
 * This is a pure, render-only reshaping: it builds a new array and never
 * mutates `journey` or anything on it, and it changes nothing once the
 * account has actually moved past Kickoff (current.key !== "pre_kickoff")
 * — there is nothing to correct in that case, since the rail already
 * shows Kickoff (or later) as current. The underlying stage, used by the
 * customer Implementation Plan, is read here, never written.
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

/**
 * The bottom band on "Your path to launch" — fixed Kickoff-presentation
 * copy, never `view.journey.current.blurb` (written for the living
 * Implementation Plan's current stage, not for "you are presenting this
 * during the Kickoff call itself"). A plain constant, not a function of
 * any account data, so there is structurally nowhere for a stage's own
 * pre-kickoff messaging to end up here.
 */
export const KICKOFF_JOURNEY_BAND =
  "Today we validate the process and first objective. Next, we get it working on real work.";

/* ------------------------------------------------------------------------
 * KICKOFF CONVERSATION FRAMEWORK — static, reusable presentation copy that
 * turns the five screens into a scaffold a TIS can run the call from, not
 * just a customer summary deck. None of this is customer truth: it is the
 * same handful of conversation prompts and implementation principles for
 * every account, kept here (not in WelcomeView, not persisted) because it
 * belongs to the Kickoff methodology, never to one deal's record.
 * ---------------------------------------------------------------------- */

/** Screen 1: the lightweight "today we'll…" promise — what this call does, not an agenda. */
export const KICKOFF_PROMISE: ReadonlyArray<{ icon: string; text: string }> = [
  { icon: "Search", text: "Confirm how the work really happens" },
  { icon: "Target", text: "Agree what we're getting working first" },
  { icon: "Rocket", text: "Get you ready to test it on real work" },
];

export type KickoffWorkflowPrompts = {
  before: readonly string[];
  during: readonly string[];
  after: readonly string[];
};

/**
 * Screen 2: the TIS's own BEFORE/DURING/AFTER question framework, applied
 * to whatever workflow is on screen. Reusable and account-independent by
 * construction — these never read WelcomeView, so there is nowhere for an
 * account-specific branch to sneak in.
 */
export const KICKOFF_WORKFLOW_PROMPTS: KickoffWorkflowPrompts = {
  before: ["How does the worker know what to do?", "What do they need before they start?"],
  during: ["What must they capture?", "What makes the job complete?"],
  after: ["Who needs to see it?", "Does it drive another system or process?"],
};

/** Screen 3: why we get one workflow working well before expanding — the implementation approach, not invented scope. */
export const KICKOFF_PRINCIPLES: ReadonlyArray<{ icon: string; label: string }> = [
  { icon: "Smartphone", label: "Make the work easy" },
  { icon: "ClipboardCheck", label: "Make the information useful" },
  { icon: "Workflow", label: "Connect what matters" },
];

/**
 * Screen 4: a short outcome-oriented line per canonical stage. Presentation
 * copy only — the stage list, order and labels still come from
 * view.journey (welcome-journey.ts); this never redefines or persists a
 * stage, it only explains one already on screen.
 */
export const KICKOFF_STAGE_OUTCOME: Record<string, string> = {
  pre_kickoff: "Understand the work and prepare",
  kickoff: "Validate the process and first objective",
  get_it_working: "Prove the workflow end to end",
  make_it_yours: "Use it on real work and adjust",
  make_it_run: "Run it as the normal process",
  complete: "Confirm it is operational and hand off cleanly",
};

/** Screen 4: what working together actually feels like, day to day. */
export const KICKOFF_RESPONSIBILITY: ReadonlyArray<{ icon: string; label: string; items: string }> =
  [
    { icon: "Wrench", label: "GoCanvas", items: "Prepare · Recommend · Configure · Guide" },
    { icon: "Handshake", label: "Together", items: "Validate · Test · Refine" },
    { icon: "HardHat", label: "Your team", items: "Decide · Adopt · Run" },
  ];

/** Screen 5: the handoff from this call into testing — what happens next, before the CTA. */
export const KICKOFF_HANDOFF: ReadonlyArray<{ label: string; text: string }> = [
  { label: "We refine", text: "We apply what we confirmed today to the working version." },
  { label: "You test", text: "Your team uses it on real work." },
  { label: "We learn", text: "You tell us what worked, what didn't, and what needs changing." },
];
