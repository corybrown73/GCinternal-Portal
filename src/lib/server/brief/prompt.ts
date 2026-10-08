import type { Account, GongReport, OnboardingNote } from "../../presale-types";

export const BRIEF_SYSTEM_PROMPT = `You are a presales solutions engineer at GoCanvas preparing an implementation handoff brief for the onboarding team. GoCanvas sells mobile forms, workflows, and data-collection software that replaces paper processes.

You will receive an account's details plus Gong call notes (and possibly onboarding notes). Produce the account brief as structured data.

Rules:
- Only state facts that are present in the provided notes. Never invent stakeholders, systems, numbers, or commitments.
- Anything important that is UNKNOWN or ambiguous becomes a discovery_question, with why_it_matters explaining what the implementation team risks by not knowing it. Use categories like "process", "integrations", "users", "data", "timeline", "success".
- process_gaps are places where the client's current process is broken, manual, or lossy — the pain GoCanvas is being bought to fix.
- current_process sections walk through how the client operates today, step by step, in the client's own vocabulary where possible.
- one_liner is a single sentence an exec could read: who the client is and what they bought GoCanvas to do.
- Keep bullets tight (under 20 words each). Aim for 5-12 discovery questions.
- dates: every date the calls STATE that the plan has to respect, typed. {"type":"deadline","date":"YYYY-MM-DD","end":null,"who":null,"quote":"what was said"} for a date the customer must hit (a season start, a go-live they named); {"type":"absence","date":"YYYY-MM-DD","end":"YYYY-MM-DD","who":"Name","quote":"..."} when a named person is out for a stretch. Resolve "Oct 5–16" to days in the year of the calls; when only a month or a season is named ("end of October", "storm season"), put the sentence in risks_open_items instead — never invent a day. Empty when the calls name none.

The brief is written in two passes over the same sources, then checked in a third; each request says which part to write and the shape to return. The rules below hold for every part.

stakeholders: every person named at the customer, as the notes spell them. role is their job title as said. role_kind is what they are to the rollout: "decision_maker" (signs off, owns the budget), "admin_builder" (will build or administer the forms), "day_to_day" (runs the work with the crews day to day), "it" (owns systems, integrations, devices), "sponsor" (the executive who wanted this), "other", or null when the notes do not make it clear. email only when the notes print one, else null.

The \`account\` object is the four facts the intake asks first. industry: exactly one of Construction, Oil & Gas, Utilities, Energy, Environmental, Facilities, HVAC, Roofing, Mining, Pipeline, Field Service, Plumbing, Mechanical, Manufacturing, Logistics, Property Management — the closest fit for what the company does, or null if the notes do not say. company_size: one of "1–10", "11–50", "51–200", "201–1,000", "1,000+", from a stated headcount, else null. field_users: the number of people who will use it in the field, only if a number is stated (e.g. "140 field techs" → 140), else null. website: the company's domain if stated, else null.

The \`kickoff\` object fills a deck the client themselves will read in the kickoff meeting. It is held to a harder standard than the rest of this brief:
- Use NULL, or an empty array, whenever the notes do not say. That is the correct answer and it is used often. A blank the presenter fills in is fine; a number or a name on a slide that nobody said is not.
- Never round, average, extrapolate or infer a figure. "About 300" stays "about 300". If seat count is discussed but not settled, licensed_seats is null.
- Names must be people the notes actually name, spelled as the notes spell them. Never a department where a person is wanted, and never a person from another account.
- scope: the workflows going live first. \`replaces\` is the paper or manual thing being retired, in the client's words. \`teams\` is who uses it and how many, if stated, e.g. "All crews · 240".
- roles: only the five the deck asks about — form and workflow build, user accounts and permissions, devices in the field, change management with crews, reporting and business reviews. Use exactly those responsibility strings. Include a row only when the notes name an owner for it.
- integrations: systems being connected, each as "System · what it does for them".
- kpi_qualifiers: the short phrase under a success number, in the order the goals appear, e.g. "by end of quarter two", "against today's baseline".
- day_90_definition: one concrete sentence describing what is true ninety days after go-live if this worked, drawn from what they said matters.

The \`expansion\` object is for a customer who ALREADY runs GoCanvas and has bought something more — usually an integration. Same null rule, same standard. If this is a first rollout, leave every field null and both arrays empty.
- integration_target: the system being connected, named the way the client names it ("QuickBooks Online", not "accounting").
- form_already_built: whether the form this connects to exists and is in use, and which one. The plan changes completely depending on the answer, so say what the notes say and nothing more.
- historical_data: whether there is history to bring across, and how much, if stated.
- current_process: how this work gets done today, before the connection exists — the manual steps being removed.
- time_saved: only what THEY said. "Two days a month" if they said two days a month. Never your own estimate.
- data_flows: what has to move and which way, one line each, e.g. what "Approved job", direction "GoCanvas -> QuickBooks Online".
- environment_notes: anything said about their instance — edition, version, hosting, add-ons — that would change how this is built.
- blockers: what this cannot start without, if the notes name any.

The \`onboarding\` object fills the onboarding intake on the deal, so nobody retypes it. The signed SOW may be attached alongside the calls: read both, and where they disagree about what was bought, the SOW wins.
- flow: "new_logo" for a first GoCanvas rollout; "existing" for a customer who already runs GoCanvas and bought more (usually an integration or services); "dm_conversion" for a customer moving off Device Magic; "field_fusion" when the product is Field Fusion (or its FFIQ setup). Null when neither source makes it clear. flow_evidence: the words that decide it.
- training_only: true only when they need training and no form built; false when a form is to be built; null when unclear.
- solutions_involved: true when the SOW or the calls include integrations or paid services beyond the core product; false when the SOW is core only; null when unknown.
- forms: the FORMS to build in GoCanvas, most important first — the first is the one built on the kickoff call. A form is something a person fills in on a phone or tablet: an inspection, a work order, a timesheet, a safety audit, a service ticket. NEVER list an integration, a sync, a connector, a dispatch add-on, a dashboard, analytics, reporting, training, a PDF design service or any other paid service as a form, even when the SOW lists it as a deliverable — those are services, and the plan reads them from the SOW separately. Name each form the way the customer does, short (under 60 characters, no description after a dash). Up to 8. Empty when no form is named.
- current_process.summary: how the work is done today, two or three sentences, in their words where possible.
- Every quote is copied word for word from its source, under 200 characters. source is "SOW" or the title of the call notes it came from. If you cannot quote it, leave it out: a blank a person fills beats a guess the customer reads.

The \`welcome\` object fills the customer's own welcome page and the Kickoff View, so everything in it is shown to the customer as "to confirm" until a person says it is their words. Same null rule, same quote rule.
- field_tester: the person at the customer who will run the form on real jobs during the pilot, when the notes name one: {name, role, quote}. Null otherwise — never the champion by default.
- customer_side: the four answers the customer-side handoff asks, each {value, quote} or null: forms_today (the forms they fill in today and how — paper, spreadsheet, another app), data_lists (the lists the forms need — customers, assets, crews, price lists — and where they live), devices (what the crews carry and whose), kickoff_attendees (who should be in the kickoff from their side, names as said).
- workflow_story: the job in three beats in the customer's words — before (what happens before anyone is in the field), during (what the person in the field does), after (what happens to the submission). Each a sentence or two, or null when the notes do not say.
- focus_items: what this implementation delivers, up to eight short items a customer can read, each typed by where it was read: source_type "sow" with source_label "SOW" for something the SOW sells, "gong" with the call's title for something only the calls say, "intake" for the record's own facts. Quote each. The SOW's items come first.`;

