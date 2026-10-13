import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CustomerDashboard } from "@/components/customer-dashboard";
import { shortDay } from "@/lib/onboarding-timeline";
import type { WelcomeView } from "@/lib/welcome";

/**
 * The dashboard, rendered to HTML the way a customer's browser receives it. The
 * internal preview passes no write handlers; the customer's link passes them.
 * These tests read the markup, so they check what is on the page and whether
 * each control is live.
 */

function viewWith(overrides: Record<string, unknown> = {}): WelcomeView {
  return {
    dealId: "deal-1",
    clientName: "Aquatic Facility Services",
    industry: "Pools",
    icon: "Waves",
    timeline: {
      closeDate: "2026-10-01",
      path: "new_logo",
      milestones: [
        {
          key: "kickoff",
          kind: "call",
          label: "Kickoff call",
          date: "2026-10-05",
          time: "09:00",
          doneOn: "2026-10-05",
          homework: ["Run one job"],
          detail: "",
        },
        {
          key: "homework",
          kind: "homework",
          label: "Homework",
          date: "2026-10-12",
          time: null,
          doneOn: null,
          detail: "",
        },
        {
          key: "adjust",
          kind: "call",
          label: "Working session 2",
          date: "2026-10-20",
          time: "14:00",
          doneOn: null,
          detail: "Review the form together.",
          homework: ["Test on one job"],
        },
      ],
      liveDate: "2026-10-26",
      timezone: "America/New_York",
      training: false,
      servicesOnly: false,
      holidays: [],
    },
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
    firstForm: { name: "Pool Service Ticket", objective: null, source: "library" },
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
    ...overrides,
  } as unknown as WelcomeView;
}

const noop = () => {};

function html(view: WelcomeView, options: { internal?: boolean; handlers?: boolean } = {}): string {
  const internal = options.internal ?? false;
  const handlers = options.handlers ?? !internal;
  return renderToStaticMarkup(
    createElement(CustomerDashboard, {
      view,
      today: "2026-10-12",
      mode: internal ? "internal" : "shared",
      icsBase: internal ? null : "/api/welcome-ics/t",
      onTick: handlers ? noop : undefined,
      onAnswer: handlers ? noop : undefined,
      onBall: handlers ? noop : undefined,
    }),
  );
}

/** Every <input> and <button> in the markup, with whether it is disabled. */
function controls(markup: string): Array<{ tag: string; disabled: boolean }> {
  return [...markup.matchAll(/<(input|button)\b([^>]*)>/g)].map((m) => ({
    tag: m[1]!,
    disabled: /\bdisabled=""|\bdisabled\b/.test(m[2]!),
  }));
}

describe("internal preview — the same dashboard, and nothing on it can act", () => {
  it("every customer control is shown disabled in the internal preview", () => {
    const journeyView = viewWith({
      parkingLot: [
        {
          request: "Add a photo",
          target: "",
          status: "open",
          neededForLaunch: true,
          owner: "customer",
        },
      ],
      journey: {
        current: { key: "kickoff", label: "Kickoff" },
        stages: [],
        headline: "",
        yours: [],
        solutions: [
          {
            id: "s1",
            name: "Custom PDF",
            who: "you",
            status: "Your turn to test it",
            when: null,
            responsiblePerson: null,
            canConfirm: true,
            note: null,
            blocked: null,
            ballDate: null,
            dueDate: null,
            kind: "PDF",
          },
        ],
      },
    });
    const markup = html(journeyView, { internal: true });
    const all = controls(markup);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((c) => c.disabled)).toBe(true);
    expect(markup).toContain("Internal preview");
  });

  it("the customer's own link leaves the homework ticks live", () => {
    const markup = html(viewWith(), { handlers: true });
    const boxes = controls(markup).filter((c) => c.tag === "input");
    expect(boxes.length).toBe(3);
    expect(boxes.every((c) => !c.disabled)).toBe(true);
  });
});

