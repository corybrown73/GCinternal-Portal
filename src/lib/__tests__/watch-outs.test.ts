import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import { timelineFor } from "../onboarding-plan";
import { datesIn, watchOutsFor } from "../watch-outs";

// Close Mon 21 Sep 2026: the form is live 30 Sep; a phase-2 custom PDF
// (6 weeks, so phase 2 runs to 12 Nov) and a Kronos integration (tier 3)
// run from the first of October.
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

describe("watchOutsFor", () => {
  const rows = watchOutsFor({ brief, intake, timeline });
  const titles = rows.map((r) => `${r.severity}: ${r.title}`);

  it("flags a deadline from the calls that the plan runs past", () => {
    expect(
      titles.some((t) =>
        t.startsWith(
          "conflict: The calls name Sat, Nov 7; the plan has everything live Thu, Nov 12",
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
        /check: Ray Okonkwo is out Mon, Oct 5 – Fri, Oct 16, during Phase 2/i.test(t),
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
      titles.some(
        (t) => t === "check: Asked about on the calls, out of scope in the SOW: Okta SSO",
      ),
    ).toBe(true);
    expect(titles.some((t) => t.includes("JSA form"))).toBe(false);
  });

  it("reads the SOW's named dates against the plan, met or missed", () => {
    const sda = rows.find((r) => r.source === "sow" && r.title.includes("Oct 9"));
    expect(sda?.severity).toBe("ok");
    expect(sda?.title).toContain("Storm Damage Assessment live Wed, Sep 30");
    const kronos = rows.find((r) => r.source === "sow" && r.title.includes("Nov 13"));
    expect(kronos?.severity).toBe("ok");
  });

  it("orders conflicts before checks before what is met", () => {
    const order = rows.map((r) => r.severity);
    const first = (s: string) => order.indexOf(s as never);
    expect(first("conflict")).toBeLessThan(first("check"));
    expect(first("check")).toBeLessThan(first("ok"));
  });

  it("is empty with nothing to read", () => {
    expect(watchOutsFor({ brief: null, intake: readIntake(null), timeline })).toEqual([]);
  });
});
