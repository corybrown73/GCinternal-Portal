import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  loadPurchaseRecords,
  saveReviewedSet,
  type ReviewedSaveResult,
} from "./complete-solutions.server";
import { purchaseFor, type PurchaseRecord } from "./complete-solutions-purchase";
import {
  prioritiesOf,
  reviewedSetFrom,
  sowReadingSchema,
  type ReviewedSolution,
  type SowReading,
} from "./complete-solutions-sow";
import { ATTACHMENT_BUCKET, storagePathFor } from "./sow-analysis.server";

/**
 * The SOW-based set-up for complete solutions. Two steps, deliberately apart:
 *
 *   1. readSolutionsFromSow: reads the signed SOW already attached to the
 *      implementation and returns a PROPOSED set. Nothing is written.
 *   2. saveReviewedSolutions: the TIS has reviewed, edited and confirmed that
 *      set. Only then are its solutions, components, dependencies and dates
 *      recorded, each with the SOW's own words and an import event.
 *
 * The SOW file itself stays where it is (implementations.sow_document_path),
 * so the original is always there to check against.
 */

const db = () => supabaseAdmin as any;

export const SYSTEM_PROMPT = `You read a signed Statement of Work for a field-operations software implementation and return structured JSON only.

Rules:
- Ground everything in the document. If the SOW does not say it, leave it out and list it in "gaps".
- A solution is a complete deliverable the customer is buying, such as an inspection process or a dispatch integration. Its components are the parts that make it up: forms, integrations (dispatch, dynamic reference data, or another system), analytics, training, or other.
- Scope: work the SOW lists as included is "purchased". Work it describes as optional, a request, a future phase, or not yet approved is "requested".
- Priority per component: "needed_for_go_live" when the SOW says it is required for launch; "planned_for_later" when the SOW puts it in a later phase; otherwise "deliver_during_implementation".
- startDate: only an explicit calendar date the SOW gives for when work can start. Never estimate one. Leave null otherwise.
- estimateWeeks: only a duration the SOW states. Leave null otherwise.
- sowQuote: the SOW's own sentence for the item, copied as written.
- dependsOn: names of other components in the same solution that the SOW says must come first. Set critical true only when the SOW says the work cannot proceed without it.

Return JSON with keys: readable (boolean), problem (text, if the document could not be read as a SOW), solutions (array), gaps (array of short sentences).`;

export type SowSuggestion = {
  sowName: string | null;
  solutions: ReviewedSolution[];
  gaps: string[];
  /** The deal's purchase record items, so the person can see what each match is. */
  purchaseRecords: PurchaseRecord[];
};

/**
 * Reads a SOW document and returns the model's reading, validated. Separate from
 * the storage lookup so the same path can be run against a document supplied for
 * acceptance testing. Throws with a sentence that says nothing was changed.
 */
export async function readSowReading(
  bytes: Uint8Array,
  name: string,
  dealId: string | null,
): Promise<SowReading> {
  const { prepareDocument } = await import("./server/ai/documents");
  const sow = await prepareDocument(bytes, name, null, { title: "Statement of Work" });
  if (!sow.block) throw new Error(sow.problem ?? "The attached SOW could not be read.");

  const { aiConfigured } = await import("./server/ai/config");
  if (!aiConfigured()) {
    throw new Error("AI analysis is not configured. Set ANTHROPIC_API_KEY on the deployment.");
  }

  const { runStructured, describeAiError } = await import("./server/ai/client");
  let reading;
  try {
    const result = await runStructured({
      kind: "sow_solutions",
      schema: sowReadingSchema,
      system: [{ type: "text", text: SYSTEM_PROMPT }],
      content: [
        sow.block,
        {
          type: "text",
          text: "Read this Statement of Work and return the JSON described in the system message. Ground everything in the document.",
        },
      ],
      maxTokens: 16000,
      dealId,
    });
    // Parsed again here: the reader must not depend on the client having done it.
    reading = sowReadingSchema.parse(result.data);
  } catch (e) {
    console.error("[solutions] the SOW reading failed", e);
    const reason = describeAiError(e, "The SOW reading").replace(/[.!?]?$/, ".");
    throw new Error(`${reason} Nothing has been changed.`);
  }
  if (!reading.readable) {
    throw new Error(
      reading.problem ||
        "The attached document could not be read as a Statement of Work. Nothing has been changed.",
    );
  }
  return reading;
}

