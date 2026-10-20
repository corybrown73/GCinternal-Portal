import { describe, expect, it } from "vitest";

import { GRADUATED_STAGE } from "../claimed-owner";
import {
  graduatedCount,
  graduatedSectionOffered,
  isGraduatedRow,
  partitionCustomerRows,
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
