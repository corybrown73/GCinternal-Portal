import {
  closedWonSchema,
  ingestClosedWon,
  resolveClosedWonRow,
  type ClosedWonDeps,
  type ClosedWonOutcome,
} from "./closed-won";
import { applyDealMaps, dealMapRoots, readPath, type FieldMap } from "./sf-field-maps";
import { sfId18 } from "./sf-id";

/**
 * The pull: on a schedule, ask Salesforce for the opportunities won since the
 * last look and run each one through the SAME ingest the closed-won webhook
 * runs — deal at Closed Won, facts, project, TIS. Nothing is built in
 * Salesforce; the Hub's Connected App key does the asking.
 *
 * Pure: the Salesforce query, the clock, the state store, the sync log and
 * the ingest's dependencies are all injected, so the decision is tested
 * without a network or a database.
 *
 * Two ideas carry the design:
 *
 *   1. The deal map IS the field list. An `inbound_deal` row's source path
 *      (`TIS_Assigned__r.Email`, `Account.Industry`) is a SOQL field path, and
 *      SOQL returns it nested exactly as `readPath` reads it. So the SELECT is
 *      the fixed core plus every mapped path, and an admin who maps a custom
 *      field has also told the poll to fetch it.
 *
 *   2. The watermark only passes what succeeded. Records are processed in
 *      SystemModstamp order; a record that fails is logged and retried on the
 *      next run, and the watermark stops just before it, so a transient error
 *      never loses a deal. A re-polled, re-modified won opportunity re-runs
 *      the idempotent ingest (facts refresh, no second project).
 */

/** Always fetched: what the built-in defaults and the match key need. */
export const CORE_FIELDS = [
  "Id",
  "Name",
  "StageName",
  "IsWon",
  "CloseDate",
  "SystemModstamp",
  "Amount",
  "Description",
  "AccountId",
  "Account.Id",
  "Account.Name",
  "Account.Website",
  "Account.Industry",
  "Owner.Email",
] as const;

/**
 * What a record means when the map does not say: the canonical deal field
 * each core path fills. A map row for the same target wins (resolve puts
 * mapped values last, over these).
 */
export const DEFAULT_DEAL_PATHS: ReadonlyArray<{ field: string; path: string }> = [
  { field: "company", path: "Account.Name" },
  { field: "salesforce_id", path: "Account.Id" },
  { field: "opportunity", path: "Name" },
  { field: "amount", path: "Amount" },
  { field: "close_date", path: "CloseDate" },
  { field: "notes", path: "Description" },
  { field: "domain", path: "Account.Website" },
  { field: "industry", path: "Account.Industry" },
  { field: "rep_email", path: "Owner.Email" },
];

const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*){0,2}$/;

export function isSoqlFieldPath(p: string): boolean {
  return FIELD_PATH.test(p);
}

/** The mapped source paths worth asking Salesforce for. */
export function mappedFieldPaths(maps: FieldMap[]): string[] {
  const out: string[] = [];
  for (const m of maps) {
    if (!m.active || m.direction !== "inbound_deal") continue;
    const p = m.source_path.trim();
    if (isSoqlFieldPath(p) && !out.includes(p)) out.push(p);
  }
  return out;
}

/* ------------------------------------------------------------ the rule */

/**
 * Which won opportunities are ours. Without a rule the pull refuses to run:
 * "every Closed Won in the org" is never what an implementation team wants.
 *
 * A rule is groups OR'd together; a group is conditions AND'd. A condition is
 * a field test on the Opportunity (Type is one of…, Owner.UserRole.Name
 * contains…, Amount at least…) or a products test on its line items (any
 * product named / in a family among…). The matched group may also say which
 * onboarding type the deal is, so New logo and Existing run the right
 * checklist without a map row.
 *
 * Everything becomes SOQL by construction: field paths are validated, values
 * are quoted and escaped, operators come from a fixed menu. No admin text
 * reaches the query unescaped.
 */
export {
  DEFAULT_INCLUDE_RULE,
  FIELD_OP_LABEL,
  type FieldCondition,
  type FieldOp,
  type IncludeCondition,
  type IncludeGroup,
  type IncludeRule,
  type ProductsCondition,
} from "../salesforce-rule";
import {
  DEFAULT_INCLUDE_RULE,
  FIELD_OP_LABEL,
  type IncludeCondition,
  type IncludeGroup,
  type IncludeRule,
} from "../salesforce-rule";

export class NoIncludeRuleError extends Error {
  constructor() {
    super(
      "No include rule is set. The pull refuses to import every Closed Won opportunity in the org; add at least one rule group on the Salesforce tab.",
    );
    this.name = "NoIncludeRuleError";
  }
}