/** The proposed set for the TIS to review. Nothing is written. */
export async function readSolutionsFromSow(implementationId: string): Promise<SowSuggestion> {
  const impl = (await db()
    .from("implementations")
    .select("id,sow_document_path,sow_document_url,sow_document_name,deal_id")
    .eq("id", implementationId)
    .maybeSingle()) as { data: any; error: any };
  if (impl.error) throw new Error("Could not load the implementation.");
  if (!impl.data) throw new Error("That implementation no longer exists.");
  const { path, link } = storagePathFor(impl.data);
  if (!path) {
    throw new Error(
      link
        ? "The SOW on this implementation is a link to another system, which cannot be read here. Attach the file itself."
        : "No SOW is attached to this implementation yet. Attach one first.",
    );
  }

  const download = await db().storage.from(ATTACHMENT_BUCKET).download(path);
  if (download.error || !download.data) throw new Error("Could not open the attached SOW file.");

  const reading = await readSowReading(
    new Uint8Array(await download.data.arrayBuffer()),
    (impl.data.sow_document_name as string | null) ?? path.split("/").pop() ?? "the attached SOW",
    (impl.data.deal_id as string | null) ?? null,
  );

  const { solutions, gaps } = reviewedSetFrom(reading);
  if (solutions.length === 0) {
    throw new Error("The SOW did not name any complete solutions. Nothing has been changed.");
  }
  // A purchased solution is proposed as delivering a purchase record item only when
  // exactly one item has its name. The person confirms or clears it before saving.
  const purchase = await loadPurchaseRecords(implementationId);
  return {
    sowName: (impl.data.sow_document_name as string | null) ?? null,
    solutions: solutions.map((s) => ({
      ...s,
      purchasedServiceId:
        s.scope === "purchased" ? (purchaseFor(s.title, purchase.records)?.id ?? null) : null,
    })),
    gaps,
    purchaseRecords: purchase.records,
  };
}

export type SaveResult = ReviewedSaveResult;

/**
 * Records a reviewed set in one transaction. A solution whose name already
 * belongs to an active solution on the implementation is skipped, never
 * duplicated. Each solution takes the priority of its most urgent component.
 * If anything in the set cannot be saved (a loop, a refused permission), nothing
 * is saved: the database rolls the whole set back, and the reason is returned.
 */
export async function saveReviewedSolutions(
  implementationId: string,
  set: ReviewedSolution[],
  sowName: string | null,
  actorProfileId: string,
): Promise<SaveResult> {
  const solutions = set
    .map((proposed) => ({ ...proposed, title: proposed.title.trim() }))
    .filter((proposed) => proposed.title.length > 0)
    .map((proposed) => ({
      title: proposed.title,
      scope: proposed.scope,
      priority: prioritiesOf(proposed.components),
      purchasedServiceId:
        proposed.scope === "purchased" ? (proposed.purchasedServiceId ?? null) : null,
      startCondition: proposed.startCondition,
      estimateWeeks: proposed.estimateWeeks,
      sowQuote: proposed.sowQuote,
      suggestedTarget: proposed.suggestedTarget,
      components: proposed.components.map((c) => ({
        category: c.category,
        integrationType: c.integrationType,
        name: c.name.trim(),
        priority: c.priority,
        dependsOn: c.dependsOn,
        critical: c.critical,
        startCondition: c.startCondition,
        estimateWeeks: c.estimateWeeks,
        sowQuote: c.sowQuote,
        suggestedTarget: c.suggestedTarget,
      })),
    }));
  return saveReviewedSet(implementationId, solutions, sowName, actorProfileId);
}
