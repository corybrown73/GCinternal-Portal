import type { IntegrationTier } from "./onboarding-timeline";
import type { ServiceKind } from "./onboarding-services";

/**
 * The systems we connect to and the things we build, by name.
 *
 * WHY A LIST. "QuickBooks Online", "QBO", "Quickbooks online" are one
 * project in three spellings. A tool key makes them one row in the
 * analytics, one default tier when it is added, and one name on the
 * customer's page. Anything not here is still allowed — it is just
 * "Other", named by hand, and counted under its own name.
 */
export type Tool = {
  key: string;
  name: string;
  kind: ServiceKind;
  /** Words that mean this tool when a person types the name freely. */
  aliases: string[];
  /** Integrations: the tier this usually is. */
  tier?: IntegrationTier;
};

export const TOOLS: readonly Tool[] = [
  {
    key: "qbo",
    name: "QuickBooks Online",
    kind: "integration",
    aliases: ["qbo", "quickbooks online", "quickbooks"],
    tier: 3,
  },
  {
    key: "qbd",
    name: "QuickBooks Desktop",
    kind: "integration",
    aliases: ["qbd", "quickbooks desktop", "quickbooks enterprise"],
    tier: 4,
  },
  { key: "sage", name: "Sage Intacct", kind: "integration", aliases: ["sage", "intacct"], tier: 4 },
  {
    key: "netsuite",
    name: "NetSuite",
    kind: "integration",
    aliases: ["netsuite", "net suite"],
    tier: 4,
  },
  {
    key: "salesforce",
    name: "Salesforce",
    kind: "integration",
    aliases: ["salesforce", "sfdc"],
    tier: 3,
  },
  { key: "hubspot", name: "HubSpot", kind: "integration", aliases: ["hubspot"], tier: 3 },
  {
    key: "servicetitan",
    name: "ServiceTitan",
    kind: "integration",
    aliases: ["servicetitan", "service titan"],
    tier: 4,
  },
  { key: "procore", name: "Procore", kind: "integration", aliases: ["procore"], tier: 3 },
  {
    key: "sharepoint",
    name: "SharePoint",
    kind: "integration",
    aliases: ["sharepoint", "share point", "onedrive"],
    tier: 2,
  },
  {
    key: "gsheets",
    name: "Google Sheets",
    kind: "integration",
    aliases: ["google sheets", "gsheets", "google sheet"],
    tier: 2,
  },
  { key: "dropbox", name: "Dropbox", kind: "integration", aliases: ["dropbox"], tier: 2 },
  { key: "zapier", name: "Zapier", kind: "integration", aliases: ["zapier"], tier: 2 },
  {
    key: "api",
    name: "Custom API",
    kind: "integration",
    aliases: ["api", "custom api", "webhook", "rest"],
    tier: 5,
  },
  { key: "powerbi", name: "Power BI", kind: "analytics", aliases: ["power bi", "powerbi"] },
  { key: "tableau", name: "Tableau", kind: "analytics", aliases: ["tableau"] },
  {
    key: "gc_analytics",
    name: "GoCanvas Analytics",
    kind: "analytics",
    aliases: ["gocanvas analytics", "gc analytics"],
  },
];

export function toolByKey(key: string | null | undefined): Tool | null {
  if (!key) return null;
  return TOOLS.find((t) => t.key === key) ?? null;
}

/** The tool a free-typed name means, or null. "QBO invoice sync" → QuickBooks Online. */
export function toolFromName(name: string | null | undefined): Tool | null {
  const s = (name ?? "").trim().toLowerCase();
  if (!s) return null;
  // Longest alias first, so "quickbooks desktop" wins over "quickbooks".
  const candidates = TOOLS.flatMap((t) => t.aliases.map((a) => ({ t, a })));
  candidates.sort((x, y) => y.a.length - x.a.length);
  for (const { t, a } of candidates) {
    if (s === a || s.includes(a)) return t;
  }
  return null;
}

/** Tools a kind can be, for a selector. */
export function toolsForKind(kind: ServiceKind): Tool[] {
  return TOOLS.filter((t) => t.kind === kind);
}
