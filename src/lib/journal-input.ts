import { z } from "zod";

/**
 * Working notes on an implementation. The stage is never a form field — the
 * server stamps whichever stage the implementation is in when the note is
 * written, so historical notes stay attached to the stage they belong to.
 */
export const JOURNAL_KINDS = [
  "note",
  "scope",
  "customer",
  "internal_delivery",
  "customer_meeting",
] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];

/**
 * The exception kinds, listed explicitly. A kind is an exception only if it is
 * in this list: a new kind (such as a customer meeting) is never one by default.
 */
export const EXCEPTION_JOURNAL_KINDS = ["scope", "customer", "internal_delivery"] as const;
export type ExceptionJournalKind = (typeof EXCEPTION_JOURNAL_KINDS)[number];

export function isExceptionKind(kind: JournalKind): kind is ExceptionJournalKind {
  return (EXCEPTION_JOURNAL_KINDS as readonly string[]).includes(kind);
}

/** What the Add-note form may write: a plain note, or one of the exceptions. */
export const NOTE_FORM_KINDS = ["note", ...EXCEPTION_JOURNAL_KINDS] as const;

export const createJournalEntryInput = z.object({
  implementationId: z.string().uuid(),
  note: z.string().trim().min(1),
  authorId: z.string().uuid().nullable(),
  /** One link per line. */
  links: z.string().trim().min(1).nullable(),
  attachmentUrl: z.string().trim().min(1).nullable(),
  attachmentName: z.string().trim().min(1).nullable(),
  /**
   * A plain note, or an exception of the operating model's three kinds:
   * Scope (it was sold or scoped wrong), Customer (their side is the delay),
   * Internal delivery (ours is). Customer meetings have their own form.
   */
  kind: z.enum(NOTE_FORM_KINDS).default("note"),
});

export const JOURNAL_KIND_LABEL: Record<JournalKind, string> = {
  note: "Note",
  scope: "Exception — Scope",
  customer: "Exception — Customer",
  internal_delivery: "Exception — Internal delivery",
  customer_meeting: "Customer meeting",
};

const MAX_PARTICIPANTS = 500;
const MAX_MEETING_NOTE = 20000;

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * A customer meeting recorded without a transcript. Saving it writes one
 * journal entry and nothing else: no risk, issue, decision, commitment, date
 * change or stage move comes from it.
 */
export const customerMeetingInput = z.object({
  implementationId: z.string().uuid(),
  meetingDate: z
    .string()
    .refine(isCalendarDate, "Enter the date the meeting happened, as YYYY-MM-DD."),
  /** Optional: who was on the call, as typed. */
  participants: z
    .string()
    .trim()
    .max(MAX_PARTICIPANTS)
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  note: z.string().trim().min(1, "Write what was discussed.").max(MAX_MEETING_NOTE),
});

export type CustomerMeetingInput = z.infer<typeof customerMeetingInput>;

export type CreateJournalEntryInput = z.infer<typeof createJournalEntryInput>;

/** File handed to the server as base64 — POC scale only. */
export const uploadAttachmentInput = z.object({
  folder: z.enum(["sow", "notes", "solution"]),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(200),
  /** ~6 MB of base64 ≈ 4.5 MB of file. */
  dataBase64: z.string().min(1).max(6_500_000),
});

export const attachmentPathInput = z.object({ path: z.string().trim().min(1) });

export function splitLinks(links: string | null | undefined): string[] {
  if (!links) return [];
  return links
    .split(/[\n,]/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * A customer's logo.
 *
 * Deliberately narrower than the general attachment input: a fixed set of
 * image types and a small ceiling, because this is a brand mark rendered at
 * 28px, not a document. Accepting anything here would make the private
 * customer-branding bucket a general file drop that happens to be reachable
 * from a customer record.
 *
 * SVG is excluded on purpose. It is a document format that can carry script,
 * and it would be served from a signed URL on our own origin.
 */
export const uploadCustomerLogoInput = z.object({
  /**
   * A customer, or the deal that will become one. The logo is wanted on the
   * kickoff deck, which is built pre-sale from the deal — waiting for a
   * customer row means the one document that most needs the logo never has it.
   * Carried into customers.logo_path at handoff (0045).
   */
  subject: z.enum(["customer", "deal"]),
  customerId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  /** ~1.4 MB of base64 ≈ 1 MB of image. Generous for a logo. */
  dataBase64: z.string().min(1).max(1_400_000),
});
