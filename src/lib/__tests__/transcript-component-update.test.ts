import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * A transcript may propose a change to one solution component. Applying it is
 * a person's click: the component must be on the same implementation, a no-op
 * is refused, a bad value is refused before anything is claimed, and a date
 * that moves an original keeps the reason. Nothing is written by the reading.
 */

const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    audit: { audit: vi.fn(async () => {}) },
    flags: { isFlagOn: async () => true },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/audit", () => h.audit);
vi.mock("../app-config.server", () => h.flags);
vi.mock("../hub.server", () => ({}));
vi.mock("../presale.server", () => ({}));

import { applyProposal } from "../transcript-proposals.server";
import {
  proposalApplyPlan,
  buildTranscriptContextText,
  type TranscriptContext,
} from "../transcript-analysis";
import { proposalRowFor } from "../transcript-analysis.server";

const ORG = "00000000-0000-4000-8000-000000000001";
const IMPL = "d0000000-0000-4000-8000-0000000000e1";
const OTHER = "d0000000-0000-4000-8000-0000000000e2";
const SOL = "e0000000-0000-4000-8000-0000000000e1";
const COMP = "f0000000-0000-4000-8000-0000000000e1";
const FOREIGN = "f0000000-0000-4000-8000-0000000000e2";
const ACTOR = { profileId: "a0000000-0000-4000-8000-0000000000e1" };

let fake: ReturnType<typeof createFakeSupabase>;

function rowsFor(over: Record<string, unknown> = {}): Rows {
  return {
    implementations: [
      {
        id: IMPL,
        org_id: ORG,
        deal_id: null,
        journey_type: null,
        partner_key: null,
        name: "Rollout",
      },
      {
        id: OTHER,
        org_id: ORG,
        deal_id: null,
        journey_type: null,
        partner_key: null,
        name: "Other",
      },
    ],
    complete_solutions: [
      {
        id: SOL,
        org_id: ORG,
        implementation_id: IMPL,
        title: "Inspections",
        scope: "purchased",
        source: "manual",
        priority: "needed_for_go_live",
        status: "in_progress",
        readiness_confirmed: "not_ready",
        created_at: "2026-10-01T00:00:00Z",
      },
    ],
    solution_components: [
      {
        id: COMP,
        org_id: ORG,
        implementation_id: IMPL,
        complete_solution_id: SOL,
        category: "forms",
        name: "Inspection form",
        status: "being_built",
        priority: "needed_for_go_live",
        target_date: "2026-11-10",
        original_target_date: "2026-11-10",
        form_built: false,
        customer_approved: false,
        created_at: "2026-10-01T00:00:00Z",
      },
      {
        id: FOREIGN,
        org_id: ORG,
        implementation_id: OTHER,
        complete_solution_id: SOL,
        category: "forms",
        name: "Elsewhere",
        status: "being_built",
        priority: "needed_for_go_live",
        form_built: false,
        customer_approved: false,
        created_at: "2026-10-01T00:00:00Z",
      },
    ],
    solution_events: [],
    evidence_proposals: [],
    portal_profiles: [{ id: ACTOR.profileId, full_name: "Sam TIS", email: "sam@gocanvas.test" }],
    ...over,
  };
}

function proposal(over: Record<string, unknown>): Rows["evidence_proposals"][number] {
  return {
    id: "p-1",
    implementation_id: IMPL,
    evidence_id: null,
    attachment_id: null,
    job_id: null,
    type: "component_update",
    title: "Form is built",
    text: "The form is built and in use.",
    quote: "we built the form last week",
    confidence: "stated",
    severity: null,
    likelihood: null,
    owner_team_member_id: null,
    proposed_date: null,
    duplicate_of_type: null,
    duplicate_of_id: null,
    intake_key: null,
    solution_component_id: COMP,
    component_field: "status",
    component_value: "ready_for_testing",
    status: "pending",
    applied_entity_type: null,
    applied_entity_id: null,
    decided_by: null,
    decided_at: null,
    created_at: "2026-10-20T10:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  h.audit.audit.mockClear();
});

