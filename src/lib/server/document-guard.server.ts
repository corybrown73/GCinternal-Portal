import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { intakeAnswersSchema, type IntakeAnswers } from "@/lib/intake-answers";
import { documentRefusal, type GeneratedDocument } from "@/lib/document-guard";

const db = () => supabaseAdmin as any;

/**
 * Refuses a document unless the deal and its project were read successfully and
 * show a standard journey. Every generator calls this before it builds, stores
 * or files anything, so no entry point can skip it.
 *
 * A failed read is never taken as confirmation that a project is standard. Every
 * read's error is checked, and a result that is missing a classification field
 * refuses too, with a message that says what could not be checked. This module
 * reads the rows itself rather than through liveImplementationForDeal, which
 * drops query errors, so the shared helper and its other callers are unchanged.
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
const PATH_NOT_RECORDED =
  "This deal has no project yet and its path is not recorded, so it cannot be told apart from a partner deal. Record the deal's path, then generate again. Nothing was generated.";

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
 * the deal and its project were both read, and neither is a partner journey.
 */
export async function assertDocumentAllowed(
  document: GeneratedDocument,
  dealId: string,
): Promise<void> {
  const deal = await readDeal(dealId);
  const customerId = deal.customer_id ?? null;
  const project = await readLiveProject(dealId, customerId);

  // The intake only classifies a deal before its project exists, or adds a
  // partner answer. A stored intake that does not parse is not read as standard.
  const parsed = intakeAnswersSchema.safeParse(deal.intake ?? null);
  const intake: IntakeAnswers | null = parsed.success ? parsed.data : null;

  if (!project) {
    // No project yet: the deal's recorded path is the only classification there is.
    if (!intake || !intake.path) throw new Error(PATH_NOT_RECORDED);
  }

  const reason = documentRefusal(document, {
    implementation: project,
    intake,
  });
  if (reason) throw new Error(reason);
}
