import { zonedToUtc } from "./ics";
import type { IntakeAnswers } from "./intake-answers";
import { addBusinessDays, onBusinessDay, shortDay } from "./onboarding-timeline";

/**
 * The reply to the AE's closed-won email, written for the owner.
 *
 * It says who they are, what the next three weeks look like for THIS flow,
 * where the welcome page is, and offers two kickoff times — so the customer
 * can answer with one word. Pure: the page copies it, nothing is sent.
 */
export type AeReplyInput = {
  company: string;
  contactName: string | null;
  ownerName: string | null;
  intake: Pick<IntakeAnswers, "path" | "training_only">;
  welcomeUrl: string | null;
  /** The plan's kickoff date. */
  plannedKickoff: string | null;
  /** Today, YYYY-MM-DD. */
  today: string;
  timezone: string | null;
};

export function kickoffOptions(plannedKickoff: string | null, today: string): [string, string] {
  const earliest = addBusinessDays(onBusinessDay(today), 1);
  const first = plannedKickoff && plannedKickoff >= earliest ? plannedKickoff : earliest;
  return [first, addBusinessDays(first, 1)];
}

export function aeReplyDraft(i: AeReplyInput): { subject: string; body: string } {
  const first = i.contactName?.trim().split(/\s+/)[0] ?? "there";
  const zone = i.timezone ? ` ${zoneLabel(i.timezone)}` : "";
  const [a, b] = kickoffOptions(i.plannedKickoff, i.today);
  const training = i.intake.path === "field_fusion" || i.intake.training_only;
  const plan =
    i.intake.path === "existing"
      ? [
          "• A form review with the integration in mind — the fields it needs, named the way the other system names them",
          "• Real jobs through the reviewed form",
          "• Then the integration, built against data your crew has already produced",
        ]
      : training
        ? [
            "• Session 1 — the admin portal, and building a form",
            "• Session 2 — reference data, calculations and the PDF",
            "• Session 3 — where the data goes and what you can do with it",
          ]
        : i.intake.path === "new_logo"
          ? [
              "• Stage 1 — Make It Work: your process confirmed and your first form working end to end",
              "• Stage 2 — Make It Work for Them: your data, your rules, and what happens after a submission",
              "• Stage 3 — Make It Operational: how your team runs it day to day",
            ]
          : [
              "• Training day 1 — kickoff, and your first form built with your hands on the keyboard",
              "• Training day 2 — build it properly: your lists, logic and calculations",
              "• Training day 3 — the back office: emails, the PDF, reports and users",
            ];
  const length = training
    ? "Three 30-minute sessions over two weeks."
    : i.intake.path === "existing"
      ? "Three 60-minute working sessions over fifteen business days get your form ready; the integration builds on it from there."
      : i.intake.path === "new_logo"
        ? "A 30-day implementation built around three 60-minute meetings, which we'd like to book now — you're functional in about three weeks, with week 4 held for anything that needs more time."
        : "Three 60-minute working sessions, and your first form is live within about three weeks.";
  const body = [
    `Hi ${first},`,
    "",
    `Thanks for the introduction. I'm ${i.ownerName ?? "[your name]"}, and I'll be leading ${i.company}'s GoCanvas onboarding.`,
    "",
    `Here's what's ahead. ${length}`,
    ...plan,
    "",
    i.welcomeUrl
      ? `Your welcome page has the plan, the dates and what we'll need from you: ${i.welcomeUrl}`
      : "I'll send your welcome page with the plan and the dates shortly.",
    "",
    i.intake.path === "new_logo"
      ? "Could we hold Stage 1 for one of these (60 minutes)? I'll send Stages 2 and 3 right after."
      : "Could we hold the kickoff for one of these (60 minutes)?",
    `• ${shortDay(a)} at 10:00 am${zone}`,
    `• ${shortDay(b)} at 2:00 pm${zone}`,
    "",
    training
      ? "Please bring whoever will run GoCanvas day to day."
      : "Please bring whoever will own GoCanvas on your side, and the paper form or spreadsheet you use today.",
    "",
    "Thanks,",
    i.ownerName ?? "[your name]",
  ].join("\n");
  return { subject: `${i.company} × GoCanvas — booking your kickoff`, body };
}

/** "America/Chicago" → "Central time", for a sentence a customer reads. */
function zoneLabel(tz: string): string {
  const known: Record<string, string> = {
    "America/New_York": "Eastern",
    "America/Chicago": "Central",
    "America/Denver": "Mountain",
    "America/Phoenix": "Arizona",
    "America/Los_Angeles": "Pacific",
  };
  return known[tz] ? `${known[tz]} time` : tz.replace(/^.*\//, "").replace(/_/g, " ");
}

/**
 * A Google Calendar "new event" link, pre-filled: the kickoff at the booked
 * time, sixty minutes, the welcome page in the description, the contact
 * invited. One click from the checklist to a sent invite.
 */
export function googleCalendarLink(args: {
  title: string;
  date: string;
  time: string;
  timezone: string;
  minutes: number;
  details: string;
  guests: string[];
}): string {
  const start = zonedToUtc(args.date, args.time, args.timezone);
  const end = new Date(start.getTime() + args.minutes * 60_000);
  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: args.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: args.details,
    ctz: args.timezone,
  });
  if (args.guests.length) q.set("add", args.guests.join(","));
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
