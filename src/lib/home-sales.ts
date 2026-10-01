import type { HandoffStatus } from "./sales-handoff";

/**
 * THE SELLER'S HOME: "My deals".
 *
 * An AE or AM does not run implementations; they hand them over. Their page
 * answers four things per deal: where it is, whether the TIS is in, whether
 * the handoff is done, whether the first meeting is booked — and the one
 * thing on them next. Pure: the pipeline rows go in, the page comes out.
 */
export type SalesDeal = {
  id: string;
  name: string;
  stage: string;
  path?: "new_logo" | "existing" | "dm_conversion" | "field_fusion" | null;
  customer_id?: string | null;
  implementation_id?: string | null;
  owner_name?: string | null;
  handoff_status?: HandoffStatus;
  first_meeting?: string | null;
  business_days_in_stage?: number;
  stage_entered_at?: string;
};

export type SalesTone = "critical" | "warning" | "info" | "good" | "muted";

export type SalesRow = {
  id: string;
  name: string;
  stage: string;
  stageLabel: string;
  /** Null for a Field Fusion deal, whose handoff is the setup owner's. */
  handoff: HandoffStatus | null;
  tis: string | null;
  firstMeeting: string | null;
  next: { text: string; tone: SalesTone };
  /** Where the row opens: the deal before the close, the customer's page after. */
  href:
    | { kind: "deal"; dealId: string }
    | { kind: "customer"; customerId: string; implId: string | null };
  businessDaysInStage: number;
};

export type SalesHome = {
  rows: SalesRow[];
  tiles: {
    /** At Negotiate & Finalize with no TIS. */
    needsTis: number;
    /** Handoff still outstanding on a live deal. */
    handoffOpen: number;
    /** Closing or closed, first meeting not on the calendar. */
    noFirstMeeting: number;
    /** Closed, kickoff not yet held. */
    closedNotKickedOff: number;
  };
};

const PRE_CLOSE = new Set(["prospect", "negotiate"]);
const BEFORE_KICKOFF = new Set(["closed_won", "field_fusion_setup", "onboarding_kickoff"]);
const TONE_RANK: Record<SalesTone, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  good: 3,
  muted: 4,
};

export function salesHomeFor(
  deals: ReadonlyArray<SalesDeal>,
  opts: {
    /** Stage key → label, from the configured pipeline. */
    labels: ReadonlyMap<string, string>;
    /** Stage key → position, for ordering. */
    order: ReadonlyMap<string, number>;
    terminalKey: string;
  },
): SalesHome {
  const rows = deals.map((d): SalesRow => {
    const ff = d.path === "field_fusion";
    const handoff = ff ? null : (d.handoff_status ?? "outstanding");
    const tis = d.owner_name ?? null;
    const firstMeeting = d.first_meeting ?? null;
    return {
      id: d.id,
      name: d.name,
      stage: d.stage,
      stageLabel: opts.labels.get(d.stage) ?? d.stage,
      handoff,
      tis,
      firstMeeting,
      next: nextForSeller(d.stage, {
        handoff,
        tis,
        firstMeeting,
        terminal: d.stage === opts.terminalKey,
        ff,
      }),
      href: d.customer_id
        ? { kind: "customer", customerId: d.customer_id, implId: d.implementation_id ?? null }
        : { kind: "deal", dealId: d.id },
      businessDaysInStage: d.business_days_in_stage ?? 0,
    };
  });
  rows.sort(
    (a, b) =>
      TONE_RANK[a.next.tone] - TONE_RANK[b.next.tone] ||
      (opts.order.get(a.stage) ?? 99) - (opts.order.get(b.stage) ?? 99) ||
      a.name.localeCompare(b.name),
  );
  const live = rows.filter((r) => r.stage !== opts.terminalKey);
  return {
    rows,
    tiles: {
      needsTis: live.filter((r) => r.stage === "negotiate" && !r.tis).length,
      handoffOpen: live.filter((r) => r.handoff === "outstanding").length,
      noFirstMeeting: live.filter(
        (r) =>
          r.handoff !== null &&
          !r.firstMeeting &&
          (r.stage === "negotiate" || BEFORE_KICKOFF.has(r.stage)),
      ).length,
      closedNotKickedOff: live.filter((r) => BEFORE_KICKOFF.has(r.stage)).length,
    },
  };
}

/** The one thing on the seller next, by where the deal is. */
export function nextForSeller(
  stage: string,
  f: {
    handoff: HandoffStatus | null;
    tis: string | null;
    firstMeeting: string | null;
    terminal: boolean;
    ff: boolean;
  },
): { text: string; tone: SalesTone } {
  if (f.terminal) return { text: "Implementation complete", tone: "muted" };
  if (f.ff) {
    return PRE_CLOSE.has(stage)
      ? { text: "Field Fusion: mark Closed Won when it closes; setup follows", tone: "info" }
      : { text: "Field Fusion setup is on implementation", tone: "good" };
  }
  if (stage === "prospect") {
    return f.handoff === "outstanding"
      ? { text: "Start the handoff: what was bought, who, when", tone: "muted" }
      : { text: "Move it to Negotiate & Finalize when you are closing", tone: "muted" };
  }
  if (stage === "negotiate") {
    if (!f.tis)
      return { text: "Needs a TIS: ask your manager, or the pool claims it", tone: "critical" };
    if (f.handoff === "outstanding")
      return { text: "Fill in the handoff for the TIS", tone: "warning" };
    if (!f.firstMeeting) return { text: `Book the first meeting for ${f.tis}`, tone: "warning" };
    if (f.handoff === "sent") return { text: "Waiting on the customer's answers", tone: "info" };
    return { text: "Ready: mark Closed Won when it closes", tone: "good" };
  }
  if (BEFORE_KICKOFF.has(stage)) {
    if (f.handoff === "outstanding")
      return { text: "Finish the handoff for the TIS", tone: "warning" };
    if (!f.firstMeeting) return { text: "Book the first meeting", tone: "warning" };
    if (f.handoff === "sent") return { text: "Waiting on the customer's answers", tone: "info" };
    return {
      text: f.tis ? `With ${f.tis}; kickoff is booked` : "With implementation",
      tone: "good",
    };
  }
  return { text: f.tis ? `In onboarding with ${f.tis}` : "In onboarding", tone: "good" };
}
