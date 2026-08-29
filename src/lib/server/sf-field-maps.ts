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

export type FieldMapDirection = "inbound" | "outbound";
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
