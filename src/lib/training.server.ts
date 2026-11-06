/**
 * The training plan of an implementation, on the server. Reads go straight to the
 * table; every write is one of the database functions from 0092, which make the
 * permission, version and history checks. Nothing here decides a rule itself beyond
 * shaping the input the function takes.
 *
 * Writes never change an implementation's stage, a journey task, or a purchased
 * solution's acceptance.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { writeFailure } from "./complete-solutions.server";
import { rowOrThrow, rowsOrThrow } from "./server/db-read";
import {
  needFromRow,
  trainingCoverage,
  type DemonstratedStatus,
  type NeedInput,
  type TrainingCoverage,
  type TrainingNeed,
  type PurchaseItem,
} from "./training-plan";

const db = () => supabaseAdmin as any;

const NEED_COLUMNS =
  "id, implementation_id, topic, audience, outcome, method, responsibility, responsibility_source, sow_quote, purchased_service_id, solution_component_id, adoption_area_id, delivered_at, demonstrated_status, demonstrated_evidence_id, demonstrated_at, next_step, archived_at, created_at, updated_at";

/** The training needs of one implementation, oldest first. Archived ones are included. */
export async function loadTrainingNeeds(implementationId: string): Promise<TrainingNeed[]> {
  const rows = rowsOrThrow<Record<string, unknown>>(
    await db()
      .from("implementation_training")
      .select(NEED_COLUMNS)
      .eq("implementation_id", implementationId)
      .order("created_at", { ascending: true }),
    "the training plan",
  );
  return rows.map(needFromRow);
}

/** The implementation's training with what the purchase record says about it. */
export async function loadTrainingFor(implementationId: string): Promise<{
  needs: TrainingNeed[];
  coverage: TrainingCoverage;
  hasDeal: boolean;
}> {
  const { loadPurchaseRecords } = await import("./complete-solutions.server");
  const [needs, purchase] = await Promise.all([
    loadTrainingNeeds(implementationId),
    loadPurchaseRecords(implementationId),
  ]);
  const purchased: PurchaseItem[] = purchase.records;
  return {
    needs,
    coverage: trainingCoverage(purchased, needs),
    hasDeal: purchase.hasDeal,
  };
}

/**
 * What a transcript reading may update: the active needs, with the version each was
 * read at. `null` when the feature is off or the read fails: the reading then offers no
 * training suggestions at all, rather than suggestions against an empty plan.
 */
export async function loadTrainingForReading(implementationId: string): Promise<Array<{
  id: string;
  topic: string;
  responsibility: string | null;
  delivered: boolean;
  readiness: DemonstratedStatus;
  updatedAt: string;
}> | null> {
  try {
    const { isFlagOn } = await import("./app-config.server");
    if (!(await isFlagOn("training_plan"))) return null;
    const needs = await loadTrainingNeeds(implementationId);
    return needs
      .filter((n) => !n.archivedAt)
      .map((n) => ({
        id: n.id,
        topic: n.topic,
        responsibility: n.responsibility && n.responsibilitySource ? n.responsibility : null,
        delivered: !!n.deliveredAt,
        readiness: n.demonstratedStatus,
        updatedAt: n.updatedAt,
      }));
  } catch (e) {
    console.error("[transcript] could not read the training plan for a reading", e);
    return null;
  }
}

/** The one row a write is about, for the screen to read back after it. */
export async function loadTrainingNeed(id: string): Promise<TrainingNeed> {
  const row = rowOrThrow<Record<string, unknown>>(
    await db().from("implementation_training").select(NEED_COLUMNS).eq("id", id).maybeSingle(),
    "this training need",
  );
  if (!row) throw new Error("That training need no longer exists.");
  return needFromRow(row);
}

/* ------------------------------------------------------------------ writes */

/** Only the fields the caller sent are passed on, so "not sent" never reads as "clear it". */
function fieldsFrom(
  input: NeedInput & {
    purchasedServiceId?: string | null;
    solutionComponentId?: string | null;
    adoptionAreaId?: string | null;
    sowQuote?: string | null;
    responsibilitySource?: string | null;
  },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (key: string, v: unknown) => {
    if (v !== undefined) out[key] = v;
  };
  set("topic", input.topic);
  set("audience", input.audience);
  set("outcome", input.outcome);
  set("method", input.method);
  set("next_step", input.nextStep);
  set("purchased_service_id", input.purchasedServiceId);
  set("solution_component_id", input.solutionComponentId);
  set("adoption_area_id", input.adoptionAreaId);
  // A responsibility goes with its source. Both are sent together, or neither.
  if (input.responsibility !== undefined || input.responsibilitySource !== undefined) {
    set("responsibility", input.responsibility ?? null);
    set("responsibility_source", input.responsibilitySource ?? null);
  }
  set("sow_quote", input.sowQuote);
  return out;
}

