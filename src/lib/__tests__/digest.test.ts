import { describe, expect, it } from "vitest";

import {
  daysBetween,
  digestIsEmpty,
  digestSubject,
  renderDigestHtml,
  weekOf,
  type Digest,
} from "../digest";

const empty: Digest = {
  recipient_name: "Teya Rampaul",
  week_of: "2026-09-21",
  unclaimed_deals: [],
  my_deals: [],
  needs_action: [],
  keep_an_eye: [],
  overdue_milestones: [],
  this_week_milestones: [],
  team: null,
};

describe("the Monday digest", () => {
  it("knows when there is nothing to send", () => {
    expect(digestIsEmpty(empty)).toBe(true);
    expect(digestIsEmpty({ ...empty, unclaimed_deals: [deal()] })).toBe(false);
    // A manager with an empty personal list still gets the team rollup.
    expect(
      digestIsEmpty({
        ...empty,
        team: [
          { owner_name: "Cory", needs_action: 1, keep_an_eye: 0, deals: 0, overdue_milestones: 0 },
        ],
      }),
    ).toBe(false);
  });

  it("puts the counts, and only the counts, in the subject", () => {
    expect(digestSubject(empty)).toBe("Monday: nothing overdue");
    expect(
      digestSubject({
        ...empty,
        overdue_milestones: [milestone(3), milestone(1)],
        needs_action: [impl()],
        this_week_milestones: [milestone(-2)],
        unclaimed_deals: [deal()],
      }),
    ).toBe("Monday: 3 overdue · 1 due this week · 1 unclaimed deal");
  });

  it("finds the Monday of any day", () => {
    expect(weekOf(new Date("2026-09-21T12:00:00Z"))).toBe("2026-09-21"); // a Monday
    expect(weekOf(new Date("2026-09-24T03:00:00Z"))).toBe("2026-09-21"); // Thursday
    expect(weekOf(new Date("2026-09-27T23:00:00Z"))).toBe("2026-09-21"); // Sunday
    expect(daysBetween("2026-09-18", "2026-09-21")).toBe(3);
  });

  it("renders every section with a link to the record, and escapes names", () => {
    const html = renderDigestHtml(
      {
        ...empty,
        overdue_milestones: [milestone(4)],
        needs_action: [impl()],
        unclaimed_deals: [deal({ name: "Harbor & Sons <Plumbing>" })],
      },
      "https://www.gcinternalportal.com/",
    );
    expect(html).toContain("https://www.gcinternalportal.com/deals/d1");
    expect(html).toContain(
      "https://www.gcinternalportal.com/customers/c1?tab=overview&amp;impl=i1",
    );
    expect(html).toContain("4 days late");
    expect(html).toContain("Harbor &#38; Sons &#60;Plumbing&#62;");
    expect(html).not.toContain("<Plumbing>");
    expect(html).not.toContain("Due this week");
  });

  it("says so when the week is clear", () => {
    expect(renderDigestHtml(empty, "https://x.test")).toContain("Nothing is overdue");
  });
});

function deal(over: Partial<Digest["unclaimed_deals"][number]> = {}) {
  return {
    id: "d1",
    name: "Kenvirons",
    stage_label: "Onboarding Kickoff",
    days_in_stage: 9,
    next_step: "Generate the customer brief",
    unclaimed: true,
    owner_name: null,
    ...over,
  };
}
function impl() {
  return {
    id: "i1",
    customer_id: "c1",
    customer_name: "FGP Manufacturing",
    reason: "Launch is 12 days overdue.",
    next_action: "Book the go-live call",
    owner_name: "Teya Rampaul",
  };
}
function milestone(daysLate: number) {
  return {
    deal_id: "d1",
    deal_name: "Kenvirons",
    label: "Working session",
    date: "2026-09-17",
    days_late: daysLate,
    owner: "both" as const,
  };
}
