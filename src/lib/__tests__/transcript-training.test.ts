import { describe, expect, it } from "vitest";

import {
  PROPOSAL_TYPES,
  proposalApplyPlan,
  transcriptAnalysisSchema,
  type EvidenceProposalRow,
  type ProposalApplyPlan,
} from "../transcript-analysis";

const TRAINING_TYPES = [
  "training_add",
  "training_update",
  "training_delivered",
  "training_demonstrated",
  "training_follow_up",
] as const;

/** A proposal as the model returns it, parsed by the same schema the server uses. */
function parseOne(raw: Record<string, unknown>) {
  const parsed = transcriptAnalysisSchema.parse({
    readable: true,
    problem: null,
    summary: "",
    meeting_date: "2026-11-04",
    proposals: [{ confidence: "stated", title: "t", text: "", quote: "a quote", ...raw }],
  });
  return parsed.proposals[0]!;
}

/** The stored row the apply path reads back, for a training suggestion. */
function trainingRow(over: Partial<EvidenceProposalRow>): EvidenceProposalRow {
  return {
    id: "p1",
    implementation_id: "impl-1",
    evidence_id: null,
    attachment_id: null,
    job_id: null,
    type: "training_update",
    title: "Change",
    text: "",
    quote: "They said it in the call.",
    confidence: "stated",
    severity: null,
    likelihood: null,
    owner_team_member_id: null,
    proposed_date: null,
    duplicate_of_type: null,
    duplicate_of_id: null,
    status: "pending",
    applied_entity_type: null,
    applied_entity_id: null,
    decided_by: null,
    decided_at: null,
    created_at: "2026-11-04T10:00:00Z",
    source_title: null,
    source_at: null,
    duplicate_title: null,
    owner_name: null,
    intake_key: null,
    training_id: "t1",
    training_field: null,
    training_value: null,
    training_date: null,
    training_version: "2026-11-01T10:00:00Z",
    ...over,
  };
}

const plan = (row: EvidenceProposalRow, picks = {}): ProposalApplyPlan =>
  proposalApplyPlan(row, picks, { planOwnsTarget: false });

describe("the training suggestion types", () => {
  it("are proposal types the model may return, and each has a label", () => {
    for (const t of TRAINING_TYPES) {
      expect((PROPOSAL_TYPES as readonly string[]).includes(t)).toBe(true);
      expect(parseOne({ type: t }).type).toBe(t);
    }
  });

  it("keep the training fields a model returned", () => {
    const p = parseOne({
      type: "training_update",
      training_id: "t1",
      training_field: "responsibility",
      training_value: "customer",
    });
    expect(p.training_id).toBe("t1");
    expect(p.training_field).toBe("responsibility");
    expect(p.training_value).toBe("customer");
  });

  it("drop a training field the model invented, rather than store it", () => {
    const p = parseOne({
      type: "training_update",
      training_id: "t1",
      training_field: "demonstrated_status",
    });
    expect(p.training_field).toBeNull();
  });

  it("an unknown type becomes a note, so there is no stage or checklist suggestion", () => {
    expect(parseOne({ type: "stage_change" }).type).toBe("note");
    expect(parseOne({ type: "checklist_complete" }).type).toBe("note");
  });

  it("existing types parse as they did", () => {
    expect(parseOne({ type: "risk" }).type).toBe("risk");
    expect(
      parseOne({ type: "component_update", component_id: "c1", component_field: "status" }).type,
    ).toBe("component_update");
  });
});

describe("applying a training suggestion", () => {
  it("every training suggestion needs the transcript quote", () => {
    const r = plan(
      trainingRow({
        type: "training_update",
        training_field: "audience",
        training_value: "Crew",
        quote: null,
      }),
    );
    expect(r.kind).toBe("blocked");
  });

  it("every change names the version it was made against", () => {
    const r = plan(
      trainingRow({
        type: "training_update",
        training_field: "audience",
        training_value: "Crew",
        training_version: null,
      }),
    );
    expect(r.kind).toBe("blocked");
  });

  it("adding a need makes a new one from the title, with the call's words as its outcome", () => {
    const r = plan(
      trainingRow({
        type: "training_add",
        title: "Dispatch basics",
        text: "Runs a dispatch alone",
      }),
    );
    expect(r).toEqual({
      kind: "training_add",
      topic: "Dispatch basics",
      outcome: "Runs a dispatch alone",
      quote: "They said it in the call.",
    });
  });

  it("a responsibility change sets the party, and carries no source of its own", () => {
    const r = plan(
      trainingRow({
        type: "training_update",
        training_field: "responsibility",
        training_value: "customer",
      }),
    );
    expect(r).toMatchObject({
      kind: "training_update",
      field: "responsibility",
      value: "customer",
      trainingId: "t1",
    });
    expect(r).not.toHaveProperty("source");
  });

  it("a responsibility outside GoCanvas, Customer and Partner is refused", () => {
    const r = plan(
      trainingRow({
        type: "training_update",
        training_field: "responsibility",
        training_value: "vendor",
      }),
    );
    expect(r.kind).toBe("blocked");
  });

  it("a method outside the Hub's list is refused", () => {
    const r = plan(
      trainingRow({ type: "training_update", training_field: "method", training_value: "video" }),
    );
    expect(r.kind).toBe("blocked");
  });

  it("delivery needs a date: the call's, or the reviewer's", () => {
    const none = plan(trainingRow({ type: "training_delivered", training_date: null }));
    expect(none.kind).toBe("blocked");
    const fromCall = plan(trainingRow({ type: "training_delivered", training_date: "2026-11-03" }));
    expect(fromCall).toMatchObject({ kind: "training_delivered", date: "2026-11-03" });
    const picked = plan(trainingRow({ type: "training_delivered", training_date: null }), {
      trainingDate: "2026-11-02",
    });
    expect(picked).toMatchObject({ kind: "training_delivered", date: "2026-11-02" });
  });

  it("readiness shown is one of the three statuses, and never a bare yes", () => {
    expect(
      plan(trainingRow({ type: "training_demonstrated", training_value: "demonstrated" })),
    ).toMatchObject({ kind: "training_demonstrated", status: "demonstrated" });
    expect(
      plan(trainingRow({ type: "training_demonstrated", training_value: "practice_needed" })),
    ).toMatchObject({ kind: "training_demonstrated", status: "practice_needed" });
    expect(plan(trainingRow({ type: "training_demonstrated", training_value: "yes" })).kind).toBe(
      "blocked",
    );
    expect(
      plan(trainingRow({ type: "training_demonstrated", training_value: "complete" })).kind,
    ).toBe("blocked");
  });

  it("a follow-up needs the next step", () => {
    expect(plan(trainingRow({ type: "training_follow_up", training_value: "" })).kind).toBe(
      "blocked",
    );
    expect(
      plan(
        trainingRow({
          type: "training_follow_up",
          training_value: "A second practice run next week",
        }),
      ),
    ).toMatchObject({ kind: "training_follow_up", nextStep: "A second practice run next week" });
  });

  it("no training suggestion produces a stage, checklist, purchase or lifecycle write", () => {
    const kinds = TRAINING_TYPES.map(
      (t) =>
        plan(
          trainingRow({
            type: t,
            training_field: "topic",
            training_value: "x",
            training_date: "2026-11-03",
          }),
        ).kind,
    );
    for (const k of kinds) {
      expect([
        "training_add",
        "training_update",
        "training_delivered",
        "training_demonstrated",
        "training_follow_up",
        "blocked",
      ]).toContain(k);
    }
  });
});
