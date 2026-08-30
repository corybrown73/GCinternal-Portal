import { describe, expect, it } from "vitest";

import { deliveryActivityChanges } from "@/lib/delivery-activity";

describe("deliveryActivityChanges", () => {
  // The gap: editing an implementation's own fields was recorded, but creating
  // or editing the records people argue about — a risk's severity, an issue's
  // resolution — wrote nothing. The feed looked complete and contained a
  // history in which nobody had ever touched a risk.
  it("records one row per changed field, named singularly", () => {
    const changes = deliveryActivityChanges(
      "risks",
      "11111111-1111-4111-8111-111111111111",
      { severity: "critical", status: "open" },
      "edited",
    );
    expect(changes).toHaveLength(2);
    expect(changes[0]).toEqual({
      entity_type: "risk",
      entity_id: "11111111-1111-4111-8111-111111111111",
      field_name: "severity",
      new_value: "critical",
      change_reason: "edited",
    });
  });

  it("covers every delivery table", () => {
    for (const [table, entity] of [
      ["requirements", "requirement"],
      ["risks", "risk"],
      ["issues", "issue"],
      ["escalations", "escalation"],
      ["decisions", "decision"],
      ["commitments", "commitment"],
    ] as const) {
      const [row] = deliveryActivityChanges(table, "id", { title: "x" }, "created");
      expect(row?.entity_type).toBe(entity);
    }
  });

  // The feed's entity_id is what Customer 360 filters on, so a write with no
  // returned id has nothing to attach to and must not invent one.
  it("records nothing without a row id", () => {
    expect(deliveryActivityChanges("risks", null, { title: "x" }, "created")).toEqual([]);
  });

  it("records nothing for a table outside the delivery set", () => {
    expect(deliveryActivityChanges("implementations", "id", { name: "x" }, "edited")).toEqual([]);
  });

  it('keeps a cleared field as null rather than the string "null"', () => {
    const [row] = deliveryActivityChanges("issues", "id", { resolved_at: null }, "edited");
    expect(row?.new_value).toBeNull();
  });
});
