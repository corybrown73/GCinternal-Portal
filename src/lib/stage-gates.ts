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
 * Whether the advance control should be enabled.
 *
 * A stage with unmet gates is NOT hard-blocked. `gate_mode` on the stage decides
 * that, and the default across this app is 'advisory' — the app's standing
 * position is that it records what happened rather than refusing to let people
 * describe reality. Somebody who genuinely launched without training the crews
 * needs to be able to say so; what they should not get is to do it by accident.
 *
 * So: advisory shows the gap and lets you through, blocking does not.
 */
export function canAdvance(s: StageGateStatus, gateMode: string | null | undefined): boolean {
  if (s.ready || s.ungated) return true;
  return gateMode !== "blocking";
}

/** Whether advancing right now needs a deliberate "yes, anyway". */
export function needsOverride(s: StageGateStatus, gateMode: string | null | undefined): boolean {
  return !s.ready && !s.ungated && gateMode !== "blocking";
}
