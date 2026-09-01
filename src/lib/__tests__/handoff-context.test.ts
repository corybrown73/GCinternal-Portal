import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The read the whole handoff rests on, against the shapes production actually
 * stores.
 *
 * WHY A FAKE THAT REALLY FILTERS. The bug this file exists to catch is not a
 * wrong return shape, it is a wrong filter: `work_items` was once queried on a
 * `stage_key` column that does not exist, PostgREST returned an error, the
 * error was discarded, and an empty result read as "nothing to report". So the
 * fake below applies `eq`/`neq`/`in` for real and throws on a column no seeded
 * row has. A filter typo fails here instead of silently returning nothing.
 *
 * The seed rows are copied from production: Ridgeline Excavation (one Gong
 * report, no SOW, no owner, no project) and Delta Water Works (a new_logo
 * project with eight stages and seven open customer tasks).
 */

type Row = Record<string, any>;

const h = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, Row[]>,
    signedUrl: null as string | null,
    signError: false,
    db: null as any,
  };

  const applies = (row: Row, col: string, op: string, val: any) => {
    if (!(col in row)) {
      throw new Error(`column "${col}" does not exist on this row`);
    }
    if (op === "eq") return row[col] === val;
    if (op === "neq") return row[col] !== val;
    if (op === "in") return (val as any[]).includes(row[col]);
    throw new Error(`unsupported op ${op}`);
  };

  state.db = {
    from(table: string) {
      const filters: Array<{ col: string; op: string; val: any }> = [];
      let order: { col: string; asc: boolean } | null = null;
      let limit: number | null = null;
      let headCount = false;
      let columns: string | null = null;

      const rows = () => {
        // A table nobody seeded is an empty table, not a crash: production has
        // several of these (requirements, risks) and the code must cope.
        let out = (state.tables[table] ?? []).filter((r) =>
          filters.every((f) => applies(r, f.col, f.op, f.val)),
        );
        // PostgREST returns only the columns asked for. Modelling that is the
        // point: a select that forgets a column it later reads gets `undefined`
        // here, exactly as it would in production.
        if (columns && columns !== "*") {
          const keep = columns.split(",").map((c) => c.trim());
          out = out.map((r) => Object.fromEntries(keep.map((c) => [c, r[c]])));
        }
        if (order) {
          const { col, asc } = order;
          out = [...out].sort((a, b) =>
            a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1),
          );
        }
        if (limit !== null) out = out.slice(0, limit);
        return out;
      };

      const settled = () =>
        headCount
          ? { data: null, count: rows().length, error: null }
          : { data: rows(), error: null };

      const builder: any = {
        select: (cols?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) headCount = true;
          if (cols) columns = cols;
          return builder;
        },
        eq: (col: string, val: any) => (filters.push({ col, op: "eq", val }), builder),
        neq: (col: string, val: any) => (filters.push({ col, op: "neq", val }), builder),
        in: (col: string, val: any[]) => (filters.push({ col, op: "in", val }), builder),
        order: (col: string, o?: { ascending?: boolean }) => (
          (order = { col, asc: o?.ascending !== false }),
          builder
        ),
        limit: (n: number) => ((limit = n), builder),
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then: (res: any) => Promise.resolve(settled()).then(res),
      };
      return builder;
    },
    storage: {
      from: () => ({
        createSignedUrl: async () => {
          if (state.signError) throw new Error("bucket unreachable");
          return { data: state.signedUrl ? { signedUrl: state.signedUrl } : null };
        },
      }),
    },
  };
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));

import { loadHandoffContext } from "../server/handoff-context";

const RIDGELINE = "4494053a-c3f0-4828-b292-781c6b64f45d";
const DELTA = "22a9f075-2917-44c4-aa24-5795944dfd83";
const DELTA_CUSTOMER = "701ce470-d908-453e-901c-e9a3396d34a6";
const DELTA_IMPL = "1ef1f947-b968-4584-aee5-32996e2d36d1";
const STAGE_BUILD = "e42691ff-e552-48bd-a5f3-7937bd01b500";
const STAGE_VALIDATE = "168c6b83-4252-45fb-9aa8-a2d815c56a68";

/** Every column `portal_accounts` is read for, so the fake's guard is honest. */
const account = (over: Row): Row => ({
  id: "",
  name: "",
  stage: "prospect",
  domain: null,
  arr: null,
  products: [],
  summary: null,
  primary_contact_name: null,
  primary_contact_email: null,
  primary_contact_role: null,
  am_owner_id: null,
  se_owner_id: null,
  customer_id: null,
  created_at: "2026-01-05T00:00:00Z",
  sow_reference: null,
  sow_signed_date: null,
  sow_value: null,
  sow_document_name: null,
  sow_document_url: null,
  sow_document_path: null,
  ...over,
});

