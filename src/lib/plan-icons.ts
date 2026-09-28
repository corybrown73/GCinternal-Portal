import type { MilestoneKind, MilestoneOwner } from "./onboarding-timeline";

/**
 * The icons a plan step can carry — the same names the welcome page, the
 * PowerPoint deck and the plan editor draw, so a step looks the same on
 * every surface. Lucide names; icon-svg.ts on the server and plan-icon.tsx
 * in the browser both resolve them.
 */
export const PLAN_ICONS = [
  "Flag",
  "PhoneCall",
  "ClipboardCheck",
  "Wrench",
  "HardHat",
  "Target",
  "Rocket",
  "Workflow",
  "Users",
  "FileText",
  "Table2",
  "Cloud",
  "Smartphone",
  "BookOpen",
  "CalendarDays",
  "GraduationCap",
  "Search",
  "Handshake",
] as const;
export type PlanIconName = (typeof PLAN_ICONS)[number];

/** The icon's name as a person would say it. */
export const PLAN_ICON_LABEL: Record<PlanIconName, string> = {
  Flag: "Flag",
  PhoneCall: "Phone call",
  ClipboardCheck: "Clipboard",
  Wrench: "Wrench",
  HardHat: "Hard hat",
  Target: "Target",
  Rocket: "Rocket",
  Workflow: "Workflow",
  Users: "People",
  FileText: "Document",
  Table2: "Table",
  Cloud: "Cloud",
  Smartphone: "Phone",
  BookOpen: "Book",
  CalendarDays: "Calendar",
  GraduationCap: "Training",
  Search: "Search",
  Handshake: "Handshake",
};

export function isPlanIcon(name: string): name is PlanIconName {
  return (PLAN_ICONS as readonly string[]).includes(name);
}

/** What a step of each kind looks like unless somebody picks otherwise. */
export function defaultIconFor(kind: MilestoneKind): PlanIconName {
  switch (kind) {
    case "call":
      return "PhoneCall";
    case "homework":
      return "ClipboardCheck";
    case "build":
      return "HardHat";
    default:
      return "Flag";
  }
}

export const KIND_LABEL: Record<MilestoneKind, string> = {
  call: "Call",
  homework: "Homework",
  build: "Work between calls",
  milestone: "Milestone",
};

export const OWNER_LABEL: Record<MilestoneOwner, string> = {
  gocanvas: "GoCanvas",
  client: "Customer",
  both: "Together",
};
