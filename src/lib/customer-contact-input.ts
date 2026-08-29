import { z } from "zod";

/**
 * Kickoff intake reuses the existing customer_contacts model — there is no
 * separate stakeholder entity. `role` is the person's contact type and is
 * constrained to the canonical vocabulary enforced by the database.
 *
 * Kickoff responsibilities (owning a success criterion or an adoption area)
 * are NOT roles: they are expressed through the existing
 * `customer_owner_contact_id` relationships on those records.
 */
export const CONTACT_ROLES = [
  "exec_sponsor",
  "decision_maker",
  "primary_contact",
  "technical_contact",
  "end_user",
  "approver",
] as const;

export type ContactRole = (typeof CONTACT_ROLES)[number];

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  exec_sponsor: "Exec sponsor",
  decision_maker: "Decision maker",
  primary_contact: "Primary contact",
  technical_contact: "Technical contact",
  end_user: "End user",
  approver: "Approver",
};

export function contactRoleLabel(role: string | null | undefined) {
  if (!role) return null;
  return (CONTACT_ROLE_LABELS as Record<string, string>)[role] ?? role;
}

const optionalText = z.string().trim().min(1).nullable();

export const customerContactInput = z.object({
  name: z.string().trim().min(1),
  role: z.enum(CONTACT_ROLES),
  email: optionalText,
  notes: optionalText,
});

export const createCustomerContactInput = customerContactInput.extend({
  customerId: z.string().uuid(),
});

export const updateCustomerContactInput = customerContactInput.extend({
  id: z.string().uuid(),
});

export type CustomerContactInput = z.infer<typeof customerContactInput>;

export function toCustomerContactPatch(data: CustomerContactInput) {
  return {
    name: data.name,
    role: data.role,
    email: data.email,
    notes: data.notes,
  };
}
