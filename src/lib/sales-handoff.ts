import type { HandoffAnswer, HandoffSource, IntakeAnswers } from "./intake-answers";
import { SERVICE_KINDS } from "./onboarding-services";

/**
 * THE SALES → TIS HANDOFF.
 *
 * One question set, in two halves. The Sales half is what the TIS must be
 * able to say before kickoff: what was bought, the outcome the customer
 * wants, what was promised (or that nothing was), who the contacts are, and
 * the timing. The customer half is the Kickoff Readiness Form: the process
 * today, who will be in the room, what they will bring. Anyone internal can
 * answer the Sales half — the AE, the AM, the TIS, or the AI reading of the
 * calls and the SOW. The customer half goes to the customer on their welcome
 * link as "what we know so far, and a few things we still need".
 *
 * Every answer remembers who gave it, so a fact and a guess never look the
 * same. Questions that already live on the intake (industry, field users,
 * the process today, the uploaded forms) stay where they are; this module
 * reads and writes them in place and stores only the new ones under
 * `intake.handoff.answers`.
 */

export type HandoffValue = string | string[] | boolean | null;
export type HandoffKind = "text" | "long" | "date" | "list" | "contact" | "yesno";
export type HandoffSide = "sales" | "customer";
export type HandoffGroup =
  "bought" | "outcome" | "commitments" | "contacts" | "timing" | "systems" | "open" | "ready";

export type HandoffQuestion = {
  key: string;
  /** The internal label. */
  label: string;
  /** How it is asked on the customer's page. */
  ask: string;
  hint: string;
  side: HandoffSide;
  kind: HandoffKind;
  /** Part of "complete" for its side. */
  required: boolean;
  group: HandoffGroup;
  /** The customer may see this answer on their page. Commitments and our open questions stay inside. */
  share: boolean;
  /** Where the value lives when it is not `handoff.answers`. */
  field?: "current_process" | "field_users";
};

export const HANDOFF_GROUP_LABEL: Record<HandoffGroup, string> = {
  bought: "What was bought",
  outcome: "The outcome",
  commitments: "What was promised",
  contacts: "Who",
  timing: "Timing",
  systems: "Systems and requirements",
  open: "Still open",
  ready: "Before kickoff",
};

