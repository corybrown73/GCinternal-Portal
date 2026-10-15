import { beforeEach, describe, expect, it, vi } from "vitest";

import { readIntake } from "../intake-answers";
import { nothingToProposeReason } from "../implementation-focus";

/**
 * "Generate proposed focus" with nothing to propose: no save, and a reason
 * the panel shows, instead of a 200 that renders nothing.
 */

const h = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  saves: [] as unknown[],
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: h.row, error: null }),
      };
      return builder;
    },
  },
}));
vi.mock("../presale.server", () => ({
  requireSalesEditor: async () => undefined,
  saveDealIntake: async (_u: string, _d: string, patch: unknown) => {
    h.saves.push(patch);
    return readIntake({});
  },
}));

import { generateImplementationFocus } from "../implementation-focus.server";

const DEAL = "7465a940-8673-4625-b9a2-2aaeb35dd992";

beforeEach(() => {
  h.saves = [];
  h.row = null;
});

describe("nothingToProposeReason", () => {
  it("names each missing source, and says the SOW is not read yet", () => {
    expect(nothingToProposeReason(readIntake({}))).toBe(
      "Nothing to propose yet: SOW not read yet, no forms named on the intake, no systems on the handoff.",
    );
  });

  it("says there is no SOW when none is attached, and no services when it was read", () => {
    expect(nothingToProposeReason(readIntake({}), { sowAttached: false })).toContain(
      "no SOW on the deal",
    );
    expect(
      nothingToProposeReason(readIntake({ timeline: { sow_applied_at: "2026-10-02T00:00:00Z" } })),
    ).toContain("no purchased services on the SOW");
  });

  it("is null when there is something to propose", () => {
    expect(
      nothingToProposeReason(readIntake({ wanted_forms: [{ id: "f1", name: "Work Order" }] })),
    ).toBeNull();
  });
});

describe("generateImplementationFocus", () => {
  it("does not save an empty proposal, and returns the reason", async () => {
    h.row = { intake: {}, sow_document_path: "sow/qa.pdf", sow_document_url: null };
    const result = await generateImplementationFocus("user-1", DEAL);
    expect(result.empty).toBe(true);
    expect(result.reason).toBe(
      "Nothing to propose yet: SOW not read yet, no forms named on the intake, no systems on the handoff.",
    );
    expect(h.saves).toEqual([]);
  });

  it("saves and returns the proposal when there is one", async () => {
    h.row = {
      intake: { wanted_forms: [{ id: "f1", name: "Service Work Order" }] },
      sow_document_path: null,
      sow_document_url: null,
    };
    const result = await generateImplementationFocus("user-1", DEAL);
    expect(result.empty).toBe(false);
    expect(result.reason).toBeNull();
    expect(h.saves).toHaveLength(1);
  });
});
