import { describe, expect, it } from "vitest";

import {
  createIssueInput,
  createRiskInput,
  resolutionOrderError,
  toEscalationPatch,
  toIssuePatch,
  toRiskPatch,
  updateEscalationInput,
  updateRiskInput,
} from "@/lib/delivery-input";

const risk = (over: Record<string, unknown> = {}) => ({
  implementationId: "11111111-1111-4111-8111-111111111111",
  title: "Data migration may slip",
  description: null,
  severity: "high",
  likelihood: "medium",
  status: "open",
  ownerId: null,
  impact: null,
  mitigation: null,
  identifiedAt: null,
  resolvedAt: null,
  ...over,
});

describe("resolutionOrderError", () => {
  it("refuses a resolution before the start day", () => {
    const message = resolutionOrderError({
      noun: "risk",
      startLabel: "identified",
      startedAt: "2026-08-12T09:30:00Z",
      resolvedAt: "2026-08-03",
    });
    expect(message).toContain("identified on 2026-08-12");
    expect(message).toContain("resolved on 2026-08-03");
  });

  // The case a naive instant comparison gets wrong: "Resolved on" is stored at
  // UTC midnight, so a risk raised at 14:00 and closed that afternoon has a
  // resolution instant *earlier* than its own identification instant.
  it("allows a same-day resolution even though its midnight is earlier", () => {
    expect(
      resolutionOrderError({
        noun: "risk",
        startLabel: "identified",
        startedAt: "2026-08-12T14:00:00Z",
        resolvedAt: "2026-08-12",
      }),
    ).toBeNull();
  });

  it("allows a later resolution", () => {
    expect(
      resolutionOrderError({
        noun: "issue",
        startLabel: "raised",
        startedAt: "2026-08-12T14:00:00Z",
        resolvedAt: "2026-08-13",
      }),
    ).toBeNull();
  });

  it("says nothing when either side is missing", () => {
    expect(
      resolutionOrderError({
        noun: "risk",
        startLabel: "identified",
        startedAt: null,
        resolvedAt: "2026-08-03",
      }),
    ).toBeNull();
    expect(
      resolutionOrderError({
        noun: "risk",
        startLabel: "identified",
        startedAt: "2026-08-12T09:30:00Z",
        resolvedAt: null,
      }),
    ).toBeNull();
  });
});

describe("delivery schemas refuse a backwards resolution", () => {
  it("rejects a new risk resolved before it was identified", () => {
    const parsed = createRiskInput.safeParse(
      risk({ identifiedAt: "2026-08-12", resolvedAt: "2026-08-03", status: "closed" }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["resolvedAt"]);
      expect(parsed.error.issues[0]?.message).toContain("cannot be resolved");
    }
  });

  it("accepts the same pair the right way round", () => {
    expect(
      createRiskInput.safeParse(
        risk({ identifiedAt: "2026-08-03", resolvedAt: "2026-08-12", status: "closed" }),
      ).success,
    ).toBe(true);
  });

  it("still accepts a risk with no dates at all", () => {
    expect(createRiskInput.safeParse(risk()).success).toBe(true);
  });

  it("applies on update as well as create", () => {
    const { implementationId: _drop, ...rest } = risk({
      identifiedAt: "2026-08-12",
      resolvedAt: "2026-08-03",
    });
    expect(
      updateRiskInput.safeParse({ id: "22222222-2222-4222-8222-222222222222", ...rest }).success,
    ).toBe(false);
  });

  it("covers issues and escalations too", () => {
    expect(
      createIssueInput.safeParse({
        implementationId: "11111111-1111-4111-8111-111111111111",
        title: "Form builder rejects the import",
        description: null,
        severity: "high",
        status: "resolved",
        ownerId: null,
        resolution: null,
        raisedAt: "2026-08-12",
        resolvedAt: "2026-08-01",
      }).success,
    ).toBe(false);

    expect(
      updateEscalationInput.safeParse({
        id: "22222222-2222-4222-8222-222222222222",
        title: "Sponsor threatening to pause",
        description: null,
        severity: "critical",
        status: "resolved",
        escalationType: null,
        ownerId: null,
        raisedBy: null,
        relatedIssueId: null,
        relatedRiskId: null,
        resolutionSummary: null,
        raisedAt: "2026-08-12",
        resolvedAt: "2026-08-01",
      }).success,
    ).toBe(false);
  });
});

describe("patches leave the start column alone when the field is blank", () => {
  // identified_at and raised_at are NOT NULL. A blank field means "leave it as
  // it is" — writing null would fail, and writing today's date would quietly
  // rewrite history on every unrelated edit.
  it("omits identified_at when no date was entered", () => {
    const { implementationId: _drop, ...rest } = risk();
    expect(toRiskPatch(rest as never)).not.toHaveProperty("identified_at");
  });

  it("includes identified_at at UTC midnight when a date was entered", () => {
    const { implementationId: _drop, ...rest } = risk({ identifiedAt: "2026-08-12" });
    expect(toRiskPatch(rest as never).identified_at).toBe("2026-08-12T00:00:00Z");
  });

  it("does the same for issues and escalations", () => {
    expect(toIssuePatch({ raisedAt: null } as never)).not.toHaveProperty("raised_at");
    expect(toEscalationPatch({ raisedAt: "2026-08-12" } as never).raised_at).toBe(
      "2026-08-12T00:00:00Z",
    );
  });
});
