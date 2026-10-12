import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The implementation's SOW analysis from the deal's kept reading: the
 * journey is laid out from what the reading says, and the model is not
 * asked to read the document a second time.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    ai: {
      runStructured: vi.fn(async () => {
        throw new Error("the model must not be asked");
      }),
      describeAiError: (e: unknown) => String(e),
    },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/ai/client", () => h.ai);

import { sha256Hex } from "../server/ai/documents";
import { journeyFromSowReading, sowAnalysisSchema } from "../sow-analysis";
import { analyzeSow } from "../sow-analysis.server";
import { sowReadingSchema } from "../sow-plan";

const DEAL = "22222222-2222-4222-8222-222222222222";
const IMPL = "33333333-3333-4333-8333-333333333333";
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const PATH = `implementations/${IMPL}/sow.pdf`;

const reading = sowReadingSchema.parse({
  readable: true,
  summary: "Two forms, a QuickBooks integration and training for the crews.",
  first_form: "Daily Report",
  seats: 40,
  services: [
    { kind: "paid_form", name: "Job Safety Analysis", phase: 1, confidence: "stated" },
    { kind: "integration", name: "QuickBooks Online", tier: 3, phase: 2, confidence: "stated" },
    { kind: "training", name: "Admin training", phase: 1, confidence: "stated" },
  ],
  forms: [
    { name: "Daily Report", purpose: "the crew's day", quote: "Daily Report form" },
    { name: "Job Safety Analysis", purpose: null, quote: "JSA form" },
  ],
  integrations: [
    { system: "QuickBooks Online", direction: "approved jobs to invoices", tier: 3, quote: "QBO" },
  ],
  deliverables: [{ text: "Two forms built", quote: "two (2) forms", page: 2 }],
  out_of_scope: [{ text: "Historical data migration", quote: "no migration", page: 3 }],
  customer_responsibilities: [
    { text: "Provide QuickBooks API credentials", quote: "API credentials", page: 4 },
    { text: "Name a field tester", quote: "a field tester", page: 4 },
    { text: "Schedule the crews for training", quote: "training sessions", page: 5 },
  ],
  acceptance_criteria: [
    { text: "The pilot crew signs off the form", quote: "sign-off", page: 6 },
    { text: "Invoices sync to QuickBooks", quote: "sync", page: 6 },
    { text: "All deliverables accepted in writing", quote: "accepted", page: 6 },
  ],
  assumptions: [
    { text: "The customer has a QuickBooks Online subscription", quote: "QBO", page: 1 },
  ],
  term: { start: "2026-10-01", end: "2027-09-30", months: 12 },
  gaps: ["Which crews pilot first"],
});

describe("journeyFromSowReading", () => {
  it("lays the reading onto the lifecycle and carries each duty to its stage", () => {
    const a = journeyFromSowReading(reading);
    expect(sowAnalysisSchema.safeParse(a).success).toBe(true);
    expect(a.proposedJourney.map((s) => s.name)).toEqual([
      "Kickoff",
      "Build",
      "Pilot",
      "Launch",
      "Complete",
    ]);
    expect(a.proposedJourney.map((s) => s.lifecycleStage)).toEqual([
      "plan-internal",
      "build",
      "validate-iterate",
      "launch",
      "graduate-to-cs",
    ]);
    const [kickoff, build, pilot, launch, complete] = a.proposedJourney;
    expect(kickoff!.workstreams).toEqual(["First form: Daily Report", "Job Safety Analysis"]);
    expect(kickoff!.customerResponsibilities).toEqual(["Name a field tester"]);
    expect(build!.workstreams).toEqual(["Daily Report", "Job Safety Analysis"]);
    expect(pilot!.acceptanceCriteria).toEqual(["The pilot crew signs off the form"]);
    expect(launch!.workstreams).toEqual([
      "QuickBooks Online · approved jobs to invoices",
      "Admin training",
    ]);
    expect(launch!.customerResponsibilities).toEqual([
      "Provide QuickBooks API credentials",
      "Schedule the crews for training",
    ]);
    expect(launch!.acceptanceCriteria).toEqual(["Invoices sync to QuickBooks"]);
    expect(complete!.acceptanceCriteria).toEqual(["All deliverables accepted in writing"]);
    // Timing is honest: nothing per stage, the term as the window.
    expect(a.proposedJourney.every((s) => s.timing.insufficientInfo)).toBe(true);
    expect(a.deliveryWindow).toMatchObject({
      statedText: "12 months",
      minWeeks: 52,
      startDateStated: "2026-10-01",
    });
    expect(a.extraction.outOfScope[0]).toMatchObject({ text: "Historical data migration" });
    expect(a.extraction.deliverables[0]!.quote).toBe("two (2) forms");
    expect(a.gaps).toEqual(["Which crews pilot first"]);
    expect(a.assumptions[0]).toBe("The customer has a QuickBooks Online subscription");
  });

  it("skips the build stages when the reading names no form and no phase-one work", () => {
    const a = journeyFromSowReading({ ...reading, forms: [], first_form: null, services: [] });
    expect(a.proposedJourney.map((s) => s.name)).toEqual(["Kickoff", "Launch", "Complete"]);
  });
});

describe("analyzeSow from the kept reading", () => {
  const rows: Rows = {
    implementations: [
      {
        id: IMPL,
        deal_id: DEAL,
        sow_document_path: PATH,
        sow_document_url: null,
        sow_document_name: "sow.pdf",
      },
    ],
    portal_ai_readings: [
      {
        id: "rd-1",
        deal_id: DEAL,
        kind: "sow",
        source_hash: sha256Hex(PDF),
        output: reading,
        created_at: "2026-10-01T00:00:00Z",
      },
    ],
  };
  let fake: ReturnType<typeof createFakeSupabase>;

  beforeEach(() => {
    fake = createFakeSupabase(rows, { objects: { [`attachments/${PATH}`]: PDF } });
    h.supabase.client = fake.client;
    h.ai.runStructured.mockClear();
    delete process.env["ANTHROPIC_API_KEY"];
  });

  it("serves the journey from the reading of the same bytes without the model", async () => {
    const r = await analyzeSow(IMPL);
    expect(h.ai.runStructured).not.toHaveBeenCalled();
    expect(r.sowName).toBe("sow.pdf");
    expect(r.analysis.proposedJourney.map((s) => s.name)).toContain("Launch");
  });

  it("asks the model when the kept reading is of a different document", async () => {
    fake.store["portal_ai_readings"]![0]!.source_hash = "other";
    await expect(analyzeSow(IMPL)).rejects.toThrow(/not configured/);
  });
});
