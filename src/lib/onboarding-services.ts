/**
 * What was bought, beyond the first form.
 *
 * PHASE 1 IS ALWAYS THE FORM. The collaborative form build and training is
 * the core — value in seven days — and nothing on the SOW moves it. Every
 * other thing the customer purchased is a SERVICE: an integration, a custom
 * PDF, a paid form build, an analytics dashboard, a data load, a training
 * block. Each service is assigned to a phase. A service in phase 1 runs
 * ALONGSIDE the form, from the kickoff call — a second form build, a data
 * load, a training block can all start on day one. Services in phase 2 and
 * up wait: they run at the same time as each other, and a phase opens when
 * the one before it is done — phase 2 when the form is dialed in, phase 3
 * when phase 2 is live.
 *
 * Every kind says what we need from the customer to start it. That line is
 * what the welcome page shows next to the service and what the notes tell
 * the presenter to ask for — "for the paid form build we need the form you
 * have today" — so the ask is made on the first call, not discovered later.
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
  /**
   * Where it goes unless a person says otherwise: 1 = alongside the form
   * from kickoff; 2 = after the form is proven. Things built on real
   * submissions — integrations, PDFs, dashboards — default to 2.
   */
  defaultPhase: 1 | 2;
  /** What we need from the customer to start it, in words they read. */
  needs: string;
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
    defaultPhase: 2,
    needs: "A login to the other system, and the person on your side who owns the field mapping.",
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
    defaultPhase: 2,
    needs: "Your letterhead, and one example of the document you send today.",
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
    defaultPhase: 1,
    needs: "The form you use for it today — paper, PDF or spreadsheet — and one filled-in example.",
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
    defaultPhase: 2,
    needs: "The three questions the dashboard must answer, and who looks at it on Monday.",
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
    defaultPhase: 1,
    needs: "The list — customers, sites, assets or prices — as a spreadsheet, however rough.",
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
    defaultPhase: 1,
    needs: "Who attends: names and roles, and a date that works for the crew leads.",
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
    defaultPhase: 2,
    needs: "What done looks like, in a sentence, and who owns it on your side.",
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
  /** 1 = alongside the form from kickoff; 2 and up wait for the phase before. */
  phase: number;
  /** Integrations only. */
  tier?: IntegrationTier | null;
  /** Override the catalogue length. */
  weeks?: number | null;
  /** Override what we need from the customer to start it. */
  needs?: string | null;
  /** A known system or product (see onboarding-tools.ts), when it is one. */
  tool?: string | null;
  /** The person on our side who delivers it (team_members). */
  owner_id?: string | null;
  /** Must be Accepted before Operational Go-Live. */
  launch_critical?: boolean;
  /** How it will be accepted, in one sentence. */
  acceptance?: string | null;
  /** The customer's date for their part. */
  due?: string | null;
  /** We do not yet know it can be done. */
  feasibility_needed?: boolean;
  /** It changes something already live. */
  modifies_production?: boolean;
  /** Who has the ball, when a person set it. */
  ball?: {
    who: "us" | "customer" | "blocked_customer" | "blocked_internal";
    person: string | null;
    date: string | null;
    note: string | null;
  } | null;
  /** How it ended. */
  disposition?: {
    kind: "accepted" | "descoped" | "transferred";
    at: string;
    by: string | null;
    reason: string | null;
  } | null;
};

/** What we need from the customer to start this service: theirs if written, else the catalogue's. */
export function serviceNeeds(s: ServiceSpec): string {
  const own = s.needs?.trim();
  return own || SERVICE_KINDS[s.kind].needs;
}

/** True for the kinds that are built on real submissions and belong after the form. */
export function belongsAfterForm(kind: ServiceKind): boolean {
  return SERVICE_KINDS[kind].defaultPhase >= 2;
}

/**
 * The key two readings of the same service share: the kind and the name
 * with case, punctuation and spacing gone, so "QuickBooks Online" and
 * "Quickbooks-online integration" are one row, and a row a person removed
 * stays removed when the SOW is read again.
 */
