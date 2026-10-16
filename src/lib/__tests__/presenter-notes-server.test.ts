import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The server rules for presenter selections, run against a stubbed database.
 * Each test sets the rows the database would hold and checks what the server
 * does with them: refuse an exception, refuse a note from another implementation
 * or organisation, and write the organisation and profile it read itself, never
 * the ones a request could claim.
 */

const { state, builder } = vi.hoisted(() => {
  type Call = { table: string; op: string; filters: unknown[][]; payload?: unknown };
  const state = {
    rows: {} as Record<string, unknown>,
    inserts: [] as Call[],
    deletes: [] as Call[],
    insertError: null as { code?: string; message: string } | null,
    // Tables the stub reports as missing, as PostgREST does before a migration.
    missing: {} as Record<string, { message: string }>,
  };
  const single = (table: string, filters: unknown[][]) => {
    if (state.missing[table]) return { data: null, error: state.missing[table] };
    const row = state.rows[table];
    if (!row) return { data: null, error: null };
    const list = Array.isArray(row) ? row : [row];
    const hit = list.find((r) =>
      filters.every(([op, col, val]) => {
        if (op === "eq")
          return String((r as Record<string, unknown>)[col as string]) === String(val);
        if (op === "in")
          return (val as unknown[])
            .map(String)
            .includes(String((r as Record<string, unknown>)[col as string]));
        return true;
      }),
    );
    return { data: hit ?? null, error: null };
  };
  const builder = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    const b: Record<string, unknown> = {};
    const finish = () => {
      if (call.op === "insert") {
        state.inserts.push({ ...call, payload: call.payload });
        return { data: null, error: state.insertError };
      }
      if (call.op === "delete") {
        state.deletes.push({ ...call });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    };
    for (const name of [
      "select",
      "eq",
      "is",
      "in",
      "order",
      "limit",
      "maybeSingle",
      "insert",
      "delete",
    ]) {
      b[name] = (...args: unknown[]) => {
        if (name === "insert" || name === "delete") {
          call.op = name;
          call.payload = args[0];
          return name === "insert" ? Promise.resolve(finish()) : b;
        }
        if (name === "maybeSingle") return Promise.resolve(single(table, call.filters));
        if (name !== "select" && name !== "order" && name !== "limit")
          call.filters.push([name, ...args]);
        return b;
      };
    }
    // Deletes and selects that end without maybeSingle resolve through `then`.
    b["then"] = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(call.op === "delete" ? finish() : single(table, call.filters)).then(
        resolve,
        reject,
      );
    return b;
  };
  return { state, builder };
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => builder(table) },
}));

import {
  addPresenterNoteFor,
  notesFeatures,
  removePresenterNoteFor,
} from "../presenter-notes.server";

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-0000000000b2";
const PROFILE = "00000000-0000-4000-8000-0000000000a1";
const DEAL = "00000000-0000-4000-8000-0000000000d1";
const IMPL = "00000000-0000-4000-8000-0000000000e1";
const OTHER_IMPL = "00000000-0000-4000-8000-0000000000e2";
const NOTE = "00000000-0000-4000-8000-0000000000f1";

function seed(overrides: { deal?: object; impl?: object; entry?: object; profile?: object } = {}) {
  state.rows = {
    portal_profiles: { id: PROFILE, org_id: ORG, ...(overrides.profile ?? {}) },
    portal_accounts: { id: DEAL, org_id: ORG, ...(overrides.deal ?? {}) },
    implementations: { id: IMPL, org_id: ORG, deal_id: DEAL, ...(overrides.impl ?? {}) },
    journal_entries: {
      id: NOTE,
      implementation_id: IMPL,
      org_id: ORG,
      kind: "note",
      ...(overrides.entry ?? {}),
    },
  };
}

beforeEach(() => {
  state.missing = {};
  state.inserts.length = 0;
  state.deletes.length = 0;
  state.insertError = null;
  seed();
});

