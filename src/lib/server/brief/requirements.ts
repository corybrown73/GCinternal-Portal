import type { BriefRequirement, RequirementKind } from "../schemas";

/**
 * The customer's specific needs, after the model has listed them.
 *
 * The model is asked for one item per capability, quoted. This is what the
 * code does with its answer: an item with no words is dropped, the same
 * need twice is one, and an item whose quote cannot be found is KEPT — the
 * check marks it to confirm; a requirement nobody hears about is the
 * failure this exists to stop. Then a short, literal backstop: a capability
 * the calls name in so many words (a QR code, a barcode, GPS, working with
 * no signal) that no item covers is added with the sentence it was said in.
 *
 * Sutton Farms said each bin and each field carries a QR code; the brief
 * had nowhere to put it and it was lost. It is an item now, and when the
 * model misses it, the backstop does not.
 *
 * INTERNAL: the TIS reads these on the deal and in the deck's notes. They
 * never reach a customer page, and a need is never a purchase.
 */

type Capability = { kind: RequirementKind; text: string; pattern: RegExp; except?: RegExp };

/** Only capabilities a sentence names unambiguously; a photo of a paper form is not a need for photos. */
const CAPABILITIES: readonly Capability[] = [
  { kind: "form_feature", text: "Scan QR codes", pattern: /\bQR\b|\bQR[- ]?codes?\b/i },
  { kind: "form_feature", text: "Scan barcodes", pattern: /\bbar[- ]?codes?\b/i },
  {
    kind: "form_feature",
    text: "Record GPS location",
    pattern: /\bGPS\b|\bgeo[- ]?(?:locat\w*|tag\w*|stamp\w*)\b/i,
  },
  {
    kind: "device",
    text: "Work offline, with no signal",
    pattern:
      /\boffline\b|\bno (?:cell(?:ular)? )?(?:signal|service|coverage|reception)\b|\bwithout (?:a )?(?:signal|connection|coverage)\b/i,
    // "Let's take the pricing conversation offline" is not about signal;
    // "taking readings offline in the basement" is.
    except:
      /\b(?:take|takes|taking|taken|took)\s+(?:this|that|it|(?:the|this|that)\s+(?:\w+\s+)?(?:conversation|discussion|chat|topic|question))\s+offline\b|\boffline (?:conversation|discussion|chat|call|meeting)\b/i,
  },
];

/**
 * "We don't need GPS", "We do not use QR codes", "They won't be scanning
 * barcodes", "GPS is not needed" — the negation bound to the capability:
 * right before it (two words at most between) or right after it, in the
 * clause that names it. One thing negated never hides another in the same
 * sentence ("They don't need photos, but every bin has a QR code"), and a
 * "don't want" about something else does not deny the need ("We don't want
 * to lose a single entry when the crews are offline").
 */
const NEGATED_BEFORE =
  /(?:\bno need(?:\s+(?:for|to))?|\b(?:don'?t|do not|doesn'?t|does not|didn'?t|did not|won'?t|will not|never)\s+(?:\w+\s+)?(?:need|use|want|scan|require|have to)|\b(?:won'?t|will not) be \w+ing)\s+(?:[\w']+\s+){0,2}$/i;
const NEGATED_AFTER =
  /^\s*(?:[\w']+\s+){0,2}?(?:(?:is|are|was|were)\s+not|isn'?t|aren'?t|wasn'?t|weren'?t|not)\s+(?:needed|required|used|wanted|necessary)\b/i;
/** "No QR codes": a "no" just before the capability. */
const NO_BEFORE = /\bno\s+(?:more\s+|real\s+)?$/i;

/** A sentence's clauses: split at punctuation and at a turn ("but", "though"). */
const clauses = (sentence: string) =>
  sentence
    .replace(/[\u2018\u2019]/g, "'")
    .split(/[,;:]|\s(?:but|though|although|however|whereas|while)\s/i);

/** Does this sentence name the capability as a need, in a clause that does not deny it? */
function namesNeed(cap: Capability, sentence: string): boolean {
  return clauses(sentence).some((c) => {
    const m = cap.pattern.exec(c);
    if (!m) return false;
    if (cap.except?.test(c)) return false;
    const before = c.slice(0, m.index);
    const after = c.slice(m.index + m[0].length);
    return !NEGATED_BEFORE.test(before) && !NO_BEFORE.test(before) && !NEGATED_AFTER.test(after);
  });
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The sentences of the calls, one line each. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The model's list, tidied, with the backstop after it. Pure.
 *
 * Kept: every item with words, in the model's order, once. Added: one item
 * per backstop capability the calls name and no item mentions.
 */
export function finalizeRequirements(
  items: ReadonlyArray<BriefRequirement> | null | undefined,
  callsText: string,
): BriefRequirement[] {
  const out: BriefRequirement[] = [];
  const seen = new Set<string>();
  for (const r of items ?? []) {
    const text = r.text?.trim();
    if (!text) continue;
    const key = norm(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      text: text.slice(0, 300),
      kind: r.kind,
      quote: (r.quote ?? "").trim().slice(0, 400),
      source: (r.source ?? "").trim().slice(0, 200),
    });
  }
  const said = sentences(callsText);
  for (const cap of CAPABILITIES) {
    const covered = out.some((r) => cap.pattern.test(r.text) || cap.pattern.test(r.quote));
    if (covered) continue;
    const hit = said.find((s) => namesNeed(cap, s));
    if (!hit) continue;
    out.push({ text: cap.text, kind: cap.kind, quote: hit.slice(0, 200), source: "calls" });
  }
  return out.slice(0, 30);
}

/** "Scan QR codes — “each bin and each field carries a QR code”", for the deck's notes. */
export function requirementLine(r: Pick<BriefRequirement, "text" | "quote">): string {
  return r.quote && norm(r.quote) !== norm(r.text) ? `${r.text} — “${r.quote}”` : r.text;
}
