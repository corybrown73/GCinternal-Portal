import { z } from "zod/v4";

import {
  FEATURE_LEXICON,
  featuresIn,
  isNoise,
  keywords,
  rankArticles,
  type HelpArticle,
} from "./help-articles";

/**
 * The suggested follow-up email after a customer meeting, drafted from its
 * transcript. A draft is text for the Implementation Specialist to read,
 * edit and send from their own mail: nothing here sends it, and nothing here
 * writes to the implementation. Pure, so the server and the panel agree on
 * the shape, the safeguards and the text shown.
 */

export type FollowupStatus = "ready" | "unreadable" | "failed";

export type FollowupDraft = {
  status: FollowupStatus;
  /** Why there is no email when status is not ready: the model's reason, or what went wrong. */
  problem: string | null;
  subject: string;
  /** Plain text, greeting to sign-off. The reviewer edits it; it is never sent from here. */
  body: string;
  /** How many points were left out because the transcript marked them internal. */
  withheld: number;
  generated_at: string;
};

/** A reading's follow-up as the panel lists it: the transcript it came from, and its draft when one exists. */
export type TranscriptFollowup = {
  attachment_id: string;
  title: string | null;
  at: string | null;
  draft: FollowupDraft | null;
};

const MAX_ITEMS = 6;
const MAX_ITEM = 200;
const MAX_RECAP = 400;
const MAX_SUBJECT = 120;

/** Resource links per email: at most this many, and only ones the email's own points call for. */
export const MAX_RESOURCES = 2;
/** The length the email aims for, and the most it should run to, counted without the sign-off. */
export const WORD_GUIDE = 250;

export const FALLBACK_SUBJECT = "Following up on our meeting";
export const UNREADABLE_PROBLEM =
  "The transcript did not hold enough to draft a follow-up email from.";
const INTERNAL_ONLY_PROBLEM =
  "Everything the transcript could be drafted from was marked internal, so there is nothing to send the customer.";

/** One line of model text: whitespace collapsed, a leading bullet or number dropped, cut to `max`. */
function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/\s+/g, " ")
    .replace(/^(?:[-•*]|\d+[.)])\s+/, "")
    .trim()
    .slice(0, max);
}

const textLine = (max: number) => z.preprocess((v) => cleanText(v, max), z.string());

/** A list of points: empty entries dropped, the list capped. A non-list is an empty list. */
const itemList = z.preprocess(
  (v) =>
    Array.isArray(v)
      ? v
          .map((x) => cleanText(x, MAX_ITEM))
          .filter((s) => s !== "")
          .slice(0, MAX_ITEMS)
      : [],
  z.array(z.string()),
);

/**
 * The model's reply. Lenient on purpose: a missing key reads as empty, so a
 * slightly off reply still yields a draft or a clear reason, not a crash.
 */
export const followupEmailSchema = z.object({
  readable: z.preprocess((v) => (typeof v === "boolean" ? v : true), z.boolean()),
  problem: z.preprocess((v) => cleanText(v, MAX_ITEM) || null, z.string().nullable()),
  subject: textLine(MAX_SUBJECT),
  recipient_name: z.preprocess((v) => cleanText(v, 60) || null, z.string().nullable()),
  recap: textLine(MAX_RECAP),
  decisions: itemList,
  gocanvas_next_steps: itemList,
  customer_next_steps: itemList,
  agreed_dates: itemList,
  open_questions: itemList,
});
export type FollowupReply = z.infer<typeof followupEmailSchema>;

/**
 * Words that mark a point as internal. Such a point never reaches the
 * customer's draft; the draft says how many were left out.
 */
