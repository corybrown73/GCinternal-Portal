/**
 * Which deal facts a person may correct in place.
 *
 * Pure and shared: `presale.functions.ts` validates against this at the request
 * boundary and `presale.server.ts` enforces it again at the write. Declaring
 * the list twice would let the two drift, and drift here looks like a field
 * that saves in one build and silently refuses in the next.
 *
 * Deliberately NOT every column. `stage` moves only through `transitionStage`,
 * which writes the stage history everything downstream reads — typing it into a
 * field would produce a deal whose current stage and whose history disagree.
 * `customer_id` is set by the handoff, which is what makes the link mean
 * anything.
 */
export const EDITABLE_DEAL_FIELDS = {
  name: "text",
  arr: "number",
  domain: "text",
  salesforce_id: "text",
  summary: "text",
  am_owner_id: "uuid",
  se_owner_id: "uuid",
  /**
   * The champion. Editable here because this is where they are met — the deal
   * page is the only screen anyone is on while talking to them, and a contact
   * captured after the handoff has already failed at the moment it was needed.
   */
  primary_contact_name: "text",
  primary_contact_email: "text",
  primary_contact_role: "text",
} as const;

export type EditableDealField = keyof typeof EDITABLE_DEAL_FIELDS;
