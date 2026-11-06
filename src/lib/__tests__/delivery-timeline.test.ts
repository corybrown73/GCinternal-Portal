import { describe, expect, it } from "vitest";

import { addBusinessDays } from "../onboarding-timeline";
import {
  TIER_TARGET_BUSINESS_DAYS,
  addCalendarDays,
  addCalendarMonths,
  addSowDuration,
  completionLabel,
  deliveryFromStored,
  effectiveCompletion,
  parseDeliveryTimeline,
  suggestDeliveryDates,
  type DeliveryInputs,
  type SowDeliveryTimeline,
} from "../delivery-timeline";

/** Riverbay Corp's SOW, Delivery Timeline paragraph, verbatim as printed. */
const RIVERBAY =
  "The estimated timeline for completion of the solution is 4 to 6 weeks, commencing once all form builds and edits have been finalized. GoCanvas will make every reasonable effort to meet or exceed this schedule. However, the timeline is subject to change if there are delays in receiving required deliverables from the Client. These deliverables may include necessary systems or environments, submitting finalized forms and documentation, ensuring availability for meetings and reviews, and allocating appropriate resources to support project activities. Any delays in these areas may result in a corresponding adjustment to the project timeline.";

const base: DeliveryInputs = {
  sow: null,
  tierNumber: null,
  closeDate: null,
  kickoffDate: null,
  signedDate: null,
  formsFinalisedOn: null,
  holidays: [],
  sowDeadlines: [],
  sowNotes: [],
};

const sowFrom = (text: string): SowDeliveryTimeline => {
  const parsed = parseDeliveryTimeline(text);
  if (!parsed) throw new Error("no paragraph");
  return parsed;
};

describe("reading the SOW's Delivery Timeline paragraph", () => {
  it("keeps the paragraph verbatim and reads the stated duration in its own unit", () => {
    const d = sowFrom(RIVERBAY);
    expect(
      d.quote.startsWith("The estimated timeline for completion of the solution is 4 to 6 weeks"),
    ).toBe(true);
    expect(d.duration).toEqual({ text: "4 to 6 weeks", unit: "week", min: 4, max: 6 });
  });

  it("reads the starting condition as the SOW states it: after form finalisation, not kickoff", () => {
    const d = sowFrom(RIVERBAY);
    expect(d.startCondition).toBe("forms_finalised");
    expect(d.startText).toBe("all form builds and edits have been finalized");
  });

  it("reads the customer deliverables that can move the timeline", () => {
    expect(sowFrom(RIVERBAY).dependencies).toEqual([
      "necessary systems or environments",
      "submitting finalized forms and documentation",
      "ensuring availability for meetings and reviews",
      "allocating appropriate resources to support project activities",
    ]);
  });

  it("keeps a paragraph with no stated duration as the source, but not usable for a date", () => {
    const d = parseDeliveryTimeline("GoCanvas will schedule the work with the Client as agreed.");
    expect(d).not.toBeNull();
    expect(d?.duration).toBeNull();
  });

  it("returns nothing for no text at all", () => {
    expect(parseDeliveryTimeline("   ")).toBeNull();
    expect(parseDeliveryTimeline(null)).toBeNull();
  });
});

describe("SOW durations keep their printed unit and their starting condition", () => {
  it("weeks are counted as calendar weeks, never converted to business days or to the tier target", () => {
    const sow = sowFrom(RIVERBAY);
    const s = suggestDeliveryDates({
      ...base,
      sow,
      formsFinalisedOn: "2026-10-05",
      tierNumber: 3,
      closeDate: "2026-09-01",
    });
    expect(s.basis).toBe("sow");
    expect(s.duration?.unit).toBe("week");
    // 4 and 6 calendar weeks from Monday 5 October 2026: 28 and 42 calendar days.
    expect(s.from).toBe("2026-11-02");
    expect(s.to).toBe("2026-11-16");
    expect(s.assumptions.join(" ")).toMatch(/calendar weeks as the SOW states them/);
    expect(s.assumptions.join(" ")).toMatch(/not business days, not the tier target/);
  });

  it("a month duration is counted in calendar months, not as 30 days", () => {
    expect(addSowDuration("2026-01-31", 1, "month")).toBe("2026-02-28");
    expect(addCalendarMonths("2026-03-15", 2)).toBe("2026-05-15");
  });

  it("a day duration printed in the SOW is counted in the days it prints", () => {
    const sow = sowFrom(
      "Delivery is estimated at 10 days, starting once the signed order is received.",
    );
    expect(sow.duration).toEqual({ text: "10 days", unit: "day", min: 10, max: 10 });
    const s = suggestDeliveryDates({ ...base, sow, signedDate: "2026-10-01" });
    expect(s.to).toBe("2026-10-11");
  });
});

