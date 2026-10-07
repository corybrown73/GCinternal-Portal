/**
 * Render the Kickoff View's 7 screens to static HTML for a visual check —
 * WelcomePage's own `experience` toggle is internal React state, so a
 * static server render of WelcomePage always shows the Plan. This renders
 * kickoffScreenList(view) directly instead, in the same wp-shell/wp-scroll
 * markup WelcomePage itself uses, so welcome-shots.mjs's ".wp-stage"
 * screenshot logic works unmodified on the output.
 *
 *   npx tsx scripts/kickoff-qa.tsx <outDir>
 *   node scripts/welcome-shots.mjs <outDir> kickoff-rich
 *   node scripts/welcome-shots.mjs <outDir> kickoff-sparse
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { kickoffScreenList } from "@/components/kickoff-view";
import { buildTimeline } from "@/lib/onboarding-timeline";
import type { WelcomeView } from "@/lib/welcome";

const css = readFileSync("src/styles.css", "utf8");
const start = css.indexOf("The welcome page (src/components/welcome-page.tsx)");
const wp = css.slice(css.lastIndexOf("/*", start));

const utils = `
.h-3{height:12px}.w-3{width:12px}.h-3\\.5{height:14px}.w-3\\.5{width:14px}.h-4{height:16px}.w-4{width:16px}.h-5{height:20px}.w-5{width:20px}.h-6{height:24px}.w-6{width:24px}.w-7{height:28px}.h-7{width:28px}.w-auto{width:auto}
button{background:none;border:0;font:inherit}
body{margin:0}
`;

const timeline = buildTimeline({
  closeDate: "2026-09-09",
  overrides: { working: "2026-09-15" },
  completed: { close: "2026-09-09" },
  times: { kickoff: "10:00", working: "14:30" },
  timezone: "America/Chicago",
});

const richView: WelcomeView = {
  dealId: "d1",
  clientName: "Maverick Well Pluggers & Remediation Services",
  industry: "Oil & Gas",
  icon: "Fuel",
  timeline,
  lead: "Priya Nair",
  fieldTester: "Dale Whitcombe",
  currentProcess:
    "Three crews fill in a paper haul ticket on the truck. The office retypes them on Fridays and chases the missing signatures.",
  currentProcessSource: "ai",
  team: {
    lead: "Priya Nair",
    leadEmail: "priya.nair@gocanvas.com",
    leadCard: {
      title: "Implementation Specialist",
      bookingUrl: "https://calendly.com/priya-gocanvas/30min",
      bio: null,
      photoUrl: null,
    },
    accountManager: "Marcus Bell",
    solutionsEngineer: "Priya Nair",
    champion: { name: "Tom Alvarez", role: "Operations Manager" },
    others: [{ name: "Dale Whitcombe", role: "Field tester" }],
  },
  firstForm: {
    name: "Daily Water Haul Ticket",
    objective: "Load, well, volume, driver and customer signature.",
    source: "library",
  },
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
  intake: {
    known: [
      {
        key: "business_outcome",
        ask: "What success looks like for you",
        value:
          "Stop re-typing haul tickets so invoices go out the same day, not the following Friday.",
        confirmed: true,
      },
    ],
    needed: [],
  },
  journey: {
    stages: [
      {
        key: "pre_kickoff",
        label: "Intake & Process",
        state: "done",
        blurb: "Before we meet: your team and ours get ready, and the first meeting is booked.",
      },
      {
        key: "kickoff",
        label: "Kickoff",
        state: "now",
        blurb: "The first meeting: we walk your process together and agree the plan and dates.",
      },
      {
        key: "get_it_working",
        label: "Get it working",
        state: "later",
        blurb: "One form, one real job, end to end — the plan and dates agreed.",
      },
      {
        key: "make_it_yours",
        label: "Make it yours",
        state: "later",
        blurb: "Your forms, PDFs and connections built, and tested by you on real work.",
      },
      {
        key: "make_it_run",
        label: "Make it run",
        state: "later",
        blurb: "Your crew runs it day to day. Go-Live is the day it is simply how work gets done.",
      },
      {
        key: "complete",
        label: "Graduate",
        state: "later",
        blurb: "Proven in real use, and handed to the team that looks after you from here.",
      },
    ],
    current: {
      key: "kickoff",
      label: "Kickoff",
      state: "now",
      blurb: "The first meeting: we walk your process together and agree the plan and dates.",
    },
    headline: "You are in Kickoff. One thing is yours to do — listed below.",
    solutions: [],
    yours: [{ what: "Download the GoCanvas app and log in", by: "2026-09-15", kind: "homework" }],
  },
  workflowStory: {
    before: "A dispatch ticket comes over the radio; the driver writes the load down on paper.",
    during:
      "At the well, the driver fills in volume, customer and signature by hand on the clipboard.",
    after: "Tickets pile up on the office desk until Friday, when they're retyped into QuickBooks.",
    validatedAt: null,
    validatedBy: null,
  },
  implementationFocus: {
    items: [
      {
        id: "f1",
        text: "Replace the paper haul ticket with a mobile form the driver fills in at the well.",
        status: "agreed",
        sources: [{ type: "sow", label: "Daily Water Haul Ticket", quote: null }],
        reviewFlag: null,
      },
      {
        id: "f2",
        text: "Connect approved tickets straight into QuickBooks Online — no more Friday retyping.",
        status: "agreed",
        sources: [{ type: "sow", label: "QuickBooks Online", quote: null }],
        reviewFlag: null,
      },
      {
        id: "f3",
        text: "Put a signed PDF of every ticket in front of the customer before the driver leaves site.",
        status: "agreed",
        sources: [{ type: "intake", label: null, quote: null }],
        reviewFlag: null,
      },
    ],
    validatedAt: "2026-09-10T12:00:00Z",
    validatedBy: "Tom Alvarez",
  },
};

const sparseView: WelcomeView = {
  ...richView,
  currentProcess: null,
  currentProcessSource: null,
  team: { ...richView.team, champion: null, others: [] },
  intake: null,
  journey: null,
  workflowStory: null,
  implementationFocus: null,
};

function renderDeck(view: WelcomeView, file: string) {
  const screens = kickoffScreenList(view);
  const body = screens
    .map((sc, i) => {
      const node = sc.render({
        page: i + 1,
        qr: null,
        mode: "internal",
        onTick: undefined,
        onAnswer: undefined,
        onBall: undefined,
        icsBase: null,
      });
      const html = renderToStaticMarkup(createElement("div", null, node));
      return `<div id="wp-screen-${sc.key}"><div class="wp-stage-box is-both"><div class="wp-stage" style="zoom:1;width:1280px;height:720px">${html}</div></div></div>`;
    })
    .join("\n");
  writeFileSync(
    file,
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap"><style>${utils}${wp}</style></head><body><div class="gc-welcome"><div class="wp-shell"><div class="wp-scroll">${body}</div></div></div></body></html>`,
  );
}

const out = process.argv[2]!;
renderDeck(richView, `${out}/kickoff-rich.html`);
renderDeck(sparseView, `${out}/kickoff-sparse.html`);
console.log("rendered");
