import type { ImplementationFocusView, WelcomeView, WorkflowStoryView } from "./welcome";

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
 * its saved state. `fallbackItems` (proposeImplementationFocus's output,
 * read fresh on every view, never persisted) is used only when nothing has
 * been saved at all, and always renders as "proposed": a presentation-time
 * proposal is never agreed implementation truth.
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
  const fallback = fallbackItems ?? [];
  if (!fallback.length) return { state: "empty" };
  return { state: "proposed", items: fallback.map((i) => i.text) };
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
