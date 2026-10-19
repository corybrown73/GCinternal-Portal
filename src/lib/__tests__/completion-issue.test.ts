import { beforeEach, describe, expect, it, vi } from "vitest";

/* Issuing a completion record, end to end, against an in-memory stand-in for
 * the database. Every row is disposable test data; every internal value
 * starts with INTERNAL or OTHER so that a leak is one substring away. */

const fake = vi.hoisted(() => {
  type Row = any;
  type Write = { table: string; op: "insert" | "update"; row: Row; filter?: [string, unknown] };
  const state = {
    tables: {} as any,
    writes: [] as Write[],
    emitted: [] as Row[],
    audited: [] as Row[],
    nextId: 1,
  };

  function queryFor(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    const rows = () => (state.tables[table] ?? []).filter((r: Row) => filters.every((f) => f(r)));
    const builder: Record<string, any> = {
      select: () => builder,
      eq: (col: string, v: unknown) => {
        filters.push((r) => r[col] === v);
        return builder;
      },
      in: (col: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[col]));
        return builder;
      },
      order: () => builder,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      insert: (row: Row) => {
        const id = `new-${state.nextId++}`;
        const version =
          (state.tables[table] ?? []).filter((r: Row) => r.subject_id === row.subject_id).length +
          1;
        state.writes.push({ table, op: "insert", row: { id, version, ...row } });
        return {
          select: () => ({
            single: async () => ({ data: { id, version }, error: null }),
            maybeSingle: async () => ({ data: { id }, error: null }),
          }),
        };
      },
      update: (row: Row) => ({
        eq: async (col: string, v: unknown) => {
          state.writes.push({ table, op: "update", row, filter: [col, v] });
          return { error: null };
        },
      }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    };
    return builder;
  }

  return { state, from: queryFor };
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: fake.from },
}));

vi.mock("../app-url", () => ({ appUrl: () => "https://portal.test" }));

vi.mock("../server/events", () => ({
  emitEvent: async (event: Record<string, unknown>) => {
    fake.state.emitted.push(event);
  },
}));

vi.mock("../server/audit", () => ({
  audit: async (entry: Record<string, unknown>) => {
    fake.state.audited.push(entry);
  },
}));

import { hashToken } from "../server/plan-tokens";
import { generateCompletionRecord } from "../completion.server";

const { state } = fake;

const EXPECTED_EVENT_KEYS = [
  "completion_record_id",
  "version",
  "subject_type",
  "title",
  "customer_name",
  "completed_at",
  "salesforce_account_id",
  "salesforce_opportunity_id",
  "note_title",
  "note_body",
  "document_url",
  "document_filename",
];

const INTERNAL_MARKERS = [
  "INTERNAL",
  "OTHER-",
  "Kickoff held",
  "discount",
  "tm-1",
  "tm-2",
  "Stage comment",
];

