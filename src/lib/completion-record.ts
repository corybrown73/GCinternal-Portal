/**
 * The completion record: what was actually done, frozen at the moment it was
 * finished.
 *
 * THIS MODULE IS PURE. It takes rows already loaded and projects them into one
 * document. Nothing here queries, and nothing that renders a completion record
 * queries either — the PDF and the Salesforce note are both produced from this
 * projection, stored whole in `completion_records.content`. That is the whole
 * point: six months later "what did we build for them?" has an answer that is
 * what happened, not what the current state of nine screens says today.
 *
 * IT RECORDS ABSENCE. A section with nothing in it stays in the document and
 * says so. A completion record that silently omits "Risks" reads as a project
 * with no risks; one that says "No risks were recorded" reads as a project
 * where nobody wrote any down. Those are very different facts and only one of
 * them is true.
 *
 * NOTHING IS SCORED. No completeness percentage, no health grade, no
 * computed verdict on how the work went. Everything in a completion record is
 * something a person recorded, reproduced.
 */

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

/* --------------------------------------------------------------- the shapes
 * Loose on purpose. The loader hands over whatever the table has; this module
 * reads the columns it needs and tolerates the rest being absent, because a
 * completion record must still generate when a row is half-filled. Refusing to
 * record what was done because a field is null would be the worst possible
 * failure mode for this feature.
 */

export type Row = any;

export type ImplementationCompletionInput = {
  customerName: string;
  implementation: Row;
  completedAt: string;
  /** team_members id → name, so the document names people rather than uuids. */
  named: (id: string | null | undefined) => string | null;
  stageHistory: Row[];
  solutions: Row[];
  mappingCountBySolution: Map<string, number>;
  requirements: Row[];
  decisions: Row[];
  risks: Row[];
  issues: Row[];
  commitments: Row[];
  approvals: Row[];
  successCriteria: Row[];
  workItems: Row[];
  stageLabel: (key: string) => string;
};

export type SolutionCompletionInput = {
  customerName: string;
  implementationName: string;
  solution: Row;
  completedAt: string;
  named: (id: string | null | undefined) => string | null;
  notes: Row[];
  mappings: Row[];
  decisions: Row[];
  approvals: Row[];
  evidence: Row[];
  requirementTitle: string | null;
};

/* --------------------------------------------------------- the two documents */

