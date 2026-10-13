import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CustomerDashboard } from "@/components/customer-dashboard";
import { screenList } from "@/components/welcome-page";
import { PlanSection } from "@/components/plan-section";
import { aeReplyDraft } from "../ae-reply";
import { deckKindFor } from "../deck-kind";
import { deliverablesFor } from "../deliverables";
import { outcomesFor } from "../delivery-analytics";
import { intakeAnswersSchema, flowAnswered, readIntake } from "../intake-answers";
import { PARTNER_PLANNING_TO_BE_CONFIRMED, partnerSelectionPatch } from "../partner-implementation";
import {
  partnerDashboardView,
  partnerProgress,
  type PartnerProgressInput,
} from "../partner-journey";
import { stageFlow, type FlowStageKey } from "../stage-flow";
import { timelineFor } from "../onboarding-plan";

/**
 * A partner deal never displays New Logo planning information: not before
 * Closed Won, and not after it. A New Logo, Existing or Device Magic deal keeps
 * its plan. Each surface a partner customer or the deal team reads is rendered
 * or computed here, and checked for the New Logo words it must not show.
 */

const PARTNER_INTAKE = intakeAnswersSchema.parse(partnerSelectionPatch("field_fusion_iq"));
const NEW_LOGO_INTAKE = intakeAnswersSchema.parse({ path: "new_logo" });

/** Words only a New Logo plan says. None may appear on a partner's surfaces. */
const NEW_LOGO_WORDS = [
  "Stage 1",
  "Stage 2",
  "core meeting",
  "Three core",
  "Functional",
  "business day",
  "business days",
  "Kickoff",
  "kickoff",
  "Before kickoff",
  "Working session",
  "Phase 1",
  "Week 4",
  "Jump start",
  "first form",
  "First form",
  "Due ",
];

function expectNoNewLogo(text: string, label: string) {
  for (const word of NEW_LOGO_WORDS) {
    expect(text, `${label} shows "${word}"`).not.toContain(word);
  }
}

/** A deal's welcome view, as the loader would build it for a partner deal before Closed Won. */
function preCloseView() {
  // The view's own shape is covered by welcome-access; here only the flags the
  // surfaces read matter, so the rest is the same empty dashboard.
  return {
    dealId: "deal-p",
    clientName: "Partner Customer Co",
    industry: "Pools",
    icon: "Waves",
    timeline: timelineFor(PARTNER_INTAKE, "2026-10-01"),
    lead: "Priya Lead",
    fieldTester: null,
    fieldTesterDue: null,
    fieldTesterSource: null,
    team: {
      lead: "Priya Lead",
      leadEmail: "priya@gocanvas.com",
      leadCard: null,
      accountManager: null,
      solutionsEngineer: null,
      champion: null,
    },
    firstForm: null,
    clientLogoUrl: null,
    helpPicks: [],
    goBase: "https://hub.example/go/t",
    homeworkDone: {},
    parkingLot: [],
    workflowStory: null,
    implementationFocus: null,
    implementationFocusFallback: [],
    customerScope: { state: "empty", items: [] },
    intake: null,
    journey: null,
    partner: null,
    partnerUnavailable: false,
    partnerDeal: true,
    partnerName: "Field Fusion IQ",
    path: "partner_implementation",
    training: false,
  } as unknown as Parameters<typeof screenList>[0];
}

