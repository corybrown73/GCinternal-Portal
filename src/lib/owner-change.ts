import { z } from "zod";

/**
 * Why an implementation's owner (its assigned TIS) is changed by a person. The
 * same vocabulary is used by the screens, the server and the ledger, so a reason
 * means the same thing wherever it was recorded.
 */
export const OWNER_CHANGE_REASONS = [
  "tis_leave",
  "workload",
  "customer_escalation",
  "coverage",
  "other",
] as const;

export type OwnerChangeReasonCode = (typeof OWNER_CHANGE_REASONS)[number];

export const OWNER_CHANGE_REASON_LABEL: Record<OwnerChangeReasonCode, string> = {
  tis_leave: "TIS on leave",
  workload: "Workload balancing",
  customer_escalation: "Customer escalation",
  coverage: "Coverage change",
  other: "Other, with explanation",
};

/** A manual owner change needs one of these. "Other" needs a few words as well. */
export const ownerChangeReasonInput = z
  .object({
    reasonCode: z.enum(OWNER_CHANGE_REASONS),
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.reasonCode === "other" && !v.reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Say why, in a few words, when the reason is Other.",
      });
    }
  });

export type OwnerChangeReason = { reasonCode: OwnerChangeReasonCode; reason: string | null };

/**
 * The reason a caller sent under `ownerChange`, checked. Null when none was sent;
 * a sentence when one was sent but is not complete.
 */
export function ownerChangeFromRaw(raw: unknown): OwnerChangeReason | null {
  if (raw === null || raw === undefined) return null;
  const parsed = ownerChangeReasonInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Choose why the owner is changing.");
  }
  return ownerChangeFrom(parsed.data);
}

/** The reason as the database stores it: a code, and the words when there are any. */
export function ownerChangeFrom(input: {
  reasonCode: OwnerChangeReasonCode;
  reason?: string | null | undefined;
}): OwnerChangeReason {
  return { reasonCode: input.reasonCode, reason: input.reason?.trim() || null };
}

/** What a person has chosen so far on a screen. Ready when it has a code, and words for "Other". */
export type OwnerReasonDraft = { reasonCode: OwnerChangeReasonCode | ""; reason: string };

export const EMPTY_OWNER_REASON: OwnerReasonDraft = { reasonCode: "", reason: "" };

export function ownerReasonReady(d: OwnerReasonDraft): boolean {
  return d.reasonCode !== "" && (d.reasonCode !== "other" || d.reason.trim().length > 0);
}

/** The reason in the form the server takes, or null while it is not yet complete. */
export function ownerReasonPayload(
  d: OwnerReasonDraft,
): { reasonCode: OwnerChangeReasonCode; reason: string | null } | null {
  if (!ownerReasonReady(d) || d.reasonCode === "") return null;
  return { reasonCode: d.reasonCode, reason: d.reason.trim() || null };
}

/**
 * Whether a person's named pick needs a reason. Only a pick that changes the owner
 * of an existing implementation does. A deal with no implementation has no owner to
 * change, so its pick is the pre-sale assignment and goes through as it always has.
 */
export function namedPickNeedsReason(input: {
  implementationId: string | null;
  currentOwnerId: string | null;
  pickedId: string | null;
}): boolean {
  if (!input.implementationId || !input.pickedId) return false;
  return input.pickedId !== input.currentOwnerId;
}
