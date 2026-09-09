import { describe, expect, it, vi } from "vitest";

import { BRAND } from "@/lib/brand";
import { TEMPLATE_FIELDS } from "@/lib/kickoff-fields";

/**
 * The prompt that goes to claude.ai by hand. It has to be complete on its
 * own — nothing can be looked up from a pasted block of text — so these
 * check the things that, if missing, make the answer wrong: the transcript
 * in full, the field names the renderer accepts, the omit-beats-guess rule,
 * and the design tokens.
 */

const TRANSCRIPT =
  "Rep: what does a day look like?\nOps: three crews, all paper. The office retypes it on Fridays and the invoices go out nine days late.";

vi.mock("../server/handoff-context", () => ({
  loadHandoffContext: async () => ({
    deal: {
      id: "d1",
      name: "Maverick Well Pluggers",
      stage: "closed_won",
      domain: "maverickwp.com",
      arr: 48000,
      products: ["Forms", "Dispatch"],
      summary: null,
      primaryContact: { name: "Dale Whitcombe", email: null, role: "VP Operations" },
      amOwner: "Dana Reyes",
      seOwner: null,
      createdAt: "2026-09-01T00:00:00Z",
    },
    sow: {
      reference: "SOW-2026-114",
      signedDate: "2026-09-02",
      value: 48000,
      documentName: "Maverick SOW.pdf",
      documentUrl: null,
      uploaded: true,
    },
    callNotes: [
      {
        title: "Discovery call",
        kind: "call_notes",
        recordedAt: "2026-08-28T10:00:00Z",
        markdown: TRANSCRIPT,
      },
    ],
    notes: [],
    project: null,
    priorImplementations: 0,
    gaps: ["No project exists yet — there is no plan, no stages and no task list."],
  }),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              intake: {
                forms_built: false,
                industry: "Oil & Gas",
                company_size: "51–200",
                field_users: 24,
                current_process: "Paper tickets, retyped on Fridays.",
              },
            },
          }),
        }),
      }),
    }),
  },
}));

import { buildDeckPrompt } from "../server/deck-prompt";

describe("buildDeckPrompt", () => {
  it("carries the transcript verbatim, not a summary", async () => {
    const p = await buildDeckPrompt("d1");
    expect(p).toContain(TRANSCRIPT);
  });

  it("states the omit-beats-guess rule before anything else", async () => {
    const p = await buildDeckPrompt("d1");
    const rule = p.indexOf("Leaving a field out is always better than guessing");
    const calls = p.indexOf("## What the customer said");
    expect(rule).toBeGreaterThan(-1);
    expect(rule).toBeLessThan(calls);
  });

  it("names every field the renderer accepts", async () => {
    const p = await buildDeckPrompt("d1");
    for (const f of TEMPLATE_FIELDS) expect(p).toContain(f);
  });

  it("carries the SOW, the contact and the intake answers", async () => {
    const p = await buildDeckPrompt("d1");
    expect(p).toContain("SOW-2026-114");
    expect(p).toContain("Dale Whitcombe · VP Operations");
    expect(p).toContain("Industry: Oil & Gas");
    expect(p).toContain("People in the field: 24");
    expect(p).toContain("Paper tickets, retyped on Fridays.");
  });

  it("includes the design tokens so a self-drawn deck cannot drift", async () => {
    const p = await buildDeckPrompt("d1");
    expect(p).toContain(`#${BRAND.navy900}`);
    expect(p).toContain(`#${BRAND.blue500}`);
    expect(p).toContain(BRAND.fontSans);
  });

  it("passes on the gaps the portal already knows about", async () => {
    const p = await buildDeckPrompt("d1");
    expect(p).toContain("No project exists yet");
  });

  it("holds the sequencing rule the deck exists to state", async () => {
    const p = await buildDeckPrompt("d1");
    expect(p).toContain("proven in the field before anything is connected");
  });
});
