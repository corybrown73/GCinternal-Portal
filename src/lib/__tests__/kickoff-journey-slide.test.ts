import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { kickoffScreenList } from "@/components/kickoff-view";
import { shortDay } from "@/lib/onboarding-timeline";
import type { WelcomeView } from "@/lib/welcome";

/**
 * Slide 3, "Your journey from kickoff to go-live": the current-stage focus,
 * the preview cards for what is ahead, and the date under each stage. Each
 * case renders the real slide from the same screen list the deck uses.
 */

const ORDER = [
  ["pre_kickoff", "Intake & Process"],
  ["kickoff", "Kickoff"],
  ["get_it_working", "Get It Working"],
  ["make_it_yours", "Make It Yours"],
  ["make_it_run", "Make It Run"],
  ["complete", "Graduate"],
] as const;

type Dates = Partial<Record<string, { current?: string; actual?: string }>>;

function journeyAt(current: string, dates: Dates = {}) {
  const at = ORDER.findIndex(([key]) => key === current);
  return {
    current: { key: current },
    headline: "",
    solutions: [],
    yours: [],
    stages: ORDER.map(([key, label], i) => {
      const d = dates[key];
      return {
        key,
        label,
        state: i < at ? "done" : i === at ? "now" : "later",
        blurb: "",
        target: d
          ? {
              originalDate: d.current ?? null,
              currentDate: d.current ?? null,
              actualDate: d.actual ?? null,
            }
          : null,
      };
    }),
  };
}

