import { describe, expect, it } from "vitest";

import {
  type PurchaseItem,
  demonstrationCheck,
  fieldPatchFor,
  needFromRow,
  needInputCheck,
  progressText,
  responsibilityCheck,
  responsibilityText,
  suggestedNeedsFor,
  trainingCoverage,
  type TrainingNeed,
} from "../training-plan";

const svc = (id: string, kind: string, name: string): PurchaseItem => ({ id, kind, name });

const need = (over: Partial<TrainingNeed> & { id: string }): TrainingNeed => ({
  implementationId: "impl-1",
  topic: "Form basics",
  audience: null,
  outcome: null,
  method: null,
  responsibility: null,
  responsibilitySource: null,
  sowQuote: null,
  purchasedServiceId: null,
  solutionComponentId: null,
  adoptionAreaId: null,
  deliveredAt: null,
  demonstratedStatus: "not_assessed",
  demonstratedEvidenceId: null,
  nextStep: null,
  archivedAt: null,
  updatedAt: "2026-11-01T10:00:00Z",
  ...over,
});

describe("reading a training row", () => {
  it("maps the database row to the plan's terms, with empty strings as nothing", () => {
    const n = needFromRow({
      id: "t1",
      implementation_id: "i1",
      topic: "Dispatch",
      audience: "",
      outcome: "Runs a dispatch",
      method: "session",
      responsibility: "customer",
      responsibility_source: "tis_confirmed",
      sow_quote: null,
      purchased_service_id: null,
      delivered_at: "2026-11-02",
      demonstrated_status: "practice_needed",
      updated_at: "2026-11-03T09:00:00Z",
    });
    expect(n.audience).toBeNull();
    expect(n.outcome).toBe("Runs a dispatch");
    expect(n.responsibility).toBe("customer");
    expect(n.deliveredAt).toBe("2026-11-02");
    expect(n.demonstratedStatus).toBe("practice_needed");
    expect(n.updatedAt).toBe("2026-11-03T09:00:00Z");
  });
});

describe("responsibility is confirmed or from the contract, never assumed", () => {
  it("nothing set is allowed: the need is unconfirmed, not defaulted", () => {
    expect(responsibilityCheck(null, null, null)).toEqual({ ok: true });
  });

  it("a responsibility without its source is refused", () => {
    expect(responsibilityCheck("gocanvas", null, null).ok).toBe(false);
    expect(responsibilityCheck(null, "tis_confirmed", null).ok).toBe(false);
  });

  it("a SOW source needs the wording it came from", () => {
    const r = responsibilityCheck("gocanvas", "sow", "  ");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/SOW wording/);
  });

  it("a SOW source with its wording is accepted", () => {
    expect(responsibilityCheck("gocanvas", "sow", "GoCanvas delivers two live sessions.")).toEqual({
      ok: true,
    });
  });

  it("a TIS confirmation needs no quote", () => {
    expect(responsibilityCheck("customer", "tis_confirmed", null)).toEqual({ ok: true });
    expect(responsibilityCheck("partner", "tis_confirmed", null)).toEqual({ ok: true });
  });

  it("only GoCanvas, Customer and Partner are supported", () => {
    const r = responsibilityCheck("vendor", "tis_confirmed", null);
    expect(r.ok).toBe(false);
  });

  it("only the SOW and TIS confirmation are sources", () => {
    expect(responsibilityCheck("gocanvas", "guessed", null).ok).toBe(false);
  });
});

describe("what a change may write", () => {
  it("adding a need needs a topic", () => {
    expect(needInputCheck({}, { requireTopic: true }).ok).toBe(false);
    expect(needInputCheck({ topic: "   " }, { requireTopic: true }).ok).toBe(false);
    expect(needInputCheck({ topic: "Forms" }, { requireTopic: true })).toEqual({ ok: true });
  });

  it("a change cannot blank the topic", () => {
    expect(needInputCheck({ topic: "" }, { requireTopic: false }).ok).toBe(false);
  });

  it("the method must be one the Hub offers", () => {
    expect(needInputCheck({ method: "video_call" }, { requireTopic: false }).ok).toBe(false);
    expect(needInputCheck({ method: "self_paced" }, { requireTopic: false })).toEqual({ ok: true });
  });
});

