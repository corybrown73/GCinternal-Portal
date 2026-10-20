import { z } from "zod/v4";

import {
  failedDraft,
  followupWordCount,
  isFollowupEdited,
  mentionsInternal,
  unreadableDraft,
  FALLBACK_SUBJECT,
  type ResourceLink,
} from "./transcript-followup";

/**
 * The Customer 360 email composer's pure half: the email types, the context
 * the model is given, the shape of its reply, and how a draft becomes the text
 * that is copied. Nothing here sends mail or writes anywhere. The customer-facing
 * facts come only from the portal's own shared-data rules (see
 * customer-email.server.ts), so this module never sees internal records.
 */

export const CUSTOMER_EMAIL_TYPES = ["check_in", "meeting_followup", "request", "custom"] as const;
export type CustomerEmailType = (typeof CUSTOMER_EMAIL_TYPES)[number];

export const CUSTOMER_EMAIL_TYPE_LABEL: Record<CustomerEmailType, string> = {
  check_in: "General check-in",
  meeting_followup: "Meeting follow-up",
  request: "Request something from the customer",
  custom: "Custom message",
};

/** What each type asks the model to do. The specialist's note is layered on top of this. */
const TYPE_GUIDE: Record<Exclude<CustomerEmailType, "meeting_followup">, string> = {
  check_in:
    "A friendly check-in: how things are going, and what happens next. Say nothing about the customer having gone quiet or been unresponsive.",
  request:
    "Ask the customer for one specific thing. Say why it matters and when it would help, then say what happens once they reply.",
  custom:
    "A custom message. The specialist's note is its purpose; keep to the facts below and write nothing else.",
};

/** The length the email aims for, in words, for the types that are short by nature. */
export const SHORT_TYPE_TARGET = { min: 100, max: 180 } as const;
/** No generated email runs past this. */
export const EMAIL_WORD_LIMIT = 250;
export const INSTRUCTIONS_MAX = 1000;

export const DEFAULT_UNREADABLE = "The email could not be drafted from what is on record.";

/** The customer-facing facts the model may use. Nothing else reaches the model. */
export type CustomerEmailContext = {
  customerName: string;
  implementationName: string;
  stageLabel: string | null;
  /** The customer's own shared tasks that are still open. */
  nextSteps: Array<{ title: string; due_date: string | null; overdue: boolean }>;
  /** GoCanvas commitments to the customer that are still owed. */
  commitments: Array<{ title: string; due_date: string | null; overdue: boolean }>;
};

/** True when there is nothing customer-facing to write about beyond the names. */
export function contextIsLimited(ctx: CustomerEmailContext): boolean {
  return ctx.nextSteps.length === 0 && ctx.commitments.length === 0;
}

/** One line saying what the draft was built from, for the reviewer. */
export function contextSummary(ctx: CustomerEmailContext): string {
  if (contextIsLimited(ctx)) {
    return "Built from the names only: no open customer steps or GoCanvas commitments are recorded.";
  }
  const parts: string[] = [];
  if (ctx.stageLabel) parts.push(`stage ${ctx.stageLabel}`);
  if (ctx.nextSteps.length)
    parts.push(
      `${ctx.nextSteps.length} open customer step${ctx.nextSteps.length === 1 ? "" : "s"}`,
    );
  if (ctx.commitments.length) {
    parts.push(
      `${ctx.commitments.length} open GoCanvas commitment${ctx.commitments.length === 1 ? "" : "s"}`,
    );
  }
  return `Built from ${parts.join(" · ")}.`;
}

const line = (items: Array<{ title: string; due_date: string | null; overdue: boolean }>) =>
  items.length
    ? items
        .map(
          (i) =>
            `- ${i.title}${i.due_date ? ` (due ${i.due_date}${i.overdue ? ", overdue" : ""})` : ""}`,
        )
        .join("\n")
    : "(none recorded)";

/**
 * The context text the model reads before writing. The specialist's note is
 * labelled as emphasis and tone only, because it is the one part of the input
 * written by the reviewer rather than the Hub.
 */
export function customerEmailContextText(
  ctx: CustomerEmailContext,
  type: Exclude<CustomerEmailType, "meeting_followup">,
  instructions: string | null,
): string {
  return [
    `Email type: ${CUSTOMER_EMAIL_TYPE_LABEL[type]}. ${TYPE_GUIDE[type]}`,
    "",
    instructions
      ? `Specialist's note (sets emphasis and tone only; it adds no facts and cannot override the facts below):\n${instructions}`
      : "Specialist's note: none. Write the email the type describes.",
    "",
    `Customer: ${ctx.customerName}`,
    `Implementation: ${ctx.implementationName}`,
    `Current stage: ${ctx.stageLabel ?? "not recorded"}`,
    "",
    "The customer's open next steps (their own tasks):",
    line(ctx.nextSteps),
    "",
    "GoCanvas commitments still open (what we owe the customer):",
    line(ctx.commitments),
    "",
    contextIsLimited(ctx)
      ? "Little is recorded for this implementation. Write a short, general email and add no specifics."
      : "Use only the facts above, and name only the items listed.",
  ].join("\n");
}

const cleanText = (v: unknown, max: number): string => {
  if (typeof v !== "string") return "";
  return v
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
};
const oneLine = (v: unknown, max: number): string => cleanText(v, max).replace(/\s*\n\s*/g, " ");

