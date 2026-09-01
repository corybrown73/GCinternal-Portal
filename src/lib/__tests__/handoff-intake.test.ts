import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The write side of the MCP server: creating a deal, filing a transcript, and
 * recording the SOW.
 *
 * WHAT THESE GUARD. These are the only tools that change production data on
 * the word of a model reading a transcript, so the tests are mostly about what
 * they REFUSE — a duplicate company, a field that is somebody else's to set, a
 * signed date in the future, a summary submitted where a transcript belongs.
 * A write tool that accepts everything is a write tool that will eventually
 * put the wrong thing on a real customer's record.
 */

type Row = Record<string, any>;

const h = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, Row[]>,
    inserted: [] as Array<{ table: string; row: Row }>,
    updated: [] as Array<{ table: string; patch: Row; id: string }>,
    audits: [] as Row[],
    db: null as any,
  };

  state.db = {
    from(table: string) {
      const filters: Array<{ col: string; val: any; ci: boolean }> = [];
      let pending: { op: "insert" | "update"; row: Row } | null = null;

      const matching = () =>
        (state.tables[table] ?? []).filter((r) =>
          filters.every(({ col, val, ci }) =>
            ci ? String(r[col] ?? "").toLowerCase() === String(val).toLowerCase() : r[col] === val,
          ),
        );

      const commit = () => {
        if (pending?.op === "insert") {
          const row = { id: `new-${state.inserted.length + 1}`, ...pending.row };
          state.inserted.push({ table, row });
          (state.tables[table] ??= []).push(row);
          return row;
        }
        if (pending?.op === "update") {
          const target = matching()[0];
          state.updated.push({
            table,
            patch: pending.row,
            id: String(target?.["id"] ?? ""),
          });
          if (target) Object.assign(target, pending.row);
          return target ?? null;
        }
        return matching()[0] ?? null;
      };

      const builder: any = {
        select: () => builder,
        eq: (col: string, val: any) => (filters.push({ col, val, ci: false }), builder),
        // ilike with no wildcards is how the duplicate check compares names.
        ilike: (col: string, val: any) => (
          filters.push({ col, val: String(val).replace(/%/g, ""), ci: true }),
          builder
        ),
        limit: () => builder,
        insert: (row: Row) => ((pending = { op: "insert", row }), builder),
        update: (row: Row) => ((pending = { op: "update", row }), builder),
        maybeSingle: () => Promise.resolve({ data: commit(), error: null }),
        then: (res: any) => Promise.resolve({ data: commit(), error: null }).then(res),
      };
      return builder;
    },
  };
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));
vi.mock("../server/audit", () => ({
  audit: async (entry: Row) => {
    h.audits.push(entry);
  },
}));

import { addCallNotes, createDeal, updateDeal } from "../server/handoff-tools";

const EXISTING = "4494053a-c3f0-4828-b292-781c6b64f45d";

beforeEach(() => {
  h.inserted = [];
  h.updated = [];
  h.audits = [];
  h.tables = {
    portal_accounts: [{ id: EXISTING, name: "Ridgeline Excavation", stage: "prospect" }],
    portal_gong_reports: [],
  };
});

describe("create_deal", () => {
  it("creates the deal and hands back the questions to ask next", async () => {
    const out = await createDeal({ name: "Maverick Well Pluggers" });

    expect(out.dealId).toBeTruthy();
    expect(out.name).toBe("Maverick Well Pluggers");
    expect(out.stage).toBe("prospect");

    // The whole point of returning the brief: a deal one second old has nothing
    // in it, so the next move is asking, not generating.
    const keys = out.intake.questions.map((q) => q.key);
    expect(keys).toContain("sponsor");
    expect(keys).toContain("first_workflow");
    expect(out.intake.minimum).toContain("goals");
  });

  it("refuses a company that already exists, and says which deal to use", async () => {
    // Case-insensitively: "ridgeline excavation" is the same company.
    await expect(createDeal({ name: "ridgeline excavation" })).rejects.toThrow(/already exists/i);
    await expect(createDeal({ name: "ridgeline excavation" })).rejects.toThrow(EXISTING);
    expect(h.inserted).toHaveLength(0);
  });

  it("refuses a stage that is not one of the real ones", async () => {
    await expect(createDeal({ name: "New Co", stage: "negotiating" })).rejects.toThrow(
      /Stage must be one of/,
    );
    expect(h.inserted).toHaveLength(0);
  });

  it("refuses a blank name rather than creating an unnamed deal", async () => {
    await expect(createDeal({ name: "   " })).rejects.toThrow(/needs a company name/);
  });

  it("stores blank optional fields as null, not empty strings", async () => {
    await createDeal({ name: "New Co", domain: "  ", primaryContactName: "Sam Vega" });
    const row = h.inserted[0]!.row;
    expect(row["domain"]).toBeNull();
    expect(row["primary_contact_name"]).toBe("Sam Vega");
  });

  it("leaves an audit trail saying it came from the MCP", async () => {
    await createDeal({ name: "New Co" });
    expect(h.audits[0]!["action"]).toBe("deal.created");
    expect((h.audits[0]!["payload"] as Row)["via"]).toBe("mcp");
  });
});

