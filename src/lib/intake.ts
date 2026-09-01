/**
 * What we ask when a deal is new.
 *
 * WHY THIS EXISTS AS DATA. A new deal has nothing in it, so the deck built
 * from it would be entirely placeholders. The fix is not a smarter renderer,
 * it is asking the questions first — and the questions have to live somewhere
 * they can be read aloud on a call, checked against the template, and changed
 * without touching a renderer.
 *
 * WHY THESE QUESTIONS. Each one exists because the kickoff deck has a slide
 * that is wrong without it. They are ordered the way the conversation actually
 * goes, not the way the deck is laid out: who, then why, then what today,
 * then what first, then how we will know it worked.
 *
 * The sequencing question ("which crew, which workflow") is the one people
 * skip and the one that matters most. The form has to be proven on a real job
 * before anything is connected to it, and that only works if somebody has
 * named the crew who will do the proving.
 */

export type IntakeQuestion = {
  /** Short id, so an answer can be attributed rather than guessed at. */
  key: string;
  /** Asked in the words you would use on a call. */
  ask: string;
  /** What it is for — shown to the model so it knows why it is worth pressing. */
  why: string;
  /** Deck fields this answer feeds. Empty when it informs judgement, not a slot. */
  fills: string[];
};

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    key: "sponsor",
    ask: "Who is the executive sponsor, and who runs the crews day to day?",
    why: "The team slide names people, with roles in the template's style. A department where a person belongs reads as a deck nobody proofread.",
    fills: [
      "client_person_1_name",
      "client_person_1_role",
      "client_person_2_name",
      "client_person_2_role",
    ],
  },
  {
    key: "goals",
    ask: "In their words, what are they trying to fix? Up to four things.",
    why: "The goals slide should read back what the customer said. Anything we would like them to want is an invention read aloud to them as fact.",
    fills: ["goal_1", "goal_2", "goal_3", "goal_4"],
  },
  {
    key: "process_today",
    ask: "What is the process today, end to end — paper, spreadsheet, whiteboard, rekeying?",
    why: "Without it there is no before to compare against, and the time-saved number has nothing behind it.",
    fills: [],
  },
  {
    key: "first_workflow",
    ask: "Which single workflow goes first, and which crew tests it on real jobs?",
    why: "This is the sequencing decision the whole plan rests on. The form gets proven in the field before anything is connected to it, because field mapping cannot be right until a crew has used the form on a real job.",
    fills: [],
  },
  {
    key: "success",
    ask: "What does success look like in 90 days, and how will they measure it?",
    why: "Feeds the KPI tiles. A KPI with no stated measure becomes a number nobody can check.",
    fills: ["kpi_1_label", "kpi_2_label", "kpi_3_label"],
  },
  {
    key: "timing",
    ask: "What is the target date, and what is driving it — a season, an audit, a contract start?",
    why: "A date with a reason survives contact with a delay. A date without one gets renegotiated on the first call.",
    fills: ["next_meeting"],
  },
  {
    key: "historical_data",
    ask: "Is there historical data to bring across, and where does it live today?",
    why: "Data migration is scoped work. Discovering it after kickoff is how a launch date slips.",
    fills: [],
  },
  {
    key: "integrations",
    ask: "What systems will this eventually connect to — QuickBooks, Sage, an ERP?",
    why: "Named now, sequenced later. It belongs on the phase-three slide, not in week one, and saying so early stops it being pushed for in week two.",
    fills: [],
  },
  {
    key: "signoff",
    ask: "Who signs off that it works, and what are they signing off on?",
    why: "An unnamed approver is the most common reason a launch date moves.",
    fills: [],
  },
];

/**
 * The commercial facts, kept apart from the conversation questions because
 * they are looked up rather than asked, and because getting them wrong in a
 * customer-facing deck is a different kind of wrong.
 */
export const INTAKE_RECORDS = [
  "The signed SOW: its reference, signed date and value.",
  "The call notes or transcript — paste them in full rather than summarising; the summary loses the sentence where the customer said what they actually wanted.",
  "What was sold: the products, and the ARR if it is settled.",
] as const;

/** Answers that are worth having before a deck is generated at all. */
export const INTAKE_MINIMUM = ["sponsor", "goals", "first_workflow"] as const;

export function intakeBrief(): {
  questions: IntakeQuestion[];
  alsoRecord: readonly string[];
  minimum: readonly string[];
  note: string;
} {
  return {
    questions: INTAKE_QUESTIONS,
    alsoRecord: INTAKE_RECORDS,
    minimum: INTAKE_MINIMUM,
    note:
      "Ask these before generating anything. An unanswered question is a visible placeholder in the deck, " +
      "which the presenter can fill — a guessed answer is read to the customer as fact, which they cannot. " +
      "Record answers with add_call_notes or update_deal so they survive this conversation.",
  };
}