export function buildImplementationDocument(
  input: ImplementationCompletionInput,
): CompletionDocument {
  const impl = input.implementation;
  const n = input.named;

  const done = input.workItems.filter((w) => w.status === "done" || w.status === "complete");
  const notDone = input.workItems.filter((w) => !(w.status === "done" || w.status === "complete"));
  const overrides = input.stageHistory.filter((h) => h.advanced_with_gaps);

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
      ["Type", dash(clean(impl.journey_type))],
      ["Tier", dash(clean(impl.tier))],
      ["Started", dash(day(impl.contract_start_date) ?? day(impl.created_at))],
      ["Target launch", dash(day(impl.target_launch_date))],
      ["Actual launch", dash(day(impl.actual_launch_date))],
      ["Completed", input.completedAt.slice(0, 10)],
      ["Implementation lead", dash(n(impl.owner_id))],
      ["Sold by", dash(clean(impl.sales_owner) ?? n(impl.sales_owner_id))],
    ],
    sections: [
      {
        heading: "How the project moved",
        note: "Each stage, when it was entered, and by whom.",
        emptyNote: "No stage history was recorded for this project.",
        entries: input.stageHistory.map((h) => ({
          title: input.stageLabel(String(h.stage)),
          detail: clean(h.notes),
          meta: [
            ["Entered", dash(day(h.entered_at))],
            ["Left", dash(day(h.exited_at))],
            ["By", dash(clean(h.entered_by))],
            ...(h.advanced_with_gaps
              ? ([["Moved on with criteria outstanding", "Yes"]] as Array<[string, string]>)
              : []),
          ],
        })),
      },
      {
        heading: "What was built",
        note: "Each solution the engineers delivered on this account.",
        emptyNote: "No solutions were recorded against this project.",
        entries: input.solutions.map((s) => ({
          title: String(s.title),
          detail: clean(s.design_summary),
          meta: [
            ["Status at completion", String(s.status ?? "—")],
            ["Built by", dash(n(s.owner_id))],
            ["Field mappings", String(input.mappingCountBySolution.get(String(s.id)) ?? 0)],
            ["How it is set up", dash(clean(s.configuration_details))],
          ],
        })),
      },
      {
        heading: "What the customer asked for",
        note: "The requirements this work answered to.",
        emptyNote: "No requirements were recorded for this project.",
        entries: input.requirements.map((r) => ({
          title: String(r.title),
          detail: clean(r.description),
          meta: [
            ["Status", String(r.status ?? "—")],
            ["Priority", dash(clean(r.priority))],
            ["Scope", dash(clean(r.scope_status))],
            ["Category", dash(clean(r.category))],
          ],
        })),
      },
      {
        heading: "Decisions taken",
        note: "What was settled along the way, and by whom.",
        emptyNote: "No decisions were recorded for this project.",
        entries: input.decisions.map((d) => ({
          title: String(d.title),
          detail: clean(d.description),
          meta: [
            ["Decided", dash(day(d.decision_date) ?? day(d.created_at))],
            ["By", dash(clean(d.decided_by))],
            ["Status", String(d.status ?? "—")],
            ["Why", dash(clean(d.rationale))],
          ],
        })),
      },
      {
        heading: "Risks and issues",
        note: "What was raised, and how each one ended.",
        emptyNote: "No risks or issues were recorded for this project.",
        entries: [
          ...input.risks.map((r) => ({
            title: `Risk — ${String(r.title)}`,
            detail: clean(r.description),
            meta: [
              ["Status", String(r.status ?? "—")],
              ["Raised", dash(day(r.identified_at))],
              ["Resolved", dash(day(r.resolved_at))],
              ["Severity", dash(clean(r.severity))],
              // A risk records the mitigation, not a resolution — the column
              // an issue has and a risk does not.
              ["What was done about it", dash(clean(r.mitigation))],
            ] as Array<[string, string]>,
          })),
          ...input.issues.map((i) => ({
            title: `Issue — ${String(i.title)}`,
            detail: clean(i.description),
            meta: [
              ["Status", String(i.status ?? "—")],
              ["Raised", dash(day(i.raised_at))],
              ["Resolved", dash(day(i.resolved_at))],
              ["Severity", dash(clean(i.severity))],
              ["How it ended", dash(clean(i.resolution))],
            ] as Array<[string, string]>,
          })),
        ],
      },
      {
        heading: "What we committed to",
        note: "Promises made to the customer during delivery.",
        emptyNote: "No commitments were recorded for this project.",
        entries: input.commitments.map((c) => ({
          title: clean(c.description) ?? "Commitment",
          detail: null,
          meta: [
            ["Made to", dash(clean(c.committed_to))],
            ["Status", String(c.status ?? "—")],
            ["Made", dash(day(c.made_at))],
            ["Due", dash(day(c.due_date))],
            ["Fulfilled", dash(day(c.fulfilled_at))],
            ["Owner", dash(n(c.owner_id))],
          ],
        })),
      },
      {
        heading: "What the customer signed off",
        emptyNote: "No approvals were recorded for this project.",
        entries: input.approvals.map((a) => ({
          title: String(a.title ?? "Approval"),
          detail: null,
          meta: [
            ["Status", String(a.status ?? "—")],
            ["Approver", dash(clean(a.approver_name))],
            ["Role", dash(clean(a.approver_role))],
            ["Requested", dash(day(a.requested_at))],
            ["Decided", dash(day(a.decided_at))],
          ],
        })),
      },
      {
        heading: "What success was measured against",
        note: "The criteria agreed with the customer, and what was observed.",
        emptyNote: "No success criteria were recorded for this project.",
        entries: input.successCriteria.map((c) => ({
          title: String(c.description),
          detail: clean(c.metric),
          meta: [
            ["Status", String(c.status ?? "—")],
            ["Baseline", dash(clean(c.baseline_value))],
            ["Target", dash(clean(c.target_value))],
            ["Measured", dash(clean(c.measured_value))],
          ],
        })),
      },
      {
        heading: "The plan, as completed",
        note: `${done.length} of ${input.workItems.length} task(s) were ticked. ${
          notDone.length === 0
            ? "Nothing was left open."
            : `${notDone.length} were still open at completion, listed below.`
        }${
          overrides.length === 0
            ? ""
            : ` ${overrides.length} stage(s) were advanced with criteria outstanding.`
        }`,
        emptyNote: "This project had no plan attached.",
        entries: notDone.map((w) => ({
          title: String(w.title),
          detail: null,
          meta: [
            ["Stage", input.stageLabel(String(w.stage_key ?? ""))],
            ["Status at completion", String(w.status ?? "—")],
            ["Whose", dash(clean(w.party))],
          ],
        })),
      },
    ],
  };
}

