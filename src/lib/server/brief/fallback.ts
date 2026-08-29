import type { BriefJson } from "../schemas";
import type { Account, GongReport } from "../../presale-types";

// Deterministic no-LLM path: sections the report markdown into topics and
// attaches the curated GoCanvas implementation-discovery checklist.
const STATIC_DISCOVERY: BriefJson["discovery_questions"] = [
  { question: "Which forms/processes are in scope for go-live, and in what order?", why_it_matters: "Sets the rollout plan and first-value milestone.", category: "process" },
  { question: "How many field users and office users will be active in the first 90 days?", why_it_matters: "Licensing, training plan, and adoption tracking depend on it.", category: "users" },
  { question: "Do field teams need offline data capture?", why_it_matters: "Changes form design and sync expectations.", category: "process" },
  { question: "Where does submitted data need to land (email, ERP, BI, file share)?", why_it_matters: "Determines integration work and data destinations.", category: "integrations" },
  { question: "Are there approval or multi-step dispatch workflows today?", why_it_matters: "Workflow configuration is the largest implementation variable.", category: "process" },
  { question: "What reference data (customers, assets, price lists) must be loaded and how often does it change?", why_it_matters: "Drives reference-data setup and refresh automation.", category: "data" },
  { question: "Who signs off on go-live, and what does success look like to them in 90 days?", why_it_matters: "Aligns onboarding to the exec sponsor's definition of value.", category: "success" },
  { question: "What is the target go-live date, and is it tied to an external event?", why_it_matters: "Anchors the onboarding timeline.", category: "timeline" },
  { question: "Which existing systems (ERP, CMMS, CRM) must GoCanvas exchange data with?", why_it_matters: "Scopes integration effort and sequencing.", category: "integrations" },
  { question: "Are there compliance or audit requirements on the collected data?", why_it_matters: "Affects form design, signatures, and retention settings.", category: "data" },
];

function sectionize(md: string): { title: string; bullets: string[] }[] {
  const sections: { title: string; bullets: string[] }[] = [];
  let current: { title: string; bullets: string[] } | null = null;
  for (const line of md.split("\n")) {
    const heading = line.match(/^#{1,3}\s+(.*)/);
    if (heading) {
      if (current && current.bullets.length) sections.push(current);
      current = { title: (heading[1] ?? "").trim(), bullets: [] };
    } else {
      const text = line.replace(/^[-*]\s+/, "").trim();
      if (text && current) current.bullets.push(text.slice(0, 160));
    }
  }
  if (current && current.bullets.length) sections.push(current);
  return sections.slice(0, 6).map((s) => ({ ...s, bullets: s.bullets.slice(0, 6) }));
}

export function buildTemplateBrief(account: Account, reports: GongReport[]): BriefJson {
  const allSections = reports.flatMap((r) => sectionize(r.content_md));

  return {
    account_name: account.name,
    one_liner:
      account.summary ??
      `${account.name} is adopting GoCanvas — see the attached call notes for context.`,
    current_process: allSections.length
      ? allSections
      : reports.map((r) => ({
          title: r.title,
          bullets: [r.content_md.slice(0, 300)],
        })),
    goals: [],
    what_we_know: reports.map((r) => ({
      topic: r.title,
      detail: r.content_md.slice(0, 400),
    })),
    stakeholders: [],
    risks_open_items: [
      "This brief was generated without AI synthesis — review the raw Gong notes for nuance.",
    ],
    discovery_questions: STATIC_DISCOVERY,
    process_gaps: [
      "Confirm with the client which current process steps are manual or paper-based.",
    ],
  };
}
