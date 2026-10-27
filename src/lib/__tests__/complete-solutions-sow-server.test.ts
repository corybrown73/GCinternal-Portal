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
 * TIS confirms, a refusal says why, duplicates are skipped, and a failure part
 * way is reported rather than hidden.
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
  it("records each solution, its components, its dependencies and the SOW import", async () => {
    use(baseRows());
    const result = await saveReviewedSolutions(IMPL, [reviewed()], "signed-sow.pdf", ACTOR);
    expect(result.problems).toEqual([]);
    expect(result.created).toEqual([
      { title: "Equipment inspections", components: 2, dependencies: 1 },
    ]);

    const solution = fake.store["complete_solutions"]![0]!;
    expect(solution).toMatchObject({
      title: "Equipment inspections",
      scope: "purchased",
      source: "sow",
      priority: "needed_for_go_live",
      target_date: "2026-11-30",
      original_target_date: "2026-11-30",
    });
    const components = fake.store["solution_components"]!;
    expect(components.map((c) => c.name)).toEqual(["Inspection form", "Dispatch feed"]);
    expect(components[1]).toMatchObject({
      integration_type: "dispatch",
      target_date: "2026-11-16",
    });
    expect(fake.store["solution_component_dependencies"]).toEqual([
      expect.objectContaining({
        component_id: components[1]!.id,
        depends_on_id: components[0]!.id,
        critical: true,
      }),
    ]);
    const kinds = fake.store["solution_events"]!.map((e) => e["kind"]);
    expect(kinds).toEqual(expect.arrayContaining(["created", "sow_import"]));
    expect(
      fake.store["solution_events"]!.find((e) => e["kind"] === "sow_import")!["to_value"],
    ).toBe("signed-sow.pdf");
  });

  it("skips a solution whose name already exists, so a second save never duplicates", async () => {
    use(baseRows());
    await saveReviewedSolutions(IMPL, [reviewed()], "signed-sow.pdf", ACTOR);
    const second = await saveReviewedSolutions(
      IMPL,
      [reviewed({ title: "  equipment INSPECTIONS " })],
      "signed-sow.pdf",
      ACTOR,
    );
    expect(second.created).toEqual([]);
    expect(second.skipped).toEqual([
      {
        title: "equipment INSPECTIONS",
        reason: "A solution with this name already exists on the implementation.",
      },
    ]);
    expect(fake.store["complete_solutions"]).toHaveLength(1);
    expect(fake.store["solution_components"]).toHaveLength(2);
  });

  it("keeps two unrelated solutions from one SOW separate", async () => {
    use(baseRows());
    const result = await saveReviewedSolutions(
      IMPL,
      [
        reviewed(),
        reviewed({
          title: "Fuel log",
          suggestedTarget: null,
          components: [
            {
              category: "forms",
              integrationType: null,
              name: "Fuel form",
              priority: "deliver_during_implementation",
              dependsOn: [],
              critical: false,
              startCondition: null,
              estimateWeeks: null,
              sowQuote: null,
              suggestedTarget: null,
            },
          ],
        }),
      ],
      "signed-sow.pdf",
      ACTOR,
    );
    expect(result.created.map((c) => c.title)).toEqual(["Equipment inspections", "Fuel log"]);
    expect(fake.store["solution_components"]!.map((c) => c.complete_solution_id)).toHaveLength(3);
  });

  it("reports a loop it cannot record, and keeps everything else", async () => {
    use(baseRows());
    const loop = reviewed({
      components: [
        {
          category: "forms",
          integrationType: null,
          name: "A",
          priority: "needed_for_go_live",
          dependsOn: ["B"],
          critical: false,
          startCondition: null,
          estimateWeeks: null,
          sowQuote: null,
          suggestedTarget: null,
        },
        {
          category: "forms",
          integrationType: null,
          name: "B",
          priority: "needed_for_go_live",
          dependsOn: ["A"],
          critical: false,
          startCondition: null,
          estimateWeeks: null,
          sowQuote: null,
          suggestedTarget: null,
        },
      ],
    });
    const result = await saveReviewedSolutions(IMPL, [loop], "signed-sow.pdf", ACTOR);
    expect(result.created).toEqual([
      { title: "Equipment inspections", components: 2, dependencies: 1 },
    ]);
    expect(result.problems.join(" ")).toMatch(/loop/);
  });

  it("reports a component the database refuses, and keeps the solution and the components before it", async () => {
    // A refusal on the second component's insert, as a database unique index
    // would give. (The in-memory client enforces only what it is told to.)
    use(baseRows(), undefined, {
      solution_components: [{ cols: ["complete_solution_id", "name"] }],
    });
    const duplicate = reviewed({
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
          sowQuote: null,
          suggestedTarget: null,
        },
        {
          category: "forms",
          integrationType: null,
          name: "Inspection form",
          priority: "needed_for_go_live",
          dependsOn: [],
          critical: false,
          startCondition: null,
          estimateWeeks: null,
          sowQuote: null,
          suggestedTarget: null,
        },
      ],
    });
    const result = await saveReviewedSolutions(IMPL, [duplicate], "signed-sow.pdf", ACTOR);
    expect(fake.store["complete_solutions"]).toHaveLength(1);
    expect(fake.store["solution_components"]).toHaveLength(1);
    expect(result.created).toEqual([
      { title: "Equipment inspections", components: 1, dependencies: 0 },
    ]);
    expect(result.problems.join(" ")).toMatch(
      /Could not add the component\. Nothing has been changed\./,
    );
  });

  it("does not record a solution with an unnamed component", async () => {
    use(baseRows());
    const result = await saveReviewedSolutions(
      IMPL,
      [
        reviewed({
          components: [
            {
              category: "forms",
              integrationType: null,
              name: "  ",
              priority: "needed_for_go_live",
              dependsOn: [],
              critical: false,
              startCondition: null,
              estimateWeeks: null,
              sowQuote: null,
              suggestedTarget: null,
            },
          ],
        }),
      ],
      "signed-sow.pdf",
      ACTOR,
    );
    expect(fake.store["complete_solutions"]).toEqual([]);
    expect(result.skipped[0]!.reason).toMatch(/no name/);
  });
});
