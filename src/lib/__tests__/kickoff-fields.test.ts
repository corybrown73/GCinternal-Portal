import { describe, expect, it } from "vitest";

import {
  buildKickoffData,
  monthYear,
  shortDate,
  splitGoal,
  TEMPLATE_FIELDS,
  type KickoffInput,
} from "../kickoff-fields";
import type { BriefJson } from "../server/schemas";

const emptyBrief: BriefJson = {
  account_name: "Northwind Fleet",
  one_liner: "",
  current_process: [],
  goals: [],
  what_we_know: [],
  stakeholders: [],
  risks_open_items: [],
  discovery_questions: [],
  process_gaps: [],
  kickoff: {
    day_90_definition: null,
    scope: [],
    out_of_scope: null,
    integrations: [],
    roles: [],
    licensed_seats: null,
    renewal_date: null,
    it_contact: null,
    training: [],
    kpi_qualifiers: [],
    next_meeting: null,
  },
  expansion: {
    integration_target: null,
    form_already_built: null,
    historical_data: null,
    current_process: null,
    time_saved: null,
    data_flows: [],
    environment_notes: [],
    blockers: [],
  },
};

function input(over: Partial<KickoffInput> = {}): KickoffInput {
  return {
    clientName: "Northwind Fleet",
    preparedAt: "2026-05-04T09:00:00.000Z",
    brief: emptyBrief,
    team: [],
    clientPeople: [],
    stages: [],
    customerTasks: [],
    risks: [],
    successCriteria: [],
    requirements: [],
    solutions: [],
    targetLaunchDate: null,
    itContact: null,
    ...over,
  };
}

