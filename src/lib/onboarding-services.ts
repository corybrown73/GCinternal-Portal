/**
 * What was bought, beyond the first form.
 *
 * PHASE 1 IS ALWAYS THE FORM. The collaborative form build and training is
 * the core — value in seven days — and nothing on the SOW moves it. Every
 * other thing the customer purchased is a SERVICE: an integration, a custom
 * PDF, a paid form build, an analytics dashboard, a data load, a training
 * block. Each service is assigned to a phase (2, 3, …). Services in the
 * same phase run at the same time; a phase opens when the one before it is
 * done — phase 2 when the form is dialed in, phase 3 when phase 2 is live.
 *
 * THE CATALOGUE below is the kinds a SOW can contain, from the team's own
 * complexity tiering: default length, the four steps each one runs through,
 * and how much it adds to the deal's weight for assignment. A person ticks
 * what the SOW says (the SOW stays attached as the record); a parser can
 * pre-fill the same list later without changing anything downstream.
 */

import { INTEGRATION_TIERS, type IntegrationTier } from "./onboarding-timeline";

export type ServiceKind =
  "integration" | "custom_pdf" | "paid_form" | "analytics" | "data_load" | "training" | "other";

export type ServiceStep = {
  key: string;
  label: string;
  owner: "gocanvas" | "client" | "both";
  kind: "call" | "build" | "milestone";
  minutes?: number;
  /** Fraction of the service's span, 0 = first business day, 1 = last. */
  at: number;
  detail: string;
  icon: string;
};

export type ServiceKindSpec = {
  kind: ServiceKind;
  label: string;
  /** Default length in weeks; an integration's comes from its tier. */
  weeks: number;
  /** Assignment weight this adds. */
  points: number;
  icon: string;
  steps: ServiceStep[];
};

const fourSteps = (
  a: [string, string],
  b: [string, string],
  c: [string, string],
  d: [string, string],
  icons: [string, string, string, string] = ["Workflow", "Wrench", "HardHat", "Rocket"],
): ServiceStep[] => [
  {
    key: "kickoff",
    label: a[0],
    owner: "both",
    kind: "call",
    minutes: 30,
    at: 0,
    detail: a[1],
    icon: icons[0],
  },
  {
    key: "build",
    label: b[0],
    owner: "gocanvas",
    kind: "build",
    at: 0.45,
    detail: b[1],
    icon: icons[1],
  },
  {
    key: "review",
    label: c[0],
    owner: "client",
    kind: "build",
    at: 0.75,
    detail: c[1],
    icon: icons[2],
  },
  {
    key: "live",
    label: d[0],
    owner: "both",
    kind: "milestone",
    at: 1,
    detail: d[1],
    icon: icons[3],
  },
];

