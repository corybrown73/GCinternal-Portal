import { describe, expect, it } from "vitest";

import { addBusinessDays, buildTimeline } from "../onboarding-timeline";
import { readIntake } from "../intake-answers";
import {
  catalogueForPrompt,
  mergeProposal,
  normalizeProposal,
  parseSowReading,
  rowToService,
  rowWeeks,
  sowIntakePatch,
  sowPlanProposalSchema,
  sowReadingSchema,
  sowTimelinePatch,
  trainingSessionMinutes,
  type SowPlanRow,
} from "../sow-plan";

describe("the deep SOW reading", () => {
  const full = {
    readable: true,
    problem: null,
    reference: "SOW-7",
    signed_date: "2026-09-30",
    start_date: null,
    value: "$24,000",
    contact: { name: "Dana", role: "Ops", email: null },
    summary: "One form and QuickBooks",
    first_form: "Daily Report",
    seats: "40 users",
    services: [{ kind: "integration", name: "QuickBooks Online", tier: 3, phase: 2 }],
    notes: [],
    gaps: ["Which crews"],
    dates: [],
    deliverables: [
      { text: "Daily Report form built", quote: "one (1) form", page: 2 },
      { text: "", quote: "dropped: no text", page: 1 },
      "not an item",
    ],
    out_of_scope: [{ text: "Data migration", quote: null, page: "3" }],
    customer_responsibilities: [{ text: "API credentials", quote: "credentials", page: null }],
    acceptance_criteria: [{ text: "Sign-off", quote: "sign-off", page: 6 }],
    assumptions: [],
    term: { start: "2026-10-01", end: "2027-09-30", months: "12" },
    pricing: {
      total: "$24,000",
      currency: "USD",
      recurring: 2000,
      one_time: null,
      payment_terms: "Net 30",
    },
    contacts: [
      { name: "Dana", role: "Ops", email: "dana@x.com", side: "customer", quote: "Dana, Ops" },
      { name: "Priya", role: "SE", email: null, side: "gocanvas", quote: null },
    ],
    signature: { date: "2026-09-30", signer_name: "Dana", signer_title: "VP" },
    integrations: [
      { system: "QuickBooks Online", direction: "jobs to invoices", tier: "3", quote: "QBO" },
    ],
    forms: [
      { name: "Daily Report", purpose: "the day", quote: "Daily Report" },
      { name: "", purpose: null, quote: null },
    ],
  };

  it("parses a full reading, tidying what it can and dropping what it cannot", () => {
    const r = sowReadingSchema.parse(full);
    expect(r.deliverables).toEqual([
      { text: "Daily Report form built", quote: "one (1) form", page: 2 },
    ]);
    expect(r.out_of_scope).toEqual([{ text: "Data migration", quote: null, page: 3 }]);
    expect(r.term).toEqual({ start: "2026-10-01", end: "2027-09-30", months: 12 });
    expect(r.pricing).toMatchObject({
      total: 24000,
      currency: "USD",
      recurring: 2000,
      one_time: null,
    });
    expect(r.contacts).toHaveLength(2);
    expect(r.contacts[1]!.side).toBe("gocanvas");
    expect(r.signature).toEqual({ date: "2026-09-30", signer_name: "Dana", signer_title: "VP" });
    expect(r.integrations[0]).toMatchObject({ system: "QuickBooks Online", tier: 3 });
    expect(r.forms).toEqual([{ name: "Daily Report", purpose: "the day", quote: "Daily Report" }]);
    expect(r.seats).toBe(40);
    expect(r.value).toBe(24000);
  });

  it("parses a minimal reading with every deep field empty or null", () => {
    const r = sowReadingSchema.parse({ readable: false, problem: "A brochure." });
    expect(r.readable).toBe(false);
    expect(r.deliverables).toEqual([]);
    expect(r.forms).toEqual([]);
    expect(r.contacts).toEqual([]);
    expect(r.term).toBeNull();
    expect(r.pricing).toBeNull();
    expect(r.signature).toBeNull();
  });

  it("reads a reading kept before the deep fields existed", () => {
    const old = sowPlanProposalSchema.parse({ readable: true, summary: "x", services: [] });
    const r = parseSowReading(old);
    expect(r?.summary).toBe("x");
    expect(r?.deliverables).toEqual([]);
    expect(parseSowReading("junk")).toBeNull();
  });

  describe("sowIntakePatch", () => {
    const read = (over: Record<string, unknown> = {}) =>
      sowReadingSchema.parse({
        readable: true,
        seats: 40,
        first_form: "JSA",
        forms: [
          { name: "Daily Report", quote: "Daily Report form" },
          { name: "JSA", quote: "JSA form" },
          { name: "daily report", quote: "twice" },
        ],
        ...over,
      });

    it("fills the seats and the forms on a blank intake, the first form first, with the SOW as source", () => {
      const { patch, filled } = sowIntakePatch(readIntake({}), read(), { hasReports: false });
      expect(patch.field_users).toBe(40);
      expect(patch.wanted_forms).toEqual([
        { id: "sow-1", name: "JSA", template_id: null },
        { id: "sow-2", name: "Daily Report", template_id: null },
      ]);
      expect(patch.forms_built).toBe(false);
      expect(patch.ai_filled).toEqual(["field_users", "wanted_forms", "forms_built"]);
      expect(patch.ai_sources).toEqual({
        field_users: { quote: "40 seats", source: "SOW" },
        wanted_forms: { quote: "JSA form", source: "SOW" },
      });
      expect(filled).toEqual(["people in the field", "2 forms to build"]);
    });

    it("leaves the forms to the calls when there are any, and a person's answers alone", () => {
      const withCalls = sowIntakePatch(readIntake({}), read(), { hasReports: true });
      expect(withCalls.patch.wanted_forms).toBeUndefined();
      expect(withCalls.patch.field_users).toBe(40);

      const theirs = sowIntakePatch(
        readIntake({
          field_users: 12,
          wanted_forms: [{ id: "f-1", name: "Timesheet" }],
          person_set: ["wanted_forms"],
        }),
        read(),
        { hasReports: false },
      );
      expect(theirs.patch).toEqual({});
      expect(theirs.filled).toEqual([]);
    });

    it("refreshes its own earlier forms, and never writes a training-only or existing account's", () => {
      const own = sowIntakePatch(
        readIntake({
          wanted_forms: [{ id: "sow-1", name: "Old form" }],
          ai_filled: ["wanted_forms"],
        }),
        read(),
        { hasReports: false },
      );
      expect(own.patch.wanted_forms?.map((f) => f.name)).toEqual(["JSA", "Daily Report"]);
      expect(
        sowIntakePatch(readIntake({ training_only: true }), read({ seats: null }), {
          hasReports: false,
        }).patch,
      ).toEqual({});
      expect(
        sowIntakePatch(readIntake({ path: "existing" }), read({ seats: null }), {
          hasReports: false,
        }).patch,
      ).toEqual({});
    });
  });
});

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
      tool: "qbo",
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
    expect(rowWeeks(qb)).toBe(3);
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
    expect(t.alongside[0]!.startsOn).toBe(
      addBusinessDays(t.milestones.find((m) => m.key === "kickoff")!.date, 1),
    );
    expect(t.phases[0]!.services[0]!.name).toBe("QuickBooks Online");
    expect(t.phases[0]!.tentative).toBe(true);
  });

  it("drops a row with a kind outside the catalogue, and keeps the reading", () => {
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
      services: [{ ...qb, kind: "sorcery" }, qb],
      notes: [],
      gaps: [],
    });
    expect(bad.success).toBe(true);
    expect(bad.success && bad.data.services).toEqual([qb]);
  });

  it("reads the model's JSON forgivingly: text numbers, loose dates, a bare contact, long quotes", () => {
    const r = sowPlanProposalSchema.safeParse({
      // readable, summary, notes and gaps left out entirely
      reference: "Q-2026-0917",
      signed_date: "2026-09-17",
      start_date: "upon signature",
      value: "$12,500",
      contact: "Dana Ortiz",
      first_form: "Roof Inspection",
      seats: "20 users",
      services: [
        {
          ...qb,
          tier: "3",
          weeks: "n/a",
          phase: "2",
          evidence: "x".repeat(400),
          confidence: "sure",
        },
      ],
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      readable: true,
      problem: null,
      summary: "",
      start_date: null,
      value: 12500,
      contact: { name: "Dana Ortiz", role: null, email: null },
      seats: 20,
      notes: [],
      gaps: [],
    });
    expect(r.data.services[0]).toMatchObject({
      tier: 3,
      weeks: null,
      phase: 2,
      confidence: "implied",
    });
    expect(r.data.services[0]!.evidence).toHaveLength(300);
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
      reference: "SOW-2026-705",
      signed_date: "2026-09-18",
      start_date: null,
      value: 9600,
      contact: { name: "Jamie Tester", role: "Operations Manager", email: null },
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
      dates: [],
    });
    expect(p.services.map((r) => r.phase)).toEqual([1, 1, 3]);
  });
});