export const HANDOFF_QUESTIONS: ReadonlyArray<HandoffQuestion> = [
  // ------------------------------------------------------------ Sales side
  {
    key: "bought",
    label: "What was bought",
    ask: "What you bought",
    hint: "One line per solution: Form Build, Custom PDF, Integration, Analytics, or other. Say which must be ready before go-live.",
    side: "sales",
    kind: "list",
    required: true,
    group: "bought",
    share: true,
  },
  {
    key: "business_outcome",
    label: "The outcome the customer wants",
    ask: "What success looks like for you",
    hint: "In their words: the business result, not the feature. “Stop re-typing field tickets so invoices go out the same day.”",
    side: "sales",
    kind: "long",
    required: true,
    group: "outcome",
    share: true,
  },
  {
    key: "success_measure",
    label: "How they will know it worked",
    ask: "How you will measure it",
    hint: "A number or a moment: invoices out in a day; every crew submitting by Friday.",
    side: "sales",
    kind: "long",
    required: false,
    group: "outcome",
    share: true,
  },
  {
    key: "commitments",
    label: "What was promised",
    ask: "What was promised",
    hint: "Anything the customer was told we would do, build, connect or include — or tick “nothing beyond the SOW”.",
    side: "sales",
    kind: "long",
    required: true,
    group: "commitments",
    share: false,
  },
  {
    key: "contact_decision_maker",
    label: "Decision maker",
    ask: "Who signs off",
    hint: "Name · role · email. The person who owns the outcome.",
    side: "sales",
    kind: "contact",
    required: true,
    group: "contacts",
    share: true,
  },
  {
    key: "contact_admin_builder",
    label: "Admin / builder",
    ask: "Who will build and look after the forms",
    hint: "Name · role · email. The hands on the keyboard; the account's admin after we leave.",
    side: "sales",
    kind: "contact",
    required: true,
    group: "contacts",
    share: true,
  },
  {
    key: "contact_day_to_day",
    label: "Day-to-day contact",
    ask: "Who we talk to day to day",
    hint: "Name · role · email. Who books the meetings and answers the emails.",
    side: "sales",
    kind: "contact",
    required: false,
    group: "contacts",
    share: true,
  },
  {
    key: "desired_launch_date",
    label: "Launch date the customer wants",
    ask: "When you want to be up and running",
    hint: "The date they said. The plan is built back from it.",
    side: "sales",
    kind: "date",
    required: true,
    group: "timing",
    share: true,
  },
  {
    key: "agreed_start",
    label: "Agreed later start",
    ask: "Anything that means we should start later",
    hint: "Blank means we start now. Otherwise the reason and the date: “after the busy season, 1 Dec”.",
    side: "sales",
    kind: "text",
    required: false,
    group: "timing",
    share: true,
  },
  {
    key: "system_requirements",
    label: "Systems and requirements",
    ask: "Systems this needs to work with",
    hint: "The systems to connect, logins we need, data formats, anything IT said.",
    side: "sales",
    kind: "long",
    required: false,
    group: "systems",
    share: true,
  },
  {
    key: "open_questions",
    label: "Open questions",
    ask: "Open questions",
    hint: "What the calls left unanswered. The TIS picks these up in Intake & Process.",
    side: "sales",
    kind: "long",
    required: false,
    group: "open",
    share: false,
  },
  // --------------------------------------------------------- Customer side
  {
    key: "current_process",
    label: "The process today",
    ask: "How this works today",
    hint: "Paper, spreadsheet, whiteboard, another app — from the field to the office.",
    side: "customer",
    kind: "long",
    required: true,
    group: "ready",
    share: true,
    field: "current_process",
  },
  {
    key: "field_users",
    label: "People in the field",
    ask: "How many people will use it in the field",
    hint: "A number. Who gets a login on day one.",
    side: "customer",
    kind: "text",
    required: true,
    group: "ready",
    share: true,
    field: "field_users",
  },
  {
    key: "forms_today",
    label: "The forms they use today",
    ask: "The forms you use today",
    hint: "Name them, and send one filled-in example of each.",
    side: "customer",
    kind: "long",
    required: false,
    group: "ready",
    share: true,
  },
  {
    key: "data_lists",
    label: "Lists the form will need",
    ask: "Lists the form should pick from",
    hint: "Customers, sites, parts, crews — the lists the form picks from, and where they live today.",
    side: "customer",
    kind: "long",
    required: false,
    group: "ready",
    share: true,
  },
  {
    key: "kickoff_attendees",
    label: "Who will be at kickoff",
    ask: "Who will join the kickoff",
    hint: "The admin, someone from the field, and whoever uses the information in the office.",
    side: "customer",
    kind: "long",
    required: true,
    group: "ready",
    share: true,
  },
  {
    key: "devices",
    label: "Devices in the field",
    ask: "What devices the field uses",
    hint: "iPhone, Android, tablets; company-owned or personal.",
    side: "customer",
    kind: "text",
    required: false,
    group: "ready",
    share: true,
  },
  {
    key: "admin_login_ready",
    label: "Admin can log in",
    ask: "Your admin has logged in to GoCanvas",
    hint: "The account is set up and the admin has signed in once.",
    side: "customer",
    kind: "yesno",
    required: false,
    group: "ready",
    share: true,
  },
];

export const HANDOFF_KEYS: ReadonlyArray<string> = HANDOFF_QUESTIONS.map((q) => q.key);

export function handoffQuestion(key: string): HandoffQuestion | null {
  return HANDOFF_QUESTIONS.find((q) => q.key === key) ?? null;
}

/** Something was said: a non-empty text, a non-empty list, or a yes/no. */
export function isAnswered(v: HandoffValue | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.some((x) => x.trim() !== "");
  return v.trim() !== "";
}

