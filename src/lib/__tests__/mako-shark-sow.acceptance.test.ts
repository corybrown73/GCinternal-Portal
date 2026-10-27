import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { describe, expect, it, vi } from "vitest";

/**
 * Acceptance checks against the REAL Mako Shark Electric SOW.
 *
 * The document is not in the repository, and must not be committed. It is read
 * from a file outside source control, named by an environment variable:
 *
 *   MAKO_SOW_PATH=/secure/location/mako-shark-sow.pdf \
 *   ANTHROPIC_API_KEY=... \
 *   npx vitest run src/lib/__tests__/mako-shark-sow.acceptance.test.ts
 *
 * Without MAKO_SOW_PATH every check is skipped, and a skipped check is NOT a pass.
 * Each check below states a requirement from the acceptance brief. Passing them
 * means the model's reading of that document met the requirement; it does not
 * replace a TIS reviewing the proposed set against the signed document.
 *
 * Nothing here substitutes a simulated document. The reading is the production
 * reading path (prepareDocument, the model, the schema), run on the supplied file.
 */

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("../server/audit", () => ({ audit: vi.fn(async () => {}) }));

const SOW_PATH = process.env["MAKO_SOW_PATH"];

describe.skipIf(!SOW_PATH)("Mako Shark Electric SOW, the real document", () => {
  // Read once; every check below works from the same reading.
  let reading: Awaited<ReturnType<typeof loadReading>>;

  async function loadReading() {
    const { readSowReading } = await import("../complete-solutions-sow.server");
    const { reviewedSetFrom } = await import("../complete-solutions-sow");
    const bytes = new Uint8Array(readFileSync(SOW_PATH!));
    const r = await readSowReading(bytes, basename(SOW_PATH!), null);
    return { raw: r, set: reviewedSetFrom(r) };
  }

  it("is read as a Statement of Work", async () => {
    reading = await loadReading();
    expect(reading.raw.readable).toBe(true);
    expect(reading.set.solutions.length).toBeGreaterThan(0);
  }, 300_000);

  const everything = () => JSON.stringify(reading.raw);
  const components = () =>
    reading.set.solutions.flatMap((s) => s.components.map((c) => ({ ...c, solution: s.title })));

  it("identifies the complete Inspection and Change Order workflow", () => {
    const names = [
      ...reading.set.solutions.map((s) => s.title),
      ...components().map((c) => c.name),
    ];
    expect(names.join(" | ")).toMatch(/inspection/i);
    expect(names.join(" | ") + everything()).toMatch(/change order/i);
  });

  it("identifies its individual forms", () => {
    expect(components().filter((c) => c.category === "forms").length).toBeGreaterThan(0);
  });

  it("identifies its integrations, with an integration type on each", () => {
    const integrations = components().filter((c) => c.category === "integrations");
    expect(integrations.length).toBeGreaterThan(0);
    expect(integrations.every((c) => c.integrationType !== null)).toBe(true);
  });

  it("identifies its Analytics components", () => {
    expect(components().filter((c) => c.category === "analytics").length).toBeGreaterThan(0);
  });

  it("states the 10–16 week estimate, and that it begins after form finalisation", () => {
    const estimated = [
      ...reading.set.solutions.map((s) => ({ weeks: s.estimateWeeks, start: s.startCondition })),
      ...components().map((c) => ({ weeks: c.estimateWeeks, start: c.startCondition })),
    ].filter((e) => e.weeks !== null);
    const in10to16 = estimated.filter((e) => e.weeks! >= 10 && e.weeks! <= 16);
    expect(in10to16.length).toBeGreaterThan(0);
    expect(in10to16.some((e) => /final/i.test(e.start ?? ""))).toBe(true);
  });

  it("records the customer dependency on SharePoint access", () => {
    expect(everything()).toMatch(/sharepoint/i);
  });

  it("records the revision limitations", () => {
    expect(everything()).toMatch(/revision/i);
  });

  it("keeps pricing lines out of the deliverables", () => {
    const titles = [
      ...reading.set.solutions.map((s) => s.title),
      ...components().map((c) => c.name),
    ];
    expect(titles.filter((t) => /\$|price|pricing|\bfee\b|\bcost\b/i.test(t))).toEqual([]);
  });
});

// Shown as skipped in every run without the document: the real SOW was not checked.
describe.skipIf(Boolean(SOW_PATH))("Mako Shark Electric SOW, the real document", () => {
  it.skip("NOT CHECKED: MAKO_SOW_PATH is not set, so the real document was not read", () => {});
});
