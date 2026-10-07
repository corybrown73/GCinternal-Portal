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
 * provenance (SOW/Intake/Gong) or review flags implementationFocus also
 * carries. Returning only item text makes it structurally impossible for
 * that screen to leak a source chip or a conflict warning: there is
 * nothing here to render one from.
 */
export function kickoffFocusContent(
  focus: Pick<ImplementationFocusView, "items" | "validatedAt"> | null | undefined,
): KickoffFocusContent {
  const items = focus?.items ?? [];
  if (!items.length) return { state: "empty" };
  return {
    state: focus?.validatedAt ? "agreed" : "proposed",
    items: items.map((i) => i.text),
  };
}

export type KickoffWorkflowContent = Pick<WorkflowStoryView, "before" | "during" | "after"> | null;

/**
 * The Before/During/After story, when there is one worth showing. Null
 * means the caller falls back to the existing current-process
 * presentation instead — never three empty columns.
 */
export function kickoffWorkflowStory(
  story: Pick<WorkflowStoryView, "before" | "during" | "after"> | null | undefined,
): KickoffWorkflowContent {
  if (!story || !(story.before || story.during || story.after)) return null;
  return { before: story.before, during: story.during, after: story.after };
}

/** The customer's stated business outcome, when the handoff has a shared, answered one. */
export function kickoffBusinessOutcome(view: Pick<WelcomeView, "intake">): string | null {
  const known = view.intake?.known.find((k) => k.key === "business_outcome");
  if (!known) return null;
  const v = known.value;
  return typeof v === "string" && v.trim() ? v : null;
}
