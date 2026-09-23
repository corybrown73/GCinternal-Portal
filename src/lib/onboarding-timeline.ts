/**
 * Phase 1, as dates.
 *
 * THE RULE THIS ENCODES. A new customer has their first form live within
 * fifteen business days of closing, trained over three sixty-minute calls
 * with real jobs between them. We drive the pace: the plan has dates before
 * anyone asks for them, and the kickoff is booked in the first days, not
 * "when they are ready" — the accounts that stalled were the ones that
 * churned.
 *
 * TEACH THEM TO FISH. Every call is hands on their keyboard, on their real
 * form, with their real data; by the end of day 3 their admin builds and
 * fixes forms without us. Every step below is owned by somebody — us, them,
 * or both — and the "both" steps are where the value is.
 *
 * INTEGRATIONS ARE PHASE 2, always, and PHASE 2 IS GATED. The form is the
 * star: field mapping cannot be right until a crew has run the form on real
 * jobs. So an integration has no fixed start until a person records that the
 * form is dialed in — until then its dates are "earliest", anchored on the
 * live date. Once the form is proven, phase 2 re-anchors on that day and
 * opens with its own thirty-minute kickoff where the final details are
 * gathered: systems, fields, credentials, who owns the mapping. Then it
 * extends by the tier's weeks. It never delays the form.
 *
 * Pure. Business days only; holidays are a parameter, and every date can be
 * moved by hand (a weird holiday, a customer who is closed Fridays). MOVING
 * A DATE MOVES EVERYTHING AFTER IT by the same number of business days —
 * a kickoff that slips two days slips the whole week — and never anything
 * before it. A later date moved by hand sets its own shift from there. The
 * plan reports which date a person moved and which ones followed.
 */

import {
  normalizeServices,
  SERVICE_KINDS,
  serviceWeeks,
  type ServiceKind,
  type ServiceSpec,
  serviceNeeds,
} from "./onboarding-services";

export type MilestoneOwner = "gocanvas" | "client" | "both";
export type MilestoneKind = "call" | "homework" | "build" | "milestone";

export type MilestoneSpec = {
  key: string;
  /** Business days after close. Day 0 is the close itself. */
  day: number;
  /** The last day of a step that spans more than one, so no day goes missing. */
  throughDay?: number;
  label: string;
  owner: MilestoneOwner;
  kind: MilestoneKind;
  /** Minutes, for calls. */
  minutes?: number;
  detail: string;
  /** The homework this step assigns, when it does. */
  homework?: string[];
  icon: string;
};

/**
 * Two paths, one shape.
 *
 * A NEW LOGO builds its first form in fifteen business days. An EXISTING ACCOUNT that
 * bought services already runs forms — phase 1 there is a review: the form
 * the integration reads from, optimised for it. Sometimes that means a new
 * form, sometimes a few fields, sometimes nothing. Same keys, same gates,
 * same rule for everything after, so every screen and every date follows.
 */
export type OnboardingPath =
  "new_logo" | "existing" | "dm_conversion" | "field_fusion" | "field_fusion";

/** The four kinds of account, in the words the pickers use. */
export const PATH_LABEL: Record<OnboardingPath, string> = {
  new_logo: "New customer — first implementation",
  existing: "Existing account — adding services",
  dm_conversion: "Device Magic → GoCanvas conversion",
  field_fusion: "Field Fusion — GoCanvas training, forms already built",
};
/** Short, for a chip on a board. */
export const PATH_CHIP: Record<OnboardingPath, string> = {
  new_logo: "New",
  existing: "Existing",
  dm_conversion: "DM → GC",
  field_fusion: "Field Fusion",
};

/**
 * True when phase 1 is training, not a form build: every Field Fusion
 * account (the product ships set up; the crew needs to be shown it) and any
 * other account where the person said "no form — they just need training".
 */
export function isTrainingPlan(
  path: OnboardingPath | null | undefined,
  trainingOnly?: boolean | null,
): boolean {
  return path === "field_fusion" || trainingOnly === true;
}

/**
 * Phase 1 for a new logo: the three training days, over fifteen business
 * days from the close. The keys are the contract the deck renders.
 *
 * Day 1 is the kickoff call: 25 minutes on the kickoff deck (introductions,
 * their process walked together), then the lay of the land and their own
 * form, published. Day 2 builds it properly on their real data. A week of
 * real jobs follows, then day 3 runs the back office. Every call is sixty
 * minutes with their hands on the keyboard; the goal is an admin who can
 * build and fix forms without us by the end of day 3.
 */
