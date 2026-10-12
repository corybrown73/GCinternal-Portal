import { describe, expect, it } from "vitest";

import {
  attachmentIdFromDescription,
  attachmentReferenceFor,
  buildTranscriptContextText,
  proposalApplyPlan,
  proposalDefaultSelected,
  transcriptAnalysisSchema,
  type EvidenceProposalRow,
  type TranscriptContext,
} from "../transcript-analysis";

/**
 * The transcript reading's shape and the apply mapping, with no panel and no
 * model: a V2 reply parses with every new field, a V1 reply still parses
 * with nulls, the context block names every id the model may echo, and a
 * kept row turns into exactly the entity input the existing write path
 * takes.
 */

const ROSTER = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Priya Nair", role: "implementation" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Dana Cole", role: "implementation" },
];

const ctx: TranscriptContext = {
  customerName: "Summit Roofing",
  implementationName: "Summit Roofing — new logo",
  stageLabel: "Get It Working",
  timeline: { closeDate: "2026-09-28", liveDate: "2026-10-07", firstForm: "Daily job sheet" },
  open: {
    risks: [{ id: "r-1", title: "Crew tablets not ordered" }],
    issues: [],
    decisions: [{ id: "d-1", title: "Use the standard PDF" }],
  },
  roster: ROSTER,
  owner: { id: ROSTER[0]!.id, name: "Priya Nair" },
  attachment: { title: "kickoff.vtt", uploadedAt: "2026-10-08" },
  hasHandoff: true,
  handoffAnswered: ["bought", "business_outcome"],
};

const row = (over: Partial<EvidenceProposalRow> = {}): EvidenceProposalRow => ({
  id: "p-1",
  implementation_id: "i-1",
  evidence_id: null,
  attachment_id: "a-1",
  job_id: null,
  type: "risk",
  title: "Tablets late",
  text: "The tablets may not arrive before the field pilot.",
  quote: "we still have no tablets",
  confidence: "stated",
  severity: "high",
  likelihood: "medium",
  owner_team_member_id: null,
  proposed_date: null,
  duplicate_of_type: null,
  duplicate_of_id: null,
  status: "pending",
  applied_entity_type: null,
  applied_entity_id: null,
  decided_by: null,
  decided_at: null,
  created_at: "2026-10-08T10:00:00Z",
  source_title: "Meeting transcript — kickoff.vtt",
  source_at: "2026-10-08T10:00:00Z",
  duplicate_title: null,
  owner_name: null,
  intake_key: null,
  ...over,
});

describe("the transcript analysis schema (V2)", () => {
  it("parses a full V2 reply with every new field", () => {
    const parsed = transcriptAnalysisSchema.parse({
      readable: true,
      problem: null,
      summary: "Kickoff.",
      meeting_date: "2026-10-06",
      proposals: [
        {
          type: "risk",
          title: "Tablets late",
          text: "The tablets may be late.",
          quote: "no tablets yet",
          confidence: "stated",
          severity: "HIGH",
          likelihood: "medium",
          owner_team_member_id: ROSTER[0]!.id,
          owner_name: "Priya",
          proposed_date: null,
          duplicate_of: { type: "risk", id: "r-1" },
          intake_key: null,
        },
        {
          type: "target_date",
          title: "Go-live moved",
          text: "Go-live two weeks out",
          quote: "let's say two weeks from today",
          confidence: "implied",
          proposed_date: "2026-10-20",
        },
        {
          type: "intake_suggestion",
          title: "Field users",
          text: "About 40 crew members",
          quote: "forty guys in the field",
          confidence: "stated",
          intake_key: "field_users",
        },
      ],
    });
    expect(parsed.meeting_date).toBe("2026-10-06");
    expect(parsed.proposals[0]).toMatchObject({
      severity: "high",
      likelihood: "medium",
      owner_team_member_id: ROSTER[0]!.id,
      duplicate_of: { type: "risk", id: "r-1" },
    });
    expect(parsed.proposals[1]).toMatchObject({ type: "target_date", proposed_date: "2026-10-20" });
    expect(parsed.proposals[2]).toMatchObject({
      type: "intake_suggestion",
      intake_key: "field_users",
    });
  });

  it("still reads the V1 shape, filling the new fields with nulls", () => {
    const parsed = transcriptAnalysisSchema.parse({
      readable: true,
      problem: null,
      summary: "Old reading.",
      proposals: [
        {
          type: "issue",
          title: "Login broken",
          text: "Admin cannot log in",
          confidence: "high",
          quote: "cannot log in",
        },
        {
          type: "owner",
          title: "New owner",
          text: "Dana Cole",
          confidence: "stated",
          quote: "Dana takes it",
        },
      ],
    });
    expect(parsed.meeting_date).toBeNull();
    expect(parsed.proposals[0]).toEqual({
      type: "issue",
      title: "Login broken",
      text: "Admin cannot log in",
      quote: "cannot log in",
      confidence: "stated",
      severity: null,
      likelihood: null,
      owner_team_member_id: null,
      owner_name: null,
      proposed_date: null,
      duplicate_of: null,
      intake_key: null,
    });
    expect(parsed.proposals[1]!.type).toBe("owner");
  });

  it("drops what it cannot trust: an unknown type, a bad date, a made-up intake key, a critical severity", () => {
    const parsed = transcriptAnalysisSchema.parse({
      summary: "",
      proposals: [
        {
          type: "stage_change",
          title: "Move to Make It Yours",
          text: "",
          confidence: "stated",
          quote: "we're done with stage 1",
          proposed_date: "next Tuesday",
          intake_key: "favourite_colour",
          severity: "critical",
          duplicate_of: "r-1",
        },
      ],
    });
    expect(parsed.proposals[0]).toMatchObject({
      type: "note",
      proposed_date: null,
      intake_key: null,
      severity: "high",
      duplicate_of: { type: "risk", id: "r-1" },
    });
  });
});

