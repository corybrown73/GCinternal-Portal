import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ProjectRail } from "@/components/project-timeline-rail";
import { fmtDate } from "@/lib/hub-format";
import { PARTNER_JOURNEY } from "@/lib/partner-implementation";
import { partnerProgress, type PartnerProgress } from "@/lib/partner-journey";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { partnerJourneyFor } from "@/lib/partner-journey.server";
import {
  buildProjectTimeline,
  partnerRailFrom,
  railSummary,
  timelineHeadline,
  type PartnerRail,
  type TimelineInput,
} from "@/lib/project-timeline";
import { seededPartnerProgress } from "@/lib/partner-progress-seed";

/**
 * Issue #82 review. A partner project's Projects rail must never present a
 * standard-plan date as its target. Its date is its recorded Roll Out target,
 * and when there is none the rail says so. The stage display and the date
 * indicator must tell the same story.
 */

const now = new Date("2026-06-15T12:00:00Z");
const STALE_STANDARD_PLAN_END = "2026-09-01";
const STALE_STANDARD_LAUNCH = "2026-08-20";
const ROLL_OUT_TARGET = "2026-11-10";
const ROLL_OUT_DONE = "2026-11-02";
const PARTNER_LABELS = PARTNER_JOURNEY.map((s) => s.label);
const ROLL_OUT_LABEL = PARTNER_JOURNEY.find((s) => s.key === "roll_out")!.label;

/**
 * The partner model's progress, with optional recorded Roll Out milestone. The
 * milestone is the authoritative Roll Out date, as the partner model reads it.
 */
function progressWith(opts: {
  current: string | null;
  rollOutTarget?: string | null;
  rollOutDone?: boolean;
  doneBefore?: string[];
}): PartnerProgress {
  const done = new Set(opts.doneBefore ?? []);
  if (opts.rollOutDone) done.add("roll_out");
  return partnerProgress({
    currentStage: opts.current,
    dealStage: "closed_won",
    dealTransitions: [],
    stageInstances: PARTNER_JOURNEY.filter((s) => done.has(s.key)).map((s) => ({
      stage_key: s.key,
      status: "done",
      gate_mode: null,
    })),
    stageHistory: [],
    milestones: opts.rollOutTarget
      ? [
          {
            name: "Roll Out",
            stage: "roll_out",
            status: opts.rollOutDone ? "completed" : "open",
            target_date: opts.rollOutTarget,
            completed_date: opts.rollOutDone ? ROLL_OUT_DONE : null,
          },
        ]
      : [],
    workItems: [],
  });
}

/** A partner project that still carries standard-plan dates on its own row. */
function partnerProject(
  partner: PartnerRail | null,
  over: Partial<TimelineInput> = {},
): TimelineInput {
  return {
    id: "impl-p",
    name: "Partner rollout",
    current_stage: "pilot",
    stage_entered_at: "2026-06-01T00:00:00Z",
    contract_start_date: "2026-05-01",
    // Standard-plan values, left behind by the standard sync before #76.
    target_date: STALE_STANDARD_PLAN_END,
    target_launch_date: STALE_STANDARD_PLAN_END,
    actual_launch_date: STALE_STANDARD_LAUNCH,
    journey_type: "partner_implementation",
    partner_key: "field_fusion_iq",
    partner,
    ...over,
  };
}

describe("a partner whose stored target holds an old standard-plan value", () => {
  it("never presents the standard plan end as the partner's target", () => {
    const t = buildProjectTimeline(
      partnerProject(partnerRailFrom(progressWith({ current: "pilot" }))),
      now,
    );
    expect(t.targetLaunchDate).toBeNull();
    expect(t.actualLaunchDate).toBeNull();
    expect(t.launch.level).toBe("unknown");
    expect(t.launch.reason).toBe("No target date set.");
  });

  it("does not show the stale standard date anywhere in the rail, its summary, or its markup", () => {
    const t = buildProjectTimeline(
      partnerProject(partnerRailFrom(progressWith({ current: "pilot" }))),
      now,
    );
    const markup = renderToStaticMarkup(
      createElement(ProjectRail, {
        project: partnerProject(partnerRailFrom(progressWith({ current: "pilot" }))),
        now,
      }),
    );
    expect(railSummary(t)).not.toContain(STALE_STANDARD_PLAN_END);
    expect(railSummary(t)).not.toContain(fmtDate(STALE_STANDARD_PLAN_END));
    expect(markup).not.toContain(fmtDate(STALE_STANDARD_PLAN_END));
    expect(markup).not.toContain(fmtDate(STALE_STANDARD_LAUNCH));
    expect(markup).toContain("Not recorded");
  });

  it("still puts the date indicator on the partner's own label, not the plan end", () => {
    const t = buildProjectTimeline(
      partnerProject(partnerRailFrom(progressWith({ current: "pilot" }))),
      now,
    );
    expect(t.targetLabel).toBe("Roll Out target");
    expect(railSummary(t)).toContain("Roll Out target: No target date set.");
    expect(railSummary(t)).not.toContain("Plan end");
  });
});

