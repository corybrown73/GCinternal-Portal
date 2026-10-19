import { describe, expect, it } from "vitest";

import {
  buildImplementationDocument,
  buildSolutionDocument,
  isCustomerCommitment,
  isSharedWorkItem,
  NOTE_BODY_LIMIT,
  summaryText,
  type CompletionDocument,
} from "../completion-record";

const stageLabel = (k: string) => (k === "graduate-to-cs" ? "Handover to CS" : k);

/* Every internal value in these fixtures starts with INTERNAL so that a leak is
 * one substring away. Nothing here is real customer data. */

function implInput(over: Record<string, unknown> = {}) {
  return {
    customerName: "Northwind Fleet",
    implementation: {
      id: "impl-1",
      name: "Field inspections rollout",
      customer_id: "cust-1",
      contract_start_date: "2026-01-06",
      created_at: "2025-12-01T00:00:00Z",
      go_live_at: "2026-04-01T09:00:00Z",
      actual_launch_date: null,
      salesforce_opportunity_id: "006INTERNALOPP",
    },
    completedAt: "2026-08-31T14:00:00.000Z",
    stageHistory: [],
    commitments: [],
    workItems: [],
    stageLabel,
    ...over,
  };
}

function solutionInput(over: Record<string, unknown> = {}) {
  return {
    customerName: "Northwind Fleet",
    implementationName: "Field inspections rollout",
    solution: {
      id: "sol-1",
      title: "Dispatch → ERP work order sync",
      created_at: "2026-02-14T00:00:00Z",
    },
    completedAt: "2026-08-31T14:00:00.000Z",
    ...over,
  };
}

const section = (doc: CompletionDocument, heading: string) => {
  const found = doc.sections.find((s) => s.heading === heading);
  if (!found) throw new Error(`no section ${heading}`);
  return found;
};

const IMPLEMENTATION_HEADINGS = [
  "How the project moved",
  "What was built",
  "What the customer asked for",
  "Decisions taken",
  "Risks and issues",
  "What we committed to",
  "What the customer signed off",
  "What success was measured against",
  "The plan, as completed",
];

const SOLUTION_HEADINGS = [
  "What it does",
  "How it is set up",
  "Field mapping",
  "The build log",
  "Decisions taken",
  "Proof it works",
  "Sign-off",
];

/** Everything internal, in every field a loader could hand over. */
const internalStageHistory = [
  {
    stage: "graduate-to-cs",
    entered_at: "2026-08-01T00:00:00Z",
    exited_at: null,
    entered_by: "INTERNAL-STAFF-Dana",
    notes: "INTERNAL-STAGE-COMMENT: champion is leaving, do not mention.",
    advanced_with_gaps: true,
  },
];

