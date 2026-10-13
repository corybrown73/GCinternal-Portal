import { beforeEach, describe, expect, it, vi } from "vitest";

import { chooseAssignee } from "../assignment.server";
import {
  advancePartnerFor,
  advancePartnerStage,
  graduatePartnerImplementation,
  handOffPartnerImplementation,
  handoffPlan,
} from "../partner-progression.server";

/**
 * The partner progression path: one RPC per move, the assignee chosen by the
 * existing rules, and the notices queued for the database to commit. The fake
 * client records every call, so a refused move is shown to make no second call.
 */

vi.mock("../assignment.server", () => ({ chooseAssignee: vi.fn() }));

const APP = "https://hub.example";
const IMPL = "11111111-1111-4111-8111-111111111111";
const DEAL = "22222222-2222-4222-8222-222222222222";

type RpcResult = { data: unknown; error: { message: string } | null };

function fakeClient(result: (fn: string) => RpcResult) {
  const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<RpcResult>>(async (fn) =>
    result(fn),
  );
  return { client: { rpc }, rpc };
}

const chosen = (over: Partial<{ email: string | null }> = {}) => ({
  kind: "chosen" as const,
  chosen: {
    teamMemberId: "tm-1",
    name: "Lee Park",
    email: over.email === undefined ? "lee@gocanvas.test" : over.email,
    load: 3,
  },
  source: "auto" as const,
  weight: 2,
  breakdown: { base: 2 },
  rules: { window_days: 30 },
  deal: { name: "Acme Pools" },
  forWeight: 2,
  training: false,
});

const pool = [
  { teamMemberId: "tm-1", name: "Lee Park", email: "lee@gocanvas.test" },
  { teamMemberId: "tm-2", name: "Sam Ortiz", email: null },
];

beforeEach(() => {
  vi.mocked(chooseAssignee).mockReset();
});

