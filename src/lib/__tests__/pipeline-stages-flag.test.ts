import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deploy safety: the pipeline must not touch 0028's schema while its flag is
 * off, and must not go down when the read fails.
 *
 * `loadPipelineStages()` sits under the pipeline board, the deal record,
 * `startOnboarding` and the Salesforce closed-won bridge — four surfaces, one
 * of which is the busiest internal page there is. Everything it reads
 * (`portal_pipeline_stages_v`) only exists once 0028 is applied, and PostgREST
 * rejects the whole query when a relation is missing. So the guard is not "the
 * feature is off", it is "this code is safe to ship ahead of its migration",
 * which is the lesson share-panel-flag.test.ts was written for.
 *
 * A test that only checked the returned shape would still pass if someone
 * moved the query above the flag check — which is exactly the regression that
 * matters. Hence asserting the database is never reached at all.
 */

const h = vi.hoisted(() => {
  const state = {
    flags: { presale_stage_config: false } as Record<string, boolean>,
    dbCalls: [] as string[],
    /** When true the fake behaves like a database with 0028 applied. */
    schemaPresent: false,
    rows: [] as Record<string, unknown>[],
    db: null as any,
    flagModule: null as any,
  };

  const result = () => ({ data: state.rows, error: null });
  state.db = {
    from(table: string) {
      state.dbCalls.push(table);
      if (!state.schemaPresent) throw new Error(`relation "${table}" does not exist`);
      const builder: any = {
        select: () => builder,
        order: () => Promise.resolve(result()),
        then: (res: any) => Promise.resolve(result()).then(res),
      };
      return builder;
    },
  };
  state.flagModule = {
    isFlagOn: async (flag: string) => state.flags[flag] === true,
    getV2Flags: async () => state.flags,
    resetFlagCache: () => {},
  };
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));
vi.mock("@/lib/app-config.server", () => h.flagModule);
vi.mock("../app-config.server", () => h.flagModule);

const { BUILTIN_PIPELINE_STAGES } = await import("../pipeline-stages");
const { loadPipelineStages, loadPipelineStageAdminView, resetPipelineStageCache } =
  await import("../pipeline-stages.server");

beforeEach(() => {
  h.flags["presale_stage_config"] = false;
  h.schemaPresent = false;
  h.rows = [];
  h.dbCalls.length = 0;
  resetPipelineStageCache();
});

describe("flag off — safe to deploy ahead of 0028", () => {
  it("returns the built-in pipeline without reaching the database", async () => {
    const stages = await loadPipelineStages();
    expect(stages.map((s) => s.key)).toEqual(BUILTIN_PIPELINE_STAGES.map((s) => s.key));
    expect(h.dbCalls).toEqual([]);
  });

  it("renders the admin view without reaching the database", async () => {
    const view = await loadPipelineStageAdminView();
    expect(view.flagOn).toBe(false);
    expect(view.configured).toBe(false);
    expect(view.stages.map((s) => s.key)).toEqual(BUILTIN_PIPELINE_STAGES.map((s) => s.key));
    expect(h.dbCalls).toEqual([]);
  });
});

describe("flag on but the schema is not there yet", () => {
  it("falls back to the built-in pipeline instead of taking the board down", async () => {
    h.flags["presale_stage_config"] = true;
    const stages = await loadPipelineStages();
    expect(h.dbCalls).toContain("portal_pipeline_stages_v");
    expect(stages.map((s) => s.key)).toEqual(BUILTIN_PIPELINE_STAGES.map((s) => s.key));
  });
});

describe("flag on with an empty table", () => {
  it("uses the built-in pipeline: an org has a complete configuration or none", async () => {
    h.flags["presale_stage_config"] = true;
    h.schemaPresent = true;
    h.rows = [];
    const stages = await loadPipelineStages();
    expect(stages.map((s) => s.key)).toEqual(BUILTIN_PIPELINE_STAGES.map((s) => s.key));
  });
});

describe("flag on with a stored configuration", () => {
  it("reads the stored stages, including an unknown colour it refuses to trust", async () => {
    h.flags["presale_stage_config"] = true;
    h.schemaPresent = true;
    h.rows = [
      {
        key: "discovery",
        label: "Discovery",
        color: "chartreuse",
        sort_order: 1,
        is_won: false,
        is_terminal: false,
        enterable: false,
      },
      {
        key: "closed_won",
        label: "Booked",
        color: "ontrack",
        sort_order: 2,
        is_won: true,
        is_terminal: false,
        enterable: true,
      },
      {
        key: "onboarding_complete",
        label: "Live",
        color: "primary",
        sort_order: 3,
        is_won: false,
        is_terminal: true,
        enterable: true,
      },
    ];
    const stages = await loadPipelineStages();
    expect(stages.map((s) => s.key)).toEqual(["discovery", "closed_won", "onboarding_complete"]);
    expect(stages.map((s) => s.label)).toEqual(["Discovery", "Booked", "Live"]);
    // A colour outside the token set can only arrive from a hand-edited row;
    // rendering an unknown class would produce an invisible column.
    expect(stages[0]!.color).toBe("idle");
    expect(stages[0]!.enterable).toBe(false);
  });
});

describe("writes refuse while the flag is off", () => {
  it("explains rather than writing to a table that may not exist", async () => {
    const { createPipelineStage, deletePipelineStage, reorderPipelineStages } =
      await import("../pipeline-stages.server");
    await expect(
      createPipelineStage("user-1", { key: "discovery", label: "Discovery", color: "idle" }),
    ).rejects.toThrow(/not enabled on this deployment/);
    await expect(deletePipelineStage("user-1", "prospect")).rejects.toThrow(
      /not enabled on this deployment/,
    );
    await expect(reorderPipelineStages("user-1", ["prospect"])).rejects.toThrow(
      /not enabled on this deployment/,
    );
    expect(h.dbCalls).toEqual([]);
  });
});
