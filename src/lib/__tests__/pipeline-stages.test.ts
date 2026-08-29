import { describe, expect, it } from "vitest";

import {
  BUILTIN_PIPELINE_STAGES,
  findStage,
  isAtOrPast,
  isStageColor,
  PIPELINE_STAGE_KEY_PATTERN,
  stageAfterWon,
  stageLabel,
  stageOrder,
  terminalStage,
  wonStage,
  type PipelineStage,
} from "../pipeline-stages";
import { STAGES, STAGE_LABELS } from "../presale-stages";

/**
 * The pure half of the configurable pipeline (docs/design/presale-stages.md).
 *
 * Two things are pinned here and a regression in either is silent and
 * expensive. The first is that the compiled-in default is EXACTLY the enum —
 * that is the whole "day one is identical" claim, and 0028's seed is a copy of
 * it. The second is that "Closed Won" is now a mark on a stage rather than a
 * string: if `wonStage` ever falls back to a literal, moving the mark would
 * silently keep the handoff gate pointing at the old stage.
 */

const stage = (patch: Partial<PipelineStage> & { key: string }): PipelineStage => ({
  label: patch.key,
  color: "idle",
  sort_order: 0,
  is_won: false,
  is_terminal: false,
  enterable: true,
  ...patch,
});

/** A deliberately un-GoCanvas pipeline: renamed, reordered, extra stages. */
const custom: PipelineStage[] = [
  stage({ key: "discovery", label: "Discovery", sort_order: 1, enterable: false }),
  stage({ key: "prospect", label: "Qualifying", sort_order: 2 }),
  stage({ key: "closed_won", label: "Booked", sort_order: 3, is_won: true, color: "ontrack" }),
  stage({ key: "in_onboarding", label: "Delivering", sort_order: 4 }),
  stage({ key: "onboarding_complete", label: "Live", sort_order: 5, is_terminal: true }),
];

describe("the built-in pipeline is the enum, exactly", () => {
  it("has one stage per enum value, in enum order, with the labels the UI renders", () => {
    expect(BUILTIN_PIPELINE_STAGES.map((s) => s.key)).toEqual([...STAGES]);
    for (const s of BUILTIN_PIPELINE_STAGES) {
      expect(s.label).toBe(STAGE_LABELS[s.key as keyof typeof STAGE_LABELS]);
      // Every built-in key IS an enum label, so all of them are enterable.
      expect(s.enterable).toBe(true);
    }
  });

  it("marks closed_won as won and onboarding_complete as terminal — 0028's seed", () => {
    expect(wonStage(BUILTIN_PIPELINE_STAGES).key).toBe("closed_won");
    expect(terminalStage(BUILTIN_PIPELINE_STAGES).key).toBe("onboarding_complete");
  });

  it("has exactly one of each mark, which is what the database enforces", () => {
    expect(BUILTIN_PIPELINE_STAGES.filter((s) => s.is_won)).toHaveLength(1);
    expect(BUILTIN_PIPELINE_STAGES.filter((s) => s.is_terminal)).toHaveLength(1);
  });

  it("uses only colours the CHECK constraint accepts", () => {
    for (const s of BUILTIN_PIPELINE_STAGES) expect(isStageColor(s.color)).toBe(true);
  });

  it("uses only keys the key-shape CHECK accepts", () => {
    for (const s of BUILTIN_PIPELINE_STAGES) {
      expect(PIPELINE_STAGE_KEY_PATTERN.test(s.key)).toBe(true);
    }
  });
});

describe("the won stage is read, never assumed", () => {
  it("follows the mark when it has been moved off closed_won", () => {
    const moved = custom.map((s) => ({
      ...s,
      is_won: s.key === "in_onboarding",
    }));
    expect(wonStage(moved).key).toBe("in_onboarding");
  });

  it("never returns undefined, because the database refuses to have no won stage", () => {
    // A caller should not have to write a null branch for an unrepresentable
    // state, so an unmarked list still answers with the built-in won stage.
    const unmarked = custom.map((s) => ({ ...s, is_won: false, is_terminal: false }));
    expect(wonStage(unmarked).key).toBe("closed_won");
    expect(terminalStage(unmarked).key).toBe("onboarding_complete");
    expect(wonStage([]).key).toBe("closed_won");
  });
});

