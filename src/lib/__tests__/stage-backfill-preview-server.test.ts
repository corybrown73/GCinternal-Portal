import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * loadStageBackfillPreview() (stage-backfill-preview.server.ts) is read-only
 * plumbing around the pure preview logic. These tests are about the two
 * things that plumbing itself can get wrong without the pure logic ever
 * being at fault: a failed read silently read as "nothing to review", and
 * a table past PostgREST's own page-size default silently truncated.
 */

type Row = Record<string, any>;

const PAGE_SIZE = 1000;

const h = vi.hoisted(() => {
  const state = {
    // Per table: an array of pages, each {data, error}. Consumed in order as
    // .range() is called again; the last page is reused once exhausted.
    pages: {} as Record<string, Array<{ data: Row[] | null; error: { message: string } | null }>>,
    calls: {} as Record<string, number>,
    // Every .order() call made on each table, in call order — so a test can
    // assert ordering was applied (and with what column/direction) BEFORE
    // .range() ever ran, not just that range ran.
    orderCalls: {} as Record<string, Array<{ column: string; ascending: boolean | undefined }>>,
    db: null as any,
  };

  const nextPage = (table: string) => {
    const queue = state.pages[table] ?? [{ data: [], error: null }];
    const n = state.calls[table] ?? 0;
    state.calls[table] = n + 1;
    return queue[Math.min(n, queue.length - 1)]!;
  };

  state.db = {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        in: () => builder,
        order: (column: string, opts?: { ascending?: boolean }) => {
          (state.orderCalls[table] ??= []).push({ column, ascending: opts?.ascending });
          return builder;
        },
        range: async () => nextPage(table),
      };
      return builder;
    },
  };
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));

import { loadStageBackfillPreview } from "../stage-backfill-preview.server";

const EMPTY_OK = { data: [], error: null };

beforeEach(() => {
  h.pages = {
    implementations: [EMPTY_OK],
    implementation_stage_history: [EMPTY_OK],
    stage_instances: [EMPTY_OK],
    journey_templates: [EMPTY_OK],
    journey_template_stages: [EMPTY_OK],
  };
  h.calls = {};
  h.orderCalls = {};
});

describe("loadStageBackfillPreview — database read errors", () => {
  it("rejects, naming the failing query, rather than treating a failed read as an empty table", async () => {
    h.pages["implementation_stage_history"] = [
      { data: null, error: { message: "connection reset" } },
    ];
    await expect(loadStageBackfillPreview()).rejects.toThrow(
      /implementation_stage_history.*connection reset/,
    );
  });

  it("fails just as clearly when the error happens on a later page, not only the first", async () => {
    h.pages["implementations"] = [
      { data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: `impl-${i}` })), error: null },
      { data: null, error: { message: "statement timeout" } },
    ];
    await expect(loadStageBackfillPreview()).rejects.toThrow(/implementations.*statement timeout/);
  });

  it("names a different query when that one fails instead, never a generic message", async () => {
    h.pages["journey_templates"] = [{ data: null, error: { message: "permission denied" } }];
    await expect(loadStageBackfillPreview()).rejects.toThrow(
      /journey_templates.*permission denied/,
    );
  });
});

describe("loadStageBackfillPreview — pagination past PostgREST's default page size", () => {
  it("fetches a second page rather than silently capping at 1000 rows, for every implementation table", async () => {
    // Page 1: 1000 filler implementations that will not match anything
    // (needs_review, but harmless). Page 2: one more, past the cutoff a
    // single unpaged select would have silently dropped.
    const filler = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      id: `filler-${i}`,
      name: "Filler",
      current_stage: "",
      journey_type: null,
    }));
    h.pages["implementations"] = [
      { data: filler, error: null },
      {
        data: [
          { id: "impl-real", name: "Real Co", current_stage: "handoff", journey_type: "new_logo" },
        ],
        error: null,
      },
    ];
    h.pages["journey_templates"] = [
      {
        data: [
          {
            id: "tpl-1",
            key: "new-logo",
            version: 1,
            name: "New Logo",
            journey_type: "new_logo",
            status: "published",
          },
        ],
        error: null,
      },
    ];
    h.pages["journey_template_stages"] = [
      {
        data: [{ template_id: "tpl-1", stage_key: "handoff", name: "Handoff", position: 1 }],
        error: null,
      },
    ];

    const result = await loadStageBackfillPreview();

    expect(h.calls["implementations"]).toBe(2); // the second page really was requested
    expect(result).toHaveLength(PAGE_SIZE + 1);
    const real = result.find((r) => r.implementationId === "impl-real");
    expect(real).toBeDefined();
    expect(real!.status).toBe("clean");
  });

  it("stops paging as soon as a short page confirms there is no more", async () => {
    h.pages["stage_instances"] = [
      { data: [{ implementation_id: "impl-1", stage_key: "handoff" }], error: null },
    ];
    await loadStageBackfillPreview();
    expect(h.calls["stage_instances"]).toBe(1);
  });
});

describe("loadStageBackfillPreview — deterministic pagination ordering", () => {
  it("orders every paginated table by its own stable, unique id before paging, not left to an unspecified default", async () => {
    await loadStageBackfillPreview();
    for (const table of [
      "implementations",
      "implementation_stage_history",
      "stage_instances",
      "journey_templates",
    ]) {
      expect(h.orderCalls[table]).toEqual([{ column: "id", ascending: true }]);
    }
  });

  it("orders journey_template_stages by id too, once templates exist to fetch stages for", async () => {
    h.pages["journey_templates"] = [
      {
        data: [
          {
            id: "tpl-1",
            key: "new-logo",
            version: 1,
            name: "New Logo",
            journey_type: "new_logo",
            status: "published",
          },
        ],
        error: null,
      },
    ];
    await loadStageBackfillPreview();
    expect(h.orderCalls["journey_template_stages"]).toEqual([{ column: "id", ascending: true }]);
  });

  it("re-applies the same order on every page of a multi-page read, not only the first", async () => {
    const filler = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      id: `filler-${i}`,
      name: "Filler",
      current_stage: "",
      journey_type: null,
    }));
    h.pages["implementations"] = [
      { data: filler, error: null },
      { data: [{ id: "impl-2", name: "Co", current_stage: "", journey_type: null }], error: null },
    ];
    await loadStageBackfillPreview();
    expect(h.calls["implementations"]).toBe(2);
    // .order() is part of the query built fresh each page — called once per
    // page, with the same column and direction both times.
    expect(h.orderCalls["implementations"]).toEqual([
      { column: "id", ascending: true },
      { column: "id", ascending: true },
    ]);
  });
});