describe("advancing within the partner journey", () => {
  it("an advance is one RPC call, and returns the stage it moved to", async () => {
    const { client, rpc } = fakeClient(() => ({
      data: { stage: "form_finalisation", advanced_with_gaps: true },
      error: null,
    }));
    const result = await advancePartnerFor(client, {
      implementationId: IMPL,
      dealId: DEAL,
      currentStage: "pilot",
      toStage: "trial_run",
      enteredBy: null,
      actorProfile: null,
      notes: "moving on",
      appUrl: APP,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![0]).toBe("advance_partner_stage");
    expect(result).toMatchObject({ ok: true, stage: "form_finalisation", overridden: false });
    expect(chooseAssignee).not.toHaveBeenCalled();
  });

  it("a refused gate surfaces the database's reason, and makes no second call", async () => {
    const { client, rpc } = fakeClient(() => ({
      data: null,
      error: {
        message:
          "closed_gate: 2 gate criteria are still open on trial_run, and this stage is blocking.",
      },
    }));
    await expect(
      advancePartnerStage(client, {
        implementationId: IMPL,
        toStage: "roll_out",
        enteredBy: null,
        actorProfile: null,
        notes: null,
        at: "2026-10-13T10:00:00.000Z",
      }),
    ).rejects.toThrow(/closed_gate: 2 gate criteria are still open/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("an advance that returns no stage is a failure, never a silent success", async () => {
    const { client } = fakeClient(() => ({ data: null, error: null }));
    await expect(
      advancePartnerStage(client, {
        implementationId: IMPL,
        toStage: "pilot",
        enteredBy: null,
        actorProfile: null,
        notes: null,
        at: "2026-10-13T10:00:00.000Z",
      }),
    ).rejects.toThrow(/no result was returned/);
  });
});

describe("the Implementation Ready handoff", () => {
  it("Partner Setup to Form Finalisation is the handoff: the chosen person is owner, and their notice is queued", async () => {
    vi.mocked(chooseAssignee).mockResolvedValue(chosen() as never);
    const { client, rpc } = fakeClient(() => ({
      data: { stage: "form_finalisation", assigned: true },
      error: null,
    }));
    const result = await advancePartnerFor(client, {
      implementationId: IMPL,
      dealId: DEAL,
      currentStage: "partner_setup",
      toStage: "form_finalisation",
      enteredBy: null,
      actorProfile: null,
      notes: null,
      appUrl: APP,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![0]).toBe("partner_implementation_handoff");
    const args = rpc.mock.calls[0]![1] as Record<string, unknown>;
    expect(args["p_team_member_id"]).toBe("tm-1");
    expect(args["p_assignment"]).toMatchObject({ weight: 2, source: "auto" });
    const notices = args["p_outbox"] as Array<{ dedupe_key: string; to: string }>;
    expect(notices).toHaveLength(1);
    expect(notices[0]!.dedupe_key).toBe(`assignment:handoff:${IMPL}:tm-1`);
    expect(notices[0]!.to).toBe("lee@gocanvas.test");
    expect(result).toMatchObject({ ok: true, stage: "form_finalisation", overridden: false });
  });

  it("a handoff takes the team member the person picked, and reports that someone was named", async () => {
    vi.mocked(chooseAssignee).mockResolvedValue(chosen() as never);
    const { client, rpc } = fakeClient(() => ({
      data: { stage: "form_finalisation", assigned: true },
      error: null,
    }));
    const result = await advancePartnerFor(client, {
      implementationId: IMPL,
      dealId: DEAL,
      currentStage: "partner_setup",
      toStage: "form_finalisation",
      enteredBy: null,
      actorProfile: null,
      notes: null,
      appUrl: APP,
      teamMemberId: "tm-picked",
    });
    expect(vi.mocked(chooseAssignee)).toHaveBeenCalledWith({
      dealId: DEAL,
      teamMemberId: "tm-picked",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, stage: "form_finalisation", assigned: true });
  });

  it("a handoff with no one picked lets the rule choose, as before", async () => {
    vi.mocked(chooseAssignee).mockResolvedValue(chosen() as never);
    const { client } = fakeClient(() => ({
      data: { stage: "form_finalisation", assigned: true },
      error: null,
    }));
    await advancePartnerFor(client, {
      implementationId: IMPL,
      dealId: DEAL,
      currentStage: "partner_setup",
      toStage: "form_finalisation",
      enteredBy: null,
      actorProfile: null,
      notes: null,
      appUrl: APP,
    });
    expect(vi.mocked(chooseAssignee)).toHaveBeenCalledWith({ dealId: DEAL, teamMemberId: null });
  });

  it("a handoff with no one to pick (the account is open to claim) queues one notice per pool member and assigns no one", async () => {
    vi.mocked(chooseAssignee).mockResolvedValue({
      kind: "claim",
      pool,
      dealName: "Acme Pools",
      weight: 2,
      breakdown: { base: 2 },
    } as never);
    const { client, rpc } = fakeClient(() => ({
      data: { stage: "form_finalisation", assigned: false },
      error: null,
    }));
    await advancePartnerFor(client, {
      implementationId: IMPL,
      dealId: DEAL,
      currentStage: "partner_setup",
      toStage: "form_finalisation",
      enteredBy: null,
      actorProfile: null,
      notes: null,
      appUrl: APP,
    });
    const args = rpc.mock.calls[0]![1] as Record<string, unknown>;
    expect(args["p_team_member_id"]).toBeNull();
    const notices = args["p_outbox"] as Array<{ dedupe_key: string; to: string }>;
    expect(notices.map((n) => n.dedupe_key)).toEqual([
      `assignment:claim:${IMPL}:tm-1`,
      `assignment:claim:${IMPL}:tm-2`,
    ]);
    expect(notices[1]!.to).toBe("");
  });

  it("an assignee with no address still gets a notice, recorded as a failure later, never dropped", () => {
    const plan = handoffPlan({
      choice: chosen({ email: null }) as never,
      implementationId: IMPL,
      dealId: DEAL,
      appUrl: APP,
    });
    expect(plan.teamMemberId).toBe("tm-1");
    expect(plan.notices).toHaveLength(1);
    expect(plan.notices[0]!.to).toBe("");
  });

  it("a refused handoff (duplicate, or an open gate) surfaces the reason and nothing else", async () => {
    vi.mocked(chooseAssignee).mockResolvedValue(chosen() as never);
    const { client, rpc } = fakeClient(() => ({
      data: null,
      error: {
        message:
          "duplicate_handoff: this implementation is already past the handoff (at form_finalisation)",
      },
    }));
    await expect(
      advancePartnerFor(client, {
        implementationId: IMPL,
        dealId: DEAL,
        currentStage: "partner_setup",
        toStage: "form_finalisation",
        enteredBy: null,
        actorProfile: null,
        notes: null,
        appUrl: APP,
      }),
    ).rejects.toThrow(/duplicate_handoff/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("the handoff needs the deal, and refuses without one before anything is chosen", async () => {
    await expect(
      advancePartnerFor(fakeClient(() => ({ data: null, error: null })).client, {
        implementationId: IMPL,
        dealId: null,
        currentStage: "partner_setup",
        toStage: "form_finalisation",
        enteredBy: null,
        actorProfile: null,
        notes: null,
        appUrl: APP,
      }),
    ).rejects.toThrow(/no deal/);
    expect(chooseAssignee).not.toHaveBeenCalled();
  });

  it("the handoff call writes nothing outside its own RPC", async () => {
    const { client, rpc } = fakeClient(() => ({
      data: { stage: "form_finalisation", assigned: false },
      error: null,
    }));
    await handOffPartnerImplementation(client, {
      implementationId: IMPL,
      teamMemberId: null,
      assignment: null,
      notices: [],
      actorTeamMember: null,
      actorProfile: null,
      at: "2026-10-13T10:00:00.000Z",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("partner graduation", () => {
  it("one RPC call, and a refused graduation surfaces the reason", async () => {
    const ok = fakeClient(() => ({ data: { graduated: true }, error: null }));
    await graduatePartnerImplementation(ok.client, {
      implementationId: IMPL,
      actorTeamMember: null,
      actorProfile: null,
      at: "2026-10-13T10:00:00.000Z",
    });
    expect(ok.rpc).toHaveBeenCalledTimes(1);
    expect(ok.rpc.mock.calls[0]![0]).toBe("partner_implementation_graduate");

    const refused = fakeClient(() => ({
      data: null,
      error: {
        message:
          "closed_gate: 1 Roll Out & Graduation criteria are still open, so graduation was refused.",
      },
    }));
    await expect(
      graduatePartnerImplementation(refused.client, {
        implementationId: IMPL,
        actorTeamMember: null,
        actorProfile: null,
        at: "2026-10-13T10:00:00.000Z",
      }),
    ).rejects.toThrow(/closed_gate/);
  });
});