describe("the dashboard's opening overview", () => {
  it("shows the stage, the progress, the next milestone and the agreed Graduation target", () => {
    const markup = html(
      viewWith({
        journey: {
          current: { key: "get_it_working", label: "Get it working" },
          headline: "",
          yours: [],
          solutions: [],
          stages: [
            { key: "pre_kickoff", label: "Intake & Process", state: "done", blurb: "" },
            { key: "kickoff", label: "Kickoff", state: "done", blurb: "" },
            {
              key: "get_it_working",
              label: "Get it working",
              state: "now",
              blurb: "",
              target: { originalDate: "2026-10-23", currentDate: "2026-10-23", actualDate: null },
            },
            { key: "make_it_yours", label: "Make it yours", state: "later", blurb: "" },
            { key: "make_it_run", label: "Make it run", state: "later", blurb: "" },
            {
              key: "complete",
              label: "Graduate",
              state: "later",
              blurb: "",
              target: { originalDate: "2026-12-04", currentDate: "2026-12-04", actualDate: null },
            },
          ],
        },
      }),
    );
    expect(markup).toContain("Get it working");
    expect(markup.match(/aria-current="step"/g)?.length).toBe(1);
    expect(markup).toContain("Done");
    expect(markup).toContain("Upcoming");
    expect(markup).toContain(shortDay("2026-12-04"));
    expect(markup).toContain("Working session 2");
    // No artificial percentage, and no "Day X of 15" counter.
    expect(markup).not.toMatch(/\d+\s?%/);
    expect(markup).not.toMatch(/Day \d+ of/);
  });

  it("says the Graduation target is to be confirmed when none is agreed", () => {
    const markup = html(viewWith());
    expect(markup).toContain("Target date to be confirmed.");
  });

  it("says the implementation has not started before the account is set up", () => {
    expect(html(viewWith())).toContain("Your implementation starts once your account is set up.");
  });

  it("shows the full journey behind a disclosure, not on the first screen", () => {
    const markup = html(
      viewWith({
        journey: {
          current: { key: "kickoff", label: "Kickoff" },
          headline: "",
          yours: [],
          solutions: [],
          stages: [{ key: "kickoff", label: "Kickoff", state: "now", blurb: "" }],
        },
      }),
    );
    expect(markup).toContain("View full journey");
    expect(markup).toMatch(/<details class="gc-dash-journey">/);
  });
});

describe("what needs your attention, what GoCanvas is working on, and the next session", () => {
  it("shows the plan's homework copy with the plan date, not as an owner-set due date", () => {
    const markup = html(viewWith());
    expect(markup).toContain("Run one job");
    expect(markup).toContain(`Plan date ${shortDay("2026-10-12")}`);
  });

  it("says nothing waits on the customer when there is nothing to do", () => {
    const markup = html(
      viewWith({
        homeworkDone: { app: "x", user: "y", list: "z" },
        timeline: { ...viewWith().timeline, milestones: [] },
      }),
    );
    expect(markup).toContain("Nothing is waiting on you right now.");
  });

  it("shows the next booked session with its purpose and what to prepare", () => {
    const markup = html(viewWith());
    expect(markup).toContain(`${shortDay("2026-10-20")} at 14:00 America/New_York`);
    expect(markup).toContain("Review the form together.");
    expect(markup).toContain("Test on one job");
  });

  it("shows 'to be scheduled' when no session is booked", () => {
    const markup = html(
      viewWith({
        timeline: {
          ...viewWith().timeline,
          milestones: [
            {
              key: "adjust",
              kind: "call",
              label: "Working session 2",
              date: "2026-10-20",
              time: null,
              doneOn: null,
              detail: "",
            },
          ],
        },
      }),
    );
    expect(markup).toContain("Next working session to be scheduled.");
  });

  it("GoCanvas's work names what it is and its customer status, and carries no internal notes", () => {
    const markup = html(
      viewWith({
        journey: {
          current: { key: "kickoff", label: "Kickoff" },
          headline: "",
          yours: [],
          stages: [],
          solutions: [
            {
              id: "s2",
              name: "Integration",
              who: "us",
              status: "Being built",
              statusKey: "build",
              when: null,
              responsiblePerson: null,
              canConfirm: false,
              note: null,
              blocked: null,
            },
          ],
        },
      }),
    );
    expect(markup).toContain("Integration");
    expect(markup).toContain("Work in progress");
  });
});

