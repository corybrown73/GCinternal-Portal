import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import { timelineFor } from "../onboarding-plan";
import {
  customerHomeworkView,
  customerIntakeView,
  customerWelcomeView,
  type WelcomeView,
} from "../welcome";
import { customerJourney } from "../welcome-journey";

/**
 * The customer's link carries an allow-list, not the internal record minus a
 * few fields (Teya, item 8). A full internal view — every internal field set,
 * and an extra unknown key planted on every object, the way a field added to
 * WelcomeView later would arrive — goes through customerWelcomeView, and the
 * customer's payload may hold only the paths frozen below. A new path fails
 * this test until someone decides, here, that customers may see it.
 */
const PLANTED = "plantedInternalField";
const SECRET = "INTERNAL-ONLY-VALUE";

/** Keys that are data, not fields (homework key → date, text key → words). */
const RECORDS = new Set(["homeworkDone", "textOverrides", "toolMarks"]);

function paths(value: unknown, at = "", out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) paths(v, `${at}[]`, out);
    return out;
  }
  if (value === null || typeof value !== "object") return out;
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    const p = at ? `${at}.${k}` : k;
    if (RECORDS.has(p)) {
      out.add(`${p}.*`);
      continue;
    }
    out.add(p);
    paths(v, p, out);
  }
  return out;
}

/** Plant an unknown internal key on every object, at every depth. */
function plant<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => plant(v)) as T;
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = plant(v);
  out[PLANTED] = SECRET;
  return out as T;
}

