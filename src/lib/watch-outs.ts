import type { BriefJson } from "./server/schemas";
import { firstFormName, type IntakeAnswers, type TypedDate } from "./intake-answers";
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
  /**
   * What kind of thing it is, so two readings of one fact dedupe as one.
   * `disagreement` is two sources against each other (the SOW and the
   * calls), not a source against the plan.
   */
  type: "deadline" | "absence" | "lead_time" | "expectation" | "scope" | "disagreement";
  /** Who it is about, for an absence. */
  who?: string | null;
  title: string;
  detail: string;
  /** The sentence it was read from. */
  quote: string;
  /** calls — the pasted notes, verbatim; brief — the AI's reading of them; sow — the SOW reader's notes. */
  source: "calls" | "brief" | "sow";
  /** For a disagreement: the other source and its words. */
  against?: { source: "calls" | "brief" | "sow"; quote: string };
};

/** A typed date with where it was read. */
export type SourcedDate = TypedDate & { source: "brief" | "sow" };

/**
 * Every date a reader typed for this deal: the SOW reader's on the intake,
 * the brief's from the calls. Null entries mean that reading predates
 * typed dates, and the caller falls back to reading the words.
 */
export function typedDatesFor(args: { brief: unknown; intake: IntakeAnswers }): {
  sow: SourcedDate[] | null;
  brief: SourcedDate[] | null;
} {
  const b = (args.brief ?? null) as Partial<BriefJson> | null;
  const sow = args.intake.timeline.sow_dates;
  return {
    sow: sow ? sow.map((d) => ({ ...d, source: "sow" as const })) : null,
    brief:
      b && Array.isArray(b.dates) ? b.dates.map((d) => ({ ...d, source: "brief" as const })) : null,
  };
}

/**
 * What a booked meeting on `date` runs into: a named person's absence, or a
 * deadline it falls after. For the booking form, so the warning shows
 * before the invite goes out.
 */
export function bookingWarnings(date: string, dates: ReadonlyArray<SourcedDate>): string[] {
  const out: string[] = [];
  for (const d of dates) {
    if (d.type === "absence") {
      const end = d.end ?? d.date;
      if (date >= d.date && date <= end) {
        out.push(
          `${d.who ?? "Someone named on the calls"} is out ${shortDay(d.date)}${
            end !== d.date ? ` – ${shortDay(end)}` : ""
          }`,
        );
      }
    } else if (d.type === "deadline" && date > d.date) {
      out.push(
        `After ${shortDay(d.date)}, the date the ${d.source === "sow" ? "SOW" : "calls"} name${
          d.source === "sow" ? "s" : ""
        }`,
      );
    }
  }
  return out;
}

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

/** A note as pasted, and the day of the call it records (for "in two weeks"). */
export type NoteInput = string | { text: string; date: string | null };

