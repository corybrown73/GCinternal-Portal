import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  insertComponent,
  insertCompleteSolution,
  insertDependency,
  loadSolutionsFor,
  recordSowImport,
} from "./complete-solutions.server";
import {
  prioritiesOf,
  reviewedSetFrom,
  sameName,
  sowReadingSchema,
  type ReviewedSolution,
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

const SYSTEM_PROMPT = `You read a signed Statement of Work for a field-operations software implementation and return structured JSON only.

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
};

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

  const { prepareDocument } = await import("./server/ai/documents");
  const sow = await prepareDocument(
    new Uint8Array(await download.data.arrayBuffer()),
    (impl.data.sow_document_name as string | null) ?? path.split("/").pop() ?? "the attached SOW",
    null,
    { title: "Statement of Work" },
  );
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
      dealId: (impl.data.deal_id as string | null) ?? null,
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

  const { solutions, gaps } = reviewedSetFrom(reading);
  if (solutions.length === 0) {
    throw new Error("The SOW did not name any complete solutions. Nothing has been changed.");
  }
  return {
    sowName: (impl.data.sow_document_name as string | null) ?? null,
    solutions,
    gaps,
  };
}

export type SaveResult = {
  created: Array<{ title: string; components: number; dependencies: number }>;
  skipped: Array<{ title: string; reason: string }>;
  /** Anything that was saved but could not be finished, with what to do next. */
  problems: string[];
};

/**
 * Records a reviewed set. A solution whose name already belongs to an active
 * solution on the implementation is skipped, never duplicated. Each solution
 * takes the priority of its most urgent component.
 *
 * Writes are not one transaction. A failure partway is reported in `problems`
 * with what was saved, so nothing is hidden and nothing is silently lost.
 */
export async function saveReviewedSolutions(
  implementationId: string,
  set: ReviewedSolution[],
  sowName: string | null,
  actorProfileId: string,
): Promise<SaveResult> {
  const existing = await loadSolutionsFor(implementationId);
  const active = existing.filter((s) => !s.archived);
  const result: SaveResult = { created: [], skipped: [], problems: [] };

  for (const proposed of set) {
    const title = proposed.title.trim();
    if (!title) continue;
    if (active.some((s) => sameName(s.title, title))) {
      result.skipped.push({
        title,
        reason: "A solution with this name already exists on the implementation.",
      });
      continue;
    }
    if (proposed.components.some((c) => !c.name.trim())) {
      result.skipped.push({
        title,
        reason: "A component has no name, so the solution was not saved.",
      });
      continue;
    }

    let solutionId: string;
    try {
      solutionId = await insertCompleteSolution(
        {
          implementationId,
          title,
          scope: proposed.scope,
          priority: prioritiesOf(proposed.components),
          startCondition: proposed.startCondition,
          estimateWeeks: proposed.estimateWeeks,
          sowQuote: proposed.sowQuote,
          source: "sow",
          targetDate: proposed.suggestedTarget,
        },
        actorProfileId,
      );
    } catch (e) {
      result.problems.push(`${title}: ${e instanceof Error ? e.message : "could not be saved"}`);
      continue;
    }

    const componentIds = new Map<string, string>();
    let saved = 0;
    for (const c of proposed.components) {
      try {
        const { id } = await insertComponent(
          {
            solutionId,
            category: c.category,
            integrationType: c.integrationType,
            name: c.name,
            priority: c.priority,
            targetDate: c.suggestedTarget,
            startCondition: c.startCondition,
            estimateWeeks: c.estimateWeeks,
            sowQuote: c.sowQuote,
          },
          actorProfileId,
        );
        componentIds.set(c.name.toLowerCase(), id);
        saved += 1;
      } catch (e) {
        result.problems.push(
          `${title} · ${c.name}: ${e instanceof Error ? e.message : "could not be saved"}`,
        );
      }
    }

    let dependencies = 0;
    for (const c of proposed.components) {
      const from = componentIds.get(c.name.toLowerCase());
      if (!from) continue;
      for (const depName of c.dependsOn) {
        const to = componentIds.get(depName.toLowerCase());
        if (!to) continue;
        try {
          await insertDependency(
            { componentId: from, dependsOnId: to, critical: c.critical },
            actorProfileId,
          );
          dependencies += 1;
        } catch (e) {
          result.problems.push(
            `${title} · ${c.name} → ${depName}: ${e instanceof Error ? e.message : "not recorded"}`,
          );
        }
      }
    }

    try {
      await recordSowImport(implementationId, solutionId, sowName, actorProfileId);
    } catch {
      result.problems.push(`${title}: saved, but the SOW import was not recorded in its history.`);
    }

    result.created.push({ title, components: saved, dependencies });
  }
  return result;
}
