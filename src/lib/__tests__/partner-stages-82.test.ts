import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectRail } from "@/components/project-timeline-rail";
import { headerStage } from "@/lib/customer-header";
import { PARTNER_JOURNEY } from "@/lib/partner-implementation";
import { partnerProgress, type PartnerProgress } from "@/lib/partner-journey";
import { partnerRailFor } from "@/lib/partner-journey.server";
import {
  adminStageHistory,
  buildProjectTimeline,
  partnerRailFrom,
  railSummary,
  timelineHeadline,
  type PartnerRail,
  type StageInstanceRow,
  type TimelineInput,
} from "@/lib/project-timeline";

// The partner reader is imported for its loader, so the database client is stubbed.
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

/**
 * Issue #82. A partner implementation's Projects section shows the seven-stage
 * partner journey, from its own partner progress. It never shows the standard
 * stages, never presents a standard deal stage as its progress, and never falls
 * back to the standard stages when its progress is unavailable.
 */

const now = new Date("2026-06-15T12:00:00Z");
const PARTNER_LABELS = PARTNER_JOURNEY.map((s) => s.label);

/** The seven stages as the partner model reports them, in order. */
function partnerProgressFixture(
  current: string | null,
  statuses: Partial<Record<string, "completed" | "skipped">> = {},
): PartnerProgress {
  return partnerProgress({
    currentStage: current,
    dealStage: "closed_won",
    dealTransitions: [],
    stageInstances: PARTNER_JOURNEY.filter((s) => statuses[s.key] !== undefined).map((s) => ({
      stage_key: s.key,
      status: statuses[s.key] === "completed" ? "done" : "skipped",
      gate_mode: null,
    })),
    stageHistory: [],
    milestones: [],
    workItems: [],
  });
}

/** Six standard stage instances, as a standard plan would leave them. */
const STANDARD_SIX: StageInstanceRow[] = [
  "handoff",
  "plan_internally",
  "kickoff",
  "align_externally",
  "build",
  "launch",
].map((key, i) => ({
  stage_key: key,
  name: `Standard ${i + 1}`,
  position: i + 1,
  status: i < 2 ? "done" : i === 2 ? "active" : "pending",
  entered_at: null,
  exited_at: null,
  target_duration_days: null,
}));

function partnerInput(over: Partial<TimelineInput> = {}): TimelineInput {
  return {
    id: "impl-p",
    name: "Partner rollout",
    current_stage: "partner_setup",
    stage_entered_at: "2026-06-01T00:00:00Z",
    contract_start_date: "2026-05-01",
    target_launch_date: "2026-09-01",
    journey_type: "partner_implementation",
    partner_key: "field_fusion_iq",
    // A partner project can still carry the standard stage rows. They must not show.
    stages: STANDARD_SIX,
    partner: partnerRailFrom(
      partnerProgressFixture("partner_setup", {
        pre_sale_poc: "completed",
        closed_won_planning: "completed",
      }),
    ),
    ...over,
  };
}

function standardInput(over: Partial<TimelineInput> = {}): TimelineInput {
  return {
    id: "impl-s",
    name: "Standard rollout",
    current_stage: "build",
    stage_entered_at: "2026-06-06T00:00:00Z",
    journey_type: null,
    partner_key: null,
    stages: STANDARD_SIX,
    ...over,
  };
}

const STANDARD_NAMES = STANDARD_SIX.map((s) => s.name);

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe("standard implementations are unchanged", () => {
  it("draws the project's own stage instances, as before", () => {
    const t = buildProjectTimeline(standardInput(), now);
    expect(t.source).toBe("stage_instances");
    expect(t.stages.map((s) => s.name)).toEqual(STANDARD_NAMES);
    expect(t.position).toBe(3);
  });

  it("falls back to the labelled default only when the standard project has no stages", () => {
    const t = buildProjectTimeline(standardInput({ stages: [] }), now);
    expect(t.source).toBe("lifecycle_default");
    expect(railSummary(t)).toContain("No plan has been applied");
  });

  it("does not treat a standard project with no journey fields as a partner", () => {
    const plain: TimelineInput = { ...standardInput() };
    delete plain.journey_type;
    delete plain.partner_key;
    const t = buildProjectTimeline(plain, now);
    expect(t.source).toBe("stage_instances");
  });
});