function seed() {
  state.tables = {
    customers: [{ id: "cust-1", name: "Northwind Fleet" }],
    implementations: [
      {
        id: "impl-1",
        name: "Field inspections rollout",
        customer_id: "cust-1",
        contract_start_date: "2026-01-06",
        created_at: "2025-12-01T00:00:00Z",
        go_live_at: "2026-04-01T09:00:00Z",
        actual_launch_date: null,
        salesforce_opportunity_id: "006TESTOPP0000001",
        sales_owner: "INTERNAL-SALES-OWNER",
      },
      {
        id: "impl-2",
        name: "Other project",
        customer_id: "cust-1",
        contract_start_date: "2026-02-01",
        created_at: "2026-01-15T00:00:00Z",
        go_live_at: null,
        actual_launch_date: null,
        salesforce_opportunity_id: null,
      },
    ],
    implementation_stage_history: [
      {
        implementation_id: "impl-1",
        stage: "graduate-to-cs",
        entered_at: "2026-02-01T00:00:00Z",
        exited_at: "2026-02-10T00:00:00Z",
        entered_by: "tm-1",
        notes: "INTERNAL-STAGE-COMMENT: champion is leaving",
        advanced_with_gaps: true,
      },
      {
        implementation_id: "impl-2",
        stage: "graduate-to-cs",
        entered_at: "2026-02-01T00:00:00Z",
        exited_at: null,
        entered_by: "tm-2",
        notes: "OTHER-STAGE-COMMENT",
        advanced_with_gaps: false,
      },
    ],
    commitments: [
      {
        implementation_id: "impl-1",
        description: "Deliver the asset list by 1 June",
        committed_to: "customer",
        status: "open",
        made_at: "2026-03-01T00:00:00Z",
        due_date: "2026-06-01",
        fulfilled_at: null,
        owner_id: "tm-1",
      },
      {
        implementation_id: "impl-1",
        description: "INTERNAL-COMMITMENT: fix the rate limit before go-live",
        committed_to: "internal",
        status: "open",
        made_at: "2026-03-02T00:00:00Z",
        due_date: null,
        fulfilled_at: null,
        owner_id: "tm-2",
      },
      {
        implementation_id: "impl-2",
        description: "OTHER-PROJECT-PROMISE",
        committed_to: "customer",
        status: "open",
        made_at: "2026-03-03T00:00:00Z",
        due_date: null,
        fulfilled_at: null,
        owner_id: null,
      },
    ],
    work_items: [
      {
        implementation_id: "impl-1",
        title: "Kickoff held",
        status: "done",
        visibility: "internal",
        party: "internal",
        stage_instance_id: "si-1",
        position: 1,
      },
      {
        implementation_id: "impl-1",
        title: "Data sample received",
        status: "open",
        visibility: "shared",
        party: "customer",
        stage_instance_id: "si-1",
        position: 2,
      },
      {
        implementation_id: "impl-1",
        title: "INTERNAL-TASK: negotiate the discount",
        status: "open",
        visibility: "internal",
        party: "internal",
        stage_instance_id: "si-2",
        position: 3,
      },
      {
        implementation_id: "impl-2",
        title: "OTHER-PROJECT-TASK",
        status: "open",
        visibility: "shared",
        party: "customer",
        stage_instance_id: "si-3",
        position: 1,
      },
    ],
    stage_instances: [
      { id: "si-1", implementation_id: "impl-1", stage_key: "graduate-to-cs" },
      { id: "si-2", implementation_id: "impl-1", stage_key: "graduate-to-cs" },
      { id: "si-3", implementation_id: "impl-2", stage_key: "graduate-to-cs" },
    ],
    technical_solutions: [
      {
        id: "sol-1",
        implementation_id: "impl-1",
        title: "Dispatch → ERP work order sync",
        status: "validated",
        created_at: "2026-02-14T00:00:00Z",
        design_summary: "INTERNAL-DESIGN: reads the nightly job",
        configuration_details: "INTERNAL-CONFIG: endpoint and vault path",
        owner_id: "tm-2",
      },
    ],
    technical_solution_notes: [
      { technical_solution_id: "sol-1", content: "INTERNAL-BUILD-NOTE: vendor workaround" },
    ],
    team_members: [
      { id: "tm-1", name: "INTERNAL-STAFF-ONE" },
      { id: "tm-2", name: "INTERNAL-STAFF-TWO" },
    ],
    // A historical record issued before this change. It must not be touched.
    completion_records: [
      {
        id: "hist-1",
        implementation_id: "impl-1",
        subject_type: "implementation",
        subject_id: "impl-1",
        version: 1,
        title: "Field inspections rollout",
        content: { marker: "HISTORICAL-CONTENT-KEEP" },
        summary_text: "HISTORICAL-SUMMARY-KEEP",
        share_token_hash: "historical-hash-keep",
      },
    ],
  };
  state.writes = [];
  state.emitted = [];
  state.audited = [];
}

const issuedRow = () =>
  state.writes.find((w) => w.table === "completion_records" && w.op === "insert")!.row;

beforeEach(() => {
  seed();
});

