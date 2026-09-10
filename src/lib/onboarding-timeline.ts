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

  const milestones = cascade(SEVEN_DAY_PLAN, (spec) =>
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
      ...(st.minutes !== undefined && { minutes: st.minutes }),
      detail: st.detail,
      icon: st.icon,
      at: st.at,
    }));
    const ms = cascade(stepSpecs, (st) =>
      st.at === 0
        ? start
        : st.at === 1
          ? onBusinessDay(toIso(new Date(parseIso(start).getTime() + spanDays * DAY_MS)), holidays)
          : onBusinessDay(
              toIso(new Date(parseIso(start).getTime() + Math.round(spanDays * st.at) * DAY_MS)),
              holidays,
            ),
    ).map((m) => {
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
    const anchor = isFirst
      ? provenOn && provenOn > liveDate
        ? provenOn
        : liveDate
      : prevDone && prevDoneOn
        ? prevDoneOn
        : (prevEnds ?? liveDate);
    const phaseStart = addBusinessDays(anchor, 1, holidays);
    const tentative = isFirst ? !provenOn : !(prevDone && prevDoneOn);
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
        ? "Starts once the form is tested and dialed in"
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
  return Math.round((parseIso(t.liveDate).getTime() - parseIso(t.closeDate).getTime()) / DAY_MS);
}

/** Calendar days from close to the day the form actually went live; null until it has. */
export function daysToValueActual(t: Timeline): number | null {
  if (!t.liveDoneOn) return null;
  return Math.round((parseIso(t.liveDoneOn).getTime() - parseIso(t.closeDate).getTime()) / DAY_MS);
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
