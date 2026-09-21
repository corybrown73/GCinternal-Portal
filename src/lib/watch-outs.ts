import type { BriefJson } from "./server/schemas";
import type { IntakeAnswers } from "./intake-answers";
import type { Timeline } from "./onboarding-timeline";
import { shortDay } from "./onboarding-timeline";

/**
 * What was said on the calls, what was signed, and what the plan does — read
 * against each other.
 *
 * The brief already sees all three: it wrote "storm season, first week of
 * November, no later" into the risks and the deck went out promising
 * everything live on the eleventh. Nothing joined them. This does, with
 * plain pattern matching on the brief's own sentences and the SOW reader's
 * notes: a date named as a deadline is compared with the plan's live date; a
 * named absence with the phase it falls in; a lead time with the field test;
 * a duration the customer was told with the weeks the plan has; a thing the
 * SOW excludes with the things the calls asked about.
 *
 * It is deliberately literal. A row says which sentence it came from, so a
 * person can dismiss a bad match in a glance; it never rewrites the plan.
 */
export type WatchOut = {
  key: string;
  /** conflict — the plan contradicts it; check — a person should look; ok — the plan meets it. */
  severity: "conflict" | "check" | "ok";
  title: string;
  detail: string;
  /** The sentence it was read from. */
  quote: string;
  /** calls — the pasted notes, verbatim; brief — the AI's reading of them; sow — the SOW reader's notes. */
  source: "calls" | "brief" | "sow";
};

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const MONTH_RE =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const WORD_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  ten: 10,
  twelve: 12,
};

const DEADLINE =
  /\b(by|before|no later than|deadline|must be|needs? to be|has to be|in time for|ahead of|season|go[- ]?live by|due|target(?:ed)? for|latest)\b/i;
const ABSENCE = /\b(out|away|on leave|leave|vacation|pto|unavailable|off|travell?ing|holiday)\b/i;
const LEAD_TIME =
  /\b(lead[- ]time|to arrive|to procure|procure|order(?:ed)?|ship(?:ping|ped)?|deliver(?:y|ed)?|arrive)\b/i;
