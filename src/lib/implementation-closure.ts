import { z } from "zod/v4";

/**
 * Closing an implementation without graduating it. Pure: the reasons, the
 * wording, who may close, and the open-only filter every active surface uses.
 * The database (portal_close_implementation, migration 0088) is the authority
 * on who may close; canCloseImplementation mirrors it so the UI can show the
 * action only to people who may use it.
 *
 * Closing is not graduating. Nothing here, and nothing the closure writes,
 * is a stage, a graduation, a launch or a "proven" outcome.
 */

export const CLOSURE_REASONS = ["implementation_not_required"] as const;
export type ClosureReason = (typeof CLOSURE_REASONS)[number];

export const CLOSURE_REASON_LABEL: Record<ClosureReason, string> = {
  implementation_not_required: "Implementation not required",
};

/** The label a closed implementation carries everywhere it is shown. */
export const CLOSED_BADGE = "Closed — Implementation Not Required";

/** What the closing dialog says before it asks for confirmation. */
export const CLOSURE_EXPLANATION =
  "This ends the implementation without completing or graduating it. The customer is not graduated, the sales outcome does not change, and everything recorded stays as history.";

export const CLOSURE_NOTE_MAX = 500;

const MANAGER_ROLES = ["admin", "super_admin", "manager"] as const;
/** The technical roles that can run an implementation: the same set canEditTechnical reads. */
const SPECIALIST_ROLES = ["se", "tam_se", "implementation"] as const;

/**
 * Whether this person may close this implementation. Mirrors
 * portal_close_implementation: a manager, an admin or a super admin; or the
 * implementation's own owner, when that owner's role is a technical one. A
 * closed implementation cannot be closed again.
 */
export function canCloseImplementation(input: {
  role: string | null | undefined;
  teamMemberId: string | null | undefined;
  ownerTeamMemberId: string | null | undefined;
  closedAt?: string | null | undefined;
}): boolean {
  if (input.closedAt || !input.role) return false;
  if ((MANAGER_ROLES as readonly string[]).includes(input.role)) return true;
  return (
    (SPECIALIST_ROLES as readonly string[]).includes(input.role) &&
    Boolean(input.teamMemberId) &&
    input.teamMemberId === input.ownerTeamMemberId
  );
}

/** A closed implementation, by its closure time. */
export function isClosed(impl: { closed_at?: string | null | undefined }): boolean {
  return Boolean(impl.closed_at);
}

/**
 * The implementations that are still open. Active work, workload, queues,
 * stage metrics and alerts read only these, so a closed implementation drops
 * out of all of them at once.
 */
export function openOnly<T extends { closed_at?: string | null | undefined }>(
  rows: readonly T[],
): T[] {
  return rows.filter((r) => !r.closed_at);
}

/**
 * What a closed implementation says about itself, for the header and the
 * history tiles. Null for an open one. The label is always shown with it.
 */
export function closureSummary(impl: {
  closed_at?: string | null | undefined;
  closure_reason?: string | null | undefined;
  closure_note?: string | null | undefined;
}): { badge: string; reason: string; note: string; closedOn: string | null } | null {
  if (!impl.closed_at) return null;
  const reason = (CLOSURE_REASONS as readonly string[]).includes(impl.closure_reason ?? "")
    ? CLOSURE_REASON_LABEL[impl.closure_reason as ClosureReason]
    : "Not recorded";
  return {
    badge: CLOSED_BADGE,
    reason,
    note: impl.closure_note ?? "",
    closedOn: impl.closed_at.slice(0, 10),
  };
}

/**
 * The closing form. The explanation is required: a closure without one is
 * refused here and again in the database.
 */
export const closureInput = z.object({
  implementationId: z.string().uuid(),
  reason: z.enum(CLOSURE_REASONS),
  note: z
    .string()
    .trim()
    .min(1, "Add a short explanation of why the implementation is closed.")
    .max(CLOSURE_NOTE_MAX),
});
export type ClosureInput = z.infer<typeof closureInput>;