export function buildSolutionDocument(input: SolutionCompletionInput): CompletionDocument {
  const s = input.solution;
  const n = input.named;

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
      ["Status at completion", String(s.status ?? "—")],
      ["Built by", dash(n(s.owner_id))],
      ["Started", dash(day(s.created_at))],
      ["Completed", input.completedAt.slice(0, 10)],
      ["Answers requirement", dash(input.requirementTitle)],
    ],
    sections: [
      {
        heading: "What it does",
        emptyNote: "Nobody wrote down what this solution does.",
        entries: clean(s.design_summary)
          ? [{ title: "In the engineer's words", detail: clean(s.design_summary) }]
          : [],
      },
      {
        heading: "How it is set up",
        emptyNote: "No configuration detail was recorded.",
        entries: clean(s.configuration_details)
          ? [{ title: "Configuration", detail: clean(s.configuration_details) }]
          : [],
      },
      {
        heading: "Field mapping",
        note: "Every field that moves, where it comes from and where it lands.",
        emptyNote: "No field mappings were recorded for this solution.",
        entries: input.mappings.map((m) => ({
          title: `${dash(clean(m.source_field))} → ${dash(clean(m.target_field))}`,
          detail: clean(m.transformation_notes),
          meta: [
            ["Source system", dash(clean(m.source_system))],
            ["Required", m.required == null ? "—" : m.required ? "Yes" : "No"],
            ["Status", dash(clean(m.status))],
          ],
        })),
      },
      {
        heading: "The build log",
        note: "The engineers' notes, oldest first.",
        emptyNote: "No notes were written on this solution.",
        entries: input.notes.map((note) => ({
          title: String(note.note_type ?? "note"),
          detail: clean(note.content),
          meta: [
            ["Written", dash(day(note.created_at))],
            ["By", dash(n(note.created_by))],
          ],
        })),
      },
      {
        heading: "Decisions taken",
        emptyNote: "No decisions were linked to this solution.",
        entries: input.decisions.map((d) => ({
          title: String(d.title),
          detail: clean(d.description) ?? clean(d.rationale),
          meta: [["Decided", dash(day(d.decision_date) ?? day(d.created_at))]],
        })),
      },
      {
        heading: "Proof it works",
        emptyNote: "No evidence was attached to this solution.",
        entries: input.evidence.map((e) => ({
          title: String(e.title ?? "Evidence"),
          detail: clean(e.description),
          meta: [
            ["Kind", dash(clean(e.type))],
            ["Recorded", dash(day(e.created_at))],
          ],
        })),
      },
      {
        heading: "Sign-off",
        emptyNote: "This solution was not signed off.",
        entries: input.approvals.map((a) => ({
          title: String(a.title ?? "Approval"),
          detail: null,
          meta: [
            ["Status", String(a.status ?? "—")],
            ["Approver", dash(clean(a.approver_name))],
            ["Decided", dash(day(a.decided_at))],
          ],
        })),
      },
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
