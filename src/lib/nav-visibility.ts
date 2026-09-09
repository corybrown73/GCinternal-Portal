/**
 * Which sections of the app are on the screen.
 *
 * WHY THIS EXISTS. The hub has grown to fourteen sections and a given rollout
 * uses six of them. Everything else is not wrong, it is noise — and on a demo,
 * or for a team that only runs the pre-sale → onboarding handoff, noise is
 * what makes a tool look harder than it is. A super admin can switch a
 * section off for everyone; it comes back with one click.
 *
 * THIS IS NOT A PERMISSION. Hiding a section removes its link from the nav
 * and nothing else: the route still exists and its server functions still
 * check the caller's role on every request. Who may do a thing is decided by
 * role; this decides what is worth showing.
 *
 * Two entries can never be hidden. Home, because an app with no landing page
 * has nowhere to go; and Admin, because that is where the switches live —
 * hiding it would be the one change nobody could undo from the screen.
 */

export type NavEntry = {
  to: string;
  label: string;
  hint: string;
  exact?: boolean;
  /** Who sees it at all, before visibility is applied. */
  audience: "everyone" | "managers" | "super_admins";
  /** Cannot be switched off. See above. */
  locked?: boolean;
};

/** Every section, in nav order. The one list the sidebar and the admin screen share. */
export const NAV_CATALOGUE: readonly NavEntry[] = [
  {
    to: "/",
    label: "Home",
    hint: "What needs attention",
    exact: true,
    audience: "everyone",
    locked: true,
  },
  { to: "/search", label: "Search", hint: "Across every surface", audience: "everyone" },
  { to: "/pipeline", label: "Pipeline", hint: "Deals & handoff", audience: "everyone" },
  { to: "/customers", label: "Customers", hint: "All implementations", audience: "everyone" },
  {
    to: "/form-templates",
    label: "Form library",
    hint: "Starting points by industry",
    audience: "everyone",
  },
  { to: "/technical-solutions", label: "Solutions", hint: "Technical work", audience: "everyone" },
  { to: "/tickets", label: "Tickets", hint: "Requests & SLA", audience: "everyone" },
  { to: "/sequences", label: "Sequences", hint: "Automated onboarding", audience: "everyone" },
  {
    to: "/templates",
    label: "Journey templates",
    hint: "How onboarding runs",
    audience: "everyone",
  },
  { to: "/access", label: "Customer access", hint: "Portal invites", audience: "everyone" },
  { to: "/portfolio", label: "Leadership", hint: "Team overview", audience: "managers" },
  { to: "/signals", label: "Signals", hint: "Velocity, dwell & waiting on", audience: "everyone" },
  { to: "/settings", label: "Settings", hint: "Stages & defaults", audience: "managers" },
  {
    to: "/admin",
    label: "Admin",
    hint: "Keys, users, routing",
    audience: "super_admins",
    locked: true,
  },
];

export type NavVisibility = { hidden: string[] };

export const NO_HIDDEN: NavVisibility = { hidden: [] };

/** The keys a super admin is allowed to switch off. */
export function hideableKeys(): string[] {
  return NAV_CATALOGUE.filter((e) => !e.locked).map((e) => e.to);
}

/**
 * What one person sees: the catalogue, narrowed by their role, then by what
 * has been switched off. Locked entries ignore the hidden list, so a stale or
 * hand-edited row can never remove Home or Admin.
 */
export function visibleNav(
  visibility: NavVisibility,
  role: { canManage: boolean; isSuperAdmin: boolean },
): NavEntry[] {
  const hidden = new Set(visibility.hidden);
  return NAV_CATALOGUE.filter((e) => {
    if (e.audience === "managers" && !role.canManage) return false;
    if (e.audience === "super_admins" && !role.isSuperAdmin) return false;
    if (e.locked) return true;
    return !hidden.has(e.to);
  });
}

/** Drop anything that is not a hideable key, so a bad write cannot poison the row. */
export function sanitizeHidden(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set(hideableKeys());
  return Array.from(
    new Set(input.filter((k): k is string => typeof k === "string" && allowed.has(k))),
  );
}
