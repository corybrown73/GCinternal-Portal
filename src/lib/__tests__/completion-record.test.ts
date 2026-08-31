import { describe, expect, it } from "vitest";

import {
  buildImplementationDocument,
  buildSolutionDocument,
  NOTE_BODY_LIMIT,
  summaryText,
  type CompletionDocument,
} from "../completion-record";

const named = (id: string | null | undefined) =>
  id === "tm-1" ? "Dana Okafor" : id === "tm-2" ? "Priya Raman" : null;

const stageLabel = (k: string) => (k === "graduate-to-cs" ? "Handover to CS" : k);

function implInput(over: Record<string, unknown> = {}) {
  return {
    customerName: "Northwind Fleet",
    implementation: {
      id: "impl-1",
      name: "Field inspections rollout",
      journey_type: "new-logo",
      tier: "standard",
      contract_start_date: "2026-01-06",
      target_launch_date: "2026-04-01",
      owner_id: "tm-1",
      sales_owner: "Marcus Webb",
      sales_owner_id: null,
    },
    completedAt: "2026-08-31T14:00:00.000Z",
    named,
    stageHistory: [],
    solutions: [],
    mappingCountBySolution: new Map<string, number>(),
    requirements: [],
    decisions: [],
    risks: [],
    issues: [],
    commitments: [],
    approvals: [],
    successCriteria: [],
    workItems: [],
    stageLabel,
    ...over,
  };
}

describe("buildImplementationDocument", () => {
  it("keeps every section even when nothing was recorded, and says so", () => {
    const doc = buildImplementationDocument(implInput());
    expect(doc.sections.length).toBeGreaterThan(5);
    for (const s of doc.sections) {
      expect(s.entries).toHaveLength(0);
      expect(s.emptyNote.length).toBeGreaterThan(0);
    }
  });

  it("names people rather than printing their uuid", () => {
    const doc = buildImplementationDocument(implInput());
    expect(doc.headline).toContainEqual(["Implementation lead", "Dana Okafor"]);
  });

  it("prefers the free-text sales owner over the directory reference, as the record does", () => {
    const doc = buildImplementationDocument(implInput());
    expect(doc.headline).toContainEqual(["Sold by", "Marcus Webb"]);
  });

  it("records a stage that was advanced with criteria outstanding", () => {
    const doc = buildImplementationDocument(
      implInput({
        stageHistory: [
          {
            stage: "handoff",
            entered_at: "2026-02-01T00:00:00Z",
            exited_at: "2026-02-10T00:00:00Z",
            entered_by: "Dana Okafor",
            notes: "Champion was on leave; agreed to proceed.",
            advanced_with_gaps: true,
          },
        ],
      }),
    );
    const moved = doc.sections.find((s) => s.heading === "How the project moved")!;
    expect(moved.entries[0]!.meta).toContainEqual(["Moved on with criteria outstanding", "Yes"]);
    expect(moved.entries[0]!.detail).toContain("Champion was on leave");
  });

  it("lists the tasks still open at completion, and counts the ones that were not", () => {
    const doc = buildImplementationDocument(
      implInput({
        workItems: [
          { title: "Kickoff held", status: "done", stage_key: "onboarding", party: "internal" },
          { title: "Data sample received", status: "open", stage_key: "build", party: "customer" },
        ],
      }),
    );
    const plan = doc.sections.find((s) => s.heading === "The plan, as completed")!;
    expect(plan.note).toContain("1 of 2 task(s) were ticked");
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]!.title).toBe("Data sample received");
  });

  it("says nothing was left open when nothing was", () => {
    const doc = buildImplementationDocument(
      implInput({
        workItems: [{ title: "Kickoff held", status: "done", stage_key: "onboarding" }],
      }),
    );
    const plan = doc.sections.find((s) => s.heading === "The plan, as completed")!;
    expect(plan.note).toContain("Nothing was left open");
  });

  it("carries what was done about a risk, which is the column a risk actually has", () => {
    const doc = buildImplementationDocument(
      implInput({
        risks: [
          {
            title: "Legacy export format undocumented",
            description: "Nobody at the customer knows the schema.",
            status: "closed",
            severity: "high",
            identified_at: "2026-02-03T00:00:00Z",
            resolved_at: "2026-03-11T00:00:00Z",
            mitigation: "Reverse-engineered from three sample files and confirmed with their DBA.",
          },
        ],
      }),
    );
    const risks = doc.sections.find((s) => s.heading === "Risks and issues")!;
    expect(risks.entries[0]!.title).toBe("Risk — Legacy export format undocumented");
    expect(risks.entries[0]!.meta).toContainEqual([
      "What was done about it",
      "Reverse-engineered from three sample files and confirmed with their DBA.",
    ]);
    expect(risks.entries[0]!.meta).toContainEqual(["Resolved", "2026-03-11"]);
  });

  it("carries how an issue ended, which a risk has no column for", () => {
    const doc = buildImplementationDocument(
      implInput({
        issues: [
          {
            title: "Nightly job timed out",
            status: "closed",
            raised_at: "2026-05-02T00:00:00Z",
            resolved_at: "2026-05-04T00:00:00Z",
            resolution: "Batched into pages of 500.",
          },
        ],
      }),
    );
    const issues = doc.sections.find((s) => s.heading === "Risks and issues")!;
    expect(issues.entries[0]!.title).toBe("Issue — Nightly job timed out");
    expect(issues.entries[0]!.meta).toContainEqual(["How it ended", "Batched into pages of 500."]);
  });
});