/** "Form Build · Daily job report" for every service the plan already holds. */
function boughtFromServices(a: IntakeAnswers): string[] {
  return (a.timeline.services ?? []).map((s) => {
    const kind = SERVICE_KINDS[s.kind as keyof typeof SERVICE_KINDS]?.label ?? s.kind;
    return s.name && s.name !== kind ? `${kind} · ${s.name}` : kind;
  });
}

/** The answer as the record holds it, wherever it lives. */
export function answerValue(a: IntakeAnswers, key: string): HandoffValue {
  const q = handoffQuestion(key);
  if (!q) return null;
  if (q.field === "current_process") return a.current_process ?? null;
  if (q.field === "field_users") return a.field_users == null ? null : String(a.field_users);
  const stored = a.handoff.answers[key]?.value;
  if (isAnswered(stored)) return stored!;
  if (key === "bought") {
    const fromPlan = boughtFromServices(a);
    return fromPlan.length ? fromPlan : null;
  }
  if (key === "forms_today" && a.uploaded_forms.length) {
    return a.uploaded_forms.map((f) => f.name).join(", ");
  }
  return null;
}

/** Who gave the answer. Null when nobody has. */
export function answerSource(a: IntakeAnswers, key: string): HandoffSource | null {
  const q = handoffQuestion(key);
  if (!q) return null;
  const stamp = a.handoff.answers[key];
  if (q.field) {
    if (!isAnswered(answerValue(a, key))) return null;
    if (stamp) return stamp.source;
    if (a.ai_filled.includes(q.field)) return "ai";
    if (q.field === "current_process" && a.current_process_source === "ai") return "ai";
    return "sales";
  }
  if (stamp && isAnswered(stamp.value)) return stamp.source;
  // Derived from the plan or the uploads: a person put those there.
  return isAnswered(answerValue(a, key)) ? "sales" : null;
}

export const SOURCE_LABEL: Record<HandoffSource, string> = {
  sales: "Sales",
  ai: "AI, from the calls and the SOW",
  tis: "Implementation",
  customer: "Customer",
};

/* ----------------------------------------------------------------- writes */

export type Who = { source: HandoffSource; by: string | null; at: string };

/**
 * The patch that records one answer: the stamp under `handoff.answers`, and
 * the intake field itself when the question lives there. `null` clears it.
 * The caller merges it into the record (see mergeHandoffBlock).
 */
export function handoffPatch(
  key: string,
  value: HandoffValue,
  who: Who,
  quote: string | null = null,
): Record<string, unknown> {
  const q = handoffQuestion(key);
  if (!q) throw new Error(`Unknown handoff question: ${key}`);
  const stamp: HandoffAnswer | null = isAnswered(value)
    ? { value, source: who.source, at: who.at, by: who.by, quote }
    : null;
  const patch: Record<string, unknown> = { handoff: { answers: { [key]: stamp } } };
  if (q.field === "current_process") {
    patch["current_process"] = typeof value === "string" && value.trim() ? value.trim() : null;
    patch["current_process_source"] = who.source === "ai" ? "ai" : "person";
  } else if (q.field === "field_users") {
    const n = typeof value === "string" ? Number(value.replace(/[^\d]/g, "")) : NaN;
    patch["field_users"] = Number.isFinite(n) && value !== null && value !== "" ? n : null;
  }
  return patch;
}

/**
 * `handoff` merged one answer at a time: a stamp lands beside the others, a
 * null stamp removes one, and the block's own flags take the patch's value.
 * Pure, so the server's save and the customer's write agree.
 */
export function mergeHandoffBlock(
  current: IntakeAnswers["handoff"],
  patch: unknown,
): IntakeAnswers["handoff"] {
  if (!patch || typeof patch !== "object") return current;
  const p = patch as Partial<IntakeAnswers["handoff"]> & {
    answers?: Record<string, HandoffAnswer | null>;
  };
  const answers: Record<string, HandoffAnswer> = { ...current.answers };
  for (const [k, v] of Object.entries(p.answers ?? {})) {
    if (v && typeof v === "object") answers[k] = v;
    else delete answers[k];
  }
  const { answers: _ignored, ...flags } = p;
  return { ...current, ...flags, answers };
}