/** Seeded rows, reached without index-signature noise at every call site. */
const seeded = (table: string): Row[] => h.tables[table] as Row[];
/** The Ridgeline row, which several tests amend to add a SOW. */
const ridgeline = (): Row => seeded("portal_accounts")[0] as Row;

beforeEach(() => {
  h.signedUrl = null;
  h.signError = false;
  h.tables = {
    portal_accounts: [
      account({ id: RIDGELINE, name: "Ridgeline Excavation", stage: "prospect" }),
      account({
        id: DELTA,
        name: "Delta Water Works",
        stage: "onboarding_kickoff",
        customer_id: DELTA_CUSTOMER,
        am_owner_id: "am-1",
        se_owner_id: "se-1",
      }),
    ],
    team_members: [
      { id: "am-1", name: "Dana Reyes" },
      { id: "se-1", name: "Cory Brown" },
      { id: "lead-1", name: "Priya Nair" },
    ],
    portal_gong_reports: [
      {
        account_id: RIDGELINE,
        title: "Call Review",
        report_type: "call_notes",
        content_md: "Account Brief: Nadel\n1. CUSTOMER\nNadel is a third-party logistics company.",
        created_at: "2026-02-01T10:00:00Z",
      },
    ],
    portal_onboarding_notes: [
      {
        account_id: DELTA,
        body_md: "Crew wants the form on iPads, not phones.",
        review_status: "reviewed",
        created_at: "2026-02-10T10:00:00Z",
      },
      {
        account_id: DELTA,
        body_md: "Unreviewed scratch note — must not reach the model.",
        review_status: "needs_review",
        created_at: "2026-02-11T10:00:00Z",
      },
    ],
    implementations: [
      {
        id: DELTA_IMPL,
        customer_id: DELTA_CUSTOMER,
        name: "Delta Water Works",
        journey_type: "new_logo",
        target_launch_date: null,
        owner_id: "lead-1",
        created_at: "2026-02-05T00:00:00Z",
      },
    ],
    stage_instances: [
      {
        id: STAGE_VALIDATE,
        implementation_id: DELTA_IMPL,
        name: "Validate / Iterate",
        target_duration_days: null,
        position: 5,
      },
      {
        id: STAGE_BUILD,
        implementation_id: DELTA_IMPL,
        name: "Build",
        target_duration_days: null,
        position: 4,
      },
    ],
    work_items: [
      {
        implementation_id: DELTA_IMPL,
        title: "Review the first form",
        stage_instance_id: STAGE_BUILD,
        due_at: null,
        position: 1,
        party: "customer",
        status: "not_started",
      },
      {
        implementation_id: DELTA_IMPL,
        title: "Sign off testing",
        stage_instance_id: STAGE_VALIDATE,
        due_at: null,
        position: 2,
        party: "customer",
        status: "not_started",
      },
      {
        implementation_id: DELTA_IMPL,
        title: "Internal QA sweep",
        stage_instance_id: STAGE_BUILD,
        due_at: null,
        position: 3,
        party: "internal",
        status: "not_started",
      },
      {
        implementation_id: DELTA_IMPL,
        title: "Already handled",
        stage_instance_id: STAGE_BUILD,
        due_at: null,
        position: 4,
        party: "customer",
        status: "done",
      },
    ],
    technical_solutions: [{ implementation_id: DELTA_IMPL, title: "Daily Water Haul Ticket" }],
  };
});

