/**
 * Can this project leave its current stage?
 *
 * Pure: no imports, no I/O, safe in a client bundle and testable without a
 * database. The rule it encodes is the product decision behind stage gates —
 * three core criteria per stage, everything else optional — and the reason it
 * lives here rather than in a component is that "ready to advance" is an answer
 * two different surfaces need to agree on: the stage rail and the plan panel.
 */

export type GateItem = {
  id: string;
  task_key: string | null;
  title: string;
  status: string;
  is_gate: boolean;
  party: string;
  owner_name?: string | null;
  due_at?: string | null;
};

export type StageGateStatus = {
  /** The core criteria for this stage, in plan order. */
  gates: GateItem[];
  done: number;
  total: number;
  /** Every core criterion is complete. */
  ready: boolean;
  /** The gates still outstanding — what the UI names when it says why not. */
  remaining: GateItem[];
  /**
   * True when the stage has no gates at all. A stage nobody has defined
   * criteria for cannot block anybody: refusing to advance out of it would be
   * an unexplainable dead end, so it is treated as passable and SAID to be
   * ungated rather than quietly reported as "ready".
   */
  ungated: boolean;
};

/** A work item counts as complete when it is done or deliberately skipped. */
export function isSettled(status: string): boolean {
  return status === "done" || status === "skipped";
}

export function stageGateStatus(items: readonly GateItem[]): StageGateStatus {
  const gates = items.filter((i) => i.is_gate);
  const remaining = gates.filter((g) => !isSettled(g.status));
  const done = gates.length - remaining.length;
  return {
    gates,
    done,
    total: gates.length,
    remaining,
    ready: remaining.length === 0,
    ungated: gates.length === 0,
  };
}

/**
 * The sentence shown next to the advance control.
 *
 * Written to be read by somebody who wants to move on and cannot, so it names
 * what is missing rather than reporting a count. "2 of 3 complete" tells you
 * that you are stuck; "Waiting on: Sign off the plan and the dates" tells you
 * what to go and do, which is the only useful version of the same fact.
 */
export function gateSummary(s: StageGateStatus): string {
  if (s.ungated) return "No core criteria defined for this stage";
  if (s.ready) return `All ${s.total} core criteria complete`;
  if (s.remaining.length === 1) return `Waiting on: ${s.remaining[0]!.title}`;
  return `${s.done} of ${s.total} complete — waiting on ${s.remaining.length} criteria`;
}

/**
 * What advancing from here costs.
 *
 * THE BUG THIS REPLACES. Two booleans disagreed about what `blocking` means.
 * `canAdvance` returned false for a blocking stage with unmet gates, and
 * `needsOverride` ALSO returned false — because it read `gateMode !==
 * "blocking"`. So a blocking stage was not "advance only with a recorded
 * override"; it was a dead end with no override path at all, and the panel
 * rendered a permanently disabled button.
 *
 * That went unnoticed because exactly one stage in one template was blocking,
 * and nothing had reached it. Promoting Handoff to blocking would have hard-
 * locked every new project at its first stage.
 *
 * THE RULE, stated once. This app records what happened rather than refusing
 * to let people describe reality: somebody who genuinely launched without
 * training the crews has to be able to say so. What they must not get is to do
 * it by ACCIDENT, or ANONYMOUSLY. So every stage can always be left, and
 * `gate_mode` decides the ceremony:
 *
 *   clear         — gates met, or none defined. Ordinary control.
 *   advisory_gap  — gates unmet on an advisory stage. Secondary control,
 *                   confirm, reason optional.
 *   blocking_gap  — gates unmet on a blocking stage. Secondary control,
 *                   confirm, reason REQUIRED, recorded as an override.
 */
export type GateOutcome = "clear" | "advisory_gap" | "blocking_gap";

export function gateOutcome(s: StageGateStatus, gateMode: string | null | undefined): GateOutcome {
  if (s.ready || s.ungated) return "clear";
  return gateMode === "blocking" ? "blocking_gap" : "advisory_gap";
}

/** Whether advancing right now needs a deliberate "yes, anyway". */
export function needsOverride(s: StageGateStatus, gateMode: string | null | undefined): boolean {
  return gateOutcome(s, gateMode) !== "clear";
}

/** Whether the person has to say WHY, in their own words, before it is allowed. */
export function requiresReason(s: StageGateStatus, gateMode: string | null | undefined): boolean {
  return gateOutcome(s, gateMode) === "blocking_gap";
}

/**
 * The label on the advance control.
 *
 * "Move to Build" and "Override to advance" are different acts and should not
 * share a word. The middle case says "anyway" because that is what it is.
 */
export function advanceLabel(outcome: GateOutcome, nextStageName: string): string {
  if (outcome === "clear") return `Move to ${nextStageName}`;
  if (outcome === "advisory_gap") return "Advance anyway";
  return "Override to advance";
}

/**
 * What the confirmation says before an override is recorded.
 *
 * Names every unmet criterion rather than counting them: a person about to
 * sign their name to skipping three things should read the three things.
 */
export function overridePrompt(s: StageGateStatus, nextStageName: string): string {
  const items = s.remaining.map((g) => g.title);
  const list = items.length === 1 ? items[0]! : items.map((t) => `• ${t}`).join("\n");
  return `Moving to ${nextStageName} with ${items.length} criteri${
    items.length === 1 ? "on" : "a"
  } outstanding:\n\n${list}\n\nThis is recorded against your name in the change history.`;
}