export const NEW_LOGO_PLAN: readonly MilestoneSpec[] = [
  {
    key: "close",
    day: 0,
    label: "Deal closes",
    owner: "gocanvas",
    kind: "milestone",
    detail: "We reply to your account executive's email the same day and book the kickoff.",
    icon: "Flag",
  },
  {
    key: "kickoff",
    day: 2,
    label: "Training day 1 — kickoff and your first form",
    owner: "both",
    kind: "call",
    minutes: 60,
    detail:
      "Introductions and your process, walked together. Then the lay of the land — screens, fields, field types — your form on screen, published by you, and one submission landing.",
    homework: [
      "Run the form on two real jobs",
      "Send us your client or parts list as a spreadsheet",
      "Add one field user who will test on real jobs",
    ],
    icon: "PhoneCall",
  },
  {
    key: "homework",
    day: 3,
    label: "Your part before the next call",
    owner: "client",
    kind: "homework",
    detail:
      "The three things above. Day 2 starts from two real submissions and your real list, not a blank account.",
    icon: "ClipboardCheck",
  },
  {
    key: "working",
    day: 5,
    label: "Training day 2 — build it properly",
    owner: "both",
    kind: "call",
    minutes: 60,
    detail:
      "Reference data, dropdowns, conditional logic, calculations, workflow and dispatch — on your real data. You leave with the form as it will actually be used.",
    homework: ["One crew runs it on real jobs", "Write down what slows them down"],
    icon: "Wrench",
  },
  {
    key: "fieldtest",
    day: 6,
    throughDay: 10,
    label: "A week of real jobs",
    owner: "client",
    kind: "build",
    detail:
      "One crew, real jobs. We watch the submissions come in; what slows the crew down is the first thing day 3 fixes.",
    icon: "HardHat",
  },
  {
    key: "adjust",
    day: 11,
    label: "Training day 3 — run the back office",
    owner: "both",
    kind: "call",
    minutes: 60,
    detail:
      "Edit submissions, automatic emails, the PDF the office receives, exports and reports, users and departments. Then the changes the crew asked for, made by you.",
    homework: ["Build your second form on your own — we review it"],
    icon: "Target",
  },
  {
    key: "live",
    day: 15,
    label: "First form live",
    owner: "both",
    kind: "milestone",
    detail:
      "The form is in the field, the office works from the data, and your admin builds the next one without us.",
    icon: "Rocket",
  },
];

/** The old name, kept for the callers that still say it. Same plan. */
export const SEVEN_DAY_PLAN = NEW_LOGO_PLAN;

/**
 * Phase 1 for an existing account adding services: review the form the
 * integration reads from and make it ready. Same keys as the seven-day plan
 * so times, invites, homework and every screen keep working; different
 * words, six business days instead of seven.
 */
export const EXISTING_PLAN: readonly MilestoneSpec[] = [
  {
    key: "close",
    day: 0,
    label: "Welcome aboard",
    owner: "gocanvas",
    kind: "milestone",
    detail: "Welcome email the same day, with the review call invite already in it.",
    icon: "Flag",
  },
  {
    key: "kickoff",
    day: 1,
    label: "Form review for the integration",
    owner: "both",
    kind: "call",
    minutes: 45,
    detail:
      "Walk the form the integration reads from, field by field. Decide together: use it as it is, adjust it, or build the one it needs.",
    homework: [
      "Tell us which form or forms feed this integration",
      "Send one example of the output the office needs",
      "Name who owns the field mapping on your side",
    ],
    icon: "PhoneCall",
  },
  {
    key: "homework",
    day: 2,
    label: "Your part before the next call",
    owner: "client",
    kind: "homework",
    detail:
      "The three things above. Fifteen minutes, and the optimisation session starts from the real form and the real output.",
    icon: "ClipboardCheck",
  },
  {
    key: "working",
    day: 3,
    label: "Optimisation session",
    owner: "both",
    kind: "call",
    minutes: 30,
    detail:
      "Hands on the keyboard together. The fields the integration needs, named the way the other system names them — you make the changes, we guide.",
    homework: ["Run the optimised form on a few real jobs"],
    icon: "Wrench",
  },
  {
    key: "fieldtest",
    day: 4,
    label: "Run it on real jobs",
    owner: "client",
    kind: "build",
    detail:
      "A handful of real submissions through the optimised form, so the mapping is built on real data, not a guess.",
    icon: "HardHat",
  },
  {
    key: "adjust",
    day: 5,
    label: "Last adjustments",
    owner: "both",
    kind: "build",
    detail: "What the real submissions showed. Usually a field or two, rarely more.",
    icon: "Target",
  },
  {
    key: "live",
    day: 6,
    label: "Form ready for the integration",
    owner: "both",
    kind: "milestone",
    detail: "Every field the integration needs is there and proven on real jobs. Phase 2 can open.",
    icon: "Rocket",
  },
];

/**
 * An existing account where the CUSTOMER builds the form and we build the
 * integration. The kickoff splits the work out loud, their build has a date,
 * a check-in keeps it honest, and the integration starts the day the form is
 * frozen. Same keys, same gates: "live" here means "frozen".
 */