describe("the delivery clock starts where the SOW says, never from kickoff by default", () => {
  it("does not start from kickoff when the SOW starts after form finalisation and the day is not recorded", () => {
    const s = suggestDeliveryDates({
      ...base,
      sow: sowFrom(RIVERBAY),
      kickoffDate: "2026-09-01",
      closeDate: "2026-08-20",
    });
    expect(s.from).toBeNull();
    expect(s.to).toBeNull();
    expect(s.startDate).toBeNull();
    expect(s.missing).toMatch(/not recorded yet, so no completion date is proposed/);
  });

  it("counts from the recorded finalisation day, not from kickoff", () => {
    const s = suggestDeliveryDates({
      ...base,
      sow: sowFrom(RIVERBAY),
      kickoffDate: "2026-09-01",
      formsFinalisedOn: "2026-10-05",
    });
    expect(s.startDate).toBe("2026-10-05");
    expect(s.from).not.toBe(addCalendarDays("2026-09-01", 28));
    expect(s.from).toBe("2026-11-02");
  });

  it("a kickoff-start SOW counts from kickoff, and says so", () => {
    const sow = sowFrom("The timeline is 4 to 6 weeks, commencing at kickoff.");
    expect(sow.startCondition).toBe("kickoff");
    const s = suggestDeliveryDates({ ...base, sow, kickoffDate: "2026-09-07" });
    expect(s.startCondition).toBe("From kickoff");
    expect(s.from).toBe("2026-10-05");
    expect(s.missing).toBeNull();
  });

  it("a kickoff-start SOW with no kickoff date proposes nothing and says why", () => {
    const sow = sowFrom("The timeline is 4 to 6 weeks, commencing at kickoff.");
    const s = suggestDeliveryDates({ ...base, sow, kickoffDate: null });
    expect(s.from).toBeNull();
    expect(s.missing).toMatch(/kickoff date is not set/);
  });

  it("an unstated start proposes nothing, and asks for the start to be confirmed", () => {
    const sow = sowFrom("The timeline is 4 to 6 weeks.");
    expect(sow.startCondition).toBe("unstated");
    const s = suggestDeliveryDates({
      ...base,
      sow,
      kickoffDate: "2026-09-07",
      closeDate: "2026-09-01",
    });
    expect(s.from).toBeNull();
    expect(s.missing).toMatch(/does not say when the delivery clock starts/);
  });
});

