import type { Account, GongReport, OnboardingNote } from "../../presale-types";

export const BRIEF_SYSTEM_PROMPT = `You are a presales solutions engineer at GoCanvas preparing an implementation handoff brief for the onboarding team. GoCanvas sells mobile forms, workflows, and data-collection software that replaces paper processes.

You will receive an account's details plus Gong call notes (and possibly onboarding notes). Produce the account brief as structured data.

Rules:
- Only state facts that are present in the provided notes. Never invent stakeholders, systems, numbers, or commitments.
- Anything important that is UNKNOWN or ambiguous becomes a discovery_question, with why_it_matters explaining what the implementation team risks by not knowing it. Use categories like "process", "integrations", "users", "data", "timeline", "success".
- process_gaps are places where the client's current process is broken, manual, or lossy — the pain GoCanvas is being bought to fix.
- current_process sections walk through how the client operates today, step by step, in the client's own vocabulary where possible.
- one_liner is a single sentence an exec could read: who the client is and what they bought GoCanvas to do.
- Keep bullets tight (under 20 words each). Aim for 5-12 discovery questions.`;

export function buildBriefUserPrompt(
  account: Account,
  reports: GongReport[],
  notes: OnboardingNote[],
): string {
  const parts: string[] = [];
  parts.push(`# Account: ${account.name}`);
  const facts: string[] = [];
  if (account.domain) facts.push(`Domain: ${account.domain}`);
  if (account.arr != null) facts.push(`ARR: $${account.arr}`);
  if (account.products.length) facts.push(`Products: ${account.products.join(", ")}`);
  facts.push(`Current stage: ${account.stage}`);
  if (account.summary) facts.push(`Summary: ${account.summary}`);
  parts.push(facts.join("\n"));

  for (const r of reports) {
    parts.push(
      `## ${r.report_type === "account_map" ? "Account map" : "Gong call notes"}: ${r.title} (${r.created_at.slice(0, 10)})\n\n${r.content_md}`,
    );
  }
  for (const n of notes) {
    parts.push(`## Onboarding note (${n.created_at.slice(0, 10)})\n\n${n.body_md}`);
  }
  return parts.join("\n\n---\n\n");
}