describe("issuing an implementation completion record", () => {
  it("stores a public document with only the approved facts", async () => {
    const result = await generateCompletionRecord({
      subject: { type: "implementation", id: "impl-1" },
      actorProfileId: "profile-1",
    });
    expect(result.issued).toBe(true);

    const content = JSON.stringify(issuedRow().content);
    expect(content).toContain("Deliver the asset list by 1 June");
    expect(content).toContain("Data sample received");
    expect(content).toContain('"title":"Complete"');
    for (const marker of INTERNAL_MARKERS) expect(content).not.toContain(marker);
  });

  it("keeps the same filtered text in the Salesforce note body and the stored summary", async () => {
    await generateCompletionRecord({ subject: { type: "implementation", id: "impl-1" } });
    const row = issuedRow();
    const event = state.emitted[0]!;

    expect(event.payload.note_body).toBe(row.summary_text);
    expect(row.summary_text).toContain("• Deliver the asset list by 1 June");
    for (const marker of INTERNAL_MARKERS) expect(row.summary_text).not.toContain(marker);
  });

  it("never reads the internal tables or the staff directory into the record", async () => {
    await generateCompletionRecord({ subject: { type: "implementation", id: "impl-1" } });
    const content = JSON.stringify(issuedRow().content);
    expect(content).not.toContain("INTERNAL-SALES-OWNER");
    expect(content).not.toContain("INTERNAL-STAFF");
    expect(content).not.toContain("INTERNAL-STAGE-COMMENT");
  });

  it("keeps the required Salesforce event fields and the link that the consumer depends on", async () => {
    const result = await generateCompletionRecord({
      subject: { type: "implementation", id: "impl-1" },
    });
    if (!result.issued) throw new Error("expected a record");

    expect(state.emitted).toHaveLength(1);
    const event = state.emitted[0]!;
    expect(event.event_type).toBe("completion.recorded");
    expect(event.dedupe_key).toBe(`cr:${result.id}`);
    expect(Object.keys(event.payload).sort()).toEqual([...EXPECTED_EVENT_KEYS].sort());

    // Unchanged from before: the opportunity id is carried, the account id is
    // not yet read from its real column (tracked separately).
    expect(event.payload.salesforce_opportunity_id).toBe("006TESTOPP0000001");
    expect(event.payload.salesforce_account_id).toBeNull();

    expect(event.payload.document_url).toBe(result.url);
    expect(event.payload.note_body).toContain(`Full record: ${result.url}`);
    expect(event.payload.note_title).toBe("Completion record — Field inspections rollout");
    expect(event.payload.document_filename).toBe(
      "Northwind Fleet — Field inspections rollout — completion record.pdf",
    );
  });

  it("links the stored token hash to the URL in the event, so the PDF route can find it", async () => {
    const result = await generateCompletionRecord({
      subject: { type: "implementation", id: "impl-1" },
    });
    if (!result.issued) throw new Error("expected a record");
    const token = result.url.split("/").pop()!;
    expect(issuedRow().share_token_hash).toBe(hashToken(token));
  });

  it("files the link in the account's attachments, pointing at the same URL", async () => {
    const result = await generateCompletionRecord({
      subject: { type: "implementation", id: "impl-1" },
    });
    if (!result.issued) throw new Error("expected a record");
    const file = state.writes.find((w) => w.table === "account_files")!;
    expect(file.row.external_url).toBe(result.url);
    expect(file.row.implementation_id).toBe("impl-1");
  });
});

describe("issuing a solution completion record", () => {
  it("withholds every internal part of a solution and keeps its title and dates", async () => {
    const result = await generateCompletionRecord({
      subject: { type: "solution", id: "sol-1" },
    });
    if (!result.issued) throw new Error("expected a record");

    const row = issuedRow();
    expect(row.subject_type).toBe("solution");
    expect(row.title).toBe("Dispatch → ERP work order sync");
    const content = JSON.stringify(row.content);
    expect(content).toContain("Dispatch → ERP work order sync");
    expect(content).toContain("is internal and is not part of this public record");
    for (const marker of INTERNAL_MARKERS) expect(content).not.toContain(marker);
    expect(content).not.toContain("vendor workaround");
    expect(content).not.toContain("endpoint and vault path");

    const event = state.emitted[0]!;
    expect(event.payload.subject_type).toBe("solution");
    expect(event.entity_type).toBe("technical_solution");
    expect(Object.keys(event.payload).sort()).toEqual([...EXPECTED_EVENT_KEYS].sort());
    expect(event.payload.note_body).toContain(`Full record: ${result.url}`);
  });
});

describe("what issuing a record may write", () => {
  it("writes only the new record, its attachment link, the audit row and the outbox event", async () => {
    await generateCompletionRecord({ subject: { type: "implementation", id: "impl-1" } });

    const tables = new Set(state.writes.map((w) => `${w.op}:${w.table}`));
    expect([...tables].sort()).toEqual(
      ["insert:account_files", "insert:completion_records", "update:completion_records"].sort(),
    );
    expect(state.audited).toHaveLength(1);
    expect(state.audited[0]!.action).toBe("completion.recorded");
  });

  it("only ever updates the record it has just created", async () => {
    await generateCompletionRecord({ subject: { type: "implementation", id: "impl-1" } });
    const row = issuedRow();
    const updates = state.writes.filter((w) => w.op === "update");
    expect(updates.length).toBeGreaterThan(0);
    for (const u of updates) expect(u.filter).toEqual(["id", row.id]);
  });

  it("leaves every historical completion record and every source row exactly as they were", async () => {
    const before = structuredClone(state.tables);
    await generateCompletionRecord({ subject: { type: "implementation", id: "impl-1" } });
    await generateCompletionRecord({ subject: { type: "solution", id: "sol-1" } });

    expect(state.tables).toEqual(before);
    expect(state.writes.some((w) => w.filter?.[1] === "hist-1")).toBe(false);
    expect(state.tables.completion_records.find((r: any) => r.id === "hist-1").content).toEqual({
      marker: "HISTORICAL-CONTENT-KEEP",
    });
  });

  it("reports a missing subject without writing anything", async () => {
    const result = await generateCompletionRecord({
      subject: { type: "implementation", id: "does-not-exist" },
    });
    expect(result).toEqual({ issued: false, reason: "the subject no longer exists" });
    expect(state.writes).toHaveLength(0);
    expect(state.emitted).toHaveLength(0);
  });
});
