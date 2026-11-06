/**
 * The SOW path after the model call, run on the Riverbay Corp SOW's Delivery Timeline.
 *
 * What this covers: the reading output is parsed, the paragraph is kept verbatim, the
 * apply step writes it onto the intake timeline, the save schema accepts it, and the
 * deck computes its dates from it. The fixture is the reading the model is asked to
 * return for that document, with the paragraph copied as printed.
 *
 * What it does not cover: the live model call. No model key is available in this
 * environment, so the call itself has not been run against the PDF.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { readIntake } from "../intake-answers";
import { timelinePatchSchema } from "../intake-patch";
import { deliveryFromStored, suggestDeliveryDates } from "../delivery-timeline";
import { parseSowReading, sowTimelinePatch } from "../sow-plan";
import { SYSTEM_PROMPT } from "../sow-plan.server";

/** Riverbay Corp SOW, Implementation section, Delivery Timeline, as printed. */
const RIVERBAY_PARAGRAPH =
  "The estimated timeline for completion of the solution is 4 to 6 weeks, commencing once all form builds and edits have been finalized. GoCanvas will make every reasonable effort to meet or exceed this schedule. However, the timeline is subject to change if there are delays in receiving required deliverables from the Client. These deliverables may include necessary systems or environments, submitting finalized forms and documentation, ensuring availability for meetings and reviews, and allocating appropriate resources to support project activities. Any delays in these areas may result in a corresponding adjustment to the project timeline.";

/** The reading the model returns for the Riverbay SOW (the fields the path reads). */
const riverbayReading = (over: Record<string, unknown> = {}) => ({
  readable: true,
  problem: null,
  reference: "269150787",
  signed_date: null,
  start_date: null,
  value: null,
  contact: null,
  summary: "Two web forms and a custom PDF for supply orders and incident reports.",
  first_form: "Supply Order Form",
  seats: null,
  services: [],
  notes: [],
  gaps: [],
  dates: [],
  delivery_timeline: RIVERBAY_PARAGRAPH,
  deliverables: [],
  out_of_scope: [],
  customer_responsibilities: [],
  acceptance_criteria: [],
  assumptions: [],
  term: null,
  pricing: null,
  contacts: [],
  signature: null,
  integrations: [],
  forms: [],
  ...over,
});

const SETTINGS = { 1: 30, 2: 45, 3: 90, 4: 120, 5: 150 };

describe("the Riverbay SOW's paragraph survives the reading and the apply step", () => {
  it("the reading parses, and the paragraph comes back verbatim", () => {
    const reading = parseSowReading(riverbayReading());
    expect(reading).not.toBeNull();
    expect(reading?.delivery_timeline).toBe(RIVERBAY_PARAGRAPH);
  });

  it("a reading with a malformed field elsewhere still keeps the paragraph", () => {
    // A deep field that does not parse sends the reading down the plan-level path.
    const reading = parseSowReading(riverbayReading({ deliverables: "not a list" }));
    expect(reading).not.toBeNull();
    expect(reading?.delivery_timeline).toBe(RIVERBAY_PARAGRAPH);
  });

  it("the apply step writes the parsed paragraph onto the timeline, in weeks", () => {
    const reading = parseSowReading(riverbayReading())!;
    const { timeline } = sowTimelinePatch(readIntake({}), reading, () => "svc-1");
    const stored = timeline["sow_delivery"] as {
      quote: string;
      duration_unit: string;
      duration_min: number;
      duration_max: number;
      start_condition: string;
      dependencies: string[];
    };
    expect(stored.quote).toBe(RIVERBAY_PARAGRAPH);
    expect(stored.duration_unit).toBe("week");
    expect([stored.duration_min, stored.duration_max]).toEqual([4, 6]);
    expect(stored.start_condition).toBe("forms_finalised");
    expect(stored.dependencies).toHaveLength(4);
  });

  it("the save schema accepts the stored paragraph, and a read-back returns it unchanged", () => {
    const reading = parseSowReading(riverbayReading())!;
    const { timeline } = sowTimelinePatch(readIntake({}), reading, () => "svc-1");
    expect(timelinePatchSchema.shape.sow_delivery.safeParse(timeline["sow_delivery"]).success).toBe(
      true,
    );
    const back = readIntake({ timeline }).timeline["sow_delivery"];
    expect(back).toEqual(timeline["sow_delivery"]);
  });
});

describe("the deck's dates from the Riverbay paragraph", () => {
  const intakeAfterApply = () => {
    const reading = parseSowReading(riverbayReading())!;
    const { timeline } = sowTimelinePatch(readIntake({}), reading, () => "svc-1");
    return readIntake({ timeline });
  };

  it("with the finalisation day not recorded, no completion date is proposed", () => {
    const intake = intakeAfterApply();
    const s = suggestDeliveryDates({
      sow: deliveryFromStored(intake.timeline["sow_delivery"]),
      tierTarget: { tier: 1, businessDays: SETTINGS[1], noIntegration: true },
      tierMissing: null,
      closeDate: "2026-08-20",
      kickoffDate: "2026-09-07",
      signedDate: null,
      formsFinalisedOn: null,
      holidays: [],
      sowDeadlines: [],
      sowNotes: [],
    });
    expect(s.basis).toBe("sow");
    expect(s.from).toBeNull();
    expect(s.missing).toMatch(/not recorded yet/);
  });

  it("with the finalisation day recorded, the range is 4 to 6 calendar weeks from it", () => {
    const intake = intakeAfterApply();
    const s = suggestDeliveryDates({
      sow: deliveryFromStored(intake.timeline["sow_delivery"]),
      tierTarget: null,
      tierMissing: null,
      closeDate: "2026-08-20",
      kickoffDate: "2026-09-07",
      signedDate: null,
      formsFinalisedOn: "2026-10-05",
      holidays: [],
      sowDeadlines: [],
      sowNotes: [],
    });
    expect(s.from).toBe("2026-11-02");
    expect(s.to).toBe("2026-11-16");
    expect(s.startCondition).toBe("When all form builds and edits are finalised");
  });
});

describe("the reading prompt asks for the paragraph as printed", () => {
  it("the system prompt tells the reader to copy the paragraph verbatim and not to compute a date", () => {
    expect(SYSTEM_PROMPT).toMatch(
      /delivery_timeline: the SOW's Delivery Timeline paragraph copied VERBATIM/,
    );
    expect(SYSTEM_PROMPT).toMatch(/never calculate a date from it/);
  });
});