describe("kickoff agreements and resources", () => {
  it("shows an agreed scope as agreed, and a proposed scope as proposed to confirm", () => {
    const agreed = html(viewWith({ customerScope: { state: "agreed", items: ["Ticket form"] } }));
    expect(agreed).toContain(">Agreed<");
    expect(agreed).toContain("Ticket form");
    const proposed = html(
      viewWith({ customerScope: { state: "proposed", items: ["Ticket form"] } }),
    );
    expect(proposed).toContain("Proposed · to confirm together");
  });

  it("shows nothing as agreed when nothing is recorded", () => {
    const markup = html(viewWith());
    expect(markup).toContain("Nothing recorded yet. We agree the first deliverables together.");
    expect(markup).not.toContain(">Agreed<");
  });

  it("keeps the standard GoCanvas / Together / Your Team distinctions in the working agreement", () => {
    const markup = html(viewWith());
    expect(markup).toContain("GoCanvas");
    expect(markup).toContain("Together");
    expect(markup).toContain("Your Team");
  });

  it("distinguishes requests needed for launch from other requests, and never calls one out of scope", () => {
    const markup = html(
      viewWith({
        parkingLot: [
          {
            request: "Launch line",
            target: "",
            status: "open",
            neededForLaunch: true,
            owner: "customer",
          },
          {
            request: "Extra line",
            target: "",
            status: "open",
            neededForLaunch: false,
            owner: "customer",
          },
        ],
      }),
    );
    expect(markup).toContain("Needed for launch");
    expect(markup).toContain("Other request · we will review it together");
    expect(markup.toLowerCase()).not.toContain("out of scope");
  });

  it("gives each help pick through the tracked link", () => {
    const markup = html(
      viewWith({
        helpPicks: [
          {
            article_id: "a1",
            title: "Start here",
            url: "https://help.example/a1",
            why: "First form",
            when: null,
          },
        ],
      }),
    );
    expect(markup).toContain("https://hub.example/go/t/a1");
    expect(markup).not.toContain("https://help.example/a1");
  });

  it("offers an Email your TIS link when the lead has a valid address", () => {
    const markup = html(viewWith());
    expect(markup).toContain("Email your TIS");
    expect(markup).toContain("mailto:priya@gocanvas.com?subject=");
  });

  it("shows a clear unavailable state when there is no valid address", () => {
    const markup = html(viewWith({ team: { leadEmail: null } }));
    expect(markup).not.toContain("Email your TIS");
    expect(markup).toContain("No email address is on file");
  });
});

describe("layout — two columns, the important things first, and supporting detail collapsed", () => {
  const started = viewWith({
    journey: {
      current: { key: "get_it_working", label: "Get it working" },
      headline: "",
      yours: [],
      solutions: [],
      stages: [
        { key: "pre_kickoff", label: "Intake & Process", state: "done", blurb: "" },
        { key: "kickoff", label: "Kickoff", state: "done", blurb: "" },
        { key: "get_it_working", label: "Get it working", state: "now", blurb: "" },
        { key: "make_it_yours", label: "Make it yours", state: "later", blurb: "" },
        { key: "make_it_run", label: "Make it run", state: "later", blurb: "" },
        { key: "complete", label: "Graduate", state: "later", blurb: "" },
      ],
    },
    intake: { known: [], needed: [{ key: "q", ask: "Crew size?", hint: "", kind: "text" }] },
    parkingLot: [
      {
        request: "Extra line",
        target: "",
        status: "open",
        neededForLaunch: false,
        owner: "customer",
      },
    ],
  });

  it("puts the main column (what needs attention) before the secondary column", () => {
    const markup = html(started);
    const body = markup.indexOf("gc-dash-body");
    const main = markup.indexOf("gc-dash-main");
    const side = markup.indexOf("gc-dash-side");
    expect(body).toBeGreaterThan(-1);
    expect(main).toBeGreaterThan(body);
    expect(side).toBeGreaterThan(main);
    expect(markup.indexOf("What needs your attention")).toBeLessThan(
      markup.indexOf("Next working session"),
    );
  });

  it("keeps the next working session and the TIS near the top of the secondary column", () => {
    const markup = html(started);
    const side = markup.slice(markup.indexOf("gc-dash-side"));
    expect(side.indexOf("Next working session")).toBeLessThan(
      side.indexOf("What GoCanvas is working on"),
    );
    expect(side.indexOf("Contact your TIS")).toBeLessThan(
      side.indexOf("What GoCanvas is working on"),
    );
    expect(side.indexOf("What GoCanvas is working on")).toBeLessThan(side.indexOf(">Resources<"));
  });

  it("collapses the full journey, the expectations, the requests and the resource details by default", () => {
    const markup = html(started);
    expect(markup).toMatch(/<details class="gc-dash-journey">/);
    expect(markup).not.toMatch(/<details class="gc-dash-journey" open/);
    const disclosures = [...markup.matchAll(/<details class="gc-dash-disclosure"( open)?>/g)];
    expect(disclosures.length).toBeGreaterThan(0);
    expect(disclosures.every((m) => !m[1])).toBe(true);
    expect(markup).toContain("How we&#x27;ll work together");
    expect(markup).toContain("Ideas and requests for later (1)");
  });

  it("keeps the agreed deliverables visible without opening anything", () => {
    const markup = html(viewWith({ customerScope: { state: "agreed", items: ["Ticket form"] } }));
    const block = markup.slice(markup.indexOf("Agreed deliverables"));
    expect(block.slice(0, 600)).toContain("Ticket form");
  });

  it("says when the next session cannot yet be worked out, rather than guessing", () => {
    const markup = renderToStaticMarkup(
      createElement(CustomerDashboard, {
        view: started,
        today: null,
        mode: "shared",
        icsBase: null,
        onTick: noop,
        onAnswer: noop,
        onBall: noop,
      }),
    );
    expect(markup).toContain("Checking your next session…");
    expect(markup).not.toContain("to be scheduled");
  });
});
