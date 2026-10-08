import type { PortalRole } from "./auth";

/**
 * THE ROLE RULES, in one place.
 *
 * Who may manage (the three roles that can move stages by hand, assign, and
 * change the team's settings) used to be a list typed into nine files. One
 * list, so a tenth file cannot drift. And which Home a login lands on: the
 * seller's deals, the implementer's day, or the manager's whole book.
 *
 * Views, not permissions. A variant decides what is worth showing first;
 * every server function still checks the caller's role on every request.
 */
export const MANAGE_ROLES: ReadonlyArray<string> = ["admin", "super_admin", "manager"];

export function isManagerRole(role: string | null | undefined): boolean {
  return role !== null && role !== undefined && MANAGE_ROLES.includes(role);
}

/**
 * - sales: an AE or AM selling. Home is "My deals": the handoff, the TIS,
 *   the first meeting, and what is on them next.
 * - tis: an implementation lead. Home is Today: what needs me, coming up.
 * - manager: the same Today. It still defaults to their own book, like
 *   everyone else — "All work" is one click away in the scope switch, not
 *   the landing view.
 *
 * `am` is the legacy login whose surface has always been Sales (see
 * ROLE_LABELS); an Account Manager's own view keys on the customer's
 * account_manager_id, not on a login role, and is a later step.
 */
export type HomeVariant = "sales" | "tis" | "manager";

export function homeVariantFor(role: PortalRole | string | null | undefined): HomeVariant {
  if (isManagerRole(role)) return "manager";
  if (role === "sales" || role === "am") return "sales";
  return "tis";
}

export const HOME_VARIANT_LABEL: Record<HomeVariant, string> = {
  sales: "My deals",
  tis: "Today",
  manager: "Today",
};