describe("a partner with a recorded Roll Out milestone", () => {
  it("uses the recorded Roll Out target as the partner's target", () => {
    const t = buildProjectTimeline(
      partnerProject(
        partnerRailFrom(progressWith({ current: "pilot", rollOutTarget: ROLL_OUT_TARGET })),
      ),
      now,
    );
    expect(t.targetLaunchDate).toBe(ROLL_OUT_TARGET);
    expect(t.targetLaunchDate).not.toBe(STALE_STANDARD_PLAN_END);
    expect(railSummary(t)).toContain(`Roll Out target: ${t.launch.reason}`);
  });

  it("measures pace against the Roll Out target and the Roll Out completion", () => {
    const pending = buildProjectTimeline(
      partnerProject(
        partnerRailFrom(progressWith({ current: "pilot", rollOutTarget: ROLL_OUT_TARGET })),
      ),
      now,
    );
    expect(pending.launch.level).not.toBe("done");

    const delivered = buildProjectTimeline(
      partnerProject(
        partnerRailFrom(
          progressWith({
            current: null,
            rollOutTarget: ROLL_OUT_TARGET,
            rollOutDone: true,
            doneBefore: PARTNER_JOURNEY.slice(0, 6).map((s) => s.key),
          }),
        ),
      ),
      now,
    );
    expect(delivered.actualLaunchDate).toBe(ROLL_OUT_DONE);
    expect(delivered.launch.level).toBe("done");
  });

  it("tells the same story as the stage display: Roll Out current, with its date beside it", () => {
    const t = buildProjectTimeline(
      partnerProject(
        partnerRailFrom(
          progressWith({
            current: "roll_out",
            rollOutTarget: ROLL_OUT_TARGET,
            doneBefore: PARTNER_JOURNEY.slice(0, 6).map((s) => s.key),
          }),
        ),
      ),
      now,
    );
    expect(timelineHeadline(t)).toBe(`Stage 7 of 7 · ${ROLL_OUT_LABEL}`);
    expect(t.stages.find((s) => s.name === ROLL_OUT_LABEL)!.state).toBe("current");
    expect(t.targetLaunchDate).toBe(ROLL_OUT_TARGET);
    const markup = renderToStaticMarkup(
      createElement(ProjectRail, {
        project: partnerProject(
          partnerRailFrom(
            progressWith({
              current: "roll_out",
              rollOutTarget: ROLL_OUT_TARGET,
              doneBefore: PARTNER_JOURNEY.slice(0, 6).map((s) => s.key),
            }),
          ),
        ),
        now,
      }),
    );
    expect(markup).toContain(fmtDate(ROLL_OUT_TARGET));
    expect(markup).toContain("Roll Out target");
  });

  it("carries the Roll Out milestone through the partner rail model itself", () => {
    const rail = partnerRailFrom(
      progressWith({ current: "pilot", rollOutTarget: ROLL_OUT_TARGET }),
    );
    expect(rail.status).toBe("ready");
    if (rail.status !== "ready") return;
    expect(rail.rollOut).toEqual({ target: ROLL_OUT_TARGET, completed: null });
  });
});