describe("forward is a position in the configured order", () => {
  it("gates on the configured order, not the enum's declaration order", () => {
    // In `custom`, prospect sits AFTER discovery and BEFORE closed_won.
    expect(isAtOrPast(custom, "closed_won", "closed_won")).toBe(true);
    expect(isAtOrPast(custom, "in_onboarding", "closed_won")).toBe(true);
    expect(isAtOrPast(custom, "prospect", "closed_won")).toBe(false);
    expect(isAtOrPast(custom, "discovery", "prospect")).toBe(false);
  });

  it("re-reads after a reorder rather than caching a number", () => {
    const reordered = [...custom].reverse();
    expect(isAtOrPast(custom, "prospect", "onboarding_complete")).toBe(false);
    expect(isAtOrPast(reordered, "prospect", "onboarding_complete")).toBe(true);
  });

  it("treats an unconfigured stage as not-comparable rather than as stage zero", () => {
    // A deal in a stage nobody configured must not silently satisfy a gate.
    expect(stageOrder(custom, "onboarding_kickoff")).toBe(-1);
    expect(isAtOrPast(custom, "onboarding_kickoff", "closed_won")).toBe(false);
    expect(isAtOrPast(custom, null, "closed_won")).toBe(false);
    expect(isAtOrPast(custom, "closed_won", "nonexistent")).toBe(false);
  });
});

describe("the stage onboarding moves a won deal into", () => {
  it("is the next stage in the configured order", () => {
    expect(stageAfterWon(BUILTIN_PIPELINE_STAGES)?.key).toBe("onboarding_kickoff");
    expect(stageAfterWon(custom)?.key).toBe("in_onboarding");
  });

  it("skips a stage that is configured but not yet an account stage", () => {
    const withPending = [
      stage({ key: "closed_won", is_won: true, sort_order: 1 }),
      stage({ key: "handover", sort_order: 2, enterable: false }),
      stage({ key: "in_onboarding", sort_order: 3 }),
      stage({ key: "onboarding_complete", sort_order: 4, is_terminal: true }),
    ];
    // Not "handover": portal_transition_stage would reject a key the enum does
    // not have, so the move goes to the next stage that actually exists.
    expect(stageAfterWon(withPending)?.key).toBe("in_onboarding");
  });

  it("is null when the won stage is last, so the deal stays put", () => {
    const wonIsLast = [
      stage({ key: "prospect", sort_order: 1 }),
      stage({ key: "closed_won", sort_order: 2, is_won: true, is_terminal: true }),
    ];
    expect(stageAfterWon(wonIsLast)).toBeNull();
  });

  it("is null when everything after the won stage is not yet enterable", () => {
    const allPending = [
      stage({ key: "closed_won", sort_order: 1, is_won: true }),
      stage({ key: "handover", sort_order: 2, enterable: false }),
    ];
    expect(stageAfterWon(allPending)).toBeNull();
  });
});

describe("history keeps reading after a rename", () => {
  it("renders the current label for a stage that was relabelled", () => {
    // The transition row still holds `closed_won`; only the label moved.
    expect(stageLabel(custom, "closed_won")).toBe("Booked");
  });

  it("falls back to the raw key for a stage that is no longer configured", () => {
    // 0028 allows deleting a stage that only history names, so this is a real
    // state — and a history row must never render blank.
    expect(stageLabel(custom, "onboarding_kickoff")).toBe("onboarding_kickoff");
    expect(findStage(custom, "onboarding_kickoff")).toBeNull();
    expect(stageLabel(custom, null)).toBe("");
  });
});
