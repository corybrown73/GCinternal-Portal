import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import { timelineFor } from "../onboarding-plan";
import { bookingWarnings, datesIn, typedDatesFor, watchOutsFor } from "../watch-outs";

// Close Mon 21 Sep 2026: the form is live Mon 12 Oct (day 15); a phase-2
// custom PDF (6 weeks, so phase 2 runs to 24 Nov) and a Kronos integration
// (tier 3) run from the day after.
const intake = readIntake({
  path: "new_logo",
  wanted_forms: [{ id: "f1", name: "Storm Damage Assessment" }],
  timeline: {
    form_proven_on: "2026-09-30",
    services: [
      { id: "pdf", kind: "custom_pdf", name: "FEMA damage PDF", phase: 2, weeks: 6 },
      { id: "int", kind: "integration", name: "Kronos timesheets", phase: 2, tier: 3 },
    ],
    sow_notes: [
      "Named target dates (text only): SDA in production 9 Oct; Kronos in production 13 Nov.",
    ],
  },
});
const timeline = timelineFor(intake, "2026-09-21");

const brief = {
  risks_open_items: [
    "Storm season — first week of November, no later (Ray).",
    "iPads not procured; Priya quoted 2–3 weeks lead time.",
    "Ray Okonkwo is out 5–16 Oct and owns the damage-category rubric.",
    "The AE told the customer the custom PDF is about two weeks.",
  ],
  process_gaps: [],
  what_we_know: [{ topic: "SSO", detail: "Okta SSO was asked about twice on the second call." }],
  stakeholders: [{ name: "Ray Okonkwo", role: "Operations manager", notes: "" }],
  discovery_questions: [],
  kickoff: { out_of_scope: "Okta SSO, JSA form" },
};

describe("datesIn", () => {
  it("reads named days, ranges and qualified months in the plan's year", () => {
    expect(datesIn("out 5–16 Oct", "2026-09-21").map((d) => d.iso)).toEqual([
      "2026-10-05",
      "2026-10-16",
    ]);
    expect(datesIn("first week of November, no later", "2026-09-21")[0]?.iso).toBe("2026-11-07");
    expect(datesIn("SDA in production 9 Oct", "2026-09-21")[0]?.iso).toBe("2026-10-09");
    expect(datesIn("by Jan 15", "2026-09-21")[0]?.iso).toBe("2027-01-15");
  });
});

const notes = [
  `Call recap 17 Sept.
Ray: "Storm season starts the first week of November, no later — that is the deadline."
Priya said the iPads are not procured yet; 2–3 weeks lead time from the vendor.
Ray Okonkwo is out Oct 5–16 and nobody else owns the damage-category rubric.
The AE told them the custom PDF is about two weeks.
They asked about Okta SSO twice.`,
];

describe("watchOutsFor", () => {
  const rows = watchOutsFor({ brief, notes, intake, timeline });
  const titles = rows.map((r) => `${r.severity}: ${r.title}`);

  it("flags a deadline from the calls that the plan runs past", () => {
    expect(
      titles.some((t) =>
        t.startsWith(
          "conflict: The calls name Sat, Nov 7; the plan has everything live Tue, Nov 24",
        ),
      ),
    ).toBe(true);
  });

  it("flags device lead time against the field test", () => {
    expect(titles.some((t) => /conflict: Devices 3 weeks out; the field test is/.test(t))).toBe(
      true,
    );
  });

  it("names the absent person and the phase it lands in", () => {
    expect(
      titles.some((t) =>
        /check: Ray Okonkwo is out Mon, Oct 5 – Fri, Oct 16, during phase 1/i.test(t),
      ),
    ).toBe(true);
  });

  it("compares what the customer was told with the plan's weeks", () => {
    expect(
      titles.some((t) => t === "conflict: FEMA damage PDF: they were told 2 weeks; the plan has 6"),
    ).toBe(true);
  });

  it("surfaces an exclusion the calls kept raising", () => {
    expect(
      titles.some((t) => t === "check: Raised on the calls, listed as out of scope: Okta SSO"),
    ).toBe(true);
    expect(titles.some((t) => t.includes("JSA form"))).toBe(false);
  });

  it("reads the SOW's named dates against the plan, met or missed", () => {
    const sda = rows.find((r) => r.source === "sow" && r.title.includes("Oct 9"));
    // Day 15 lands one business day past the SOW's 9 Oct: flagged.
    expect(sda?.severity).toBe("conflict");
    expect(sda?.title).toContain("Storm Damage Assessment live Mon, Oct 12");
    const kronos = rows.find((r) => r.source === "sow" && r.title.includes("Nov 13"));
    expect(kronos?.severity).toBe("ok");
  });

  it("orders conflicts before checks before what is met", () => {
    const order = rows.map((r) => r.severity);
    const first = (s: string) => order.indexOf(s as never);
    expect(first("conflict")).toBeLessThan(first("check"));
    expect(first("check")).toBeLessThan(first("ok"));
  });

  it("quotes the pasted notes, not the brief's paraphrase, when both say it", () => {
    const lead = rows.find((r) => r.title.startsWith("Devices 3 weeks out"));
    expect(lead?.source).toBe("calls");
    expect(lead?.quote).toBe(
      "Priya said the iPads are not procured yet; 2–3 weeks lead time from the vendor.",
    );
  });

  it("labels what only the brief recorded as the brief's", () => {
    const scope = rows.find((r) => r.title.includes("Okta SSO"));
    expect(scope?.source).toBe("brief");
    expect(scope?.title).toBe("Raised on the calls, listed as out of scope: Okta SSO");
  });

  it("says when a deadline from the calls is met, with the margin", () => {
    const shortPlan = timelineFor(
      readIntake({ path: "new_logo", wanted_forms: [{ id: "f1", name: "SDA" }] }),
      "2026-09-21",
    );
    const ok = watchOutsFor({ brief: null, notes, intake: readIntake(null), timeline: shortPlan });
    const met = ok.find((r) => r.title.startsWith("The calls name Sat, Nov 7:"));
    expect(met?.severity).toBe("ok");
  });

  it("notes a promised duration with nothing on the plan to hold it against", () => {
    const shortPlan = timelineFor(readIntake({ path: "new_logo" }), "2026-09-21");
    const rows2 = watchOutsFor({
      brief: null,
      notes,
      intake: readIntake(null),
      timeline: shortPlan,
    });
    expect(
      rows2.some(
        (r) =>
          r.severity === "check" &&
          r.title === "They were told 2 weeks for the custom PDF; nothing on the plan for it yet",
      ),
    ).toBe(true);
  });

  it("is empty with nothing to read", () => {
    expect(watchOutsFor({ brief: null, intake: readIntake(null), timeline })).toEqual([]);
  });
});

