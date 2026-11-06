import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("../server/audit", () => ({ audit: async () => {} }));
vi.mock("../app-config.server", () => ({ isFlagOn: async () => false }));

import { SYSTEM_PROMPT } from "../transcript-analysis.server";

/**
 * The model may suggest training progress, and nothing else of the kinds that must
 * stay with a person. The prompt names the five training types, keeps the stage,
 * checklist and purchased-solution prohibitions, and says a suggestion is for a person
 * to approve.
 */
describe("the transcript prompt's training rules", () => {
  it("names the five training suggestion types", () => {
    for (const t of [
      "training_add",
      "training_update",
      "training_delivered",
      "training_demonstrated",
      "training_follow_up",
    ]) {
      expect(SYSTEM_PROMPT).toContain(`"${t}"`);
    }
  });

  it("still forbids stage changes, checklist completion and purchased-solution changes", () => {
    expect(SYSTEM_PROMPT).toMatch(
      /Never propose a stage change, a checklist task being marked done or complete, a change to purchased services or solutions/,
    );
  });

  it("says training suggestions need a quote and a person's approval, never a claim of completion", () => {
    expect(SYSTEM_PROMPT).toMatch(/Every training suggestion needs a quote/);
    expect(SYSTEM_PROMPT).toMatch(/never that the training is complete/);
  });

  it("limits updates to training needs listed in the context", () => {
    expect(SYSTEM_PROMPT).toMatch(
      /"training_update": ONLY for a training need listed in the context/,
    );
    expect(SYSTEM_PROMPT).toMatch(
      /"training_demonstrated": ONLY for a training need listed in the context/,
    );
  });
});