const NOT_YET =
  /\b(not|n't|never|no)\b[^.]{0,30}\b(procured|ordered|purchased|bought|arrived|in hand|issued|provisioned)\b/i;
const DEVICES = /\b(ipads?|tablets?|devices?|phones?|hardware|laptops?|handhelds?)\b/i;
const TOLD = /\b(told|quoted|promised|said|expects?|expectation|understood|thinks?|believes?)\b/i;

export function watchOutsFor(args: {
  brief: unknown;
  /** The pasted call notes and account maps, verbatim. Read first: a quote is a real sentence. */
  notes?: string[];
  intake: IntakeAnswers;
  timeline: Timeline;
}): WatchOut[] {
  const t = args.timeline;
  const b = (args.brief ?? null) as Partial<BriefJson> | null;
  const out: WatchOut[] = [];
  const fullLive = lastDate(t);
  const fieldTest = t.milestones.find((m) => m.key === "fieldtest")?.date ?? null;
  const names = (b?.stakeholders ?? []).map((s) => s.name).filter(Boolean);

  // The notes as pasted come first, so a row quotes what was actually said.
  // The brief's own sentences follow for anything only its reading caught;
  // a row already found from the notes wins the dedupe.
  const callSentences: Array<{ s: string; source: "calls" | "brief" }> = [
    ...sentencesFrom(args.notes ?? []).map((s) => ({ s, source: "calls" as const })),
    ...sentencesFrom([
      ...(b?.risks_open_items ?? []),
      ...(b?.process_gaps ?? []),
      ...(b?.what_we_know ?? []).map((w) => `${w.topic}: ${w.detail}`),
      ...(b?.stakeholders ?? []).map((s) => (s.notes ? `${s.name}: ${s.notes}` : "")),
      ...(b?.discovery_questions ?? []).map((q) => q.why_it_matters),
    ]).map((s) => ({ s, source: "brief" as const })),
  ];
  // The SOW reader lists dates with semicolons between them; a call note's
  // semicolon joins two halves of one thought ("iPads not procured; 2–3 weeks").
  // The SOW's own identity — its reference, when it was signed, what it is
  // worth — is a fact about the document, not a date the plan has to hit.
  // Reading those as deadlines made the tool argue with itself.
  const IDENTITY =
    /\b(signed|dated|executed|effective|reference|sow[- ]?\d|quote|total|contract value|invoice(d)? (on|at)?)\b/i;
  const sowSentences = sentencesFrom(
    (args.intake.timeline.sow_notes ?? []).filter((n) => !IDENTITY.test(n)),
    true,
  );
  const firstForm = args.intake.wanted_forms[0]?.name ?? null;

  for (const [i, { s, source }] of callSentences.entries()) {
    const dates = datesIn(s, t.closeDate);
    if (dates.length && DEADLINE.test(s) && !ABSENCE.test(s)) {
      const deadline = dates[0]!;
      if (fullLive > deadline.iso) {
        out.push({
          key: `deadline-${i}`,
          severity: "conflict",
          title: `The calls name ${shortDay(deadline.iso)}; the plan has everything live ${shortDay(fullLive)}`,
          detail: `${daysBetween(deadline.iso, fullLive)} days after what they said. Move the work, or say so on the kickoff.`,
          quote: s,
          source,
        });
      } else {
        out.push({
          key: `deadline-ok-${deadline.iso}`,
          severity: "ok",
          title: `The calls name ${shortDay(deadline.iso)}: the plan has everything live ${shortDay(fullLive)}, ${daysBetween(fullLive, deadline.iso)} days ahead`,
          detail:
            "Met, as planned today. If a phase slips past this date, it is the date they said out loud.",
          quote: s,
          source,
        });
      }
    }
    if (dates.length >= 1 && ABSENCE.test(s)) {
      const from = dates[0]!.iso;
      const to = dates[dates.length - 1]!.iso;
      const hit = phaseOver(t, from, to);
      if (hit) {
        const who = names.find((n) => s.includes(n.split(" ")[0]!)) ?? "Someone named on the calls";
        out.push({
          key: `absence-${i}`,
          severity: "check",
          title: `${who} is out ${shortDay(from)}${to !== from ? ` – ${shortDay(to)}` : ""}, during ${hit}`,
          detail: "Their steps in that window need a stand-in, or the phase moves.",
          quote: s,
          source,
        });
      }
    }
    const weeks = weeksIn(s);
    if (weeks && DEVICES.test(s) && (LEAD_TIME.test(s) || NOT_YET.test(s)) && fieldTest) {
      const ready = addDays(t.closeDate, weeks.max * 7);
      if (ready > fieldTest) {
        out.push({
          key: `lead-${i}`,
          severity: "conflict",
          title: `Devices ${weeks.max} week${weeks.max === 1 ? "" : "s"} out; the field test is ${shortDay(fieldTest)}`,
          detail: `${daysBetween(t.closeDate, fieldTest)} days after close. The crew tests on something — say what, or move the test.`,
          quote: s,
          source,
        });
      }
    } else if (!weeks && DEVICES.test(s) && NOT_YET.test(s) && fieldTest) {
      out.push({
        key: `devices-${i}`,
        severity: "check",
        title: `Devices not in hand; the field test is ${shortDay(fieldTest)}`,
        detail: "Confirm what the crew tests on before the working session.",
        quote: s,
        source,
      });
    }
    if (weeks && TOLD.test(s) && !DEVICES.test(s)) {
      const svc = serviceNamed(t, s);
      if (svc && svc.weeks > weeks.max) {
        out.push({
          key: `told-${i}`,
          severity: "conflict",
          title: `${svc.name}: they were told ${weeksLabel(weeks)}; the plan has ${svc.weeks}`,
          detail: `Live ${shortDay(svc.endsOn)} on the plan. Reset the expectation on the kickoff, before the deck does it for you.`,
          quote: s,
          source,
        });
      } else if (!svc) {
        const kind = kindMentioned(s);
        if (kind) {
          out.push({
            key: `told-none-${kind}`,
            severity: "check",
            title: `They were told ${weeksLabel(weeks)} for ${kind}; nothing on the plan for it yet`,
            detail:
              "When it lands on the plan, its weeks are what the customer will hold against that promise.",
            quote: s,
            source,
          });
        }
      }
    }
  }

  // Things the brief recorded as out of scope that the calls kept raising.
  // The brief's reading, not the SOW's: labelled as such.
  const outOfScope = b?.kickoff?.out_of_scope ?? null;
  if (outOfScope) {
    const asked = callSentences
      .map((x) => x.s)
      .join(" ")
      .toLowerCase();
    const items = outOfScope
      .split(/[,;]|\band\b|\bor\b|\//i)
      .map((x) => x.replace(/\(.*?\)/g, "").trim())
      .filter((x) => x.length >= 3 && x.length <= 60);
    for (const item of items) {
      const stem = item.toLowerCase().replace(/^(the|an?)\s+/, "");
      const probe = stem.split(/\s+/).filter((w) => w.length > 2)[0];
      if (probe && asked.includes(probe)) {
        out.push({
          key: `scope-${stem.replace(/\W+/g, "-")}`,
          severity: "check",
          title: `Raised on the calls, listed as out of scope: ${item}`,
          detail:
            "The brief's reading of the calls. Say so on the kickoff, in those words; it is not on the deck otherwise.",
          quote: outOfScope,
          source: "brief",
        });
      }
    }
  }

  // Dates the SOW names, against the plan: met, or not.
  for (const [i, s] of sowSentences.entries()) {
    const dates = datesIn(s, t.closeDate);
    if (!dates.length) continue;
    const svc = serviceNamed(t, s, firstForm);
    const planDate = svc ? svc.endsOn : fullLive;
    const what = svc ? `${svc.name} live` : "everything live";
    for (const d of dates) {
      const late = planDate > d.iso;
      out.push({
        key: `sow-${i}-${d.iso}`,
        severity: late ? "conflict" : "ok",
        title: late
          ? `The SOW names ${shortDay(d.iso)}; the plan has ${what} ${shortDay(planDate)}`
          : `SOW date ${shortDay(d.iso)}: the plan has ${what} ${shortDay(planDate)}, ${daysBetween(planDate, d.iso)} days ahead`,
        detail: late
          ? "A contractual date the plan misses. Move the work or raise it now."
          : "Met, as planned today. A slip past this date is a contractual one.",
        quote: s,
        source: "sow",
      });
    }
  }

  const rank = { conflict: 0, check: 1, ok: 2 };
  return dedupe(out).sort((a, b2) => rank[a.severity] - rank[b2.severity]);
}

/* ------------------------------------------------------------ helpers */

function sentencesFrom(texts: string[], splitSemicolons = false): string[] {
  return texts
    .filter(Boolean)
    .flatMap((t) => t.split(splitSemicolons ? /(?<=[.!?])\s+|\n+|;\s+/ : /(?<=[.!?])\s+|\n+/))
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

type Found = { iso: string; qualified: boolean };

/** Every date a sentence names, as ISO days in the plan's year. */
export function datesIn(sentence: string, anchor: string): Found[] {
  const found: Found[] = [];
  const year = Number(anchor.slice(0, 4));
  const push = (month: number, day: number, qualified: boolean) => {
    let y = year;
    let iso = isoOf(y, month, day);
    // Ninety days before the close is last year's date being mentioned;
    // otherwise a month earlier in the calendar than the close means next year.
    if (daysBetween(iso, anchor) > 90) {
      y += 1;
      iso = isoOf(y, month, day);
    }
    found.push({ iso, qualified });
  };
  // "5–16 Oct", "5 to 16 October", "5 Oct"
  const dayFirst = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*(?:–|-|to|through)\\s*(\\d{1,2})(?:st|nd|rd|th)?)?\\s+${MONTH_RE}\\b`,
    "gi",
  );
  // "Oct 5", "October 5–16", "first week of November", "end of Nov", "Nov 1st"
  const monthFirst = new RegExp(
    `\\b(?:(early|mid|late|first week of|second week of|end of|start of|beginning of|middle of)\\s+)?${MONTH_RE}(?:\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*(?:–|-|to|through)\\s*(\\d{1,2})(?:st|nd|rd|th)?)?)?\\b`,
    "gi",
  );
  const taken = new Set<string>();
  for (const m of sentence.matchAll(dayFirst)) {
    const month = monthOf(m[3]!);
    if (!month) continue;
    push(month, Number(m[1]), true);
    if (m[2]) push(month, Number(m[2]), true);
    taken.add(m[3]!.toLowerCase());
  }
  for (const m of sentence.matchAll(monthFirst)) {
    const month = monthOf(m[2]!);
    if (!month) continue;
    if (m[3] === undefined && taken.has(m[2]!.toLowerCase())) continue;
    if (m[3] !== undefined) {
      push(month, Number(m[3]), true);
      if (m[4]) push(month, Number(m[4]), true);
      continue;
    }
    const q = (m[1] ?? "").toLowerCase();
    const day =
      q === "early" || q === "start of" || q === "beginning of"
        ? 1
        : q === "first week of"
          ? 7
          : q === "second week of"
            ? 14
            : q === "mid" || q === "middle of"
              ? 15
              : q === "late" || q === "end of"
                ? 28
                : 1;
    push(month, day, Boolean(q));
  }
  return found.sort((a, b) => a.iso.localeCompare(b.iso));
}

/** "November", "Nov.", "Sept" → the month number. */
function monthOf(word: string): number | undefined {
  const w = word.toLowerCase().replace(".", "");
  return MONTHS[w] ?? MONTHS[w.slice(0, 3)];
}

function weeksIn(s: string): { min: number; max: number } | null {
  const m = s.match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|ten|twelve)\s*(?:–|-|to)?\s*(\d+|one|two|three|four|five|six|seven|eight|ten|twelve)?\s*(?:-|\s)?weeks?\b/i,
  );
  if (!m) return null;
  const a = num(m[1]!);
  const b = m[2] ? num(m[2]) : a;
  if (!a) return null;
  return { min: Math.min(a, b ?? a), max: Math.max(a, b ?? a) };
}
function num(w: string): number | null {
  const n = Number(w);
  return Number.isFinite(n) && n > 0 ? n : (WORD_NUM[w.toLowerCase()] ?? null);
}
function weeksLabel(w: { min: number; max: number }): string {
  return w.min === w.max ? `${w.max} week${w.max === 1 ? "" : "s"}` : `${w.min}–${w.max} weeks`;
}

const KIND_WORDS: Record<string, RegExp> = {
  custom_pdf: /\b(pdf|report|document|output)\b/i,
  integration:
    /\b(integration|sync|api|connector|export to|feed|kronos|quickbooks|sage|netsuite|salesforce|procore)\b/i,
  training: /\b(training|train|session for admins?|admin training)\b/i,
  paid_form: /\b(form|checklist|inspection|ticket|timesheet)\b/i,
  reference_data: /\b(reference|lookup|list|register|asset data|data load)\b/i,
};

type Named = { name: string; kind: string; weeks: number; endsOn: string };

/** The kind of thing a sentence is about, in words, when the plan has nothing of the kind. */
function kindMentioned(s: string): string | null {
  if (KIND_WORDS["custom_pdf"]!.test(s)) return "the custom PDF";
  if (KIND_WORDS["integration"]!.test(s)) return "the integration";
  if (KIND_WORDS["training"]!.test(s)) return "training";
  if (KIND_WORDS["reference_data"]!.test(s)) return "the reference data";
  return null;
}

/**
 * The plan's item the sentence is about: a service by name or acronym ("SDA"
 * for Storm Damage Assessment), the first form the same way, then a service
 * by the kind of thing it is.
 */
function serviceNamed(t: Timeline, s: string, firstForm: string | null = null): Named | null {
  const services: Named[] = [...t.alongside, ...t.phases.flatMap((p) => p.services)];
  const form: Named | null = firstForm
    ? { name: firstForm, kind: "first_form", weeks: 0, endsOn: t.liveDate }
    : null;
  const all = form ? [...services, form] : services;
  const lower = s.toLowerCase();
  const byName = all.find((svc) => {
    const words = svc.name.split(/\W+/).filter(Boolean);
    const acronym = words
      .filter((w) => /^[A-Za-z]/.test(w))
      .map((w) => w[0]!.toUpperCase())
      .join("");
    if (acronym.length >= 3 && new RegExp(`\\b${acronym}\\b`).test(s)) return true;
    return words
      .map((w) => w.toLowerCase())
      .filter((w) => w.length > 3)
      .some((w) => lower.includes(w));
  });
  if (byName) return byName;
  return all.find((svc) => KIND_WORDS[svc.kind]?.test(s)) ?? null;
}

function lastDate(t: Timeline): string {
  const ends = t.phases.map((p) => p.endsOn).filter((d): d is string => Boolean(d));
  const along = t.alongside.map((s) => s.endsOn);
  return [t.liveDate, ...ends, ...along].sort().pop()!;
}

function phaseOver(t: Timeline, from: string, to: string): string | null {
  if (from <= t.liveDate && to >= t.closeDate) return "phase 1";
  for (const p of t.phases) {
    if (p.startsOn && p.endsOn && from <= p.endsOn && to >= p.startsOn) return p.label;
  }
  return null;
}

function isoOf(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, Math.min(Math.max(d, 1), 28 + (m === 2 ? 0 : 3))));
  return dt.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
function dedupe(rows: WatchOut[]): WatchOut[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.severity}|${r.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