describe("the context block", () => {
  it("names the customer, the dates, every open record by id, the roster by id and the open questions", () => {
    const text = buildTranscriptContextText(ctx);
    expect(text).toContain("Customer: Summit Roofing");
    expect(text).toContain("Current stage: Get It Working");
    expect(text).toContain("Close date: 2026-09-28");
    expect(text).toContain("Planned go-live / target date: 2026-10-07");
    expect(text).toContain("First form: Daily job sheet");
    expect(text).toContain("[r-1] Crew tablets not ordered");
    expect(text).toContain("[d-1] Use the standard PDF");
    expect(text).toContain(`[${ROSTER[1]!.id}] Dana Cole (implementation)`);
    expect(text).toContain(`Current implementation owner: Priya Nair [${ROSTER[0]!.id}]`);
    expect(text).toContain("uploaded 2026-10-08");
    // Answered questions are left out; unanswered ones are offered by key.
    expect(text).not.toMatch(/^\s+- bought:/m);
    expect(text).toMatch(/- field_users: /);
  });

  it("says plainly when there is nothing to list", () => {
    const text = buildTranscriptContextText({
      ...ctx,
      open: { risks: [], issues: [], decisions: [] },
      roster: [],
      owner: null,
      timeline: { closeDate: null, liveDate: null, firstForm: null },
    });
    expect(text).toContain("Open risks (id, title):\n  (none)");
    expect(text).toContain("(nobody listed)");
    expect(text).toContain("Current implementation owner: nobody yet");
    expect(text).toContain("Close date: unknown");
  });

  it("offers no handoff question when the implementation has no handoff", () => {
    const text = buildTranscriptContextText({ ...ctx, hasHandoff: false, handoffAnswered: [] });
    expect(text).toContain(
      "no handoff record on this implementation; propose no intake_suggestion",
    );
    expect(text).not.toMatch(/- field_users: /);
  });
});

describe("the attachment reference", () => {
  it("round-trips through the evidence description", () => {
    expect(attachmentIdFromDescription(attachmentReferenceFor("abc"))).toBe("abc");
    expect(attachmentIdFromDescription("a note")).toBeNull();
    expect(attachmentIdFromDescription(null)).toBeNull();
  });
});

