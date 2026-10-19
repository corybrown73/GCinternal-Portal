import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const state = vi.hoisted(() => ({
  account: null as null | { id: string; stage: string; intake: unknown },
  flow: null as unknown,
  partner: false,
  rpc: null as null | Mock<(...args: unknown[]) => Promise<unknown>>,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.account, error: null }) }),
      }),
    }),
    rpc: (...args: unknown[]) => state.rpc!(...args),
  },
}));
vi.mock("../partner-implementation.server", () => ({
  dealHasPartnerJourney: async () => state.partner,
}));
vi.mock("../stage-flow.server", () => ({
  flowForDeal: async () => (state.flow ? { account: state.account, flow: state.flow } : null),
}));

import { buildTimeline } from "../onboarding-timeline";
import { readIntake } from "../intake-answers";
import { stageFlow, type StageFlowInput } from "../stage-flow";
import { correctKickoffHeldForDeal } from "../kickoff-correction.server";

const DEAL = "00000000-0000-4000-8000-0000000000d1";
const ACTOR = "00000000-0000-4000-8000-0000000000a1";
const DATE = "2026-09-25";
const held = { kickoff: DATE, intake_done: "2026-09-20" };
const newLogo = {
  path: "new_logo",
  forms_built: false,
  wanted_forms: [{ id: "f1", name: "Daily job report", template_id: null }],
  handoff_tasks: { reviewed: "2026-09-22T15:00:00Z" },
};

/** The deal as the server reads it: the same stored intake, the same flow rules. */
function setDeal(
  stage: string,
  completed: Record<string, string>,
  extra: Record<string, unknown> = {},
) {
  const intake = { ...newLogo, ...extra, timeline: { completed } };
  const parsed = readIntake(intake);
  const timeline = buildTimeline({
    closeDate: "2026-09-22",
    path: "new_logo",
    completed: parsed.timeline.completed,
    services: [],
  });
  state.account = { id: DEAL, stage, intake };
  state.flow = stageFlow({
    stage,
    intake,
    owner: "Dana",
    gongReports: 1,
    hasSow: true,
    hasBrief: true,
    hasLink: true,
    timeline,
  } as StageFlowInput);
}

/** What the page showed: the stage and intake on screen, and the decision it offered. */
const shown = (
  stage: string,
  kind: "auto" | "confirm_later_work" = "auto",
): { stage: string; intake: Record<string, unknown>; kind: "auto" | "confirm_later_work" } => ({
  stage,
  intake: state.account!.intake as Record<string, unknown>,
  kind,
});

const input = (over: Partial<Parameters<typeof correctKickoffHeldForDeal>[0]> = {}) => ({
  dealId: DEAL,
  actorProfileId: ACTOR,
  expected: shown("get_it_working"),
  confirmLaterWork: false,
  note: null,
  ...over,
});

beforeEach(() => {
  state.partner = false;
  state.rpc = vi.fn(async () => ({
    data: { stage: "kickoff", from_stage: "get_it_working" },
    error: null,
  }));
});

