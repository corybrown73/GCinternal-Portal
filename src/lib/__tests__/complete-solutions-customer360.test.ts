import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows, type TableFailures } from "./fake-supabase";

/**
 * Customer 360 carries a concise summary of the complete solutions, and that
 * summary never takes the page down: with the flag off there is none, and a
 * failed read is said in the summary while the rest of the record still loads.
 * The fixture is the Customer 360 fixture from db-read.test.ts, plus solutions.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    flagOn: false,
    flags: {
      isFlagOn: async (name: string) => name === "complete_solutions" && state.flagOn,
      getV2Flags: async () => ({}),
      resetFlagCache: () => {},
    },
    audit: { audit: vi.fn(async () => {}) },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("@/lib/app-config.server", () => h.flags);
vi.mock("../app-config.server", () => h.flags);
vi.mock("../server/audit", () => h.audit);
vi.mock("../server/customer-facing-name", () => ({
  customerFacingNameFor: async ({ fallback }: { fallback: string }) => fallback,
}));

import { loadCustomer360 } from "../hub.server";

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  h.flagOn = false;
});

function useFake(extra: Rows, fail?: TableFailures) {
  const rows: Rows = { ...baseRows(), ...extra };
  h.supabase.client = createFakeSupabase(rows, fail ? { fail } : {}).client;
}

const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
function baseRows(): Rows {
  return {
    portal_accounts: [
      {
        id: "d-acme",
        name: "Acme",
        stage: "closed_won",
        stage_entered_at: recent,
        intake: {},
        customer_id: "c-acme",
        am_owner_id: null,
        se_owner_id: null,
        updated_at: recent,
      },
    ],
    customers: [{ id: "c-acme", name: "Acme" }],
    implementations: [
      {
        id: "i-acme",
        deal_id: "d-acme",
        customer_id: "c-acme",
        name: "Acme onboarding",
        owner_id: "teya",
        current_stage: "handoff",
        stage_entered_at: recent,
        status: "on_track",
        superseded_by_implementation_id: null,
        created_at: recent,
      },
    ],
    team_members: [{ id: "teya", name: "Teya Rampaul", role: "TIS", active: true }],
    portal_profiles: [],
    portal_assignments: [],
    portal_gong_reports: [],
    portal_briefs: [],
    portal_stage_transitions: [],
    commitments: [],
    escalations: [],
  };
}

const SOL_ROW = {
  id: "s-1",
  org_id: "00000000-0000-4000-8000-000000000001",
  implementation_id: "i-acme",
  title: "Dispatch and inspections",
  scope: "purchased",
  source: "manual",
  priority: "needed_for_go_live",
  status: "in_progress",
  readiness_confirmed: "not_ready",
  created_at: "2026-10-01T00:00:00Z",
};
const COMPONENT_ROW = {
  id: "c-1",
  org_id: "00000000-0000-4000-8000-000000000001",
  implementation_id: "i-acme",
  complete_solution_id: "s-1",
  category: "forms",
  name: "Inspection form",
  status: "being_built",
  priority: "needed_for_go_live",
  form_built: false,
  customer_approved: false,
  created_at: "2026-10-01T00:00:00Z",
};

describe("the Customer 360 summary of complete solutions", () => {
  it("is absent while the feature is off, and the record is unchanged", async () => {
    useFake({ complete_solutions: [SOL_ROW], solution_components: [COMPONENT_ROW] });
    const record = await loadCustomer360("c-acme");
    expect(record?.complete_solutions).toBeNull();
  });

  it("summarises the solutions for the selected implementation when the feature is on", async () => {
    h.flagOn = true;
    useFake({
      complete_solutions: [SOL_ROW],
      solution_components: [COMPONENT_ROW],
      solution_component_dependencies: [],
      solution_events: [],
    });
    const record = await loadCustomer360("c-acme");
    expect(record?.complete_solutions?.failed).toBeNull();
    expect(record?.complete_solutions?.summary).toMatchObject({
      solutions: 1,
      purchased: 1,
      openGoLive: 1,
    });
    expect(record?.complete_solutions?.summary?.rows[0]).toMatchObject({
      title: "Dispatch and inspections",
      components: 1,
      readinessConfirmed: "not_ready",
    });
  });

  it("says plainly when the solutions cannot be read, and still loads the rest of the record", async () => {
    h.flagOn = true;
    useFake(
      {
        complete_solutions: [SOL_ROW],
        solution_components: [COMPONENT_ROW],
        solution_component_dependencies: [],
        solution_events: [],
      },
      { solution_components: { message: "connection reset", code: "08006" } },
    );
    const record = await loadCustomer360("c-acme");
    expect(record).not.toBeNull();
    expect(record?.customer.name).toBe("Acme");
    expect(record?.complete_solutions?.summary).toBeNull();
    expect(record?.complete_solutions?.failed).toMatch(/Could not load the complete solutions/);
    expect(errorLog).toHaveBeenCalled();
  });
});