describe("the apply mapping", () => {
  it("carries the proposed severity and likelihood onto a risk, with the quote attributed", () => {
    const plan = proposalApplyPlan(row(), {}, { planOwnsTarget: true });
    expect(plan).toEqual({
      kind: "risk",
      input: {
        title: "Tablets late",
        description:
          'The tablets may not arrive before the field pilot.\n\nFrom the meeting transcript: "we still have no tablets"',
        severity: "high",
        likelihood: "medium",
        status: "open",
        ownerId: null,
      },
    });
  });

  it("falls back to medium when the reading gave no level, and lets the reviewer's pick win", () => {
    const none = proposalApplyPlan(
      row({ type: "issue", severity: null, likelihood: null }),
      {},
      { planOwnsTarget: false },
    );
    expect(none).toMatchObject({ kind: "issue", input: { severity: "medium", status: "open" } });
    const picked = proposalApplyPlan(
      row(),
      { severity: "low", ownerTeamMemberId: ROSTER[0]!.id },
      {
        planOwnsTarget: false,
      },
    );
    expect(picked).toMatchObject({
      kind: "risk",
      input: { severity: "low", likelihood: "medium", ownerId: ROSTER[0]!.id },
    });
  });

  it("routes a target date to the plan when the plan owns it, else to the record", () => {
    const base = row({ type: "target_date", proposed_date: "2026-10-20", text: "Go-live" });
    expect(proposalApplyPlan(base, {}, { planOwnsTarget: true })).toEqual({
      kind: "target_date",
      via: "plan",
      date: "2026-10-20",
    });
    expect(proposalApplyPlan(base, {}, { planOwnsTarget: false })).toEqual({
      kind: "target_date",
      via: "record",
      date: "2026-10-20",
    });
    expect(
      proposalApplyPlan(base, { proposedDate: "2026-11-02" }, { planOwnsTarget: true }),
    ).toMatchObject({
      date: "2026-11-02",
    });
    expect(
      proposalApplyPlan(
        row({ type: "target_date", proposed_date: null }),
        {},
        { planOwnsTarget: true },
      ),
    ).toMatchObject({
      kind: "blocked",
    });
  });

  it("needs an owner id for an owner change, from the reading or the picker", () => {
    expect(
      proposalApplyPlan(
        row({ type: "owner", owner_team_member_id: null, text: "Dana Cole" }),
        {},
        { planOwnsTarget: true },
      ),
    ).toMatchObject({ kind: "blocked" });
    expect(
      proposalApplyPlan(
        row({ type: "owner", owner_team_member_id: ROSTER[1]!.id }),
        {},
        { planOwnsTarget: true },
      ),
    ).toEqual({ kind: "owner", ownerId: ROSTER[1]!.id });
    expect(
      proposalApplyPlan(
        row({ type: "owner" }),
        { ownerTeamMemberId: ROSTER[0]!.id },
        { planOwnsTarget: true },
      ),
    ).toEqual({ kind: "owner", ownerId: ROSTER[0]!.id });
  });

  it("turns a decision, a note and an intake suggestion into their own inputs", () => {
    expect(
      proposalApplyPlan(
        row({ type: "decision", proposed_date: "2026-10-06" }),
        {},
        { planOwnsTarget: true },
      ),
    ).toMatchObject({ kind: "decision", input: { decisionDate: "2026-10-06", status: "active" } });
    expect(
      proposalApplyPlan(row({ type: "note", quote: null }), {}, { planOwnsTarget: true }),
    ).toEqual({
      kind: "note",
      input: {
        note: "Tablets late\n\nThe tablets may not arrive before the field pilot.\n\n(From the meeting transcript.)",
      },
    });
    expect(
      proposalApplyPlan(
        row({ type: "intake_suggestion", intake_key: "field_users", text: " 40 ", quote: "forty" }),
        {},
        { planOwnsTarget: true },
      ),
    ).toEqual({ kind: "intake_suggestion", key: "field_users", value: "40", quote: "forty" });
    expect(
      proposalApplyPlan(
        row({ type: "intake_suggestion", intake_key: null }),
        {},
        { planOwnsTarget: true },
      ),
    ).toMatchObject({ kind: "blocked" });
  });

  it("starts a duplicate unticked, and an unresolved date or owner unticked", () => {
    expect(proposalDefaultSelected(row(), "")).toBe(true);
    expect(proposalDefaultSelected(row({ duplicate_of_id: "r-1" }), "")).toBe(false);
    expect(proposalDefaultSelected(row({ type: "target_date", proposed_date: null }), "")).toBe(
      false,
    );
    expect(
      proposalDefaultSelected(row({ type: "target_date", proposed_date: "2026-10-20" }), ""),
    ).toBe(true);
    expect(proposalDefaultSelected(row({ type: "owner" }), "")).toBe(false);
    expect(proposalDefaultSelected(row({ type: "owner" }), ROSTER[0]!.id)).toBe(true);
    expect(proposalDefaultSelected(row({ type: "intake_suggestion", intake_key: null }), "")).toBe(
      false,
    );
  });
});
