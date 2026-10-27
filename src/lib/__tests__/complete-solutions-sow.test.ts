import { describe, expect, it } from "vitest";

import {
  prioritiesOf,
  reviewedSetFrom,
  sameName,
  sowReadingSchema,
} from "../complete-solutions-sow";

/**
 * How a reading of a SOW becomes the set the TIS reviews. The reading is a
 * REFERENCE SHAPE, not the Mako Shark SOW (not in the repository): a multi-
 * component solution, two unrelated solutions, and a requested extra.
 */

const reference = {
  readable: true,
  problem: "",
  solutions: [
    {
      title: "Equipment inspections",
      scope: "purchased",
      startDate: "2026-11-02",
      startCondition: "From the kickoff call, once the customer's login details are in",
      estimateWeeks: 4,
      sowQuote: "The inspection process is delivered as one solution over four weeks.",
      components: [
        {
          category: "forms",
          name: "Pre-trip inspection form",
          priority: "needed_for_go_live",
          dependsOn: [],
          critical: false,
          estimateWeeks: null,
          sowQuote: "A pre-trip inspection form for each vehicle.",
        },
        {
          category: "integrations",
          integrationType: "dispatch",
          name: "Dispatch feed",
          priority: "needed_for_go_live",
          dependsOn: ["Pre-trip inspection form"],
          critical: true,
          startDate: "2026-11-16",
          estimateWeeks: 2,
          sowQuote: "Completed inspections post to the dispatch system.",
        },
        {
          category: "integrations",
          integrationType: "dynamic_reference_data",
          name: "Vehicle list",
          priority: "deliver_during_implementation",
          dependsOn: [],
          critical: false,
          estimateWeeks: null,
          sowQuote: "The vehicle list is kept in sync.",
        },
        {
          category: "analytics",
          name: "Fleet dashboard",
          priority: "planned_for_later",
          dependsOn: ["Dispatch feed"],
          critical: false,
          estimateWeeks: null,
          sowQuote: "A dashboard, in phase two.",
        },
        {
          category: "training",
          name: "Crew training",
          priority: "deliver_during_implementation",
          dependsOn: [],
          critical: false,
          estimateWeeks: 1,
          sowQuote: "One training session for each crew.",
        },
      ],
    },
    {
      title: "Fuel log",
      scope: "purchased",
      startDate: null,
      startCondition: "When the customer confirms the fuel card feed",
      estimateWeeks: 3,
      sowQuote: "Fuel logging is a separate solution.",
      components: [
        {
          category: "forms",
          name: "Fuel form",
          priority: "needed_for_go_live",
          dependsOn: [],
          critical: false,
          estimateWeeks: null,
          sowQuote: "A fuel form.",
        },
      ],
    },
    {
      title: "Hazard reporting",
      scope: "requested",
      startDate: null,
      startCondition: null,
      estimateWeeks: null,
      sowQuote: "The customer asked whether hazard reporting could be added; not yet approved.",
      components: [],
    },
  ],
  gaps: ["The SOW does not give a start date for the fuel log."],
};

describe("reading the SOW into a reviewable set", () => {
  const { solutions, gaps } = reviewedSetFrom(sowReadingSchema.parse(reference));

  it("keeps two unrelated solutions, and a requested one apart from the purchased ones", () => {
    expect(solutions.map((s) => [s.title, s.scope])).toEqual([
      ["Equipment inspections", "purchased"],
      ["Fuel log", "purchased"],
      ["Hazard reporting", "requested"],
    ]);
  });

  it("gives every component its category, and only integrations an integration type", () => {
    const [inspections] = solutions;
    expect(inspections!.components.map((c) => [c.category, c.integrationType])).toEqual([
      ["forms", null],
      ["integrations", "dispatch"],
      ["integrations", "dynamic_reference_data"],
      ["analytics", null],
      ["training", null],
    ]);
  });

  it("keeps a critical dependency between components of the same solution", () => {
    const dispatch = solutions[0]!.components.find((c) => c.name === "Dispatch feed")!;
    expect(dispatch.dependsOn).toEqual(["Pre-trip inspection form"]);
    expect(dispatch.critical).toBe(true);
  });

  it("suggests a solution date only where the SOW gives a start date and a duration", () => {
    expect(solutions[0]!.suggestedTarget).toBe("2026-11-30");
    expect(solutions[0]!.targetReason).toBe("4 weeks from 2026-11-02, as the SOW estimates.");
    expect(solutions[1]!.suggestedTarget).toBeNull();
    expect(solutions[2]!.suggestedTarget).toBeNull();
  });

  it("dates a component only from its own stated start and duration, never from the solution's", () => {
    const [inspections] = solutions;
    const dispatch = inspections!.components.find((c) => c.name === "Dispatch feed")!;
    expect(dispatch.suggestedTarget).toBe("2026-11-30");
    const form = inspections!.components.find((c) => c.name === "Pre-trip inspection form")!;
    expect(form.suggestedTarget).toBeNull();
  });

  it("keeps the SOW's own words on every item, so the TIS can check it", () => {
    expect(solutions[0]!.sowQuote).toMatch(/one solution over four weeks/);
    expect(solutions[0]!.components[1]!.sowQuote).toMatch(/dispatch system/);
  });

  it("lists what the SOW leaves open, and gives nothing else", () => {
    expect(gaps).toEqual(["The SOW does not give a start date for the fuel log."]);
  });
});