export const CUSTOMER_BUILD_PLAN: readonly MilestoneSpec[] = [
  {
    key: "close",
    day: 0,
    label: "Welcome aboard",
    owner: "gocanvas",
    kind: "milestone",
    detail: "Welcome email the same day, with the kickoff invite already in it.",
    icon: "Flag",
  },
  {
    key: "kickoff",
    day: 1,
    label: "Kickoff — you build the form, we build the integration",
    owner: "both",
    kind: "call",
    minutes: 60,
    detail:
      "Agree the split out loud: which form you are building, by when, and what the integration needs from it — the fields, named the way the other system names them.",
    homework: [
      "Name who builds the form on your side, and the date it will be done",
      "Send one example of the output the office needs",
      "Name who owns the field mapping on your side",
    ],
    icon: "PhoneCall",
  },
  {
    key: "homework",
    day: 2,
    label: "Your part before the next call",
    owner: "client",
    kind: "homework",
    detail: "The three things above. Fifteen minutes, and your build has a name and a date.",
    icon: "ClipboardCheck",
  },
  {
    key: "working",
    day: 5,
    label: "Check-in on your build",
    owner: "both",
    kind: "call",
    minutes: 30,
    detail:
      "Thirty minutes on your form as it stands. The fields the integration needs are there, or we say which are missing — while there is still time.",
    homework: ["Finish the form", "Run it on a few real jobs before it is frozen"],
    icon: "Wrench",
  },
  {
    key: "fieldtest",
    day: 6,
    throughDay: 8,
    label: "Your build, on real jobs",
    owner: "client",
    kind: "build",
    detail:
      "A handful of real submissions through your form, so the mapping is built on real data.",
    icon: "HardHat",
  },
  {
    key: "adjust",
    day: 9,
    label: "Freeze the form together",
    owner: "both",
    kind: "build",
    detail:
      "The last field changes. After this the form does not move while the integration is built.",
    icon: "Target",
  },
  {
    key: "live",
    day: 10,
    label: "Form frozen — the integration starts",
    owner: "both",
    kind: "milestone",
    detail: "Every field the integration needs is there and proven on real jobs. Phase 2 opens.",
    icon: "Rocket",
  },
];

/**
 * A Device Magic customer moving to GoCanvas. Same keys and days as the
 * new-logo plan, so every screen keeps working; the words are about the
 * forms they already run and the day the first one moves over. The crew
 * runs the GoCanvas form alongside Device Magic on real jobs, and Device
 * Magic retires for that form on the live day.
 */
export const DM_CONVERSION_PLAN: readonly MilestoneSpec[] = [
  {
    key: "close",
    day: 0,
    label: "Welcome aboard",
    owner: "gocanvas",
    kind: "milestone",
    detail: "We reply to your account executive's email the same day and book the kickoff.",
    icon: "Flag",
  },
  {
    key: "kickoff",
    day: 2,
    label: "Training day 1 — kickoff and your first form",
    owner: "both",
    kind: "call",
    minutes: 60,
    detail:
      "Introductions, and your Device Magic forms walked together. Pick the one the crew uses most and put it on screen in GoCanvas — field for field, then better — published by you.",
    homework: [
      "Send us your Device Magic forms list, or a screenshot of each form",
      "Send one recent submission from the first form, as the office receives it",
      "Add one field user who will run the GoCanvas form on real jobs",
    ],
    icon: "PhoneCall",
  },
  {
    key: "homework",
    day: 3,
    label: "Your part before the next call",
    owner: "client",
    kind: "homework",
    detail: "The three things above. Day 2 starts from your real form and your real output.",
    icon: "ClipboardCheck",
  },
  {
    key: "working",
    day: 5,
    label: "Training day 2 — build it properly",
    owner: "both",
    kind: "call",
    minutes: 60,
    detail:
      "Reference data, dropdowns, logic and calculations, matched to the output the office expects. You make the changes, not us.",
    homework: [
      "Hand the GoCanvas form to your field tester",
      "Run it alongside Device Magic on real jobs for a week",
    ],
    icon: "Wrench",
  },
  {
    key: "fieldtest",
    day: 6,
    throughDay: 10,
    label: "A week alongside Device Magic",
    owner: "client",
    kind: "build",
    detail:
      "One crew runs the GoCanvas form on real jobs while Device Magic still runs. What they say is what we fix.",
    icon: "HardHat",
  },
  {
    key: "adjust",
    day: 11,
    label: "Training day 3 — run the back office",
    owner: "both",
    kind: "call",
    minutes: 60,
    detail:
      "Edit submissions, automatic emails, the PDF, exports and reports, users and departments — and the changes the real jobs asked for.",
    icon: "Target",
  },
  {
    key: "live",
    day: 15,
    label: "First form live — Device Magic retires for it",
    owner: "both",
    kind: "milestone",
    detail:
      "The crew runs the GoCanvas form and nothing else for it. The rest of your Device Magic forms follow, one at a time, the same way.",
    icon: "Rocket",
  },
];

/**
 * No form to build: GoCanvas training. The forms already exist — a Field
 * Fusion account ships with them, and some accounts just buy training — so
 * the plan is three thirty-minute calls over two weeks, with real jobs in
 * between. Same keys as the seven-day plan, so every screen and every date
 * keeps working; the days stretch to ten.
 */