describe("buildKickoffData", () => {
  it("never leaves the template's example copy standing", () => {
    // The whole reason `missing` exists. A deck that says "Acme Construction"
    // to a customer who is not Acme is this feature's worst failure.
    const { fields } = buildKickoffData(input());
    const values = Object.values(fields).join(" ");
    expect(values).not.toMatch(/Acme|Jordan Park|Maria Rivera|Priya Nair/);
  });

  it("reports every field it could not fill, in template order", () => {
    const { missing } = buildKickoffData(input());
    expect(missing).toContain("raci_1_owner");
    expect(missing).toContain("licensed_seats");
    // Filled from the account itself, so never missing.
    expect(missing).not.toContain("client_name");
    expect(missing).not.toContain("deck_eyebrow");
    expect(missing.indexOf("goal_1")).toBeLessThan(missing.indexOf("action_1"));
  });

  it("only ever emits keys the template actually defines", () => {
    const rich = buildKickoffData(
      input({
        brief: { ...emptyBrief, goals: ["a. b", "c", "d", "e", "f"] },
        team: [
          { name: "Dana", role: "Lead" },
          { name: "Priya", role: "SC" },
          { name: "Tom", role: "CSM" },
        ],
        clientPeople: [{ name: "Rachel", role: "Ops" }],
        risks: [{ title: "r", mitigation: "m" }],
        successCriteria: [{ description: "d", target: "10" }],
        requirements: [{ title: "req", inScope: true }],
        solutions: ["sol"],
        customerTasks: [{ title: "t", stage: "Build", owner: null, due: "2026-06-01" }],
        targetLaunchDate: "2026-07-01",
        itContact: { name: "Tom W", role: "IT Manager" },
      }),
    );
    const known = new Set(TEMPLATE_FIELDS);
    for (const key of Object.keys(rich.fields)) {
      expect(known.has(key), `${key} is not a template field`).toBe(true);
    }
  });

  it("takes only the first four goals and splits each into headline and detail", () => {
    const { fields } = buildKickoffData(
      input({
        brief: {
          ...emptyBrief,
          goals: [
            "Stop double entry. Crews rekey 310 orders a week today.",
            "Photo evidence on every failed line.",
            "Three",
            "Four",
            "Five — dropped, the slide has four rows",
          ],
        },
      }),
    );
    expect(fields["goal_1"]).toBe("Stop double entry.");
    expect(fields["goal_1_detail"]).toBe("Crews rekey 310 orders a week today.");
    expect(fields["goal_2_detail"]).toBeUndefined();
    expect(fields["goal_4"]).toBe("Four");
    expect(Object.keys(fields)).not.toContain("goal_5");
  });

  it("puts the recorded target on the KPI card and never computes one", () => {
    const { fields, missing } = buildKickoffData(
      input({
        successCriteria: [
          { description: "Work orders rekeyed per week", target: "0" },
          { description: "Inspections in-shift", target: null },
        ],
        targetLaunchDate: "2026-07-01",
      }),
    );
    expect(fields["kpi_1_value"]).toBe("0");
    // The metric is the criterion; the template's fixed "Users live" would
    // contradict it. See the regression block below.
    expect(fields["kpi_1_metric"]).toBe("Work orders rekeyed per week");
    // A criterion with no target leaves the number blank rather than inventing.
    expect(missing).toContain("kpi_2_value");
    expect(fields["kpi_2_metric"]).toBe("Inspections in-shift");
    // The fourth card is go-live, and the close repeats it.
    expect(fields["kpi_4_value"]).toBe("Jul 1");
    expect(fields["kpi_4_value_repeat"]).toBe("Jul 1");
  });

  it("separates what is in phase one from what was ruled out", () => {
    const { fields } = buildKickoffData(
      input({
        requirements: [
          { title: "Daily inspection", inScope: true },
          { title: "Work order closeout", inScope: true },
          { title: "Timesheets", inScope: false },
          { title: "Subcontractor onboarding", inScope: false },
        ],
      }),
    );
    expect(fields["scope_1_workflow"]).toBe("Daily inspection");
    expect(fields["scope_2_workflow"]).toBe("Work order closeout");
    expect(fields["out_of_scope"]).toBe("Timesheets, Subcontractor onboarding");
  });

  it("dates the timeline from the plan when it has dates, and by week when it does not", () => {
    const stages = [
      { name: "Discovery", intent: "Walkthrough", targetDays: 14, startsOn: null },
      { name: "Build", intent: "Configure", targetDays: 21, startsOn: null },
      { name: "Pilot", intent: "One crew", targetDays: 14, startsOn: null },
    ];
    const byWeek = buildKickoffData(input({ stages })).fields;
    expect(byWeek["phase_1_date"]).toBe("Week 1");
    expect(byWeek["phase_2_date"]).toBe("Week 3");
    expect(byWeek["phase_3_date"]).toBe("Week 6");

    const dated = buildKickoffData(
      input({ stages: [{ ...stages[0]!, startsOn: "2026-05-06T00:00:00Z" }] }),
    ).fields;
    expect(dated["phase_1_date"]).toBe("May 6");
  });

  it("drops the integrations slide when there is nothing to connect and no IT contact", () => {
    expect(buildKickoffData(input()).optionalSlides.integrations).toBe(false);
    expect(buildKickoffData(input({ solutions: ["Sage sync"] })).optionalSlides.integrations).toBe(
      true,
    );
    expect(
      buildKickoffData(input({ itContact: { name: "Tom", role: "IT" } })).optionalSlides
        .integrations,
    ).toBe(true);
  });

  it("drops the risks slide when nothing is recorded, rather than showing an empty one", () => {
    expect(buildKickoffData(input()).optionalSlides.risks).toBe(false);
    expect(
      buildKickoffData(input({ risks: [{ title: "Devices not ordered", mitigation: null }] }))
        .optionalSlides.risks,
    ).toBe(true);
  });

  it("names the customer as the action owner, never a person nobody assigned", () => {
    const { fields } = buildKickoffData(
      input({
        customerTasks: [
          { title: "Send paper samples", stage: "Discovery", owner: null, due: "2026-05-08" },
        ],
      }),
    );
    expect(fields["action_1"]).toBe("Send paper samples");
    expect(fields["action_1_owner"]).toBe("Northwind Fleet");
    expect(fields["action_1_due"]).toBe("May 8");
    expect(fields["action_1_why"]).toBe("Needed for Discovery");
  });

  it("builds the support tiers from the team, and leaves them blank without one", () => {
    const withTeam = buildKickoffData(
      input({
        team: [
          { name: "Dana Okafor", role: "Lead" },
          { name: "Priya", role: "SC" },
          { name: "Tom Braddock", role: "CSM" },
        ],
      }),
    ).fields;
    expect(withTeam["support_tier_2"]).toContain("Dana Okafor");
    expect(withTeam["support_tier_3"]).toContain("Tom Braddock");
    // Tier one is GoCanvas's own address; it is true regardless of staffing.
    expect(buildKickoffData(input()).fields["support_tier_1"]).toContain("support@gocanvas.com");
    expect(buildKickoffData(input()).missing).toContain("support_tier_2");
  });
});

