import { describe, expect, it } from "vitest";

import { markForService, markForTool } from "../brand-marks";
import { deliverablesFor, marksForIntake } from "../deliverables";
import { readIntake } from "../intake-answers";
import { buildTimeline } from "../onboarding-timeline";
import type { ServiceSpec } from "../onboarding-services";

const intake = readIntake({
  path: "new_logo",
  wanted_forms: [
    { id: "f1", name: "Service Ticket" },
    { id: "f2", name: "Safety Inspection" },
  ],
  timeline: {
    services: [
      { id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 },
      { id: "pdf", kind: "custom_pdf", name: "Invoice PDF", phase: 2 },
      { id: "train", kind: "training", name: "Crew training", phase: 1 },
    ],
  },
});

describe("marks", () => {
  it("finds a brand by tool key or by the words a person typed", () => {
    expect(markForTool("qbo")?.kind).toBe("svg");
    // The tool key rides along, so an uploaded logo can replace the mark.
    expect(markForTool("qbo")?.tool).toBe("qbo");
    expect(markForService({ kind: "integration", name: "Salesforce" }).tool).toBe("salesforce");
    expect(markForService({ kind: "training", name: "Crew training" }).tool).toBeUndefined();
    expect(markForService({ kind: "integration", name: "QBO invoice sync" }).title).toBe(
      "QuickBooks Online",
    );
    expect(markForService({ kind: "integration", name: "Salesforce" })).toMatchObject({
      kind: "mono",
      text: "SF",
    });
    // A system we do not know still gets a mark: the kind's.
    expect(markForService({ kind: "integration", name: "Mystery ERP" }).title).toBe("Integration");
    expect(markForService({ kind: "custom_pdf", name: "Invoice PDF" })).toMatchObject({
      text: "PDF",
    });
  });
});

describe("deliverables", () => {
  it("lists the first form, the later forms and every service, with a state each", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      services: intake.timeline.services as ServiceSpec[],
    });
    const d = deliverablesFor(intake, t);
    expect(d.map((x) => x.label)).toEqual([
      "Service Ticket",
      "Safety Inspection",
      "Crew training",
      "QuickBooks Online",
      "Invoice PDF",
    ]);
    expect(d[0]!.state).toBe("active"); // phase 1 is where we are
    expect(d[2]!.state).toBe("active"); // alongside the form
    expect(d[3]!.state).toBe("upcoming"); // phase 2 waits for the form
    expect(d[3]!.mark.title).toBe("QuickBooks Online");
    expect(d[4]!.sublabel).toMatch(/^Phase 2/);
  });

  it("checks the form off once it is live and moves the ring to phase 2", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      services: intake.timeline.services as ServiceSpec[],
      completed: { live: "2026-09-18" },
    });
    const d = deliverablesFor(intake, t);
    expect(d[0]!.state).toBe("done");
    expect(d[0]!.sublabel).toBe("Live Sep 18");
    expect(d.find((x) => x.label === "QuickBooks Online")!.state).toBe("active");
  });

  it("gives a card the marks alone, deduped", () => {
    const marks = marksForIntake(intake);
    expect(marks.map((m) => m.title)).toEqual([
      "Form",
      "QuickBooks Online",
      "Custom PDF",
      "Training",
    ]);
  });
});
