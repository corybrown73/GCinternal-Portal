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

/** "Varley Group's", "Acme Services'": the possessive English actually uses. */
export function possessive(name: string): string {
  const n = name.trim();
  if (!n) return "";
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}
