/**
 * The three core meetings, the way a customer hears them.
 *
 * Internally the playbook calls them "Make It Work", "Make It Work for
 * Them" and "Make It Operational" — our methodology, and the checklist
 * keeps those words. A customer is not being taught our methodology; they
 * hear what each meeting does for them: get it working, make it yours,
 * make it run. One transform, applied at every customer-facing render —
 * the email, the welcome page, the invites, the deck — so the internal
 * names never leak and the two vocabularies never drift apart.
 */
const CUSTOMER_WORDS: ReadonlyArray<[RegExp, string]> = [
  [/Make It Work for Them/gi, "Make it yours"],
  [/Make It Operational/gi, "Make it run"],
  [/Make It Work/gi, "Get it working"],
];

export function customerLabel(label: string): string {
  let out = label;
  for (const [re, word] of CUSTOMER_WORDS) out = out.replace(re, word);
  return out;
}

/** "Stage 1 — Get it working" → "get it working", for a sentence. */
export function customerLabelLower(label: string): string {
  const l = customerLabel(label);
  const m = l.match(/^(Stage|Session|Training day)\s+\d+\s*[—–-]\s*(.+)$/);
  return (m ? m[2]! : l).replace(/^./, (c) => c.toLowerCase());
}
