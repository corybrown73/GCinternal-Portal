import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The server readers of "is the paperwork in", against one in-memory book:
 * Home's deal facts (and through them Customer 360's Needs-attention), the
 * checklist the stage moves read, the deal pulse's guide and the
 * assignment email all say the same thing for a contract-only deal, a SOW
 * linked rather than uploaded, a stated no-SOW reason, and a bare "No".
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    flags: { isFlagOn: async () => false, getV2Flags: async () => ({}), resetFlagCache: () => {} },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("@/lib/app-config.server", () => h.flags);
vi.mock("../app-config.server", () => h.flags);
vi.mock("../welcome.server", () => ({ loadWelcome: async () => null }));

import { loadDealPulse } from "../deal-pulse.server";
import { dealFactsFor } from "../server/deal-facts";
import { flowForDeal } from "../stage-flow.server";

const CONTRACT = { path: "deals/c/contract/c.pdf", name: "c.pdf", uploaded_at: "2026-10-01" };

const dealRow = (id: string, over: Record<string, unknown>) => ({
  id,
  name: id,
  stage: "closed_won",
  stage_entered_at: "2026-10-14T09:00:00Z",
  intake: {},
  sow_document_path: null,
  sow_document_url: null,
  sow_reference: null,
  welcome_share_url: null,
  welcome_opened_at: null,
  customer_id: null,
  ...over,
});

const rows: Rows = {
  portal_accounts: [
    dealRow("contract", { intake: { has_sow: false, contract: CONTRACT } }),
    dealRow("linked", { sow_document_url: "https://docusign.example/sow" }),
    dealRow("reason", { intake: { has_sow: false, no_sow_reason: "Order form only" } }),
    dealRow("bare", { intake: { has_sow: false } }),
  ],
  // Notes and a brief on every deal, so the guide's next step is the paper
  // step whenever the paperwork is missing.
  portal_gong_reports: ["contract", "linked", "reason", "bare"].map((id) => ({
    id: `r-${id}`,
    account_id: id,
  })),
  portal_briefs: ["contract", "linked", "reason", "bare"].map((id) => ({
    id: `b-${id}`,
    account_id: id,
    status: "complete",
    generator: "llm",
  })),
  implementations: [],
  team_members: [],
  portal_assignments: [],
  portal_stage_transitions: [],
};

beforeEach(() => {
  const client = createFakeSupabase(rows).client;
  // The fake has no `count`; the pulse counts notes and briefs with it.
  const from = client.from;
  client.from = (table: string) => {
    const b = from(table);
    const then = b.then.bind(b);
    b.then = (ok: any, bad: any) =>
      then(
        (res: any) =>
          (ok ?? ((x: any) => x))({
            ...res,
            count: Array.isArray(res.data) ? res.data.length : null,
          }),
        bad,
      );
    return b;
  };
  h.supabase.client = client;
});

describe("Home's deal facts", () => {
  it("count a contract, a linked SOW and a stated reason as paperwork; a bare No is not", async () => {
    const facts = await dealFactsFor(["contract", "linked", "reason", "bare"], "2026-10-16");
    expect(facts.get("contract")!.has_sow).toBe(true);
    expect(facts.get("linked")!.has_sow).toBe(true);
    expect(facts.get("reason")!.has_sow).toBe(true);
    expect(facts.get("bare")!.has_sow).toBe(false);
  });
});

describe("the checklist the stage moves read", () => {
  it("ticks 'Add the SOW' for a contract-only deal, and names it", async () => {
    const out = (await flowForDeal("contract"))!;
    const task = out.flow.stages
      .find((s) => s.key === "closed_won")!
      .tasks.find((t) => t.key === "sow")!;
    expect(task).toMatchObject({ done: true, summary: "Contract on file" });
    const bare = (await flowForDeal("bare"))!;
    expect(
      bare.flow.stages.find((s) => s.key === "closed_won")!.tasks.find((t) => t.key === "sow")!
        .done,
    ).toBe(false);
  });

  it("counts a SOW linked with 'Or link to it'", async () => {
    const out = (await flowForDeal("linked"))!;
    expect(
      out.flow.stages.find((s) => s.key === "closed_won")!.tasks.find((t) => t.key === "sow"),
    ).toMatchObject({ done: true, summary: "SOW on file" });
  });
});

describe("the deal pulse's guide", () => {
  it("does not ask for paperwork a contract-only or reasoned deal already has", async () => {
    for (const id of ["contract", "reason", "linked"]) {
      const pulse = (await loadDealPulse(id, "2026-10-16"))!;
      expect(pulse.next?.key, id).not.toBe("paper");
    }
  });

  it("still asks a bare No for the contract or a reason", async () => {
    const pulse = (await loadDealPulse("bare", "2026-10-16"))!;
    expect(pulse.next?.key).toBe("paper");
  });
});

describe("the assignment email's checklist", () => {
  it("says 'SOW or contract on file' by the rule", async () => {
    const { dealAssignment } = await import("../assignment.server");
    const step = async (id: string) =>
      (await dealAssignment(id)).steps.find((s) => s.key === "sow")!;
    expect(await step("contract")).toMatchObject({ label: "SOW or contract on file", done: true });
    expect((await step("linked")).done).toBe(true);
    expect((await step("reason")).done).toBe(true);
    expect((await step("bare")).done).toBe(false);
  });
});

describe("the board", () => {
  it("marks the paperwork chip by the rule", async () => {
    const { loadPipeline } = await import("../presale.server");
    const { deals } = await loadPipeline(null);
    const byId = new Map(deals.map((d) => [d.id, d]));
    expect(byId.get("contract")!.has_sow).toBe(true);
    expect(byId.get("linked")!.has_sow).toBe(true);
    expect(byId.get("reason")!.has_sow).toBe(true);
    expect(byId.get("bare")!.has_sow).toBe(false);
  });
});

describe("the deal pulse, the hint", () => {
  it("names the reason as an option", async () => {
    const pulse = (await loadDealPulse("bare", "2026-10-16"))!;
    expect(pulse.next?.key).toBe("paper");
    expect(pulse.next?.hint).toMatch(/or say why there is no SOW/);
  });
});
