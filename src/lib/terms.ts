/**
 * The words this company uses, spelled the way it spells them.
 *
 * THE BUG THIS FIXES. `humanize()` turned an enum key into prose by swapping
 * underscores for spaces and capitalising the first letter. That works for
 * "in_progress" and fails for every acronym in the business: "tam_se" came out
 * as "Tam se", "am" as "Am", "sla" as "Sla". Screens showing a job title read
 * as though nobody had proofread them, and "Tam se" is not a role anyone in the
 * company would recognise as theirs.
 *
 * Two layers, in order:
 *
 *  1. an exact-match dictionary, for terms whose written form is not derivable
 *     from the key at all ("tam_se" → "TAM / SE");
 *  2. a token pass that uppercases known acronyms wherever they appear, so a
 *     compound the dictionary has never seen ("sla_breach") still comes out
 *     "SLA breach" rather than "Sla breach".
 *
 * Anything neither layer knows falls through to the old behaviour, which is the
 * right default: a new enum value should read a bit plainly, not wrongly.
 *
 * Pure — no imports — because it is used on both sides of the wire and by
 * modules that must not pull in the browser client.
 */

/** Written the way the business writes them, not the way the column stores them. */
export const TERM_LABELS = {
  // Portal roles — what a login can do.
  admin: "Super admin",
  super_admin: "Super admin",
  manager: "Manager",
  sales: "Sales",
  implementation: "Implementation",
  tam_se: "TAM / SE",
  onboarding: "Implementation",
  customer: "Customer",

  // Team directory roles — what a person is called.
  tis: "TIS",
  ae: "AE",
  am: "AM",
  se: "SE",
  tam: "TAM",

  // Elsewhere in the app.
  sla: "SLA",
  arr: "ARR",
  sow: "SOW",
  api: "API",
  csv: "CSV",
  cs: "CS",
  qa: "QA",
  poc: "POC",
  crm: "CRM",
  ui: "UI",
  na: "N/A",
} as const satisfies Record<string, string>;

/**
 * Tokens that are always upper-case when they stand alone in a phrase.
 *
 * Deliberately shorter than TERM_LABELS: a token here is uppercased wherever it
 * appears, so anything ambiguous in ordinary English belongs in the dictionary
 * above instead. "am" is the clearest example — an Account Manager in a role
 * column, the verb in a sentence anywhere else.
 */
const ACRONYM_TOKENS = new Set([
  "sla",
  "arr",
  "sow",
  "api",
  "csv",
  "cs",
  "qa",
  "poc",
  "crm",
  "ui",
  "tis",
  "tam",
  "se",
  "ae",
  "id",
  "url",
]);

/**
 * An enum key as a person would write it.
 *
 * Returns null when neither layer has an opinion, so the caller can apply its
 * own fallback rather than being handed a guess it cannot tell from a hit.
 */
export function termLabel(value: string): string | null {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!key) return null;

  const exact = (TERM_LABELS as Record<string, string>)[key];
  if (exact) return exact;

  const words = key.split("_").filter(Boolean);
  if (words.length === 0) return null;
  if (!words.some((w) => ACRONYM_TOKENS.has(w))) return null;

  return words
    .map((word, i) => {
      if (ACRONYM_TOKENS.has(word)) return word.toUpperCase();
      // Only the first word is capitalised: this is a label, not a title.
      return i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    })
    .join(" ");
}