export type TrainingFields = NeedInput & {
  purchasedServiceId?: string | null;
  solutionComponentId?: string | null;
  adoptionAreaId?: string | null;
};

export async function addTrainingNeed(
  implementationId: string,
  fields: TrainingFields,
  actorProfileId: string,
  reason: string | null = null,
): Promise<string> {
  const { data, error } = await db().rpc("training_create", {
    p_profile: actorProfileId,
    p_implementation: implementationId,
    p_fields: fieldsFrom(fields),
    p_reason: reason,
  });
  if (error) throw writeFailure("add the training need", error);
  return String(data);
}

export async function updateTrainingNeed(
  id: string,
  expectedUpdatedAt: string,
  fields: TrainingFields,
  actorProfileId: string,
  reason: string | null = null,
): Promise<void> {
  const { error } = await db().rpc("training_update", {
    p_profile: actorProfileId,
    p_id: id,
    p_expected: expectedUpdatedAt,
    p_fields: fieldsFrom(fields),
    p_reason: reason,
  });
  if (error) throw writeFailure("change the training need", error);
}

export async function recordTrainingDelivery(
  id: string,
  expectedUpdatedAt: string,
  deliveredOn: string,
  actorProfileId: string,
  reason: string | null = null,
): Promise<void> {
  const { error } = await db().rpc("training_record_delivery", {
    p_profile: actorProfileId,
    p_id: id,
    p_expected: expectedUpdatedAt,
    p_delivered_on: deliveredOn,
    p_reason: reason,
  });
  if (error) throw writeFailure("record the delivery", error);
}

export async function recordTrainingReadiness(
  id: string,
  expectedUpdatedAt: string,
  status: DemonstratedStatus,
  evidenceId: string | null,
  actorProfileId: string,
  reason: string | null = null,
): Promise<void> {
  const { error } = await db().rpc("training_record_demonstration", {
    p_profile: actorProfileId,
    p_id: id,
    p_expected: expectedUpdatedAt,
    p_status: status,
    p_evidence: evidenceId,
    p_reason: reason,
  });
  if (error) throw writeFailure("record readiness", error);
}

/** Readiness shown from a transcript: the database creates the evidence from the quote. */
export async function demonstrateTrainingFromTranscript(
  id: string,
  expectedUpdatedAt: string,
  quote: string,
  proposalId: string,
  actorProfileId: string,
  reason: string | null = null,
): Promise<string> {
  const { data, error } = await db().rpc("training_demonstrate_from_transcript", {
    p_profile: actorProfileId,
    p_id: id,
    p_expected: expectedUpdatedAt,
    p_quote: quote,
    p_proposal: proposalId,
    p_reason: reason,
  });
  if (error) throw writeFailure("record readiness", error);
  return String(data);
}

export async function setTrainingArchived(
  id: string,
  expectedUpdatedAt: string,
  archived: boolean,
  actorProfileId: string,
  reason: string | null,
): Promise<void> {
  const { error } = await db().rpc("training_set_archived", {
    p_profile: actorProfileId,
    p_id: id,
    p_expected: expectedUpdatedAt,
    p_archived: archived,
    p_reason: reason,
  });
  if (error)
    throw writeFailure(archived ? "archive the training need" : "restore the training need", error);
}

/**
 * Whether this person may change the implementation's training. The same rule the
 * database functions apply (post_sale_may_manage), so the screen never offers a change
 * the database would refuse.
 */
export async function canEditTraining(
  profileId: string,
  implementationId: string,
): Promise<boolean> {
  const { data, error } = await db().rpc("post_sale_may_manage", {
    p_profile: profileId,
    p_implementation: implementationId,
  });
  if (error) {
    console.error("[training] could not read whether this person may change the training", error);
    return false;
  }
  return data === true;
}

/** The implementation's evidence, for linking to a readiness that was shown. */
export async function loadEvidenceFor(
  implementationId: string,
): Promise<Array<{ id: string; title: string; type: string; createdAt: string }>> {
  const rows = rowsOrThrow<Record<string, unknown>>(
    await db()
      .from("evidence")
      .select("id, title, type, created_at")
      .eq("implementation_id", implementationId)
      .order("created_at", { ascending: false })
      .limit(100),
    "the evidence",
  );
  return rows.map((r) => ({
    id: String(r["id"]),
    title: String(r["title"] ?? ""),
    type: String(r["type"] ?? ""),
    createdAt: String(r["created_at"] ?? ""),
  }));
}