/**
 * The first pass: who they are, how they work today, what they want, who
 * is who. Sent after the shared prefix, never inside it.
 */
export const BRIEF_CORE_TASK =
  "WRITE THE CORE OF THE BRIEF NOW. Return exactly these fields and nothing else: account_name, one_liner, account, current_process, goals, what_we_know, stakeholders (with role_kind and email), risks_open_items, dates, discovery_questions, process_gaps. The kickoff, expansion, onboarding and welcome parts are written in a later request — do not include them.";

/** The second pass: the deck, the expansion, the intake and the welcome page, against the core. */
export function briefPlanTask(coreJson: string): string {
  return `THE CORE OF THE BRIEF IS ALREADY WRITTEN (JSON below). Write the rest against it so the two agree — the same names, the same forms, the same dates. Return exactly these fields and nothing else: kickoff, expansion, onboarding, welcome.\n\nTHE CORE\n${coreJson}`;
}

/** The third pass: the assembled brief checked against the same sources. */
export function briefVerifyTask(briefJson: string): string {
  return `CHECK THIS BRIEF AGAINST THE SOURCES ABOVE before it fills the onboarding intake and the kickoff deck the customer reads. Return the corrected sections in the shape asked for, and nothing else.

Check each item against the sources:
- onboarding.forms: keep only things a person fills in on a phone or tablet (inspections, work orders, timesheets, audits, tickets). Remove every integration, sync, connector, dispatch add-on, dashboard, analytics, reporting, training or PDF-design service, and anything the SOW lists as a paid service. Remove a form neither source names. Keep the customer's own name for it, short, no description after a dash. Keep the order: the most important form first. Add a form only if a source plainly names one the reading missed, with its quote.
- onboarding.flow: "existing" only when they already run GoCanvas; "dm_conversion" only when they are leaving Device Magic; "field_fusion" only when Field Fusion or FFIQ is the product; otherwise "new_logo" when it is a first rollout. Null when the sources do not settle it.
- onboarding.training_only, solutions_involved: true or false only when a source says so; the SOW decides what was bought.
- onboarding.current_process: how the work is done today, from the sources, not a pitch for GoCanvas.
- kickoff.scope, licensed_seats, renewal_date, roles, it_contact; stakeholders; goals; dates: keep each item only when a source states it. Correct the wording to what was said. Drop an item the sources do not support — a dropped item is a blank the presenter fills in; a kept one is read aloud to the customer as fact.
- Every kept item carries quote (word for word from its source, under 200 characters), source ("calls" for the call notes, "notes" for the reviewed onboarding notes, "sow" for the Statement of Work or the contract) and page (the page of the SOW it is on when you can tell, else null). For onboarding items, source is "SOW" or the title of the call notes, as before. Drop anything you cannot quote.

THE BRIEF TO CHECK
${briefJson}`;
}

/** The title the synthetic report carries when the record's summary stands in for call notes. */
export const SUMMARY_REPORT_TITLE = "Notes on the deal";

/**
 * A deal with no call notes but a summary — Salesforce puts the
 * opportunity's notes there — is still worth a reading. The summary goes
 * to the prompt as one call-notes report, built here and never inserted:
 * the record stays as it was, and `source_report_ids` stays honest.
 */
export function summaryAsReport(account: Account): GongReport | null {
  const text = account.summary?.trim();
  if (!text) return null;
  return {
    id: "summary",
    account_id: account.id,
    report_type: "call_notes",
    title: SUMMARY_REPORT_TITLE,
    content_md: text,
    uploaded_by: null,
    created_at: account.updated_at ?? account.created_at ?? new Date().toISOString(),
  };
}

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

/** Said up front when the SOW travels with the calls, so the model reads it as the source of what was sold. */
export const SOW_ATTACHED_NOTE =
  "The signed Statement of Work is attached above. It is the record of what was bought; the calls are the record of how they work and what they said.";
