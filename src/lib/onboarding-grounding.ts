import { isServiceName } from "./intake-answers";
import type { BriefJson } from "./server/schemas";

export type OnboardingReading = NonNullable<BriefJson["onboarding"]>;

/** Lower-case, one space, no quotes or dashes: the words, not the typing. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/[–—-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Is this quote really in what it says it came from? A SOW quote cannot be
 * checked here (the PDF is read by the model, not by us) and is trusted to
 * the verifier; a quote from the calls must be in the calls, word for word
 * give or take punctuation.
 */
export function quoteHolds(quote: string, source: string, callsText: string): boolean {
  const q = norm(quote);
  if (q.length < 4) return false;
  if (/^sow\b|statement of work/i.test(source.trim())) return true;
  return norm(callsText).includes(q);
}

/**
 * The rules, applied to whatever the model returned. Pure, so the same rule
 * holds on the first reading, on the verifier's correction, and in the tests:
 *
 *   - a service is never a form (the SOW plans it, with its own steps);
 *   - a fact from the calls has to be in the calls;
 *   - the same form twice is one form;
 *   - a flow nobody can quote is not a flow.
 */
export function groundOnboarding(
  reading: OnboardingReading | null | undefined,
  callsText: string,
): OnboardingReading | null {
  if (!reading) return null;
  const seen = new Set<string>();
  const forms = reading.forms
    .map((f) => ({ ...f, name: f.name.replace(/\s+[–—-]\s+.*$/, "").trim() }))
    .filter((f) => {
      const key = norm(f.name);
      if (!key || seen.has(key) || isServiceName(f.name)) return false;
      if (!quoteHolds(f.quote, f.source, callsText)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
  const flowHolds =
    reading.flow !== null &&
    reading.flow_evidence !== null &&
    quoteHolds(reading.flow_evidence.quote, reading.flow_evidence.source, callsText);
  const process = reading.current_process;
  return {
    flow: flowHolds ? reading.flow : null,
    flow_evidence: flowHolds ? reading.flow_evidence : null,
    training_only: reading.training_only,
    solutions_involved: reading.solutions_involved,
    forms,
    current_process:
      process && process.summary.trim()
        ? quoteHolds(process.quote, process.source, callsText)
          ? process
          : { summary: process.summary.trim(), quote: "", source: "" }
        : null,
  };
}
