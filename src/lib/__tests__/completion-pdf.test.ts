import { describe, expect, it } from "vitest";

import { buildSolutionDocument } from "../completion-record";
import { renderCompletionPdf } from "../server/completion-pdf";

const doc = buildSolutionDocument({
  customerName: "Northwind Fleet",
  implementationName: "Field inspections rollout",
  solution: {
    id: "sol-1",
    title: "Dispatch → ERP work order sync",
    status: "validated",
    owner_id: null,
    created_at: "2026-02-14T00:00:00Z",
    design_summary: "Work orders move nightly from Dispatch into the ERP.",
    configuration_details: "REST, creds in 1Password, 02:00 UTC.",
  },
  completedAt: "2026-08-31T14:00:00.000Z",
  named: () => null,
  notes: Array.from({ length: 40 }, (_, i) => ({
    note_type: "build",
    content: `Day ${i}: ${"detail ".repeat(40)}`,
    created_at: "2026-03-02T00:00:00Z",
    created_by: null,
  })),
  mappings: [],
  decisions: [],
  approvals: [],
  evidence: [],
  requirementTitle: null,
});

describe("renderCompletionPdf", () => {
  it("produces a PDF, in Node, with no DOM and no browser", async () => {
    const bytes = await renderCompletionPdf(doc);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // %PDF- — the file is what it claims to be, not an empty buffer.
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("flows onto more pages rather than running off the first one", async () => {
    const bytes = await renderCompletionPdf(doc);
    const text = Buffer.from(bytes).toString("latin1");
    const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
  });

  it("renders a document with nothing in it rather than throwing", async () => {
    const empty = { ...doc, sections: [], headline: [] };
    const bytes = await renderCompletionPdf(empty);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });
});
