/**
 * Where a value from Salesforce (or a Sheet, or a Zap) can land on a deal.
 *
 * This is the target side of the closed-won field map (`inbound_deal` rows in
 * `integration_field_maps`). Every key here is a canonical field of
 * `closedWonSchema` in ./server/closed-won.ts — the map turns a sender's field name
 * into one of these, and the schema turns the value into what the deal
 * stores. Nothing outside this list can be a target: an admin picks from it,
 * and the save refuses anything else, so the mapping screen can never name a
 * column the endpoint does not know how to write.
 *
 * Pure: no database, no imports from the server layer. The admin page and
 * the endpoint read the same list.
 */

export type DealFieldKind =
  "text" | "long" | "number" | "email" | "person" | "date" | "list" | "enum" | "url";

export type DealFieldGroup = "deal" | "people" | "facts" | "handoff";

export type DealField = {
  key: string;
  label: string;
  group: DealFieldGroup;
  kind: DealFieldKind;
  /** One sentence: what the value is and where it shows. */
  hint: string;
  /** The endpoint refuses a row without it. */
  required?: boolean;
  /** For an enum: what the sender may say (matched loosely). */
  options?: ReadonlyArray<string>;
  /** Written only when the deal does not have one yet. */
  fillsBlankOnly?: boolean;
};

export const DEAL_FIELD_GROUP_LABEL: Record<DealFieldGroup, string> = {
  deal: "The deal",
  people: "People",
  facts: "Intake facts",
  handoff: "Sales handoff answers",
};

