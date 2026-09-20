import { BRAND_PATHS } from "./brand-paths";
import type { ServiceKind } from "./onboarding-services";
import { toolByKey, toolFromName } from "./onboarding-tools";

/**
 * The mark for each thing we build or connect: a brand for a system, an
 * icon for a kind of work.
 *
 * WHY. A plan that reads "QuickBooks Online · Custom PDF · Safety form" is a
 * list; the same plan with the QuickBooks mark, a PDF badge and a form icon
 * is a picture of the project, and a picture is what a person checks off.
 *
 * Three shapes, all plain data so a server function can return them:
 *  - svg:  a vendored brand path (simple-icons, CC0) on a white tile.
 *  - mono: brand colour and initials, for the systems whose marks are not
 *          freely licensed. Honest and consistent at 20px, where a real
 *          logo would be a smudge anyway.
 *  - icon: a lucide icon name for a kind of work — form, PDF, dashboard.
 */
export type BrandMark = (
  | { kind: "svg"; title: string; hex: string; path: string }
  | { kind: "mono"; title: string; hex: string; text: string; dark?: boolean }
  | { kind: "icon"; title: string; hex: string; icon: string }
) & {
  /** The tool key (onboarding-tools.ts) when this is a system's mark, so an uploaded logo can replace it. */
  tool?: string;
};

const svg = (slug: string, title?: string): BrandMark => {
  const p = BRAND_PATHS[slug]!;
  return { kind: "svg", title: title ?? p.title, hex: p.hex, path: p.path };
};
const mono = (title: string, text: string, hex: string, dark = false): BrandMark => ({
  kind: "mono",
  title,
  hex,
  text,
  ...(dark && { dark }),
});
const icon = (title: string, name: string, hex: string): BrandMark => ({
  kind: "icon",
  title,
  hex,
  icon: name,
});

/** By tool key (onboarding-tools.ts). */
const TOOL_MARKS: Record<string, BrandMark> = {
  qbo: svg("quickbooks", "QuickBooks Online"),
  qbd: svg("quickbooks", "QuickBooks Desktop"),
  sage: svg("sage", "Sage Intacct"),
  hubspot: svg("hubspot"),
  gsheets: svg("googlesheets", "Google Sheets"),
  dropbox: svg("dropbox"),
  zapier: svg("zapier"),
  netsuite: mono("NetSuite", "NS", "#1B2B4B"),
  salesforce: mono("Salesforce", "SF", "#00A1E0"),
  servicetitan: mono("ServiceTitan", "ST", "#0B3D91"),
  procore: mono("Procore", "P", "#F47E42"),
  sharepoint: mono("SharePoint", "SP", "#036C70"),
  powerbi: mono("Power BI", "BI", "#F2C811", true),
  tableau: mono("Tableau", "T", "#E97627"),
  api: icon("Custom API", "Braces", "#12509b"),
  gc_analytics: icon("GoCanvas Analytics", "BarChart3", "#12509b"),
};

/** By kind of work, when no tool is named. */
export const KIND_MARKS: Record<ServiceKind | "form", BrandMark> = {
  form: icon("Form", "ClipboardList", "#12509b"),
  paid_form: icon("Form build", "ClipboardList", "#12509b"),
  custom_pdf: mono("Custom PDF", "PDF", "#B42318"),
  integration: icon("Integration", "Plug", "#12509b"),
  analytics: icon("Analytics dashboard", "BarChart3", "#0F766E"),
  data_load: icon("Data load", "Database", "#0F766E"),
  training: icon("Training", "GraduationCap", "#7C3AED"),
  other: icon("Service", "Wrench", "#556477"),
};

export function markForTool(toolKey: string | null | undefined): BrandMark | null {
  const t = toolByKey(toolKey);
  const m = t ? TOOL_MARKS[t.key] : undefined;
  return t && m ? { ...m, tool: t.key } : null;
}

/** The mark for a service: its tool's brand when one is named or recognisable, else its kind. */
export function markForService(svc: {
  kind: ServiceKind;
  name?: string | null;
  tool?: string | null;
}): BrandMark {
  const tool = toolByKey(svc.tool) ?? toolFromName(svc.name);
  if (tool && TOOL_MARKS[tool.key]) return { ...TOOL_MARKS[tool.key]!, tool: tool.key };
  return KIND_MARKS[svc.kind];
}

/** Every mark the library knows, for an admin page or a legend. */
export function allToolMarks(): Array<{ key: string; mark: BrandMark }> {
  return Object.entries(TOOL_MARKS).map(([key, mark]) => ({ key, mark: { ...mark, tool: key } }));
}
