import { z } from "zod";

/**
 * Implementation creation (P0 Slice 1). The lifecycle always starts at Handoff —
 * `current_stage` is not a form field and is hardcoded server-side.
 * Everything except `name` is optional: blank means "not known yet", never zero.
 */
const optionalText = z.string().trim().min(1).nullable();
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const optionalNumber = z.number().finite().nullable();

/** New customer capture reuses the customers table exactly — no new columns. */
export const newCustomerInput = z.object({
  name: z.string().trim().min(1),
  industry: optionalText,
  region: optionalText,
  segment: optionalText,
  arr: optionalNumber,
});

export const createImplementationInput = z
  .object({
    /** Exactly one of these two is provided. */
    customerId: z.string().uuid().nullable(),
    newCustomer: newCustomerInput.nullable(),

    name: z.string().trim().min(1),
    ownerId: z.string().uuid().nullable(),
    salesOwner: optionalText,
    tier: optionalText,
    sowReference: optionalText,
    /** Optional SOW document uploaded during creation. */
    sowDocumentUrl: optionalText.optional(),
    sowDocumentName: optionalText.optional(),
    sowValue: optionalNumber,
    sowSignedDate: optionalDate,
    contractStartDate: optionalDate,
    targetLaunchDate: optionalDate,
    customerGoals: optionalText,
    externalRef: optionalText,
  })
  .refine((v) => (v.customerId === null) !== (v.newCustomer === null), {
    message: "Provide either an existing customer or a new customer, not both",
  });

export type CreateImplementationInput = z.infer<typeof createImplementationInput>;
export type NewCustomerInput = z.infer<typeof newCustomerInput>;

export function toImplementationPatch(data: CreateImplementationInput) {
  return {
    name: data.name,
    owner_id: data.ownerId,
    sales_owner: data.salesOwner,
    tier: data.tier,
    sow_reference: data.sowReference,
    sow_document_url: data.sowDocumentUrl ?? null,
    sow_document_name: data.sowDocumentName ?? null,
    sow_value: data.sowValue,
    sow_signed_date: data.sowSignedDate,
    contract_start_date: data.contractStartDate,
    target_launch_date: data.targetLaunchDate,
    customer_goals: data.customerGoals,
    external_ref: data.externalRef,
  };
}

export function toCustomerPatch(data: NewCustomerInput) {
  return {
    name: data.name,
    industry: data.industry,
    region: data.region,
    segment: data.segment,
    arr: data.arr,
  };
}

/**
 * The status vocabulary the app writes. The DB column has NO check constraint
 * and defaults to 'active' (0003), so rows created by the hub's "new
 * implementation" flow carry a value outside this list; the update schema
 * tolerates it so an unrelated edit (SOW upload, discovery board) never fails
 * on a status the user didn't touch.
 */
export const IMPLEMENTATION_STATUSES = ["on_track", "at_risk", "blocked", "idle"] as const;

/** Accepts the app vocabulary plus the legacy DB default 'active' (pass-through). */
export const implementationStatusInput = z.enum([...IMPLEMENTATION_STATUSES, "active"]);

/**
 * Editing an existing implementation. `current_stage` and `stage_entered_at` are
 * deliberately absent: stage movement only ever happens through stage
 * advancement, so this editor can never disagree with the stage history.
 */
export const updateImplementationInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  ownerId: z.string().uuid().nullable(),
  salesOwner: optionalText,
  tier: optionalText,
  status: implementationStatusInput,
  sowReference: optionalText,
  /** Stored path of the uploaded SOW document, plus the name to show for it. */
  sowDocumentUrl: optionalText,
  sowDocumentName: optionalText,
  sowValue: optionalNumber,
  sowSignedDate: optionalDate,
  contractStartDate: optionalDate,
  targetLaunchDate: optionalDate,
  /** Blank until go-live actually happened — never pre-filled from the target. */
  actualLaunchDate: optionalDate,
  customerGoals: optionalText,
  /** Discovery/design board (Miro) for this implementation. Omitted keys are left untouched. */
  discoveryBoardUrl: optionalText.optional(),
  discoveryBoardImageUrl: optionalText.optional(),
  discoveryBoardImageName: optionalText.optional(),
  discoveryBoardNotes: optionalText.optional(),
});

export type UpdateImplementationInput = z.infer<typeof updateImplementationInput>;

export function toImplementationUpdatePatch(data: UpdateImplementationInput) {
  const patch: Record<string, unknown> = {
    name: data.name,
    owner_id: data.ownerId,
    sales_owner: data.salesOwner,
    tier: data.tier,
    status: data.status,
    sow_reference: data.sowReference,
    sow_document_url: data.sowDocumentUrl,
    sow_document_name: data.sowDocumentName,
    sow_value: data.sowValue,
    sow_signed_date: data.sowSignedDate,
    contract_start_date: data.contractStartDate,
    target_launch_date: data.targetLaunchDate,
    actual_launch_date: data.actualLaunchDate,
    customer_goals: data.customerGoals,
  };
  if (data.discoveryBoardUrl !== undefined) patch["discovery_board_url"] = data.discoveryBoardUrl;
  if (data.discoveryBoardImageUrl !== undefined)
    patch["discovery_board_image_url"] = data.discoveryBoardImageUrl;
  if (data.discoveryBoardImageName !== undefined)
    patch["discovery_board_image_name"] = data.discoveryBoardImageName;
  if (data.discoveryBoardNotes !== undefined)
    patch["discovery_board_notes"] = data.discoveryBoardNotes;
  return patch;
}
