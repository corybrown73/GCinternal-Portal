/**
 * Demo mode: stable pseudonyms for customer-identifying fields.
 *
 * Applied at the SERVER PROJECTION, never in the browser. Client-side masking
 * ships the real names to the page and hides them with CSS, which is a demo
 * that leaks on view-source.
 *
 * The pseudonym is derived from the record's uuid, so the same account is the
 * same fake company on the list, on its own page and in search results,
 * without storing a mapping anywhere. ARR is bucketed rather than blanked: a
 * portfolio view with every number missing demonstrates nothing.
 *
 * Pure and synchronous — the flag lookup happens in the caller.
 */

const COMPANIES = [
  "Northwind Logistics",
  "Ironbark Utilities",
  "Halcyon Foods",
  "Meridian Rail",
  "Bluefield Energy",
  "Cascade Facilities",
  "Redstone Mining",
  "Larkspur Health",
  "Copperline Transit",
  "Windrow Agriculture",
  "Saltmarsh Marine",
  "Fernbrook Construction",
  "Kestrel Aviation",
  "Tallgrass Waste",
  "Bramblewick Retail",
  "Quarry Lane Cement",
];

const FIRST = [
  "Alex",
  "Bailey",
  "Casey",
  "Devon",
  "Ellis",
  "Frankie",
  "Gale",
  "Harper",
  "Indigo",
  "Jordan",
  "Kai",
  "Logan",
];

const LAST = [
  "Alvarez",
  "Brennan",
  "Chapman",
  "Dunn",
  "Ellery",
  "Fowler",
  "Grant",
  "Hollis",
  "Ivers",
  "Jarrow",
  "Keene",
  "Lomax",
];

/**
 * FNV-1a. Not a cryptographic hash and not trying to be — it only has to be
 * deterministic and well-spread across a dozen buckets.
 */
export function stableHash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function pick<T>(list: readonly T[], seed: string, salt: string): T {
  return list[stableHash(`${salt}:${seed}`) % list.length]!;
}

/** ARR buckets. Coarse enough to anonymise, real enough to sort by. */
export function bucketArr(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  if (value <= 0) return 0;
  const magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(value))));
  return Math.max(magnitude, Math.round(value / magnitude) * magnitude);
}

export type DemoMasker = {
  enabled: boolean;
  /** A customer / account / company name. */
  org(name: string | null | undefined, seed: string): string;
  /** A named human on the customer side. Internal staff are NOT masked. */
  person(name: string | null | undefined, seed: string): string;
  email(email: string | null | undefined, seed: string): string | null;
  arr(value: number | null | undefined): number | null;
};

const PASSTHROUGH: DemoMasker = {
  enabled: false,
  org: (name) => name ?? "",
  person: (name) => name ?? "",
  email: (email) => email ?? null,
  arr: (value) => (value == null ? null : value),
};

export function createMasker(enabled: boolean): DemoMasker {
  if (!enabled) return PASSTHROUGH;
  return {
    enabled: true,
    org: (_name, seed) => pick(COMPANIES, seed, "org"),
    person: (_name, seed) => `${pick(FIRST, seed, "first")} ${pick(LAST, seed, "last")}`,
    email: (email, seed) => {
      if (!email) return null;
      const person = `${pick(FIRST, seed, "first")}.${pick(LAST, seed, "last")}`.toLowerCase();
      return `${person}@example.com`;
    },
    arr: (value) => bucketArr(value),
  };
}
