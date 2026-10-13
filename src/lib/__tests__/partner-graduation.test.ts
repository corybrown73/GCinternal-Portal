import { describe, expect, it, vi } from "vitest";

import { graduatePartnerImplementation, graduationRefusal } from "../partner-progression.server";
import type { PartnerStartClient } from "../partner-start.server";
import {
  customerPartnerStages,
  partnerDashboardView,
  partnerGraduation,
  partnerProgress,
  partnerStepperStages,
  type PartnerProgressInput,
} from "../partner-journey";

vi.mock("../assignment.server", () => ({ chooseAssignee: vi.fn() }));

const IMPL = "11111111-1111-4111-8111-111111111111";

/** A partner implementation at Roll Out, with its four criteria in the given states. */
function atRollOut(
  criteria: string[],
  overrides: Partial<PartnerProgressInput> = {},
): PartnerProgressInput {
  return {
    currentStage: "roll_out",
    dealStage: "onboarding_kickoff",
    dealTransitions: [{ to_stage: "closed_won", occurred_at: "2026-03-01T09:00:00Z" }],
    stageInstances: [
      "closed_won_planning",
      "partner_setup",
      "form_finalisation",
      "pilot",
      "trial_run",
    ]
      .map((k) => ({ stage_key: k, status: "done", gate_mode: "advisory" }))
      .concat([{ stage_key: "roll_out", status: "active", gate_mode: "blocking" }]),
    stageHistory: [{ stage: "trial_run", exited_at: "2026-09-01T12:00:00Z" }],
    milestones: [],
    workItems: criteria.map((status, i) => ({
      id: `ro-${i}`,
      stage_key: "roll_out",
      title: [
        "Go-live completed",
        "Training delivered",
        "Acceptance confirmed",
        "Support handoff confirmed",
      ][i]!,
      party: i === 2 ? "customer" : "internal",
      visibility: i === 2 ? "shared" : "internal",
      status,
      is_gate: true,
      due_at: null,
    })),
    ...overrides,
  };
}

/** The same implementation after graduation: Roll Out done, deal at Graduate. */
function graduated(): PartnerProgressInput {
  const base = atRollOut(["done", "done", "done", "done"]);
  return {
    ...base,
    dealStage: "onboarding_complete",
    stageInstances: base.stageInstances.map((s) =>
      s.stage_key === "roll_out" ? { ...s, status: "done" } : s,
    ),
    stageHistory: [...base.stageHistory, { stage: "roll_out", exited_at: "2026-10-13T12:00:00Z" }],
  };
}

function client(response: { error: { message: string } | null }) {
  const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
    data: null,
    error: response.error,
  }));
  return { client: { rpc } as unknown as PartnerStartClient, rpc };
}

describe("partnerGraduation — the state the panel shows", () => {
  it("is available at Roll Out while the stage is not yet done", () => {
    expect(partnerGraduation(partnerProgress(atRollOut(["done", "done", "done", "done"])))).toBe(
      "available",
    );
  });

  it("is graduated once Roll Out is done, and is null at any other stage", () => {
    expect(partnerGraduation(partnerProgress(graduated()))).toBe("graduated");
    expect(
      partnerGraduation(
        partnerProgress({
          ...atRollOut(["done", "done", "done", "done"]),
          currentStage: "trial_run",
        }),
      ),
    ).toBeNull();
  });
});

describe("graduatePartnerImplementation — the transactional action", () => {
  it("is one RPC call with the implementation, the actor and the time", async () => {
    const { client: c, rpc } = client({ error: null });
    await graduatePartnerImplementation(c, {
      implementationId: IMPL,
      actorTeamMember: "tm-1",
      actorProfile: "pr-1",
      at: "2026-10-13T12:00:00.000Z",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]).toEqual([
      "partner_implementation_graduate",
      {
        p_implementation_id: IMPL,
        p_actor_team_member: "tm-1",
        p_actor_profile: "pr-1",
        p_at: "2026-10-13T12:00:00.000Z",
      },
    ]);
  });

  it("refuses incomplete criteria: the database's refusal reaches the caller, nothing else is called", async () => {
    const { client: c, rpc } = client({
      error: {
        message:
          "closed_gate: 1 Roll Out & Graduation criteria are still open, so graduation was refused.",
      },
    });
    await expect(
      graduatePartnerImplementation(c, {
        implementationId: IMPL,
        actorTeamMember: null,
        actorProfile: null,
        at: "t",
      }),
    ).rejects.toThrow("closed_gate");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("refuses a duplicate graduation, so the stage is never completed twice", async () => {
    const { client: c } = client({
      error: { message: "duplicate_graduation: this implementation has already graduated." },
    });
    await expect(
      graduatePartnerImplementation(c, {
        implementationId: IMPL,
        actorTeamMember: null,
        actorProfile: null,
        at: "t",
      }),
    ).rejects.toThrow("duplicate_graduation");
  });
});

describe("graduationRefusal — the copy a person sees", () => {
  it("says the criteria are not done, in plain words", () => {
    expect(graduationRefusal("closed_gate: 2 Roll Out & Graduation criteria are still open")).toBe(
      "Roll Out & Graduation is not complete yet. Every criterion must be done before graduating.",
    );
  });

  it("says a second graduation has already happened", () => {
    expect(
      graduationRefusal("duplicate_graduation: this implementation has already graduated."),
    ).toBe("This implementation has already graduated.");
  });

  it("passes any other message through unchanged", () => {
    expect(graduationRefusal("permission denied")).toBe("permission denied");
  });
});

describe("refresh: Roll Out, the deal and the dashboard after graduation", () => {
  it("re-reading the same records keeps Roll Out completed, on the stepper and the dashboard", () => {
    const first = partnerProgress(graduated());
    const again = partnerProgress(graduated());
    expect(again).toEqual(first);
    expect(partnerStepperStages(first).find((s) => s.key === "roll_out")!.status).toBe("completed");
    expect(partnerStepperStages(first).find((s) => s.key === "roll_out")!.date).toEqual({
      label: "Completed",
      text: "2026-10-13",
    });
    const dashboard = partnerDashboardView(first);
    expect(customerPartnerStages(first).every((s) => s.status === "completed")).toBe(true);
    expect(dashboard.stages.every((s) => s.state === "done")).toBe(true);
    expect(dashboard.currentLabel).toBe("Roll Out & Graduation");
  });

  it("a resync that reopened Roll Out would show it available again: the rule the database keeps", () => {
    // Negative control for migration 0084's partner-aware resync: the stage's own
    // done status is what keeps Roll Out completed after a resync.
    const reopened = partnerProgress({
      ...graduated(),
      stageInstances: graduated().stageInstances.map((s) =>
        s.stage_key === "roll_out" ? { ...s, status: "active" } : s,
      ),
    });
    expect(partnerGraduation(reopened)).toBe("available");
  });
});
