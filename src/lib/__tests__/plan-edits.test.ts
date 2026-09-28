import { describe, expect, it } from "vitest";

import { EMPTY_PLAN_EDITS, readIntake, type PlanEdits } from "../intake-answers";
import { timelineFor } from "../onboarding-plan";
import {
  NEW_LOGO_PLAN,
  addBusinessDays,
  applyDealEdits,
  buildTimeline,
  hasDealEdits,
} from "../onboarding-timeline";

const keys = (specs: readonly { key: string }[]) => specs.map((s) => s.key);

describe("an account's departures from the standard plan", () => {
  it("is the standard when nothing was changed", () => {
    expect(applyDealEdits(NEW_LOGO_PLAN, null)).toBe(NEW_LOGO_PLAN);
    expect(applyDealEdits(NEW_LOGO_PLAN, EMPTY_PLAN_EDITS)).toBe(NEW_LOGO_PLAN);
    expect(hasDealEdits(EMPTY_PLAN_EDITS)).toBe(false);
  });

  it("takes a stage off — a stage that already happened pre-sale — but never the close or the finish", () => {
    const out = applyDealEdits(NEW_LOGO_PLAN, {
      ...EMPTY_PLAN_EDITS,
      removed: ["homework", "close", "live"],
    });
    expect(keys(out)).toEqual(["close", "kickoff", "working", "fieldtest", "adjust", "live"]);
  });

  it("keeps the order a person set, and never lets a later day sit above an earlier one", () => {
    const out = applyDealEdits(NEW_LOGO_PLAN, {
      ...EMPTY_PLAN_EDITS,
      order: ["close", "working", "kickoff", "homework", "fieldtest", "adjust", "live"],
    });
    expect(keys(out)).toEqual([
      "close",
      "working",
      "kickoff",
      "homework",
      "fieldtest",
      "adjust",
      "live",
    ]);
    const days = out.map((m) => m.day);
    for (let i = 1; i < days.length; i += 1) expect(days[i]!).toBeGreaterThanOrEqual(days[i - 1]!);
    expect(out[out.length - 1]!.key).toBe("live");
  });

  it("renames, retypes and re-icons a step, and sizes a call", () => {
    const edits: PlanEdits = {
      ...EMPTY_PLAN_EDITS,
      steps: {
        working: { label: "Working session — their data", kind: "build", icon: "Table2" },
        adjust: { minutes: 45, owner: "gocanvas" },
      },
    };
    const out = applyDealEdits(NEW_LOGO_PLAN, edits);
    const working = out.find((m) => m.key === "working")!;
    expect(working).toMatchObject({
      label: "Working session — their data",
      kind: "build",
      icon: "Table2",
    });
    expect(working.minutes).toBeUndefined();
    expect(out.find((m) => m.key === "adjust")).toMatchObject({ minutes: 45, owner: "gocanvas" });
  });

  it("adds a step of this account's own, on its own day, with a fitting icon", () => {
    const out = applyDealEdits(NEW_LOGO_PLAN, {
      ...EMPTY_PLAN_EDITS,
      added: [{ key: "step-a1", label: "Data review with the office", kind: "call", day: 7 }],
    });
    const added = out.find((m) => m.key === "step-a1")!;
    expect(added).toMatchObject({
      day: 7,
      kind: "call",
      minutes: 60,
      icon: "PhoneCall",
      owner: "both",
    });
    // Slotted in by its day when no order was set: after day 6, before day 11.
    expect(keys(out)).toEqual([
      "close",
      "kickoff",
      "homework",
      "working",
      "fieldtest",
      "step-a1",
      "adjust",
      "live",
    ]);
  });

  it("flows through the timeline: dates follow the edited plan, and the finish line stays last", () => {
    const intake = readIntake({
      path: "new_logo",
      timeline: {
        plan_edits: {
          removed: ["homework"],
          steps: { kickoff: { label: "Stage 1 — already held" } },
        },
      },
    });
    const t = timelineFor(intake, "2026-09-21");
    expect(t.edited).toBe(true);
    expect(t.milestones.map((m) => m.key)).toEqual([
      "close",
      "kickoff",
      "working",
      "fieldtest",
      "adjust",
      "live",
    ]);
    expect(t.milestones.find((m) => m.key === "kickoff")!.label).toBe("Stage 1 — already held");
    expect(t.liveDate).toBe(addBusinessDays("2026-09-21", 15));
    expect(buildTimeline({ closeDate: "2026-09-21", path: "new_logo" }).edited).toBe(false);
  });

  it("still anchors the services when the first call itself was taken off", () => {
    const t = buildTimeline({
      closeDate: "2026-09-21",
      path: "new_logo",
      planEdits: { ...EMPTY_PLAN_EDITS, removed: ["kickoff"] },
      services: [{ id: "jsa", kind: "paid_form", name: "JSA", phase: 1 }],
    });
    const firstCall = t.milestones.find((m) => m.kind === "call")!;
    expect(t.alongside[0]!.startsOn).toBe(addBusinessDays(firstCall.date, 1));
  });
});