export const DEAL_FIELDS: ReadonlyArray<DealField> = [
  // ------------------------------------------------------------- the deal
  {
    key: "company",
    label: "Company",
    group: "deal",
    kind: "text",
    hint: "The account name. The deal is matched by Salesforce id first, then by this name.",
    required: true,
  },
  {
    key: "opportunity",
    label: "Opportunity name",
    group: "deal",
    kind: "text",
    hint: "Kept in the deal summary beside the close date and notes.",
  },
  {
    key: "amount",
    label: "Amount (ARR)",
    group: "deal",
    kind: "number",
    hint: "“$48,000” and 48000 both work. Shown on the board card and in reports.",
  },
  {
    key: "products",
    label: "Products",
    group: "deal",
    kind: "list",
    hint: "A list, or one string split on commas, semicolons or pipes.",
  },
  {
    key: "domain",
    label: "Website domain",
    group: "deal",
    kind: "text",
    hint: "A URL is reduced to its host.",
  },
  {
    key: "close_date",
    label: "Close date",
    group: "deal",
    kind: "date",
    hint: "Recorded in the summary; the plan's dates are built from the real close.",
  },
  {
    key: "notes",
    label: "Notes",
    group: "deal",
    kind: "long",
    hint: "Anything the rep wrote. Lands in the deal summary and the AI reads it.",
  },
  {
    key: "salesforce_id",
    label: "Salesforce Account id",
    group: "deal",
    kind: "text",
    hint: "The 001… account id (15 or 18 characters). Makes the next delivery match this deal, not a new one.",
  },
  {
    key: "salesforce_url",
    label: "Salesforce link",
    group: "deal",
    kind: "url",
    hint: "A Lightning URL. The account id is read out of it when no id was sent.",
  },
  {
    key: "contact_name",
    label: "Primary contact name",
    group: "deal",
    kind: "text",
    hint: "The customer's main contact, as the deal page shows them.",
  },
  {
    key: "contact_email",
    label: "Primary contact email",
    group: "deal",
    kind: "email",
    hint: "Where the welcome page and customer emails go.",
  },
  {
    key: "contact_role",
    label: "Primary contact title",
    group: "deal",
    kind: "text",
    hint: "Their title or role.",
  },
  // --------------------------------------------------------------- people
  {
    key: "rep_email",
    label: "Account Executive (email)",
    group: "people",
    kind: "email",
    hint: "The rep who closed it. Must match a Hub login to be recorded; they get the assignment email.",
  },
  {
    key: "se_email",
    label: "Sales Engineer (email)",
    group: "people",
    kind: "email",
    hint: "The SE on the deal. Must match a Hub login.",
  },
  {
    key: "implementation_owner",
    label: "TIS assigned (email or name)",
    group: "people",
    kind: "person",
    hint: "The implementation owner. An email or a full name, matched against the active team. The project is assigned to them and they get the kickoff email. Unmatched: the assignment rule picks.",
  },
  // ---------------------------------------------------------------- facts
  {
    key: "seats",
    label: "Field users (seats)",
    group: "facts",
    kind: "number",
    hint: "How many people use it in the field. Weighs the assignment and sizes the plan.",
    fillsBlankOnly: true,
  },
  {
    key: "integration_tier",
    label: "Integration tier",
    group: "facts",
    kind: "number",
    hint: "1–4, or a label the tiers recognise. Sets the expected Go-Live.",
    fillsBlankOnly: true,
  },
  {
    key: "industry",
    label: "Industry",
    group: "facts",
    kind: "text",
    hint: "Matched onto the Hub's industry list when it plainly is one; otherwise kept as sent.",
    fillsBlankOnly: true,
  },
  {
    key: "company_size",
    label: "Company size",
    group: "facts",
    kind: "text",
    hint: "“50–200”, “500+”, a number — kept as sent.",
    fillsBlankOnly: true,
  },
  {
    key: "current_process",
    label: "Process today",
    group: "facts",
    kind: "long",
    hint: "How the work is done now. Also answers the handoff question of the same name.",
    fillsBlankOnly: true,
  },
  {
    key: "path",
    label: "Onboarding type",
    group: "facts",
    kind: "enum",
    hint: "New logo, existing customer, DM conversion or Field Fusion. Chooses the checklist.",
    options: ["new_logo", "existing", "dm_conversion", "field_fusion"],
    fillsBlankOnly: true,
  },
  // -------------------------------------------------------------- handoff
  {
    key: "desired_launch_date",
    label: "Launch date the customer wants",
    group: "handoff",
    kind: "date",
    hint: "Handoff answer, recorded as Sales. The plan is built back from it.",
    fillsBlankOnly: true,
  },
  {
    key: "business_outcome",
    label: "The outcome the customer wants",
    group: "handoff",
    kind: "long",
    hint: "Handoff answer, recorded as Sales.",
    fillsBlankOnly: true,
  },
  {
    key: "success_measure",
    label: "How success is measured",
    group: "handoff",
    kind: "long",
    hint: "Handoff answer, recorded as Sales.",
    fillsBlankOnly: true,
  },
  {
    key: "commitments",
    label: "What was promised",
    group: "handoff",
    kind: "long",
    hint: "Handoff answer, recorded as Sales.",
    fillsBlankOnly: true,
  },
  {
    key: "system_requirements",
    label: "Systems and requirements",
    group: "handoff",
    kind: "long",
    hint: "Handoff answer, recorded as Sales.",
    fillsBlankOnly: true,
  },
  {
    key: "open_questions",
    label: "Open questions",
    group: "handoff",
    kind: "long",
    hint: "Handoff answer, recorded as Sales. The TIS picks these up in Intake & Process.",
    fillsBlankOnly: true,
  },
  {
    key: "contact_decision_maker",
    label: "Decision maker",
    group: "handoff",
    kind: "text",
    hint: "Handoff answer: name, role, email in one line.",
    fillsBlankOnly: true,
  },
  {
    key: "contact_admin_builder",
    label: "Admin / form builder",
    group: "handoff",
    kind: "text",
    hint: "Handoff answer: name, role, email in one line.",
    fillsBlankOnly: true,
  },
  {
    key: "contact_day_to_day",
    label: "Day-to-day contact",
    group: "handoff",
    kind: "text",
    hint: "Handoff answer: name, role, email in one line.",
    fillsBlankOnly: true,
  },
];

export const DEAL_FIELD_KEYS: ReadonlyArray<string> = DEAL_FIELDS.map((f) => f.key);

/** The handoff questions a mapped value may answer, by their question key. */
export const HANDOFF_TARGET_KEYS: ReadonlyArray<string> = DEAL_FIELDS.filter(
  (f) => f.group === "handoff",
).map((f) => f.key);

export function dealField(key: string): DealField | null {
  return DEAL_FIELDS.find((f) => f.key === key) ?? null;
}

export function isDealFieldKey(key: unknown): key is string {
  return typeof key === "string" && DEAL_FIELD_KEYS.includes(key);
}
