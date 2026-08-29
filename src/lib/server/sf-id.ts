/**
 * Salesforce id normalization.
 *
 * Salesforce hands out the same record id in two shapes: a 15-character
 * case-SENSITIVE id (what you see in the UI and what most CSV exports carry)
 * and an 18-character case-INSENSITIVE id (what the API returns). The last
 * three characters of the 18-char form are a checksum of the case pattern of
 * the first fifteen, so the conversion is deterministic and lossless in one
 * direction only: 15 → 18.
 *
 * Every identity comparison in this codebase is a plain string equality, so a
 * row stored as `0016g00000ABCDE` never matches an inbound `0016g00000ABCDEAA5`
 * and the idempotency this whole integration rests on quietly stops working.
 * Normalizing at every entry point is what makes the key a key.
 *
 * The SQL twin of this function is `sf_id_18(text)` in migration 0023;
 * `src/lib/__tests__/sf-id.test.ts` pins the algorithm they share.
 */

const SUFFIX_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

/**
 * Normalize a Salesforce id to its 18-character form.
 *
 * Returns the input unchanged when it is already 18 characters or is not a
 * well-formed 15-character id, and null for null/blank input — this function
 * never invents an identity it cannot derive, and never throws on the request
 * path.
 */
export function sfId18(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const id = raw.trim();
  if (id === "") return null;
  if (id.length !== 15) return id;
  if (!/^[a-zA-Z0-9]{15}$/.test(id)) return id;

  let suffix = "";
  for (let chunk = 0; chunk < 3; chunk += 1) {
    let bits = 0;
    for (let i = 0; i < 5; i += 1) {
      const c = id.charAt(chunk * 5 + i);
      if (c >= "A" && c <= "Z") bits += 1 << i;
    }
    suffix += SUFFIX_ALPHABET.charAt(bits);
  }
  return id + suffix;
}

/** True when the value looks like a Salesforce id we can key on. */
export function isSfId(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const id = raw.trim();
  return /^[a-zA-Z0-9]{15}$/.test(id) || /^[a-zA-Z0-9]{18}$/.test(id);
}