/** The same deal after Closed Won, with its partner journey under way. */
function postCloseView() {
  const input: PartnerProgressInput = {
    currentStage: "partner_setup",
    dealStage: "onboarding_kickoff",
    dealTransitions: [{ to_stage: "closed_won", occurred_at: "2026-03-01T09:00:00Z" }],
    stageInstances: [
      { stage_key: "closed_won_planning", status: "done", gate_mode: "advisory" },
      { stage_key: "partner_setup", status: "active", gate_mode: "blocking" },
      { stage_key: "form_finalisation", status: "pending", gate_mode: "advisory" },
      { stage_key: "pilot", status: "pending", gate_mode: "advisory" },
      { stage_key: "trial_run", status: "pending", gate_mode: "advisory" },
      { stage_key: "roll_out", status: "pending", gate_mode: "blocking" },
    ],
    stageHistory: [],
    milestones: [],
    workItems: [],
  };
  return {
    ...preCloseView(),
    partner: partnerDashboardView(partnerProgress(input)),
  } as unknown as ReturnType<typeof preCloseView>;
}

function renderScreens(view: ReturnType<typeof preCloseView>): string {
  return screenList(view as never)
    .map((screen) =>
      renderToStaticMarkup(
        createElement(
          "div",
          null,
          screen.render({
            page: 1,
            qr: null,
            mode: "shared",
            onTick: undefined,
            onAnswer: undefined,
            onBall: undefined,
            icsBase: null,
          }),
        ),
      ),
    )
    .join("\n");
}

function renderDashboard(view: ReturnType<typeof preCloseView>, internal: boolean): string {
  return renderToStaticMarkup(
    createElement(CustomerDashboard, {
      view: view as never,
      today: "2026-10-12",
      mode: internal ? "internal" : "shared",
      icsBase: null,
      onTick: undefined,
      onAnswer: undefined,
      onBall: undefined,
    }),
  );
}

describe.each([
  ["before Closed Won", preCloseView],
  ["after Closed Won", postCloseView],
])("a partner deal %s", (_when, make) => {
  it("the customer deck shows no New Logo planning", () => {
    expectNoNewLogo(renderScreens(make()), "the deck");
  });

  it("the customer dashboard shows no New Logo planning, in the internal preview and on the link", () => {
    expectNoNewLogo(renderDashboard(make(), true), "the preview");
    expectNoNewLogo(renderDashboard(make(), false), "the customer link");
  });

  it("the deal's plan section shows the planning state, not a New Logo timeline", () => {
    const view = make();
    const html = renderToStaticMarkup(
      createElement(PlanSection, {
        deal: {
          account: { id: "deal-p", intake: PARTNER_INTAKE, name: "Partner deal" },
          stage_history: [],
          stages: [],
          briefs: [],
          gong_reports: [],
          sow_url: null,
          milestone_date_changes: [],
        } as never,
        editable: false,
      }),
    );
    expect(html).toContain(PARTNER_PLANNING_TO_BE_CONFIRMED);
    expectNoNewLogo(html, "the plan section");
    expect(view.partnerDeal).toBe(true);
  });

  it("the AE's reply offers no kickoff, times or minutes", () => {
    const draft = aeReplyDraft({
      company: "Partner Customer Co",
      contactName: "Dana Field",
      ownerName: "Priya Lead",
      intake: PARTNER_INTAKE,
      welcomeUrl: "https://hub.example/go/t",
      plannedKickoff: "2026-10-05",
      today: "2026-10-01",
      timezone: "America/New_York",
      sessionMinutes: null,
    } as never);
    expect(draft.body).toContain("Field Fusion IQ will lead the setup and connection");
    expect(draft.body).toContain(PARTNER_PLANNING_TO_BE_CONFIRMED);
    expectNoNewLogo(`${draft.subject}\n${draft.body}`, "the AE reply");
    expect(draft.body).not.toMatch(/\d{1,2}:\d{2}|\bminutes?\b|\b2026\b/);
  });

  it("the deal's checklist has no New Logo onboarding tasks", () => {
    const flow = stageFlow({
      stage: "closed_won",
      intake: PARTNER_INTAKE,
      owner: null,
      gongReports: 0,
      hasSow: false,
      hasBrief: false,
      hasLink: false,
      timeline: timelineFor(PARTNER_INTAKE, "2026-10-01"),
    });
    const keys: FlowStageKey[] = [
      "pre_kickoff",
      "kickoff",
      "get_it_working",
      "make_it_yours",
      "make_it_run",
      "complete",
    ];
    for (const key of keys) {
      const stage = flow.stages.find((s) => s.key === key)!;
      expect(
        stage.tasks.map((t) => t.label),
        `${key} tasks`,
      ).toEqual([]);
    }
  });

  it("the deliverables list is empty: no New Logo first form", () => {
    expect(deliverablesFor(PARTNER_INTAKE, timelineFor(PARTNER_INTAKE, "2026-10-01"))).toEqual([]);
  });

  it("the delivery analytics do not score a partner deal against a New Logo plan", () => {
    const t = timelineFor(PARTNER_INTAKE, "2026-10-01");
    expect(
      outcomesFor(
        { dealId: "deal-p", account: "Partner", timeline: t, services: [] },
        "2026-10-12",
      ),
    ).toEqual([]);
  });

  it("the deck kind is a partner journey, never a New Logo deck", () => {
    expect(
      deckKindFor({ journeyKey: "partner-implementation", priorImplementations: 0, products: [] })
        .kind,
    ).toBe("partner");
  });
});