describe("a partner without a Roll Out target", () => {
  it("shows no target, rather than a date worked out from the standard stages", () => {
    const t = buildProjectTimeline(
      partnerProject(partnerRailFrom(progressWith({ current: "trial_run" }))),
      now,
    );
    expect(t.targetLaunchDate).toBeNull();
    expect(t.launch.reason).toBe("No target date set.");
    expect(railSummary(t)).toContain("Roll Out target: No target date set.");
  });

  it("says Not recorded in the lane, not a dash that looks like a missing reading", () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectRail, {
        project: partnerProject(partnerRailFrom(progressWith({ current: "trial_run" }))),
        now,
      }),
    );
    expect(markup).toContain("Not recorded");
  });
});

describe("unavailable partner progress", () => {
  it.each([
    ["no progress recorded", null],
    ["progress not read", undefined],
    ["progress unavailable", { status: "unavailable" } as const],
  ])("shows no date at all when %s, even with stored dates on the project", (_label, partner) => {
    const project = partnerProject(partner as PartnerRail | null);
    if (partner === undefined) delete project.partner;
    const t = buildProjectTimeline(project, now);
    expect(t.source).toBe("partner_unavailable");
    expect(t.targetLaunchDate).toBeNull();
    expect(t.actualLaunchDate).toBeNull();
    expect(railSummary(t)).not.toContain(STALE_STANDARD_PLAN_END);
    const markup = renderToStaticMarkup(createElement(ProjectRail, { project, now }));
    expect(markup).not.toContain(fmtDate(STALE_STANDARD_PLAN_END));
    expect(markup).toContain("Partner progress is unavailable");
    for (const label of PARTNER_LABELS) expect(markup).not.toContain(label.replace(/&/g, "&amp;"));
    expect(timelineHeadline(t)).toBe("Partner progress unavailable");
  });
});

describe("standard implementations keep their dates", () => {
  const standard = (over: Partial<TimelineInput> = {}): TimelineInput => ({
    id: "impl-s",
    name: "Standard rollout",
    current_stage: "build",
    stage_entered_at: "2026-06-06T00:00:00Z",
    target_date: "2026-09-01",
    target_launch_date: "2026-09-01",
    actual_launch_date: null,
    journey_type: null,
    partner_key: null,
    stages: [
      {
        stage_key: "build",
        name: "Build",
        position: 1,
        status: "active",
        entered_at: "2026-06-06T00:00:00Z",
        exited_at: null,
        target_duration_days: 14,
      },
    ],
    ...over,
  });

  it("keeps the plan end as the target, unchanged", () => {
    const t = buildProjectTimeline(standard(), now);
    expect(t.source).toBe("stage_instances");
    expect(t.targetLaunchDate).toBe("2026-09-01");
    expect(t.targetLabel).toBe("Plan end");
    expect(railSummary(t)).toContain("Plan end:");
    expect(railSummary(t)).not.toContain("Roll Out");
  });

  it("keeps the actual launch as the launch, unchanged", () => {
    const t = buildProjectTimeline(standard({ actual_launch_date: "2026-08-28" }), now);
    expect(t.actualLaunchDate).toBe("2026-08-28");
  });

  it("keeps a standard project with no target as it was", () => {
    const t = buildProjectTimeline(standard({ target_date: null, target_launch_date: null }), now);
    expect(t.targetLaunchDate).toBeNull();
    expect(t.targetLabel).toBe("Plan end");
    expect(t.launch.reason).toBe("No target date set.");
  });
});

describe("the partner progress is read once and shared", () => {
  it("reads a partner project's progress through one call, and returns it for the page as well as the rail", async () => {
    const progress = progressWith({ current: "pilot", rollOutTarget: ROLL_OUT_TARGET });
    const load = vi.fn(async () => progress);
    const read = await partnerJourneyFor("impl-p", load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(read.progress).toBe(progress);
    expect(read.rail).toEqual(partnerRailFrom(progress));
  });

  it("seeds the page's partner query only for the implementation the record carries", () => {
    const progress = progressWith({ current: "pilot" });
    const record = { partner_progress: { implementation_id: "impl-p", progress } };
    expect(seededPartnerProgress(record, "impl-p")).toBe(progress);
    expect(seededPartnerProgress(record, "impl-other")).toBeUndefined();
    expect(seededPartnerProgress({ partner_progress: null }, "impl-p")).toBeUndefined();
  });
});