function fullInternalView(): WelcomeView {
  const intake = readIntake({
    path: "new_logo",
    wanted_forms: [{ id: "f1", name: "Daily job report", template_id: null }],
    timeline: {
      overrides: { kickoff: "2026-09-17", working: "2026-09-22" },
      times: { kickoff: "10:00", working: "10:00" },
      completed: { kickoff: "2026-09-17" },
      stage_targets: {
        get_it_working: { original_date: "2026-10-01", current_date: "2026-10-03", history: [] },
      },
      services: [
        {
          id: "s1",
          kind: "integration",
          name: "QuickBooks Online",
          phase: 2,
          tier: 3,
          launch_critical: true,
          due: "2026-10-09",
          ball: { who: "us", person: "Dana", date: "2026-10-02", note: SECRET },
        },
        {
          id: "s2",
          kind: "custom_pdf",
          name: "Invoice PDF",
          phase: 2,
          ball: { who: "blocked_internal", person: null, date: null, note: SECRET },
        },
      ],
    },
  });
  const timeline = timelineFor(intake, "2026-09-14");
  const journey = customerJourney({
    stage: "make_it_yours",
    intake,
    timeline,
    homeworkDone: { app: "2026-09-20T00:00:00Z" },
    parkingLot: [{ request: "A change", target: "Week 4", status: "open", owner: "customer" }],
    leadName: "Dana",
    stageTransitions: [{ to_stage: "make_it_yours", occurred_at: "2026-10-02T12:00:00Z" }],
  });
  const view: WelcomeView = {
    dealId: `deal-${SECRET}`,
    clientName: "Aquatic Facility Services",
    industry: "Pools",
    icon: "Waves",
    timeline,
    lead: "Dana",
    fieldTester: "Sam",
    fieldTesterDue: "2026-09-25",
    fieldTesterSource: "person",
    currentProcess: SECRET,
    currentProcessSource: "ai",
    team: {
      lead: "Dana",
      leadEmail: "dana@gocanvas.com",
      leadCard: { title: "Onboarding lead", bookingUrl: "https://b", photoUrl: null, bio: "Hi" },
      accountManager: "Alex",
      solutionsEngineer: "Sol",
      champion: { name: "Chris", role: "Ops" },
      others: [{ name: "Pat", role: "Field", does: "Tests" }],
    },
    firstForm: { name: "Daily job report", objective: "Replace paper", source: "library" },
    firstFormSource: "person",
    formArtifacts: [{ name: SECRET, url: `https://signed/${SECRET}` }],
    nextUseCases: [{ name: "Inspections", objective: null }],
    purchasedSolutions: [
      {
        name: "QuickBooks Online",
        kind: "Integration",
        phase: 2,
        tool: "QuickBooks",
        acceptance: "Approved submissions reach the accounting system.",
      },
    ],
    photoUrl: "https://photo",
    toolMarks: { quickbooks: "https://mark" },
    clientLogoUrl: "https://logo",
    homeworkDone: { app: "2026-09-20T00:00:00Z" },
    readiness: [{ key: "photo", label: SECRET, hint: SECRET }],
    aiReading: "done",
    reviewed: true,
    shareUrl: `https://hub/welcome/gcwl_${SECRET}`,
    qrDataUrl: `data:image/png;base64,${SECRET}`,
    sharedAt: "2026-09-15T00:00:00Z",
    openedAt: "2026-09-16T00:00:00Z",
    hiddenScreens: ["overview"],
    textOverrides: { "cover.title": "Welcome" },
    path: "new_logo",
    helpPicks: [
      { article_id: "a1", title: "Get the app", url: "https://help", why: "Start", when: null },
    ],
    helpOpened: { a1: SECRET },
    goBase: "https://hub/go/token",
    intake: {
      known: [{ key: "k", ask: "Q", value: ["A", "B"], confirmed: true }],
      needed: [{ key: "n", ask: "Q2", hint: "H", kind: "text" as never }],
    },
    journey,
    partner: {
      currentLabel: "Pilot",
      stages: [
        {
          key: "pilot" as never,
          label: "Pilot",
          state: "now",
          targetDate: null,
          completedDate: null,
        },
      ],
      actions: [{ id: "w1", title: "Send list", blocked: false }],
      blockers: [{ id: "w2", title: "Access" }],
      nextMilestone: { name: "Review", date: "2026-10-20" },
      graduationTarget: "2026-11-30",
    },
    partnerUnavailable: false,
    partnerDeal: false,
    partnerName: null,
    parkingLot: [
      {
        request: "A change",
        target: "Week 4",
        status: "open",
        neededForLaunch: true,
        owner: "customer",
      },
    ],
    workflowStory: {
      before: "Paper",
      during: "App",
      after: "PDF",
      validatedAt: null,
      validatedBy: SECRET,
    },
    implementationFocus: {
      items: [
        {
          id: "i1",
          text: SECRET,
          status: "proposed",
          sources: [{ type: "gong", label: SECRET, quote: SECRET }],
          reviewFlag: "gong_only",
        },
      ],
      validatedAt: null,
      validatedBy: SECRET,
      aiFilled: true,
    },
    implementationFocusFallback: [
      { id: "i2", text: SECRET, status: "proposed", sources: [], reviewFlag: null },
    ],
    customerScope: { state: "agreed", items: ["One form"] },
  };
  // Records are data keyed by the customer's own keys, not fields: they are
  // checked below for their values, and only homework keys pass for homework.
  return {
    ...plant(view),
    homeworkDone: { ...view.homeworkDone, notAHomeworkKey: SECRET },
    textOverrides: view.textOverrides,
    toolMarks: view.toolMarks ?? {},
  };
}

