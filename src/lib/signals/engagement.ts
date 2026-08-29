/**
 * Engagement — the ONLY module in Phase 6 that reads a Phase 4 table.
 *
 * ============================================================================
 * CROSS-PHASE DEPENDENCY. `external_plan_events` is designed in
 * `docs/design/portal-access.md` §2.2 and is created by Phase 4's migration
 * 0021 (ledger: 0019 `external_access`). It may not exist yet. The names this
 * module assumes are listed in ASSUMED_SHAPE below; the server probe in
 * `signals.server.ts` degrades to `{ available: false }` when the relation is
 * missing, and NEVER to "no events" or "healthy".
 * ============================================================================
 *
 * There is no engagement score. The sketch's "weight interactive events above
 * bare GETs" is expressed as a rule about what a class of event may CONCLUDE,
 * not as points:
 *
 *   - interactive  → the contact did something. May REFUTE a silence claim.
 *   - passive      → the contact looked. Recorded as evidence; refutes nothing,
 *                    because opening a plan and then not answering is the
 *                    literal shape of going quiet.
 *   - operational  → security/administration. Not engagement at all.
 *
 * Telemetry can therefore only refute or reinforce a signal that some other
 * stored fact originated. It can never originate one.
 *
 * Pure: no I/O.
 */

/** The Phase 4 names this module assumes. Kept as data so a mismatch is obvious. */
export const ASSUMED_SHAPE = {
  table: "external_plan_events",
  columns: ["implementation_id", "contact_id", "event", "created_at"],
  source: "docs/design/portal-access.md §2.2",
} as const;

export type PlanEventName =
  | "opened"
  | "task_completed"
  | "task_reopened"
  | "comment_added"
  | "file_uploaded"
  | "task_reassigned"
  | "snapshot_viewed"
  | "passcode_failed"
  | "grant_revoked"
  | "grant_rotated";

/** One row of `external_plan_events`, narrowed to what a signal may read. */
export type PlanEvent = {
  implementation_id: string;
  contact_id: string | null;
  event: string;
  created_at: string;
};

export type EventClass = "interactive" | "passive" | "operational";

const INTERACTIVE: readonly string[] = [
  "task_completed",
  "task_reopened",
  "comment_added",
  "file_uploaded",
  "task_reassigned",
];
const PASSIVE: readonly string[] = ["opened", "snapshot_viewed"];

/**
 * An event this build has never heard of is `operational`, not `interactive`:
 * an unknown name must never be able to refute a silence claim by accident.
 */
export function classifyEvent(event: string): EventClass {
  if (INTERACTIVE.includes(event)) return "interactive";
  if (PASSIVE.includes(event)) return "passive";
  return "operational";
}

export type EngagementSignal =
  | {
      available: false;
      /** Why there is no signal. Never rendered as "no activity". */
      reason: string;
    }
  | {
      available: true;
      implementation_id: string;
      /** Every interactive event in the window, newest first. Evidence, not a count. */
      interactive: PlanEvent[];
      /** Every passive event in the window, newest first. */
      passive: PlanEvent[];
      last_interactive_at: string | null;
      last_passive_at: string | null;
      /** Distinct contacts seen doing something interactive. */
      interactive_contacts: string[];
      window_days: number;
      reason: string;
    };

export const TELEMETRY_UNAVAILABLE = (detail: string): EngagementSignal => ({
  available: false,
  reason: `Engagement telemetry is not available — ${detail}. This is the absence of a source, not evidence of inactivity.`,
});

const newestFirst = (a: PlanEvent, b: PlanEvent) => b.created_at.localeCompare(a.created_at);

/**
 * Summarise the events already fetched for one implementation.
 *
 * `windowDays` is descriptive: the caller decides what it fetched, and this
 * records the number so the sentence on screen can state it.
 */
export function engagementSignal(
  implementationId: string,
  events: readonly PlanEvent[],
  windowDays: number,
): EngagementSignal {
  const mine = events.filter((e) => e.implementation_id === implementationId);
  const interactive = mine
    .filter((e) => classifyEvent(e.event) === "interactive")
    .sort(newestFirst);
  const passive = mine.filter((e) => classifyEvent(e.event) === "passive").sort(newestFirst);
  const contacts = [
    ...new Set(interactive.map((e) => e.contact_id).filter((id): id is string => Boolean(id))),
  ];
  const lastInteractive = interactive[0]?.created_at ?? null;
  const lastPassive = passive[0]?.created_at ?? null;

  const reason = lastInteractive
    ? `${interactive.length} interactive event${interactive.length === 1 ? "" : "s"} in the last ${windowDays}d, most recently ${lastInteractive}.`
    : lastPassive
      ? `No interactive event in the last ${windowDays}d; the plan was opened, most recently ${lastPassive}. Looking is not answering.`
      : `No portal event of any kind recorded in the last ${windowDays}d.`;

  return {
    available: true,
    implementation_id: implementationId,
    interactive,
    passive,
    last_interactive_at: lastInteractive,
    last_passive_at: lastPassive,
    interactive_contacts: contacts,
    window_days: windowDays,
    reason,
  };
}

/**
 * Does telemetry positively contradict a claim that the customer went quiet
 * since `sinceIso`?
 *
 * Only an interactive event refutes. Unavailable telemetry refutes nothing —
 * it is not a licence to assume activity, and it is not a licence to assume
 * silence either; the claim simply stands on whatever originated it.
 */
export function refutesSilence(
  signal: EngagementSignal,
  sinceIso: string,
): { refuted: boolean; reason: string | null } {
  if (!signal.available) return { refuted: false, reason: null };
  const found = signal.interactive.find((e) => e.created_at >= sinceIso);
  if (!found) return { refuted: false, reason: null };
  return {
    refuted: true,
    reason: `Portal telemetry records a ${found.event} on ${found.created_at}, after the ask — the customer is not silent.`,
  };
}
