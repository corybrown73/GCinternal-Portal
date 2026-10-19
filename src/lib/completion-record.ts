/**
 * The completion record: what was done, frozen at the moment it was finished.
 *
 * THIS MODULE IS PURE. It takes rows already loaded and projects them into one
 * document. Nothing here queries, and nothing that renders a completion record
 * queries either — the PDF and the Salesforce note are both produced from this
 * projection, stored whole in `completion_records.content`. That is the whole
 * point: six months later "what did we build for them?" has an answer that is
 * what happened, not what the current state of nine screens says today.
 *
 * WHAT IS PUBLIC. A completion record is reachable by anyone holding its link,
 * with no login and no expiry, so it is written for a reader outside GoCanvas.
 * Only these things go into it:
 *   - the customer, project and dates in the headline,
 *   - stage names, and the dates each stage was entered and left,
 *   - commitments whose `committed_to` is exactly "customer",
 *   - work items whose `visibility` is exactly "shared".
 * Everything else is listed as withheld, in words that say it is internal. The
 * loaders read only the columns these rules can use, so the rest never reaches
 * this module. Nothing is admitted because its free text reads as harmless:
 * a field is public because it is structurally marked so, or it is not public.
 *
 * IT RECORDS ABSENCE. A section with nothing in it stays in the document and
 * says so. A completion record that silently omits "Risks" reads as a project
 * with no risks; one that says "No risks were recorded" reads as a project
 * where nobody wrote any down. A withheld section says what it holds and that
 * it is internal, so it is never read as an absence either.
 *
 * NOTHING IS SCORED. No completeness percentage, no health grade, no
 * computed verdict on how the work went. Everything in a completion record is
 * something a person recorded, reproduced.
 */

import { isCustomerCommitment } from "./commitment-status";

export type CompletionEntry = {
  title: string;
  detail?: string | null;
  meta?: Array<[string, string]>;
};

export type CompletionSection = {
  heading: string;
  /** Why this section is in the document, in one line. */
  note?: string | null;
  entries: CompletionEntry[];
  /** What the section says when nothing was recorded. Never omitted. */
  emptyNote: string;
};

export type CompletionDocument = {
  /** Bumped only if an older stored document would render wrongly under a newer renderer. */
  schema: 1;
  subject_type: "implementation" | "solution";
  subject_id: string;
  customer_name: string;
  implementation_name: string;
  /** What finished. The project's name, or the solution's. */
  title: string;
  completed_at: string;
  headline: Array<[string, string]>;
  sections: CompletionSection[];
};

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

/** A date column that may be a date, a timestamp, or nothing. Rendered as the day. */
export function day(v: unknown): string | null {
  const t = clean(v);
  if (!t) return null;
  return t.slice(0, 10);
}

const dash = (v: string | null) => v ?? "—";

export { isCustomerCommitment };

/** A task belongs in the public record only when it was shared: `visibility` is exactly "shared". */
export function isSharedWorkItem(item: { visibility?: unknown }): boolean {
  return item.visibility === "shared";
}

const isDone = (w: { status?: unknown }) => w.status === "done" || w.status === "complete";

/** A section the public record does not carry. It says what it holds and that it is internal. */
const withheld = (heading: string, emptyNote: string): CompletionSection => ({
  heading,
  note: null,
  entries: [],
  emptyNote,
});

/* --------------------------------------------------------------- the shapes
 * Loose on purpose. The loader hands over the columns it selected; this module
 * reads the ones it needs and tolerates the rest being absent, because a
 * completion record must still generate when a row is half-filled. Refusing to
 * record what was done because a field is null would be the worst possible
 * failure mode for this feature.
 */

export type Row = any;

export type ImplementationCompletionInput = {
  customerName: string;
  /** id, name, contract_start_date, created_at, go_live_at, actual_launch_date. */
  implementation: Row;
  completedAt: string;
  /** stage, entered_at, exited_at. Nothing else from stage history is read. */
  stageHistory: Row[];
  /** description, committed_to, status, made_at, due_date, fulfilled_at. */
  commitments: Row[];
  /** title, status, visibility, stage_key. */
  workItems: Row[];
  stageLabel: (key: string) => string;
};

export type SolutionCompletionInput = {
  customerName: string;
  implementationName: string;
  /** id, title, created_at. */
  solution: Row;
  completedAt: string;
};

/* --------------------------------------------------------- the two documents */