describe("date helpers", () => {
  it("formats a date the way the template does", () => {
    expect(shortDate("2026-07-01")).toBe("Jul 1");
    expect(shortDate("2026-05-06T00:00:00Z")).toBe("May 6");
    expect(shortDate(null)).toBeNull();
    expect(shortDate("not a date")).toBeNull();
  });

  it("writes the eyebrow's month and year", () => {
    expect(monthYear("2026-05-04T09:00:00Z")).toBe("May 2026");
  });
});

describe("splitGoal", () => {
  it("leads with the first sentence and explains with the rest", () => {
    expect(splitGoal("Cut incidents 25%. Daily inspections, same day.")).toEqual({
      headline: "Cut incidents 25%.",
      detail: "Daily inspections, same day.",
    });
  });

  it("leaves the detail empty rather than repeating a single sentence", () => {
    expect(splitGoal("One source of truth for job data")).toEqual({
      headline: "One source of truth for job data",
      detail: null,
    });
  });

  it("does not split on a trailing full stop", () => {
    expect(splitGoal("Retire four paper processes.").detail).toBeNull();
  });
});

describe("regressions found by rendering the deck", () => {
  it("puts the criterion on the KPI card, not the template's example metric", () => {
    // Rendered, the card read "USERS LIVE / 0 / work orders rekeyed per week"
    // — a fixed label contradicting its own caption.
    const { fields } = buildKickoffData(
      input({ successCriteria: [{ description: "work orders rekeyed per week", target: "0" }] }),
    );
    expect(fields["kpi_1_metric"]).toBe("work orders rekeyed per week");
    expect(fields["kpi_1_value"]).toBe("0");
  });

  it("only flags fields that actually show blank on a slide", () => {
    // `missing` is the presenter's to-do list. The IT questions are fixed copy
    // and the qualifier and goal-detail lines are simply not drawn when empty,
    // so flagging them sent the AE to fill something already filled.
    const { missing } = buildKickoffData(input());
    expect(missing).not.toContain("kpi_1_label");
    expect(missing).not.toContain("goal_1_detail");
    expect(missing).not.toContain("it_req_1");
    expect(missing).toContain("day_90_definition");
    expect(missing).toContain("raci_1_owner");
  });

  it("formats the date on the first ask, rather than printing an ISO string", () => {
    // It rendered as "…from Sage by 2026-05-08" on a customer-facing slide.
    const { fields } = buildKickoffData(
      input({
        customerTasks: [
          { title: "Send three export files", stage: "Discovery", owner: null, due: "2026-05-08" },
        ],
      }),
    );
    expect(fields["need_from_client"]).toBe("Send three export files by May 8");
  });
});

