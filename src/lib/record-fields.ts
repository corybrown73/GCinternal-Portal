/**
 * Which facts on a delivery record a person may correct in place.
 *
 * Pure and shared, for the same reason `presale-fields.ts` is: the request
 * validator and the write both check against this, and declaring the set twice
 * lets them drift — which looks like a field that saves in one build and
 * silently refuses in the next.
 *
 * `table` matters because these live in two places. The TIS owns the PROJECT
 * and sits on `implementations`; ARR and the account manager belong to the
 * CUSTOMER and span every project they have. Editing them from one panel is
 * right for the reader and still two different writes underneath.
 */
export const EDITABLE_RECORD_FIELDS = {
  /** The TIS. A team_members id — the delivery side names people from the
      staff directory, who may have no login. */
  owner_id: { table: "implementations", kind: "team_member" },
  /** The AE. Free text, because the person who closed it may not be staff any
      more and the record should still say who it was. */
  sales_owner: { table: "implementations", kind: "text" },
  tier: { table: "implementations", kind: "text" },
  target_launch_date: { table: "implementations", kind: "date" },
  arr: { table: "customers", kind: "number" },
  account_manager_id: { table: "customers", kind: "team_member" },
} as const;

export type EditableRecordField = keyof typeof EDITABLE_RECORD_FIELDS;

export const EDITABLE_RECORD_FIELD_KEYS = Object.keys(
  EDITABLE_RECORD_FIELDS,
) as EditableRecordField[];
