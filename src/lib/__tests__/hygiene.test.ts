import { describe, expect, it } from "vitest";

import { bucketArr, createMasker, stableHash } from "../demo-mode";
import { auditFailureAlert, countFailure, emptyCounter, isCriticalAudit } from "../audit-policy";
import { manualEdge } from "../trace-links";
import { missingHandoverFields, HANDOVER_REQUIRED } from "../handover-input";
import { saveViewInput, searchToView } from "../saved-view-input";

/**
 * Phase 7 pure logic. Everything here is the part of the hygiene work that can
 * be got wrong quietly: a pseudonym that is not stable, an audit failure that
 * is not classed as critical, a hand-drawn trace edge that points anywhere it
 * likes, a saved view that stores an unbounded blob.
 */

describe("demo mode", () => {
  it("is a passthrough when off — no accidental masking in production", () => {
    const m = createMasker(false);
    expect(m.enabled).toBe(false);
    expect(m.org("Acme Ltd", "id-1")).toBe("Acme Ltd");
    expect(m.person("Dana Reyes", "id-1")).toBe("Dana Reyes");
    expect(m.email("dana@acme.com", "id-1")).toBe("dana@acme.com");
    expect(m.arr(123_456)).toBe(123_456);
  });

  it("masks and never leaks the real value", () => {
    const m = createMasker(true);
    const masked = m.org("Acme Ltd", "id-1");
    expect(masked).not.toContain("Acme");
    expect(m.email("dana@acme.com", "id-1")).toMatch(/@example\.com$/);
    expect(m.email("dana@acme.com", "id-1")).not.toContain("acme.com");
  });

  it("is stable for the same id and different across ids", () => {
    const m = createMasker(true);
    expect(m.org("Acme", "aaaa")).toBe(m.org("Different name entirely", "aaaa"));
    // Not a guarantee for every pair (16 buckets), but these two must differ or
    // the seeding is not doing anything.
    const distinct = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => m.org("x", id)));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("keeps a null email null rather than inventing a person", () => {
    expect(createMasker(true).email(null, "id")).toBeNull();
  });

  it("buckets ARR instead of blanking it", () => {
    expect(bucketArr(null)).toBeNull();
    expect(bucketArr(0)).toBe(0);
    expect(bucketArr(123_456)).toBe(100_000);
    expect(bucketArr(178_000)).toBe(200_000);
    expect(bucketArr(9)).toBe(9);
  });

  it("hashes deterministically", () => {
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).not.toBe(stableHash("abd"));
  });
});

describe("audit policy", () => {
  it("treats every api-key actor as critical, whatever the action", () => {
    expect(isCriticalAudit("accounts.list", "api_key")).toBe(true);
    expect(isCriticalAudit("accounts.list", "user")).toBe(false);
  });

  it("matches critical actions by prefix so siblings inherit", () => {
    expect(isCriticalAudit("api_key.create", "user")).toBe(true);
    expect(isCriticalAudit("api_key.rotate", "user")).toBe(true);
    expect(isCriticalAudit("profile.role_change", "user")).toBe(true);
    expect(isCriticalAudit("ticket.comment", "user")).toBe(false);
  });

  it("names the action and the actor in the alert, not just 'an audit failed'", () => {
    const alert = auditFailureAlert({
      action: "api_key.revoke",
      actorType: "user",
      actorId: "u-1",
      entityType: "api_key",
      entityId: "k-1",
      message: "connection reset",
      critical: true,
    });
    expect(alert.kind).toBe("audit_write_failed");
    expect(alert.severity).toBe("critical");
    expect(alert.title).toContain("api_key.revoke");
    expect(alert.detail).toContain("connection reset");
    expect(alert.detail).toContain("k-1");
    expect(alert.payload["critical"]).toBe(true);
  });

  it("counts failures and keeps the last one", () => {
    let c = emptyCounter();
    expect(c.failures).toBe(0);
    c = countFailure(c, "api_key.create", "boom", "2026-01-01T00:00:00.000Z");
    c = countFailure(c, "profile.role_change", "worse", "2026-01-02T00:00:00.000Z");
    expect(c.failures).toBe(2);
    expect(c.lastAction).toBe("profile.role_change");
    expect(c.lastError).toBe("worse");
    expect(c.lastAt).toBe("2026-01-02T00:00:00.000Z");
  });
});

describe("manual trace edge", () => {
  const decision = "11111111-1111-4111-8111-111111111111";
  const solution = "22222222-2222-4222-8222-222222222222";

  it("builds exactly the one edge a person is allowed to draw", () => {
    const built = manualEdge(decision, solution);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.edge).toEqual({
      from_entity_type: "decision",
      from_entity_id: decision,
      relationship: "informs",
      to_entity_type: "technical_solution",
      to_entity_id: solution,
    });
  });

  it("refuses non-uuids and self-links with a reason, not a throw", () => {
    expect(manualEdge("not-a-uuid", solution)).toEqual({
      ok: false,
      reason: "That decision id is not a uuid.",
    });
    expect(manualEdge(decision, decision).ok).toBe(false);
  });
});

describe("handover record", () => {
  it("names every required field when there is no record at all", () => {
    expect(missingHandoverFields(null)).toEqual(HANDOVER_REQUIRED.map((f) => f.label));
  });

  it("treats whitespace as absent — a summary of spaces is not a summary", () => {
    expect(
      missingHandoverFields({ handoff_date: "2026-03-01", cs_owner_id: "x", summary: "   " }),
    ).toEqual(["Handover summary"]);
  });

  it("reports nothing missing when all three are present", () => {
    expect(
      missingHandoverFields({
        handoff_date: "2026-03-01",
        cs_owner_id: "x",
        summary: "Handed over with two open items",
      }),
    ).toEqual([]);
  });
});

describe("saved views", () => {
  it("drops empty values so a saved view does not filter on the empty string", () => {
    expect(searchToView({ stage: "", status: "at_risk", sort: "days", missing: null })).toEqual({
      status: "at_risk",
      sort: "days",
    });
  });

  it("bounds what can be stored as jsonb", () => {
    const tooMany = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, "v"]));
    expect(
      saveViewInput.safeParse({ surface: "customers", name: "x", query: tooMany }).success,
    ).toBe(false);
    expect(
      saveViewInput.safeParse({
        surface: "customers",
        name: "x",
        query: { nested: { a: 1 } },
      }).success,
    ).toBe(false);
    expect(saveViewInput.safeParse({ surface: "nope", name: "x", query: {} }).success).toBe(false);
  });

  it("defaults a view to private", () => {
    const parsed = saveViewInput.parse({ surface: "search", name: "Mine", query: { q: "acme" } });
    expect(parsed.shared).toBe(false);
  });
});