export function watchOutsFor(args: {
  brief: unknown;
  /** The pasted call notes and account maps, verbatim. Read first: a quote is a real sentence. */
  notes?: NoteInput[];
  intake: IntakeAnswers;
  timeline: Timeline;
}): WatchOut[] {
  const t = args.timeline;
  const b = (args.brief ?? null) as Partial<BriefJson> | null;
  const out: WatchOut[] = [];
  const fullLive = lastDate(t);
  const fieldTest = t.milestones.find((m) => m.key === "fieldtest")?.date ?? null;
  const names = (b?.stakeholders ?? []).map((s) => s.name).filter(Boolean);
  // People and the customer's own name are never a place a date is about.
  const notPlaces = [...names, ...(b?.account_name ? [b.account_name] : [])];

  // The notes as pasted come first, so a row quotes what was actually said.
  // The brief's own sentences follow for anything only its reading caught;
  // a row already found from the notes wins the dedupe.
  const noteInputs = (args.notes ?? []).map((n) =>
    typeof n === "string" ? { text: n, date: null } : n,
  );
  const callSentences: Array<{ s: string; source: "calls" | "brief"; anchor?: string }> = [
    ...noteInputs.flatMap((n) =>
      sentencesFrom([n.text]).map((s) => ({
        s,
        source: "calls" as const,
        ...(n.date ? { anchor: n.date.slice(0, 10) } : {}),
      })),
    ),
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
  const firstForm = firstFormName(args.intake);

  // Typed dates first: what a reader stated, never a day guessed from a
  // month. A reading that carries them turns the word-reading below off
  // for deadlines and absences; a reading from before they existed keeps it.
  const typed = typedDatesFor({ brief: args.brief, intake: args.intake });
  for (const d of [...(typed.sow ?? []), ...(typed.brief ?? [])]) {
    if (d.type === "deadline") {
      const named = d.source === "sow" ? "The SOW names" : "The calls name";
      const target = planTargetFor(t, d.quote, firstForm, notPlaces);
      if (target.kind === "uncovered") {
        out.push(uncoveredRow(`${d.source}-uncovered-${d.date}`, named, d.date, target, d));
        continue;
      }
      const svc = target.kind === "service" ? target.svc : null;
      const planDate = svc ? svc.endsOn : fullLive;
      const what = svc ? `${svc.name} live` : "everything live";
      const late = planDate > d.date;
      out.push({
        key: `${d.source}-deadline-${d.date}-${svc?.name ?? "all"}`,
        type: "deadline",
        severity: late ? "conflict" : "ok",
        title: late
          ? `${named} ${shortDay(d.date)}; the plan has ${what} ${shortDay(planDate)}`
          : `${named} ${shortDay(d.date)}: the plan has ${what} ${shortDay(planDate)}, ${daysBetween(planDate, d.date)} days ahead`,
        detail: late
          ? d.source === "sow"
            ? "A contractual date the plan misses. Move the work or raise it now."
            : `${daysBetween(d.date, planDate)} days after what they said. Move the work, or say so on Stage 1.`
          : d.source === "sow"
            ? "Met, as planned today. A slip past this date is a contractual one."
            : "Met, as planned today. If a phase slips past this date, it is the date they said out loud.",
        quote: d.quote,
        source: d.source,
      });
    } else if (d.type === "absence") {
      const end = d.end ?? d.date;
      const hit = phaseOver(t, d.date, end);
      if (hit) {
        const who = d.who ?? "Someone named on the calls";
        out.push({
          key: `${d.source}-absence-${who}-${d.date}-${end}`,
          type: "absence",
          who,
          severity: "check",
          title: `${who} is out ${shortDay(d.date)}${end !== d.date ? ` – ${shortDay(end)}` : ""}, during ${hit}`,
          detail: "Their steps in that window need a stand-in, or the phase moves.",
          quote: d.quote,
          source: d.source,
        });
      }
    }
  }
  const readCallDates = typed.brief === null;
  const readSowDates = typed.sow === null;

  for (const [i, { s, source, anchor }] of callSentences.entries()) {
    // "Go-live in two weeks", said on the call: two weeks from the call, or
    // from the close when the note carries no date. Relative statements are
    // never in the typed dates, so this runs whatever the brief found.
    const rel = relativeGoLive(s, anchor ?? t.closeDate);
    if (rel && !ABSENCE.test(s)) {
      if (fullLive > rel.iso) {
        out.push({
          key: `golive-rel-${i}`,
          type: "deadline",
          severity: "conflict",
          title: `The calls say live in ${rel.said} (${shortDay(rel.iso)}); the plan has everything live ${shortDay(fullLive)}`,
          detail: `${daysBetween(rel.iso, fullLive)} days after what they said${anchor ? "" : ", counted from the close because the note has no call date"}. Move the work, or reset the expectation on the kickoff.`,
          quote: s,
          source,
        });
      } else {
        out.push({
          key: `golive-rel-ok-${i}`,
          type: "deadline",
          severity: "ok",
          title: `The calls say live in ${rel.said}: the plan has everything live ${shortDay(fullLive)}, in time`,
          detail: "Met, as planned today.",
          quote: s,
          source,
        });
      }
    }
    const dates = readCallDates ? datesIn(s, t.closeDate) : [];
    // A date about one thing is read against that thing: a service on the
    // plan, else nothing on the plan covers it and it is a check, never "met".
    // Only a sentence about the whole go-live is read against everything live.
    const target = dates.length ? planTargetFor(t, s, null, notPlaces) : null;
    if (dates.length && DEADLINE.test(s) && !ABSENCE.test(s) && target?.kind === "uncovered") {
      out.push(
        uncoveredRow(`uncovered-${i}`, "The calls name", dates[0]!.iso, target, {
          quote: s,
          source,
        }),
      );
    } else if (dates.length && DEADLINE.test(s) && !ABSENCE.test(s) && target?.kind === "service") {
      const svc = target.svc;
      const deadline = dates[0]!;
      const late = svc.endsOn > deadline.iso;
      out.push({
        key: `deadline-svc-${i}`,
        type: "deadline",
        severity: late ? "conflict" : "ok",
        title: late
          ? `The calls name ${shortDay(deadline.iso)}; the plan has ${svc.name} live ${shortDay(svc.endsOn)}`
          : `The calls name ${shortDay(deadline.iso)}: the plan has ${svc.name} live ${shortDay(svc.endsOn)}, ${daysBetween(svc.endsOn, deadline.iso)} days ahead`,
        detail: late
          ? `${daysBetween(deadline.iso, svc.endsOn)} days after what they said. Move the work, or say so on the kickoff.`
          : "Met, as planned today. If a phase slips past this date, it is the date they said out loud.",
        quote: s,
        source,
      });
    } else if (dates.length && DEADLINE.test(s) && !ABSENCE.test(s)) {
      const deadline = dates[0]!;
      if (fullLive > deadline.iso) {
        out.push({
          key: `deadline-${i}`,
          type: "deadline",
          severity: "conflict",
          title: `The calls name ${shortDay(deadline.iso)}; the plan has everything live ${shortDay(fullLive)}`,
          detail: `${daysBetween(deadline.iso, fullLive)} days after what they said. Move the work, or say so on the kickoff.`,
          quote: s,
          source,
        });
      } else {
        out.push({
          key: `deadline-ok-${deadline.iso}`,
          type: "deadline",
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
          type: "absence",
          who,
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
          type: "lead_time",
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
        type: "lead_time",
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
          type: "expectation",
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
            type: "expectation",
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
          type: "scope",
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

  // Dates the SOW names in prose, against the plan — only for a SOW read
  // before the reader typed its dates.
  for (const [i, s] of sowSentences.entries()) {
    const dates = readSowDates ? datesIn(s, t.closeDate) : [];
    if (!dates.length) continue;
    const target = planTargetFor(t, s, firstForm, notPlaces);
    if (target.kind === "uncovered") {
      for (const d of dates) {
        out.push(
          uncoveredRow(`sow-uncovered-${i}-${d.iso}`, "The SOW names", d.iso, target, {
            quote: s,
            source: "sow",
          }),
        );
      }
      continue;
    }
    const svc = target.kind === "service" ? target.svc : null;
    const planDate = svc ? svc.endsOn : fullLive;
    const what = svc ? `${svc.name} live` : "everything live";
    for (const d of dates) {
      const late = planDate > d.iso;
      out.push({
        key: `sow-${i}-${d.iso}`,
        type: "deadline",
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

  // The sources against each other: the SOW and the calls naming different
  // dates, seats or phases for the same thing. Advisory checks, never moving
  // a plan date; each names both sources in their own words.
  out.push(
    ...sourceDisagreements({
      timeline: t,
      intake: args.intake,
      brief: b,
      callSentences,
      sowSentences,
      typed,
      firstForm,
      names: notPlaces,
    }),
  );

  const rank = { conflict: 0, check: 1, ok: 2 };
  return dedupe(out).sort((a, b2) => rank[a.severity] - rank[b2.severity]);
}

/* ------------------------------------------------- what a date is about */

/**
 * A capitalised place or unit right before a word that makes it one
 * ("Denver branch", "Denver go-live", "Tulsa crews", "Denver needs to be
 * live"), or after "in"/"at".
 */
const PLACE_BEFORE =
  /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)\s+(?:branch(?:es)?|office|site|location|yard|depot|shop|region|division|crews?|team|go[- ]?live|roll[- ]?out|launch|cut[- ]?over|(?:needs?|has|have|must|should|will)\s+(?:to\s+)?(?:be|go)\s+live)\b/g;
const PLACE_AFTER = /\b(?:in|at)\s+(?:the\s+)?([A-Z][A-Za-z]+)\b/g;
/** "all branches", "every location", "each of the sites". */
const ALL_SITES =
  /\b(all|every|each)\s+(?:of\s+(?:the|our|their)\s+)?(branch(?:es)?|locations?|sites?|offices?|yards?|regions?|crews?|divisions?)\b/i;
/** A sentence about the whole go-live, read against everything live. */
const ABOUT_ALL =
  /\b(go[- ]?live|be live|live|launch(?:ed|ing)?|in production|up and running|roll(?:ed)?[- ]?out|everything|whole|all of it|deadline|season|at the latest|no later)\b/i;
const NOT_A_PLACE = new Set([
  "the",
  "our",
  "their",
  "we",
  "they",
  "sow",
  "gocanvas",
  "phase",
  "stage",
  "kickoff",
  "go",
  "all",
  "each",
  "every",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

/** The places and units a sentence names, as written ("Denver", "all branches"). */
function placesIn(s: string, names: ReadonlyArray<string>): string[] {
  const people = new Set(names.flatMap((n) => n.split(/\s+/)).map((w) => w.toLowerCase()));
  const ok = (w: string) => {
    const first = w.split(/\s+/)[0]!.toLowerCase();
    return !NOT_A_PLACE.has(first) && !isMonthWord(first) && !people.has(first);
  };
  const out: string[] = [];
  const all = ALL_SITES.exec(s);
  if (all)
    out.push(
      `all ${all[2]!.toLowerCase().replace(/^(branch|location|site|office|yard|region|crew|division)$/, "$1s")}`,
    );
  for (const m of s.matchAll(PLACE_BEFORE)) if (ok(m[1]!)) out.push(m[1]!);
  for (const m of s.matchAll(PLACE_AFTER)) if (ok(m[1]!)) out.push(m[1]!);
  return [...new Set(out)];
}

type PlanTarget =
  { kind: "service"; svc: Named } | { kind: "all" } | { kind: "uncovered"; thing: string | null };

/**
 * What on the plan a dated sentence is about: a service (or the first form)
 * by name, the whole go-live, or nothing the plan dates — a place, every
 * branch, a thing the plan does not carry. Nothing-on-the-plan is a check,
 * never "met" against some other date.
 */
function planTargetFor(
  t: Timeline,
  s: string,
  firstForm: string | null,
  names: ReadonlyArray<string>,
): PlanTarget {
  const svc = serviceNamed(t, s, firstForm);
  if (svc) return { kind: "service", svc };
  const place = placesIn(s, names)[0];
  if (place) return { kind: "uncovered", thing: place };
  if (ABOUT_ALL.test(s)) return { kind: "all" };
  return { kind: "uncovered", thing: kindMentioned(s) };
}

function uncoveredRow(
  key: string,
  named: string,
  date: string,
  target: { thing: string | null },
  from: { quote: string; source: WatchOut["source"] },
): WatchOut {
  return {
    key,
    type: "deadline",
    severity: "check",
    title: target.thing
      ? `${named} ${shortDay(date)} for ${target.thing}: nothing on the plan for it`
      : `${named} ${shortDay(date)}: nothing on the plan is dated for it`,
    detail:
      "The plan does not cover this date, so it is not met by any other date on it. Put it on the plan, or agree with the customer what it means.",
    quote: from.quote,
    source: from.source,
  };
}

/* --------------------------------------------- the sources, against each other */

const SEATS_RE =
  /\b(\d{1,3}(?:,\d{3})*|\d+)\s+(?:[A-Za-z-]+\s+){0,2}?(licen[cs]es?|seats?|users?)\b/i;
const LICENSED_RE = /\b(licen[cs]es?|seats?)\b/i;
const PHASE_RE = /\bphase\s*(\d|one|two|three|four)\b/i;
/** A date that opens something ("rollout starts November 2"), not one it must be done by. */
const STARTS_RE =
  /\b(start(?:s|ing)?|begin(?:s|ning)?|kick(?:s|ing)?[- ]?off|commenc(?:e|es|ing))\b/i;
const LATER_RE =
  /\b(later|down the road|second phase|next phase|after (?:the )?(?:first form|form|go[- ]?live|launch|phase one|phase 1)|once (?:the )?(?:form|first form) is (?:live|working)|can wait)\b/i;
const NOW_RE =
  /\b(right away|from day one|day one|at kickoff|up front|immediately|alongside the (?:first )?form|at the same time as the form)\b/i;
const NAME_GENERIC = new Set([
  "integration",
  "online",
  "form",
  "forms",
  "report",
  "custom",
  "sync",
  "phase",
  "training",
  "admin",
  "service",
  "services",
  "data",
  "load",
  "setup",
  "build",
  "with",
  "from",
]);
const ALIASES: Array<[RegExp, RegExp]> = [[/quickbooks/i, /\b(qbo|quickbooks|quick books)\b/i]];

/**
 * True when the sentence names this item: every distinctive word of its name
 * ("Backflow", "QuickBooks"), its acronym ("SDA") or a known alias ("QBO").
 * Every word, not any: "storm season" is not "Storm Damage Assessment".
 */
function namesItem(name: string, s: string): boolean {
  for (const [isIt, alias] of ALIASES) if (isIt.test(name) && alias.test(s)) return true;
  const words = name.split(/\W+/).filter(Boolean);
  const acronym = words
    .filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0]!.toUpperCase())
    .join("");
  if (acronym.length >= 3 && new RegExp(`\\b${acronym}\\b`).test(s)) return true;
  const lower = s.toLowerCase();
  const distinct = words
    .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length > 3 && !NAME_GENERIC.has(w));
  return distinct.length > 0 && distinct.every((w) => new RegExp(`\\b${w}`).test(lower));
}

function seatsIn(s: string): number | null {
  const m = SEATS_RE.exec(s);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Every count a sentence gives, marked when it counts licences or seats rather than users. */
function seatCountsIn(s: string): Array<{ n: number; licensed: boolean }> {
  const out: Array<{ n: number; licensed: boolean }> = [];
  for (const m of s.matchAll(new RegExp(SEATS_RE.source, "gi"))) {
    const n = Number(m[1]!.replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) out.push({ n, licensed: LICENSED_RE.test(m[2]!) });
  }
  return out;
}

/** The phase a sentence gives, as a number, or "later" for "after the form", or 1 for "right away". */
function phaseIn(s: string): number | "later" | null {
  const m = PHASE_RE.exec(s);
  if (m) return num(m[1]!) ?? null;
  if (LATER_RE.test(s)) return "later";
  if (NOW_RE.test(s)) return 1;
  return null;
}

function sourceLabel(src: WatchOut["source"]): string {
  return src === "sow" ? "SOW" : src === "brief" ? "Brief" : "Calls";
}

type Dated = {
  date: string;
  quote: string;
  source: WatchOut["source"];
  /** Only a deadline is compared with a deadline, a start with a start. */
  kind: "deadline" | "start";
};

/**
 * Where the SOW and the calls disagree with each other: the seat count, a
 * service's phase, and the date for the same place or item. Pure; every row
 * is a check that names both sources with their quotes.
 */
export function sourceDisagreements(args: {
  timeline: Timeline;
  intake: IntakeAnswers;
  brief: Partial<BriefJson> | null;
  callSentences: ReadonlyArray<{ s: string; source: "calls" | "brief"; anchor?: string }>;
  sowSentences: ReadonlyArray<string>;
  typed: { sow: SourcedDate[] | null; brief: SourcedDate[] | null };
  firstForm: string | null;
  names: ReadonlyArray<string>;
}): WatchOut[] {
  const t = args.timeline;
  const out: WatchOut[] = [];
  const facts = args.intake.timeline.sow_facts ?? null;
  const both = (
    a: { source: WatchOut["source"]; quote: string },
    b: { source: WatchOut["source"]; quote: string },
  ) => `${sourceLabel(a.source)}: “${a.quote}” · ${sourceLabel(b.source)}: “${b.quote}”.`;

  // SEATS. The SOW's count, kept at apply, against the counts the calls
  // give: a licence or seat count first, then the brief's reading, then a
  // count of users. Any count that matches the SOW means they agree ("3
  // office users" next to "45 licenses" is not a second seat count).
  if (facts?.seats) {
    const sowQuote =
      args.sowSentences.find((s) => seatsIn(s) === facts.seats) ?? `${facts.seats} seats`;
    const counted = args.callSentences.flatMap((c) =>
      seatCountsIn(c.s).map((k) => ({ ...k, quote: c.s, source: c.source })),
    );
    const briefSeats = args.brief?.kickoff?.licensed_seats ?? null;
    const briefN = briefSeats ? seatsFromText(briefSeats) : null;
    const candidates = [
      ...counted.filter((c) => c.licensed),
      ...(briefSeats && briefN !== null
        ? [{ n: briefN, quote: briefSeats, source: "brief" as const }]
        : []),
      ...counted.filter((c) => !c.licensed),
    ];
    const fromCalls = candidates.some((c) => c.n === facts.seats) ? null : candidates[0];
    if (fromCalls && fromCalls.n !== facts.seats) {
      out.push({
        key: `vs-seats-${facts.seats}-${fromCalls.n}`,
        type: "disagreement",
        severity: "check",
        title: `Seats: the SOW says ${facts.seats}, the ${fromCalls.source === "brief" ? "brief says" : "calls say"} ${fromCalls.n}`,
        detail: `${both({ source: "sow", quote: sowQuote }, fromCalls)} Agree the count before the kickoff; the account and the deck use one number.`,
        quote: sowQuote,
        source: "sow",
        against: { source: fromCalls.source, quote: fromCalls.quote },
      });
    }
  }

  // PHASE. Each service the SOW names, against a sentence on the calls
  // that names it and gives a phase ("phase 2", "later", "right away").
  for (const svc of facts?.services ?? []) {
    const said = args.callSentences.find((c) => namesItem(svc.name, c.s) && phaseIn(c.s) !== null);
    if (!said) continue;
    const callPhase = phaseIn(said.s)!;
    const differs = callPhase === "later" ? svc.phase === 1 : callPhase !== svc.phase;
    if (!differs) continue;
    const sowQuote = svc.quote ?? `${svc.name} — phase ${svc.phase}`;
    out.push({
      key: `vs-phase-${svc.name.toLowerCase()}-${svc.phase}-${callPhase}`,
      type: "disagreement",
      severity: "check",
      title: `${svc.name}: the SOW puts it in phase ${svc.phase}, the ${said.source === "brief" ? "brief" : "calls"} ${callPhase === "later" ? "in a later phase" : `in phase ${callPhase}`}`,
      detail: `${both({ source: "sow", quote: sowQuote }, { source: said.source, quote: said.s })} Agree the phase with the customer; the plan keeps the phase it has until a person moves it.`,
      quote: sowQuote,
      source: "sow",
      against: { source: said.source, quote: said.s },
    });
  }

  // DATES. A date the SOW names and a date the calls name for the same
  // place or item, when they differ. Like with like: a SOW start ("rollout
  // starts Nov 2") never disagrees with a calls deadline ("live by Nov 9").
  const typedDated = (ds: SourcedDate[], source: "sow" | "brief"): Dated[] =>
    ds.flatMap((d) =>
      d.type === "deadline" || d.type === "start"
        ? [{ date: d.date, quote: d.quote, source, kind: d.type }]
        : [],
    );
  const kindOf = (s: string): Dated["kind"] =>
    STARTS_RE.test(s) && !DEADLINE.test(s) ? "start" : "deadline";
  const sowDated: Dated[] = args.typed.sow
    ? typedDated(args.typed.sow, "sow")
    : args.sowSentences.flatMap((s) =>
        datesIn(s, t.closeDate).map((d) => ({
          date: d.iso,
          quote: s,
          source: "sow" as const,
          kind: kindOf(s),
        })),
      );
  const callDated: Dated[] = args.typed.brief ? typedDated(args.typed.brief, "brief") : [];
  // The notes verbatim, when the brief typed no dates: only a sentence that
  // names a day ("Nov 2"), never a month guessed into one. Each is a deadline
  // (it passed DEADLINE), so it is only compared with the SOW's deadlines.
  if (!args.typed.brief) {
    for (const c of args.callSentences) {
      if (ABSENCE.test(c.s) || !DEADLINE.test(c.s)) continue;
      if (
        !new RegExp(
          `${MONTH_RE}\\s+\\d{1,2}\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_RE}`,
          "i",
        ).test(c.s)
      )
        continue;
      const d = datesIn(c.s, c.anchor ?? t.closeDate)[0];
      if (d) callDated.push({ date: d.iso, quote: c.s, source: c.source, kind: "deadline" });
    }
  }
  const items = [
    ...t.alongside.map((x) => x.name),
    ...t.phases.flatMap((p) => p.services.map((x) => x.name)),
    ...(args.firstForm ? [args.firstForm] : []),
  ];
  const company = new Set(words(args.brief?.account_name ?? "").filter((w) => w.length > 2));
  /**
   * The subjects a sentence names, each marked `sure` when it is a place
   * ("Denver branch"), a plan item, or a capitalised word mid-sentence. A
   * sentence's capitalised first word ("Admin training…") may be just a
   * common word, so it only counts when the other side is sure of it.
   */
  const subjectsOf = (s: string): Map<string, { label: string; sure: boolean }> => {
    const m = new Map<string, { label: string; sure: boolean }>();
    // A proper noun both quotes use ("Denver") is the same subject, wherever
    // it sits in the sentence. The customer's own name is not a subject.
    const lead = /^\W*([A-Za-z]+)/.exec(s)?.[1] ?? "";
    for (const p of properNounsIn(s, args.names)) {
      if (company.has(p.toLowerCase())) continue;
      const midSentence = new RegExp(`\\S\\s+${p}\\b`).test(s);
      m.set(p.toLowerCase(), { label: p, sure: p !== lead || midSentence });
    }
    for (const p of placesIn(s, args.names)) m.set(p.toLowerCase(), { label: p, sure: true });
    for (const name of items)
      if (namesItem(name, s)) m.set(`item:${name.toLowerCase()}`, { label: name, sure: true });
    return m;
  };
  const seen = new Set<string>();
  for (const a of sowDated) {
    const sa = subjectsOf(a.quote);
    if (!sa.size) continue;
    for (const c of callDated) {
      if (c.date === a.date || c.kind !== a.kind) continue;
      const sc = subjectsOf(c.quote);
      const shared = [...sa.keys()].find((k) => sc.has(k) && (sa.get(k)!.sure || sc.get(k)!.sure));
      if (!shared) continue;
      const key = `vs-date-${shared}-${a.date}-${c.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        type: "disagreement",
        severity: "check",
        title: `The SOW and the ${c.source === "brief" ? "brief" : "calls"} give different dates for ${sa.get(shared)!.label}: ${shortDay(a.date)} vs ${shortDay(c.date)}`,
        detail: `${both(a, c)} Agree one date with the customer; neither moves the plan.`,
        quote: a.quote,
        source: "sow",
        against: { source: c.source, quote: c.quote },
      });
    }
  }
  return out;
}

const NOT_A_SUBJECT = new Set([
  ...NOT_A_PLACE,
  "this",
  "that",
  "these",
  "those",
  "it",
  "your",
  "his",
  "her",
  "he",
  "she",
  "an",
  "and",
  "but",
  "if",
  "when",
  "by",
  "before",
  "after",
  "on",
  "in",
  "at",
  "for",
  "to",
  "of",
  "live",
  "target",
  "deadline",
  "due",
  "customer",
  "client",
  "need",
  "needs",
  "must",
  "should",
  "will",
  "can",
  "named",
  "date",
  "dates",
  "qa",
  "pdf",
]);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Capitalised words that are names of things, not months, days, people or sentence glue. */
function properNounsIn(s: string, names: ReadonlyArray<string>): string[] {
  const people = new Set(names.flatMap((n) => words(n)));
  const out = new Set<string>();
  for (const m of s.matchAll(/\b[A-Z][a-zA-Z]{2,}\b/g)) {
    const w = m[0];
    const lower = w.toLowerCase();
    if (NOT_A_SUBJECT.has(lower) || isMonthWord(lower) || people.has(lower)) continue;
    out.add(w);
  }
  return [...out];
}

function seatsFromText(text: string): number | null {
  const n = Number(/\d[\d,]*/.exec(text)?.[0]?.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
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

/** True for a month's name or abbreviation as a whole word: "Nov", "November" — not "Marshall". */
function isMonthWord(word: string): boolean {
  return new RegExp(`^${MONTH_RE}$`, "i").test(word);
}

/** "November", "Nov.", "Sept" → the month number. */
function monthOf(word: string): number | undefined {
  const w = word.toLowerCase().replace(".", "");
  return MONTHS[w] ?? MONTHS[w.slice(0, 3)];
}

const GO_LIVE_REL =
  /\b(go[- ]?live|be live|live|launch(?:ed|ing)?|in production|up and running|rolled? out|rollout)\b[^.;]{0,40}?\b(?:in|within)\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|ten|twelve)\s*(days?|weeks?|months?)\b/i;

/** "go-live in 2 weeks" → the day that is, from the anchor, and the words said. */
export function relativeGoLive(
  sentence: string,
  anchor: string,
): { iso: string; said: string } | null {
  const m = GO_LIVE_REL.exec(sentence);
  if (!m) return null;
  const raw = m[2]!.toLowerCase();
  const n = raw === "a" || raw === "an" ? 1 : num(raw);
  if (!n) return null;
  const unit = m[3]!.toLowerCase();
  const days = unit.startsWith("day") ? n : unit.startsWith("week") ? n * 7 : n * 30;
  return {
    iso: addDays(anchor, days),
    said: `${n} ${unit.replace(/s$/, "")}${n === 1 ? "" : "s"}`,
  };
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
  custom_pdf: /\b(pdfs?|reports?|documents?|output)\b/i,
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
/**
 * One row per fact: a deadline is one row per date and item, an absence one
 * per person and window — however many sources said it — and anything else
 * one per title.
 */
function dedupe(rows: WatchOut[]): WatchOut[] {
  const seen = new Set<string>();
  const range = (r: WatchOut) => r.title.replace(/^.*?(\w{3} \d{1,2}.*?)(,|;|:|$).*$/s, "$1");
  return rows.filter((r) => {
    const k =
      r.type === "absence"
        ? `absence|${(r.who ?? "").toLowerCase()}|${range(r)}`
        : r.type === "deadline"
          ? `deadline|${r.severity}|${range(r)}|${r.title.replace(/^.*?; the plan has |^.*?: the plan has /, "")}`
          : `${r.severity}|${r.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
