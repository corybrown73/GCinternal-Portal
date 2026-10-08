import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The kept SOW readings: the one for the document on file is served, a
 * newer one for a document since replaced is not, and nothing is served
 * for a document nobody has read — never an older document's reading in
 * its place.
 */
const h = vi.hoisted(() => {
  const state = { supabase: { client: null as any }, forward: null as any };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));

import { sha256Hex } from "../server/ai/documents";
import { loadSowReading, keepSowReading } from "../server/ai/readings";
import { sowPlanProposalSchema } from "../sow-plan";

const DEAL = "22222222-2222-4222-8222-222222222222";
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const SOW_PATH = `deals/${DEAL}/sow.pdf`;

const reading = (summary: string) =>
  sowPlanProposalSchema.parse({ readable: true, summary, services: [] });

const rows: Rows = {
  portal_accounts: [
    { id: DEAL, sow_document_path: SOW_PATH, sow_document_name: "sow.pdf", intake: {} },
  ],
  portal_ai_readings: [
    {
      id: "rd-old",
      deal_id: DEAL,
      kind: "sow",
      source_hash: sha256Hex(PDF),
      source_path: SOW_PATH,
      output: reading("the current document"),
      created_at: "2026-10-01T00:00:00Z",
    },
    {
      id: "rd-new",
      deal_id: DEAL,
      kind: "sow",
      source_hash: "ffff",
      source_path: SOW_PATH,
      output: reading("a document since replaced"),
      created_at: "2026-10-05T00:00:00Z",
    },
    {
      id: "rd-other",
      deal_id: "other-deal",
      kind: "sow",
      source_hash: sha256Hex(PDF),
      output: reading("another deal's"),
      created_at: "2026-10-06T00:00:00Z",
    },
  ],
};

let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  fake = createFakeSupabase(rows, { objects: { [`attachments/${SOW_PATH}`]: PDF } });
  h.supabase.client = fake.client;
});

describe("loadSowReading", () => {
  it("picks the reading for the document on file, hashing it from storage", async () => {
    const r = await loadSowReading(DEAL);
    expect(r?.id).toBe("rd-old");
    expect(r?.reading.summary).toBe("the current document");
    // Older readings parse with the deep fields empty.
    expect(r?.reading.deliverables).toEqual([]);
  });

  it("takes the hash from the caller when it already has the bytes", async () => {
    expect((await loadSowReading(DEAL, { sha256: sha256Hex(PDF) }))?.id).toBe("rd-old");
    expect((await loadSowReading(DEAL, { sha256: "ffff" }))?.id).toBe("rd-new");
  });

  it("serves nothing for bytes nobody has read, a removed document, or a caller with no document", async () => {
    expect(await loadSowReading(DEAL, { sha256: "nope" })).toBeNull();
    expect(await loadSowReading(DEAL, { sha256: null })).toBeNull();
    fake.store["portal_accounts"]![0]!.sow_document_path = null;
    expect(await loadSowReading(DEAL)).toBeNull();
    expect(await loadSowReading(DEAL, { fetch: false })).toBeNull();
    expect(await loadSowReading("no-such-deal")).toBeNull();
  });

  it("matches by the file's path without downloading it when asked not to fetch", async () => {
    fake.store["portal_ai_readings"]![1]!.source_path = "deals/x/replaced.pdf";
    fake.objects.clear();
    expect((await loadSowReading(DEAL, { fetch: false }))?.id).toBe("rd-old");
    // With the bytes gone the hash cannot be taken, and the path still decides.
    expect((await loadSowReading(DEAL))?.id).toBe("rd-old");
    // A path nothing was kept for — a SOW replaced and not yet read — is nothing.
    fake.store["portal_accounts"]![0]!.sow_document_path = "deals/x/newer.pdf";
    expect(await loadSowReading(DEAL, { fetch: false })).toBeNull();
  });

  it("serves the contract's reading on a deal read from its contract", async () => {
    fake.store["portal_accounts"]![0]!.sow_document_path = null;
    fake.store["portal_accounts"]![0]!.intake = {
      contract: { path: "deals/x/contract.pdf", name: "contract.pdf", uploaded_at: "2026-10-01" },
    };
    fake.store["portal_ai_readings"]![1]!.source_path = "deals/x/contract.pdf";
    expect((await loadSowReading(DEAL, { fetch: false }))?.id).toBe("rd-new");
  });

  const doc = (sha256: string) => ({
    kind: "pdf" as const,
    block: null,
    text: null,
    bytes: PDF,
    sha256,
    name: "new.pdf",
    mediaType: "application/pdf",
    truncated: false,
    problem: null,
  });
  const usage = {
    input_tokens: 1,
    output_tokens: 1,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };

  it("keeps a new reading by the document's hash", async () => {
    await keepSowReading({
      dealId: DEAL,
      doc: doc("abcd"),
      sourcePath: SOW_PATH,
      reading: { ...reading("fresh"), deliverables: [] } as any,
      model: "m",
      usage,
    });
    const kept = fake.store["portal_ai_readings"]!.find((r) => r.source_hash === "abcd");
    expect(kept).toMatchObject({ deal_id: DEAL, kind: "sow", source_name: "new.pdf", model: "m" });
    expect((await loadSowReading(DEAL, { sha256: "abcd" }))?.reading.summary).toBe("fresh");
  });

  it("replaces the kept reading of the same bytes when asked to read them again", async () => {
    await keepSowReading({
      dealId: DEAL,
      doc: doc(sha256Hex(PDF)),
      sourcePath: SOW_PATH,
      reading: reading("read again") as any,
      model: "m2",
      usage,
    });
    const rows = fake.store["portal_ai_readings"]!.filter(
      (r) => r.deal_id === DEAL && r.source_hash === sha256Hex(PDF),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "rd-old", model: "m2" });
    expect((await loadSowReading(DEAL))?.reading.summary).toBe("read again");
  });
});