describe("the SOW takes precedence over the complexity tier, and expedited terms over both", () => {
  it("a usable SOW timeline is used in place of the tier target", () => {
    const s = suggestDeliveryDates({
      ...base,
      sow: sowFrom(RIVERBAY),
      formsFinalisedOn: "2026-10-05",
      tierNumber: 5,
      closeDate: "2026-09-01",
    });
    expect(s.basis).toBe("sow");
    expect(s.from).not.toBe(addBusinessDays("2026-09-01", TIER_TARGET_BUSINESS_DAYS[5]));
  });

  it("an unusable paragraph falls back to the tier target", () => {
    const s = suggestDeliveryDates({
      ...base,
      sow: sowFrom("GoCanvas will schedule the work as agreed."),
      tierNumber: 2,
      closeDate: "2026-09-01",
    });
    expect(s.basis).toBe("tier");
  });

  it("an expedited date the SOW prints takes priority over the SOW duration and the tier target", () => {
    const s = suggestDeliveryDates({
      ...base,
      sow: sowFrom(RIVERBAY),
      formsFinalisedOn: "2026-10-05",
      tierNumber: 4,
      closeDate: "2026-09-01",
      sowDeadlines: [
        { date: "2026-10-30", who: "Client", quote: "Required live by 30 October 2026." },
      ],
      sowNotes: ["The Client has asked for an expedited rollout."],
    });
    expect(s.basis).toBe("expedited");
    expect(s.from).toBe("2026-10-30");
    expect(s.to).toBe("2026-10-30");
    expect(s.assumptions.join(" ")).toMatch(/subject to resource review/);
    expect(s.expedite).toEqual(["The Client has asked for an expedited rollout."]);
  });

  it("expedited wording with no date proposes nothing, and never substitutes the tier target", () => {
    const s = suggestDeliveryDates({
      ...base,
      tierNumber: 1,
      closeDate: "2026-09-01",
      sowNotes: ["Accelerated delivery may be possible."],
    });
    expect(s.basis).toBe("none");
    expect(s.from).toBeNull();
    expect(s.missing).toMatch(/gives no date/);
  });

  it("an expedited commitment is shown and never committed: the decks say it is not agreed", () => {
    const s = suggestDeliveryDates({
      ...base,
      tierNumber: 1,
      closeDate: "2026-09-01",
      sowDeadlines: [{ date: "2026-10-30", who: null, quote: "by 30 October" }],
      sowNotes: ["Expedited work is subject to a fee."],
    });
    const label = completionLabel({ from: s.from, to: s.to, source: s.basis });
    expect(label).toMatch(/Not yet agreed with the customer/);
  });
});

describe("complexity-tier targets are business days and skip weekends", () => {
  const tier1 = (close: string, holidays: string[] = []) =>
    suggestDeliveryDates({ ...base, tierNumber: 1, closeDate: close, holidays });

  it("counts Tier 1 as 30 business days", () => {
    expect(TIER_TARGET_BUSINESS_DAYS).toEqual({ 1: 30, 2: 45, 3: 90, 4: 120, 5: 150 });
    const s = tier1("2026-09-01");
    expect(s.from).toBe(addBusinessDays("2026-09-01", 30));
    expect(s.basis).toBe("tier");
  });

  it("skips weekends when the close falls on a Friday", () => {
    const s = tier1("2026-10-02");
    expect(s.from).toBe(addBusinessDays("2026-10-02", 30));
    expect(s.from).toBe("2026-11-13");
    expect(new Date(`${s.from}T12:00:00Z`).getUTCDay()).toBe(5);
  });

  it("counts from the first business day when the close falls on a Saturday", () => {
    const s = tier1("2026-10-03");
    expect(s.from).toBe(addBusinessDays("2026-10-03", 30));
    expect(new Date(`${s.from}T12:00:00Z`).getUTCDay()).not.toBe(0);
    expect(new Date(`${s.from}T12:00:00Z`).getUTCDay()).not.toBe(6);
  });

  it("counts from the first business day when the close falls on a Sunday", () => {
    const s = tier1("2026-10-04");
    expect(s.from).toBe(addBusinessDays("2026-10-04", 30));
    const day = new Date(`${s.from}T12:00:00Z`).getUTCDay();
    expect(day >= 1 && day <= 5).toBe(true);
  });

  it("uses the deal's own holidays, and no others", () => {
    const plain = tier1("2026-09-01");
    const holiday = tier1("2026-09-01", ["2026-09-21"]);
    expect(holiday.from).not.toBe(plain.from);
    expect(holiday.from).toBe(addBusinessDays("2026-09-01", 30, ["2026-09-21"]));
  });

  it("maps Tier 0 (no integration) to Tier 1, and says so", () => {
    const s = suggestDeliveryDates({ ...base, tierNumber: 0, closeDate: "2026-09-01" });
    expect(s.from).toBe(addBusinessDays("2026-09-01", 30));
    expect(s.assumptions.join(" ")).toMatch(/counts as Tier 1/);
  });

  it("uses the Tier 5 target of 150 business days", () => {
    const s = suggestDeliveryDates({ ...base, tierNumber: 5, closeDate: "2026-09-01" });
    expect(s.from).toBe(addBusinessDays("2026-09-01", 150));
  });

  it("states the tier unit in its assumption and its label, not calendar days", () => {
    const s = tier1("2026-09-01");
    expect(s.assumptions.join(" ")).toMatch(/30 business days from the close, skipping weekends/);
    expect(completionLabel({ from: s.from, to: s.to, source: s.basis })).toMatch(
      /complexity tier, in business days/,
    );
  });
});