describe("typed dates", () => {
  const typedIntake = readIntake({
    path: "new_logo",
    wanted_forms: [{ id: "f1", name: "Storm Damage Assessment" }],
    timeline: {
      form_proven_on: "2026-09-30",
      services: [{ id: "pdf", kind: "custom_pdf", name: "FEMA damage PDF", phase: 2, weeks: 6 }],
      sow_notes: ["Named target dates (text only): SDA in production 9 Oct."],
      sow_dates: [
        {
          type: "deadline",
          date: "2026-10-30",
          end: null,
          who: null,
          quote: "SDA in production by Oct 30",
        },
      ],
    },
  });
  const typedTimeline = timelineFor(typedIntake, "2026-09-21");
  const typedBrief = {
    ...brief,
    risks_open_items: ["Storm season — end of October, no later (Ray)."],
    dates: [
      {
        type: "absence",
        date: "2026-10-05",
        end: "2026-10-16",
        who: "Ray Okonkwo",
        quote: "Ray is out Oct 5–16 and owns the rubric.",
      },
      {
        type: "deadline",
        date: "2026-11-07",
        end: null,
        who: null,
        quote: "Storm season starts the first week of November — Nov 7 at the latest.",
      },
    ],
  };
  const rows = watchOutsFor({
    brief: typedBrief,
    notes,
    intake: typedIntake,
    timeline: typedTimeline,
  });

  it("reads the dates the readers typed, and stops guessing days from months", () => {
    const sow = rows.filter((r) => r.source === "sow");
    expect(sow.map((r) => r.type)).toEqual(["deadline"]);
    expect(sow[0]!.title).toContain("Oct 30");
    // The prose "9 Oct" in sow_notes is no longer read as a day.
    expect(rows.some((r) => r.title.includes("Oct 9"))).toBe(false);
    // "end of October" in the brief's risks never becomes Oct 28.
    expect(rows.some((r) => r.title.includes("Oct 28"))).toBe(false);
  });

  it("names the absent person once, with the window, from the typed absence", () => {
    const out = rows.filter((r) => r.type === "absence");
    expect(out).toHaveLength(1);
    expect(out[0]!.who).toBe("Ray Okonkwo");
    expect(out[0]!.title).toMatch(/Ray Okonkwo is out Mon, Oct 5 – Fri, Oct 16, during phase 1/);
  });

  it("every row carries its type and quote", () => {
    for (const r of rows) {
      expect(r.type).toBeTruthy();
      expect(r.quote.length).toBeGreaterThan(0);
    }
  });

  it("warns a booking that lands in an absence or after a deadline", () => {
    const typed = typedDatesFor({ brief: typedBrief, intake: typedIntake });
    const all = [...(typed.sow ?? []), ...(typed.brief ?? [])];
    expect(bookingWarnings("2026-10-07", all)).toEqual([
      "Ray Okonkwo is out Mon, Oct 5 – Fri, Oct 16",
    ]);
    expect(bookingWarnings("2026-11-10", all)).toEqual([
      "After Fri, Oct 30, the date the SOW names",
      "After Sat, Nov 7, the date the calls name",
    ]);
    expect(bookingWarnings("2026-09-28", all)).toEqual([]);
  });
});