describe("partner implementations: the seven-stage journey", () => {
  it("is identified by journey_type, and draws the partner journey instead of the standard stages", () => {
    const t = buildProjectTimeline(partnerInput({ partner_key: null }), now);
    expect(t.source).toBe("partner_journey");
    expect(t.stages.map((s) => s.name)).toEqual(PARTNER_LABELS);
    expect(t.total).toBe(7);
    for (const name of STANDARD_NAMES) expect(t.stages.map((s) => s.name)).not.toContain(name);
  });

  it("is identified by partner_key, and draws the same journey", () => {
    const t = buildProjectTimeline(partnerInput({ journey_type: null }), now);
    expect(t.source).toBe("partner_journey");
    expect(t.stages.map((s) => s.name)).toEqual(PARTNER_LABELS);
  });

  it("keeps the seven stages in the journey's own order", () => {
    const t = buildProjectTimeline(partnerInput(), now);
    expect(t.stages.map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(t.stages.map((s) => s.key)).toEqual(PARTNER_JOURNEY.map((s) => s.key));
  });

  it("places the current position from the partner model", () => {
    const t = buildProjectTimeline(partnerInput(), now);
    expect(t.position).toBe(3);
    expect(t.currentStageName).toBe("Partner Setup & Connection");
    expect(t.stages.map((s) => s.state)).toEqual([
      "past",
      "past",
      "current",
      "future",
      "future",
      "future",
      "future",
    ]);
  });

  it("marks completed stages as done and the rest as not yet done", () => {
    const t = buildProjectTimeline(partnerInput(), now);
    expect(t.stages.filter((s) => s.state === "past")).toHaveLength(2);
    expect(t.isComplete).toBe(false);
  });

  it("keeps a skipped partner stage visible, distinct from a completed one", () => {
    const rail = partnerRailFrom(
      partnerProgressFixture("form_finalisation", {
        pre_sale_poc: "completed",
        closed_won_planning: "skipped",
      }),
    );
    const t = buildProjectTimeline(partnerInput({ partner: rail }), now);
    expect(t.stages[1]!.state).toBe("skipped");
    expect(t.stages[0]!.state).toBe("past");
  });

  it("is complete only when every partner stage is completed or skipped", () => {
    const allDone = partnerProgressFixture(
      null,
      Object.fromEntries(PARTNER_JOURNEY.map((s) => [s.key, "completed"])) as Record<
        string,
        "completed"
      >,
    );
    const done = buildProjectTimeline(partnerInput({ partner: partnerRailFrom(allDone) }), now);
    expect(done.isComplete).toBe(true);
    expect(done.dwell.level).toBe("done");

    const oneLeft = buildProjectTimeline(
      partnerInput({
        partner: partnerRailFrom(
          partnerProgressFixture(
            "roll_out",
            Object.fromEntries(
              PARTNER_JOURNEY.slice(0, 6).map((s) => [s.key, "completed"]),
            ) as Record<string, "completed">,
          ),
        ),
      }),
      now,
    );
    expect(oneLeft.isComplete).toBe(false);
  });

  it("shows 'Not started' with no current stage, and does not invent one", () => {
    const t = buildProjectTimeline(
      partnerInput({ partner: partnerRailFrom(partnerProgressFixture(null)) }),
      now,
    );
    expect(t.position).toBe(0);
    expect(t.currentStageName).toBe("Not started");
    // Pre-Sale & POC is complete once the deal has reached Closed Won, by the
    // partner model's own rule. Every other stage is still to come.
    expect(t.stages[0]!.state).toBe("past");
    expect(t.stages.slice(1).every((s) => s.state === "future")).toBe(true);
  });

  it("does not measure time in a partner stage from the standard stage entry date", () => {
    const t = buildProjectTimeline(partnerInput(), now);
    expect(t.dwell.reason).toBe("No stage-entry date recorded.");
    expect(t.stages.every((s) => s.days === null)).toBe(true);
  });

  it("agrees with the header about the current stage, from the same partner progress", () => {
    const progress = partnerProgressFixture("partner_setup", {
      pre_sale_poc: "completed",
      closed_won_planning: "completed",
    });
    const header = headerStage(
      {
        deal_stage: "closed_won",
        partner_key: "field_fusion_iq",
        journey_type: "partner_implementation",
      } as any,
      { progress, loading: false, failed: false },
    );
    const t = buildProjectTimeline(partnerInput({ partner: partnerRailFrom(progress) }), now);
    expect(t.currentStageName).toBe(header.label);
  });
});

describe("partner progress that is missing or unavailable", () => {
  it.each([
    ["no progress recorded", null],
    ["progress not read", undefined],
    ["progress unavailable", { status: "unavailable" } as PartnerRail],
  ])("shows an unavailable rail, never the standard stages, when %s", (_label, partner) => {
    const input: TimelineInput = { ...partnerInput() };
    if (partner === undefined) delete input.partner;
    else input.partner = partner;
    const t = buildProjectTimeline(input, now);
    expect(t.source).toBe("partner_unavailable");
    expect(t.stages).toHaveLength(0);
    expect(timelineHeadline(t)).toBe("Partner progress unavailable");
    expect(railSummary(t)).toContain("Partner progress is unavailable");
    expect(railSummary(t)).not.toContain("default");
  });

  it("never draws the standard stages or the standard default in place of missing partner progress", () => {
    const t = buildProjectTimeline(partnerInput({ partner: null }), now);
    expect(t.stages.map((s) => s.name)).not.toEqual(expect.arrayContaining(STANDARD_NAMES));
    expect(t.source).not.toBe("lifecycle_default");
    expect(t.source).not.toBe("stage_instances");
  });

  it("does not present a standard stage as the current partner stage when progress is unavailable", () => {
    const t = buildProjectTimeline(partnerInput({ partner: null }), now);
    expect(t.position).toBe(0);
    expect(t.currentStageName).not.toBe("Standard 3");
    expect(t.isComplete).toBe(false);
  });

  it("loads partner progress through the same reader, and reports a read that fails as unavailable", async () => {
    const rail = await partnerRailFor("impl-p", async () => {
      throw new Error("connection reset");
    });
    expect(rail).toEqual({ status: "unavailable" });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("reports a project with no partner progress as unavailable", async () => {
    const rail = await partnerRailFor("impl-p", async () => null);
    expect(rail).toEqual({ status: "unavailable" });
  });

  it("turns recorded partner progress into the rail's seven stages", async () => {
    const progress = partnerProgressFixture("pilot", {
      pre_sale_poc: "completed",
      closed_won_planning: "completed",
      partner_setup: "completed",
      form_finalisation: "completed",
    });
    const rail = await partnerRailFor("impl-p", async () => progress);
    expect(rail.status).toBe("ready");
    if (rail.status !== "ready") return;
    expect(rail.stages.map((s) => s.name)).toEqual(PARTNER_LABELS);
    expect(rail.current).toBe("pilot");
  });
});

describe("the text alternative names the partner journey, never a default", () => {
  it("says it is a partner journey and where the project stands", () => {
    const t = buildProjectTimeline(partnerInput(), now);
    const words = railSummary(t);
    expect(words).toContain("7-stage partner journey");
    expect(words).toContain("Stage 3 of 7: Partner Setup & Connection.");
    expect(words).not.toContain("default");
    expect(words).not.toContain("No plan has been applied");
  });

  it("reads the current stage in the headline", () => {
    expect(timelineHeadline(buildProjectTimeline(partnerInput(), now))).toBe(
      "Stage 3 of 7 · Partner Setup & Connection",
    );
  });
});

describe("administrative standard history is preserved, not presented as progress", () => {
  it("keeps every standard stage-history row, in order, with its own stage and dates", () => {
    const rows = [
      { id: "h2", stage: "build", entered_at: "2026-03-10T00:00:00Z", exited_at: null },
      {
        id: "h1",
        stage: "handoff",
        entered_at: "2026-01-05T00:00:00Z",
        exited_at: "2026-03-10T00:00:00Z",
      },
      { id: "h3", stage: "launch", entered_at: "2026-04-01T00:00:00Z", exited_at: null },
    ];
    const kept = adminStageHistory(rows);
    expect(kept.map((r) => r.id)).toEqual(["h1", "h2", "h3"]);
    expect(kept[0]).toEqual(rows[1]);
    expect(kept).toHaveLength(rows.length);
  });

  it("returns an empty history as empty, never as a stage", () => {
    expect(adminStageHistory([])).toEqual([]);
  });

  it("keeps partner standard history out of the partner rail", () => {
    const t = buildProjectTimeline(partnerInput(), now);
    expect(t.stages.map((s) => s.name)).toEqual(PARTNER_LABELS);
  });
});

/** renderToStaticMarkup escapes ampersands, so labels are compared in their escaped form. */
const escaped = (text: string) => text.replace(/&/g, "&amp;");

describe("the Projects rail, as rendered for a partner project", () => {
  const at = now;

  it("draws the seven partner stages and labels the journey as a partner journey", () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectRail, { project: partnerInput(), now: at }),
    );
    for (const label of PARTNER_LABELS) expect(markup).toContain(escaped(label));
    expect(markup).toContain("Partner journey");
    expect(markup).not.toContain("Default stages");
    for (const name of STANDARD_NAMES) expect(markup).not.toContain(name);
  });

  it("says plainly when partner progress is unavailable, and draws no stages", () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectRail, { project: partnerInput({ partner: null }), now: at }),
    );
    expect(markup).toContain("Partner progress is unavailable");
    for (const label of PARTNER_LABELS) expect(markup).not.toContain(escaped(label));
    for (const name of STANDARD_NAMES) expect(markup).not.toContain(name);
    expect(markup).not.toContain("Default stages");
  });
});