describe("reading the SOW twice", () => {
  const existing = mergeProposal([], [qb, jsa], (r) => `${r.kind}-1`);

  it("merges a reworded row onto the one it already has, never a duplicate", () => {
    const again = mergeProposal(
      existing,
      [
        { ...qb, name: "Quickbooks Online integration", tier: 4 },
        { ...jsa, name: "Job Safety Analysis form" },
      ],
      (r) => `${r.kind}-2`,
    );
    expect(again.map((s) => s.id)).toEqual(["integration-1", "paid_form-1"]);
    expect(again.find((s) => s.id === "integration-1")!.tier).toBe(4);
  });

  it("does not resurrect a row a person removed", () => {
    const intake = {
      wanted_forms: [],
      timeline: {
        services: existing.filter((s) => s.kind !== "integration"),
        removed_services: ["integration:quickbooksonline"],
      },
    };
    const patch = sowTimelinePatch(
      intake as never,
      { services: [qb, jsa], notes: [] },
      (r) => r.kind,
    );
    expect((patch.timeline["services"] as Array<{ kind: string }>).map((s) => s.kind)).toEqual([
      "paid_form",
    ]);
  });

  it("reads a training row that describes the plan's own calls as their length, not a block", () => {
    const training: SowPlanRow = {
      ...jsa,
      kind: "training",
      name: "Field user training session (30-minute, recorded)",
      evidence: "Three (3) training sessions, 30 minutes each, recorded",
    };
    expect(trainingSessionMinutes(training)).toBe(30);
    const patch = sowTimelinePatch(
      { wanted_forms: [], timeline: {} } as never,
      { services: [training, qb], notes: [] },
      (r) => r.kind,
    );
    expect(patch.sessionMinutes).toBe(30);
    expect(patch.timeline["session_minutes"]).toBe(30);
    expect((patch.timeline["services"] as Array<{ kind: string }>).map((s) => s.kind)).toEqual([
      "integration",
    ]);
    // A stand-alone admin training block with its own count stays a block.
    expect(
      trainingSessionMinutes({
        ...training,
        name: "Admin training",
        evidence: "two 45-minute admin sessions",
      }),
    ).toBeNull();
  });

  it("carries the SOW's typed dates onto the plan, and only printed days survive", () => {
    const parsed = sowPlanProposalSchema.parse({
      readable: true,
      problem: null,
      summary: "",
      first_form: null,
      seats: null,
      services: [],
      notes: [],
      gaps: [],
      dates: [
        {
          type: "deadline",
          date: "2026-10-30",
          end: null,
          who: null,
          quote: "In production by 30 Oct",
        },
        { type: "deadline", date: "end of October", end: null, who: null, quote: "nope" },
      ],
    });
    expect(parsed.dates).toHaveLength(1);
    const patch = sowTimelinePatch(
      { wanted_forms: [], timeline: {} } as never,
      { services: [], notes: [], dates: parsed.dates },
      (r) => r.kind,
    );
    expect(patch.timeline["sow_dates"]).toEqual(parsed.dates);
  });
});
