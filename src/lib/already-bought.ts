/**
 * Library cards the customer has already bought or already named, so the
 * talk track does not offer them back as "do you want these on your account?".
 *
 * A card is theirs already when it shares a distinctive word with a purchased
 * service or a form they named ("Backflow Test Report" against the SOW's
 * "Backflow PDF"), or when every word it has is in one of those names ("Work
 * Order" inside "Service Work Order", whose extra word is generic too). Generic
 * words ("form", "report", "inspection", "customer", "equipment") never match
 * on their own: every card has them, so "Inspection Report" is not the
 * customer's "Backflow Inspection Report".
 */

const GENERIC = new Set([
  "form",
  "forms",
  "report",
  "reports",
  "checklist",
  "checklists",
  "inspection",
  "inspections",
  "ticket",
  "tickets",
  "sheet",
  "sheets",
  "order",
  "orders",
  "work",
  "service",
  "services",
  "daily",
  "weekly",
  "monthly",
  "record",
  "records",
  "request",
  "requests",
  "custom",
  "test",
  "tests",
  "testing",
  "online",
  "integration",
  "training",
  "admin",
  "field",
  "with",
  "from",
  "and",
  "the",
  "for",
  "pdf",
  "log",
  "logs",
  // Common across field-service forms: one of these shared is not the same form.
  "customer",
  "customers",
  "client",
  "equipment",
  "safety",
  "site",
  "job",
  "jobs",
  "vehicle",
  "vehicles",
  "maintenance",
  "preventive",
  "analysis",
  "survey",
  "surveys",
  "agreement",
  "agreements",
  "signature",
  "time",
]);

function words(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
}

function distinctive(name: string): string[] {
  return words(name).filter((w) => w.length >= 4 && !GENERIC.has(w));
}

/** True when the card is one of the things in `owned` under another name. */
export function alreadyOwned(card: string, owned: ReadonlyArray<string>): boolean {
  const cardWords = words(card);
  if (!cardWords.length) return false;
  const cardDistinct = new Set(distinctive(card));
  return owned.some((name) => {
    const ownWords = new Set(words(name));
    if (!ownWords.size) return false;
    if (card.trim().toLowerCase() === name.trim().toLowerCase()) return true;
    const ownDistinct = distinctive(name);
    if (ownDistinct.some((w) => cardDistinct.has(w))) return true;
    // Every word of the card inside the owned name counts only when the owned
    // name adds nothing distinctive: "Work Order" is "Service Work Order", but
    // "Inspection Report" is not "Backflow Inspection Report".
    return ownDistinct.length === 0 && cardWords.every((w) => ownWords.has(w));
  });
}

/**
 * The "what comes next" cards, without what is already theirs. While a SOW
 * is attached but not read yet, the industry shelf is left out entirely:
 * nobody knows yet what was bought, and offering a form the SOW already
 * pays for is the mistake this exists to stop.
 */
export function nextCardsNotOwned<T extends { name: string }>(args: {
  chosen: ReadonlyArray<T>;
  shelf: ReadonlyArray<T>;
  /** Purchased services (intake.timeline.services) and the forms they named. */
  owned: ReadonlyArray<string>;
  sowUnread: boolean;
}): { chosen: T[]; shelf: T[] } {
  const keep = (t: T) => !alreadyOwned(t.name, args.owned);
  return {
    chosen: args.chosen.filter(keep),
    shelf: args.sowUnread ? [] : args.shelf.filter(keep),
  };
}

/** A SOW is on the deal and nothing has been read from it yet. */
export function sowAttachedButUnread(args: {
  sowAttached: boolean;
  sowAppliedAt: string | null | undefined;
  services: ReadonlyArray<unknown> | null | undefined;
}): boolean {
  return args.sowAttached && !args.sowAppliedAt && !(args.services ?? []).length;
}

/**
 * The Review step's "From the SOW" line. An attached SOW nobody has read
 * yet is not "core only": nothing is known about what it bought.
 */
export function fromTheSowLine(args: {
  services: ReadonlyArray<{ name: string; phase: number }>;
  sowAttached: boolean;
  sowAppliedAt: string | null | undefined;
}): string {
  if (args.services.length) {
    return args.services.map((sv) => `${sv.name} (phase ${sv.phase})`).join(" · ");
  }
  if (!args.sowAttached) return "No SOW";
  return args.sowAppliedAt ? "Core only — no services" : "SOW not read yet";
}
