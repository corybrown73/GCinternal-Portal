import type { IcsEvent } from "./ics";
import { shortDay, type Milestone, type Timeline } from "./onboarding-timeline";

/**
 * The plan as calendar events. Calls with a booked time are timed events;
 * everything else is an all-day marker. The customer's link goes in every
 * event so the invite is also the way back to the page.
 */

const CALLS = new Set(["kickoff", "working", "integ_kickoff"]);

export function isCall(m: Milestone): boolean {
  return CALLS.has(m.key);
}

function fmtTime(time: string): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** "Thu, Sep 10 · 10:00 AM CT" when a time is booked, else the date. */
export function whenLabel(m: Milestone, timezone: string | null): string {
  if (!m.time) return shortDay(m.date);
  const zone = timezone
    ? (new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" })
        .formatToParts(new Date(`${m.date}T12:00:00Z`))
        .find((p) => p.type === "timeZoneName")?.value ?? "")
    : "";
  return `${shortDay(m.date)} · ${fmtTime(m.time)}${zone ? ` ${zone}` : ""}`;
}

export function planEvents(args: {
  timeline: Timeline;
  clientName: string;
  url: string | null;
  only?: string | null;
}): IcsEvent[] {
  const { timeline: t, clientName, url } = args;
  const all = [...t.milestones, ...t.integration.milestones].filter((m) => m.key !== "close");
  const chosen = args.only ? all.filter((m) => m.key === args.only) : all;
  return chosen.map((m) => {
    const call = isCall(m);
    const tentative = m.key.startsWith("integ_") && t.integration.tentative;
    const summary = `${tentative ? "(Earliest) " : ""}GoCanvas · ${m.label} — ${clientName}`;
    const owner = m.owner === "client" ? "Yours" : m.owner === "both" ? "Together" : "GoCanvas";
    const description = [
      m.detail,
      `${owner}${m.minutes ? ` · ${m.minutes} minutes` : ""}.`,
      ...(m.homework?.length ? ["Homework: " + m.homework.join("; ") + "."] : []),
      ...(url ? [`Your onboarding plan: ${url}`] : []),
    ].join("\n");
    return {
      uid: `${m.key}-${m.date}-${clientName.replace(/\W+/g, "").toLowerCase()}@gocanvas`,
      summary,
      description,
      url,
      date: m.date,
      time: call && m.time && t.timezone ? m.time : null,
      timezone: t.timezone,
      minutes: m.minutes ?? null,
    };
  });
}
