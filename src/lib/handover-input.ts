import { z } from "zod";

/**
 * The handover record — one row in `cs_handoffs` per implementation, upserted.
 *
 * `graduations` and `cs_handoffs` modelled the same event twice in 0003, both
 * with one reader and no writer. cs_handoffs wins (it is the richer table, and
 * the one the UI already calls the handover record) and 0025 folds graduations
 * forward into it without dropping anything.
 *
 * This is a RECORD, not a gate. Writing it does not move a stage and does not
 * assert the handover was a good one; graduation readiness stays read-only and
 * independent, exactly as graduation-readiness.ts's header promises.
 */
export const handoverRecordInput = z.object({
  implementationId: z.string().uuid(),
  handoff_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable(),
  cs_owner_id: z.string().uuid().nullable(),
  summary: z.string().trim().max(4000).nullable(),
  open_items: z.string().trim().max(4000).nullable(),
  account_context: z.string().trim().max(4000).nullable(),
  health_at_handover: z.enum(["on_track", "at_risk", "blocked"]).nullable(),
  notes: z.string().trim().max(4000).nullable(),
});

export type HandoverRecordInput = z.infer<typeof handoverRecordInput>;

export type HandoverRecord = {
  id: string;
  implementation_id: string;
  handoff_date: string | null;
  cs_owner_id: string | null;
  cs_owner_name: string | null;
  summary: string | null;
  open_items: string | null;
  account_context: string | null;
  health_at_handover: string | null;
  notes: string | null;
  recorded_by_name: string | null;
  updated_at: string | null;
};

/**
 * The three things graduation-readiness.ts checks for. Named here so the form
 * can show the same list the readiness area reports on, rather than the two
 * drifting apart — the readiness view is the reader, this is the writer, and
 * they must agree on what "complete" means.
 */
export const HANDOVER_REQUIRED = [
  { key: "handoff_date", label: "Handover date" },
  { key: "cs_owner_id", label: "CS owner" },
  { key: "summary", label: "Handover summary" },
] as const;

export type HandoverRequiredKey = (typeof HANDOVER_REQUIRED)[number]["key"];

/** Which required fields are still empty. A list, never a score. */
export function missingHandoverFields(
  record: Pick<HandoverRecord, "handoff_date" | "cs_owner_id" | "summary"> | null,
): string[] {
  if (!record) return HANDOVER_REQUIRED.map((f) => f.label);
  return HANDOVER_REQUIRED.filter((f) => {
    const value = record[f.key];
    return value == null || String(value).trim() === "";
  }).map((f) => f.label);
}
