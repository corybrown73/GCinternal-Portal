import { companyNameFrom } from "./company-name";

/**
 * The customer's name the way a customer should read it.
 *
 * A services deal is stored as "<customer> — services" so the pipeline can
 * tell it from the original; that suffix is bookkeeping, and "Varley Group
 * — services's onboarding" in an email is not. Every customer-facing line
 * goes through here.
 */
export function displayName(dealName: string | null | undefined): string {
  const bare = (dealName ?? "")
    .replace(/\s*[—–-]\s*services\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return withoutInternalMarkers(companyNameFrom(bare) || bare);
}

/*
 * Markers a person adds to a deal name for us, never for the customer. Each
 * is anchored at an end of the name, so a parenthesis or a dash inside a real
 * company name is left alone. Display only: companyNameFrom stays as it is,
 * because the closed-won ingest matches accounts by its output.
 */
/** "QA Test - ", "Test - ", "QA test: " at the front; "Test-Rite Products" is a name. */
const TEST_PREFIX = /^(?:qa\s*)?test(?:\s+[-–—]|\s*:)\s*/i;
/** "(ATG)", "(QA)" at the end. */
const TRAILING_PAREN = /\s*\([^()]*\)\s*$/;
/** " - SEP '26", "- Sep 2026", "– Sept. ’26" at the end: the close period. */
const PERIOD_SUFFIX =
  /\s*[-–—]\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s*['’]?\s*(?:\d{4}|\d{2})\s*$/i;

/** The name with the test prefix, a trailing parenthetical and the close period taken off. */
function withoutInternalMarkers(name: string): string {
  let s = name.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 6; i++) {
    const next = s
      .replace(TEST_PREFIX, "")
      .replace(PERIOD_SUFFIX, "")
      .replace(TRAILING_PAREN, "")
      .replace(/[\s\-–—,]+$/g, "")
      .trim();
    // A name that is nothing but markers keeps what it had: an empty cover
    // reads worse than an odd one, and the readiness check asks for a name.
    if (!next || next === s) break;
    s = next;
  }
  return s;
}

/** True when the name carries a marker that is ours, not the customer's. */
function hasInternalMarker(name: string): boolean {
  return TEST_PREFIX.test(name) || TRAILING_PAREN.test(name) || PERIOD_SUFFIX.test(name);
}

/**
 * The name a customer reads: what a person typed as the customer-facing
 * name when there is one, else the deal name cleaned. Every customer-facing
 * surface that starts from the deal goes through here.
 */
export function customerFacingName(a: {
  name: string | null | undefined;
  display_name?: string | null | undefined;
}): string {
  const typed = (a.display_name ?? "").replace(/\s+/g, " ").trim();
  return typed || displayName(a.name);
}

/**
 * Whether a deal name still reads like an opportunity — "SUNSOURCEHOLDINGS-DR
 * NL" — after cleaning: a channel marker survived, it carries one of our
 * markers (a test prefix, a trailing parenthetical, a close period), or it
 * is shouted in caps.
 * The welcome page asks for a customer-facing name when it does.
 */
export function looksInternal(name: string | null | undefined): boolean {
  const s = (name ?? "").trim();
  if (!s) return false;
  if (/\bNL\b/.test(s)) return true;
  if (/-\s*(DR|Direct|Partner|Channel|Reseller)\b/i.test(s)) return true;
  // A test prefix, a trailing "(ATG)" or a close period: the cover drops
  // them, but only a person can say what the customer is called.
  if (hasInternalMarker(s)) return true;
  const letters = s.replace(/[^A-Za-z]/g, "");
  return letters.length >= 6 && letters === letters.toUpperCase();
}

/** "Varley Group's", "Acme Services'": the possessive English actually uses. */
export function possessive(name: string): string {
  const n = name.trim();
  if (!n) return "";
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}
