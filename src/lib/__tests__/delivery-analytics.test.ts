import { describe, expect, it } from "vitest";

import { byKind, byTool, outcomesFor, rollup, stepSlips } from "../delivery-analytics";
import { buildTimeline } from "../onboarding-timeline";
import { toolFromName, toolsForKind } from "../onboarding-tools";

const services = [
  { id: "qb", kind: "integration" as const, name: "QuickBooks Online", phase: 2, tier: 3 as const },
  { id: "pdf", kind: "custom_pdf" as const, name: "Invoice PDF", phase: 2 },
];

describe("toolFromName", () => {
  it("reads a typed name as a known tool, longest alias first", () => {
    expect(toolFromName("QBO invoice sync")?.key).toBe("qbo");
    expect(toolFromName("QuickBooks Desktop Enterprise")?.key).toBe("qbd");
    expect(toolFromName("Power BI dashboard")?.key).toBe("powerbi");
    expect(toolFromName("Invoice PDF")).toBeNull();
    expect(toolsForKind("analytics").map((t) => t.key)).toContain("powerbi");
  });
});

describe("outcomesFor", () => {
  it("gives phase 1 and every service a planned length, and marks what is done, late or waiting", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      services,
      formProvenOn: "2026-09-18",
      completed: {
        close: "2026-09-09",
        kickoff: "2026-09-11",
        homework: "2026-09-14",
        working: "2026-09-16",
        fieldtest: "2026-09-23",
        adjust: "2026-09-24",
        live: "2026-10-02", // two business days late
        "pdf:kickoff": "2026-10-01",
        "pdf:build": "2026-10-05",
        "pdf:review": "2026-10-07",
        "pdf:live": "2026-10-08",
      },
    });
    const rows = outcomesFor(
      { dealId: "d", account: "Maverick", timeline: t, services },
      "2026-10-28",
    );
    const form = rows.find((r) => r.kind === "phase1")!;
    expect(form).toMatchObject({ plannedDays: 15, actualDays: 17, slipDays: 2, status: "done" });
    const pdf = rows.find((r) => r.tool === "name:invoice pdf")!;
    expect(pdf.status).toBe("done");
    expect(pdf.slipDays).toBe(0);
    const qb = rows.find((r) => r.tool === "qbo")!;
    expect(qb.toolLabel).toBe("QuickBooks Online");
    expect(qb.status).toBe("late");
    expect(qb.overdueDays).toBeGreaterThan(0);
    expect(qb.actualDays).toBeNull();
  });

  it("rolls up by tool and by kind, with on-time share and the step that slips most", () => {
    const late = buildTimeline({
      closeDate: "2026-09-09",
      completed: { adjust: "2026-09-24", live: "2026-10-02" },
    });
    const onTime = buildTimeline({ closeDate: "2026-09-09", completed: { live: "2026-09-30" } });
    const rows = [
      ...outcomesFor({ dealId: "a", account: "A", timeline: late, services: [] }, "2026-10-05"),
      ...outcomesFor({ dealId: "b", account: "B", timeline: onTime, services: [] }, "2026-10-05"),
    ];
    const [r] = rollup(rows, byKind);
    expect(r).toMatchObject({
      key: "phase1",
      count: 2,
      done: 2,
      onTimePct: 50,
      avgPlannedDays: 15,
    });
    expect(r!.avgSlipDays).toBe(1);
    expect(r!.worstStep?.label).toBe("Functional — in your users' hands");
    expect(rollup(rows, byTool)[0]!.label).toBe("First form (15 business days)");
    expect(stepSlips(rows)[0]).toMatchObject({
      label: "Functional — in your users' hands",
      avgSlipDays: 1,
    });
  });
});
