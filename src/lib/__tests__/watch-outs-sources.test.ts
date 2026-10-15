import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import { timelineFor } from "../onboarding-plan";
import { sowFactsFrom } from "../sow-plan";
import { watchOutsFor } from "../watch-outs";

/**
 * The QA deal's planted conflicts, as fixtures: the SOW says 45 licenses,
 * Denver live Nov 9, all branches by Nov 30, QuickBooks Online (QBO) in
 * phase 2 and a Backflow PDF; the calls say 40 licenses, Denver by Nov 2
 * and QBO in phase 1, and want backflow before spring.
 */

const CLOSE = "2026-10-01";

const sowNotes = [
  "Denver branch go-live: November 9, 2026.",
  "All branches live on GoCanvas by November 30, 2026.",
];
const sowDates = [
  {
    type: "deadline" as const,
    date: "2026-11-09",
    end: null,
    who: null,
    quote: "Denver branch go-live: November 9, 2026.",
  },
  {
    type: "deadline" as const,
    date: "2026-11-30",
    end: null,
    who: null,
    quote: "All branches live on GoCanvas by November 30, 2026.",
  },
];
const sowFacts = sowFactsFrom({
  seats: 45,
  services: [
    {
      name: "QuickBooks Online integration",
      phase: 2,
      evidence: "Phase 2: QuickBooks Online integration via Zapier, after the work order is live.",
    },
  ],
});

const notes = [
  {
    date: "2026-09-24",
    text: `Discovery recap.
Dana confirmed they have 40 licenses for the field techs.
Denver needs to be live by Nov 2, before the winter rush.
Dana wants the QBO sync in phase 1 so billing stops being re-keyed.
They want backflow test reports sorted before spring, Mar 1.`,
  },
];
const brief = {
  account_name: "Summit Plumbing",
  stakeholders: [{ name: "Dana Ortiz", role: "Operations director", notes: "" }],
};

/** The plan before the SOW is read: just the first form. */
const unreadIntake = readIntake({
  path: "new_logo",
  wanted_forms: [{ id: "f1", name: "Service Work Order" }],
});
/** After the SOW reading applied: its services, notes, dates and facts. */
const readIntakeAfterSow = readIntake({
  path: "new_logo",
  wanted_forms: [{ id: "f1", name: "Service Work Order" }],
  timeline: {
    sow_applied_at: "2026-10-02T00:00:00Z",
    services: [
      { id: "qbo", kind: "integration", name: "QuickBooks Online integration", phase: 2, tier: 2 },
    ],
    sow_notes: sowNotes,
    sow_dates: sowDates,
    sow_facts: sowFacts,
  },
});

const rowsFor = (intake: ReturnType<typeof readIntake>) =>
  watchOutsFor({ brief, notes, intake, timeline: timelineFor(intake, CLOSE) });

describe("a date the plan does not cover", () => {
  it("is a check, never met: backflow with no backflow item on the plan", () => {
    const rows = rowsFor(unreadIntake);
    const backflow = rows.find((r) => r.quote.includes("backflow"));
    expect(backflow?.severity).toBe("check");
    expect(backflow?.title).toBe(
      "The calls name Mon, Mar 1 for the custom PDF: nothing on the plan for it",
    );
    expect(rows.some((r) => r.severity === "ok" && r.quote.includes("backflow"))).toBe(false);
  });

  it("reads a dated item against that item once it is on the plan", () => {
    const withPdf = readIntake({
      path: "new_logo",
      wanted_forms: [{ id: "f1", name: "Service Work Order" }],
      timeline: {
        services: [{ id: "bf", kind: "custom_pdf", name: "Backflow PDF", phase: 2, weeks: 4 }],
      },
    });
    const rows = rowsFor(withPdf);
    const backflow = rows.find((r) => r.quote.includes("backflow"));
    expect(backflow?.title).toContain("the plan has Backflow PDF live");
  });

  it("does not count the SOW's branch dates as met by the plan's own dates", () => {
    const rows = rowsFor(readIntakeAfterSow);
    const allBranches = rows.find((r) => r.source === "sow" && r.title.includes("Nov 30"));
    expect(allBranches?.severity).toBe("check");
    expect(allBranches?.title).toBe(
      "The SOW names Mon, Nov 30 for all branches: nothing on the plan for it",
    );
    const denver = rows.find(
      (r) => r.source === "sow" && r.type === "deadline" && r.title.includes("Nov 9"),
    );
    expect(denver?.severity).toBe("check");
    expect(denver?.title).toBe("The SOW names Mon, Nov 9 for Denver: nothing on the plan for it");
  });

  it("still reads a sentence about the whole go-live against everything live", () => {
    const intake = readIntake({
      path: "new_logo",
      wanted_forms: [{ id: "f1", name: "Work Order" }],
    });
    const rows = watchOutsFor({
      brief: null,
      notes: ["We have to go live by December 15 at the latest."],
      intake,
      timeline: timelineFor(intake, CLOSE),
    });
    expect(rows[0]?.severity).toBe("ok");
    expect(rows[0]?.title).toContain("the plan has everything live");
  });
});