describe("delivered and shown are separate", () => {
  it("showing readiness needs evidence", () => {
    const r = demonstrationCheck({
      status: "demonstrated",
      evidenceId: null,
      previousStatus: "not_assessed",
      reason: null,
    });
    expect(r.ok).toBe(false);
  });

  it("practice still needed or not yet shown needs no evidence", () => {
    for (const status of ["practice_needed", "not_yet", "not_assessed"]) {
      expect(
        demonstrationCheck({
          status,
          evidenceId: null,
          previousStatus: "not_assessed",
          reason: null,
        }),
      ).toEqual({ ok: true });
    }
  });

  it("leaving demonstrated needs a reason", () => {
    expect(
      demonstrationCheck({
        status: "not_yet",
        evidenceId: null,
        previousStatus: "demonstrated",
        reason: null,
      }).ok,
    ).toBe(false);
    expect(
      demonstrationCheck({
        status: "practice_needed",
        evidenceId: null,
        previousStatus: "demonstrated",
        reason: "Re-checked after a turnover",
      }),
    ).toEqual({ ok: true });
  });

  it("a delivered training can be not yet shown, and the two read differently", () => {
    const text = progressText({ deliveredAt: "2026-11-02", demonstratedStatus: "not_yet" });
    expect(text.delivered).toBe("Delivered 2026-11-02");
    expect(text.readiness).toBe("Not yet shown");
  });
});

describe("coverage of the purchase record", () => {
  it("a purchased training item with no need is uncovered, and is never created for the TIS", () => {
    const services = [
      svc("svc-train", "training", "Training"),
      svc("svc-form", "paid_form", "Form build"),
    ];
    const cov = trainingCoverage(services, []);
    expect(cov.uncovered.map((s) => s.id)).toEqual(["svc-train"]);
    expect(suggestedNeedsFor(services, [])).toEqual([
      { purchasedServiceId: "svc-train", topic: "Training" },
    ]);
  });

  it("an active need linked to the purchased item covers it", () => {
    const services = [svc("svc-train", "training", "Training")];
    const cov = trainingCoverage(services, [need({ id: "a", purchasedServiceId: "svc-train" })]);
    expect(cov.uncovered).toEqual([]);
  });

  it("an archived need does not cover the purchased item", () => {
    const services = [svc("svc-train", "training", "Training")];
    const cov = trainingCoverage(services, [
      need({ id: "a", purchasedServiceId: "svc-train", archivedAt: "2026-11-02T00:00:00Z" }),
    ]);
    expect(cov.uncovered.map((s) => s.id)).toEqual(["svc-train"]);
  });

  it("a training-only implementation has needs and no purchased item, and nothing is uncovered", () => {
    const cov = trainingCoverage([], [need({ id: "a" })]);
    expect(cov.topics).toBe(1);
    expect(cov.uncovered).toEqual([]);
  });
});

describe("the counts a person reads", () => {
  it("counts topics, delivered and demonstrated separately", () => {
    const cov = trainingCoverage(
      [],
      [
        need({ id: "a", deliveredAt: "2026-11-02", demonstratedStatus: "not_assessed" }),
        need({
          id: "b",
          deliveredAt: "2026-11-02",
          demonstratedStatus: "demonstrated",
          demonstratedEvidenceId: "ev",
        }),
        need({ id: "c", demonstratedStatus: "practice_needed" }),
      ],
    );
    expect(cov.topics).toBe(3);
    expect(cov.delivered).toBe(2);
    expect(cov.demonstrated).toBe(1);
    expect(cov.practiceNeeded).toBe(1);
  });

  it("archived needs do not count", () => {
    const cov = trainingCoverage([], [need({ id: "a", archivedAt: "2026-11-02T00:00:00Z" })]);
    expect(cov.topics).toBe(0);
  });

  it("responsibility is counted only when confirmed, and unconfirmed needs are listed", () => {
    const cov = trainingCoverage(
      [],
      [
        need({ id: "a", responsibility: "gocanvas", responsibilitySource: "sow", sowQuote: "x" }),
        need({ id: "b", responsibility: "customer", responsibilitySource: "tis_confirmed" }),
        need({ id: "c" }),
        need({ id: "d", responsibility: "partner" }),
      ],
    );
    expect(cov.responsibility).toEqual({ gocanvas: 1, customer: 1, partner: 0 });
    expect(cov.needsConfirmation.map((n) => n.id)).toEqual(["c", "d"]);
  });

  it("reads responsibility plainly, and says when it needs confirming", () => {
    expect(responsibilityText(need({ id: "x" }))).toBe("Needs confirmation");
    expect(
      responsibilityText(
        need({ id: "x", responsibility: "gocanvas", responsibilitySource: "sow", sowQuote: "x" }),
      ),
    ).toBe("GoCanvas (from the SOW)");
  });
});

describe("an approved change writes what the reviewer approved", () => {
  it("a responsibility approved by TIS is TIS-confirmed, never SOW", () => {
    expect(fieldPatchFor("responsibility", "customer")).toEqual({
      responsibility: "customer",
      responsibilitySource: "tis_confirmed",
    });
  });

  it("the other fields are written as they are", () => {
    expect(fieldPatchFor("audience", "Field crews")).toEqual({ audience: "Field crews" });
    expect(fieldPatchFor("method", "recorded")).toEqual({ method: "recorded" });
  });

  it("a field outside the list writes nothing", () => {
    expect(fieldPatchFor("demonstrated_status", "demonstrated")).toEqual({});
  });
});
