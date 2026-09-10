/**
 * Calendar files, by hand.
 *
 * An .ics is a few lines of text; a dependency for it would be the biggest
 * thing in the bundle for the smallest job. Two kinds of event: a call with
 * a booked time (timed, converted from the plan's zone to UTC so every
 * calendar app agrees on when), and a plan date with no time (all-day).
 * Pure and isomorphic: the panel builds one in the browser, the customer's
 * link is served by an API route.
 */

export type IcsEvent = {
  uid: string;
  summary: string;
  description?: string | null;
  url?: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** "HH:MM" in `timezone`; absent → all-day. */
  time?: string | null;
  timezone?: string | null;
  /** Duration, for a timed event. */
  minutes?: number | null;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** A wall-clock time in an IANA zone, as a UTC Date. */
export function zonedToUtc(date: string, time: string, timezone: string): Date {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const localAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
  );
  return new Date(guess - (localAsUtc - guess));
}

function stampUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
  );
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 line folding: 75 octets, continuation lines start with a space. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 75) {
    let cut = 75;
    while (cut > 0 && Buffer.byteLength(rest.slice(0, cut), "utf8") > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(events: IcsEvent[], calendarName = "GoCanvas onboarding"): string {
  const now = stampUtc(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GoCanvas//Onboarding plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${now}`);
    if (e.time && e.timezone) {
      const start = zonedToUtc(e.date, e.time, e.timezone);
      const end = new Date(start.getTime() + (e.minutes ?? 60) * 60_000);
      lines.push(`DTSTART:${stampUtc(start)}`, `DTEND:${stampUtc(end)}`);
    } else {
      const [y, mo, d] = e.date.split("-").map(Number) as [number, number, number];
      const next = new Date(Date.UTC(y, mo - 1, d + 1));
      lines.push(
        `DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`,
        `DTEND;VALUE=DATE:${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`,
      );
    }
    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