const INTERNAL_MARK =
  /\b(internal only|internal use|for internal|off the record|off-record|do not share|don'?t share|not for the customer|between us|team only)\b/i;

const isInternal = (s: string) => INTERNAL_MARK.test(s);

/** Whether text carries a word that marks it internal. Used to keep a draft from carrying one. */
export const mentionsInternal = isInternal;

/** A comparable form of a line, so the same point written twice is recognised. */
const comparable = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type CustomerPoints = {
  recap: string;
  decisions: string[];
  gocanvas: string[];
  customer: string[];
  dates: string[];
  /** Raised but not settled. A point also listed as a decision is not repeated here. */
  open: string[];
  withheld: number;
};

/**
 * What the customer may see, from a reply: internal points withheld and
 * counted, and a confirmed decision never also listed as an open question.
 */
export function customerPoints(reply: FollowupReply): CustomerPoints {
  let withheld = 0;
  const keep = (items: string[]) =>
    items.filter((s) => {
      if (!isInternal(s)) return true;
      withheld += 1;
      return false;
    });
  let recap = reply.recap;
  if (isInternal(recap)) {
    withheld += 1;
    recap = "";
  }
  const decisions = keep(reply.decisions);
  const confirmed = new Set(decisions.map(comparable));
  const open = keep(reply.open_questions).filter((s) => !confirmed.has(comparable(s)));
  return {
    recap,
    decisions,
    gocanvas: keep(reply.gocanvas_next_steps),
    customer: keep(reply.customer_next_steps),
    dates: keep(reply.agreed_dates),
    open,
    withheld,
  };
}

function hasSubstance(p: CustomerPoints): boolean {
  return (
    Boolean(p.recap) ||
    [p.decisions, p.gocanvas, p.customer, p.dates, p.open].some((list) => list.length > 0)
  );
}

const SECTIONS: Array<
  [string, keyof Pick<CustomerPoints, "decisions" | "gocanvas" | "customer" | "dates" | "open">]
> = [
  ["Decisions we agreed", "decisions"],
  ["Next steps for GoCanvas", "gocanvas"],
  ["Next steps for you", "customer"],
  ["Dates we agreed", "dates"],
  ["Still to confirm", "open"],
];

/** A help-centre article the email points to. Its URL comes from the synced catalogue, never from the model. */
export type ResourceLink = { title: string; url: string; why: string };

/** Only the GoCanvas help centre, over https: nothing else is a resource this email may link to. */
export function isApprovedResourceUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "help.gocanvas.com";
  } catch {
    return false;
  }
}

/** The customer-safe text of a reply, the only text a resource may be matched against. */
export function resourceSourceText(reply: FollowupReply): string {
  const p = customerPoints(reply);
  return [p.recap, ...p.decisions, ...p.gocanvas, ...p.customer, ...p.dates, ...p.open].join("\n");
}

/**
 * The help articles an email calls for. An article qualifies only when its
 * title shares a word with what the email says AND the email names a feature
 * the article's category teaches; the description says which. Release notes
 * and legacy pages are out. Returns at most MAX_RESOURCES, possibly none:
 * a generic article is never added to fill space.
 */
export function pickResourceLinks(
  text: string,
  articles: readonly HelpArticle[],
  max = MAX_RESOURCES,
): ResourceLink[] {
  const words = keywords(text);
  const named = featuresIn(text);
  const out: ResourceLink[] = [];
  const seen = new Set<string>();
  for (const a of rankArticles(text, [...articles], 40)) {
    if (out.length >= max) break;
    if (isNoise(a) || !isApprovedResourceUrl(a.url) || seen.has(a.url)) continue;
    if (![...keywords(a.title)].some((w) => words.has(w))) continue;
    const feature = FEATURE_LEXICON.find(
      (f) => named.includes(f.feature) && f.categories.includes(a.category),
    )?.feature;
    if (!feature) continue;
    seen.add(a.url);
    out.push({
      title: a.title,
      url: a.url,
      why: `Useful for ${feature}, which came up in the meeting.`,
    });
  }
  return out;
}

/** The resources for one reply, matched on what the customer will read. */
export function resourcesForReply(
  reply: FollowupReply,
  articles: readonly HelpArticle[],
): ResourceLink[] {
  return pickResourceLinks(resourceSourceText(reply), articles);
}

/**
 * The plain-text body: greeting, recap, then each section that has something
 * in it, in a fixed order, then the resources in one compact section. A
 * section with nothing in it is left out, never printed empty. The sign-off
 * has no name: the sender adds their own.
 */