describe("selecting a note for the presenter view", () => {
  it("stores the selection with the organisation and profile the server read", async () => {
    await addPresenterNoteFor(DEAL, NOTE, PROFILE);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]?.payload).toEqual({
      org_id: ORG,
      profile_id: PROFILE,
      deal_id: DEAL,
      journal_entry_id: NOTE,
    });
  });

  it("refuses an exception record", async () => {
    seed({ entry: { kind: "scope" } });
    await expect(addPresenterNoteFor(DEAL, NOTE, PROFILE)).rejects.toThrow(
      "Exception records cannot be selected",
    );
    expect(state.inserts).toHaveLength(0);
  });

  it("accepts a customer meeting, which is not an exception", async () => {
    seed({ entry: { kind: "customer_meeting" } });
    await expect(addPresenterNoteFor(DEAL, NOTE, PROFILE)).resolves.toEqual({ ok: true });
  });

  it("refuses a note on another implementation, with the same reply as a missing note", async () => {
    seed({ entry: { implementation_id: OTHER_IMPL } });
    await expect(addPresenterNoteFor(DEAL, NOTE, PROFILE)).rejects.toThrow(
      "that note is not on this deal's implementation",
    );
  });

  it("refuses a note from another organisation", async () => {
    seed({ entry: { org_id: OTHER_ORG } });
    await expect(addPresenterNoteFor(DEAL, NOTE, PROFILE)).rejects.toThrow(
      "that note is not on this deal's implementation",
    );
  });

  it("refuses a deal outside the caller's organisation", async () => {
    seed({ deal: { org_id: OTHER_ORG } });
    await expect(addPresenterNoteFor(DEAL, NOTE, PROFILE)).rejects.toThrow(
      "that deal is not in your organisation",
    );
  });

  it("refuses when the deal has no implementation yet", async () => {
    seed();
    state.rows["implementations"] = null;
    await expect(addPresenterNoteFor(DEAL, NOTE, PROFILE)).rejects.toThrow(
      "no implementation record yet",
    );
  });

  it("treats a repeated selection as already done", async () => {
    state.insertError = { code: "23505", message: "duplicate key" };
    await expect(addPresenterNoteFor(DEAL, NOTE, PROFILE)).resolves.toEqual({ ok: true });
  });

  it("refuses a caller whose login has no organisation", async () => {
    seed({ profile: { org_id: null } });
    await expect(addPresenterNoteFor(DEAL, NOTE, PROFILE)).rejects.toThrow(
      "not linked to an organisation",
    );
  });
});

describe("removing a selection", () => {
  it("deletes only the selection, scoped to this caller and deal", async () => {
    await removePresenterNoteFor(DEAL, NOTE, PROFILE);
    expect(state.deletes).toHaveLength(1);
    const filters = state.deletes[0]?.filters ?? [];
    expect(filters).toEqual(
      expect.arrayContaining([
        ["eq", "deal_id", DEAL],
        ["eq", "profile_id", PROFILE],
        ["eq", "journal_entry_id", NOTE],
      ]),
    );
    // Nothing is deleted from the journal: the only table written is the selections.
    expect(state.deletes.every((d) => d.table === "presenter_note_picks")).toBe(true);
  });
});

describe("which notes features this database serves", () => {
  it("offers both when the migrations are in place", async () => {
    await expect(notesFeatures()).resolves.toEqual({
      customerMeetings: true,
      presenterSelections: true,
    });
  });

  it("offers no customer meetings before 0087 adds the meeting fields", async () => {
    state.missing["journal_entries"] = {
      message: "column journal_entries.meeting_date does not exist",
    };
    await expect(notesFeatures()).resolves.toEqual({
      customerMeetings: false,
      presenterSelections: true,
    });
  });

  it("offers no presenter selections before 0088 creates the table", async () => {
    state.missing["presenter_note_picks"] = {
      message: 'relation "presenter_note_picks" does not exist',
    };
    await expect(notesFeatures()).resolves.toEqual({
      customerMeetings: true,
      presenterSelections: false,
    });
  });
});
