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
 * re-filtered by review_flag here. ONE EXCEPTION: a list the AI reading
 * saved on its own (`aiFilled`, nobody pressed Generate) has had no
 * review at all, so while it is unvalidated its flagged items — Gong-only,
 * or in conflict with the SOW — stay off the slide exactly like a flagged
 * fallback candidate. A person's save of the list, or Confirm, lifts that.
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
  return { before: story.before, during: story.during, after: story.after };
}

/** The customer's stated business outcome, when the handoff has a shared, answered one. */
export function kickoffBusinessOutcome(view: Pick<WelcomeView, "intake">): string | null {
  const known = view.intake?.known.find((k) => k.key === "business_outcome");
  if (!known) return null;
  const v = known.value;
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Whether the outcome on screen is the customer's confirmed words. An
 * answer the AI read out of the calls, or Sales typed, is shown with a
 * "to confirm" marker until the customer confirms it on their page — never
 * read aloud as something they said.
 */
export function kickoffBusinessOutcomeConfirmed(view: Pick<WelcomeView, "intake">): boolean {
  return Boolean(view.intake?.known.find((k) => k.key === "business_outcome")?.confirmed);
}

/**
 * Whether the workflow on screen still needs the customer's word: a saved
 * story that nobody has validated, or the structured fallback, which is a
 * hypothesis by construction. Only a story with `validatedAt` set is shown
 * without the marker.
 */
export function kickoffWorkflowToConfirm(
  story: Pick<WorkflowStoryView, "validatedAt"> | null | undefined,
): boolean {
  return !story?.validatedAt;
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

/**
 * Screen 4: who does what, in plain words. Static working-agreement copy,
 * never a contract term: a response deadline is shown only when it has been
 * verified from the signed agreement, and this module has no such data.
 */
export const KICKOFF_RESPONSIBILITY: ReadonlyArray<{
  icon: string;
  label: string;
  items: readonly string[];
}> = [
  {
    icon: "Wrench",
    label: "GoCanvas",
    items: [
      "Prepare the first working version of the form",
      "Configure it and guide the changes",
      "Answer questions and keep the build moving",
    ],
  },
  {
    icon: "Handshake",
    label: "Together",
    items: [
      "Communicate through one named contact on each side",
      "Test on real work, then refine",
      "Decide on scope and timing as a pair",
    ],
  },
  {
    icon: "HardHat",
    label: "Your team",
    items: [
      "Decide what the form should capture",
      "Test it on real jobs and report back",
      "Raise blockers early and name an owner for each next action",
    ],
  },
];

/** Screen 4: what happens when a request changes what was agreed. */
export const KICKOFF_CHANGE_RULE =
  "New requests come in through the same contact. We review what they change in scope or dates before the work is redirected.";

/** Screen 5: the three steps of the form review, in the order we take them. */
export const KICKOFF_FORM_STEPS: ReadonlyArray<{ label: string; text: string }> = [
  { label: "Review the form together", text: "Walk the first screens against the workflow." },
  { label: "Make agreed edits live", text: "Change the form in GoCanvas while we are together." },
  { label: "Prepare one real-world test", text: "Pick a real job, device and feedback route." },
];

/**
 * A short-lived signed link, kept stable while it is still fresh. The view
 * is re-read every few seconds, and each read signs the link again, so a new
 * string each time would reload the picture on every refresh. The link is
 * reused until it is close to expiring.
 */
const SIGNED_LINK_REUSE_MS = 50 * 60 * 1000;
const heldSignedLinks = new Map<string, { url: string; at: number }>();
export function stableSignedUrl(url: string, now = Date.now()): string {
  const key = url.split("?")[0] ?? url;
  const held = heldSignedLinks.get(key);
  if (held && now - held.at < SIGNED_LINK_REUSE_MS) return held.url;
  heldSignedLinks.set(key, { url, at: now });
  return url;
}