export function normalizeServiceKey(name: string, kind: ServiceKind): string {
  const bare = name
    .toLowerCase()
    .replace(/\b(integration|form|service|the|a|an)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
  return `${kind}:${bare || name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}

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
  const list = (services ?? []).filter((s) => s && s.phase >= 1);
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

/* ------------------------------------------------- purchased solutions */

/**
 * THE OPERATING MODEL'S SOLUTIONS. Every purchased solution — Form Build,
 * Custom PDF, Integration, Analytics, Other — runs Define → Build → Accept
 * and ends Accepted, Descoped or Transferred. Each has an owner, a
 * launch-critical flag (must be Accepted before Operational Go-Live), how it
 * will be accepted, and who has the ball. A data load and a training block
 * are services the plan runs, not solutions a customer signs off.
 *
 * The four plan steps already stored under `completed["<id>:<step>"]` are
 * the solution's steps under their model names; nothing is rewritten.
 */
export const SOLUTION_KINDS: ReadonlyArray<ServiceKind> = [
  "paid_form",
  "custom_pdf",
  "integration",
  "analytics",
  "other",
];

export function isSolutionKind(kind: ServiceKind): boolean {
  return SOLUTION_KINDS.includes(kind);
}

/** The model's word for each kind: a paid form is a Form Build. */
export const SOLUTION_LABEL: Record<ServiceKind, string> = {
  paid_form: "Form Build",
  custom_pdf: "Custom PDF",
  integration: "Integration",
  analytics: "Analytics",
  other: "Other solution",
  data_load: "Data load",
  training: "Training",
};

/** The plan's step keys as the model names them. */
export const SOLUTION_STEPS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "kickoff", label: "Define" },
  { key: "build", label: "Build" },
  { key: "review", label: "Accept" },
  { key: "live", label: "Accepted" },
];

export type SolutionStatus =
  "feasibility" | "define" | "build" | "accept" | "accepted" | "descoped" | "transferred";

export const SOLUTION_STATUS_LABEL: Record<SolutionStatus, string> = {
  feasibility: "Feasibility",
  define: "Define",
  build: "Build",
  accept: "Accept — customer tests",
  accepted: "Accepted",
  descoped: "Descoped",
  transferred: "Transferred",
};

/** Where a solution is: its disposition when it has one, else the first step not done. */
export function solutionStatus(s: ServiceSpec, completed: Record<string, string>): SolutionStatus {
  if (s.disposition) return s.disposition.kind;
  const done = (step: string) => Boolean(completed[`${s.id}:${step}`]);
  if (done("live")) return "accepted";
  if (s.feasibility_needed && !completed[`${s.id}:feasible`]) return "feasibility";
  if (!done("kickoff")) return "define";
  if (!done("build")) return "build";
  return "accept";
}

export type Ball = NonNullable<ServiceSpec["ball"]>;

/**
 * Who has the ball on a solution. A person's say-so wins; otherwise Define
 * and Build are ours, Accept is the customer's (dated by their `due`), and
 * a finished one has no ball to hold.
 */
export function solutionBall(
  s: ServiceSpec,
  completed: Record<string, string>,
  ownerName: string | null = null,
): Ball | null {
  if (s.ball) return s.ball;
  const status = solutionStatus(s, completed);
  if (status === "accepted" || status === "descoped" || status === "transferred") return null;
  if (status === "accept")
    return { who: "customer", person: null, date: s.due ?? null, note: null };
  return { who: "us", person: ownerName, date: null, note: null };
}

export const BALL_LABEL: Record<Ball["who"], string> = {
  us: "With us",
  customer: "With the customer",
  blocked_customer: "Blocked — customer",
  blocked_internal: "Blocked — internal",
};

/** Launch-critical solutions not yet Accepted: the Ready to run gate waits on them. */
export function launchCriticalOpen(
  services: ReadonlyArray<ServiceSpec>,
  completed: Record<string, string>,
): ServiceSpec[] {
  return services.filter(
    (s) =>
      isSolutionKind(s.kind) &&
      s.launch_critical === true &&
      solutionStatus(s, completed) !== "accepted" &&
      !s.disposition,
  );
}

/** Solutions with no ending yet: Implementation Complete waits on every one. */
export function undispositioned(
  services: ReadonlyArray<ServiceSpec>,
  completed: Record<string, string>,
): ServiceSpec[] {
  return services.filter(
    (s) => isSolutionKind(s.kind) && !s.disposition && solutionStatus(s, completed) !== "accepted",
  );
}

/**
 * Foundation A is a new customer getting set up to build, test and run their
 * first form; B is an existing customer adding something, where we check
 * what is live first. Every implementation is one or the other.
 */
export type Foundation = "A" | "B";
export function foundationFor(path: string | null | undefined): Foundation {
  return path === "existing" || path === "dm_conversion" ? "B" : "A";
}

/**
 * "What was bought", one line each, as the handoff records it, turned into
 * solutions on the plan. "Form Build · Daily job report (launch-critical)"
 * becomes a paid_form named "Daily job report" flagged launch-critical. A
 * line that matches a solution already on the plan updates its flag and
 * keeps everything else; nothing is removed here (a person removes).
 */
export function servicesFromBought(
  lines: ReadonlyArray<string>,
  existing: ReadonlyArray<ServiceSpec>,
): ServiceSpec[] {
  const out = [...existing];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const critical = /launch[- ]critical|\bmust\b|\*/i.test(line);
    const text = line
      .replace(/\(?launch[- ]critical\)?/gi, "")
      .replace(/\*/g, "")
      .trim();
    const kind = kindFromWords(text);
    const name =
      text
        .replace(
          /^(form build|paid form|custom pdf|pdf|integration|analytics|dashboard|data load|training|other solution|other)\s*[:·—–-]\s*/i,
          "",
        )
        .replace(/[:·—–-]\s*$/, "")
        .trim() || SOLUTION_LABEL[kind];
    const key = normalizeServiceKey(name, kind);
    const i = out.findIndex((s) => normalizeServiceKey(s.name, s.kind) === key);
    if (i >= 0) {
      if (critical) out[i] = { ...out[i]!, launch_critical: true };
      continue;
    }
    out.push({
      id: key.replace(/[^a-z0-9]+/g, "-").slice(0, 40) || `sol-${out.length + 1}`,
      kind,
      name,
      phase: SERVICE_KINDS[kind].defaultPhase,
      ...(critical ? { launch_critical: true } : {}),
    });
  }
  return out;
}

export function kindFromWords(text: string): ServiceKind {
  const t = text.toLowerCase();
  if (/\bpdf\b/.test(t)) return "custom_pdf";
  if (/form build|paid form|build(ing)? (the|a|their) form|we build/.test(t)) return "paid_form";
  if (/integrat|\bapi\b|sync|connect|quickbooks|salesforce|workato|netsuite|sage|procore/.test(t))
    return "integration";
  if (/analytic|dashboard|report/.test(t)) return "analytics";
  if (/data load|data import|reference data|\blists?\b/.test(t)) return "data_load";
  if (/training|session/.test(t)) return "training";
  return "other";
}
