import type { IntakeAnswers } from "./intake-answers";
import { timelineFor } from "./onboarding-plan";
import type { Timeline } from "./onboarding-timeline";

export type SessionRow = {
  key: string;
  label: string;
  date: string;
  time: string | null;
  booked: boolean;
};

/** The working sessions after Kickoff, in plan order. Booked means a time is set. */
export function sessionsAfterKickoff(milestones: Timeline["milestones"], limit = 3): SessionRow[] {
  return milestones
    .filter((m) => m.kind === "call" && !m.serviceId && m.key !== "kickoff")
    .slice(0, limit)
    .map((m) => ({
      key: m.key,
      label: m.label,
      date: m.date,
      time: m.time,
      booked: Boolean(m.time),
    }));
}

export type MoveRow = { key: string; label: string; from: string; to: string };

/**
 * The plan dates a hand-set date would move, other than the one being set.
 * Reads the plan engine twice — with and without the override — so the
 * preview is exactly what saving would do. Completed milestones never move.
 */
export function movesFor(
  intake: IntakeAnswers,
  closeDate: string,
  key: string,
  date: string,
): MoveRow[] {
  const before = timelineFor(intake, closeDate).milestones;
  const after = timelineFor(
    {
      ...intake,
      timeline: { ...intake.timeline, overrides: { ...intake.timeline.overrides, [key]: date } },
    },
    closeDate,
  ).milestones;
  return before
    .map((m, i) => ({ m, next: after[i]! }))
    .filter(({ m, next }) => m.key !== key && !m.doneOn && m.date !== next.date)
    .map(({ m, next }) => ({ key: m.key, label: m.label, from: m.date, to: next.date }));
}

const channelName = (dealId: string) => `gc-welcome:${dealId}`;

/** Same browser only: tells the open presentation window to re-read the plan. */
export function announceWelcomeChanged(dealId: string): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(channelName(dealId));
  channel.postMessage("changed");
  channel.close();
}

export function onWelcomeChanged(dealId: string, handler: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(channelName(dealId));
  channel.onmessage = () => handler();
  return () => channel.close();
}