export const TRAINING_PLAN: readonly MilestoneSpec[] = [
  {
    key: "close",
    day: 0,
    label: "Welcome aboard",
    owner: "gocanvas",
    kind: "milestone",
    detail: "Welcome email the same day, with the first session's invite already in it.",
    icon: "Flag",
  },
  {
    key: "kickoff",
    day: 1,
    label: "Session 1 — the admin portal, and build a form",
    owner: "both",
    kind: "call",
    minutes: 30,
    detail:
      "How to find your way around the admin portal, and how to build a form — you build one with us on the call, start to finish.",
    homework: [
      "Build one form yourself, for a job you actually do",
      "Send us the name and email of everyone who needs a login",
      "Send us a client list or parts list you use today, as a spreadsheet",
    ],
    icon: "PhoneCall",
  },
  {
    key: "homework",
    day: 2,
    label: "Your part before the next call",
    owner: "client",
    kind: "homework",
    detail:
      "The three things above. The form you build is what session 2 starts from; the list is what it loads.",
    icon: "ClipboardCheck",
  },
  {
    key: "working",
    day: 5,
    label: "Session 2 — reference data, calculations, and a PDF",
    owner: "both",
    kind: "call",
    minutes: 30,
    detail:
      "Load your client or parts list as reference data, add the advanced calculations your jobs need, and build the PDF the office receives.",
    homework: [
      "Run the form on real jobs for a week",
      "Write down what the office wants to see from the data",
    ],
    icon: "Wrench",
  },
  {
    key: "fieldtest",
    day: 6,
    throughDay: 9,
    label: "A week of real jobs, on your own",
    owner: "client",
    kind: "build",
    detail:
      "The crew runs it on real jobs without us on the call. What slows them down is what session 3 covers first.",
    icon: "HardHat",
  },
  {
    key: "adjust",
    day: 10,
    label: "Session 3 — where the data goes, and what you can do with it",
    owner: "both",
    kind: "call",
    minutes: 30,
    detail:
      "Submissions, reports and exports: where the data lands, how the office works from it, and what to connect it to next.",
    icon: "Target",
  },
  {
    key: "live",
    day: 10,
    label: "Novice to expert — your crew is live",
    owner: "both",
    kind: "milestone",
    detail:
      "You have built a form, loaded your data, and know where it goes. Anyone who joins later gets the same walkthrough from your own team.",
    icon: "Rocket",
  },
];

/**
 * How an existing account's phase 1 runs: a REVIEW of a form that is final,
 * a build by US (the new-logo build), or a build by the CUSTOMER with a
 * frozen-form gate. The Account Manager's two questions decide it.
 */
export type ExistingBuild = "review" | "us" | "customer";

export function planFor(
  path: OnboardingPath | null | undefined,
  opts:
    | {
        trainingOnly?: boolean | null | undefined;
        existingBuild?: ExistingBuild | null | undefined;
      }
    | boolean
    | null = null,
): readonly MilestoneSpec[] {
  const o = typeof opts === "object" && opts !== null ? opts : { trainingOnly: opts };
  if (isTrainingPlan(path, o.trainingOnly)) return TRAINING_PLAN;
  if (path === "existing") {
    return o.existingBuild === "us"
      ? NEW_LOGO_PLAN
      : o.existingBuild === "customer"
        ? CUSTOMER_BUILD_PLAN
        : EXISTING_PLAN;
  }
  return path === "dm_conversion" ? DM_CONVERSION_PLAN : NEW_LOGO_PLAN;
}

/**
 * Integration complexity, from the tiering GoCanvas already uses internally.
 * Weeks are what the integration takes once it starts: two to four by tier,
 * six when nobody has tiered it. On an existing account with a final form
 * it starts in week one, beside the review, so the whole thing is two to
 * four weeks; a form that still needs building adds its two weeks first.
 */
export const INTEGRATION_TIERS = [
  { tier: 0, name: "None", weeks: 0, summary: "No integration in scope." },
  {
    tier: 1,
    name: "Standard",
    weeks: 0,
    summary: "Free form build only. Nothing to connect.",
  },
  {
    tier: 2,
    name: "Intermediate",
    weeks: 2,
    summary:
      "Level 1: PDF to Drive, OneDrive or Dropbox; form-to-form; calendar; text or email notifications.",
  },
  {
    tier: 3,
    name: "Advanced",
    weeks: 3,
    summary:
      "Level 2: form-to-form loops, dispatch, QuickBooks Online, Salesforce, Slack, photo integration.",
  },
  {
    tier: 4,
    name: "Complex",
    weeks: 4,
    summary:
      "Level 3: Workato-listed integrations, QuickBooks Desktop, Sage, self-serve integrations.",
  },
  {
    tier: 5,
    name: "Unknown",
    weeks: 6,
    summary:
      "Level 4: not in Workato, API documentation approved by post-sales; Portal; a new integration.",
  },
] as const;

export type IntegrationTier = (typeof INTEGRATION_TIERS)[number]["tier"];

/**
 * Phase 2, in order. `at` is the fraction of the tier's span, so a two-week
 * integration and a six-week one have the same shape at different scales.
 * The kickoff is always the first business day of the phase.
 */
export const INTEGRATION_PLAN: readonly (Omit<MilestoneSpec, "day"> & { at: number })[] = [
  {
    key: "integ_kickoff",
    at: 0,
    label: "Kickoff & final details",
    owner: "both",
    kind: "call",
    minutes: 30,
    detail:
      "Systems, fields, credentials, who owns the mapping — the details we could not know until the form was real.",
    icon: "Workflow",
  },
  {
    key: "integ_build",
    at: 0.45,
    label: "Connection built",
    owner: "gocanvas",
    kind: "build",
    detail: "Built against the form your crew has already run, so the mapping matches the field.",
    icon: "Wrench",
  },
  {
    key: "integ_test",
    at: 0.75,
    label: "You test it end to end",
    owner: "client",
    kind: "build",
    detail: "Real submissions, real records on the other side. You tell us what is off.",
    icon: "HardHat",
  },
  {
    key: "integ_live",
    at: 1,
    label: "Integration live",
    owner: "both",
    kind: "milestone",
    detail: "Every submission lands where the office already works.",
    icon: "Rocket",
  },
];

