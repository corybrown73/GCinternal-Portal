/**
 * Sutton Farms, anonymised: the deal Teya flagged. A seats-only contract, no
 * SOW, and two calls. One call talked about pushing payroll hours into
 * Google Sheets — nobody bought it, and the brief put it on the deck and in
 * the customer-visible "Systems and requirements" answer. The other said
 * each bin and each field carries a QR code — a hard requirement the brief
 * had nowhere to put, and lost.
 *
 * People and numbers are invented; the shape of the deal is real.
 */
import type { BriefJson } from "../../server/schemas";
import type { PurchaseReading } from "../../server/brief/purchased";

export const SUTTON_CALLS = [
  {
    title: "Discovery call",
    content_md: [
      "Sutton Farms runs harvest crews across twelve fields.",
      "Crew leads fill in a paper bin tally at the end of each row and the office retypes it on Mondays.",
      "Sam T. (farm manager) asked whether hours from the bin tally could feed their Google Sheets payroll sheet.",
      "We said a Google Sheets integration is something we can scope later; it was discussed, not quoted.",
    ].join("\n"),
  },
  {
    title: "Workflow walkthrough",
    content_md: [
      "Lee M. walked us through a harvest day.",
      "Each bin and each field carries a QR code, and the crew lead scans it to start the tally.",
      "Most fields have no signal, so the form has to work offline until the truck is back at the yard.",
      "They do not need GPS on the form.",
    ].join("\n"),
  },
] as const;

/** The calls as one text, the way the verifier and the backstop read them. */
export const SUTTON_CALLS_TEXT = SUTTON_CALLS.map((c) => `${c.title}\n${c.content_md}`).join(
  "\n\n",
);

/** The signed contract: seats and a term, no services, no integrations. */
export const SUTTON_CONTRACT_TEXT = [
  "ORDER FORM — Sutton Farms",
  "GoCanvas Business plan: 25 seats, 12-month term.",
  "Professional services: none.",
  "Signed by the customer.",
].join("\n");

/** The kept reading of that contract: it sells seats, nothing to connect. */
export const SUTTON_CONTRACT_READING: PurchaseReading = {
  services: [],
  integrations: [],
};

/**
 * The brief as the model wrote it before the purchase rule: the calls'
 * Sheets wish on the integrations line, a focus item and a scope line, and
 * `solutions_involved` true because "the calls include integrations".
 */
export const SUTTON_BRIEF: BriefJson = {
  account_name: "Sutton Farms",
  one_liner:
    "Sutton Farms runs harvest crews on paper bin tallies and bought GoCanvas for 25 seats.",
  account: { industry: null, company_size: null, field_users: 25, website: null },
  current_process: [
    {
      title: "Harvest day",
      bullets: ["Paper bin tally at the end of each row", "Office retypes it on Mondays"],
    },
  ],
  goals: ["No retyping of bin tallies"],
  what_we_know: [{ topic: "Crews", detail: "Harvest crews across twelve fields" }],
  stakeholders: [
    { name: "Sam T.", role: "Farm manager", notes: "", role_kind: "decision_maker", email: null },
  ],
  risks_open_items: [],
  dates: [],
  discovery_questions: [],
  process_gaps: ["Bin tallies retyped by the office"],
  requirements: [],
  kickoff: {
    day_90_definition: null,
    scope: [
      { workflow: "Bin tally", replaces: "Paper bin tally", teams: "Crew leads" },
      { workflow: "Payroll hours sync to Google Sheets", replaces: null, teams: null },
    ],
    out_of_scope: null,
    integrations: ["Google Sheets · payroll hours from the bin tally"],
    roles: [],
    licensed_seats: "25 seats",
    renewal_date: null,
    it_contact: null,
    training: [],
    kpi_qualifiers: [],
    next_meeting: null,
  },
  expansion: {
    integration_target: null,
    form_already_built: null,
    historical_data: null,
    current_process: null,
    time_saved: null,
    data_flows: [],
    environment_notes: [],
    blockers: [],
  },
  onboarding: {
    flow: "new_logo",
    flow_evidence: null,
    training_only: false,
    solutions_involved: true,
    forms: [{ name: "Bin tally", quote: "paper bin tally", source: "Discovery call" }],
    current_process: null,
  },
  welcome: {
    field_tester: null,
    customer_side: { forms_today: null, data_lists: null, devices: null, kickoff_attendees: null },
    workflow_story: { before: null, during: null, after: null },
    focus_items: [
      {
        text: "Bin tally on the phone",
        source_type: "gong",
        source_label: "Discovery call",
        quote: "paper bin tally",
      },
      {
        text: "Payroll hours synced to Google Sheets",
        source_type: "gong",
        source_label: "Discovery call",
        quote: "feed their Google Sheets payroll sheet",
      },
    ],
  },
  verification: {
    checked_at: "2026-10-15T12:00:00.000Z",
    fields: {
      "kickoff.scope[0]": "grounded",
      "kickoff.scope[1]": "grounded",
      "kickoff.integrations[0]": "grounded",
      "welcome.focus_items[0]": "grounded",
      "welcome.focus_items[1]": "grounded",
    },
  },
};
