import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The opportunity's notes on the deal: one row per opportunity, a replay
 * adds nothing, an edited Description replaces the text.
 */
const h = vi.hoisted(() => {
  const state = { supabase: { client: null as any }, forward: null as any };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));

import {
  OPPORTUNITY_NOTES_TITLE,
  opportunityNotesTitle,
  storeOpportunityNotes,
} from "../server/opportunity-notes";

const DEAL = "22222222-2222-4222-8222-222222222222";
const OPP = "0066g00000AbCdEfAAA";

const rows: Rows = { portal_gong_reports: [] };
let fake: ReturnType<typeof createFakeSupabase>;
const reports = () => fake.store["portal_gong_reports"]!;

beforeEach(() => {
  fake = createFakeSupabase(rows);
  h.supabase.client = fake.client;
});

describe("storeOpportunityNotes", () => {
  it("files the notes once, per opportunity, and ignores a replay", async () => {
    expect(
      await storeOpportunityNotes(DEAL, " Closed won. 3 crews. ", { opportunityId: OPP }),
    ).toEqual({ stored: true, replaced: false });
    expect(reports()).toHaveLength(1);
    expect(reports()[0]).toMatchObject({
      account_id: DEAL,
      report_type: "call_notes",
      title: `${OPPORTUNITY_NOTES_TITLE} [sf:${OPP}]`,
      content_md: "Closed won. 3 crews.",
      uploaded_by: null,
    });
    expect(
      await storeOpportunityNotes(DEAL, "Closed won. 3 crews.", { opportunityId: OPP }),
    ).toEqual({ stored: false, replaced: false });
    expect(reports()).toHaveLength(1);
  });

  it("replaces the text when the Description was edited, rather than adding a stale twin", async () => {
    await storeOpportunityNotes(DEAL, "first", { opportunityId: OPP });
    expect(await storeOpportunityNotes(DEAL, "second", { opportunityId: OPP })).toEqual({
      stored: true,
      replaced: true,
    });
    expect(reports()).toHaveLength(1);
    expect(reports()[0]!.content_md).toBe("second");
  });

  it("keeps two opportunities apart, and a sender without an id to one row per deal", async () => {
    await storeOpportunityNotes(DEAL, "a", { opportunityId: OPP });
    await storeOpportunityNotes(DEAL, "b", { opportunityId: "0066g00000ZzZzZzAAA" });
    await storeOpportunityNotes(DEAL, "c");
    await storeOpportunityNotes(DEAL, "d");
    expect(reports().map((r) => [r.title, r.content_md])).toEqual([
      [opportunityNotesTitle(OPP), "a"],
      [opportunityNotesTitle("0066g00000ZzZzZzAAA"), "b"],
      [OPPORTUNITY_NOTES_TITLE, "d"],
    ]);
  });

  it("stores nothing for blank notes", async () => {
    expect(await storeOpportunityNotes(DEAL, "   ")).toEqual({ stored: false, replaced: false });
    expect(reports()).toHaveLength(0);
  });
});
