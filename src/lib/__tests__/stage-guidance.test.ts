import { describe, expect, it } from "vitest";

import { stageGuidanceFor } from "../stage-guidance";
import { FLOW_STAGES } from "../stage-flow";

/**
 * Stage guidance is static content with one real failure mode: a `stuck`
 * entry's key not matching an issue, which silently produces undefined
 * fields rather than throwing.
 */

const COVERED = ["kickoff", "get_it_working", "make_it_yours", "make_it_run", "complete"] as const;

describe("stage guidance", () => {
  it("covers exactly the canonical stages with guidance, and nothing else", () => {
    for (const s of FLOW_STAGES) {
      const g = stageGuidanceFor(s.key);
      if ((COVERED as readonly string[]).includes(s.key)) expect(g, s.key).not.toBeNull();
      else expect(g, s.key).toBeNull();
    }
  });

  it("resolves every stuck prompt to real issue content, for every covered stage", () => {
    for (const key of COVERED) {
      const g = stageGuidanceFor(key)!;
      expect(g.objective.length).toBeGreaterThan(0);
      expect(g.objectiveDetail.length).toBeGreaterThan(0);
      expect(g.checks.length).toBeGreaterThan(0);
      expect(g.readyLabel.length).toBeGreaterThan(0);
      expect(g.readyWhen.length).toBeGreaterThan(0);
      expect(g.next.length).toBeGreaterThan(0);
      expect(g.stuck.length).toBeGreaterThan(0);
      for (const s of g.stuck) {
        expect(s.status, `${key}:${s.key}`).toBeTruthy();
        expect(s.actions.length, `${key}:${s.key}`).toBeGreaterThan(0);
        expect(s.gate, `${key}:${s.key}`).toBeTruthy();
        expect(typeof s.blocks, `${key}:${s.key}`).toBe("boolean");
      }
    }
  });
});
