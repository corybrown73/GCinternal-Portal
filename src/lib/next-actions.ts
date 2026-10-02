import type { Waiting } from "./workspace";
import { SOLUTION_LABEL, solutionBall, type ServiceSpec } from "./onboarding-services";

/**
 * Phase 2.2: "what needs to happen next" — not a Ball. A viewer-agnostic list
 * of every currently open next action this implementation's TRUSTWORTHY
 * sources can name, with no primary chosen and no precedence between them.
 * Multiple items, including both customer-side and internal ones, can and
 * should coexist; see the design analysis this builds on.
 *
 * Deliberately excluded, with no exception: commitments (`committed_to`'s
 * polarity isn't documented well enough to trust yet), risks, issues,
 * escalations, decisions, and `DealFacts.next_step` (a task description with
 * no owner field at all). None of these can name who owns the NEXT move —
 * only who is tracking a record, or what the record is, not who acts next.
 */

/** Who owns the action: a named person when one is explicitly recorded, else
 * only the truthful party — never invented, never defaulted to a role. */
export type NextActionWho =
  | { kind: "person"; name: string; role: string | null }
  | { kind: "party"; party: "customer" | "gocanvas" };

export type NextActionItem = {
  what: string;
  who: NextActionWho;
  /** ISO date/timestamp the item has been open since, when the source records one. */
  since: string | null;
  /** ISO date it's due by, when the source records one. Null is common and honest. */
  due: string | null;
  /**
   * The table/list the item came from. Closed for now, but expected to grow
   * additively as other confirmed, structured action sources are introduced
   * — never by widening what an existing source is trusted to mean.
   */
  source:
    "approvals" | "field_mappings" | "technical_solutions" | Waiting["source"] | "solution_ball";
};

// Mirrors customer360-derive.ts's own `APPROVAL_PENDING`/`SOLUTION_OPEN`/
// `MAPPING_COMPLETE` constants. Kept duplicated rather than importing from
// that file, to keep this slice fully isolated from the Phase 1 engine.
const APPROVAL_PENDING = ["pending", "requested", "in_review", "awaiting"];
const SOLUTION_OPEN = ["draft", "in_review", "review", "in_progress", "in_build", "build"];
const MAPPING_COMPLETE = ["complete", "completed", "done", "mapped", "validated", "approved"];

type ApprovalLike = {
  title: string;
  status: string | null;
  approver_name?: string | null;
  approver_role?: string | null;
  requested_at?: string | null;
};

type FieldMappingLike = {
  required?: boolean | null;
  status?: string | null;
};

type TechnicalSolutionLike = {
  title: string;
  status: string | null;
  owner_name?: string | null;
  owner_role?: string | null;
  updated_at?: string | null;
  field_mappings?: readonly FieldMappingLike[] | null;
};

export type NextActionsInput = {
  approvals?: readonly ApprovalLike[];
  technicalSolutions?: readonly TechnicalSolutionLike[];
  /** Already-derived `workspaceFor().waiting` — this helper does not recompute it. */
  workspaceWaiting?: readonly Waiting[];
  /** Purchased solutions, for `solutionBall()` — only the explicitly human-set ones are used. */
  solutions?: readonly ServiceSpec[];
  solutionsCompleted?: Record<string, string>;
};

function approvalItems(approvals: readonly ApprovalLike[]): NextActionItem[] {
  return approvals
    .filter((a) => APPROVAL_PENDING.includes(String(a.status ?? "").toLowerCase()))
    .map((a) => ({
      what: a.title,
      who: a.approver_name
        ? { kind: "person" as const, name: a.approver_name, role: a.approver_role ?? null }
        : // Approvals are the customer's by nature — nobody but the customer
          // approves here — so the party is a fact, not a guess, even unnamed.
          { kind: "party" as const, party: "customer" as const },
      since: a.requested_at ?? null,
      due: null,
      source: "approvals" as const,
    }));
}

function technicalSolutionItems(solutions: readonly TechnicalSolutionLike[]): NextActionItem[] {
  const items: NextActionItem[] = [];
  for (const s of solutions) {
    const who: NextActionWho = s.owner_name
      ? { kind: "person", name: s.owner_name, role: s.owner_role ?? null }
      : // Build work here is always ours; "gocanvas" names the truthful party
        // when no specific owner is recorded.
        { kind: "party", party: "gocanvas" };

    const incompleteRequired = (s.field_mappings ?? []).filter(
      (m) =>
        m.required === true && !MAPPING_COMPLETE.includes(String(m.status ?? "").toLowerCase()),
    );
    if (incompleteRequired.length) {
      items.push({
        what: `Complete ${incompleteRequired.length} required field mapping(s) for ${s.title}`,
        who,
        since: s.updated_at ?? null,
        due: null,
        source: "field_mappings",
      });
      continue; // one item per solution — the sharpest open thing wins, not both.
    }
    if (SOLUTION_OPEN.includes(String(s.status ?? "").toLowerCase())) {
      items.push({
        what: `Finish ${s.title}`,
        who,
        since: s.updated_at ?? null,
        due: null,
        source: "technical_solutions",
      });
    }
  }
  return items;
}

function workspaceItems(waiting: readonly Waiting[]): NextActionItem[] {
  return waiting.map((w) => ({
    what: w.what,
    // workspace.ts only ever names a party (customer/gocanvas), never a
    // person — party-only stays party-only here, by construction.
    who: { kind: "party", party: w.who },
    since: w.since,
    due: null,
    source: w.source,
  }));
}

function solutionBallItems(
  solutions: readonly ServiceSpec[],
  completed: Record<string, string>,
): NextActionItem[] {
  const items: NextActionItem[] = [];
  for (const s of solutions) {
    // Only the explicitly human-set ball (`s.ball`) is trustworthy enough
    // for this list. `solutionBall()`'s phase-inferred default (Define/Build
    // ⇒ "us", Accept ⇒ "customer" with no named person) is a reasonable
    // guess, not a recorded fact — excluded here, not promoted to a person.
    if (!s.ball) continue;
    const ball = solutionBall(s, completed);
    if (!ball) continue;

    const who: NextActionWho = ball.person
      ? { kind: "person", name: ball.person, role: null }
      : {
          kind: "party",
          party:
            ball.who === "customer" || ball.who === "blocked_customer" ? "customer" : "gocanvas",
        };

    items.push({
      what: ball.note?.trim() || `${SOLUTION_LABEL[s.kind] ?? "Solution"}: ${s.name}`,
      who,
      since: null,
      due: ball.date ?? null,
      source: "solution_ball",
    });
  }
  return items;
}

/**
 * Every currently open next action this implementation's trustworthy
 * sources can name — no primary, no precedence, no Ball. Display order is
 * objective only: an item with a due date sorts before one without, earlier
 * due dates first; among ties (most items, since few of these sources carry
 * a due date), the stable order each source was collected in is kept.
 */
export function openNextActions(input: NextActionsInput): NextActionItem[] {
  const items = [
    ...workspaceItems(input.workspaceWaiting ?? []),
    ...approvalItems(input.approvals ?? []),
    ...technicalSolutionItems(input.technicalSolutions ?? []),
    ...solutionBallItems(input.solutions ?? [], input.solutionsCompleted ?? {}),
  ];

  // Array#sort is a stable sort (ES2019+): ties keep their collected order,
  // which is itself not a precedence — just "when it was found", carrying no
  // meaning about importance.
  return items.sort((a, b) => {
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return 0;
  });
}
