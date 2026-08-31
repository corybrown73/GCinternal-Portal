/**
 * What crosses from a deal into the project it becomes.
 *
 * THE PROBLEM THIS SOLVES. Only ARR crossed the handoff, and the dialog said
 * so plainly: "Nothing else is created or inferred." Everything the deal knew —
 * what the customer said they wanted, who the champion was, who sold it — was
 * re-gathered afterwards by asking the customer questions they had already
 * answered to sales.
 *
 * TWO RULES, both about not overwriting a person.
 *
 *  1. A carried value NEVER replaces something typed. If somebody has written
 *     their own goal into the dialog, the deal's summary does not win. The
 *     deal is a default, not an authority.
 *
 *  2. Everything carried is NAMED on screen before it is saved. A field that
 *     fills itself silently is indistinguishable from one the user filled, and
 *     the first time that matters is when it is wrong and nobody can say where
 *     it came from.
 *
 * Pure — no imports — so the same rules run on both sides of the wire and can
 * be tested without a database.
 */

/** The carryable half of a deal, as the server reads it. */
export type DealCarryover = {
  summary: string | null;
  domain: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactRole: string | null;
  /** Resolved through portal_profiles.team_member_id — null when unresolvable. */
  salesOwnerId: string | null;
  salesOwnerName: string | null;
};

/** The fields of the create-implementation draft a deal can fill. */
export type CarryTarget = {
  customerGoals: string;
  domain: string;
  contactName: string;
  contactEmail: string;
  contactRole: string;
  salesOwner: string;
  salesOwnerId: string;
};

export type CarriedField = {
  /** The draft key that was filled. */
  field: keyof CarryTarget;
  /** What a person should see it called. */
  label: string;
  /** What was put there. */
  value: string;
};

const LABELS: Record<keyof CarryTarget, string> = {
  customerGoals: "What the customer wants to achieve",
  domain: "Domain",
  contactName: "Contact",
  contactEmail: "Contact email",
  contactRole: "Contact role",
  salesOwner: "Sales owner",
  salesOwnerId: "Sales owner",
};

const blank = (v: string | null | undefined) => !v || v.trim() === "";

/**
 * Apply a deal to a draft, returning the new draft and an itemised list of
 * what changed.
 *
 * The list is the point. It is what the dialog renders under "Carried from the
 * deal", and it is built from the same pass that does the filling, so the two
 * cannot drift into showing one thing and saving another.
 */
export function applyCarryover(
  deal: DealCarryover,
  target: CarryTarget,
): { target: CarryTarget; carried: CarriedField[] } {
  const next = { ...target };
  const carried: CarriedField[] = [];

  const fill = (field: keyof CarryTarget, value: string | null, shown?: string) => {
    if (blank(value)) return;
    // Rule 1: never over a person's own answer.
    if (!blank(next[field])) return;
    next[field] = value!.trim();
    // salesOwnerId is machinery; it is reported under the name, not as an id.
    if (field === "salesOwnerId") return;
    carried.push({ field, label: LABELS[field], value: shown ?? value!.trim() });
  };

  fill("customerGoals", deal.summary);
  fill("domain", deal.domain);
  fill("contactName", deal.contactName);
  fill("contactEmail", deal.contactEmail);
  fill("contactRole", deal.contactRole);
  fill("salesOwner", deal.salesOwnerName);
  fill("salesOwnerId", deal.salesOwnerId);

  return { target: next, carried };
}

/**
 * What the dialog says when a deal has nothing to give.
 *
 * A deal with an empty summary and no contact is the common case early in a
 * pipeline, and an empty "Carried from the deal" box is a worse answer than a
 * sentence saying the deal is thin — one looks broken, the other is
 * information about the deal.
 */
export function carryoverSummary(carried: CarriedField[]): string {
  if (carried.length === 0) {
    return "This deal has nothing recorded that the project can use — no goal, no named contact, no sales owner. Nothing was copied.";
  }
  return `Copied from the deal and editable below: ${carried.map((c) => c.label.toLowerCase()).join(", ")}.`;
}