describe("the reading never invents or silently drops", () => {
  it("refuses an unknown category by sending it to other, rather than inventing one", () => {
    const parsed = sowReadingSchema.parse({
      readable: true,
      solutions: [
        {
          title: "X",
          components: [{ category: "widgets", name: "Thing" }],
        },
      ],
    });
    expect(parsed.solutions[0]!.components[0]!.category).toBe("other");
  });

  it("treats a scope the reading cannot name as requested, so nothing is taken as purchased by default", () => {
    const parsed = sowReadingSchema.parse({
      readable: true,
      solutions: [{ title: "X", components: [] }],
    });
    expect(parsed.solutions[0]!.scope).toBe("requested");
  });

  it("reads a text number of weeks, and refuses an impossible one", () => {
    const parsed = sowReadingSchema.parse({
      readable: true,
      solutions: [
        { title: "A", estimateWeeks: "3", components: [] },
        { title: "B", estimateWeeks: 900, components: [] },
      ],
    });
    expect(parsed.solutions.map((s) => s.estimateWeeks)).toEqual([3, null]);
  });

  it("refuses a start date that is not a calendar date", () => {
    const { solutions } = reviewedSetFrom(
      sowReadingSchema.parse({
        readable: true,
        solutions: [{ title: "A", startDate: "soon", estimateWeeks: 2, components: [] }],
      }),
    );
    expect(solutions[0]!.suggestedTarget).toBeNull();
  });

  it("merges a repeated component name and reports a repeated solution", () => {
    const { solutions, gaps } = reviewedSetFrom(
      sowReadingSchema.parse({
        readable: true,
        solutions: [
          {
            title: "Inspections",
            components: [
              { category: "forms", name: "Form" },
              { category: "forms", name: "form" },
            ],
          },
          { title: "Inspections", components: [] },
        ],
      }),
    );
    expect(solutions).toHaveLength(1);
    expect(solutions[0]!.components).toHaveLength(1);
    expect(gaps.join(" ")).toMatch(/appears more than once/);
  });

  it("drops a dependency on a name the reading does not contain, and says so", () => {
    const { solutions, gaps } = reviewedSetFrom(
      sowReadingSchema.parse({
        readable: true,
        solutions: [
          { title: "A", components: [{ category: "forms", name: "Form", dependsOn: ["Ghost"] }] },
        ],
      }),
    );
    expect(solutions[0]!.components[0]!.dependsOn).toEqual([]);
    expect(gaps.join(" ")).toMatch(/Form depends on something the SOW does not name/);
  });

  it("returns the reading's own problem when it found no solutions at all", () => {
    const { solutions, gaps } = reviewedSetFrom(
      sowReadingSchema.parse({
        readable: true,
        problem: "This is a price list, not a SOW.",
        solutions: [],
      }),
    );
    expect(solutions).toEqual([]);
    expect(gaps).toEqual(["This is a price list, not a SOW."]);
  });
});

describe("a solution takes the priority of its most urgent component", () => {
  it("is needed for go-live when any component is", () => {
    expect(
      prioritiesOf([{ priority: "planned_for_later" }, { priority: "needed_for_go_live" }]),
    ).toBe("needed_for_go_live");
  });

  it("is deliver-during when the most urgent is that", () => {
    expect(
      prioritiesOf([
        { priority: "planned_for_later" },
        { priority: "deliver_during_implementation" },
      ]),
    ).toBe("deliver_during_implementation");
  });

  it("is planned for later when only later work is named, and the default with nothing", () => {
    expect(prioritiesOf([{ priority: "planned_for_later" }])).toBe("planned_for_later");
    expect(prioritiesOf([])).toBe("deliver_during_implementation");
  });
});

describe("names are compared without case or spacing", () => {
  it("matches the same name written differently", () => {
    expect(sameName("Fuel  Log", " fuel log ")).toBe(true);
    expect(sameName("Fuel log", "Fuel logging")).toBe(false);
  });
});
