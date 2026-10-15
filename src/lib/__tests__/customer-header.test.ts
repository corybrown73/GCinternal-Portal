import { describe, expect, it } from "vitest";

import {
  completedLabel,
  headerStage,
  partnerChipLabel,
  projectLabel,
  projectsNewestFirst,
  showKickoffDeckLink,
} from "@/lib/customer-header";
import type { PartnerProgress } from "@/lib/partner-journey";
import type { ImplementationSummary } from "@/lib/hub-types";

const STANDARD = {
  deal_stage: "onboarding_kickoff",
  journey_type: null,
  partner_key: null,
} as never;
const PARTNER = {
  deal_stage: "closed_won",
  journey_type: "partner_implementation",
  partner_key: "field_fusion_iq",
} as never;

const progress = {
  current: "roll_out",
  currentLabel: "Roll Out",
  stages: [
    { key: "pre_sale_poc" },
    { key: "form_finalisation" },
    { key: "roll_out" },
    { key: "graduate" },
  ],
  milestones: [],
} as unknown as PartnerProgress;

describe("headerStage", () => {
  it("shows the deal stage for a standard implementation", () => {
    const stage = headerStage(STANDARD, { progress: null, loading: false, failed: false });
    expect(stage).toMatchObject({ state: "ready", position: null });
    expect(stage.label).not.toBe("");
  });

  it("shows the partner's own stage and position, never the deal stage", () => {
    const stage = headerStage(PARTNER, { progress, loading: false, failed: false });
    expect(stage).toEqual({ state: "ready", label: "Roll Out", position: { index: 3, total: 4 } });
  });

  it("shows a loading state for a partner while progress loads, not the deal stage", () => {
    const stage = headerStage(PARTNER, { progress: null, loading: true, failed: false });
    expect(stage).toEqual({ state: "loading", label: "Loading stage…", position: null });
  });

  it("shows an unavailable state for a partner when progress cannot be read", () => {
    const stage = headerStage(PARTNER, { progress: null, loading: false, failed: true });
    expect(stage).toEqual({ state: "unavailable", label: "Stage unavailable", position: null });
  });

  it("says Not started when a partner has no current stage", () => {
    const stage = headerStage(PARTNER, {
      progress: { ...progress, current: null, currentLabel: null } as PartnerProgress,
      loading: false,
      failed: false,
    });
    expect(stage).toEqual({ state: "ready", label: "Not started", position: null });
  });
});

describe("showKickoffDeckLink", () => {
  it("shows the link for a deal-linked standard implementation", () => {
    expect(showKickoffDeckLink({ deal_id: "d1", journey_type: null, partner_key: null })).toBe(
      true,
    );
  });

  it("hides the link for a partner implementation, even when it has a deal", () => {
    expect(
      showKickoffDeckLink({
        deal_id: "d1",
        journey_type: "partner_implementation",
        partner_key: "field_fusion_iq",
      }),
    ).toBe(false);
  });

  it("hides the link when there is no deal", () => {
    expect(showKickoffDeckLink({ deal_id: null, journey_type: null, partner_key: null })).toBe(
      false,
    );
  });
});

describe("completedLabel", () => {
  it("shows Completed only where a completion outcome is recorded", () => {
    expect(completedLabel({ complete_outcome: "proven" } as never)).toBe("Completed");
    expect(completedLabel({ complete_outcome: "not_proven" } as never)).toBe("Completed");
  });

  it("shows nothing for a stage label alone", () => {
    expect(completedLabel({ complete_outcome: null } as never)).toBeNull();
  });
});

describe("partnerChipLabel", () => {
  it("names the partner for a partner implementation", () => {
    expect(
      partnerChipLabel({
        journey_type: "partner_implementation",
        partner_key: "field_fusion_iq",
      } as never),
    ).toBe("Partner · Field Fusion IQ");
  });

  it("returns nothing for a standard implementation", () => {
    expect(partnerChipLabel({ journey_type: null, partner_key: null } as never)).toBeNull();
  });
});

describe("projects", () => {
  const list = [
    { id: "old", name: "Earlier", created_at: "2026-01-01" },
    { id: "new", name: "Newer", created_at: "2026-06-01" },
  ] as unknown as ImplementationSummary[];

  it("lists projects newest first", () => {
    expect(projectsNewestFirst(list).map((p) => p.id)).toEqual(["new", "old"]);
  });

  it("does not reorder the record it was given", () => {
    projectsNewestFirst(list);
    expect(list.map((p) => p.id)).toEqual(["old", "new"]);
  });

  it("names a project that has no name of its own, or the customer's name, as the original", () => {
    expect(projectLabel("Acme", "Acme")).toBe("Original project");
    expect(projectLabel(null, "Acme")).toBe("Original project");
    expect(projectLabel("Acme rollout", "Acme")).toBe("Acme rollout");
  });
});