export function composeFollowupBody(
  p: CustomerPoints,
  recipientName: string | null,
  resources: readonly ResourceLink[] = [],
): string {
  const parts: string[] = [`Hi ${recipientName ?? "there"},`];
  if (p.recap) parts.push(p.recap);
  for (const [heading, key] of SECTIONS) {
    const items = p[key];
    if (items.length) parts.push(`${heading}:\n${items.map((s) => `- ${s}`).join("\n")}`);
  }
  if (resources.length) {
    parts.push(
      `Helpful resources:\n${resources.map((r) => `- ${r.title}: ${r.url}\n  ${r.why}`).join("\n")}`,
    );
  }
  parts.push("Thanks,");
  return parts.join("\n\n");
}

/** Words in the email, not counting the sign-off, which the sender writes. */
export function followupWordCount(body: string): number {
  const withoutSignOff = body.replace(/\n*Thanks,\s*$/, "");
  return withoutSignOff.split(/\s+/).filter((w) => w !== "").length;
}

export function unreadableDraft(problem: string, generatedAt: string): FollowupDraft {
  return {
    status: "unreadable",
    problem,
    subject: "",
    body: "",
    withheld: 0,
    generated_at: generatedAt,
  };
}

export function failedDraft(problem: string, generatedAt: string): FollowupDraft {
  return {
    status: "failed",
    problem,
    subject: "",
    body: "",
    withheld: 0,
    generated_at: generatedAt,
  };
}

/**
 * The draft a reply makes. A reply the model marked unreadable, or one with
 * nothing customer-safe in it, gives no email and says why. Never invents a
 * point to fill a section.
 */
export function draftFromReply(
  reply: FollowupReply,
  generatedAt: string,
  resources: readonly ResourceLink[] = [],
): FollowupDraft {
  if (!reply.readable) return unreadableDraft(reply.problem ?? UNREADABLE_PROBLEM, generatedAt);
  const points = customerPoints(reply);
  if (!hasSubstance(points)) {
    return unreadableDraft(
      points.withheld > 0 ? INTERNAL_ONLY_PROBLEM : UNREADABLE_PROBLEM,
      generatedAt,
    );
  }
  const subject = reply.subject && !isInternal(reply.subject) ? reply.subject : FALLBACK_SUBJECT;
  return {
    status: "ready",
    problem: null,
    subject,
    body: composeFollowupBody(points, reply.recipient_name, resources),
    withheld: points.withheld,
    generated_at: generatedAt,
  };
}

/** The context the email call is given: the customer, the implementation, the file. Nothing from the Hub's risk or issue records. */
export function followupContextText(ctx: {
  customerName: string;
  implementationName: string;
  fileTitle: string | null;
  uploadedOn: string | null;
}): string {
  return [
    "Context for the email (the meeting transcript follows):",
    `Customer: ${ctx.customerName}`,
    `Implementation: ${ctx.implementationName}`,
    `Transcript file: ${ctx.fileTitle ?? "untitled"}, uploaded ${ctx.uploadedOn ?? "unknown date"}`,
  ].join("\n");
}

/** The email as one block of text, for copying: the subject line, a blank line, the body. */
export function followupEmailText(email: { subject: string; body: string }): string {
  return `Subject: ${email.subject}\n\n${email.body}`;
}

/** Whether the reviewer has changed the suggested subject or body. */
export function isFollowupEdited(
  draft: Pick<FollowupDraft, "subject" | "body">,
  email: { subject: string; body: string },
): boolean {
  return draft.subject !== email.subject || draft.body !== email.body;
}

const storedDraft = z.object({
  status: z.enum(["ready", "unreadable", "failed"]),
  problem: z.string().nullable(),
  subject: z.string(),
  body: z.string(),
  withheld: z.number(),
  generated_at: z.string(),
});

/** A draft as the job row keeps it; null for a reading that has none (one from before this feature, or still running). */
export function storedFollowupDraft(v: unknown): FollowupDraft | null {
  const parsed = storedDraft.safeParse(v);
  return parsed.success ? parsed.data : null;
}
