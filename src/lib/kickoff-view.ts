import type { ImplementationFocusView, WelcomeView, WorkflowStoryView } from "./welcome";

/**
 * Pure data-shaping for Kickoff View's screens, kept separate from their
 * JSX (src/components/kickoff-view.tsx) so the rules that matter — what
 * counts as agreed, when the workflow story is worth showing — are
 * testable without rendering anything.
 */

export type KickoffFocusContent =
  | { state: "empty" }
  | { state: "proposed"; items: string[] }
  | { state: "agreed"; items: string[] };

/**
 * What the "What we're working on" screen may say — never the source
 * provenance (SOW/Intake/Gong) or review flags implementationFocus (or its
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
 * shows a validation-oriented screen instead of three empty columns that
 * would just repeat the Understanding screen's content.
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

/** The customer's stated business outcome, when the handoff has a shared, answered one. */
export function kickoffBusinessOutcome(view: Pick<WelcomeView, "intake">): string | null {
  const known = view.intake?.known.find((k) => k.key === "business_outcome");
  if (!known) return null;
  const v = known.value;
  return typeof v === "string" && v.trim() ? v : null;
}
