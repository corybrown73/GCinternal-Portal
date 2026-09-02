/**
 * Render the kickoff deck with hostile-but-realistic content, so somebody can
 * look at it.
 *
 * WHY THIS EXISTS. The deck's design system is correct by construction — every
 * colour and size comes from `brand.ts`. What no unit test can tell you is
 * whether the words FIT. Every heading in the template was sized against
 * "Acme Construction", and the first customer with a longer name printed
 * straight through the word "Welcome," on slide one. Three defects of exactly
 * that kind were found by rendering this and looking at it, and none of them
 * would have failed a test that only checked the file was produced.
 *
 *   npx tsx scripts/deck-visual-qa.ts [outDir]
 *   soffice --headless --convert-to pdf <out>/kickoff.pptx
 *   pdftoppm -jpeg -r 110 <out>/kickoff.pdf slide
 *
 * Then look at every slide. The fixture deliberately uses a company name long
 * enough to wrap, a KPI value full of arrows and slashes, and fields left
 * blank so the placeholders render too.
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { TEMPLATE_FIELDS, type KickoffDeckData } from "@/lib/kickoff-fields";
import { buildKickoffDeckFile } from "@/lib/server/brief/pptx";

const OUT = process.argv[2] ?? "/tmp/deckqa";

/** The values that have historically broken layout. */
const HOSTILE: Record<string, string> = {
  deck_eyebrow: "Implementation Kickoff · August 2026",
  client_name: "Maverick Well Pluggers & Remediation Services",
  client_name_short: "Maverick",
  client_person_1_name: "Dale Whitcombe",
  client_person_1_role: "VP Operations · Executive sponsor",
  gc_lead_name: "Priya Nair",
  gc_lead_role: "Implementation Lead",
  goal_1: "Stop rekeying field tickets into the ERP every evening",
  kpi_1_label: "Days to invoice",
  kpi_1_value: "9 → 2",
  kpi_1_metric: "average, job complete to invoice sent",
  kpi_2_label: "Tickets rekeyed",
  kpi_2_value: "60/wk → 0",
  kpi_2_metric: "manual re-entry eliminated",
  kpi_3_label: "Users live",
  kpi_3_value: "24",
  kpi_3_metric: "field crew across three yards",
};

const fields: Record<string, string> = { ...HOSTILE };
for (const k of TEMPLATE_FIELDS) {
  if (!(k in fields)) fields[k] = `Sample ${k.replace(/_/g, " ")}`;
}
for (const k of ["it_req_3", "it_req_4", "goal_4_detail"]) delete fields[k];

const data: KickoffDeckData = {
  fields,
  fromCalls: [],
  missing: TEMPLATE_FIELDS.filter((k) => !(k in fields)),
  optionalSlides: { about: true, integrations: true, support: true, risks: true },
};

const buf = await buildKickoffDeckFile(data, null);
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/kickoff.pptx`, buf);
console.log(`wrote ${OUT}/kickoff.pptx (${buf.length} bytes)`);
