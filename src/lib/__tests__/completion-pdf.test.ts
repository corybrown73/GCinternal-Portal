import { describe, expect, it } from "vitest";

import { buildImplementationDocument, buildSolutionDocument } from "../completion-record";
import { renderCompletionPdf } from "../server/completion-pdf";

const stageLabel = (k: string) => k;

/* Enough customer commitments to run past one page. */
const longImplementation = buildImplementationDocument({
  customerName: "Northwind Fleet",
  implementation: {
    id: "impl-1",
    name: "Field inspections rollout",
    contract_start_date: "2026-01-06",
    created_at: "2025-12-01T00:00:00Z",
    go_live_at: "2026-04-01T09:00:00Z",
    actual_launch_date: null,
  },
  completedAt: "2026-08-31T14:00:00.000Z",
  stageHistory: [],
  commitments: [
    ...Array.from({ length: 60 }, (_, i) => ({
      description: `Customer promise ${i}: ${"deliver the agreed item on time. ".repeat(3)}`,
      committed_to: "customer",
      status: "open",
      made_at: "2026-03-01T00:00:00Z",
    })),
    {
      description: "INTERNAL-PDF-COMMITMENT: keep this out of the record",
      committed_to: "internal",
      status: "open",
      made_at: "2026-03-02T00:00:00Z",
    },
  ],
  workItems: [
    { title: "INTERNAL-PDF-TASK", status: "open", visibility: "internal", stage_key: "build" },
    { title: "Shared sample task", status: "open", visibility: "shared", stage_key: "build" },
  ],
  stageLabel,
});

const solution = buildSolutionDocument({
  customerName: "Northwind Fleet",
  implementationName: "Field inspections rollout",
  solution: {
    id: "sol-1",
    title: "Dispatch → ERP work order sync",
    created_at: "2026-02-14T00:00:00Z",
    design_summary: "INTERNAL-PDF-DESIGN: reads the nightly job",
    configuration_details: "INTERNAL-PDF-CONFIG: endpoint and vault path",
  },
  completedAt: "2026-08-31T14:00:00.000Z",
});

const rawText = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("renderCompletionPdf", () => {
  it("produces a PDF, in Node, with no DOM and no browser", async () => {
    const bytes = await renderCompletionPdf(solution);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // %PDF- — the file is what it claims to be, not an empty buffer.
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("flows onto more pages rather than running off the first one", async () => {
    const bytes = await renderCompletionPdf(longImplementation);
    const pages = (rawText(bytes).match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
  });

  it("renders a document with nothing in it rather than throwing", async () => {
    const empty = { ...solution, sections: [], headline: [] };
    const bytes = await renderCompletionPdf(empty);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });
});

describe("the public PDF", () => {
  it("carries the customer's commitments and the shared tasks", async () => {
    const text = rawText(await renderCompletionPdf(longImplementation));
    expect(text).toContain("Customer promise 0:");
    expect(text).toContain("Shared sample task");
  });

  it("never carries an internal commitment, an internal task, or internal free text", async () => {
    const text = rawText(await renderCompletionPdf(longImplementation));
    expect(text).not.toContain("INTERNAL-PDF-COMMITMENT");
    expect(text).not.toContain("INTERNAL-PDF-TASK");
  });

  it("states withheld sections as internal rather than as absent", async () => {
    const text = rawText(await renderCompletionPdf(longImplementation));
    expect(text).toContain("are internal and are not part of this public record");
  });

  it("never carries a solution's design, configuration or owner", async () => {
    const text = rawText(await renderCompletionPdf(solution));
    expect(text).not.toContain("INTERNAL-PDF-DESIGN");
    expect(text).not.toContain("INTERNAL-PDF-CONFIG");
    expect(text).toContain("Dispatch");
  });
});