describe("correctKickoffHeldForDeal", () => {
  it("sends the decided stage and the whole intake to the one database call, with the trusted actor", async () => {
    setDeal("get_it_working", held);
    const intake = state.account!.intake;
    const result = await correctKickoffHeldForDeal(input());
    expect(result).toEqual({ stage: "kickoff", fromStage: "get_it_working" });
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc!.mock.calls[0]).toEqual([
      "portal_correct_kickoff_held",
      {
        p_deal_id: DEAL,
        p_expected_stage: "get_it_working",
        p_expected_intake: intake,
        p_actor_profile: ACTOR,
        p_note: null,
        p_later_tasks_done: 0,
      },
    ]);
  });

  it("sends the later-task count only once the person has confirmed it", async () => {
    const later = { ...held, working: "2026-10-02" };
    setDeal("get_it_working", later);
    const expected = shown("get_it_working", "confirm_later_work");
    await expect(correctKickoffHeldForDeal(input({ expected }))).rejects.toThrow(
      /Confirm the correction first/,
    );
    expect(state.rpc).not.toHaveBeenCalled();

    await correctKickoffHeldForDeal(input({ expected, confirmLaterWork: true }));
    expect(state.rpc!.mock.calls[0]![1]).toMatchObject({ p_later_tasks_done: 1 });
  });

  it("refuses a stale request before writing, when the stage has moved", async () => {
    setDeal("get_it_working", held);
    const expected = shown("get_it_working");
    setDeal("make_it_yours", held);
    await expect(correctKickoffHeldForDeal(input({ expected }))).rejects.toThrow(
      /changed while this was open/,
    );
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses a stale request when the completion record changed after the page loaded", async () => {
    setDeal("get_it_working", held);
    const expected = shown("get_it_working");
    setDeal("get_it_working", { ...held, intake_done: "2026-09-21" });
    await expect(correctKickoffHeldForDeal(input({ expected }))).rejects.toThrow(
      /changed while this was open/,
    );
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses when the intake changed outside the completion record, such as the outcome", async () => {
    // Complete stage, no outcome when the page loaded: automatic. Another
    // person then records the outcome, which makes Complete done. The
    // correction must not go ahead on the old answer.
    setDeal("onboarding_complete", held);
    const expected = shown("onboarding_complete");
    setDeal("onboarding_complete", held, {
      outcome: { kind: "proven", reason: null, at: "2026-10-01T00:00:00Z", by: null },
    });
    await expect(
      correctKickoffHeldForDeal(input({ expected: { ...expected, stage: "onboarding_complete" } })),
    ).rejects.toThrow(/changed while this was open/);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses when later work appeared after the page offered the plain correction", async () => {
    setDeal("get_it_working", held);
    const expected = shown("get_it_working");
    setDeal("get_it_working", { ...held, working: "2026-10-02" });
    await expect(correctKickoffHeldForDeal(input({ expected }))).rejects.toThrow(
      /changed while this was open/,
    );
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses a later stage that is complete, with the review wording, and writes nothing", async () => {
    // Mark every task of Get it working done: that stage is then complete.
    setDeal("get_it_working", held);
    type Stage = { key: string; tasks: Array<{ key: string; doneKey?: string | null }> };
    const giw = (state.flow as { stages: Stage[] }).stages.find((s) => s.key === "get_it_working")!;
    const marks = Object.fromEntries(giw.tasks.map((t) => [t.doneKey ?? t.key, "2026-10-03"]));
    setDeal("get_it_working", { ...held, ...marks });
    await expect(
      correctKickoffHeldForDeal(input({ expected: shown("get_it_working") })),
    ).rejects.toThrow(/stage-correction review/);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses partner implementations before reading the flow", async () => {
    setDeal("get_it_working", held);
    state.partner = true;
    await expect(correctKickoffHeldForDeal(input())).rejects.toThrow(/Partner implementations/);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses a deal that does not exist", async () => {
    state.account = null;
    const expected = { stage: "get_it_working", intake: {}, kind: "auto" as const };
    await expect(
      correctKickoffHeldForDeal({
        dealId: DEAL,
        actorProfileId: ACTOR,
        expected,
        confirmLaterWork: false,
        note: null,
      }),
    ).rejects.toThrow(/no longer exists/);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("maps the database function's refusals to the same plain messages", async () => {
    setDeal("get_it_working", held);
    const cases: Array<[string, RegExp]> = [
      ["kickoff_correction_stale: the deal has moved", /changed while this was open/],
      ["kickoff_correction_forbidden: only the server", /may not change this deal's stage/],
      ["kickoff_correction_not_held: Kickoff is not recorded", /nothing to untick/],
      ["kickoff_correction_not_applicable: partner", /Partner implementations/],
      ["kickoff_correction_not_found: the deal does not exist", /no longer exists/],
    ];
    for (const [message, expected] of cases) {
      state.rpc = vi.fn(async () => ({ data: null, error: { message } }));
      await expect(correctKickoffHeldForDeal(input())).rejects.toThrow(expected);
    }
  });

  it("reports an unexpected database failure rather than hiding it", async () => {
    setDeal("get_it_working", held);
    state.rpc = vi.fn(async () => ({ data: null, error: { message: "connection reset" } }));
    await expect(correctKickoffHeldForDeal(input())).rejects.toThrow(
      /Could not untick Kickoff: connection reset/,
    );
  });
});

describe("the correction's entry point", () => {
  const source = readFileSync(join(__dirname, "..", "kickoff-correction.functions.ts"), "utf8");

  it("is gated by the same deal-editor rule as marking Kickoff held", () => {
    expect(source).toContain(".middleware([requireDealEditor])");
  });

  it("takes the signed-in person from the server session, never from the request", () => {
    expect(source).toContain("actorProfileId: context.profile.id");
    const schema = source.slice(source.indexOf("inputValidator"), source.indexOf(".handler("));
    expect(schema).not.toMatch(/profile|actor|classification/i);
  });
});