function use(rows: Rows) {
  fake = createFakeSupabase(rows, {
    unique: { solution_component_dependencies: [{ cols: ["component_id", "depends_on_id"] }] },
  });
  h.supabase.client = fake.client;
}

const component = (id: string) => fake.store["solution_components"]!.find((c) => c["id"] === id)!;

describe("applying a component change", () => {
  it("changes the component on its implementation, records it, and marks the proposal applied", async () => {
    const rows = rowsFor();
    rows["evidence_proposals"] = [proposal({})];
    use(rows);
    await applyProposal("p-1", {}, ACTOR);
    expect(component(COMP)["status"]).toBe("ready_for_testing");
    expect(fake.store["solution_events"]!.map((e) => e["kind"])).toEqual(["status"]);
    const row = fake.store["evidence_proposals"]![0]!;
    expect(row).toMatchObject({
      status: "applied",
      applied_entity_type: "solution_component",
      applied_entity_id: COMP,
    });
  });

  it("refuses a component on another implementation, writes nothing, and leaves the proposal pending", async () => {
    const rows = rowsFor();
    rows["evidence_proposals"] = [proposal({ solution_component_id: FOREIGN })];
    use(rows);
    await expect(applyProposal("p-1", {}, ACTOR)).rejects.toThrow(
      "That component is not on this implementation",
    );
    expect(component(FOREIGN)["status"]).toBe("being_built");
    expect(fake.store["solution_events"]).toEqual([]);
    expect(fake.store["evidence_proposals"]![0]!["status"]).toBe("pending");
  });

  it("refuses a change that is already recorded, and releases the claim", async () => {
    const rows = rowsFor();
    rows["solution_components"]![0]!["status"] = "ready_for_testing";
    rows["evidence_proposals"] = [proposal({})];
    use(rows);
    await expect(applyProposal("p-1", {}, ACTOR)).rejects.toThrow("already how it is recorded");
    expect(fake.store["evidence_proposals"]![0]!["status"]).toBe("pending");
    expect(fake.store["solution_events"]).toEqual([]);
  });

  it("refuses a value that is not a component status before anything is claimed", async () => {
    const rows = rowsFor();
    rows["evidence_proposals"] = [proposal({ component_value: "almost_done" })];
    use(rows);
    await expect(applyProposal("p-1", {}, ACTOR)).rejects.toThrow(
      '"almost_done" is not a component status.',
    );
    expect(component(COMP)["status"]).toBe("being_built");
  });

  it("moves a date that already has an original, keeping the transcript's sentence as the reason", async () => {
    const rows = rowsFor();
    rows["evidence_proposals"] = [
      proposal({
        component_field: "target_date",
        component_value: "2026-11-24",
        text: "Their sandbox arrives on the 20th, so the feed moves two weeks.",
      }),
    ];
    use(rows);
    await applyProposal("p-1", {}, ACTOR);
    expect(component(COMP)).toMatchObject({
      target_date: "2026-11-24",
      original_target_date: "2026-11-10",
    });
    expect(fake.store["solution_events"]![0]).toMatchObject({
      kind: "target_date",
      reason: "Their sandbox arrives on the 20th, so the feed moves two weeks.",
    });
  });
});

