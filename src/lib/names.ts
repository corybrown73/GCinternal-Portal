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
  return companyNameFrom(bare) || bare;
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
 * NL" — after cleaning: a channel marker survived, or it is shouted in caps.
 * The welcome page asks for a customer-facing name when it does.
 */
export function looksInternal(name: string | null | undefined): boolean {
  const s = (name ?? "").trim();
  if (!s) return false;
  if (/\bNL\b/.test(s)) return true;
  if (/-\s*(DR|Direct|Partner|Channel|Reseller)\b/i.test(s)) return true;
  const letters = s.replace(/[^A-Za-z]/g, "");
  return letters.length >= 6 && letters === letters.toUpperCase();
}

/** "Varley Group's", "Acme Services'": the possessive English actually uses. */
export function possessive(name: string): string {
  const n = name.trim();
  if (!n) return "";
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}