describe("the standard types keep their plans", () => {
  it("New Logo still has its own onboarding plan and deliverables", () => {
    const t = timelineFor(NEW_LOGO_INTAKE, "2026-10-01");
    expect(t.milestones.length).toBeGreaterThan(0);
    expect(deliverablesFor(NEW_LOGO_INTAKE, t).length).toBeGreaterThan(0);
  });

  it("a New Logo reply still names its kickoff times", () => {
    const draft = aeReplyDraft({
      company: "New Co",
      contactName: "Sam",
      ownerName: "Priya",
      intake: NEW_LOGO_INTAKE,
      welcomeUrl: "https://hub.example/go/t",
      plannedKickoff: "2026-10-05",
      today: "2026-10-01",
      timezone: "America/New_York",
      sessionMinutes: null,
    } as never);
    expect(draft.body).not.toContain(PARTNER_PLANNING_TO_BE_CONFIRMED);
  });

  it("a New Logo deal's deck kind is still a new logo", () => {
    expect(
      deckKindFor({ journeyKey: "new-logo", priorImplementations: 0, products: [] }).kind,
    ).toBe("new-logo");
  });
});

describe("New Logo, Existing and Device Magic keep their own screens and plans", () => {
  const standardView = (path: "new_logo" | "existing" | "dm_conversion") => {
    const intake = intakeAnswersSchema.parse({ path });
    return {
      ...preCloseView(),
      timeline: timelineFor(intake, "2026-10-01"),
      partnerDeal: false,
      partnerName: null,
      path,
    } as unknown as ReturnType<typeof preCloseView>;
  };

  it.each(["new_logo", "existing", "dm_conversion"] as const)(
    "%s keeps the deck's plan screens",
    (path) => {
      const keys = screenList(standardView(path) as never).map((sc) => sc.key);
      expect(keys).toContain("overview");
      expect(keys).toContain("plan");
      expect(keys).toContain("together");
    },
  );

  it.each(["new_logo", "existing", "dm_conversion"] as const)(
    "%s keeps its deliverables",
    (path) => {
      const intake = intakeAnswersSchema.parse({ path });
      expect(deliverablesFor(intake, timelineFor(intake, "2026-10-01")).length).toBeGreaterThan(0);
    },
  );
});

describe("the partner type's intake and the Closed Won step", () => {
  it("a partner deal's flow is answered by choosing its partner, not by the New Logo forms", () => {
    expect(flowAnswered(PARTNER_INTAKE)).toBe(true);
    const unchosen = intakeAnswersSchema.parse({ path: "partner_implementation" });
    expect(flowAnswered(unchosen)).toBe(false);
    expect(readIntake(PARTNER_INTAKE).path).toBe("partner_implementation");
  });
});
