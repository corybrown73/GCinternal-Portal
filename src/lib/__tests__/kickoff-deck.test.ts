import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { kickoffScreenList } from "@/components/kickoff-view";
import { shortDay } from "@/lib/onboarding-timeline";
import {
  KICKOFF_EXPECTATIONS,
  KICKOFF_FORM_STEPS,
  KICKOFF_TO_CONFIRM,
  KICKOFF_UPCOMING,
  KICKOFF_WORKFLOW_QUESTIONS,
  kickoffChanges,
  kickoffGraduationTarget,
  kickoffMoveSources,
  kickoffMoveSplit,
  kickoffUpcomingDetails,
  kickoffWorkflowConfirmed,
  kickoffWorkflowFields,
  nextWorkingSession,
} from "@/lib/kickoff-view";
import type { WelcomeView } from "@/lib/welcome";

/**
 * Regression tests for the six Kickoff slides. Each slide is rendered to
 * static markup from the same screen list the deck uses, so these check what
 * a customer would actually see — not just the helper that feeds it.
 */

type Fixture = Partial<WelcomeView> & Record<string, unknown>;

/** A WelcomeView with nothing recorded, overridden per test. */
function viewWith(overrides: Fixture = {}): WelcomeView {
  return {
    dealId: "deal-1",
    clientName: "Aquatic Facility Services",
    industry: "Pools",
    icon: "Waves",
    timeline: {
      closeDate: "2026-10-01",
      path: "new_logo",
      milestones: [],
      liveDate: "2026-10-26",
      timezone: "America/New_York",
    },
    lead: "Priya Lead",
    fieldTester: null,
    fieldTesterDue: null,
    fieldTesterSource: null,
    currentProcess: "Paper tickets, retyped at the office",
    currentProcessSource: "person",
    team: {
      lead: null,
      leadEmail: null,
      leadCard: null,
      accountManager: null,
      solutionsEngineer: null,
      champion: null,
    },
    firstForm: { name: "Service Ticket", objective: null, source: "library" },
    firstFormSource: "person",
    formArtifacts: [{ name: "Source form.pdf", url: "https://storage.example/source-form.pdf" }],
    nextUseCases: [],
    photoUrl: null,
    clientLogoUrl: null,
    homeworkDone: {},
    readiness: [],
    shareUrl: null,
    qrDataUrl: null,
    sharedAt: null,
    openedAt: null,
    hiddenScreens: [],
    textOverrides: {},
    path: "new_logo",
    helpPicks: [],
    helpOpened: {},
    goBase: null,
    parkingLot: [],
    workflowStory: null,
    implementationFocus: null,
    implementationFocusFallback: [],
    intake: null,
    journey: null,
    ...overrides,
  } as unknown as WelcomeView;
}

const ARGS = (page: number) => ({
  page,
  qr: null,
  mode: "shared" as const,
  onTick: undefined,
  onAnswer: undefined,
  onBall: undefined,
  icsBase: null,
});

/**
 * The text a customer would read from one of the six screens, by position
 * (0 = Welcome). Markup is decoded and React's text-node separators removed,
 * so assertions match the words on the slide, not the HTML around them.
 */