function viewWith(overrides: Record<string, unknown> = {}): WelcomeView {
  return {
    dealId: "deal-1",
    clientName: "Aquatic Facility Services",
    industry: "Pools",
    icon: "Waves",
    timeline: {
      closeDate: "2026-10-01",
      path: "new_logo",
      milestones: [],
      liveDate: "2026-12-04",
      timezone: "America/New_York",
    },
    lead: "Priya Lead",
    fieldTester: null,
    fieldTesterDue: null,
    fieldTesterSource: null,
    currentProcess: "Paper forms, retyped at the office",
    currentProcessSource: "person",
    team: {
      lead: null,
      leadEmail: null,
      leadCard: null,
      accountManager: null,
      solutionsEngineer: null,
      champion: null,
    },
    firstForm: { name: "Preventive Maintenance Reports", objective: null, source: "library" },
    firstFormSource: "person",
    formArtifacts: [],
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
    implementationFocus: {
      items: [
        {
          id: "1",
          text: "Preventive Maintenance Reports",
          status: "proposed",
          sources: [],
          reviewFlag: null,
        },
        { id: "2", text: "Work Orders", status: "proposed", sources: [], reviewFlag: null },
      ],
      validatedAt: null,
      validatedBy: null,
    },
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

/** Slide 3 as markup, with React's text separators removed so words match the slide. */
function slide3(view: WelcomeView): string {
  const screen = kickoffScreenList(view)[2]!;
  const html = renderToStaticMarkup(
    screen.render(ARGS(3)) as Parameters<typeof renderToStaticMarkup>[0],
  );
  return html
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

/** The current-stage panel: the one element that carries the "Current stage" label. */
function currentPanel(markup: string): string {
  const start = markup.indexOf('aria-label="Current stage:');
  expect(start).toBeGreaterThan(-1);
  const end = markup.indexOf("</article>", start);
  return markup.slice(start, end);
}

/** The preview cards: each one is a section in the upcoming row. */
function previewCards(markup: string): string[] {
  const row = markup.slice(markup.indexOf('class="wp-kick-next"'));
  return row.split('class="wp-kick-next-card"').slice(1);
}

describe("Slide 3 — the subtitle and the heading", () => {
  it("uses the agreed subtitle and keeps the heading", () => {
    const markup = slide3(viewWith({ journey: journeyAt("get_it_working") }));
    expect(markup).toContain("Your journey from");
    expect(markup).toContain("kickoff to go-live");
    expect(markup).toContain("Each stage has a clear outcome. Together, we'll agree on the dates.");
  });
});

describe("Slide 3 — the current stage is the focus, and follows the journey", () => {
  it("highlights Get It Working with its objective and the customer's first form", () => {
    const markup = slide3(viewWith({ journey: journeyAt("get_it_working") }));
    const panel = currentPanel(markup);
    expect(panel).toContain("You are here");
    expect(panel).toContain("<h3>Get It Working</h3>");
    expect(panel).toContain("Get the first working form ready to test together.");
    expect(panel).toContain("First form");
    expect(panel).toContain("Preventive Maintenance Reports");
  });

  it("moves the focus to whichever stage the journey says is current", () => {
    const markup = slide3(viewWith({ journey: journeyAt("make_it_yours") }));
    expect(currentPanel(markup)).toContain("<h3>Make It Yours</h3>");
    expect(currentPanel(markup)).not.toContain("<h3>Get It Working</h3>");
  });

  it("shows exactly one current-stage panel", () => {
    const markup = slide3(viewWith({ journey: journeyAt("get_it_working") }));
    expect(markup.split('aria-label="Current stage:').length - 1).toBe(1);
  });
});

describe("Slide 3 — the stages ahead are preview cards, in journey order", () => {
  it("shows the three stages after Get It Working as preview cards", () => {
    const markup = slide3(viewWith({ journey: journeyAt("get_it_working") }));
    const cards = previewCards(markup);
    expect(cards).toHaveLength(3);
    expect(cards[0]).toContain("Make It Yours");
    expect(cards[1]).toContain("Make It Run");
    expect(cards[2]).toContain("Graduate");
    expect(cards.join("")).not.toContain("Get It Working");
  });

  it("includes Get It Working as a card when the journey is still at Kickoff", () => {
    const markup = slide3(viewWith({ journey: journeyAt("kickoff") }));
    const cards = previewCards(markup);
    expect(cards).toHaveLength(4);
    expect(cards[0]).toContain("Get It Working");
    expect(currentPanel(markup)).toContain("<h3>Kickoff</h3>");
  });
});

describe("Slide 3 — scope is readable workflow names, not one paragraph", () => {
  it("lists each recorded workflow name on its own row", () => {
    const markup = slide3(viewWith({ journey: journeyAt("get_it_working") }));
    const card = previewCards(markup)[0]!;
    expect(card).toContain("<li>Preventive Maintenance Reports</li>");
    expect(card).toContain("<li>Work Orders</li>");
    expect(card).not.toContain("Scope: ");
    expect(card).not.toContain("; ");
  });

  it("keeps a long workflow name as its own row rather than merging the list", () => {
    const long =
      "Preventive Maintenance Reports for Refrigerated Transport Fleet and Cold-Chain Equipment";
    const markup = slide3(
      viewWith({
        journey: journeyAt("get_it_working"),
        implementationFocus: {
          items: [
            { id: "1", text: long, status: "proposed", sources: [], reviewFlag: null },
            { id: "2", text: "Work Orders", status: "proposed", sources: [], reviewFlag: null },
          ],
          validatedAt: null,
          validatedBy: null,
        },
      }),
    );
    expect(previewCards(markup)[0]).toContain(`<li>${long}</li>`);
    expect(previewCards(markup)[0]).toContain("<li>Work Orders</li>");
  });
});

describe("Slide 3 — dates are the recorded dates, or 'Date to be agreed'", () => {
  const dates = {
    kickoff: { actual: "2026-10-08" },
    get_it_working: { current: "2026-10-23" },
    make_it_run: { current: "2026-11-20" },
    complete: { current: "2026-12-04" },
  };

  it("shows recorded dates on the rail and 'Date to be agreed' where none is recorded", () => {
    const markup = slide3(viewWith({ journey: journeyAt("get_it_working", dates) }));
    expect(markup).toContain(`Completed ${shortDay("2026-10-08")}`);
    expect(markup).toContain(`Target ${shortDay("2026-10-23")}`);
    expect(markup).toContain(`Target ${shortDay("2026-11-20")}`);
    expect(markup).toContain(`Target ${shortDay("2026-12-04")}`);
    expect(markup).toContain("Date to be agreed");
  });

  it("never shows the old 'Target to agree' label", () => {
    const markup = slide3(viewWith({ journey: journeyAt("get_it_working", dates) }));
    expect(markup).not.toContain("Target to agree");
  });

  it("never invents a date for a stage with nothing recorded", () => {
    const markup = slide3(viewWith({ journey: journeyAt("get_it_working", {}) }));
    const agreed = markup.split("Date to be agreed").length - 1;
    expect(agreed).toBe(4);
    expect(markup).not.toMatch(/Target [A-Z][a-z]{2}, /);
  });

  it("keeps dates out of the lower section, where the rail already shows them", () => {
    const markup = slide3(viewWith({ journey: journeyAt("get_it_working", dates) }));
    const lower = markup.slice(markup.indexOf('class="wp-kick-focus"'));
    expect(lower).not.toContain("Target ");
    expect(lower).not.toContain("Date to be agreed");
  });
});

describe("Slide 3 — the journey itself and the other slides are unchanged", () => {
  it("still draws the six-stage rail in journey order, with the You are here marker", () => {
    const markup = slide3(viewWith({ journey: journeyAt("get_it_working") }));
    // Labels are HTML-escaped in the markup ("&" becomes "&amp;").
    const labels = ORDER.map(([, label]) => label.replace("&", "&amp;"));
    let at = markup.indexOf('class="wp-rail is-six"');
    for (const label of labels) {
      at = markup.indexOf(label, at);
      expect(at).toBeGreaterThan(-1);
    }
    expect(markup).toContain("wp-today-tag");
  });

  it("falls back to the four standard preview cards when there is no journey", () => {
    const markup = slide3(viewWith({ journey: null }));
    expect(previewCards(markup)).toHaveLength(4);
    expect(markup).not.toContain('aria-label="Current stage:');
  });
});
