import { z } from "zod";

/**
 * Slice 4 — write paths for the two existing records that carry proof:
 * `evidence` and `approvals`. Enums mirror the tables' own CHECK constraints,
 * relationships reuse the existing polymorphic (entity_type, entity_id) pairs,
 * and blank optional fields stay NULL rather than being fabricated.
 */

const optionalText = z.string().trim().min(1).nullable();
const optionalUuid = z.string().uuid().nullable();
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .nullable();

export const EVIDENCE_TYPES = [
  "document",
  "communication",
  "test_result",
  "screenshot",
  "approval_record",
  "other",
] as const;

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;

/** Entity kinds the existing read surfaces already resolve labels for. */
export const RELATED_ENTITY_TYPES = [
  "requirement",
  "decision",
  "risk",
  "issue",
  "escalation",
  "milestone",
  "technical_solution",
  "success_criterion",
] as const;

const relation = {
  relatedEntityType: z.enum(RELATED_ENTITY_TYPES).nullable(),
  relatedEntityId: optionalUuid,
};

/* ---------------- Evidence ---------------- */

export const evidenceInput = z.object({
  type: z.enum(EVIDENCE_TYPES),
  title: z.string().trim().min(1, "Give the evidence a title"),
  description: optionalText,
  url: z.string().trim().url("Enter a valid link, or leave it blank").nullable(),
  uploadedBy: optionalUuid,
  ...relation,
});

export const createEvidenceInput = evidenceInput.extend({
  implementationId: z.string().uuid(),
});
export const updateEvidenceInput = evidenceInput.extend({ id: z.string().uuid() });
export type EvidenceInput = z.infer<typeof evidenceInput>;

export function toEvidencePatch(data: EvidenceInput) {
  // A relationship needs both halves; a type without a record stays unlinked.
  const linked = data.relatedEntityType && data.relatedEntityId;
  return {
    type: data.type,
    title: data.title,
    description: data.description,
    url: data.url,
    uploaded_by: data.uploadedBy,
    related_entity_type: linked ? data.relatedEntityType : null,
    related_entity_id: linked ? data.relatedEntityId : null,
  };
}

/* ---------------- Approval requests ---------------- */

export const approvalInput = z.object({
  title: z.string().trim().min(1, "Say what is being approved"),
  status: z.enum(APPROVAL_STATUSES),
  approverName: optionalText,
  approverRole: optionalText,
  customerContactId: optionalUuid,
  evidenceId: optionalUuid,
  decidedAt: optionalDate,
  approvedEntityType: z.enum(RELATED_ENTITY_TYPES).nullable(),
  approvedEntityId: optionalUuid,
});

export const createApprovalInput = approvalInput.extend({
  implementationId: z.string().uuid(),
});
export const updateApprovalInput = approvalInput.extend({ id: z.string().uuid() });
export type ApprovalInput = z.infer<typeof approvalInput>;

export function toApprovalPatch(data: ApprovalInput) {
  const linked = data.approvedEntityType && data.approvedEntityId;
  return {
    title: data.title,
    status: data.status,
    approver_name: data.approverName,
    approver_role: data.approverRole,
    customer_contact_id: data.customerContactId,
    evidence_id: data.evidenceId,
    // A decision date only exists once a decision was actually made.
    decided_at:
      data.status === "pending"
        ? null
        : data.decidedAt
          ? `${data.decidedAt}T00:00:00Z`
          : new Date().toISOString(),
    approved_entity_type: linked ? data.approvedEntityType : null,
    approved_entity_id: linked ? data.approvedEntityId : null,
  };
}
