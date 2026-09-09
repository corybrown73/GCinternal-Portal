/**
 * Render the six-slide onboarding deck with realistic content so a person
 * can look at it — the check no unit test can do. Two variants: one with an
 * integration (the tier strip), one without (the next-use-case cards).
 *
 *   npx tsx scripts/onboarding-deck-qa.ts [outDir]
 *   soffice --headless --convert-to pdf <out>/onboarding-*.pptx
 *   pdftoppm -jpeg -r 110 <out>/onboarding-integration.pdf slide
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { buildTimeline } from "@/lib/onboarding-timeline";
import {
  buildOnboardingDeckFile,
  type OnboardingDeckInput,
} from "@/lib/server/brief/onboarding-deck";

const OUT = process.argv[2] ?? "/tmp/onboarding-deck-qa";

const base: Omit<OnboardingDeckInput, "timeline"> = {
  clientName: "Maverick Well Pluggers & Remediation Services",
  industry: "Oil & Gas",
  lead: "Priya Nair",
  fieldTester: "Dale Whitcombe",
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
};

async function main() {
  mkdirSync(OUT, { recursive: true });

  const plain = await buildOnboardingDeckFile({
    ...base,
    timeline: buildTimeline({ closeDate: "2026-09-09", overrides: { working: "2026-09-15" } }),
  });
  writeFileSync(`${OUT}/onboarding-plain.pptx`, plain);

  const integ = await buildOnboardingDeckFile({
    ...base,
    timeline: buildTimeline({
      closeDate: "2026-09-09",
      integrationTier: 3,
      integrationTarget: "QuickBooks Online",
    }),
  });
  writeFileSync(`${OUT}/onboarding-integration.pptx`, integ);
  console.log(
    `wrote ${OUT}/onboarding-plain.pptx (${plain.length}) and onboarding-integration.pptx (${integ.length})`,
  );
}

void main();
