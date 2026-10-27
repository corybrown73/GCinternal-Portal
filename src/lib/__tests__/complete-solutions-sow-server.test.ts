import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFakeSupabase,
  type Rows,
  type TableFailures,
  type UniqueIndexes,
} from "./fake-supabase";

/**
 * The SOW set-up on the server. The model and the document reader are mocked;
 * what is under test is what happens around them: nothing is written before the
 * TIS confirms, the confirmed set goes to the database in ONE call, and a refusal
 * says why. That the database keeps all of it or none (loops, duplicates, the
 * history) is proven in supabase/tests/0091_complete_solutions.sql.
 */

const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    ai: {
      configured: true,
      run: vi.fn(),
      describe: (e: unknown, what: string) => `${what} failed: ${(e as Error).message}`,
    },
    audit: { audit: vi.fn(async () => {}) },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/audit", () => h.audit);
vi.mock("../server/ai/config", () => ({ aiConfigured: () => h.ai.configured }));
vi.mock("../server/ai/client", () => ({
  runStructured: (args: unknown) => h.ai.run(args),
  describeAiError: (e: unknown, what: string) => h.ai.describe(e, what),
}));
vi.mock("../server/ai/documents", () => ({
  prepareDocument: async () => ({
    block: { type: "text", text: "SOW" },
    sha256: "sha",
    problem: null,
  }),
}));

import { readSolutionsFromSow, saveReviewedSolutions } from "../complete-solutions-sow.server";
import type { ReviewedSolution } from "../complete-solutions-sow";

const ORG = "00000000-0000-4000-8000-000000000001";
const IMPL = "d0000000-0000-4000-8000-0000000000c1";
const ACTOR = "a0000000-0000-4000-8000-0000000000c1";

let fake: ReturnType<typeof createFakeSupabase>;
function use(rows: Rows, fail?: TableFailures, unique: UniqueIndexes = {}) {
  fake = createFakeSupabase(rows, {
    objects: { "attachments/impl/sow.pdf": new Uint8Array([1, 2, 3]) },
    unique,
    ...(fail ? { fail } : {}),
  });
  h.supabase.client = fake.client;
}

function baseRows(sow = true): Rows {
  return {
    implementations: [
      {
        id: IMPL,
        org_id: ORG,
        customer_id: "c-1",
        name: "Equipment rollout",
        current_stage: "build",
        sow_document_path: sow ? "impl/sow.pdf" : null,
        sow_document_name: sow ? "signed-sow.pdf" : null,
        deal_id: null,
      },
    ],
    portal_profiles: [
      { id: ACTOR, full_name: "Sam TIS", email: "sam@gocanvas.test", role: "implementation" },
    ],
    complete_solutions: [],
    solution_components: [],
    solution_component_dependencies: [],
    solution_events: [],
  };
}

const UNIQUE = { solution_component_dependencies: [{ cols: ["component_id", "depends_on_id"] }] };