export const SERVICE_KINDS: Record<ServiceKind, ServiceKindSpec> = {
  integration: {
    kind: "integration",
    label: "Integration",
    weeks: 2,
    points: 0, // the tier carries the points
    icon: "Workflow",
    steps: fourSteps(
      [
        "Kickoff & final details",
        "Systems, fields, credentials, who owns the mapping — the details we could not know until the form was real.",
      ],
      [
        "Connection built",
        "Built against the form your crew has already run, so the mapping matches the field.",
      ],
      [
        "You test it end to end",
        "Real submissions, real records on the other side. You tell us what is off.",
      ],
      ["Integration live", "Every submission lands where the office already works."],
    ),
  },
  custom_pdf: {
    kind: "custom_pdf",
    label: "Custom PDF",
    weeks: 1,
    points: 1,
    icon: "FileText",
    steps: fourSteps(
      [
        "PDF layout call",
        "Your letterhead, the fields in the order the customer reads them, what goes where.",
      ],
      ["First draft", "Built from real submissions, so the layout is proven on real data."],
      ["You mark it up", "Send one back with the changes. Usually one round, rarely two."],
      ["PDF live", "Every submission produces the document the customer expects."],
      ["FileText", "Wrench", "PenLine", "Rocket"],
    ),
  },
  paid_form: {
    kind: "paid_form",
    label: "Additional form build",
    weeks: 1,
    points: 1,
    icon: "ClipboardCheck",
    steps: fourSteps(
      [
        "Build session",
        "Thirty minutes, hands on the keyboard together — the same way as the first.",
      ],
      ["Logic & notifications", "Routing, calculations and the notifications the office wants."],
      ["Field test", "One crew, real jobs. We fix what the field says."],
      ["Form live", "In the field, and the office sees the work as it happens."],
      ["ClipboardCheck", "Wrench", "HardHat", "Rocket"],
    ),
  },
  analytics: {
    kind: "analytics",
    label: "Analytics dashboard",
    weeks: 1,
    points: 1,
    icon: "Table2",
    steps: fourSteps(
      [
        "What you need to see",
        "The three questions the dashboard must answer, and who looks at it on Monday.",
      ],
      ["Dashboard built", "Built on the submissions already coming in."],
      ["You review it", "Against a real week of data. What is missing, what is noise."],
      ["Dashboard live", "Shared with the people who asked for it."],
      ["Table2", "Wrench", "Users", "Rocket"],
    ),
  },
  data_load: {
    kind: "data_load",
    label: "Data load",
    weeks: 1,
    points: 1,
    icon: "Cloud",
    steps: fourSteps(
      [
        "What to load",
        "Customers, sites, assets, price lists — the reference data crews pick from.",
      ],
      ["Loaded", "Cleaned and loaded, so nothing is typed twice."],
      ["You spot-check it", "Ten records against the source. Then we trust it."],
      ["Data live", "Every dropdown in the field reads from it."],
      ["Cloud", "Wrench", "HardHat", "Rocket"],
    ),
  },
  training: {
    kind: "training",
    label: "Training block",
    weeks: 0.5,
    points: 1,
    icon: "Users",
    steps: [
      {
        key: "kickoff",
        label: "Training session",
        owner: "both",
        kind: "call",
        minutes: 60,
        at: 0,
        detail: "Admins and crew leads, on your forms, on your data.",
        icon: "Users",
      },
      {
        key: "live",
        label: "Trained",
        owner: "both",
        kind: "milestone",
        at: 1,
        detail: "Recording and the quick-reference shared with everyone who attended.",
        icon: "Rocket",
      },
    ],
  },
  other: {
    kind: "other",
    label: "Other service",
    weeks: 1,
    points: 1,
    icon: "Wrench",
    steps: fourSteps(
      ["Kickoff & details", "What it is, what done looks like, who owns what."],
      ["Built", "Built and checked on our side."],
      ["You review it", "Against real use. You tell us what is off."],
      ["Live", "In use."],
    ),
  },
};

export const SERVICE_KIND_LIST: ServiceKindSpec[] = Object.values(SERVICE_KINDS);

/** A service as stored on the intake. Only what a person chose; the rest is the catalogue's. */
export type ServiceSpec = {
  id: string;
  kind: ServiceKind;
  /** "QuickBooks Online", "Invoice PDF", "Safety Inspection form". */
  name: string;
  /** 2 or later. Phase 1 is the form and is never a service. */
  phase: number;
  /** Integrations only. */
  tier?: IntegrationTier | null;
  /** Override the catalogue length. */
  weeks?: number | null;
};

/** Length of a service, in weeks: the tier's for an integration, else the catalogue's, unless overridden. */
export function serviceWeeks(s: ServiceSpec): number {
  if (s.weeks && s.weeks > 0) return s.weeks;
  if (s.kind === "integration") {
    const tier = INTEGRATION_TIERS.find((t) => t.tier === (s.tier ?? 3));
    return tier?.weeks || 2;
  }
  return SERVICE_KINDS[s.kind].weeks;
}

export function servicePoints(s: ServiceSpec): number {
  return SERVICE_KINDS[s.kind].points;
}

/**
 * The services list, with the legacy single-integration knobs folded in so
 * a deal set up before services existed still shows its integration.
 */
export function normalizeServices(
  services: ServiceSpec[] | undefined,
  legacy: { integration_tier?: number | null; integration_target?: string | null },
): ServiceSpec[] {
  const list = (services ?? []).filter((s) => s && s.phase >= 2);
  const hasIntegration = list.some((s) => s.kind === "integration");
  if (!hasIntegration && legacy.integration_tier && legacy.integration_tier > 0) {
    const tier = INTEGRATION_TIERS.find((t) => t.tier === legacy.integration_tier);
    if (tier && tier.weeks > 0) {
      list.push({
        id: "legacy-integration",
        kind: "integration",
        name: legacy.integration_target ?? "Integration",
        phase: 2,
        tier: tier.tier,
      });
    }
  }
  return list;
}