function slide(view: WelcomeView, index: number): string {
  const screen = kickoffScreenList(view)[index]!;
  const html = renderToStaticMarkup(
    screen.render(ARGS(index + 1)) as Parameters<typeof renderToStaticMarkup>[0],
  );
  return html
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

const journeyWith = (complete: string | null, getItWorking: string | null) => ({
  current: { key: "kickoff" },
  stages: [
    { key: "pre_kickoff", label: "Intake & Process", state: "done", blurb: "" },
    { key: "kickoff", label: "Kickoff", state: "now", blurb: "" },
    {
      key: "get_it_working",
      label: "Get it working",
      state: "later",
      blurb: "",
      target: { originalDate: getItWorking, currentDate: getItWorking, actualDate: null },
    },
    { key: "make_it_yours", label: "Make it yours", state: "later", blurb: "" },
    { key: "make_it_run", label: "Make it run", state: "later", blurb: "" },
    {
      key: "complete",
      label: "Graduate",
      state: "later",
      blurb: "",
      target: { originalDate: complete, currentDate: complete, actualDate: null },
    },
  ],
  solutions: [],
  yours: [],
  headline: "",
});

describe("Slide 1 — the cover's date is the agreed Graduate target, never the plan's last milestone", () => {
  it("reads the agreed Graduate target that the stage timeline also shows", () => {
    expect(kickoffGraduationTarget(journeyWith("2026-12-04", "2026-10-23") as never)).toBe(
      "2026-12-04",
    );
  });

  it("is null before any target is agreed, so the cover shows no date rather than the plan's", () => {
    expect(kickoffGraduationTarget(null)).toBeNull();
    expect(kickoffGraduationTarget(journeyWith(null, null) as never)).toBeNull();
  });

  it("the cover never prints the plan's Functional date as a target", () => {
    const view = viewWith({ journey: journeyWith("2026-12-04", "2026-10-23") as never });
    const markup = slide(view, 0);
    expect(markup).toContain(`Graduation target ${shortDay("2026-12-04")}`);
    expect(markup).not.toContain(shortDay("2026-10-26"));
  });

  it("shows the recorded business outcome under 'Your goal'", () => {
    const view = viewWith({
      intake: {
        known: [
          {
            key: "business_outcome",
            ask: "What success looks like for you",
            value: "Invoices out the same day.",
            confirmed: true,
          },
        ],
        needed: [],
      } as never,
    });
    const markup = slide(view, 0);
    expect(markup).toContain("Your goal");
    expect(markup).toContain("Invoices out the same day.");
  });

  it("shows no goal, and no account background in its place, when none is recorded", () => {
    const markup = slide(viewWith({ intake: { known: [], needed: [] } as never }), 0);
    expect(markup).not.toContain("Your goal");
    expect(markup).not.toContain("Aquatic Facility Services background");
  });
});

describe("Slide 2 — workflow answers come only from the dedicated Before/During/After fields", () => {
  it("shows the three permanent questions even when nothing has been captured", () => {
    const markup = slide(viewWith(), 1);
    for (const question of Object.values(KICKOFF_WORKFLOW_QUESTIONS)) {
      expect(markup).toContain(question);
    }
  });

  it("puts each saved answer under its own question and marks blanks 'To confirm together.'", () => {
    const view = viewWith({
      workflowStory: {
        before: "Crews text the office",
        during: null,
        after: "Invoice is sent",
        validatedAt: null,
        validatedBy: null,
      },
    } as never);
    const markup = slide(view, 1);
    expect(markup).toContain("Crews text the office");
    expect(markup).toContain("Invoice is sent");
    expect(markup.split(KICKOFF_TO_CONFIRM).length - 1).toBe(1);
  });

  it("never fills an empty column from discovery notes, the form name, or the outcome", () => {
    const view = viewWith({
      currentProcess: "Paper tickets, retyped at the office",
      workflowStory: null,
      intake: {
        known: [{ key: "business_outcome", ask: "x", value: "Same-day invoices", confirmed: true }],
        needed: [],
      } as never,
    });
    const markup = slide(view, 1);
    expect(markup).not.toContain("Paper tickets");
    expect(markup).not.toContain("Same-day invoices");
    expect(markup).not.toContain("Running Service Ticket");
    expect(markup.split(KICKOFF_TO_CONFIRM).length - 1).toBe(3);
  });

  it("keeps proposed and confirmed status visible", () => {
    const proposed = slide(
      viewWith({
        workflowStory: {
          before: "A",
          during: "B",
          after: "C",
          validatedAt: null,
          validatedBy: null,
        },
      } as never),
      1,
    );
    const confirmed = slide(
      viewWith({
        workflowStory: {
          before: "A",
          during: "B",
          after: "C",
          validatedAt: "2026-10-07T12:00:00Z",
          validatedBy: "x",
        },
      } as never),
      1,
    );
    expect(proposed).toContain("Proposed · to confirm");
    expect(confirmed).toContain("Confirmed with you");
  });

  it("reads only the saved fields, trimmed, with blanks as null", () => {
    expect(kickoffWorkflowFields({ before: "  ", during: " Enter the job ", after: null })).toEqual(
      {
        before: null,
        during: " Enter the job ",
        after: null,
      },
    );
    expect(kickoffWorkflowConfirmed({ validatedAt: "2026-10-07T12:00:00Z" })).toBe(true);
    expect(kickoffWorkflowConfirmed(null)).toBe(false);
  });
});

describe("Slide 3 — the timeline keeps its agreed dates; the lower section explains, without repeating them", () => {
  it("shows each stage's agreed target from the stage timeline, not a plan date", () => {
    const view = viewWith({ journey: journeyWith("2026-12-04", "2026-10-23") as never });
    const markup = slide(view, 2);
    expect(markup).toContain(`Target ${shortDay("2026-10-23")}`);
    expect(markup).toContain(`Target ${shortDay("2026-12-04")}`);
    expect(markup).not.toContain(`Target ${shortDay("2026-10-26")}`);
  });

  it("removes the bottom banner", () => {
    const markup = slide(
      viewWith({ journey: journeyWith("2026-12-04", "2026-10-23") as never }),
      2,
    );
    expect(markup).not.toContain("Today we validate the process");
    expect(markup).not.toContain("wp-band");
  });

  it("explains the four upcoming stages with their standard wording", () => {
    const markup = slide(viewWith(), 2);
    expect(KICKOFF_UPCOMING.map((s) => s.label)).toEqual([
      "Get It Working",
      "Make It Yours",
      "Make It Run",
      "Graduate",
    ]);
    for (const stage of KICKOFF_UPCOMING) expect(markup).toContain(stage.text);
  });

  it("never repeats a stage date in the lower section", () => {
    const markup = slide(
      viewWith({ journey: journeyWith("2026-12-04", "2026-10-23") as never }),
      2,
    );
    const lower = markup.slice(markup.indexOf("wp-kick-upcoming"));
    expect(lower).not.toContain("Target ");
    expect(lower).not.toContain(shortDay("2026-12-04"));
  });

  it("personalises only from recorded details, and invents nothing", () => {
    const lines = kickoffUpcomingDetails(
      viewWith({
        firstForm: { name: "Service Ticket", objective: null, source: "library" },
        fieldTester: "Dana Ortiz",
        fieldTesterDue: "2026-11-02",
        fieldTesterSource: "ai",
        workflowStory: {
          before: "A",
          during: null,
          after: null,
          validatedAt: null,
          validatedBy: null,
        },
        implementationFocus: {
          items: [
            {
              id: "1",
              text: "Ticket intake form",
              status: "proposed",
              sources: [],
              reviewFlag: null,
            },
          ],
          validatedAt: null,
          validatedBy: null,
        },
        journey: { ...journeyWith(null, null), solutions: [{ name: "Custom PDF" }] } as never,
        parkingLot: [
          {
            request: "Add photo field",
            target: "",
            status: "open",
            neededForLaunch: true,
            owner: "customer",
          },
        ],
      } as never),
    );
    expect(lines.get_it_working).toEqual([
      "First form: Service Ticket",
      "Workflow: proposed, to confirm together",
    ]);
    expect(lines.make_it_yours).toEqual(["Scope: Ticket intake form", "Purchased: Custom PDF"]);
    expect(lines.make_it_run).toEqual([
      `Testing: Dana Ortiz · by ${shortDay("2026-11-02")} (to confirm)`,
    ]);
    expect(lines.complete).toEqual(["Open changes to close: 1"]);
  });

  it("gives a stage with nothing recorded no personal lines at all", () => {
    expect(kickoffUpcomingDetails(viewWith({ firstForm: null, currentProcess: null }))).toEqual({});
  });
});

describe("Slide 4 — the same expectations for every implementation", () => {
  it("renders identical markup for two different customers", () => {
    const a = viewWith({
      clientName: "Aquatic Facility Services",
      industry: "Pools",
      lead: "Priya Lead",
    });
    const b = viewWith({
      clientName: "Maverick Well Pluggers",
      industry: "Oil & gas",
      lead: "Sam Other",
      firstForm: { name: "Rig Check", objective: null, source: "typed" },
      parkingLot: [
        {
          request: "Anything",
          target: "",
          status: "open",
          neededForLaunch: false,
          owner: "customer",
        },
      ],
      intake: {
        known: [{ key: "business_outcome", ask: "x", value: "Something", confirmed: true }],
        needed: [],
      } as never,
    });
    expect(slide(a, 3)).toBe(slide(b, 3));
  });

  it("carries the agreed headline, the three columns and the momentum statement, with no customer data", () => {
    const markup = slide(viewWith(), 3);
    expect(markup).toContain("We build it together.");
    expect(markup).toContain("You learn to run it.");
    expect(markup).toContain("A successful implementation takes commitment from both teams.");
    expect(markup).toContain("Keep the momentum between sessions.");
    expect(markup).not.toContain("Aquatic");
    expect(markup).not.toContain("Priya");
    expect(markup).not.toContain("Pools");
  });

  it("has no response deadlines, penalties or contract wording", () => {
    const all = [
      ...KICKOFF_EXPECTATIONS.columns.flatMap((c) => [...c.items]),
      KICKOFF_EXPECTATIONS.momentum.text,
    ].join(" ");
    expect(all).not.toMatch(/business.day|response time|penalt|contract|signed|within \d+/i);
  });
});

describe("Slide 5 — the form, three steps and the recorded changes; no screenshots", () => {
  it("shows the phone illustration with the real form name, and the three steps", () => {
    const markup = slide(viewWith(), 4);
    expect(markup).toContain("wp-phone");
    expect(markup).toContain("Service Ticket");
    for (const step of KICKOFF_FORM_STEPS) expect(markup).toContain(step.label);
  });

  it("never renders a picture of the form, nor the source files or provenance", () => {
    const markup = slide(viewWith(), 4);
    // The only pictures on the slide are GoCanvas's own brand marks.
    const sources = [...markup.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    expect(sources.every((src) => src?.startsWith("/branding/"))).toBe(true);
    expect(markup).not.toContain("data-form-screenshot");
    expect(markup).not.toContain("source-form.pdf");
    expect(markup).not.toContain("Source:");
    expect(markup).not.toContain("Open Source form");
  });

  it("lists open and scheduled changes with their statuses and owners, and leaves done items out", () => {
    const changes = kickoffChanges([
      {
        request: "Add photo field",
        target: "Before the test",
        status: "open",
        neededForLaunch: true,
        owner: "gocanvas",
      },
      {
        request: "Sign-off line",
        target: "",
        status: "scheduled",
        neededForLaunch: false,
        owner: "customer",
      },
      { request: "Old note", target: "", status: "done", neededForLaunch: false, owner: "both" },
    ]);
    expect(changes).toEqual([
      { request: "Add photo field", status: "open", owner: "GoCanvas", target: "Before the test" },
      { request: "Sign-off line", status: "scheduled", owner: "Your team", target: null },
    ]);
    const markup = slide(
      viewWith({
        parkingLot: [
          {
            request: "Add photo field",
            target: "Before the test",
            status: "open",
            neededForLaunch: true,
            owner: "gocanvas",
          },
          {
            request: "Sign-off line",
            target: "",
            status: "scheduled",
            neededForLaunch: false,
            owner: "customer",
          },
        ],
      } as never),
      4,
    );
    expect(markup).toContain("Add photo field");
    expect(markup).toContain("Scheduled");
    expect(markup).toContain("Open");
    expect(markup).not.toContain("Old note");
  });

  it("uses a clear empty state when no change is recorded", () => {
    expect(slide(viewWith(), 4)).toContain("No changes recorded yet.");
  });

  it("keeps a long list readable by showing what fits and pointing to the Plan for the rest", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      request: `Change ${i + 1}`,
      target: "",
      status: "open",
      neededForLaunch: false,
      owner: "customer",
    }));
    const markup = slide(viewWith({ parkingLot: many } as never), 4);
    // Short changes take one line each, so the slide shows the cap of four.
    expect(markup).toContain("Change 4");
    expect(markup).not.toContain("Change 5");
    expect(markup).toContain("+4 more on your Implementation Plan");
  });
});

