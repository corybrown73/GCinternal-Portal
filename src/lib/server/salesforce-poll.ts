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

export function buildSoql(maps: FieldMap[], sinceIso: string, limit = 200): string {
  const fields = [...CORE_FIELDS] as string[];
  for (const p of mappedFieldPaths(maps)) if (!fields.includes(p)) fields.push(p);
  // SOQL datetime literals carry no quotes.
  const since = new Date(sinceIso).toISOString().replace(/\.\d{3}Z$/, "Z");
  return (
    `SELECT ${fields.join(", ")} FROM Opportunity ` +
    `WHERE IsWon = true AND SystemModstamp > ${since} ` +
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
export function recordToRow(record: SalesforceOpportunity, maps: FieldMap[]) {
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
  const sources: Record<string, string> = {};
  for (const [k, how] of Object.entries(resolvedSources)) {
    sources[k] =
      how === "alias"
        ? "alias"
        : k in mapped.values
          ? `map:${mapped.sources[k]}`
          : `default:${defaultPath[k]}`;
  }
  return {
    row,
    sources,
    unmappedKeys: resolved.unmappedKeys,
    missingRequired: mapped.missingRequired,
  };
}

export type PullState = {
  /** ISO datetime: records modified after this are fetched. */
  watermark: string;
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
  }>;
};

export function defaultPullState(now: Date): PullState {
  return {
    watermark: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
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
  const soql = buildSoql(maps, state.watermark, state.batch_limit);

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
    const { row, sources, unmappedKeys, missingRequired } = recordToRow(record, maps);
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
      const outcome: ClosedWonOutcome = await ingestClosedWon(parsed.data, deps.ingestDeps);
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
      });
      // Only a processed record moves the watermark. A failure below stops it
      // here, so the failed record is fetched again next run.
      if (record.SystemModstamp > summary.watermark) summary.watermark = record.SystemModstamp;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.failed += 1;
      summary.records.push({ id, name, status: "failed", note: message });
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