describe("a deal that has not been handed off", () => {
  it("reports every gap rather than returning a confident empty deck", async () => {
    const ctx = (await loadHandoffContext(RIDGELINE))!;

    expect(ctx.deal.name).toBe("Ridgeline Excavation");
    expect(ctx.project).toBeNull();
    expect(ctx.priorImplementations).toBe(0);

    const gaps = ctx.gaps.join(" ");
    expect(gaps).toContain("No SOW is recorded");
    expect(gaps).toContain("Nobody is assigned");
    expect(gaps).toContain("No project exists yet");
    // It has a call, so that gap must NOT be raised — the negative control on
    // a list that would otherwise be easy to over-report.
    expect(gaps).not.toContain("No call notes");
  });

  it("hands the call over verbatim, not summarised", async () => {
    const ctx = (await loadHandoffContext(RIDGELINE))!;
    expect(ctx.callNotes).toHaveLength(1);
    const call = ctx.callNotes[0]!;
    expect(call.kind).toBe("call_notes");
    expect(call.markdown).toBe((seeded("portal_gong_reports")[0] as Row)["content_md"]);
  });

  it("is null for a deal that does not exist", async () => {
    expect(await loadHandoffContext("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("a deal with a project", () => {
  it("resolves each customer task to its stage name", async () => {
    const ctx = (await loadHandoffContext(DELTA))!;
    const tasks = ctx.project!.openCustomerTasks;

    // The join that matters: `stage_instances` must be selected WITH its id or
    // every task resolves to "—".
    expect(tasks.map((t) => [t.title, t.stage])).toEqual([
      ["Review the first form", "Build"],
      ["Sign off testing", "Validate / Iterate"],
    ]);
    expect(tasks.every((t) => t.stage !== "—")).toBe(true);
  });

  it("leaves out internal and finished work", async () => {
    const ctx = (await loadHandoffContext(DELTA))!;
    const titles = ctx.project!.openCustomerTasks.map((t) => t.title);
    expect(titles).not.toContain("Internal QA sweep");
    expect(titles).not.toContain("Already handled");
  });

  it("orders stages by position and carries the project's own facts", async () => {
    const ctx = (await loadHandoffContext(DELTA))!;
    expect(ctx.project!.stages.map((s) => s.name)).toEqual(["Build", "Validate / Iterate"]);
    expect(ctx.project!.journeyType).toBe("new_logo");
    expect(ctx.project!.lead).toBe("Priya Nair");
    expect(ctx.project!.solutions).toEqual(["Daily Water Haul Ticket"]);
    // Tables with no rows are empty lists, not a failed read.
    expect(ctx.project!.requirements).toEqual([]);
    expect(ctx.project!.openRisks).toEqual([]);
  });

  it("does not count its own project as prior work", async () => {
    const ctx = (await loadHandoffContext(DELTA))!;
    expect(ctx.priorImplementations).toBe(0);
  });

  it("counts a second project for the same customer as prior work", async () => {
    seeded("implementations").push({
      id: "impl-2",
      customer_id: DELTA_CUSTOMER,
      name: "Delta Water Works — QuickBooks",
      journey_type: "integration",
      target_launch_date: null,
      owner_id: null,
      created_at: "2026-03-01T00:00:00Z",
    });
    const ctx = (await loadHandoffContext(DELTA))!;
    expect(ctx.priorImplementations).toBe(1);
  });

  it("passes on reviewed notes only", async () => {
    const ctx = (await loadHandoffContext(DELTA))!;
    expect(ctx.notes.map((n) => n.markdown)).toEqual(["Crew wants the form on iPads, not phones."]);
  });

  it("names both owners so the team slide has people on it", async () => {
    const ctx = (await loadHandoffContext(DELTA))!;
    expect(ctx.deal.amOwner).toBe("Dana Reyes");
    expect(ctx.deal.seOwner).toBe("Cory Brown");
    expect(ctx.gaps.join(" ")).not.toContain("Nobody is assigned");
  });
});

describe("the SOW", () => {
  it("signs an uploaded file rather than exposing a permanent link", async () => {
    ridgeline()["sow_document_path"] = "sow/ridgeline.pdf";
    ridgeline()["sow_document_name"] = "Ridgeline SOW.pdf";
    h.signedUrl = "https://signed.example/sow.pdf?token=abc";

    const ctx = (await loadHandoffContext(RIDGELINE))!;
    expect(ctx.sow.uploaded).toBe(true);
    expect(ctx.sow.documentUrl).toBe("https://signed.example/sow.pdf?token=abc");
    expect(ctx.gaps.join(" ")).not.toContain("No SOW is recorded");
  });

  it("survives a storage failure instead of taking the whole read down", async () => {
    ridgeline()["sow_document_path"] = "sow/ridgeline.pdf";
    h.signError = true;

    const ctx = (await loadHandoffContext(RIDGELINE))!;
    expect(ctx).not.toBeNull();
    expect(ctx.sow.documentUrl).toBeNull();
    // The SOW exists even though the link could not be made, so this is still
    // not a "no SOW" gap — the model must not be told the contract is absent.
    expect(ctx.gaps.join(" ")).not.toContain("No SOW is recorded");
  });

  it("counts a pasted URL as a recorded SOW", async () => {
    ridgeline()["sow_document_url"] = "https://drive.example/sow";
    const ctx = (await loadHandoffContext(RIDGELINE))!;
    expect(ctx.sow.uploaded).toBe(false);
    expect(ctx.sow.documentUrl).toBe("https://drive.example/sow");
    expect(ctx.gaps.join(" ")).not.toContain("No SOW is recorded");
  });
});
