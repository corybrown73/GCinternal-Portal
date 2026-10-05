import { describe, expect, it } from "vitest";

import { stageGuidanceFor } from "../stage-guidance";
import { FLOW_STAGES } from "../stage-flow";

/**
 * The Navigator guidance is static content with one real failure mode: a
 * `stuck` entry's key not matching an issue, which silently produces
 * undefined fields rather than throwing.
 */

const COVERED = ["kickoff", "get_it_working", "make_it_yours", "make_it_run", "complete"] as const;

describe("Navigator stage guidance", () => {
  it("covers exactly the stages the Navigator covers, and nothing else", () => {
    for (const s of FLOW_STAGES) {
      const g = stageGuidanceFor(s.key);
      if ((COVERED as readonly string[]).includes(s.key)) expect(g, s.key).not.toBeNull();
      else expect(g, s.key).toBeNull();
    }
  });

  it("resolves every stuck prompt to real issue content, for every covered stage", () => {
    for (const key of COVERED) {
      const g = stageGuidanceFor(key)!;
      expect(g.purpose.length).toBeGreaterThan(0);
      expect(g.checks.length).toBeGreaterThan(0);
      expect(g.readyWhen.length).toBeGreaterThan(0);
      expect(g.next.length).toBeGreaterThan(0);
      expect(g.remember.length).toBeGreaterThan(0);
      expect(g.stuck.length).toBeGreaterThan(0);
      for (const s of g.stuck) {
        expect(s.title, `${key}:${s.key}`).toBeTruthy();
        expect(s.why, `${key}:${s.key}`).toBeTruthy();
        expect(s.action, `${key}:${s.key}`).toBeTruthy();
      }
    }
  });
});