function soqlString(v: string): string {
  return `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function soqlNumber(v: string): string {
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`"${v}" is not a number.`);
  return String(n);
}

export function conditionToSoql(c: IncludeCondition): string {
  if (c.kind === "products") {
    const vals = c.values.map((v) => v.trim()).filter(Boolean);
    if (vals.length === 0) throw new Error("A products condition needs at least one product.");
    const col = c.by === "family" ? "Product2.Family" : "Product2.Name";
    return `Id IN (SELECT OpportunityId FROM OpportunityLineItem WHERE ${col} IN (${vals.map(soqlString).join(", ")}))`;
  }
  if (!isSoqlFieldPath(c.field)) throw new Error(`"${c.field}" is not a Salesforce field path.`);
  const vals = c.values.map((v) => v.trim()).filter(Boolean);
  const one = () => {
    if (vals.length === 0) throw new Error(`"${c.field} ${FIELD_OP_LABEL[c.op]}" needs a value.`);
    return vals[0]!;
  };
  switch (c.op) {
    case "eq":
      return `${c.field} = ${soqlString(one())}`;
    case "ne":
      return `${c.field} != ${soqlString(one())}`;
    case "in":
      if (vals.length === 0) throw new Error(`"${c.field} is one of" needs a value.`);
      return `${c.field} IN (${vals.map(soqlString).join(", ")})`;
    case "not_in":
      if (vals.length === 0) throw new Error(`"${c.field} is none of" needs a value.`);
      return `${c.field} NOT IN (${vals.map(soqlString).join(", ")})`;
    case "contains":
      return `${c.field} LIKE ${soqlString(`%${one()}%`)}`;
    case "gte":
      return `${c.field} >= ${soqlNumber(one())}`;
    case "lte":
      return `${c.field} <= ${soqlNumber(one())}`;
    case "true":
      return `${c.field} = true`;
    case "false":
      return `${c.field} = false`;
  }
}

/** The WHERE fragment for a rule: `((g1c1 AND g1c2) OR (g2c1))`, or a refusal with no groups. */
export function ruleToSoql(rule: IncludeRule | null | undefined): string {
  const groups = (rule?.groups ?? []).filter((g) => g.conditions.length > 0);
  if (groups.length === 0) throw new NoIncludeRuleError();
  return `(${groups.map((g) => `(${g.conditions.map(conditionToSoql).join(" AND ")})`).join(" OR ")})`;
}

/** The fields a rule reads, so the SELECT carries them and matching can be re-checked on the record. */
export function ruleFieldPaths(rule: IncludeRule | null | undefined): string[] {
  const out: string[] = [];
  for (const g of rule?.groups ?? []) {
    for (const c of g.conditions) {
      if (c.kind === "field" && isSoqlFieldPath(c.field) && !out.includes(c.field))
        out.push(c.field);
    }
  }
  return out;
}

/** The product names and families on a fetched record. */
export function recordProducts(record: Record<string, unknown>): {
  names: string[];
  families: string[];
} {
  const li = record["OpportunityLineItems"] as { records?: unknown[] } | unknown[] | undefined;
  const rows = Array.isArray(li) ? li : Array.isArray(li?.records) ? li.records : [];
  const names: string[] = [];
  const families: string[] = [];
  for (const r of rows) {
    const p = (r as { Product2?: { Name?: unknown; Family?: unknown } }).Product2;
    if (typeof p?.Name === "string" && p.Name.trim()) names.push(p.Name.trim());
    if (typeof p?.Family === "string" && p.Family.trim()) families.push(p.Family.trim());
  }
  return { names, families };
}

const lower = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase();

/** Does a fetched record satisfy a condition? The same test SOQL applied, re-run locally. */
export function conditionMatches(record: Record<string, unknown>, c: IncludeCondition): boolean {
  if (c.kind === "products") {
    const have = recordProducts(record);
    const pool = (c.by === "family" ? have.families : have.names).map(lower);
    return c.values.some((v) => pool.includes(lower(v)));
  }
  const raw = readPath(record, c.field);
  const vals = c.values.map(lower);
  switch (c.op) {
    case "eq":
      return lower(raw) === vals[0];
    case "ne":
      return lower(raw) !== vals[0];
    case "in":
      return vals.includes(lower(raw));
    case "not_in":
      return !vals.includes(lower(raw));
    case "contains":
      return vals[0] !== undefined && lower(raw).includes(vals[0]);
    case "gte":
      return Number(raw) >= Number(c.values[0]);
    case "lte":
      return Number(raw) <= Number(c.values[0]);
    case "true":
      return raw === true;
    case "false":
      return raw === false || raw === null || raw === undefined;
  }
}

/** The first rule group a record satisfies, or null. */
export function matchedGroup(
  record: Record<string, unknown>,
  rule: IncludeRule | null | undefined,
): IncludeGroup | null {
  for (const g of rule?.groups ?? []) {
    if (g.conditions.length > 0 && g.conditions.every((c) => conditionMatches(record, c))) return g;
  }
  return null;
}

/** The line items ride along as a subquery, so products reach the deal and the rule can be re-checked. */
export const LINE_ITEMS_SUBQUERY =
  "(SELECT Product2.Name, Product2.Family, Quantity, TotalPrice FROM OpportunityLineItems)";

export function buildSoql(
  maps: FieldMap[],
  sinceIso: string,
  limit = 200,
  rule: IncludeRule | null | undefined = DEFAULT_INCLUDE_RULE,
): string {
  const fields = [...CORE_FIELDS] as string[];
  for (const p of mappedFieldPaths(maps)) if (!fields.includes(p)) fields.push(p);
  for (const p of ruleFieldPaths(rule)) if (!fields.includes(p)) fields.push(p);
  fields.push(LINE_ITEMS_SUBQUERY);
  const where = ruleToSoql(rule);
  // SOQL datetime literals carry no quotes.
  const since = new Date(sinceIso).toISOString().replace(/\.\d{3}Z$/, "Z");
  return (
    `SELECT ${fields.join(", ")} FROM Opportunity ` +
    `WHERE IsWon = true AND SystemModstamp > ${since} AND ${where} ` +
    `ORDER BY SystemModstamp ASC LIMIT ${Math.max(1, Math.min(limit, 2000))}`
  );
}

export type SalesforceOpportunity = Record<string, unknown> & {
  Id: string;
  SystemModstamp: string;
};

/**
 * One Salesforce record → the row the closed-won schema reads: the map first,
 * the aliases (which, on a raw record, catch `Name`, `Amount`, `Description`…
 * only where their English names happen to match), then the defaults for
 * whatever is still empty.
 */
export function recordToRow(
  record: SalesforceOpportunity,
  maps: FieldMap[],
  rule: IncludeRule | null | undefined = null,
) {
  const mapped = applyDealMaps(record, maps);
  // The defaults sit under the map and over the aliases: on a raw Salesforce
  // record the English aliases are only half right (`Name` is the opportunity,
  // not the company; `Type` is the opportunity type), so the known paths speak
  // before they do.
  const defaults: Record<string, unknown> = {};
  const defaultPath: Record<string, string> = {};
  for (const d of DEFAULT_DEAL_PATHS) {
    if (d.field in mapped.values) continue;
    const v = readPath(record, d.path);
    if (v === undefined || v === null || v === "") continue;
    defaults[d.field] = v;
    defaultPath[d.field] = d.path;
  }
  const resolved = resolveClosedWonRow(
    record,
    { ...defaults, ...mapped.values },
    dealMapRoots(maps),
  );
  // The company comes from the map or from Account.Name, never from an
  // alias: on a raw record the alias layer would read the opportunity's own
  // `Name` as the company, and "Acme — Forms 2026" is not an account.
  const row = { ...resolved.row };
  const resolvedSources = { ...resolved.sources };
  if (resolvedSources["company"] === "alias") {
    delete row["company"];
    delete resolvedSources["company"];
  }
  // Likewise the onboarding type: the alias layer reads Opportunity `Type`
  // ("Existing Business") as it; the rule group that admitted the record is
  // the one that knows, and a map row beats both.
  if (resolvedSources["path"] === "alias") {
    delete row["path"];
    delete resolvedSources["path"];
  }
  // The line items are the products, unless the map said otherwise.
  const products = recordProducts(record).names;
  if (
    !(row["products"] !== undefined && row["products"] !== null && row["products"] !== "") &&
    products.length > 0
  ) {
    row["products"] = products;
    resolvedSources["products"] = "map";
    defaultPath["products"] = "OpportunityLineItems";
  }
  // The group that let the record in says what kind of deal it is.
  const group = matchedGroup(record, rule);
  if (group?.path && (row["path"] === undefined || row["path"] === null || row["path"] === "")) {
    row["path"] = group.path;
    resolvedSources["path"] = "map";
    defaultPath["path"] = `rule:${group.label}`;
  }
  const sources: Record<string, string> = {};
  for (const [k, how] of Object.entries(resolvedSources)) {
    sources[k] =
      how === "alias"
        ? "alias"
        : k in mapped.values
          ? `map:${mapped.sources[k]}`
          : `default:${defaultPath[k]}`;
  }
  // The line-item subquery is consumed, not "unmapped".
  const unmappedKeys = resolved.unmappedKeys.filter((k) => k !== "OpportunityLineItems");
  return {
    row,
    sources,
    unmappedKeys,
    missingRequired: mapped.missingRequired,
    group: group?.label ?? null,
  };
}

export type PullState = {
  /** ISO datetime: records modified after this are fetched. */
  watermark: string;
  /** Which won opportunities are ours. Null = not set = the pull refuses to run. */
  include: IncludeRule | null;
  last_run_at: string | null;
  last_result: PullSummary | null;
  last_error: string | null;
  batch_limit: number;
};

export type PullSummary = {
  found: number;
  created: number;
  updated: number;
  failed: number;
  /** The watermark after this run. */
  watermark: string;
  /** Per record, for the admin's eyes. */
  records: Array<{
    id: string;
    name: string;
    status: "created" | "updated" | "failed";
    note: string | null;
    group: string | null;
  }>;
};

export function defaultPullState(now: Date): PullState {
  return {
    watermark: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    include: DEFAULT_INCLUDE_RULE,
    last_run_at: null,
    last_result: null,
    last_error: null,
    batch_limit: 200,
  };
}

export type PullDeps = {
  now: () => Date;
  loadMaps: () => Promise<FieldMap[]>;
  loadState: () => Promise<PullState>;
  saveState: (s: PullState) => Promise<void>;
  query: (soql: string) => Promise<SalesforceOpportunity[]>;
  ingestDeps: ClosedWonDeps;
  log: (entry: {
    external_id: string;
    request_payload: unknown;
    decision: Record<string, unknown>;
    status: "succeeded" | "replayed" | "failed";
    error: string | null;
  }) => Promise<void>;
};

export async function runPoll(deps: PullDeps): Promise<PullSummary> {
  const started = deps.now();
  const [maps, state] = await Promise.all([deps.loadMaps(), deps.loadState()]);
  const soql = buildSoql(maps, state.watermark, state.batch_limit, state.include);

  let records: SalesforceOpportunity[];
  try {
    records = await deps.query(soql);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await deps.saveState({ ...state, last_run_at: started.toISOString(), last_error: message });
    throw e;
  }

  const summary: PullSummary = {
    found: records.length,
    created: 0,
    updated: 0,
    failed: 0,
    watermark: state.watermark,
    records: [],
  };

  for (const record of records) {
    const id = sfId18(String(record.Id)) ?? String(record.Id);
    const name = typeof record["Name"] === "string" ? record["Name"] : id;
    const { row, sources, unmappedKeys, missingRequired, group } = recordToRow(
      record,
      maps,
      state.include,
    );
    try {
      if (missingRequired.length > 0) {
        throw new Error(
          `Required mapped field(s) missing on the record: ${missingRequired.join(", ")}`,
        );
      }
      const parsed = closedWonSchema.safeParse(row);
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
      }
      // The ingest files the notes without knowing the opportunity; the
      // poll does, so the row is kept per opportunity.
      const storeNotes = deps.ingestDeps.storeNotes;
      const ingestDeps: ClosedWonDeps = storeNotes
        ? {
            ...deps.ingestDeps,
            storeNotes: (dealId, notes) => storeNotes(dealId, notes, { opportunityId: id }),
          }
        : deps.ingestDeps;
      const outcome: ClosedWonOutcome = await ingestClosedWon(parsed.data, ingestDeps);
      const status = outcome.kicked_off ? "succeeded" : "replayed";
      await deps.log({
        external_id: id,
        request_payload: record,
        decision: { ...outcome, fields: { set: sources, unmapped_keys: unmappedKeys } },
        status,
        error: null,
      });
      if (outcome.kicked_off) summary.created += 1;
      else summary.updated += 1;
      summary.records.push({
        id,
        name,
        status: outcome.kicked_off ? "created" : "updated",
        note: outcome.note,
        group,
      });
      // Only a processed record moves the watermark. A failure below stops it
      // here, so the failed record is fetched again next run.
      if (record.SystemModstamp > summary.watermark) summary.watermark = record.SystemModstamp;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.failed += 1;
      summary.records.push({ id, name, status: "failed", note: message, group });
      await deps.log({
        external_id: id,
        request_payload: record,
        decision: { fields: { set: sources, unmapped_keys: unmappedKeys } },
        status: "failed",
        error: message,
      });
      break;
    }
  }

  await deps.saveState({
    ...state,
    watermark: summary.watermark,
    last_run_at: started.toISOString(),
    last_result: summary,
    last_error:
      summary.failed > 0
        ? (summary.records.find((r) => r.status === "failed")?.note ?? "a record failed")
        : null,
  });
  return summary;
}