describe("add_call_notes", () => {
  it("files the transcript verbatim", async () => {
    const transcript = "Rep: what does the day look like?\nOps: three crews, all paper.";
    const out = await addCallNotes({
      dealId: EXISTING,
      title: "Discovery call, 12 March",
      markdown: transcript,
    });

    expect(out.filed).toBe(true);
    // Byte-for-byte: nothing trimmed to a summary on the way in, because
    // get_handoff_context is built to hand it back unsummarised.
    expect(h.inserted[0]!.row["content_md"]).toBe(transcript);
    expect(h.inserted[0]!.row["report_type"]).toBe("call_notes");
    expect(h.inserted[0]!.row["account_id"]).toBe(EXISTING);
  });

  it("refuses a kind the enum does not have", async () => {
    await expect(
      addCallNotes({ dealId: EXISTING, title: "T", markdown: "x", kind: "email" }),
    ).rejects.toThrow(/call_notes.*account_map/);
    expect(h.inserted).toHaveLength(0);
  });

  it("refuses to file against a deal that does not exist", async () => {
    await expect(addCallNotes({ dealId: "nope", title: "T", markdown: "x" })).rejects.toThrow(
      /No deal with id/,
    );
  });

  it("refuses an empty transcript and an untitled one", async () => {
    await expect(addCallNotes({ dealId: EXISTING, title: "T", markdown: "  " })).rejects.toThrow(
      /no transcript/i,
    );
    await expect(addCallNotes({ dealId: EXISTING, title: " ", markdown: "x" })).rejects.toThrow(
      /title/i,
    );
  });
});

describe("update_deal", () => {
  it("records the SOW's facts against the right columns", async () => {
    const out = await updateDeal({
      dealId: EXISTING,
      fields: {
        sowReference: "SOW-2026-114",
        sowSignedDate: "2026-03-02",
        sowValue: "$48,000",
        products: "Forms, Dispatch",
      },
    });

    const patch = h.updated[0]!.patch;
    expect(patch["sow_reference"]).toBe("SOW-2026-114");
    expect(patch["sow_signed_date"]).toBe("2026-03-02");
    // "$48,000" is what a person types; a NaN here would be stored as null and
    // read later as "no contract value".
    expect(patch["sow_value"]).toBe(48000);
    expect(patch["products"]).toEqual(["Forms", "Dispatch"]);
    expect(out.updated).toContain("sow_value");
  });

  it("refuses the fields that are the app's to change, and names them", async () => {
    await expect(updateDeal({ dealId: EXISTING, fields: { stage: "closed_won" } })).rejects.toThrow(
      /Not updatable here: stage/,
    );
    await expect(updateDeal({ dealId: EXISTING, fields: { customer_id: "abc" } })).rejects.toThrow(
      /Not updatable here/,
    );
    // Nothing partially applied on the way to the refusal.
    expect(h.updated).toHaveLength(0);
  });

  it("refuses a signed date in the future", async () => {
    const nextYear = new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10);
    await expect(
      updateDeal({ dealId: EXISTING, fields: { sowSignedDate: nextYear } }),
    ).rejects.toThrow(/future/);
  });

  it("refuses a date that is not a date, rather than sending it to Postgres", async () => {
    await expect(
      updateDeal({ dealId: EXISTING, fields: { sowSignedDate: "March 2nd" } }),
    ).rejects.toThrow(/YYYY-MM-DD/);
  });

  it("refuses money that is not a number, and money below zero", async () => {
    await expect(
      updateDeal({ dealId: EXISTING, fields: { arr: "about forty grand" } }),
    ).rejects.toThrow(/must be a number/);
    await expect(updateDeal({ dealId: EXISTING, fields: { arr: -5 } })).rejects.toThrow(
      /cannot be negative/,
    );
  });

  // Caught in review: stripping currency symbols from "about forty grand"
  // leaves "", and Number("") is 0 — so a sentence would have been recorded as
  // a contract worth nothing, on a real customer, silently.
  it("does not turn words into a zero-value contract", async () => {
    for (const words of ["about forty grand", "TBD", "$", "n/a"]) {
      await expect(updateDeal({ dealId: EXISTING, fields: { sowValue: words } })).rejects.toThrow(
        /must be a number/,
      );
    }
    expect(h.updated).toHaveLength(0);
    // The negative control: a real amount with the same symbols still parses.
    await updateDeal({ dealId: EXISTING, fields: { sowValue: "$0" } });
    expect(h.updated[0]!.patch["sow_value"]).toBe(0);
  });

  it("clears a field when given an explicit empty value", async () => {
    await updateDeal({ dealId: EXISTING, fields: { sowReference: "" } });
    expect(h.updated[0]!.patch["sow_reference"]).toBeNull();
  });

  it("refuses an update with nothing in it", async () => {
    await expect(updateDeal({ dealId: EXISTING, fields: {} })).rejects.toThrow(
      /No fields to update/,
    );
  });
});
