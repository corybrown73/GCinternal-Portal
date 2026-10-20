import { describe, expect, it } from "vitest";

import { GRADUATED_STAGE } from "../claimed-owner";
import {
  customerListEmptyMessage,
  graduatedCount,
  graduatedSectionOffered,
  graduatedSectionOpen,
  isGraduatedRow,
  partitionCustomerRows,
  showActiveTable,
} from "../customer-list-sections";

const row = (id: string, deal_stage: string | null, extra: Partial<{ is_test: boolean }> = {}) => ({
  id,
  deal_stage,
  is_test: false,
  ...extra,
});

describe("graduated is the deal's stage, not health or dates", () => {
  it("counts only the graduated deal stage as graduated", () => {
    expect(isGraduatedRow({ deal_stage: GRADUATED_STAGE })).toBe(true);
    expect(isGraduatedRow({ deal_stage: "make_it_run" })).toBe(false);
    expect(isGraduatedRow({ deal_stage: null })).toBe(false);
  });

  it("keeps an active customer active whatever its health or age", () => {
    // A row with the worst health and an old stage entry is still active: the list
    // divides on the stage alone.
    const stale = { ...row("a", "make_it_run"), stage_entered_at: "2019-01-01", status: "blocked" };
    const { active, graduated } = partitionCustomerRows([stale]);
    expect(active).toEqual([stale]);
    expect(graduated).toEqual([]);
  });

  it("does not treat a graduated-looking health or date as graduation", () => {
    const healthy = { ...row("b", "make_it_run"), status: "on_track", plan_end: "2020-01-01" };
    expect(partitionCustomerRows([healthy]).active).toHaveLength(1);
  });
});

describe("the list is divided, in order, with nothing lost", () => {
  it("puts each row in exactly one section, keeping the given order", () => {
    const rows = [
      row("1", "make_it_run"),
      row("2", GRADUATED_STAGE),
      row("3", "onboarding_kickoff"),
      row("4", GRADUATED_STAGE),
    ];
    const { active, graduated } = partitionCustomerRows(rows);
    expect(active.map((r) => r.id)).toEqual(["1", "3"]);
    expect(graduated.map((r) => r.id)).toEqual(["2", "4"]);
    expect(active.length + graduated.length).toBe(rows.length);
  });

  it("returns empty sections for no rows", () => {
    expect(partitionCustomerRows([])).toEqual({ active: [], graduated: [] });
  });
});

describe("the graduated section is offered by the stage filter", () => {
  it("is offered when no stage is selected", () => {
    expect(graduatedSectionOffered(undefined)).toBe(true);
  });

  it("is offered when the graduated stage is selected", () => {
    expect(graduatedSectionOffered(GRADUATED_STAGE)).toBe(true);
  });

  it("is hidden for any other stage, since no graduated row can match it", () => {
    expect(graduatedSectionOffered("make_it_run")).toBe(false);
    expect(graduatedSectionOffered("onboarding_kickoff")).toBe(false);
  });
});

describe("the graduated count", () => {
  it("counts the graduated rows it is given, and leaves test accounts out", () => {
    const graduated = [
      row("1", GRADUATED_STAGE),
      row("2", GRADUATED_STAGE, { is_test: true }),
      row("3", GRADUATED_STAGE),
    ];
    expect(graduatedCount(graduated)).toBe(2);
  });

  it("is zero when no graduated row is given", () => {
    expect(graduatedCount([])).toBe(0);
  });
});

describe("selecting the graduated stage", () => {
  it("hides the active table, so no empty table sits above the graduated section", () => {
    expect(showActiveTable(GRADUATED_STAGE)).toBe(false);
  });

  it("keeps the active table for no stage filter and for any active stage", () => {
    expect(showActiveTable(undefined)).toBe(true);
    expect(showActiveTable("make_it_run")).toBe(true);
  });

  it("opens the graduated section by default", () => {
    expect(graduatedSectionOpen(null, GRADUATED_STAGE)).toBe(true);
  });

  it("keeps the section collapsed by default in the normal view", () => {
    expect(graduatedSectionOpen(null, undefined)).toBe(false);
    expect(graduatedSectionOpen(null, "make_it_run")).toBe(false);
  });

  it("honours a click made under the graduated stage filter", () => {
    expect(graduatedSectionOpen({ forStage: GRADUATED_STAGE, open: false }, GRADUATED_STAGE)).toBe(
      false,
    );
  });

  it("does not carry a click made in the normal view into the graduated stage", () => {
    // The reader collapsed or opened it under no stage filter. Selecting the graduated
    // stage starts from that stage's own default: expanded.
    expect(graduatedSectionOpen({ forStage: undefined, open: true }, GRADUATED_STAGE)).toBe(true);
    expect(graduatedSectionOpen({ forStage: undefined, open: false }, GRADUATED_STAGE)).toBe(true);
  });

  it("does not carry a click made under the graduated stage into the normal view", () => {
    expect(graduatedSectionOpen({ forStage: GRADUATED_STAGE, open: true }, undefined)).toBe(false);
  });
});

describe("empty-state messages", () => {
  it("says there are no active customers in the normal view, and offers a filter hint otherwise", () => {
    expect(customerListEmptyMessage("active", false)).toBe("No active customers in this view.");
    expect(customerListEmptyMessage("active", true)).toBe(
      "No active customers match these filters. Try clearing a filter.",
    );
  });

  it("says there are no graduated customers in the normal view, and offers a filter hint otherwise", () => {
    expect(customerListEmptyMessage("graduated", false)).toBe(
      "No graduated customers in this view.",
    );
    expect(customerListEmptyMessage("graduated", true)).toBe(
      "No graduated customers match these filters. Try clearing a filter.",
    );
  });

  it("never describes the graduated section as the active one", () => {
    expect(customerListEmptyMessage("graduated", true)).not.toMatch(/active/i);
    expect(customerListEmptyMessage("active", true)).not.toMatch(/graduated/i);
  });
});
