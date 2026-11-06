import { describe, expect, it } from "vitest";

import { addBusinessDays } from "../onboarding-timeline";
import {
  addCalendarDays,
  addCalendarMonths,
  addSowDuration,
  completionLabel,
  deliveryFromStored,
  effectiveCompletion,
  parseDeliveryTimeline,
  suggestDeliveryDates,
  unitPhrase,
  type DeliveryInputs,
  type SowDeliveryTimeline,
  type TierTarget,
} from "../delivery-timeline";

/** Riverbay Corp's SOW, Delivery Timeline paragraph, exactly as printed (the PDF was read directly). */
const RIVERBAY =
  "The estimated timeline for completion of the solution is 4 to 6 weeks, commencing once all form builds and edits have been finalized. GoCanvas will make every reasonable effort to meet or exceed this schedule. However, the timeline is subject to change if there are delays in receiving required deliverables from the Client. These deliverables may include necessary systems or environments, submitting finalized forms and documentation, ensuring availability for meetings and reviews, and allocating appropriate resources to support project activities. Any delays in these areas may result in a corresponding adjustment to the project timeline.";

/** The Settings values under test: the authoritative targets for Tiers 1 to 5. */
const SETTINGS_DAYS: Record<number, number> = { 1: 30, 2: 45, 3: 90, 4: 120, 5: 150 };
const tier = (n: number, noIntegration = false): TierTarget => ({
  tier: n,
  businessDays: SETTINGS_DAYS[n]!,
  noIntegration,
});

