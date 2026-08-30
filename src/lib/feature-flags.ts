import type { V2Flags } from "./app-config.server";

/**
 * What each flag actually does, in words an admin can act on.
 *
 * This catalogue exists because a screen listing `sf_presale_bridge` next to a
 * toggle is not a control, it is a dare. A flag nobody can describe is a flag
 * nobody will touch — or worse, one somebody flips to find out.
 *
 * Client-safe: no database, no server imports. The `V2Flags` type import is
 * type-only and erased at build time.
 *
 * WHAT A FLAG IS NOT. A flag is not a permission. Who may do something is
 * decided by role, checked server-side on every request, and is never
 * flag-gated — see 0011's header. Turning a flag off hides or disables a
 * FEATURE; it does not revoke anybody's access to anything, and nothing here
 * should be reached for as a security control.
 */

export type FlagGroup = "customer" | "delivery" | "presale" | "platform" | "integrations";

export const FLAG_GROUP_LABELS: Record<FlagGroup, string> = {
  customer: "What customers can see and do",
  delivery: "Delivery and onboarding",
  presale: "Pre-sales",
  platform: "Platform",
  integrations: "Integrations",
};

export type FlagInfo = {
  key: keyof V2Flags;
  label: string;
  /** One sentence: what turning this ON does. */
  description: string;
  group: FlagGroup;
  /**
   * The migration this flag's code needs. Turning it on before that migration
   * is applied is safe — every gated read falls back to the built-in behaviour
   * — but it will not do anything, and an admin deserves to know that before
   * they flip it and conclude the feature is broken.
   */
  needsMigration?: string;
  /**
   * True when turning this on changes what somebody OUTSIDE the company can
   * see. Called out separately because it is the one category where a careless
   * flip has consequences you cannot take back by flipping it again.
   */
  external?: boolean;
  /** Flags that must also be on for this one to do anything. */
  requires?: (keyof V2Flags)[];
};

export const FLAG_CATALOGUE: FlagInfo[] = [
  /* ---------------- What customers can see and do ---------------- */
  {
    key: "external_plan_view_enabled",
    label: "Customer plan links",
    description:
      "A customer can open their plan through a signed link or the portal, and see their tasks, milestones and documents.",
    group: "customer",
    external: true,
    needsMigration: "0019",
  },
  {
    key: "external_plan_actions_enabled",
    label: "Customers can act on their plan",
    description:
      "A customer can complete a task, comment, upload a file and post in the project conversation — not just read.",
    group: "customer",
    external: true,
    requires: ["external_plan_view_enabled"],
    needsMigration: "0021",
  },
  {
    key: "conversations",
    label: "Project conversations",
    description:
      "One thread per project with @mentions. Internal notes stay internal; shared messages reach the customer through their plan.",
    group: "customer",
    needsMigration: "0029",
  },

  /* ---------------- Delivery ---------------- */
  {
    key: "journey_templates",
    label: "Journey templates",
    description: "The template builder, and plans generated from a template rather than by hand.",
    group: "delivery",
    needsMigration: "0013",
  },
  {
    key: "work_items",
    label: "Work items",
    description: "Tasks as the unit of work on a plan, with owners, dependencies and due dates.",
    group: "delivery",
    needsMigration: "0014",
  },
  {
    key: "handoff_gate",
    label: "Handoff gate",
    description:
      "The sales-to-delivery handoff packet, and the accept-or-return decision that gates a deal moving into onboarding.",
    group: "delivery",
    needsMigration: "0018",
  },
  {
    key: "handover_record",
    label: "Record a handover",
    description: "The form for recording the handover to Customer Success on the Customer 360.",
    group: "delivery",
  },
  {
    key: "lifecycle_stage_config",
    label: "Editable post-sale stages",
    description:
      "Post-sale stage labels, intents, colours and order come from your configuration instead of the built-in list.",
    group: "delivery",
    needsMigration: "0031",
  },
  {
    key: "account_model",
    label: "Account model",
    description:
      "One customer record spanning several projects, with account-level health. The schema is live either way; this switches the workflow and screens.",
    group: "delivery",
  },

  /* ---------------- Pre-sales ---------------- */
  {
    key: "presale_stage_config",
    label: "Editable pre-sale stages",
    description:
      "Pipeline stage labels, colours, order and which stage means Closed Won come from your configuration instead of the built-in list.",
    group: "presale",
    needsMigration: "0028",
  },

  /* ---------------- Integrations ---------------- */
  {
    key: "sf_auto_create",
    label: "Salesforce auto-create",
    description:
      "A closed-won opportunity arriving from Salesforce creates the customer and the project automatically.",
    group: "integrations",
    needsMigration: "0023",
  },
  {
    key: "sf_presale_bridge",
    label: "Salesforce stage bridge",
    description:
      "A deal's stage moves in step with its Salesforce opportunity. Forward only — it never moves a deal backwards.",
    group: "integrations",
    requires: ["sf_auto_create"],
    needsMigration: "0023",
  },

  /* ---------------- Platform ---------------- */
  {
    key: "signals_alerts",
    label: "Signal alerts",
    description:
      "The hourly job emails the champion-gone-quiet and launch-at-risk alerts. The /signals page is readable either way — this gates who gets mailed, never who can see.",
    group: "platform",
    needsMigration: "0024",
  },
  {
    key: "global_search",
    label: "Global search",
    description: "Search across customers, deals, tickets, solutions and people.",
    group: "platform",
  },
  {
    key: "saved_views",
    label: "Saved views",
    description: "Named, shareable filters on the list screens.",
    group: "platform",
  },
  {
    key: "trace_links_editing",
    label: "Trace links",
    description: "Linking a decision to the solution it produced, by hand, on the Customer 360.",
    group: "platform",
  },
  {
    key: "audit_activity_feed",
    label: "Account activity feed",
    description: "Changes made in the hub are written to the per-account activity feed.",
    group: "platform",
  },
  {
    key: "audit_strict",
    label: "Strict audit",
    description:
      "A failed audit write on a critical action aborts that action rather than logging and continuing. Safer, and it means an audit outage stops work.",
    group: "platform",
  },
  {
    key: "api_key_limits",
    label: "API key limits",
    description: "API key expiry and per-minute rate limits are enforced on the public API.",
    group: "platform",
    needsMigration: "0025",
  },
  {
    key: "demo_mode",
    label: "Demo mode",
    description:
      "Customer names and revenue figures are pseudonymised at the server before they reach any screen. For demos and screenshots.",
    group: "platform",
  },
];

/** Every flag in `V2Flags` should be described. Asserted in the tests. */
export function catalogueKeys(): string[] {
  return FLAG_CATALOGUE.map((f) => f.key as string);
}

export function flagsInGroup(group: FlagGroup): FlagInfo[] {
  return FLAG_CATALOGUE.filter((f) => f.group === group);
}

/**
 * Flags this one needs that are currently off.
 *
 * Turning on "Customers can act on their plan" while the view flag is off does
 * nothing at all — the server refuses before it reads anything. Saying so on
 * the screen is cheaper than the support conversation.
 */
export function unmetRequirements(
  info: FlagInfo,
  state: Record<string, boolean>,
): (keyof V2Flags)[] {
  return (info.requires ?? []).filter((k) => state[k as string] !== true);
}

/** Flags that are on and depend on this one, i.e. what turning it OFF breaks. */
export function dependentsOf(key: keyof V2Flags, state: Record<string, boolean>): FlagInfo[] {
  return FLAG_CATALOGUE.filter(
    (f) => (f.requires ?? []).includes(key) && state[f.key as string] === true,
  );
}