describe("missing data proposes nothing and says what is missing", () => {
  it("no SOW timeline and no tier: no date", () => {
    const s = suggestDeliveryDates({ ...base });
    expect(s.basis).toBe("none");
    expect(s.from).toBeNull();
    expect(s.missing).toMatch(/no date is proposed/);
  });

  it("a tier but no close date: no date", () => {
    const s = suggestDeliveryDates({ ...base, tierNumber: 2 });
    expect(s.from).toBeNull();
    expect(s.missing).toMatch(/close date is not recorded/);
  });
});

describe("suggestions are editable, saved dates are the TIS's and never agreed", () => {
  const suggestion = suggestDeliveryDates({ ...base, tierNumber: 1, closeDate: "2026-09-01" });

  it("with nothing saved, the suggestion stands, labelled as proposed", () => {
    const e = effectiveCompletion(suggestion, null);
    expect(e).toEqual({ from: suggestion.from, to: suggestion.to, source: "tier" });
    expect(completionLabel(e)).toMatch(/Proposed from the complexity tier/);
  });

  it("the TIS's saved completion dates replace the suggestion and are labelled as the TIS's adjustment", () => {
    const e = effectiveCompletion(suggestion, {
      formsFinalisedOn: null,
      completionFrom: "2026-11-20",
      completionTo: "2026-12-04",
      adjustedReason: "Client availability moves the review to late November.",
    });
    expect(e).toEqual({ from: "2026-11-20", to: "2026-12-04", source: "tis" });
    expect(completionLabel(e)).toMatch(/Adjusted by the TIS/);
    expect(completionLabel(e)).toMatch(/Not yet agreed with the customer/);
  });

  it("a saved range with one end missing does not replace the suggestion", () => {
    const e = effectiveCompletion(suggestion, {
      formsFinalisedOn: null,
      completionFrom: "2026-11-20",
      completionTo: null,
      adjustedReason: "partial",
    });
    expect(e.source).toBe("tier");
  });

  it("formats dates the way the caller asks, so the Hub's own short day can be used", () => {
    const e = { from: "2026-11-20", to: "2026-12-04", source: "tis" as const };
    expect(completionLabel(e, (iso) => `[${iso}]`)).toMatch(/\[2026-11-20\] to \[2026-12-04\]/);
  });

  it("nothing is proposed, so there is no label to show", () => {
    expect(completionLabel({ from: null, to: null, source: "none" })).toBeNull();
  });
});

describe("a stored paragraph reads back the same as it was parsed", () => {
  it("round-trips through the intake's stored shape", () => {
    const parsed = sowFrom(RIVERBAY);
    const stored = {
      quote: parsed.quote,
      duration_text: parsed.duration?.text ?? null,
      duration_unit: parsed.duration?.unit ?? null,
      duration_min: parsed.duration?.min ?? null,
      duration_max: parsed.duration?.max ?? null,
      start_condition: parsed.startCondition,
      start_text: parsed.startText,
      dependencies: parsed.dependencies,
    };
    expect(deliveryFromStored(stored)).toEqual(parsed);
  });

  it("a stored paragraph with no unit reads back as no usable duration", () => {
    const back = deliveryFromStored({
      quote: "x",
      duration_text: null,
      duration_unit: null,
      duration_min: null,
      duration_max: null,
      start_condition: "unstated",
      start_text: null,
      dependencies: [],
    });
    expect(back?.duration).toBeNull();
  });
});
