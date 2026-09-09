/**
 * The first seven days, as dates.
 *
 * THE RULE THIS ENCODES. A customer should have a working form in the field
 * within seven days of closing, and the first call should be the next
 * business day. Not "within a few weeks" — the older way of onboarding let
 * accounts stall waiting on a form, and the accounts that stalled were the
 * ones that churned. We drive the pace: the plan has dates before anyone
 * asks for them.
 *
 * TEACH THEM TO FISH. The plan is two short working sessions with homework
 * between, because a customer who built their own form comes back with the
 * second use case, and a customer who was handed a form comes back with a
 * support ticket. Every step below is owned by somebody — us, them, or both
 * — and the "both" steps are where the value is.
 *
 * INTEGRATIONS COME AFTER DAY 7, always. The form is the star: field mapping
 * cannot be right until a crew has run the form on real jobs. An integration
 * extends the plan by its complexity tier; it never delays the form.
 *
 * Pure. Business days only; holidays are a parameter, and every date can be
 * overridden by hand (a weird holiday, a customer who is closed Fridays) —
 * the override wins, and the plan reports where it was moved.
 */

export type MilestoneOwner = "gocanvas" | "client" | "both";
export type MilestoneKind = "call" | "homework" | "build" | "milestone";

export type MilestoneSpec = {
  key: string;
  /** Business days after close. Day 0 is the close itself. */
  day: number;
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

/** The seven-day plan, in order. The keys are the contract the deck renders. */
export const SEVEN_DAY_PLAN: readonly MilestoneSpec[] = [
  {
    key: "close",
    day: 0,
    label: "Deal closes",
    owner: "gocanvas",
    kind: "milestone",
    detail: "Welcome email the same day, with the kickoff invite already in it.",
    icon: "Flag",
  },
  {
    key: "kickoff",
    day: 1,
    label: "Kickoff & build session",
    owner: "both",
    kind: "call",
    minutes: 60,
    detail:
      "Meet the team, agree how we'll work, and build the first form live on the call — from the starting point we chose together.",
    homework: [
      "Download the GoCanvas app and log in",
      "Add one field user who will test on a real job",
      "Send us the customer or site list to load",
    ],
    icon: "PhoneCall",
  },
  {
    key: "homework",
    day: 2,
    label: "Your homework",
    owner: "client",
    kind: "homework",
    detail:
      "The three things above. Fifteen minutes, and the second session starts from a live account instead of a blank one.",
    icon: "ClipboardCheck",
  },
  {
    key: "working",
    day: 3,
    label: "Working session",
    owner: "both",
    kind: "call",
    minutes: 30,
    detail:
      "Thirty minutes, hands on the keyboard together. Finish the form, add the logic and the notifications, and you make the last changes — not us.",
    homework: ["Hand the form to your field tester", "Run it on real jobs for two days"],
    icon: "Wrench",
  },
  {
    key: "fieldtest",
    day: 4,
    label: "Field test",
    owner: "client",
    kind: "build",
    detail:
      "One crew, real jobs. We watch the submissions come in and fix what the field tells us.",
    icon: "HardHat",
  },
  {
    key: "adjust",
    day: 6,
    label: "Adjust from the field",
    owner: "both",
    kind: "build",
    detail: "The changes the crew asked for, made together. Usually three, rarely more.",
    icon: "Target",
  },
  {
    key: "live",
    day: 7,
    label: "Live — first value",
    owner: "both",
    kind: "milestone",
    detail: "The form is in the field and the office is seeing the work as it happens. Day seven.",
    icon: "Rocket",
  },
];

/**
 * Integration complexity, from the tiering GoCanvas already uses internally.
 * Weeks are what the plan extends by, AFTER day 7.
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
    weeks: 1,
    summary:
      "Level 1: PDF to Drive, OneDrive or Dropbox; form-to-form; calendar; text or email notifications.",
  },
  {
    tier: 3,
    name: "Advanced",
    weeks: 2,
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

export type TimelineOptions = {
  /** ISO date, YYYY-MM-DD. The day the deal closed. */
  closeDate: string;
  /** Milestone key → ISO date, for the ones a person moved. */
  overrides?: Record<string, string>;
  /** ISO dates to skip, on top of weekends. */
  holidays?: string[];
  integrationTier?: IntegrationTier;
  /** What is being connected, for the deck to name it. */
  integrationTarget?: string | null;
};

export type Milestone = MilestoneSpec & {
  /** ISO date. */
  date: string;
  /** True when a person moved it off the computed date. */
  moved: boolean;
  /** The date the plan would have given it. */
  plannedDate: string;
};

export type Timeline = {
  closeDate: string;
  milestones: Milestone[];
  /** The live date — the last of the seven days, after overrides. */
  liveDate: string;
  integration: {
    tier: IntegrationTier;
    name: string;
    weeks: number;
    summary: string;
    target: string | null;
    /** ISO dates; null when there is no integration. */
    startsOn: string | null;
    endsOn: string | null;
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

/** `n` business days after `from`, skipping weekends and the given holidays. */
export function addBusinessDays(from: string, n: number, holidays: readonly string[] = []): string {
  const skip = new Set(holidays);
  let d = parseIso(from);
  let left = n;
  while (left > 0) {
    d = new Date(d.getTime() + DAY_MS);
    if (!isWeekend(d) && !skip.has(toIso(d))) left -= 1;
  }
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

  const milestones: Milestone[] = SEVEN_DAY_PLAN.map((spec) => {
    const plannedDate =
      spec.day === 0 ? options.closeDate : addBusinessDays(options.closeDate, spec.day, holidays);
    const override = overrides[spec.key];
    const date = override && ISO.test(override) ? override : plannedDate;
    return { ...spec, date, plannedDate, moved: date !== plannedDate };
  });

  const liveDate = milestones[milestones.length - 1]!.date;

  const tierNo = options.integrationTier ?? 0;
  const tier = INTEGRATION_TIERS.find((t) => t.tier === tierNo) ?? INTEGRATION_TIERS[0];
  const hasIntegration = tier.weeks > 0;
  // Always after the form is live. The form is the star.
  const startsOn = hasIntegration ? addBusinessDays(liveDate, 1, holidays) : null;
  const endsOn = startsOn ? addWeeks(startsOn, tier.weeks) : null;

  return {
    closeDate: options.closeDate,
    milestones,
    liveDate,
    integration: {
      tier: tier.tier,
      name: tier.name,
      weeks: tier.weeks,
      summary: tier.summary,
      target: options.integrationTarget ?? null,
      startsOn,
      endsOn,
    },
  };
}

/** Calendar days from close to live, for the "N days" headline. */
export function daysToValue(t: Timeline): number {
  return Math.round((parseIso(t.liveDate).getTime() - parseIso(t.closeDate).getTime()) / DAY_MS);
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