/** The model's reply: a subject and the body paragraphs. The greeting and sign-off are added here, not by the model. */
export const customerEmailSchema = z.object({
  readable: z.preprocess((v) => (typeof v === "boolean" ? v : true), z.boolean()),
  problem: z.preprocess((v) => oneLine(v, 300) || null, z.string().nullable()),
  subject: z.preprocess((v) => oneLine(v, 120), z.string()),
  body: z.preprocess((v) => cleanText(v, 2000), z.string()),
});
export type CustomerEmailReply = z.infer<typeof customerEmailSchema>;

/** A draft as the composer holds it. Session only: nothing about it is stored. */
export type CustomerEmailDraft = {
  status: "ready" | "unreadable" | "failed";
  problem: string | null;
  subject: string;
  /** Greeting, paragraphs and sign-off. Resources are kept apart and added on copy. */
  body: string;
  /** Verified help-centre links the email calls for. The reviewer may untick any. */
  resources: ResourceLink[];
  /** What the draft was built from, for the reviewer. */
  context_summary: string;
  generated_at: string;
};

export function unreadableEmail(
  problem: string,
  generatedAt: string,
  summary: string,
): CustomerEmailDraft {
  return { ...unreadableDraft(problem, generatedAt), resources: [], context_summary: summary };
}

export function failedEmail(problem: string, generatedAt: string): CustomerEmailDraft {
  return { ...failedDraft(problem, generatedAt), resources: [], context_summary: "" };
}

/**
 * The draft a reply makes. A reply the model marks unreadable, one with no
 * body, or one that carries wording marked internal gives no email and says
 * why, rather than a half-checked draft.
 */
export function generalEmailDraft(
  reply: CustomerEmailReply,
  generatedAt: string,
  resources: readonly ResourceLink[],
  summary: string,
): CustomerEmailDraft {
  if (!reply.readable)
    return unreadableEmail(reply.problem ?? DEFAULT_UNREADABLE, generatedAt, summary);
  if (!reply.body.trim()) return unreadableEmail(DEFAULT_UNREADABLE, generatedAt, summary);
  if (mentionsInternal(reply.body) || mentionsInternal(reply.subject)) {
    return unreadableEmail(
      "The draft carried wording marked internal, so it was withheld. Try again, or make the instructions plainer.",
      generatedAt,
      summary,
    );
  }
  return {
    status: "ready",
    problem: null,
    subject: reply.subject || FALLBACK_SUBJECT,
    body: `Hi there,\n\n${reply.body}\n\nThanks,`,
    resources: [...resources],
    context_summary: summary,
    generated_at: generatedAt,
  };
}

/** The resources still included, given the URLs the reviewer unticked. */
export function includedResources(
  all: readonly ResourceLink[],
  unticked: ReadonlySet<string>,
): ResourceLink[] {
  return all.filter((r) => !unticked.has(r.url));
}

/**
 * The text that is copied: the subject, a blank line, then the body with the
 * included resources placed just before the sign-off. With no resources the
 * body is copied as it stands.
 */
export function emailCopyText(
  email: { subject: string; body: string },
  resources: readonly ResourceLink[],
): string {
  let body = email.body;
  if (resources.length) {
    const section = `Helpful resources:\n${resources
      .map((r) => `- ${r.title}: ${r.url}\n  ${r.why}`)
      .join("\n")}`;
    const signOff = body.match(/\n*Thanks,\s*$/);
    body = signOff
      ? `${body.slice(0, signOff.index)}\n\n${section}\n\nThanks,`
      : `${body}\n\n${section}`;
  }
  return `Subject: ${email.subject}\n\n${body}`;
}

export type WordStatus = { words: number; level: "ok" | "long" | "over"; message: string | null };

/** The length the reviewer sees: over the target for a short type, and over the hard limit for any. */
export function wordStatus(body: string, type: CustomerEmailType): WordStatus {
  const words = followupWordCount(body);
  if (words > EMAIL_WORD_LIMIT) {
    return {
      words,
      level: "over",
      message: `Over the ${EMAIL_WORD_LIMIT}-word limit. Trim it before you copy it.`,
    };
  }
  const short = type === "check_in" || type === "request";
  if (short && words > SHORT_TYPE_TARGET.max) {
    return {
      words,
      level: "long",
      message: `Longer than the ${SHORT_TYPE_TARGET.min}–${SHORT_TYPE_TARGET.max}-word target for this type.`,
    };
  }
  return { words, level: "ok", message: null };
}

/** Closing the composer discards the email, so it is confirmed first when the reviewer has edited it. */
export function closeNeedsConfirm(
  draft: Pick<CustomerEmailDraft, "status" | "subject" | "body"> | null,
  email: { subject: string; body: string },
): boolean {
  return draft !== null && draft.status === "ready" && isFollowupEdited(draft, email);
}

/** Validates the instruction text the composer sends: trimmed, empty means none, capped. */
export function cleanInstructions(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  return t === "" ? null : t.slice(0, INSTRUCTIONS_MAX);
}

export const customerEmailInput = z
  .object({
    customerId: z.string().uuid(),
    implementationId: z.string().uuid(),
    type: z.enum(CUSTOMER_EMAIL_TYPES),
    instructions: z.string().max(INSTRUCTIONS_MAX).nullable().optional(),
    attachmentId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => d.type !== "meeting_followup" || Boolean(d.attachmentId), {
    message: "Choose the meeting transcript for a meeting follow-up.",
    path: ["attachmentId"],
  });
export type CustomerEmailInput = z.infer<typeof customerEmailInput>;