describe("the reading names only what it is shown", () => {
  const ctx = (components: TranscriptContext["solutionComponents"]): TranscriptContext =>
    ({
      customerName: "Northwind Fleet",
      implementationName: "Rollout",
      stageLabel: "Build",
      timeline: { closeDate: null, liveDate: null, firstForm: null },
      open: { risks: [], issues: [], decisions: [] },
      roster: [],
      solutionComponents: components,
      owner: null,
      attachment: { title: "call.vtt", uploadedAt: null },
      hasHandoff: false,
      handoffAnswered: [],
      partner: false,
    }) as unknown as TranscriptContext;

  const listed = [
    {
      id: COMP,
      solution: "Inspections",
      name: "Inspection form",
      status: "being_built",
      priority: "needed_for_go_live",
      targetDate: null,
    },
  ];

  it("keeps a component_update that names a listed component, with its field and value", () => {
    const row = proposalRowFor(
      {
        type: "component_update",
        title: "t",
        text: "x",
        confidence: "stated",
        quote: null,
        severity: null,
        likelihood: null,
        owner_team_member_id: null,
        owner_name: null,
        proposed_date: null,
        duplicate_of: null,
        intake_key: null,
        component_id: COMP,
        component_field: "status",
        component_value: "complete",
      } as never,
      ctx(listed),
      { implementationId: IMPL, evidenceId: null, attachmentId: "a", jobId: null },
    );
    expect(row).toMatchObject({
      type: "component_update",
      solution_component_id: COMP,
      component_field: "status",
      component_value: "complete",
    });
  });

  it("keeps a component_update that names an unlisted id as a note, so the text is not lost", () => {
    const row = proposalRowFor(
      {
        type: "component_update",
        title: "t",
        text: "x",
        confidence: "stated",
        quote: null,
        severity: null,
        likelihood: null,
        owner_team_member_id: null,
        owner_name: null,
        proposed_date: null,
        duplicate_of: null,
        intake_key: null,
        component_id: "made-up",
        component_field: "status",
        component_value: "complete",
      } as never,
      ctx(listed),
      { implementationId: IMPL, evidenceId: null, attachmentId: "a", jobId: null },
    );
    expect(row).toMatchObject({ type: "note", solution_component_id: null });
  });

  it("lists the components with their ids in the context the model is given", () => {
    const text = buildTranscriptContextText(ctx(listed));
    expect(text).toContain(`[${COMP}] Inspections · Inspection form`);
    expect(text).toContain("a component_update must name one of these ids");
  });

  it("says plainly when there are no components, so none is proposed", () => {
    expect(buildTranscriptContextText(ctx([]))).toContain("(no solution components recorded)");
  });
});

describe("the apply plan for a component change", () => {
  const base = {
    type: "component_update" as const,
    title: "t",
    text: "reason",
    quote: null,
    severity: null,
    likelihood: null,
    owner_team_member_id: null,
    proposed_date: null,
    intake_key: null,
    solution_component_id: COMP,
    component_field: "status" as const,
    component_value: "complete",
  };

  it("is a component update for a valid status", () => {
    expect(proposalApplyPlan(base, {}, { planOwnsTarget: false })).toEqual({
      kind: "component_update",
      componentId: COMP,
      field: "status",
      value: "complete",
      reason: "reason",
    });
  });

  it("is blocked when no component is named, or no field, or an empty value", () => {
    expect(
      proposalApplyPlan({ ...base, solution_component_id: null }, {}, { planOwnsTarget: false }),
    ).toMatchObject({
      kind: "blocked",
    });
    expect(
      proposalApplyPlan({ ...base, component_field: null }, {}, { planOwnsTarget: false }),
    ).toMatchObject({
      kind: "blocked",
    });
    expect(
      proposalApplyPlan({ ...base, component_value: "  " }, {}, { planOwnsTarget: false }),
    ).toMatchObject({
      kind: "blocked",
    });
  });

  it("refuses a priority or a date that is not one of the values", () => {
    expect(
      proposalApplyPlan(
        { ...base, component_field: "priority", component_value: "soon" },
        {},
        { planOwnsTarget: false },
      ),
    ).toMatchObject({ kind: "blocked" });
    expect(
      proposalApplyPlan(
        { ...base, component_field: "target_date", component_value: "2026-13-40" },
        {},
        { planOwnsTarget: false },
      ),
    ).toMatchObject({ kind: "blocked" });
    expect(
      proposalApplyPlan(
        { ...base, component_field: "target_date", component_value: "2026-11-24" },
        {},
        { planOwnsTarget: false },
      ),
    ).toMatchObject({ kind: "component_update" });
  });
});
