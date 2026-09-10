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
      return {
        ...spec,
        day: spec.day ?? 0,
        date,
        plannedDate,
        moved,
        shifted: !moved && shift !== 0 && date !== base,
      };
    });
  };

  const milestones = cascade(SEVEN_DAY_PLAN, (spec) =>
    spec.day === 0 ? options.closeDate : addBusinessDays(options.closeDate, spec.day, holidays),
  );

  const liveDate = milestones[milestones.length - 1]!.date;

  const tierNo = options.integrationTier ?? 0;
  const tier = INTEGRATION_TIERS.find((t) => t.tier === tierNo) ?? INTEGRATION_TIERS[0];
  const hasIntegration = tier.weeks > 0;
  const provenOn =
    options.formProvenOn && ISO.test(options.formProvenOn) ? options.formProvenOn : null;
  // Phase 2 anchors on the day the form was proven; until then, the earliest
  // it could be is the business day after the form is live. Never before.
  const anchor = provenOn && provenOn > liveDate ? provenOn : liveDate;
  const plannedStart = hasIntegration ? addBusinessDays(anchor, 1, holidays) : null;
  const spanDays = tier.weeks * 7;
  const phase2: Milestone[] = plannedStart
    ? cascade(INTEGRATION_PLAN, (spec) =>
        spec.at === 0
          ? plannedStart
          : spec.at === 1
            ? addWeeks(plannedStart, tier.weeks)
            : onBusinessDay(
                toIso(
                  new Date(
                    parseIso(plannedStart).getTime() + Math.round(spanDays * spec.at) * DAY_MS,
                  ),
                ),
                holidays,
              ),
      ).map((m) => {
        const { at: _at, ...rest } = m as Milestone & { at?: number };
        return rest as Milestone;
      })
    : [];
  const startsOn = phase2[0]?.date ?? null;
  const endsOn = phase2[phase2.length - 1]?.date ?? null;

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
      provenOn,
      tentative: hasIntegration && !provenOn,
      milestones: phase2,
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
