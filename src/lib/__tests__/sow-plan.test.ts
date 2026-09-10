import { describe, expect, it } from "vitest";

import { buildTimeline } from "../onboarding-timeline";
import {
  catalogueForPrompt,
  mergeProposal,
  normalizeProposal,
  rowToService,
  rowWeeks,
  sowPlanProposalSchema,
  type SowPlanRow,
} from "../sow-plan";

const qb: SowPlanRow = {
  kind: "integration",
  name: "QuickBooks Online",
  tier: 3,
  weeks: null,
  phase: 2,
  needs: null,
  evidence: "Integration with QuickBooks Online for invoicing",
  confidence: "stated",
};
const jsa: SowPlanRow = {
  kind: "paid_form",
  name: "Job Safety Analysis",
  tier: null,
  weeks: 2,
  phase: 1,
  needs: "The JSA you use today.",
  evidence: null,
  confidence: "implied",
};

describe("the SOW read into the plan", () => {
  it("turns a row into the service the plan stores — tier for integrations, weeks only when they differ", () => {
    expect(rowToService(qb, "qb-1")).toEqual({
      id: "qb-1",
      kind: "integration",
      name: "QuickBooks Online",
      phase: 2,
      tier: 3,
    });
    expect(rowToService(jsa, "jsa-1")).toEqual({
      id: "jsa-1",
      kind: "paid_form",
      name: "Job Safety Analysis",
      phase: 1,
      weeks: 2,
      needs: "The JSA you use today.",
    });
    expect(rowToService({ ...jsa, weeks: 1, needs: null }, "x")).toEqual({
      id: "x",
      kind: "paid_form",
      name: "Job Safety Analysis",
      phase: 1,
    });
    expect(rowWeeks(qb)).toBe(2);
    expect(rowWeeks(jsa)).toBe(2);
  });

  it("merges by name: a twin updates, a new one is added, the rest stay", () => {
    const existing = [
      {
        id: "old-qb",
        kind: "integration" as const,
        name: "quickbooks online",
        phase: 3,
        tier: 2 as const,
      },
      { id: "pdf", kind: "custom_pdf" as const, name: "Invoice PDF", phase: 2 },
    ];
    const merged = mergeProposal(existing, [qb, jsa], (r) => `new-${r.kind}`);
    expect(merged.map((s) => s.id)).toEqual(["old-qb", "pdf", "new-paid_form"]);
    expect(merged[0]).toMatchObject({ id: "old-qb", phase: 2, tier: 3 });
    expect(merged[2]).toMatchObject({ name: "Job Safety Analysis", phase: 1 });
  });

  it("the dates come from the plan, never from the model", () => {
    const services = mergeProposal([], [qb, jsa], (r) => r.kind);
    const t = buildTimeline({ closeDate: "2026-09-09", services });
    expect(t.alongside[0]!.name).toBe("Job Safety Analysis");
    expect(t.alongside[0]!.startsOn).toBe(t.milestones.find((m) => m.key === "kickoff")!.date);
    expect(t.phases[0]!.services[0]!.name).toBe("QuickBooks Online");
    expect(t.phases[0]!.tentative).toBe(true);
  });

  it("rejects a row with a kind outside the catalogue or a calendar date", () => {
    const ok = sowPlanProposalSchema.safeParse({
      readable: true,
      problem: null,
      summary: "",
      first_form: null,
      seats: 12,
      services: [qb],
      notes: [],
      gaps: [],
    });
    expect(ok.success).toBe(true);
    const bad = sowPlanProposalSchema.safeParse({
      readable: true,
      problem: null,
      summary: "",
      first_form: null,
      seats: null,
      services: [{ ...qb, kind: "sorcery" }],
      notes: [],
      gaps: [],
    });
    expect(bad.success).toBe(false);
  });

  it("describes every kind and the integration tiers to the model", () => {
    const text = catalogueForPrompt();
    for (const k of [
      "integration",
      "custom_pdf",
      "paid_form",
      "analytics",
      "data_load",
      "training",
    ]) {
      expect(text).toContain(`- ${k}:`);
    }
    expect(text).toContain("tier 3");
    expect(text).not.toContain("tier 0");
  });
});

describe("normalizeProposal", () => {
  it("puts form builds, data loads and training in phase 1 whatever the model said, and leaves the rest", () => {
    const p = normalizeProposal({
      readable: true,
      problem: null,
      summary: "",
      first_form: null,
      seats: null,
      services: [
        { ...jsa, phase: 2 },
        { ...jsa, kind: "data_load", name: "Well list", phase: 3 },
        { ...qb, phase: 3 },
      ],
      notes: [],
      gaps: [],
    });
    expect(p.services.map((r) => r.phase)).toEqual([1, 1, 3]);
  });
});