export type TimelineOptions = {
  /** ISO date, YYYY-MM-DD. The day the deal closed. */
  closeDate: string;
  /** New logo (the seven-day form), an existing account (the form review), a conversion, or Field Fusion (training). */
  path?: OnboardingPath | null;
  /** No form to build on this account: phase 1 is the training plan whatever the path. */
  trainingOnly?: boolean | null;
  /** On an existing account: review the form, we build it, or the customer builds it. */
  existingBuild?: ExistingBuild | null;
  /** Milestone key → ISO date, for the ones a person moved. */
  overrides?: Record<string, string>;
  /** ISO dates to skip, on top of weekends. */
  holidays?: string[];
  integrationTier?: IntegrationTier;
  /** What is being connected, for the deck to name it. */
  integrationTarget?: string | null;
  /**
   * ISO date a person recorded the form as dialed in. Null means phase 2 is
   * not yet unlocked and its dates are the earliest they could be.
   */
  formProvenOn?: string | null;
  /** Milestone key → ISO date it was actually done. */
  completed?: Record<string, string>;
  /** Milestone key → "HH:MM" local time, for the calls. */
  times?: Record<string, string>;
  /** IANA zone the times are in. */
  timezone?: string | null;
  /**
   * Everything bought beyond the first form, each assigned to a phase ≥ 2.
   * See onboarding-services.ts. The legacy integrationTier/Target pair is
   * folded in when this is empty.
   */
  services?: ServiceSpec[];
};

export type Milestone = MilestoneSpec & {
  /** ISO date. */
  date: string;
  /** True when a person moved this one by hand. */
  moved: boolean;
  /** True when it moved because an earlier date was moved by hand. */
  shifted: boolean;
  /** The date the plan would have given it, after earlier moves are applied. */
  plannedDate: string;
  /** ISO date it was actually done, when somebody marked it. */
  doneOn: string | null;
  /** "HH:MM" local time, for a call with one booked. */
  time: string | null;
  /** 1 for the form; the service's phase otherwise. */
  phase: number;
  /** The service this step belongs to; undefined for the seven-day plan. */
  serviceId?: string;
};

export type ServicePlan = {
  id: string;
  kind: ServiceKind;
  label: string;
  name: string;
  phase: number;
  weeks: number;
  tier: IntegrationTier | null;
  icon: string;
  startsOn: string;
  endsOn: string;
  /** The day its last step was marked done, when it was. */
  doneOn: string | null;
  /** What we need from the customer to start it. */
  needs: string;
  milestones: Milestone[];
};

export type Phase = {
  phase: number;
  label: string;
  /** What opens it, in words the customer reads. */
  gate: string;
  /** True while its dates are "earliest", not committed. */
  tentative: boolean;
  startsOn: string | null;
  endsOn: string | null;
  done: boolean;
  services: ServicePlan[];
};

export type Timeline = {
  closeDate: string;
  path: OnboardingPath;
  /** Phase 1 is training, not a form build — the words on every screen follow it. */
  training: boolean;
  /** On an existing account, who builds the form in phase 1. Null elsewhere. */
  existingBuild: ExistingBuild | null;
  milestones: Milestone[];
  /** The live date — the last of the seven days, after overrides. */
  liveDate: string;
  /** The day the form actually went live, when marked. */
  liveDoneOn: string | null;
  /** IANA zone the call times are in, when any are set. */
  timezone: string | null;
  /** How many of the plan's steps are marked done. */
  progress: { done: number; total: number };
  /** Services that run alongside the form, from the kickoff call. */
  alongside: ServicePlan[];
  /** Phases 2 and up. Empty when nothing beyond the form was bought. */
  phases: Phase[];
  /** 1 while the form is being built; then the lowest phase with work left. */
  currentPhase: number;
  /** True when every phase is done. */
  allDone: boolean;
  /** The first integration, for the parts of the app that speak of one. */
  integration: {
    tier: IntegrationTier;
    name: string;
    weeks: number;
    summary: string;
    target: string | null;
    /** ISO dates; null when there is no integration. */
    startsOn: string | null;
    endsOn: string | null;
    /** The gate: null until a person says the form is dialed in. */
    provenOn: string | null;
    /** True while the dates are "earliest", not committed. */
    tentative: boolean;
    /** Phase 2's own milestones, empty when there is no integration. */
    milestones: Milestone[];
  };
};

/* ------------------------------------------------------------ date maths */

const DAY_MS = 86_400_000;

function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * `n` business days after `from` (before, when negative), skipping weekends
 * and the given holidays.
 */
export function addBusinessDays(from: string, n: number, holidays: readonly string[] = []): string {
  const skip = new Set(holidays);
  let d = parseIso(from);
  let left = Math.abs(n);
  const step = n < 0 ? -DAY_MS : DAY_MS;
  while (left > 0) {
    d = new Date(d.getTime() + step);
    if (!isWeekend(d) && !skip.has(toIso(d))) left -= 1;
  }
  return toIso(d);
}