describe("the customer's copy is an allow-list", () => {
  it("every field set internally: only allowed paths reach the customer", () => {
    const customer = customerWelcomeView(fullInternalView());
    const got = [...paths(customer)].sort();
    const outside = got.filter((p) => !ALLOWED.has(p));
    expect(outside).toEqual([]);
  });

  it("carries no internal value: planted keys, notes, the link, review state", () => {
    const customer = customerWelcomeView(fullInternalView());
    const text = JSON.stringify(customer);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(PLANTED);
    expect(customer).toMatchObject({
      dealId: "",
      aiReading: null,
      reviewed: null,
      shareUrl: null,
      qrDataUrl: null,
      sharedAt: null,
      openedAt: null,
      readiness: [],
      formArtifacts: [],
      helpOpened: {},
      implementationFocus: null,
      implementationFocusFallback: [],
      currentProcess: null,
      workflowStory: null,
    });
    // The plan's record of hand-moved dates is ours.
    expect(customer.timeline.milestones.every((m) => !m.moved && !m.shifted)).toBe(true);
    expect(customer.timeline.milestones.every((m) => m.plannedDate === m.date)).toBe(true);
    // A blocker on our side is internal; one on the customer's stays.
    expect(customer.journey?.solutions.every((s) => s.note === null)).toBe(true);
    expect(customer.journey?.solutions.some((s) => s.blocked === "internal")).toBe(false);
  });

  it("keeps what the customer's page renders", () => {
    const customer = customerWelcomeView(fullInternalView());
    expect(customer.clientName).toBe("Aquatic Facility Services");
    expect(customer.timeline.milestones.length).toBeGreaterThan(0);
    expect(customer.timeline.phases.length).toBeGreaterThan(0);
    expect(customer.journey?.stages.length).toBeGreaterThan(0);
    expect(customer.intake?.known[0]?.value).toEqual(["A", "B"]);
    expect(customer.team.others?.[0]?.name).toBe("Pat");
    expect(customer.parkingLot?.[0]?.request).toBe("A change");
    expect(customer.homeworkDone).toEqual({ app: "2026-09-20T00:00:00Z" });
    expect(customer.customerScope).toEqual({ state: "agreed", items: ["One form"] });
    expect(customer.purchasedSolutions).toEqual([
      {
        name: "QuickBooks Online",
        kind: "Integration",
        phase: 2,
        tool: "QuickBooks",
        acceptance: "Approved submissions reach the accounting system.",
      },
    ]);
    expect(customer.fieldTester).toBe("Sam");
  });

  it("a workflow story a person validated is kept, without who validated it", () => {
    const internal = fullInternalView();
    internal.workflowStory = {
      before: "Paper",
      during: "App",
      after: "PDF",
      validatedAt: "2026-09-20T00:00:00Z",
      validatedBy: SECRET,
    };
    const customer = customerWelcomeView(internal);
    expect(customer.workflowStory).toEqual({
      before: "Paper",
      during: "App",
      after: "PDF",
      validatedAt: "2026-09-20T00:00:00Z",
      validatedBy: null,
    });
  });
});

