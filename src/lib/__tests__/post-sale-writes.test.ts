import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The alternate write paths that touch delivery decisions: a person marking a task
 * done or skipped (a stage exception), and a person applying the SOW's goals and
 * requirements. Each is checked on the server before anything is written.
 */

const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    flags: { isFlagOn: async () => false, getV2Flags: async () => ({}), resetFlagCache: () => {} },
    audit: { audit: vi.fn(async () => {}) },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../app-config.server", () => h.flags);
vi.mock("@/lib/app-config.server", () => h.flags);
vi.mock("../server/audit", () => h.audit);

import { POST_SALE_REFUSAL } from "../post-sale-access.server";
import { setTaskStatusAsPerson } from "../plan.server";
import { applySowProposalAsPerson, setSowDocumentAsPerson } from "../sow-analysis.server";
import { advanceStage, handOffPartner } from "../hub.server";

const ORG = "00000000-0000-4000-8000-000000000001";
const IMPL = "d0000000-0000-4000-8000-0000000000c1";
const TASK = "b0000000-0000-4000-8000-0000000000c1";
const ACTOR = "a0000000-0000-4000-8000-0000000000c1";

let fake: ReturnType<typeof createFakeSupabase>;

function load(allowed: boolean, extra: Rows = {}) {
  const rows: Rows = {
    implementations: [
      {
        id: IMPL,
        org_id: ORG,
        name: "Rollout",
        current_stage: "build",
        customer_goals: "Keep it moving",
        owner_id: null,
      },
    ],
    work_items: [
      {
        id: TASK,
        org_id: ORG,
        implementation_id: IMPL,
        status: "not_started",
        party: "internal",
        is_gate: true,
        stage_instance_id: null,
      },
    ],
    requirements: [],
    portal_profiles: [
      { id: ACTOR, full_name: "Sam", email: "sam@gocanvas.test", role: "implementation" },
    ],
    ...extra,
  };
  fake = createFakeSupabase(rows, {
    rpcHandlers: { post_sale_may_manage: () => ({ data: allowed }) },
  });
  h.supabase.client = fake.client;
}

beforeEach(() => {
  h.audit.audit.mockClear();
});

describe("a person changing a task's status (a gate exception included)", () => {
  it("refuses to skip a gate task for someone who may not change the implementation, and changes nothing", async () => {
    load(false);
    await expect(
      setTaskStatusAsPerson({ workItemId: TASK, status: "skipped", actorProfileId: ACTOR }),
    ).rejects.toThrow(POST_SALE_REFUSAL);
    expect(fake.store["work_items"]![0]!["status"]).toBe("not_started");
  });

  it("checks the implementation the task belongs to, not one the caller names", async () => {
    load(false);
    await expect(
      setTaskStatusAsPerson({ workItemId: TASK, status: "done", actorProfileId: ACTOR }),
    ).rejects.toThrow(POST_SALE_REFUSAL);
    expect(fake.rpcs.find((r) => r.fn === "post_sale_may_manage")!.args["p_implementation"]).toBe(
      IMPL,
    );
  });

  it("says plainly when the task does not exist, before any check", async () => {
    load(true);
    await expect(
      setTaskStatusAsPerson({
        workItemId: "b0000000-0000-4000-8000-0000000000ff",
        status: "done",
        actorProfileId: ACTOR,
      }),
    ).rejects.toThrow("That task no longer exists");
    expect(fake.rpcs.some((r) => r.fn === "post_sale_may_manage")).toBe(false);
  });
});

describe("a person applying the SOW's goals and requirements", () => {
  const input = {
    implementationId: IMPL,
    authorTeamMemberId: "70000000-0000-4000-8000-0000000000c1",
    goals: "Cut the dispatch lag",
    requirements: ["Form for each inspection"],
    successMeasures: [],
    journeyNote: null,
  };

  it("refuses for someone who may not change the implementation, and writes no goal or requirement", async () => {
    load(false);
    await expect(applySowProposalAsPerson(input, ACTOR)).rejects.toThrow(POST_SALE_REFUSAL);
    expect(fake.store["requirements"]).toEqual([]);
    expect(fake.store["implementations"]![0]!["customer_goals"]).toBe("Keep it moving");
  });

  it("refuses to replace the agreed-scope document for someone who may not change the implementation", async () => {
    load(false, {
      implementations: [
        {
          id: IMPL,
          org_id: ORG,
          name: "Rollout",
          current_stage: "build",
          customer_goals: null,
          owner_id: null,
          sow_document_url: "https://example.test/old.pdf",
          sow_document_name: "old.pdf",
        },
      ],
    });
    await expect(
      setSowDocumentAsPerson(
        {
          implementationId: IMPL,
          documentUrl: "https://example.test/new.pdf",
          documentName: "new.pdf",
        },
        ACTOR,
      ),
    ).rejects.toThrow(POST_SALE_REFUSAL);
    expect(fake.store["implementations"]![0]!["sow_document_name"]).toBe("old.pdf");
  });
});

describe("stage progression, exceptions and hand-over", () => {
  it("refuses a stage move, including an approved-exception override, for someone who may not change it", async () => {
    load(false);
    await expect(
      advanceStage({
        implementationId: IMPL,
        toStage: "roll_out",
        enteredBy: null,
        notes: null,
        override: { reason: "Customer asked to go early" },
        actorProfileId: ACTOR,
      }),
    ).rejects.toThrow(POST_SALE_REFUSAL);
    expect(fake.store["implementations"]![0]!["current_stage"]).toBe("build");
  });

  it("refuses a partner hand-off for someone who may not change the implementation", async () => {
    load(false);
    await expect(
      handOffPartner({
        implementationId: IMPL,
        teamMemberId: "70000000-0000-4000-8000-0000000000c2",
        enteredBy: null,
        actorProfileId: ACTOR,
      }),
    ).rejects.toThrow(POST_SALE_REFUSAL);
    expect(fake.store["implementations"]![0]!["owner_id"]).toBeNull();
  });
});