/** Signed count of business days from `a` to `b`. */
export function businessDaysBetween(
  a: string,
  b: string,
  holidays: readonly string[] = [],
): number {
  const skip = new Set(holidays);
  const sign = b >= a ? 1 : -1;
  let d = parseIso(a);
  const end = parseIso(b).getTime();
  let n = 0;
  while ((sign > 0 && d.getTime() < end) || (sign < 0 && d.getTime() > end)) {
    d = new Date(d.getTime() + sign * DAY_MS);
    if (!isWeekend(d) && !skip.has(toIso(d))) n += sign;
  }
  return n;
}

/** The same day, or the next business day if it lands on a weekend or holiday. */
export function onBusinessDay(iso: string, holidays: readonly string[] = []): string {
  const skip = new Set(holidays);
  let d = parseIso(iso);
  while (isWeekend(d) || skip.has(toIso(d))) d = new Date(d.getTime() + DAY_MS);
  return toIso(d);
}

export function addWeeks(from: string, weeks: number): string {
  return toIso(new Date(parseIso(from).getTime() + weeks * 7 * DAY_MS));
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------- the plan */

export function buildTimeline(options: TimelineOptions): Timeline {
  if (!ISO.test(options.closeDate)) throw new Error("closeDate must be YYYY-MM-DD");
  const holidays = options.holidays ?? [];
  const overrides = options.overrides ?? {};
  const completed = options.completed ?? {};
  const times = options.times ?? {};

  // The cascade: a hand-moved date sets a shift, in business days, that
  // every later date inherits until another hand-moved date resets it.
  const cascade = <S extends Omit<MilestoneSpec, "day"> & { day?: number }>(
    specs: readonly S[],
    baseDate: (spec: S) => string,
  ): Milestone[] => {
    let shift = 0;
    return specs.map((spec) => {
      const base = baseDate(spec);
      const plannedDate = shift === 0 ? base : addBusinessDays(base, shift, holidays);
      const override = overrides[spec.key];
      const moved = Boolean(override && ISO.test(override) && override !== plannedDate);
      const date = moved ? override! : plannedDate;
      if (moved) shift = businessDaysBetween(base, date, holidays);
      const done = completed[spec.key];
      const time = times[spec.key];
      return {
        ...spec,
        day: spec.day ?? 0,
        date,
        plannedDate,
        moved,
        shifted: !moved && shift !== 0 && date !== base,
        doneOn: done && ISO.test(done) ? done : null,
        time: time && /^\d{2}:\d{2}$/.test(time) ? time : null,
        phase: 1,
      };
    });
  };

  const path: OnboardingPath = options.path ?? "new_logo";
  const training = isTrainingPlan(path, options.trainingOnly);
  const existingBuild: ExistingBuild | null =
    path === "existing" && !training ? (options.existingBuild ?? "review") : null;
  const milestones = cascade(
    planFor(path, { trainingOnly: options.trainingOnly, existingBuild }),
    (spec) =>
      spec.day === 0 ? options.closeDate : addBusinessDays(options.closeDate, spec.day, holidays),
  );

  const liveDate = milestones[milestones.length - 1]!.date;
  const liveDoneOn = milestones[milestones.length - 1]!.doneOn;

  // The gate opens when a person says so, or when the form is marked live —
  // whichever is recorded. Marking the form live IS saying it is dialed in.
  const provenOn =
    options.formProvenOn && ISO.test(options.formProvenOn) ? options.formProvenOn : liveDoneOn;

  // Phases 2 and up: every service in a phase starts together on the phase's
  // first business day and runs its own steps over its own weeks. Phase 2
  // anchors on the day the form was proven (never before the live date);
  // phase N anchors on the day phase N-1 finished — planned until it has.
  const services = normalizeServices(options.services, {
    integration_tier: options.integrationTier ?? null,
    integration_target: options.integrationTarget ?? null,
  });
  // One service, planned from a start day: its steps spread over its weeks,
  // then cascaded so a moved or done step behaves like the form's do.
  const planService = (svc: ServiceSpec, phaseNo: number, start: string): ServicePlan => {
    const spec = SERVICE_KINDS[svc.kind];
    const weeks = serviceWeeks(svc);
    const spanDays = Math.max(1, Math.round(weeks * 7));
    const legacy = svc.id === "legacy-integration";
    const keyFor = (step: string) =>
      legacy ? `integ_${step === "review" ? "test" : step}` : `${svc.id}:${step}`;
    // The SOW's own words win over the catalogue: "training session
    // (30-minute, recorded)" is a 30-minute call, whatever the catalogue says.
    const namedMinutes = svc.name.match(/(\d{2,3})\s*-?\s*min/i);
    const stepSpecs = spec.steps.map((st) => ({
      key: keyFor(st.key),
      label: st.label,
      owner: st.owner,
      kind:
        st.kind === "call"
          ? ("call" as const)
          : st.kind === "build"
            ? ("build" as const)
            : ("milestone" as const),
      ...(st.minutes !== undefined && {
        minutes: st.kind === "call" && namedMinutes ? Number(namedMinutes[1]) : st.minutes,
      }),
      detail: st.detail,
      icon: st.icon,
      at: st.at,
    }));
    // Steps are spaced in business days across the span, so two of them
    // cannot round onto the same date the way calendar fractions did: "built"
    // and "you review it" on the same Monday is not a plan anybody believes.
    // The last step is the service's end and does not move for this.
    const end = onBusinessDay(
      toIso(new Date(parseIso(start).getTime() + spanDays * DAY_MS)),
      holidays,
    );
    const span = businessDaysBetween(start, end, holidays);
    let lastBase: string | null = null;
    const ms = cascade(stepSpecs, (st) => {
      let base =
        st.at === 0
          ? start
          : st.at === 1
            ? end
            : addBusinessDays(start, Math.round(span * st.at), holidays);
      if (st.at > 0 && st.at < 1 && lastBase !== null && base <= lastBase) {
        const bumped = addBusinessDays(lastBase, 1, holidays);
        if (bumped < end) base = bumped;
      }
      lastBase = base;
      return base;
    }).map((m) => {
      const { at: _at, ...rest } = m as Milestone & { at?: number };
      return { ...rest, phase: phaseNo, serviceId: svc.id } as Milestone;
    });
    return {
      id: svc.id,
      kind: svc.kind,
      label: spec.label,
      name: svc.name,
      phase: phaseNo,
      weeks,
      tier: svc.kind === "integration" ? (svc.tier ?? 3) : null,
      icon: spec.icon,
      startsOn: ms[0]!.date,
      endsOn: ms[ms.length - 1]!.date,
      doneOn: ms[ms.length - 1]!.doneOn,
      needs: serviceNeeds(svc),
      milestones: ms,
    };
  };

  // Phase 1 services run alongside the form: their first step is on the
  // kickoff call, so they start the day the form does and never wait.
  const kickoffDate = milestones.find((m) => m.key === "kickoff")?.date ?? liveDate;
  const alongside: ServicePlan[] = services
    .filter((x) => x.phase <= 1)
    .map((svc) => planService(svc, 1, kickoffDate));

  const phaseNumbers = [...new Set(services.filter((x) => x.phase >= 2).map((x) => x.phase))].sort(
    (a, b) => a - b,
  );
  const phases: Phase[] = [];
  let prevEnds: string | null = null; // planned end of the previous phase
  let prevDoneOn: string | null = null; // actual end, when every service is done
  let prevDone = true;
  for (const n of phaseNumbers) {
    const isFirst = phases.length === 0;
    // Phase 2 never starts before the form is live, even if a person recorded
    // the form as proven earlier by mistake. A later phase starts the day its
    // predecessor actually finished — early or late — else on its planned end.
    // An existing account whose form is already final is the exception: the
    // integration starts in week one, beside the review, so a two-to-four
    // week integration is a two-to-four week project.
    const reviewOnly = existingBuild === "review";
    const anchor = isFirst
      ? reviewOnly
        ? options.closeDate
        : provenOn && provenOn > liveDate
          ? provenOn
          : liveDate
      : prevDone && prevDoneOn
        ? prevDoneOn
        : (prevEnds ?? liveDate);
    const phaseStart = addBusinessDays(anchor, 1, holidays);
    const tentative = isFirst ? !reviewOnly && !provenOn : !(prevDone && prevDoneOn);
    const plans: ServicePlan[] = services
      .filter((x) => x.phase === n)
      .map((svc) => planService(svc, n, phaseStart));
    const endsOn = plans.reduce<string | null>(
      (acc, p) => (!acc || p.endsOn > acc ? p.endsOn : acc),
      null,
    );
    const done = plans.length > 0 && plans.every((p) => p.doneOn);
    const doneOn = done
      ? plans.reduce<string | null>(
          (acc, p) => (!acc || (p.doneOn && p.doneOn > acc) ? p.doneOn : acc),
          null,
        )
      : null;
    phases.push({
      phase: n,
      label: `Phase ${n}`,
      gate: isFirst
        ? reviewOnly
          ? "Starts in week one, beside the form review"
          : path === "existing"
            ? "Starts once your form is proven or frozen for the integration"
            : "Starts once the form is tested and dialed in"
        : `Starts once phase ${phases[phases.length - 1]!.phase} is live`,
      tentative,
      startsOn: phaseStart,
      endsOn,
      done,
      services: plans,
    });
    prevEnds = endsOn;
    prevDoneOn = doneOn;
    prevDone = done;
  }

  const currentPhase = !liveDoneOn
    ? 1
    : (phases.find((p) => !p.done)?.phase ??
      (phases.length ? phases[phases.length - 1]!.phase : 1));
  const allDone = Boolean(liveDoneOn) && phases.every((p) => p.done);

  // The first integration, for the parts of the app that still speak of one.
  const firstIntegration = phases.flatMap((p) => p.services).find((x) => x.kind === "integration");
  const tier =
    INTEGRATION_TIERS.find((t) => t.tier === (firstIntegration?.tier ?? 0)) ?? INTEGRATION_TIERS[0];
  const integPhase = firstIntegration
    ? phases.find((p) => p.phase === firstIntegration.phase)
    : null;

  const all = [
    ...milestones,
    ...alongside.flatMap((x) => x.milestones),
    ...phases.flatMap((p) => p.services.flatMap((x) => x.milestones)),
  ];
  return {
    closeDate: options.closeDate,
    path,
    training,
    existingBuild,
    milestones,
    liveDate,
    liveDoneOn,
    timezone: options.timezone ?? null,
    progress: { done: all.filter((m) => m.doneOn).length, total: all.length },
    alongside,
    phases,
    currentPhase,
    allDone,
    integration: {
      tier: tier.tier,
      name: tier.name,
      weeks: firstIntegration?.weeks ?? tier.weeks,
      summary: tier.summary,
      target: firstIntegration?.name ?? null,
      startsOn: firstIntegration?.startsOn ?? null,
      endsOn: firstIntegration?.endsOn ?? null,
      provenOn,
      tentative: Boolean(firstIntegration) && Boolean(integPhase?.tentative),
      milestones: firstIntegration?.milestones ?? [],
    },
  };
}

/** Calendar days from close to live, for the "N days" headline. */
export function daysToValue(t: Timeline): number {
  return businessDaysBetween(t.closeDate, t.liveDate);
}

/** "Day 4", or "Day 4–5" for a step that spans more than one. */
export function dayLabel(m: Pick<MilestoneSpec, "day" | "throughDay">): string {
  return m.throughDay && m.throughDay > m.day ? `Day ${m.day}–${m.throughDay}` : `Day ${m.day}`;
}

/**
 * The day counter: where today sits against the plan.
 *
 * SPEED IS THE PRODUCT. Every screen that shows the plan should say what day
 * it is, in the plan's own units — business days from the day we began —
 * and how many are left to live. Once the form is live it says how many days
 * it took against how many were planned, because that number is the one the
 * team is trying to beat.
 */
export type DayCounter = {
  /** Business days since the close. 0 on the close day; negative before it. */
  day: number;
  /** Business days the plan gives phase 1 (the live step's day). */
  total: number;
  /** Business days from today to the planned live date; 0 on the day, negative after. */
  toLive: number;
  state: "before" | "during" | "live_today" | "past_due" | "live";
  /** Business days from close to the day it actually went live; null until it has. */
  actual: number | null;
  /** What to say, short. */
  label: string;
  /** The second line: the live date, or how it landed against plan. */
  detail: string;
};

export function dayCounter(
  t: Timeline,
  todayIso: string,
  holidays: readonly string[] = [],
): DayCounter {
  const live = t.milestones[t.milestones.length - 1]!;
  const total = live.day;
  const day = businessDaysBetween(t.closeDate, todayIso, holidays);
  const toLive = businessDaysBetween(todayIso, t.liveDate, holidays);
  const actual = t.liveDoneOn ? businessDaysBetween(t.closeDate, t.liveDoneOn, holidays) : null;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  if (actual !== null) {
    const diff = actual - total;
    return {
      day,
      total,
      toLive,
      state: "live",
      actual,
      label: `Live in ${plural(actual, "day")}`,
      detail:
        diff === 0
          ? `On plan — ${plural(total, "day")}`
          : diff < 0
            ? `${plural(-diff, "day")} ahead of the ${total}-day plan`
            : `${plural(diff, "day")} past the ${total}-day plan`,
    };
  }
  if (day < 0) {
    return {
      day,
      total,
      toLive,
      state: "before",
      actual,
      label: `Begins in ${plural(-day, "day")}`,
      detail: `Live ${shortDay(t.liveDate)} · ${plural(total, "day")}`,
    };
  }
  if (toLive === 0) {
    return {
      day,
      total,
      toLive,
      state: "live_today",
      actual,
      label: `Day ${day} of ${total}`,
      detail: "Live today",
    };
  }
  if (toLive < 0) {
    return {
      day,
      total,
      toLive,
      state: "past_due",
      actual,
      label: `Day ${day} of ${total}`,
      detail: `${plural(-toLive, "day")} past the planned live date, ${shortDay(t.liveDate)}`,
    };
  }
  return {
    day,
    total,
    toLive,
    state: "during",
    actual,
    label: `Day ${day} of ${total}`,
    detail: `Live ${shortDay(t.liveDate)} · in ${plural(toLive, "business day")}`,
  };
}

/** The team's zone when nothing else says: the plan's dates are read from the US east coast. */
export const TEAM_ZONE = "America/New_York";

/**
 * Today as YYYY-MM-DD in a named zone. On the server "today" was UTC's day,
 * which after 8 pm Eastern is tomorrow: a deal created on Sunday evening
 * read "Created 21 Sept" and its plan began a day late.
 */
export function todayIn(zone: string | null | undefined, d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: zone || TEAM_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return localIso(d);
  }
}

/** Today as YYYY-MM-DD in the browser's zone. */
export function localIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Calendar days from close to the day the form actually went live; null until it has. */
export function daysToValueActual(t: Timeline): number | null {
  if (!t.liveDoneOn) return null;
  return businessDaysBetween(t.closeDate, t.liveDoneOn);
}

/** "Tue 10 Sep" — short enough for a slide, unambiguous enough for a plan. */
export function shortDay(iso: string): string {
  const d = parseIso(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
