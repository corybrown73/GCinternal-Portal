import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { documentRefusal, type GeneratedDocument } from "@/lib/document-guard";

const db = () => supabaseAdmin as any;

/**
 * Refuses a document unless the deal and its project were read successfully and
 * show no partner evidence. Every generator calls this before it builds, stores
 * or files anything, so no entry point can skip it.
 *
 * A failed read is never taken as confirmation that a deal is standard. Every
 * read's error is checked, and a result missing a field the check needs refuses
 * too, with a message that says what could not be checked. This module reads the
 * rows itself rather than through liveImplementationForDeal, which drops query
 * errors, so the shared helper and its other callers are unchanged.
 *
 * What the intake says is decided by documentRefusal (see readIntakeReading).
 */

const DEAL_READ_FAILED =
  "The deal could not be read, so it cannot be checked for a partner journey. Nothing was generated; try again.";
const DEAL_NOT_FOUND =
  "The deal was not found, so it cannot be checked for a partner journey. Nothing was generated.";
const DEAL_INCOMPLETE =
  "The deal's record is incomplete, so it cannot be checked for a partner journey. Nothing was generated.";
const PROJECT_READ_FAILED =
  "The project could not be read, so it cannot be checked for a partner journey. Nothing was generated; try again.";
const PROJECT_INCOMPLETE =
  "The project's record is incomplete, so it cannot be checked for a partner journey. Nothing was generated.";

type DealRow = { customer_id: string | null; intake: unknown };
type ProjectRow = { journey_type: string | null; partner_key: string | null };

const PROJECT_SELECT = "journey_type,partner_key";

async function readDeal(dealId: string): Promise<DealRow> {
  const { data, error } = await db()
    .from("portal_accounts")
    .select("customer_id,intake")
    .eq("id", dealId)
    .maybeSingle();
  if (error) throw new Error(DEAL_READ_FAILED);
  if (!data) throw new Error(DEAL_NOT_FOUND);
  if (!("customer_id" in data) || !("intake" in data)) throw new Error(DEAL_INCOMPLETE);
  return data as DealRow;
}

/**
 * The live project for a deal, or null when the reads succeeded and there is
 * none. Mirrors liveImplementationForDeal's lookup, but a query error throws.
 */
async function readLiveProject(
  dealId: string,
  customerId: string | null,
): Promise<ProjectRow | null> {
  const byDeal = await db()
    .from("implementations")
    .select(PROJECT_SELECT)
    .eq("deal_id", dealId)
    .is("superseded_by_implementation_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byDeal.error) throw new Error(PROJECT_READ_FAILED);
  if (byDeal.data) return checkedProject(byDeal.data);

  if (!customerId) return null;
  const byCustomer = await db()
    .from("implementations")
    .select(PROJECT_SELECT)
    .eq("customer_id", customerId)
    .is("deal_id", null)
    .is("superseded_by_implementation_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byCustomer.error) throw new Error(PROJECT_READ_FAILED);
  return byCustomer.data ? checkedProject(byCustomer.data) : null;
}

function checkedProject(row: unknown): ProjectRow {
  if (!row || typeof row !== "object" || !("journey_type" in row) || !("partner_key" in row)) {
    throw new Error(PROJECT_INCOMPLETE);
  }
  return row as ProjectRow;
}

/**
 * Throws unless the document may be generated for this deal. Resolves only when
 * the deal and its project were both read successfully, and neither the project
 * nor the intake shows a partner journey, and the intake can be read.
 */
export async function assertDocumentAllowed(
  document: GeneratedDocument,
  dealId: string,
): Promise<void> {
  const deal = await readDeal(dealId);
  const project = await readLiveProject(dealId, deal.customer_id ?? null);

  const reason = documentRefusal(document, { implementation: project, intake: deal.intake });
  if (reason) throw new Error(reason);
}
