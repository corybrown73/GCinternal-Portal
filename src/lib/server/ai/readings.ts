import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { readIntake } from "../../intake-answers";
import { parseSowReading, type SowReading } from "../../sow-plan";
import type { AiUsage } from "./client";
import type { PreparedDocument } from "./documents";

/**
 * The SOW reading, kept once per document and served from the table from
 * then on. The plan panel, the implementation's analysis, the brief, the
 * welcome page and the handoff context all ask here first; the model is
 * only asked when the bytes are new.
 */

const db = () => supabaseAdmin as any;

export type SowReadingRow = {
  id: string;
  deal_id: string;
  source_hash: string;
  source_path: string | null;
  source_name: string | null;
  model: string | null;
  created_at: string;
  reading: SowReading;
};

/**
 * The reading of the document on file, or null. By the bytes when they
 * are hashed — `sha256` from a caller that has them, else the file in
 * storage — and by the file's path when they are not (`fetch: false`, for
 * a page that only shows the reading, or a file that could not be
 * downloaded). Never an older document's: a replaced SOW has no reading
 * until it is read, and every page says so rather than showing the last
 * one's deliverables as this one's.
 */
export async function loadSowReading(
  dealId: string,
  opts: { sha256?: string | null | undefined; fetch?: boolean | undefined } = {},
): Promise<SowReadingRow | null> {
  const { data: rows } = await db()
    .from("portal_ai_readings")
    .select("id,deal_id,source_hash,source_path,source_name,model,created_at,output")
    .eq("deal_id", dealId)
    .eq("kind", "sow")
    .order("created_at", { ascending: false })
    .limit(20);
  const kept = ((rows ?? []) as Array<Record<string, unknown>>)
    .map((r) => {
      const reading = parseSowReading(r["output"]);
      return reading
        ? ({
            id: String(r["id"]),
            deal_id: String(r["deal_id"]),
            source_hash: String(r["source_hash"]),
            source_path: (r["source_path"] as string | null) ?? null,
            source_name: (r["source_name"] as string | null) ?? null,
            model: (r["model"] as string | null) ?? null,
            created_at: String(r["created_at"]),
            reading,
          } as SowReadingRow)
        : null;
    })
    .filter((r): r is SowReadingRow => r !== null);
  if (!kept.length) return null;

  if (opts.sha256 !== undefined) {
    return (opts.sha256 && kept.find((r) => r.source_hash === opts.sha256)) || null;
  }
  const current = await currentSow(dealId, opts.fetch !== false);
  if (current.sha256) return kept.find((r) => r.source_hash === current.sha256) ?? null;
  for (const path of current.paths) {
    const match = kept.find((r) => r.source_path === path);
    if (match) return match;
  }
  return null;
}

/**
 * The document on file: the SOW's path and, behind it, the contract's (a
 * seats-only deal is read from the contract); and the hash of whichever
 * one the reading would be of, when asked to fetch it and it could be.
 */
async function currentSow(
  dealId: string,
  fetch: boolean,
): Promise<{ paths: string[]; sha256: string | null }> {
  try {
    const { data: account } = await db()
      .from("portal_accounts")
      .select("sow_document_path,sow_document_name,intake")
      .eq("id", dealId)
      .maybeSingle();
    if (!account) return { paths: [], sha256: null };
    const paths = [
      (account.sow_document_path as string | null) ?? null,
      readIntake(account.intake).contract?.path ?? null,
    ].filter((p): p is string => Boolean(p));
    if (!paths.length || !fetch) return { paths, sha256: null };
    const { loadDealDocuments } = await import("./sources");
    const docs = await loadDealDocuments(account);
    const doc = docs.sow?.block ? docs.sow : docs.contract?.block ? docs.contract : null;
    return { paths, sha256: doc?.sha256 ?? null };
  } catch {
    return { paths: [], sha256: null };
  }
}

/**
 * Keep a reading by the document's hash. One row per document: a reading
 * asked for again ("Re-read the SOW", a forced job) replaces the kept
 * one, so what the plan panel showed is what the brief, the analysis and
 * the handoff context serve from then on. Never throws: the reading is
 * the point.
 */
export async function keepSowReading(input: {
  dealId: string;
  doc: PreparedDocument;
  sourcePath: string | null;
  reading: SowReading;
  model: string;
  usage: AiUsage;
}): Promise<void> {
  const { error } = await db().from("portal_ai_readings").upsert(
    {
      deal_id: input.dealId,
      kind: "sow",
      source_path: input.sourcePath,
      source_name: input.doc.name,
      source_hash: input.doc.sha256,
      model: input.model,
      output: input.reading,
      usage: input.usage,
    },
    { onConflict: "deal_id,kind,source_hash" },
  );
  if (error) {
    console.error("[ai-readings] could not keep the SOW reading", error.message);
  }
}

/** Where the document the reading came from lives on the record. */
export function sourcePathFor(
  account: { sow_document_path?: string | null; intake?: unknown },
  doc: PreparedDocument,
  docs: { sow: PreparedDocument | null; contract: PreparedDocument | null },
): string | null {
  if (docs.sow && doc.sha256 === docs.sow.sha256) return account.sow_document_path ?? null;
  return readIntake(account.intake).contract?.path ?? null;
}
