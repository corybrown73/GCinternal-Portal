/**
 * Inbound/outbound field mapping for the Salesforce integration.
 *
 * Pure functions over `integration_field_maps` rows (0023). Two rules shape
 * everything here:
 *
 * 1. **Transforms are a fixed menu, never expressions.** A mapping row names
 *    one of `TRANSFORMS`; there is no eval, no template string, no code path
 *    from an admin text box to the interpreter.
 * 2. **A blank a human left IS recorded state.** Replaying a payload therefore
 *    computes a *drift report* by default and writes nothing. A field can only
 *    be filled on replay when its mapping row is explicitly set to
 *    `fill_policy = 'if_blank'`, and every such fill is reported back to the
 *    caller so it can be audited and journalled where a person will see it.
 */

/**
 * `inbound`: Salesforce opportunity → project columns (/api/v1/implementations).
 * `outbound`: hub field → Salesforce API name (write-back events).
 * `inbound_deal`: any sender's field → the deal /api/v1/closed-won creates;
 * targets are the keys in ../deal-field-catalog.ts.
 */
export type FieldMapDirection = "inbound" | "outbound" | "inbound_deal";
export const FIELD_MAP_DIRECTIONS = ["inbound", "outbound", "inbound_deal"] as const;
export type FillPolicy = "never" | "if_blank";

export type FieldMap = {
  id?: string;
  direction: FieldMapDirection;
  /** inbound: dotted path into the payload; outbound: hub field key. */
  source_path: string;
  /** inbound: hub column; outbound: Salesforce API name. */
  target_field: string;
  transform: string | null;
  fill_policy: FillPolicy;
  required: boolean;
  active: boolean;
};

export const TRANSFORMS = ["none", "date", "number", "stage_label", "lowercase"] as const;
export type TransformName = (typeof TRANSFORMS)[number];

export function isTransform(v: unknown): v is TransformName {
  return typeof v === "string" && (TRANSFORMS as readonly string[]).includes(v);
}

/** Read a dotted path out of a payload. Numeric segments index arrays. */
export function readPath(source: unknown, path: string): unknown {
  let cur: unknown = source;
  for (const seg of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Apply one of the fixed transforms. Anything unconvertible returns null. */
export function applyTransform(value: unknown, transform: string | null): unknown {
  if (value === undefined || value === null) return null;
  switch (transform) {
    case "date": {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    case "number": {
      const n = typeof value === "number" ? value : Number(String(value).replace(/[$,]/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    case "stage_label":
      return String(value)
        .split(/[-_]/)
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(" ");
    case "lowercase":
      return String(value).toLowerCase();
    case "none":
    case null:
    case undefined:
    default:
      return value;
  }
}

export type MappedInbound = {
  /** target column → transformed value (nulls included; the caller decides). */
  values: Record<string, unknown>;
  /** Required mappings whose source path was absent in the payload. */
  missingRequired: string[];
};

/** Apply the inbound override layer. Never a prerequisite: no rows = no changes. */
export function applyInboundMaps(payload: unknown, maps: FieldMap[]): MappedInbound {
  const values: Record<string, unknown> = {};
  const missingRequired: string[] = [];
  for (const m of maps) {
    if (!m.active || m.direction !== "inbound") continue;
    const raw = readPath(payload, m.source_path);
    if (raw === undefined || raw === null) {
      if (m.required) missingRequired.push(m.source_path);
      continue;
    }
    values[m.target_field] = applyTransform(raw, m.transform);
  }
  return { values, missingRequired };
}

export type MappedDeal = {
  /** canonical deal field → transformed value. Blank sources are skipped. */
  values: Record<string, unknown>;
  /** canonical deal field → the source path that supplied it. */
  sources: Record<string, string>;
  /** Required mappings whose source path was absent in the payload. */
  missingRequired: string[];
};

/**
 * The deal-side map: `inbound_deal` rows over the raw body the closed-won
 * endpoint received. The result is keyed by canonical deal field, so the
 * endpoint lays it over its alias matching — a mapped field always wins over
 * a guessed one. Dotted paths read into nested records, so a Salesforce Flow
 * can post the whole Opportunity and an admin maps `Account.Name` or
 * `TIS_Assigned__r.Email` without anyone flattening it first.
 */
export function applyDealMaps(payload: unknown, maps: FieldMap[]): MappedDeal {
  const values: Record<string, unknown> = {};
  const sources: Record<string, string> = {};
  const missingRequired: string[] = [];
  for (const m of maps) {
    if (!m.active || m.direction !== "inbound_deal") continue;
    const raw = readPath(payload, m.source_path);
    if (raw === undefined || raw === null || raw === "") {
      if (m.required) missingRequired.push(m.source_path);
      continue;
    }
    const v = applyTransform(raw, m.transform);
    if (v === null || v === undefined || v === "") continue;
    // First active row for a target wins; the admin page keeps the order.
    if (m.target_field in values) continue;
    values[m.target_field] = v;
    sources[m.target_field] = m.source_path;
  }
  return { values, sources, missingRequired };
}

/** The top-level payload keys an `inbound_deal` map reads from. */
export function dealMapRoots(maps: FieldMap[]): Set<string> {
  const roots = new Set<string>();
  for (const m of maps) {
    if (!m.active || m.direction !== "inbound_deal") continue;
    roots.add(m.source_path.split(".")[0]!);
  }
  return roots;
}

export type DriftEntry = {
  field: string;
  payload_value: unknown;
  hub_value: unknown;
  /** What we did about it. 'none' is the default and the safe answer. */
  action: "none" | "filled";
  fill_policy: FillPolicy;
};

export type DriftReport = {
  entries: DriftEntry[];
  /** Only the fields an explicit `if_blank` policy allowed us to write. */
  fills: Record<string, unknown>;
};

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

/**
 * Compare a mapped payload against the row that already exists.
 *
 * The default answer for every differing field is `action: 'none'` — replay is
 * read-only. A field is filled only when its mapping row says `if_blank` AND
 * the hub value is genuinely blank.
 */
export function driftReport(
  mapped: Record<string, unknown>,
  existing: Record<string, unknown>,
  maps: FieldMap[],
): DriftReport {
  const policyFor = new Map<string, FillPolicy>();
  for (const m of maps) {
    if (m.direction === "inbound" && m.active) policyFor.set(m.target_field, m.fill_policy);
  }

  const entries: DriftEntry[] = [];
  const fills: Record<string, unknown> = {};

  for (const [field, payloadValue] of Object.entries(mapped)) {
    const hubValue = existing[field] ?? null;
    if (sameValue(payloadValue, hubValue)) continue;
    const policy = policyFor.get(field) ?? "never";
    const blank = hubValue === null || hubValue === undefined || hubValue === "";
    const fill = policy === "if_blank" && blank && payloadValue !== null;
    if (fill) fills[field] = payloadValue;
    entries.push({
      field,
      payload_value: payloadValue,
      hub_value: hubValue,
      action: fill ? "filled" : "none",
      fill_policy: policy,
    });
  }

  return { entries, fills };
}

/** Build the Salesforce-shaped body for a write-back event. */
export function outboundFields(
  hubValues: Record<string, unknown>,
  maps: FieldMap[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of maps) {
    if (!m.active || m.direction !== "outbound") continue;
    const raw = hubValues[m.source_path];
    if (raw === undefined) continue;
    out[m.target_field] = applyTransform(raw, m.transform);
  }
  return out;
}