export function buildImplementationDocument(
  input: ImplementationCompletionInput,
): CompletionDocument {
  const impl = input.implementation;

  const shared = input.workItems.filter(isSharedWorkItem);
  const sharedDone = shared.filter(isDone);
  const sharedOpen = shared.filter((w) => !isDone(w));
  const customerCommitments = input.commitments.filter((c) => isCustomerCommitment(c.committed_to));

  return {
    schema: 1,
    subject_type: "implementation",
    subject_id: String(impl.id),
    customer_name: input.customerName,
    implementation_name: String(impl.name ?? "Implementation"),
    title: String(impl.name ?? "Implementation"),
    completed_at: input.completedAt,
    headline: [
      ["Customer", input.customerName],
      ["Project", String(impl.name ?? "—")],
      ["Started", dash(day(impl.contract_start_date) ?? day(impl.created_at))],
      // The Go-Live milestone first; the typed launch date when it is all there is.
      ["Actual go-live", dash(day(impl.go_live_at) ?? day(impl.actual_launch_date))],
      ["Completed", input.completedAt.slice(0, 10)],
    ],
    sections: [
      {
        heading: "How the project moved",
        note: "Each stage, and when it was entered and left.",
        emptyNote: "No stage history was recorded for this project.",
        entries: input.stageHistory.map((h) => ({
          title: input.stageLabel(String(h.stage)),
          detail: null,
          meta: [
            ["Entered", dash(day(h.entered_at))],
            ["Left", dash(day(h.exited_at))],
          ],
        })),
      },
      withheld(
        "What was built",
        "The solutions built for this project are internal and are not part of this public record.",
      ),
      withheld(
        "What the customer asked for",
        "The requirements for this project are internal and are not part of this public record.",
      ),
      withheld(
        "Decisions taken",
        "Decisions taken on this project are internal and are not part of this public record.",
      ),
      withheld(
        "Risks and issues",
        "Risks and issues on this project are internal and are not part of this public record.",
      ),
      {
        heading: "What we committed to",
        note: "Promises made to the customer during delivery.",
        emptyNote: "No commitments made to the customer were recorded for this project.",
        entries: customerCommitments.map((c) => ({
          title: clean(c.description) ?? "Commitment",
          detail: null,
          meta: [
            ["Status", String(c.status ?? "—")],
            ["Made", dash(day(c.made_at))],
            ["Due", dash(day(c.due_date))],
            ["Fulfilled", dash(day(c.fulfilled_at))],
          ],
        })),
      },
      withheld(
        "What the customer signed off",
        "Sign-off records for this project are internal and are not part of this public record.",
      ),
      withheld(
        "What success was measured against",
        "The success criteria for this project are internal and are not part of this public record.",
      ),
      {
        heading: "The plan, as completed",
        note:
          shared.length === 0
            ? null
            : `${sharedDone.length} of ${shared.length} shared task(s) were ticked. ${
                sharedOpen.length === 0
                  ? "No shared task was left open."
                  : `${sharedOpen.length} shared task(s) were still open at completion, listed below.`
              }`,
        emptyNote:
          shared.length === 0
            ? "No tasks were shared with the customer for this project."
            : "No shared tasks were open at completion.",
        entries: sharedOpen.map((w) => ({
          title: String(w.title),
          detail: null,
          meta: [
            ["Stage", dash(clean(input.stageLabel(String(w.stage_key ?? ""))))],
            ["Status at completion", String(w.status ?? "—")],
          ],
        })),
      },
    ],
  };
}

export function buildSolutionDocument(input: SolutionCompletionInput): CompletionDocument {
  const s = input.solution;

  return {
    schema: 1,
    subject_type: "solution",
    subject_id: String(s.id),
    customer_name: input.customerName,
    implementation_name: input.implementationName,
    title: String(s.title),
    completed_at: input.completedAt,
    headline: [
      ["Customer", input.customerName],
      ["Project", input.implementationName],
      ["Solution", String(s.title)],
      ["Started", dash(day(s.created_at))],
      ["Completed", input.completedAt.slice(0, 10)],
    ],
    sections: [
      withheld(
        "What it does",
        "What this solution does is internal and is not part of this public record.",
      ),
      withheld(
        "How it is set up",
        "How this solution is set up is internal and is not part of this public record.",
      ),
      withheld(
        "Field mapping",
        "The field mappings for this solution are internal and are not part of this public record.",
      ),
      withheld(
        "The build log",
        "Engineering build notes are internal and are not part of this public record.",
      ),
      withheld(
        "Decisions taken",
        "Decisions taken on this solution are internal and are not part of this public record.",
      ),
      withheld(
        "Proof it works",
        "The evidence for this solution is internal and is not part of this public record.",
      ),
      withheld(
        "Sign-off",
        "Sign-off records for this solution are internal and are not part of this public record.",
      ),
    ],
  };
}

/* ------------------------------------------------------ the Salesforce note */

/** Salesforce's Note body caps at 32,000 characters. Leave room for the tail. */
export const NOTE_BODY_LIMIT = 31_000;

/**
 * The same document as prose, for the body of a Salesforce note.
 *
 * Stored beside the JSON rather than derived when the webhook fires, so what
 * was filed and what the PDF shows can never disagree. If it does not fit, it
 * is cut at a section boundary and says so — a note that ends mid-sentence
 * reads as data loss, one that says what was cut and where to read the rest
 * reads as a summary.
 */
export function summaryText(doc: CompletionDocument, documentUrl: string): string {
  const head = [
    doc.subject_type === "solution"
      ? `Solution complete — ${doc.title}`
      : `Implementation complete — ${doc.title}`,
    "",
    ...doc.headline.map(([k, v]) => `${k}: ${v}`),
    "",
    `Full record: ${documentUrl}`,
  ].join("\n");

  const blocks = doc.sections.map((section) => {
    const lines = [`— ${section.heading} —`];
    if (section.entries.length === 0) {
      lines.push(section.emptyNote);
    } else {
      for (const e of section.entries) {
        lines.push(`• ${e.title}`);
        if (e.detail) lines.push(`  ${e.detail.replace(/\s*\n\s*/g, " ")}`);
        for (const [k, v] of e.meta ?? []) lines.push(`  ${k}: ${v}`);
      }
    }
    return lines.join("\n");
  });

  let out = head;
  let cut = 0;
  for (const block of blocks) {
    if (out.length + block.length + 2 > NOTE_BODY_LIMIT) {
      cut += 1;
      continue;
    }
    out = `${out}\n\n${block}`;
  }
  if (cut > 0) {
    out = `${out}\n\n${cut} further section(s) did not fit in a Salesforce note. The full record is at ${documentUrl}`;
  }
  return out;
}
