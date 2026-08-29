/**
 * Trace links: the traceability spine the Customer 360 and the technical-
 * solution pages render, and which nothing could populate until 0025.
 *
 * Most of the graph is DERIVED in the database from foreign keys that already
 * exist (`technical_solutions.requirement_id`, `evidence.related_entity_*`,
 * `approvals.approved_entity_*`) — a hand-maintained parallel copy of a foreign
 * key drifts from it on the first edit.
 *
 * Exactly one relationship has no foreign key behind it: decision ↔ technical
 * solution, which `decisionsFor()` looks for and which is genuine human input.
 * That is the only edge this module lets a person create, and it is why the
 * type list below is deliberately short rather than "any entity to any entity":
 * an editor that can draw an arbitrary edge can draw a wrong one, and the
 * renderer walks these edges outward eight hops.
 */

export const MANUAL_RELATIONSHIP = "informs" as const;

/** The only edge a person may draw by hand. */
export const MANUAL_EDGE = {
  fromType: "decision",
  toType: "technical_solution",
  relationship: MANUAL_RELATIONSHIP,
} as const;

export type TraceEdge = {
  from_entity_type: string;
  from_entity_id: string;
  relationship: string;
  to_entity_type: string;
  to_entity_id: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Build the one edge the manual linker is allowed to write. Returns a reason
 * rather than throwing, so the caller can surface it as a validation message.
 */
export function manualEdge(
  decisionId: string,
  solutionId: string,
): { ok: true; edge: TraceEdge } | { ok: false; reason: string } {
  if (!isUuid(decisionId)) return { ok: false, reason: "That decision id is not a uuid." };
  if (!isUuid(solutionId)) return { ok: false, reason: "That solution id is not a uuid." };
  if (decisionId === solutionId) {
    return { ok: false, reason: "A record cannot be linked to itself." };
  }
  return {
    ok: true,
    edge: {
      from_entity_type: MANUAL_EDGE.fromType,
      from_entity_id: decisionId,
      relationship: MANUAL_EDGE.relationship,
      to_entity_type: MANUAL_EDGE.toType,
      to_entity_id: solutionId,
    },
  };
}