const base: DeliveryInputs = {
  sow: null,
  tierTarget: null,
  tierMissing: null,
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

describe("SOW durations keep the unit the SOW prints", () => {
  it("weeks without 'business' are calendar weeks, never business days or the tier target", () => {
    const sow = sowFrom(RIVERBAY);
    const s = suggestDeliveryDates({
      ...base,
      sow,
      formsFinalisedOn: "2026-10-05",
      tierTarget: tier(3),
    });
    expect(s.basis).toBe("sow");
    expect(s.duration?.unit).toBe("week");
    // 4 and 6 calendar weeks from Monday 5 October 2026: 28 and 42 calendar days.
    expect(s.from).toBe("2026-11-02");
    expect(s.to).toBe("2026-11-16");
    expect(s.assumptions.join(" ")).toMatch(
      /counted in calendar weeks as the SOW states them, not the tier target/,
    );
  });

  it("days without 'business' are calendar days", () => {
    const sow = sowFrom(
      "Delivery is estimated at 10 days, starting once the signed order is received.",
    );
    expect(sow.duration).toEqual({ text: "10 days", unit: "day", min: 10, max: 10 });
    expect(addSowDuration("2026-10-01", 10, "day")).toBe("2026-10-11");
  });

  it("'business days' stay business days, skipping weekends from a Friday start", () => {
    const sow = sowFrom("Delivery is estimated at 5 business days, commencing at kickoff.");
    expect(sow.duration?.unit).toBe("business_day");
    // Friday 2 October 2026: five business days later is Friday 9 October.
    expect(addSowDuration("2026-10-02", 5, "business_day")).toBe("2026-10-09");
    const s = suggestDeliveryDates({ ...base, sow, kickoffDate: "2026-10-02" });
    expect(s.to).toBe("2026-10-09");
    expect(s.assumptions.join(" ")).toMatch(/counted in business days/);
  });

  it("'business weeks' are five business days each", () => {
    const sow = sowFrom("The timeline is 2 business weeks, commencing at kickoff.");
    expect(sow.duration?.unit).toBe("business_week");
    // Ten business days from Friday 2 October 2026 is Friday 16 October.
    expect(addSowDuration("2026-10-02", 2, "business_week")).toBe("2026-10-16");
    expect(unitPhrase("business_week")).toMatch(/five business days each/);
  });

  it("a month is a calendar month, clamped to the end of a shorter month", () => {
    expect(addSowDuration("2026-01-31", 1, "month")).toBe("2026-02-28");
    expect(addCalendarMonths("2026-03-15", 2)).toBe("2026-05-15");
  });

  it("'business months' is not a unit the SOW uses, so it is not read as a duration", () => {
    expect(
      sowFrom("The timeline is 2 business months, commencing at kickoff.").duration,
    ).toBeNull();
  });
});

describe("the delivery clock starts where the SOW says, never from the close date", () => {
  it("a finalisation start, with the day not recorded, proposes no completion date and never uses kickoff", () => {
    const s = suggestDeliveryDates({
      ...base,
      sow: sowFrom(RIVERBAY),
      kickoffDate: "2026-09-01",
      closeDate: "2026-08-20",
    });
    expect(s.from).toBeNull();
    expect(s.startDate).toBeNull();
    expect(s.missing).toMatch(/not recorded yet, so no completion date is proposed/);
  });

  it("a finalisation start counts from the recorded day, not from kickoff", () => {
    const s = suggestDeliveryDates({
      ...base,
      sow: sowFrom(RIVERBAY),
      kickoffDate: "2026-09-01",
      formsFinalisedOn: "2026-10-05",
    });
    expect(s.startDate).toBe("2026-10-05");
    expect(s.from).toBe("2026-11-02");
  });

  it("a signing start with no recorded signature date proposes nothing, and does not use the close date", () => {
    const sow = sowFrom("The timeline is 4 to 6 weeks, commencing once the Agreement is signed.");
    expect(sow.startCondition).toBe("signing");
    const s = suggestDeliveryDates({ ...base, sow, closeDate: "2026-08-20", signedDate: null });
    expect(s.from).toBeNull();
    expect(s.startDate).toBeNull();
    expect(s.missing).toMatch(/signature date is not recorded/);
    expect(s.missing).toMatch(/close date is not used/);
  });

  it("a signing start counts from the recorded signature date", () => {
    const sow = sowFrom("The timeline is 4 to 6 weeks, commencing once the Agreement is signed.");
    const s = suggestDeliveryDates({
      ...base,
      sow,
      closeDate: "2026-08-20",
      signedDate: "2026-09-01",
    });
    expect(s.startDate).toBe("2026-09-01");
    expect(s.from).toBe("2026-09-29");
    expect(s.to).toBe("2026-10-13");
  });

  it("a kickoff start counts from kickoff, and says so", () => {
    const sow = sowFrom("The timeline is 4 to 6 weeks, commencing at kickoff.");
    const s = suggestDeliveryDates({ ...base, sow, kickoffDate: "2026-09-07" });
    expect(s.startCondition).toBe("From kickoff");
    expect(s.from).toBe("2026-10-05");
  });

  it("a kickoff start with no kickoff date proposes nothing and says why", () => {
    const sow = sowFrom("The timeline is 4 to 6 weeks, commencing at kickoff.");
    const s = suggestDeliveryDates({ ...base, sow, kickoffDate: null });
    expect(s.from).toBeNull();
    expect(s.missing).toMatch(/kickoff date is not set/);
  });

  it("an unstated start proposes nothing, and says the SOW does not state it", () => {
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

describe("precedence: SOW over tier, and expedited dates over both", () => {
  it("a usable SOW timeline is used in place of the tier target", () => {
    const s = suggestDeliveryDates({
      ...base,
      sow: sowFrom(RIVERBAY),
      formsFinalisedOn: "2026-10-05",
      tierTarget: tier(5),
      closeDate: "2026-09-01",
    });
    expect(s.basis).toBe("sow");
    expect(s.from).not.toBe(addBusinessDays("2026-09-01", SETTINGS_DAYS[5]!));
  });

  it("an unusable paragraph falls back to the tier target", () => {
    const s = suggestDeliveryDates({
      ...base,
      sow: sowFrom("GoCanvas will schedule the work as agreed."),
      tierTarget: tier(2),
      closeDate: "2026-09-01",
    });
    expect(s.basis).toBe("tier");
  });

  it("an expedited date the SOW prints takes priority over the SOW duration and the tier target", () => {
    const s = suggestDeliveryDates({
      ...base,
      sow: sowFrom(RIVERBAY),
      formsFinalisedOn: "2026-10-05",
      tierTarget: tier(4),
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
      tierTarget: tier(1),
      closeDate: "2026-09-01",
      sowNotes: ["Accelerated delivery may be possible."],
    });
    expect(s.basis).toBe("none");
    expect(s.from).toBeNull();
    expect(s.missing).toMatch(/gives no date/);
  });

  it("an expedited commitment is shown and never committed", () => {
    const s = suggestDeliveryDates({
      ...base,
      tierTarget: tier(1),
      closeDate: "2026-09-01",
      sowDeadlines: [{ date: "2026-10-30", who: null, quote: "by 30 October" }],
      sowNotes: ["Expedited work is subject to a fee."],
    });
    expect(s.basis).toBe("expedited");
    expect(s.from).toBe("2026-10-30");
    const label = completionLabel({ from: s.from, to: s.to, source: s.basis });
    expect(label).toMatch(/Expedited date in the SOW, subject to resource review/);
    expect(label).toMatch(/Not yet agreed with the customer/);
  });
});

describe("complexity-tier targets come from Settings, in business days, skipping weekends", () => {
  const tier1 = (close: string, holidays: string[] = []) =>
    suggestDeliveryDates({ ...base, tierTarget: tier(1), closeDate: close, holidays });

  it("Tier 1 counts 30 business days from the close", () => {
    const s = tier1("2026-09-01");
    expect(s.from).toBe(addBusinessDays("2026-09-01", 30));
    expect(s.basis).toBe("tier");
  });

  it("skips weekends when the close falls on a Friday", () => {
    const s = tier1("2026-10-02");
    expect(s.from).toBe("2026-11-13");
    expect(new Date(`${s.from}T12:00:00Z`).getUTCDay()).toBe(5);
  });

  it("counts from the first business day when the close falls on a Saturday", () => {
    const s = tier1("2026-10-03");
    expect(s.from).toBe(addBusinessDays("2026-10-03", 30));
    const day = new Date(`${s.from}T12:00:00Z`).getUTCDay();
    expect(day >= 1 && day <= 5).toBe(true);
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

  it("uses Tier 5 at 150 business days, and Tier 3 at 90", () => {
    expect(
      suggestDeliveryDates({ ...base, tierTarget: tier(5), closeDate: "2026-09-01" }).from,
    ).toBe(addBusinessDays("2026-09-01", 150));
    expect(
      suggestDeliveryDates({ ...base, tierTarget: tier(3), closeDate: "2026-09-01" }).from,
    ).toBe(addBusinessDays("2026-09-01", 90));
  });

  it("follows whatever Settings holds: a changed Settings value changes the date", () => {
    const changed = suggestDeliveryDates({
      ...base,
      tierTarget: { tier: 1, businessDays: 20, noIntegration: false },
      closeDate: "2026-09-01",
    });
    expect(changed.from).toBe(addBusinessDays("2026-09-01", 20));
  });

  it("a deal with no integration uses the Tier 1 target, and says so", () => {
    const s = suggestDeliveryDates({ ...base, tierTarget: tier(1, true), closeDate: "2026-09-01" });
    expect(s.from).toBe(addBusinessDays("2026-09-01", 30));
    expect(s.assumptions.join(" ")).toMatch(/uses the Tier 1 target/);
  });

  it("names the Settings source and the close date, never the signature date", () => {
    const s = tier1("2026-09-01");
    expect(s.assumptions.join(" ")).toMatch(/as set in Settings/);
    expect(s.assumptions.join(" ")).toMatch(
      /close date recorded on the deal \(not the SOW signature date\)/,
    );
    expect(s.startCondition).toMatch(/close date on the deal/);
    expect(completionLabel({ from: s.from, to: s.to, source: s.basis })).toMatch(
      /complexity-tier target, in business days/,
    );
  });

  it("with no tier target in Settings, proposes nothing and says Settings is the missing source", () => {
    const s = suggestDeliveryDates({
      ...base,
      tierTarget: null,
      tierMissing:
        "No complexity-tier targets are set in Settings, so no tier-based date is proposed.",
      closeDate: "2026-09-01",
    });
    expect(s.basis).toBe("none");
    expect(s.from).toBeNull();
    expect(s.missing).toMatch(/set in Settings/);
  });
});

describe("missing data proposes nothing and says what is missing", () => {
  it("no SOW timeline and no tier target: no date", () => {
    const s = suggestDeliveryDates({ ...base });
    expect(s.basis).toBe("none");
    expect(s.from).toBeNull();
    expect(s.missing).toMatch(/no date is proposed/);
  });

  it("a tier target but no close date: no date", () => {
    const s = suggestDeliveryDates({ ...base, tierTarget: tier(2) });
    expect(s.from).toBeNull();
    expect(s.missing).toMatch(/close date is not recorded/);
  });
});

describe("suggestions are editable, saved dates are the TIS's and never agreed", () => {
  const suggestion = suggestDeliveryDates({
    ...base,
    tierTarget: tier(1),
    closeDate: "2026-09-01",
  });

  it("with nothing saved, the suggestion stands, labelled as proposed", () => {
    const e = effectiveCompletion(suggestion, null);
    expect(e).toEqual({ from: suggestion.from, to: suggestion.to, source: "tier" });
    expect(completionLabel(e)).toMatch(
      /Proposed from the complexity-tier target, in business days/,
    );
    expect(completionLabel(e)).toMatch(/Not yet agreed with the customer/);
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
  it("round-trips through the intake's stored shape, including business units", () => {
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

describe("calendar arithmetic stays calendar", () => {
  it("adds calendar days across a month boundary", () => {
    expect(addCalendarDays("2026-10-30", 3)).toBe("2026-11-02");
  });
});
