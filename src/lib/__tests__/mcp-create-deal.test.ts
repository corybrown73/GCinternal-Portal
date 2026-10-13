import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * MCP create_deal at Closed Won (QA 18.1): it starts onboarding the way a
 * close on the deal page does — customer, project, rotation, reading — so
 * the deal is on Customers as well as Pipeline. A customer already named
 * like the deal is a person's call, as on the page: nothing is created and
 * the reason is audited. No new gate; below the close nothing happens.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    flags: { isFlagOn: async () => false, getV2Flags: async () => ({}), resetFlagCache: () => {} },
    audit: { audit: vi.fn(async () => {}) },
    presale: { startOnboardingAs: vi.fn() },
    assignment: { dealAssignment: vi.fn(), assignDeal: vi.fn(async () => null) },
    jobs: { autoReadDeal: vi.fn(async () => null) },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("@/lib/app-config.server", () => h.flags);
vi.mock("../app-config.server", () => h.flags);
vi.mock("../server/audit", () => h.audit);
vi.mock("../presale.server", () => h.presale);
vi.mock("../assignment.server", () => h.assignment);
vi.mock("../server/ai/jobs", () => h.jobs);

import { createDeal } from "../server/handoff-tools";

const rows: Rows = { portal_accounts: [], customers: [] };
let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  fake = createFakeSupabase(rows);
  h.supabase.client = fake.client;
  vi.clearAllMocks();
  h.assignment.dealAssignment.mockResolvedValue({ owner: null });
  h.presale.startOnboardingAs.mockImplementation(
    async (_actor: unknown, _dealId: string, opts: { createNewCustomer?: boolean }) =>
      opts.createNewCustomer
        ? { outcome: "started", customerId: "cust-new", implementationId: "impl-new" }
        : { outcome: "needs_account_choice", customerId: "", implementationId: "" },
  );
});

describe("MCP create_deal", () => {
  it("at Closed Won creates the customer and project, hands it to the rotation and starts the reading", async () => {
    const r = await createDeal({ name: "Bayou Pipeline Services", stage: "closed_won" });
    expect(r.onboarding).toEqual({
      started: true,
      customerId: "cust-new",
      implementationId: "impl-new",
    });
    expect(h.presale.startOnboardingAs).toHaveBeenCalledTimes(2);
    expect(h.presale.startOnboardingAs.mock.calls[0]![0]).toEqual({
      kind: "system",
      label: "the MCP create_deal tool",
    });
    expect(h.presale.startOnboardingAs.mock.calls[1]![2]).toEqual({ createNewCustomer: true });
    expect(h.assignment.assignDeal).toHaveBeenCalledWith({
      dealId: r.dealId,
      implementationId: "impl-new",
    });
    expect(h.jobs.autoReadDeal).toHaveBeenCalledWith(r.dealId, "closed_won_mcp");
  });

  it("leaves a same-named customer for a person to pick, and says why", async () => {
    fake.store["customers"]!.push({ id: "cust-old", name: "Bayou Pipeline Services" });
    const r = await createDeal({ name: "Bayou Pipeline Services", stage: "closed_won" });
    expect(r.onboarding).toMatchObject({ started: false });
    expect((r.onboarding as { reason: string }).reason).toMatch(/already exists/);
    expect(h.presale.startOnboardingAs).toHaveBeenCalledTimes(1);
    expect(h.audit.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "onboarding.autostart_deferred", entity_id: r.dealId }),
    );
    expect(h.assignment.assignDeal).not.toHaveBeenCalled();
    // The deal itself is still created.
    expect(fake.store["portal_accounts"]!.map((d) => d.name)).toEqual(["Bayou Pipeline Services"]);
  });

  it("keeps an owner the deal already has", async () => {
    h.assignment.dealAssignment.mockResolvedValue({ owner: { teamMemberId: "teya" } });
    await createDeal({ name: "Owned Co", stage: "onboarding_kickoff" });
    expect(h.presale.startOnboardingAs).toHaveBeenCalled();
    expect(h.assignment.assignDeal).not.toHaveBeenCalled();
  });

  it("at Field Fusion setup leaves the deal with its setup owner, as the page does", async () => {
    const r = await createDeal({ name: "Setup Co", stage: "field_fusion_setup" });
    expect(r.onboarding).toMatchObject({ started: true });
    expect(h.assignment.assignDeal).not.toHaveBeenCalled();
    expect(h.jobs.autoReadDeal).toHaveBeenCalledWith(r.dealId, "closed_won_mcp");
  });

  it("below the close starts nothing", async () => {
    const r = await createDeal({ name: "Early Co", stage: "negotiate" });
    expect(r).not.toHaveProperty("onboarding");
    expect(h.presale.startOnboardingAs).not.toHaveBeenCalled();
    expect(h.jobs.autoReadDeal).not.toHaveBeenCalled();
  });
});