describe("the SOW against the calls", () => {
  const rows = rowsFor(readIntakeAfterSow);
  const disagreements = rows.filter((r) => r.type === "disagreement");

  it("flags the seat count, naming both sources with their quotes", () => {
    const seats = disagreements.find((r) => r.title.startsWith("Seats"));
    expect(seats?.title).toBe("Seats: the SOW says 45, the calls say 40");
    expect(seats?.severity).toBe("check");
    expect(seats?.source).toBe("sow");
    expect(seats?.against).toEqual({
      source: "calls",
      quote: "Dana confirmed they have 40 licenses for the field techs.",
    });
    expect(seats?.detail).toContain("SOW: “45 seats”");
    expect(seats?.detail).toContain("Calls: “Dana confirmed they have 40 licenses");
  });

  it("flags Denver: Nov 9 in the SOW, Nov 2 on the calls", () => {
    const denver = disagreements.find((r) => r.title.includes("Denver"));
    expect(denver?.title).toBe(
      "The SOW and the calls give different dates for Denver: Mon, Nov 9 vs Mon, Nov 2",
    );
    expect(denver?.quote).toBe("Denver branch go-live: November 9, 2026.");
    expect(denver?.against?.quote).toBe(
      "Denver needs to be live by Nov 2, before the winter rush.",
    );
    expect(denver?.severity).toBe("check");
  });

  it("flags QuickBooks: phase 2 in the SOW, phase 1 on the calls", () => {
    const qbo = disagreements.find((r) => r.title.startsWith("QuickBooks"));
    expect(qbo?.title).toBe(
      "QuickBooks Online integration: the SOW puts it in phase 2, the calls in phase 1",
    );
    expect(qbo?.quote).toContain("Phase 2: QuickBooks Online integration via Zapier");
    expect(qbo?.against).toEqual({
      source: "calls",
      quote: "Dana wants the QBO sync in phase 1 so billing stops being re-keyed.",
    });
  });

  it("is advisory: every disagreement is a check, never a conflict, and moves no date", () => {
    expect(disagreements.length).toBe(3);
    expect(disagreements.every((r) => r.severity === "check")).toBe(true);
    const plan = timelineFor(readIntakeAfterSow, CLOSE);
    expect(plan.milestones.some((m) => m.date === "2026-11-09" || m.date === "2026-11-30")).toBe(
      false,
    );
  });

  it("says nothing when the sources agree", () => {
    const agreeing = readIntake({
      ...readIntakeAfterSow,
      timeline: {
        ...readIntakeAfterSow.timeline,
        sow_facts: sowFactsFrom({
          seats: 40,
          services: [
            {
              name: "QuickBooks Online integration",
              phase: 1,
              evidence: "QuickBooks Online integration alongside the form.",
            },
          ],
        }),
        sow_dates: [{ ...sowDates[0]!, date: "2026-11-02" }],
      },
    });
    expect(rowsFor(agreeing).filter((r) => r.type === "disagreement")).toEqual([]);
  });

  it("says nothing before the SOW is read", () => {
    expect(rowsFor(unreadIntake).filter((r) => r.type === "disagreement")).toEqual([]);
  });

  it("reads the brief's seat count when the notes give none", () => {
    const rows2 = watchOutsFor({
      brief: { ...brief, kickoff: { licensed_seats: "40 licenses" } },
      notes: [],
      intake: readIntakeAfterSow,
      timeline: timelineFor(readIntakeAfterSow, CLOSE),
    });
    const seats = rows2.find((r) => r.title.startsWith("Seats"));
    expect(seats?.title).toBe("Seats: the SOW says 45, the brief says 40");
    expect(seats?.against).toEqual({ source: "brief", quote: "40 licenses" });
  });
});

describe("a place's own go-live on the calls", () => {
  it("is not read against everything live", () => {
    const rows = rowsFor(unreadIntake);
    const denver = rows.find((r) => r.quote.startsWith("Denver needs"));
    expect(denver?.severity).toBe("check");
    expect(denver?.title).toBe("The calls name Mon, Nov 2 for Denver: nothing on the plan for it");
  });

  it("but the customer's own name is the whole go-live", () => {
    const rows = watchOutsFor({
      brief,
      notes: ["Summit needs to be live by Dec 15."],
      intake: unreadIntake,
      timeline: timelineFor(unreadIntake, CLOSE),
    });
    expect(rows[0]?.title).toContain("the plan has everything live");
  });
});

describe("sources that agree are not flagged", () => {
  const afterSow = (timeline: Record<string, unknown>) =>
    readIntake({
      path: "new_logo",
      wanted_forms: [{ id: "f1", name: "Service Work Order" }],
      timeline: { sow_applied_at: "2026-10-02T00:00:00Z", ...timeline },
    });
  const disagreementsFor = (intake: ReturnType<typeof readIntake>, text: string) =>
    watchOutsFor({
      brief,
      notes: [{ date: "2026-09-24", text }],
      intake,
      timeline: timelineFor(intake, CLOSE),
    }).filter((r) => r.type === "disagreement");

  it("does not read a SOW start against a calls deadline", () => {
    const start = "Denver branch rollout starts November 2, 2026.";
    const intake = afterSow({
      sow_notes: [start, sowNotes[0]!],
      sow_dates: [
        { type: "start", date: "2026-11-02", end: null, who: null, quote: start },
        sowDates[0]!,
      ],
    });
    expect(disagreementsFor(intake, "Denver needs to be live by Nov 9.")).toEqual([]);
  });

  it("does not take a count of users over the licence count that agrees", () => {
    const intake = afterSow({ sow_facts: sowFactsFrom({ seats: 45, services: [] }) });
    const rows = disagreementsFor(
      intake,
      "They have 3 office users who will build forms. They bought 45 licenses for techs.",
    );
    expect(rows.filter((r) => r.title.startsWith("Seats"))).toEqual([]);
  });

  it("does not make a shared first word into a shared subject", () => {
    const sowLine = "Admin training to be completed by November 30, 2026.";
    const intake = afterSow({
      sow_notes: [sowLine],
      sow_dates: [{ type: "deadline", date: "2026-11-30", end: null, who: null, quote: sowLine }],
    });
    expect(
      disagreementsFor(intake, "Admin access needs to be ready by Nov 2 for the office."),
    ).toEqual([]);
  });
});