describe("isCustomerCommitment", () => {
  it.each([
    ["customer", true],
    ["Customer", true],
    ["  CUSTOMER  ", true],
    ["internal", false],
    ["Internal", false],
    ["customers", false],
    ["customer contact", false],
    ["Dana Ortiz", false],
    ["GoCanvas team", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("treats committed_to %p as customer-owed: %s", (value, expected) => {
    expect(isCustomerCommitment(value)).toBe(expected);
  });
});

describe("isSharedWorkItem", () => {
  it("admits only an item whose visibility is exactly shared", () => {
    expect(isSharedWorkItem({ visibility: "shared" })).toBe(true);
    expect(isSharedWorkItem({ visibility: "internal" })).toBe(false);
    expect(isSharedWorkItem({ visibility: "Shared" })).toBe(false);
    expect(isSharedWorkItem({})).toBe(false);
  });
});

describe("buildImplementationDocument", () => {
  it("keeps every section in the same order, even when nothing is recorded", () => {
    const doc = buildImplementationDocument(implInput());
    expect(doc.sections.map((s) => s.heading)).toEqual(IMPLEMENTATION_HEADINGS);
    for (const s of doc.sections) {
      expect(s.entries).toHaveLength(0);
      expect(s.emptyNote.length).toBeGreaterThan(0);
    }
  });

  it("describes what is withheld as internal, never as absent", () => {
    const doc = buildImplementationDocument(implInput());
    expect(section(doc, "Risks and issues").emptyNote).toContain("internal");
    expect(section(doc, "Decisions taken").emptyNote).toContain("internal");
    expect(section(doc, "What the customer signed off").emptyNote).toContain("internal");
  });

  it("keeps the headline to the customer, the project and the dates", () => {
    const doc = buildImplementationDocument(implInput());
    expect(doc.headline.map(([k]) => k)).toEqual([
      "Customer",
      "Project",
      "Started",
      "Actual go-live",
      "Completed",
    ]);
    expect(doc.headline).toContainEqual(["Actual go-live", "2026-04-01"]);
  });

  describe("how the project moved", () => {
    it("shows stage names and when each was entered and left, and nothing else", () => {
      const doc = buildImplementationDocument(
        implInput({
          stageHistory: [
            {
              stage: "graduate-to-cs",
              entered_at: "2026-02-01T00:00:00Z",
              exited_at: "2026-02-10T00:00:00Z",
            },
          ],
        }),
      );
      const moved = section(doc, "How the project moved");
      expect(moved.entries).toEqual([
        {
          title: "Handover to CS",
          detail: null,
          meta: [
            ["Entered", "2026-02-01"],
            ["Left", "2026-02-10"],
          ],
        },
      ]);
    });

    it("never carries stage comments, the advanced-with-gaps flag, or who entered the stage", () => {
      const doc = buildImplementationDocument(implInput({ stageHistory: internalStageHistory }));
      const text = JSON.stringify(doc);
      expect(text).not.toContain("INTERNAL-STAGE-COMMENT");
      expect(text).not.toContain("INTERNAL-STAFF");
      expect(text).not.toContain("Moved on with criteria outstanding");
      expect(section(doc, "How the project moved").entries[0]!.detail).toBeNull();
    });
  });

  describe("what we committed to", () => {
    const commitments = [
      {
        description: "Deliver the asset list by 1 June",
        committed_to: "Customer",
        status: "open",
        made_at: "2026-03-01T00:00:00Z",
        due_date: "2026-06-01",
        fulfilled_at: null,
        owner_id: "INTERNAL-OWNER",
      },
      {
        description: "Confirm the go-live window",
        committed_to: "  CUSTOMER ",
        status: "met",
        made_at: "2026-03-02T00:00:00Z",
        due_date: null,
        fulfilled_at: "2026-03-20T00:00:00Z",
      },
      {
        description: "INTERNAL-COMMITMENT: fix the rate limit before go-live",
        committed_to: "internal",
        status: "open",
        made_at: "2026-03-03T00:00:00Z",
      },
      {
        description: "INTERNAL-COMMITMENT: no audience recorded",
        committed_to: null,
        status: "open",
        made_at: "2026-03-04T00:00:00Z",
      },
      {
        description: "INTERNAL-COMMITMENT: named person",
        committed_to: "Dana Ortiz",
        status: "open",
        made_at: "2026-03-05T00:00:00Z",
      },
      {
        description: "INTERNAL-COMMITMENT: plural audience",
        committed_to: "customers",
        status: "open",
        made_at: "2026-03-06T00:00:00Z",
      },
    ];

    it("includes only commitments owed to the customer, with the customer's own wording", () => {
      const doc = buildImplementationDocument(implInput({ commitments }));
      const entries = section(doc, "What we committed to").entries;
      expect(entries.map((e) => e.title)).toEqual([
        "Deliver the asset list by 1 June",
        "Confirm the go-live window",
      ]);
      expect(entries[0]!.meta).toEqual([
        ["Status", "open"],
        ["Made", "2026-03-01"],
        ["Due", "2026-06-01"],
        ["Fulfilled", "—"],
      ]);
    });

    it("never carries the owner, and never an internal commitment's text", () => {
      const doc = buildImplementationDocument(implInput({ commitments }));
      const text = JSON.stringify(doc);
      expect(text).not.toContain("INTERNAL");
      expect(text).not.toContain("Dana Ortiz");
      expect(text).not.toContain("INTERNAL-OWNER");
    });

    it("says no customer commitments were recorded when only internal ones exist", () => {
      const doc = buildImplementationDocument(
        implInput({ commitments: [commitments[2], commitments[3]] }),
      );
      const s = section(doc, "What we committed to");
      expect(s.entries).toHaveLength(0);
      expect(s.emptyNote).toBe(
        "No commitments made to the customer were recorded for this project.",
      );
    });
  });

  describe("the plan, as completed", () => {
    const workItems = [
      { title: "Kickoff held", status: "done", visibility: "internal", stage_key: "onboarding" },
      {
        title: "Data sample received",
        status: "open",
        visibility: "shared",
        stage_key: "build",
      },
      {
        title: "INTERNAL-TASK: negotiate the discount",
        status: "open",
        visibility: "internal",
        stage_key: "handoff",
      },
      {
        title: "Go-live sign-off call",
        status: "done",
        visibility: "shared",
        stage_key: "handoff",
      },
    ];

    it("lists only shared tasks that were still open, and counts only the shared ones", () => {
      const doc = buildImplementationDocument(implInput({ workItems }));
      const plan = section(doc, "The plan, as completed");
      expect(plan.note).toBe(
        "1 of 2 shared task(s) were ticked. 1 shared task(s) were still open at completion, listed below.",
      );
      expect(plan.entries.map((e) => e.title)).toEqual(["Data sample received"]);
      expect(plan.entries[0]!.meta).toEqual([
        ["Stage", "build"],
        ["Status at completion", "open"],
      ]);
    });

    it("never names an internal task, nor counts it", () => {
      const doc = buildImplementationDocument(implInput({ workItems }));
      const text = JSON.stringify(doc);
      expect(text).not.toContain("Kickoff held");
      expect(text).not.toContain("INTERNAL-TASK");
      expect(text).not.toContain("3 of");
    });

    it("says no shared task was open when every shared task was ticked", () => {
      const doc = buildImplementationDocument(
        implInput({ workItems: [workItems[0], workItems[3]] }),
      );
      const plan = section(doc, "The plan, as completed");
      expect(plan.entries).toHaveLength(0);
      expect(plan.emptyNote).toBe("No shared tasks were open at completion.");
      expect(plan.note).toBe("1 of 1 shared task(s) were ticked. No shared task was left open.");
    });

    it("says no tasks were shared when none were, rather than implying there were no tasks", () => {
      const doc = buildImplementationDocument(
        implInput({ workItems: [workItems[0], workItems[2]] }),
      );
      const plan = section(doc, "The plan, as completed");
      expect(plan.note).toBeNull();
      expect(plan.emptyNote).toBe("No tasks were shared with the customer for this project.");
    });

    it("leaves a task's free-text description out, even when the task is shared", () => {
      const doc = buildImplementationDocument(
        implInput({
          workItems: [
            {
              title: "Data sample received",
              description: "INTERNAL-DESCRIPTION: customer is slow, chase weekly",
              status: "open",
              visibility: "shared",
              stage_key: "build",
              party: "INTERNAL-PARTY",
            },
          ],
        }),
      );
      const text = JSON.stringify(doc);
      expect(text).not.toContain("INTERNAL-DESCRIPTION");
      expect(text).not.toContain("INTERNAL-PARTY");
    });
  });

  describe("internal sections", () => {
    const internal = {
      risks: [
        {
          title: "INTERNAL-RISK",
          description: "INTERNAL-RISK-TEXT",
          mitigation: "INTERNAL-MITIGATION",
        },
      ],
      issues: [{ title: "INTERNAL-ISSUE", resolution: "INTERNAL-RESOLUTION" }],
      decisions: [
        {
          title: "INTERNAL-DECISION",
          rationale: "INTERNAL-RATIONALE",
          decided_by: "INTERNAL-STAFF",
        },
      ],
      requirements: [{ title: "INTERNAL-REQUIREMENT", description: "INTERNAL-REQ-TEXT" }],
      approvals: [{ title: "INTERNAL-APPROVAL", approver_name: "INTERNAL-APPROVER" }],
      successCriteria: [{ description: "INTERNAL-CRITERION", measured_value: "INTERNAL-MEASURE" }],
    };

    it("withholds risks, issues, decisions, requirements, sign-offs and success criteria", () => {
      const doc = buildImplementationDocument(implInput(internal as Record<string, unknown>));
      const withheld = [
        "What the customer asked for",
        "Decisions taken",
        "Risks and issues",
        "What the customer signed off",
        "What success was measured against",
      ];
      for (const heading of withheld) {
        const s = section(doc, heading);
        expect(s.entries).toHaveLength(0);
        expect(s.note).toBeNull();
      }
      const text = JSON.stringify(doc);
      expect(text).not.toMatch(
        /INTERNAL-(RISK|ISSUE|DECISION|REQ|APPROVAL|CRITERION|MITIGATION|RESOLUTION|RATIONALE|MEASURE|STAFF|APPROVER)/,
      );
    });
  });

  it("never carries staff identities or ownership in the headline", () => {
    const doc = buildImplementationDocument(
      implInput({
        implementation: {
          ...implInput().implementation,
          owner_id: "tm-1",
          sales_owner: "INTERNAL-SALES-OWNER",
        },
      }),
    );
    const labels = doc.headline.map(([k]) => k);
    expect(labels).not.toContain("Implementation lead");
    expect(labels).not.toContain("Sold by");
    expect(JSON.stringify(doc)).not.toContain("INTERNAL-SALES-OWNER");
  });
});

describe("buildSolutionDocument", () => {
  const internalSolution = {
    ...solutionInput().solution,
    status: "validated",
    owner_id: "INTERNAL-OWNER",
    design_summary: "INTERNAL-DESIGN: reads the nightly job, retries three times.",
    configuration_details: "INTERNAL-CONFIG: REST endpoint, credentials in the vault.",
  };

  it("keeps every solution section in order, each one withheld with a reason", () => {
    const doc = buildSolutionDocument(solutionInput({ solution: internalSolution }));
    expect(doc.sections.map((s) => s.heading)).toEqual(SOLUTION_HEADINGS);
    for (const s of doc.sections) {
      expect(s.entries).toHaveLength(0);
      expect(s.emptyNote).toContain("internal");
    }
  });

  it("never carries the design, the configuration, the build log, or the owner", () => {
    const doc = buildSolutionDocument(
      solutionInput({
        solution: internalSolution,
        mappings: [{ source_field: "INTERNAL-FIELD" }],
        notes: [{ content: "INTERNAL-BUILD-NOTE: workaround for the vendor bug" }],
        requirementTitle: "INTERNAL-REQUIREMENT",
      } as Record<string, unknown>),
    );
    const text = JSON.stringify(doc);
    expect(text).not.toContain("INTERNAL");
    expect(text).not.toContain("workaround");
  });

  it("keeps the headline to the customer, project, solution and dates", () => {
    const doc = buildSolutionDocument(solutionInput({ solution: internalSolution }));
    expect(doc.headline.map(([k]) => k)).toEqual([
      "Customer",
      "Project",
      "Solution",
      "Started",
      "Completed",
    ]);
    expect(doc.title).toBe("Dispatch → ERP work order sync");
    expect(doc.subject_type).toBe("solution");
  });
});

describe("summaryText", () => {
  const doc = buildImplementationDocument(
    implInput({
      stageHistory: internalStageHistory,
      commitments: [
        {
          description: "Deliver the asset list by 1 June",
          committed_to: "customer",
          status: "open",
          made_at: "2026-03-01T00:00:00Z",
        },
        {
          description: "INTERNAL-COMMITMENT: keep quiet",
          committed_to: "internal",
          status: "open",
          made_at: "2026-03-02T00:00:00Z",
        },
      ],
      workItems: [
        {
          title: "INTERNAL-TASK: hidden",
          status: "open",
          visibility: "internal",
          stage_key: "build",
        },
      ],
    }),
  );

  it("opens with what completed and where to read the full record", () => {
    const text = summaryText(doc, "https://example.test/api/completion-record/abc");
    expect(text.split("\n")[0]).toBe("Implementation complete — Field inspections rollout");
    expect(text).toContain("Full record: https://example.test/api/completion-record/abc");
  });

  it("carries the customer's commitments and no internal text", () => {
    const text = summaryText(doc, "https://example.test/x");
    expect(text).toContain("• Deliver the asset list by 1 June");
    expect(text).not.toContain("INTERNAL");
    expect(text).not.toContain("keep quiet");
  });

  it("states an empty section rather than dropping it", () => {
    const text = summaryText(doc, "https://example.test/x");
    expect(text).toContain("No tasks were shared with the customer for this project.");
    expect(text).toContain("Risks and issues on this project are internal");
  });

  it("cuts at a section boundary and says how much did not fit", () => {
    const huge: CompletionDocument = {
      ...doc,
      sections: doc.sections.map((s) => ({
        ...s,
        entries: [{ title: "x".repeat(20_000), detail: null }],
      })),
    };
    const text = summaryText(huge, "https://example.test/x");
    expect(text.length).toBeLessThanOrEqual(NOTE_BODY_LIMIT + 200);
    expect(text).toContain("did not fit in a Salesforce note");
  });

  it("adds no truncation line when everything fits", () => {
    const text = summaryText(doc, "https://example.test/x");
    expect(text).not.toContain("did not fit");
  });
});