/** Frozen: every path the customer's copy may carry. */
const ALLOWED = new Set<string>([
  "aiReading",
  "clientLogoUrl",
  "clientName",
  "currentProcess",
  "currentProcessSource",
  "customerScope",
  "customerScope.items",
  "customerScope.state",
  "dealId",
  "fieldTester",
  "fieldTesterDue",
  "fieldTesterSource",
  "firstForm",
  "firstForm.name",
  "firstForm.objective",
  "firstForm.source",
  "firstFormSource",
  "formArtifacts",
  "goBase",
  "helpOpened",
  "helpPicks",
  "helpPicks[].article_id",
  "helpPicks[].title",
  "helpPicks[].url",
  "helpPicks[].when",
  "helpPicks[].why",
  "hiddenScreens",
  "homeworkDone.*",
  "icon",
  "implementationFocus",
  "implementationFocusFallback",
  "industry",
  "intake",
  "intake.known",
  "intake.known[].ask",
  "intake.known[].confirmed",
  "intake.known[].key",
  "intake.known[].value",
  "intake.needed",
  "intake.needed[].ask",
  "intake.needed[].hint",
  "intake.needed[].key",
  "intake.needed[].kind",
  "journey",
  "journey.current",
  "journey.current.blurb",
  "journey.current.key",
  "journey.current.label",
  "journey.current.state",
  "journey.current.target",
  "journey.current.target.actualDate",
  "journey.current.target.currentDate",
  "journey.current.target.originalDate",
  "journey.headline",
  "journey.solutions",
  "journey.solutions[].ballDate",
  "journey.solutions[].blocked",
  "journey.solutions[].canConfirm",
  "journey.solutions[].dueDate",
  "journey.solutions[].id",
  "journey.solutions[].kind",
  "journey.solutions[].name",
  "journey.solutions[].note",
  "journey.solutions[].responsiblePerson",
  "journey.solutions[].status",
  "journey.solutions[].statusKey",
  "journey.solutions[].when",
  "journey.solutions[].who",
  "journey.stages",
  "journey.stages[].blurb",
  "journey.stages[].key",
  "journey.stages[].label",
  "journey.stages[].state",
  "journey.stages[].target",
  "journey.stages[].target.actualDate",
  "journey.stages[].target.currentDate",
  "journey.stages[].target.originalDate",
  "journey.yours",
  "journey.yours[].by",
  "journey.yours[].kind",
  "journey.yours[].ownerName",
  "journey.yours[].ownerSide",
  "journey.yours[].what",
  "lead",
  "nextUseCases",
  "nextUseCases[].name",
  "nextUseCases[].objective",
  "openedAt",
  "purchasedSolutions",
  "purchasedSolutions[].acceptance",
  "purchasedSolutions[].kind",
  "purchasedSolutions[].name",
  "purchasedSolutions[].phase",
  "purchasedSolutions[].tool",
  "parkingLot",
  "parkingLot[].neededForLaunch",
  "parkingLot[].owner",
  "parkingLot[].request",
  "parkingLot[].status",
  "parkingLot[].target",
  "partner",
  "partner.actions",
  "partner.actions[].blocked",
  "partner.actions[].id",
  "partner.actions[].title",
  "partner.blockers",
  "partner.blockers[].id",
  "partner.blockers[].title",
  "partner.currentLabel",
  "partner.graduationTarget",
  "partner.nextMilestone",
  "partner.nextMilestone.date",
  "partner.nextMilestone.name",
  "partner.stages",
  "partner.stages[].completedDate",
  "partner.stages[].key",
  "partner.stages[].label",
  "partner.stages[].state",
  "partner.stages[].targetDate",
  "partnerDeal",
  "partnerName",
  "partnerUnavailable",
  "path",
  "photoUrl",
  "qrDataUrl",
  "readiness",
  "reviewed",
  "shareUrl",
  "sharedAt",
  "team",
  "team.accountManager",
  "team.champion",
  "team.champion.name",
  "team.champion.role",
  "team.lead",
  "team.leadCard",
  "team.leadCard.bio",
  "team.leadCard.bookingUrl",
  "team.leadCard.photoUrl",
  "team.leadCard.title",
  "team.leadEmail",
  "team.others",
  "team.others[].does",
  "team.others[].name",
  "team.others[].role",
  "team.solutionsEngineer",
  "textOverrides.*",
  "timeline",
  "timeline.allDone",
  "timeline.alongside",
  "timeline.closeDate",
  "timeline.currentPhase",
  "timeline.edited",
  "timeline.existingBuild",
  "timeline.holidays",
  "timeline.integration",
  "timeline.integration.endsOn",
  "timeline.integration.milestones",
  "timeline.integration.milestones[].date",
  "timeline.integration.milestones[].day",
  "timeline.integration.milestones[].detail",
  "timeline.integration.milestones[].doneOn",
  "timeline.integration.milestones[].icon",
  "timeline.integration.milestones[].key",
  "timeline.integration.milestones[].kind",
  "timeline.integration.milestones[].label",
  "timeline.integration.milestones[].minutes",
  "timeline.integration.milestones[].moved",
  "timeline.integration.milestones[].owner",
  "timeline.integration.milestones[].phase",
  "timeline.integration.milestones[].plannedDate",
  "timeline.integration.milestones[].serviceId",
  "timeline.integration.milestones[].shifted",
  "timeline.integration.milestones[].time",
  "timeline.integration.name",
  "timeline.integration.provenOn",
  "timeline.integration.startsOn",
  "timeline.integration.summary",
  "timeline.integration.target",
  "timeline.integration.tentative",
  "timeline.integration.tier",
  "timeline.integration.weeks",
  "timeline.liveDate",
  "timeline.liveDoneOn",
  "timeline.milestones",
  "timeline.milestones[].date",
  "timeline.milestones[].day",
  "timeline.milestones[].detail",
  "timeline.milestones[].doneOn",
  "timeline.milestones[].homework",
  "timeline.milestones[].icon",
  "timeline.milestones[].key",
  "timeline.milestones[].kind",
  "timeline.milestones[].label",
  "timeline.milestones[].minutes",
  "timeline.milestones[].moved",
  "timeline.milestones[].owner",
  "timeline.milestones[].phase",
  "timeline.milestones[].plannedDate",
  "timeline.milestones[].shifted",
  "timeline.milestones[].throughDay",
  "timeline.milestones[].time",
  "timeline.path",
  "timeline.phases",
  "timeline.phases[].done",
  "timeline.phases[].endsOn",
  "timeline.phases[].gate",
  "timeline.phases[].label",
  "timeline.phases[].phase",
  "timeline.phases[].services",
  "timeline.phases[].services[].doneOn",
  "timeline.phases[].services[].endsOn",
  "timeline.phases[].services[].icon",
  "timeline.phases[].services[].id",
  "timeline.phases[].services[].kind",
  "timeline.phases[].services[].label",
  "timeline.phases[].services[].milestones",
  "timeline.phases[].services[].milestones[].date",
  "timeline.phases[].services[].milestones[].day",
  "timeline.phases[].services[].milestones[].detail",
  "timeline.phases[].services[].milestones[].doneOn",
  "timeline.phases[].services[].milestones[].icon",
  "timeline.phases[].services[].milestones[].key",
  "timeline.phases[].services[].milestones[].kind",
  "timeline.phases[].services[].milestones[].label",
  "timeline.phases[].services[].milestones[].minutes",
  "timeline.phases[].services[].milestones[].moved",
  "timeline.phases[].services[].milestones[].owner",
  "timeline.phases[].services[].milestones[].phase",
  "timeline.phases[].services[].milestones[].plannedDate",
  "timeline.phases[].services[].milestones[].serviceId",
  "timeline.phases[].services[].milestones[].shifted",
  "timeline.phases[].services[].milestones[].time",
  "timeline.phases[].services[].name",
  "timeline.phases[].services[].needs",
  "timeline.phases[].services[].phase",
  "timeline.phases[].services[].startsOn",
  "timeline.phases[].services[].tier",
  "timeline.phases[].services[].weeks",
  "timeline.phases[].startsOn",
  "timeline.phases[].tentative",
  "timeline.progress",
  "timeline.progress.done",
  "timeline.progress.total",
  "timeline.servicesOnly",
  "timeline.timezone",
  "timeline.training",
  "toolMarks.*",
  "workflowStory",
]);

describe("the link's own writes answer through the same allow-list", () => {
  it("answering a question sends back only the intake's allowed paths", () => {
    const prompt = plant({
      known: [{ key: "industry", ask: "Industry?", value: "Farming", confirmed: true }],
      needed: [{ key: "devices", ask: "Devices?", hint: "Phones", kind: "text" }],
    }) as any;
    const out = customerIntakeView(prompt);
    expect(JSON.stringify(out)).not.toContain(SECRET);
    expect([...paths(out)].sort()).toEqual(
      [
        "known",
        "known[].ask",
        "known[].confirmed",
        "known[].key",
        "known[].value",
        "needed",
        "needed[].ask",
        "needed[].hint",
        "needed[].key",
        "needed[].kind",
      ].sort(),
    );
  });

  it("ticking homework sends back only the homework keys the page ticks", () => {
    const out = customerHomeworkView({
      app: "2026-10-16T00:00:00Z",
      [PLANTED]: SECRET,
      reviewed_by: "someone@gocanvas.com",
    });
    expect(out).toEqual({ app: "2026-10-16T00:00:00Z" });
  });
});
