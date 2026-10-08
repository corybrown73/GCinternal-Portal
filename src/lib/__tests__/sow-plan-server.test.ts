import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * "Read the SOW into the plan" against an in-memory database: the kept
 * reading is served for the document on file, "Re-read" asks the model
 * again and its reading replaces the kept one, and the next read serves
 * that.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    ai: {
      runStructured: vi.fn(),
      describeAiError: (e: unknown, what = "AI") =>
        `${what} failed: ${e instanceof Error ? e.message : String(e)}`,
    },
    audit: { audit: vi.fn(async () => {}) },
    presale: { requireInternal: vi.fn(async () => {}) },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../presale.server", () => h.presale);
vi.mock("../server/ai/client", () => h.ai);
vi.mock("../server/audit", () => h.audit);

import { sha256Hex } from "../server/ai/documents";
import { proposePlanFromSow } from "../sow-plan.server";
import { sowReadingSchema } from "../sow-plan";

const DEAL = "22222222-2222-4222-8222-222222222222";
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const SOW_PATH = `deals/${DEAL}/sow.pdf`;

const reading = (summary: string) =>
  sowReadingSchema.parse({ readable: true, reference: "SOW-1", summary, services: [] });

const rows: Rows = {
  portal_accounts: [
    {
      id: DEAL,
      sow_document_path: SOW_PATH,
      sow_document_name: "sow.pdf",
      sow_reference: null,
      intake: {},
    },
  ],
  portal_ai_readings: [
    {
      id: "rd-1",
      deal_id: DEAL,
      kind: "sow",
      source_hash: sha256Hex(PDF),
      source_path: SOW_PATH,
      output: reading("the first reading"),
      model: "m1",
      created_at: "2026-10-01T00:00:00Z",
    },
  ],
};

let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  fake = createFakeSupabase(rows, { objects: { [`attachments/${SOW_PATH}`]: PDF } });
  h.supabase.client = fake.client;
  h.ai.runStructured.mockReset();
  h.ai.runStructured.mockResolvedValue({
    data: reading("read again"),
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    model: "m2",
    stop_reason: "end_turn",
    attempts: 1,
    ms: 1,
  });
  process.env["ANTHROPIC_API_KEY"] = "test-key";
});

describe("proposePlanFromSow", () => {
  it("serves the kept reading of the document on file without asking the model", async () => {
    const out = await proposePlanFromSow("u1", DEAL);
    expect(out.reused).toBe(true);
    expect(out.proposal.summary).toBe("the first reading");
    expect(h.ai.runStructured).not.toHaveBeenCalled();
  });

  it("reads again when forced, keeps that reading in the old one's place, and serves it next", async () => {
    const forced = await proposePlanFromSow("u1", DEAL, { force: true });
    expect(forced.reused).toBe(false);
    expect(forced.proposal.summary).toBe("read again");
    expect(h.ai.runStructured).toHaveBeenCalledTimes(1);
    const kept = fake.store["portal_ai_readings"]!.filter((r) => r.deal_id === DEAL);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ id: "rd-1", model: "m2" });
    expect(kept[0]!.output.summary).toBe("read again");

    const next = await proposePlanFromSow("u1", DEAL);
    expect(next.reused).toBe(true);
    expect(next.proposal.summary).toBe("read again");
    expect(h.ai.runStructured).toHaveBeenCalledTimes(1);
  });
});
