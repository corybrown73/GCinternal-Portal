/**
 * Render the welcome page to static HTML for a visual check:
 *   npx tsx scripts/welcome-qa.tsx <outDir>
 * then screenshot with Playwright (see scripts/welcome-shots.mjs).
 */
import { readFileSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WelcomePage } from "@/components/welcome-page";
import { buildTimeline } from "@/lib/onboarding-timeline";
import type { WelcomeView } from "@/lib/welcome";

const css = readFileSync("src/styles.css", "utf8");
const start = css.indexOf("The welcome page (src/components/welcome-page.tsx)");
const wp = css.slice(css.lastIndexOf("/*", start));

const base: Omit<WelcomeView, "timeline"> = {
  dealId: "d1",
  clientName: "Maverick Well Pluggers & Remediation Services",
  industry: "Oil & Gas",
  icon: "Fuel",
  lead: "Priya Nair",
  fieldTester: "Dale Whitcombe",
  currentProcess:
    "Three crews fill in a paper haul ticket on the truck. The office retypes them on Fridays and chases the missing signatures.",
  firstForm: {
    name: "Daily Water Haul Ticket",
    objective:
      "Load, well, volume, driver and customer signature — the ticket that becomes the invoice. Replaces the paper ticket the office retypes on Fridays.",
    source: "library",
  },
  nextUseCases: [
    {
      name: "Well Site Inspection",
      objective:
        "Lease walk against API practice: tanks, separators, gauges, thief hatches, relief valves, berms, signage.",
    },
    {
      name: "Job Safety Analysis (JSA)",
      objective: "Task steps, hazards, controls and crew sign-off before any job on location.",
    },
    {
      name: "Pressure Test Record",
      objective:
        "Test pressure, hold time, readings and pass/fail per segment, with a chart photo.",
    },
  ],
  photoUrl: null,
  clientLogoUrl: null,
  homeworkDone: { app: "2026-09-10T10:00:00Z" },
  readiness: [],
  team: {
    leadEmail: "priya.nair@gocanvas.com",
    lead: "Priya Nair",
    accountManager: "Marcus Bell",
    solutionsEngineer: "Priya Nair",
    champion: { name: "Tom Alvarez", role: "Operations Manager" },
  },
  shareUrl: "https://www.gcinternalportal.com/welcome/demo-token",
  qrDataUrl: await QRCode.toDataURL("https://www.gcinternalportal.com/welcome/demo-token", {
    margin: 1,
    width: 160,
  }),
  sharedAt: "2026-09-10T09:00:00Z",
  openedAt: null,
};

const utils = `
.h-3{height:12px}.w-3{width:12px}.h-3\\.5{height:14px}.w-3\\.5{width:14px}.h-4{height:16px}.w-4{width:16px}.h-5{height:20px}.w-5{width:20px}.h-6{height:24px}.w-6{width:24px}.w-auto{width:auto}
button{background:none;border:0;font:inherit}
body{margin:0}
`;

function page(view: WelcomeView, mode: "internal" | "shared", file: string) {
  const html = renderToStaticMarkup(createElement(WelcomePage, { view, mode }));
  writeFileSync(
    file,
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap"><style>${utils}${wp}</style></head><body>${html}</body></html>`,
  );
}

const out = process.argv[2]!;
page(
  {
    ...base,
    timeline: buildTimeline({
      closeDate: "2026-09-09",
      overrides: { working: "2026-09-15" },
      completed: { close: "2026-09-09", kickoff: "2026-09-10", homework: "2026-09-11" },
      times: { kickoff: "10:00", working: "14:30" },
      timezone: "America/Chicago",
    }),
  },
  "internal",
  `${out}/plain.html`,
);
page(
  {
    ...base,
    timeline: buildTimeline({
      closeDate: "2026-09-09",
      services: [
        { id: "haul", kind: "paid_form", name: "Chemical Delivery Ticket", phase: 1 },
        { id: "jsa", kind: "paid_form", name: "Job Safety Analysis", phase: 1 },
        { id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 },
        { id: "pdf", kind: "custom_pdf", name: "Invoice PDF", phase: 2 },
        { id: "dash", kind: "analytics", name: "Ops dashboard", phase: 3 },
      ],
    }),
  },
  "shared",
  `${out}/integ.html`,
);
page(
  {
    ...base,
    timeline: buildTimeline({
      closeDate: "2026-09-09",
      integrationTier: 3,
      integrationTarget: "QuickBooks Online",
      formProvenOn: "2026-09-22",
    }),
  },
  "shared",
  `${out}/proven.html`,
);
console.log("rendered");