/* ----------------------------------------------------------------- checks */

export type HandoffStatus = "outstanding" | "sent" | "complete";

export type HandoffChecks = {
  /** Nikki's first Pre-Kickoff check: the TIS can explain what was bought, promised, by whom and when. */
  salesComplete: { done: boolean; missing: HandoffQuestion[] };
  /** The second: we have what we need from the customer. */
  customerReady: { done: boolean; missing: HandoffQuestion[]; overridden: boolean };
  status: HandoffStatus;
  /** Answers given, out of every question. */
  answered: number;
  total: number;
};

export function handoffChecks(a: IntakeAnswers): HandoffChecks {
  const missingFor = (side: HandoffSide) =>
    HANDOFF_QUESTIONS.filter((q) => q.side === side && q.required).filter((q) => {
      if (q.key === "commitments" && a.handoff.commitments_none) return false;
      return !isAnswered(answerValue(a, q.key));
    });
  const salesMissing = missingFor("sales");
  const customerMissing = missingFor("customer");
  const salesDone = Boolean(a.handoff.completed_at) || salesMissing.length === 0;
  const overridden = Boolean(a.handoff.customer_ready_override);
  const customerDone = overridden || customerMissing.length === 0;
  const answered = HANDOFF_QUESTIONS.filter((q) => isAnswered(answerValue(a, q.key))).length;
  return {
    salesComplete: { done: salesDone, missing: salesMissing },
    customerReady: { done: customerDone, missing: customerMissing, overridden },
    status:
      salesDone && customerDone
        ? "complete"
        : a.handoff.sent_to_customer_at
          ? "sent"
          : "outstanding",
    answered,
    total: HANDOFF_QUESTIONS.length,
  };
}

export const HANDOFF_STATUS_LABEL: Record<HandoffStatus, string> = {
  outstanding: "Handoff outstanding",
  sent: "Handoff with the customer",
  complete: "Handoff complete",
};

/** "Missing: the outcome, what was promised" — for a task summary. */
export function missingLine(missing: ReadonlyArray<HandoffQuestion>): string | null {
  if (!missing.length) return null;
  const names = missing.map((q) => q.label.toLowerCase());
  return `Missing: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}`;
}

/* ------------------------------------------------------ the customer's page */

export type CustomerPrompt = {
  /** "What we know so far": answers the customer may see, to confirm or correct. */
  known: Array<{ key: string; ask: string; value: HandoffValue; confirmed: boolean }>;
  /** "A few things we still need": what was asked and nobody has answered. */
  needed: Array<{ key: string; ask: string; hint: string; kind: HandoffKind }>;
};

/**
 * What the welcome page shows under "Before kickoff". Nothing until the
 * questions have been sent; then what we know (shareable answers) and what
 * we still need (the asked keys nobody has answered).
 */
export function customerPrompt(a: IntakeAnswers): CustomerPrompt | null {
  if (!a.handoff.sent_to_customer_at) return null;
  const asked = new Set(a.handoff.asked);
  const known: CustomerPrompt["known"] = [];
  const needed: CustomerPrompt["needed"] = [];
  for (const q of HANDOFF_QUESTIONS) {
    const value = answerValue(a, q.key);
    if (isAnswered(value)) {
      if (q.share)
        known.push({
          key: q.key,
          ask: q.ask,
          value,
          confirmed: answerSource(a, q.key) === "customer",
        });
    } else if (asked.has(q.key)) {
      needed.push({ key: q.key, ask: q.ask, hint: q.hint, kind: q.kind });
    }
  }
  return { known, needed };
}

/** The questions "Send the rest to the customer" offers, unanswered customer-side first. */
export function defaultAsk(a: IntakeAnswers): string[] {
  return HANDOFF_QUESTIONS.filter(
    (q) => q.share && q.side === "customer" && !isAnswered(answerValue(a, q.key)),
  ).map((q) => q.key);
}

/** The source a person's role implies when they answer. */
export function sourceForRole(role: string | null | undefined): HandoffSource {
  return role === "sales" || role === "am" ? "sales" : "tis";
}