beforeEach(() => {
  h.ai.configured = true;
  h.ai.run.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/** A reviewed set, as the TIS would confirm it after editing. */
function reviewed(over: Partial<ReviewedSolution> = {}): ReviewedSolution {
  return {
    title: "Equipment inspections",
    scope: "purchased",
    startCondition: "From the kickoff call",
    estimateWeeks: 4,
    sowQuote: "Inspections are one solution.",
    suggestedTarget: "2026-11-30",
    targetReason: "4 weeks from 2026-11-02, as the SOW estimates.",
    components: [
      {
        category: "forms",
        integrationType: null,
        name: "Inspection form",
        priority: "needed_for_go_live",
        dependsOn: [],
        critical: false,
        startCondition: null,
        estimateWeeks: null,
        sowQuote: "A form.",
        suggestedTarget: null,
      },
      {
        category: "integrations",
        integrationType: "dispatch",
        name: "Dispatch feed",
        priority: "needed_for_go_live",
        dependsOn: ["Inspection form"],
        critical: true,
        startCondition: null,
        estimateWeeks: 2,
        sowQuote: "Posts to dispatch.",
        suggestedTarget: "2026-11-16",
      },
    ],
    ...over,
  };
}

/* ------------------------------------------------------- reading the SOW */

describe("reading the SOW proposes, and writes nothing", () => {
  it("returns a reviewable set and leaves the database untouched", async () => {
    use(baseRows());
    h.ai.run.mockResolvedValue({
      data: {
        readable: true,
        problem: "",
        solutions: [
          {
            title: "Equipment inspections",
            scope: "purchased",
            components: [{ category: "forms", name: "Inspection form" }],
          },
        ],
        gaps: ["No start date given."],
      },
    });
    const out = await readSolutionsFromSow(IMPL);
    expect(out.sowName).toBe("signed-sow.pdf");
    expect(out.solutions.map((s) => s.title)).toEqual(["Equipment inspections"]);
    expect(out.gaps).toEqual(["No start date given."]);
    expect(fake.inserts).toEqual([]);
  });

  it("refuses when AI is not configured, before reading anything", async () => {
    use(baseRows());
    h.ai.configured = false;
    await expect(readSolutionsFromSow(IMPL)).rejects.toThrow("AI analysis is not configured");
    expect(h.ai.run).not.toHaveBeenCalled();
  });

  it("says no SOW is attached, rather than reading nothing", async () => {
    use(baseRows(false));
    await expect(readSolutionsFromSow(IMPL)).rejects.toThrow("No SOW is attached");
  });

  it("says the reading failed, and that nothing has been changed", async () => {
    use(baseRows());
    h.ai.run.mockRejectedValue(new Error("rate limited"));
    await expect(readSolutionsFromSow(IMPL)).rejects.toThrow(
      "The SOW reading failed: rate limited. Nothing has been changed.",
    );
    expect(fake.inserts).toEqual([]);
  });

  it("gives the reading's own problem when the document is not a SOW", async () => {
    use(baseRows());
    h.ai.run.mockResolvedValue({
      data: { readable: false, problem: "This is a brochure, not a SOW.", solutions: [], gaps: [] },
    });
    await expect(readSolutionsFromSow(IMPL)).rejects.toThrow("This is a brochure, not a SOW.");
  });

  it("refuses a reading with no solutions in it, rather than saving an empty set", async () => {
    use(baseRows());
    h.ai.run.mockResolvedValue({ data: { readable: true, problem: "", solutions: [], gaps: [] } });
    await expect(readSolutionsFromSow(IMPL)).rejects.toThrow("did not name any complete solutions");
  });
});

/* ------------------------------------------------------- saving the set */

describe("saving the reviewed set", () => {
  /** The one call the save makes, and what it returns. */
  function useSaveWith(result: { data?: unknown; error?: unknown }) {
    const rpcHandlers = {
      solution_save_reviewed_set: () => result,
    } as Record<string, (args: Record<string, any>) => { data?: any; error?: any }>;
    fake = createFakeSupabase(baseRows(), { unique: UNIQUE, rpcHandlers });
    h.supabase.client = fake.client;
  }
  const saveCalls = () => fake.rpcs.filter((r) => r.fn === "solution_save_reviewed_set");

  it("sends the whole confirmed set in one call, with each solution's priority from its most urgent component", async () => {
    useSaveWith({
      data: {
        created: [{ title: "Equipment inspections", components: 2, dependencies: 1 }],
        skipped: [],
      },
    });
    const result = await saveReviewedSolutions(IMPL, [reviewed()], "signed-sow.pdf", ACTOR);

    expect(saveCalls()).toHaveLength(1);
    const args = saveCalls()[0]!.args;
    expect(args).toMatchObject({
      p_profile: ACTOR,
      p_implementation: IMPL,
      p_sow_name: "signed-sow.pdf",
    });
    expect(args["p_solutions"][0]).toMatchObject({
      title: "Equipment inspections",
      scope: "purchased",
      priority: "needed_for_go_live",
      suggestedTarget: "2026-11-30",
    });
    const dispatch = args["p_solutions"][0].components[1];
    expect(dispatch).toMatchObject({
      name: "Dispatch feed",
      integrationType: "dispatch",
      dependsOn: ["Inspection form"],
      critical: true,
      suggestedTarget: "2026-11-16",
    });
    expect(result.created).toEqual([
      { title: "Equipment inspections", components: 2, dependencies: 1 },
    ]);
  });

  it("returns what the database kept, and why each skipped name was skipped", async () => {
    useSaveWith({
      data: {
        created: [],
        skipped: [
          {
            title: "Equipment inspections",
            reason: "A solution with this name already exists on the implementation.",
          },
        ],
      },
    });
    const result = await saveReviewedSolutions(IMPL, [reviewed()], "signed-sow.pdf", ACTOR);
    expect(result.created).toEqual([]);
    expect(result.skipped).toEqual([
      {
        title: "Equipment inspections",
        reason: "A solution with this name already exists on the implementation.",
      },
    ]);
  });

  it("sends two unrelated solutions as two entries in the same call", async () => {
    useSaveWith({ data: { created: [], skipped: [] } });
    await saveReviewedSolutions(
      IMPL,
      [reviewed(), reviewed({ title: "Fuel log", components: [] })],
      "signed-sow.pdf",
      ACTOR,
    );
    expect(saveCalls()).toHaveLength(1);
    expect(saveCalls()[0]!.args["p_solutions"].map((s: { title: string }) => s.title)).toEqual([
      "Equipment inspections",
      "Fuel log",
    ]);
  });

  it("passes on the database's refusal of a loop, so the person sees why nothing was saved", async () => {
    useSaveWith({
      error: {
        code: "22023",
        message:
          'The dependencies in "Equipment inspections" would make components depend on each other in a loop. Nothing was saved.',
      },
    });
    await expect(
      saveReviewedSolutions(IMPL, [reviewed()], "signed-sow.pdf", ACTOR),
    ).rejects.toThrow("Nothing was saved.");
  });

  it("says nothing was saved when the database fails for any other reason", async () => {
    useSaveWith({ error: { code: "23514", message: "check constraint violated" } });
    await expect(
      saveReviewedSolutions(IMPL, [reviewed()], "signed-sow.pdf", ACTOR),
    ).rejects.toThrow("Could not save the reviewed solutions. Nothing has been changed.");
  });
});