describe("Slide 6 — actions due before the next working session, split by who owns them", () => {
  const call = (key: string, date: string, time: string | null, doneOn: string | null = null) => ({
    key,
    label: key === "working" ? "Working session" : "Adjust session",
    kind: "call",
    serviceId: undefined,
    date,
    time,
    doneOn,
  });

  it("the next working session is the first call after kickoff that has not been held", () => {
    const milestones = [
      { ...call("kickoff", "2026-10-05", "09:00"), label: "Kickoff" },
      call("working", "2026-10-12", null, "2026-10-12"),
      call("adjust", "2026-10-20", "14:00"),
    ] as never;
    expect(nextWorkingSession(milestones)).toEqual({
      label: "Adjust session",
      date: "2026-10-20",
      time: "14:00",
      booked: true,
    });
  });

  it("an unbooked next session is not confirmed, so no cutoff is taken from it", () => {
    const next = nextWorkingSession([call("adjust", "2026-10-20", null)] as never);
    expect(next?.booked).toBe(false);
  });

  it("assigns actions to GoCanvas or the customer by owner, and shares 'both' items", () => {
    const sources = kickoffMoveSources(
      viewWith({
        journey: {
          solutions: [
            {
              id: "s1",
              name: "Integration",
              who: "us",
              status: "Being built",
              when: "2026-10-14",
              responsiblePerson: "Lee Build",
            },
            {
              id: "s2",
              name: "Field form",
              who: "you",
              status: "Your turn to test it",
              when: "2026-10-16",
              responsiblePerson: null,
            },
          ],
          yours: [
            {
              what: "Download the app",
              by: "2026-10-12",
              kind: "homework",
              ownerSide: "customer",
              ownerName: null,
            },
          ],
        } as never,
        parkingLot: [
          {
            request: "Map the export",
            target: "2026-10-13",
            status: "scheduled",
            neededForLaunch: true,
            owner: "gocanvas",
          },
          {
            request: "Pick the users",
            target: "2026-10-13",
            status: "open",
            neededForLaunch: true,
            owner: "both",
          },
          {
            request: "Before the test",
            target: "Before the test",
            status: "open",
            neededForLaunch: true,
            owner: "customer",
          },
        ],
      } as never),
    );
    expect(sources.ours.map((i) => i.what)).toEqual([
      "Integration: Being built",
      "Map the export",
      "Pick the users",
    ]);
    // Unsorted: solutions, then the change list in its recorded order, then homework.
    expect(sources.theirs.map((i) => i.what)).toEqual([
      "Field form: Your turn to test it",
      "Pick the users",
      "Before the test",
      "Download the app",
    ]);
    expect(sources.ours.find((i) => i.what === "Pick the users")?.shared).toBe(true);
    expect(sources.theirs.find((i) => i.what === "Before the test")?.due).toBeNull();
    expect(sources.ours.find((i) => i.what === "Map the export")?.confirmed).toBe(true);
    expect(sources.ours.find((i) => i.what === "Pick the users")?.confirmed).toBe(false);
  });

  it("with a booked session, shows only actions due on or before it, and counts undated ones once", () => {
    const sources = kickoffMoveSources(
      viewWith({
        journey: {
          solutions: [
            {
              id: "s1",
              name: "Integration",
              who: "us",
              status: "Being built",
              when: "2026-10-30",
              responsiblePerson: null,
            },
          ],
          yours: [],
        } as never,
        parkingLot: [
          {
            request: "Early",
            target: "2026-10-13",
            status: "open",
            neededForLaunch: true,
            owner: "customer",
          },
          {
            request: "Late",
            target: "2026-11-30",
            status: "open",
            neededForLaunch: true,
            owner: "customer",
          },
          {
            request: "Shared, undated",
            target: "later",
            status: "open",
            neededForLaunch: true,
            owner: "both",
          },
        ],
      } as never),
    );
    const split = kickoffMoveSplit(sources, "2026-10-20");
    expect(split.theirs.map((i) => i.what)).toEqual(["Early"]);
    expect(split.ours).toEqual([]);
    // "Shared, undated" appears in both columns but is one action; the solution has a date but is later.
    expect(split.undated).toBe(1);
  });

  it("with no booked session, takes no cutoff: every dated action is shown", () => {
    const sources = kickoffMoveSources(
      viewWith({
        parkingLot: [
          {
            request: "Early",
            target: "2026-10-13",
            status: "open",
            neededForLaunch: true,
            owner: "customer",
          },
          {
            request: "Late",
            target: "2026-11-30",
            status: "open",
            neededForLaunch: true,
            owner: "customer",
          },
        ],
      } as never),
    );
    expect(kickoffMoveSplit(sources, null).theirs.map((i) => i.what)).toEqual(["Early", "Late"]);
  });

  it("the slide shows the next session when booked, 'To be scheduled' when not, and the Plan reference", () => {
    const booked = viewWith({
      timeline: {
        closeDate: "2026-10-01",
        path: "new_logo",
        milestones: [call("working", "2026-10-20", "14:00")],
        liveDate: "2026-10-26",
        timezone: "America/New_York",
      } as never,
    });
    const bookedMarkup = slide(booked, 5);
    expect(bookedMarkup).toContain(
      `Working session · ${shortDay("2026-10-20")} at 14:00 America/New_York`,
    );
    expect(bookedMarkup).toContain("Full action list: your Implementation Plan.");

    const unbooked = viewWith({
      timeline: {
        closeDate: "2026-10-01",
        path: "new_logo",
        milestones: [call("working", "2026-10-20", null)],
        liveDate: "2026-10-26",
        timezone: null,
      } as never,
    });
    expect(slide(unbooked, 5)).toContain("To be scheduled");
  });

  it("with nothing recorded, asks for the responsibilities to be agreed before kickoff ends", () => {
    expect(slide(viewWith(), 5)).toContain(
      "Responsibilities need to be agreed before kickoff ends.",
    );
  });
});