describe("filling the deck from the call notes", () => {
  const calls = (over: Partial<BriefJson["kickoff"]> = {}): BriefJson["kickoff"] => ({
    ...emptyBrief.kickoff,
    ...over,
  });

  it("reads what a workflow replaces and who uses it — things no record holds", () => {
    const { fields, fromCalls } = buildKickoffData(
      input({
        requirements: [{ title: "Daily Safety Inspection", inScope: true }],
        brief: {
          ...emptyBrief,
          kickoff: calls({
            scope: [
              {
                workflow: "Daily Safety Inspection",
                replaces: "Carbon-copy pad",
                teams: "All crews · 240",
              },
            ],
          }),
        },
      }),
    );
    expect(fields["scope_1_replaces"]).toBe("Carbon-copy pad");
    expect(fields["scope_1_teams"]).toBe("All crews · 240");
    // The workflow itself came from the record, so it is not flagged.
    expect(fromCalls).not.toContain("scope_1_workflow");
    expect(fromCalls).toContain("scope_1_replaces");
  });

  it("lets a recorded requirement beat the same one heard on a call", () => {
    const { fields, fromCalls } = buildKickoffData(
      input({
        requirements: [{ title: "Daily Safety Inspection", inScope: true }],
        brief: {
          ...emptyBrief,
          kickoff: calls({
            scope: [{ workflow: "Daily safety checks", replaces: null, teams: null }],
          }),
        },
      }),
    );
    expect(fields["scope_1_workflow"]).toBe("Daily Safety Inspection");
    expect(fromCalls).not.toContain("scope_1_workflow");
  });

  it("fills a workflow from the calls when no requirement was recorded", () => {
    const { fields, fromCalls } = buildKickoffData(
      input({
        brief: {
          ...emptyBrief,
          kickoff: calls({
            scope: [{ workflow: "Work Order Closeout", replaces: "Excel", teams: null }],
          }),
        },
      }),
    );
    expect(fields["scope_1_workflow"]).toBe("Work Order Closeout");
    expect(fromCalls).toContain("scope_1_workflow");
  });

  it("matches a RACI owner to its own row and no other", () => {
    const { fields } = buildKickoffData(
      input({
        brief: {
          ...emptyBrief,
          kickoff: calls({
            roles: [
              { responsibility: "Devices in the field", owner: "Northwind · IT", support: null },
              {
                responsibility: "Form and workflow build",
                owner: "GoCanvas · Cory Brown",
                support: "Tom Whitfield",
              },
            ],
          }),
        },
      }),
    );
    expect(fields["raci_1_owner"]).toBe("GoCanvas · Cory Brown");
    expect(fields["raci_1_support"]).toBe("Tom Whitfield");
    expect(fields["raci_3_owner"]).toBe("Northwind · IT");
    // Nothing was said about accounts, so that row stays for the meeting.
    expect(fields["raci_2_owner"]).toBeUndefined();
  });

  it("ignores a responsibility the slide does not have a row for", () => {
    const { fields } = buildKickoffData(
      input({
        brief: {
          ...emptyBrief,
          kickoff: calls({
            roles: [{ responsibility: "Catering", owner: "Somebody", support: null }],
          }),
        },
      }),
    );
    expect(Object.keys(fields).filter((key) => key.startsWith("raci_"))).toHaveLength(0);
  });

  it("takes the seat count, renewal and day-90 line straight from what was said", () => {
    const { fields, missing, fromCalls } = buildKickoffData(
      input({
        brief: {
          ...emptyBrief,
          kickoff: calls({
            licensed_seats: "310 on the Business plan",
            renewal_date: "April 30, 2027",
            day_90_definition:
              "Every crew files their daily inspection from the app before leaving site.",
            next_meeting: "Discovery · May 6",
          }),
        },
      }),
    );
    expect(fields["licensed_seats"]).toBe("310 on the Business plan");
    expect(missing).not.toContain("licensed_seats");
    expect(missing).not.toContain("day_90_definition");
    expect(fromCalls).toContain("renewal_date");
    expect(fromCalls).toContain("next_meeting");
  });

  it("still reports a field the calls did not answer either", () => {
    const { missing, fromCalls } = buildKickoffData(input());
    expect(missing).toContain("licensed_seats");
    expect(fromCalls).toHaveLength(0);
  });

  it("lists what came from the calls in the deck's own field order", () => {
    const { fromCalls } = buildKickoffData(
      input({
        brief: {
          ...emptyBrief,
          kickoff: calls({
            next_meeting: "Discovery · May 6",
            day_90_definition: "Crews file from the app.",
            integrations: ["QuickBooks · invoice from closed work orders"],
          }),
        },
      }),
    );
    expect(fromCalls).toEqual(["day_90_definition", "integration_1", "next_meeting"]);
  });
});