function solutionInput(over: Record<string, unknown> = {}) {
  return {
    customerName: "Northwind Fleet",
    implementationName: "Field inspections rollout",
    solution: {
      id: "sol-1",
      title: "Dispatch → ERP work order sync",
      status: "validated",
      owner_id: "tm-2",
      created_at: "2026-02-14T00:00:00Z",
      design_summary: "Work orders move nightly from Dispatch into the ERP.",
      configuration_details: "REST, creds in 1Password, 02:00 UTC.",
    },
    completedAt: "2026-08-31T14:00:00.000Z",
    named,
    notes: [],
    mappings: [],
    decisions: [],
    approvals: [],
    evidence: [],
    requirementTitle: "Stop double entry of work orders",
    ...over,
  };
}

describe("buildSolutionDocument", () => {
  it("leads with what it does and how it is set up", () => {
    const doc = buildSolutionDocument(solutionInput());
    expect(doc.sections[0]!.heading).toBe("What it does");
    expect(doc.sections[0]!.entries[0]!.detail).toContain("nightly");
    expect(doc.sections[1]!.entries[0]!.detail).toContain("1Password");
  });

  it("says plainly when nobody wrote down what it does", () => {
    const doc = buildSolutionDocument(
      solutionInput({
        solution: { ...solutionInput().solution, design_summary: "   " },
      }),
    );
    expect(doc.sections[0]!.entries).toHaveLength(0);
    expect(doc.sections[0]!.emptyNote).toBe("Nobody wrote down what this solution does.");
  });

  it("renders a field mapping as the movement it is", () => {
    const doc = buildSolutionDocument(
      solutionInput({
        mappings: [
          {
            source_field: "wo_number",
            target_field: "WorkOrder__c",
            source_system: "Dispatch",
            required: true,
            status: "validated",
            transformation_notes: "Prefixed with the depot code.",
          },
        ],
      }),
    );
    const m = doc.sections.find((s) => s.heading === "Field mapping")!;
    expect(m.entries[0]!.title).toBe("wo_number → WorkOrder__c");
    expect(m.entries[0]!.meta).toContainEqual(["Required", "Yes"]);
  });

  it("distinguishes a mapping that is not required from one nobody answered", () => {
    const doc = buildSolutionDocument(
      solutionInput({
        mappings: [
          { source_field: "a", target_field: "b", required: false },
          { source_field: "c", target_field: "d", required: null },
        ],
      }),
    );
    const m = doc.sections.find((s) => s.heading === "Field mapping")!;
    expect(m.entries[0]!.meta).toContainEqual(["Required", "No"]);
    expect(m.entries[1]!.meta).toContainEqual(["Required", "—"]);
  });
});

describe("summaryText", () => {
  const doc = buildSolutionDocument(
    solutionInput({
      notes: [
        {
          note_type: "build",
          content: "Nightly job wired up.\n  Retries three times.",
          created_at: "2026-03-02T00:00:00Z",
          author_id: "tm-2",
        },
      ],
    }),
  );

  it("opens with what completed and where to read the full record", () => {
    const text = summaryText(doc, "https://example.test/api/completion-record/abc");
    expect(text.split("\n")[0]).toBe("Solution complete — Dispatch → ERP work order sync");
    expect(text).toContain("Full record: https://example.test/api/completion-record/abc");
  });

  it("flattens a multi-line note into one line, because a note body is prose", () => {
    const text = summaryText(doc, "https://example.test/x");
    expect(text).toContain("Nightly job wired up. Retries three times.");
  });

  it("states an empty section rather than dropping it", () => {
    const text = summaryText(doc, "https://example.test/x");
    expect(text).toContain("No field mappings were recorded for this solution.");
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
