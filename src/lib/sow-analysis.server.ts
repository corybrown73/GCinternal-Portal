// TYPE-only: erased at compile time, so importing it costs nothing at runtime.
// The SDK itself is ~578 kB and is pulled in dynamically at the one call site
// below. This module is reached from hub.functions.ts, which defines 48 server
// functions and is therefore loaded on essentially every request — a static
// import here made every cold start parse the whole SDK to serve a page that
// never analyses a SOW.
import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LIFECYCLE_STAGES } from "./lifecycle";
import { sowAnalysisSchema, type SowAnalysis } from "./sow-analysis";

const ATTACHMENT_BUCKET = "attachments";
const MODEL = "claude-opus-5";

/** How much of a text SOW we hand to the model — POC scale. */
const MAX_TEXT_CHARS = 120_000;
/** ~8 MB of PDF; larger documents are rejected with a clear message. */
const MAX_FILE_BYTES = 8_000_000;

const db = () => supabaseAdmin as any;

export type SowAnalysisResult = {
  sowName: string | null;
  sowPath: string;
  analysis: SowAnalysis;
};

function extensionOf(name: string) {
  const m = /\.([A-Za-z0-9]+)$/.exec(name.trim());
  return m ? m[1]!.toLowerCase() : "";
}

const SYSTEM_PROMPT = `You read Statements of Work for a B2B SaaS implementation team and return structured JSON only.

Rules you must not break:
- Only report what the document supports. Never invent objectives, deliverables, integrations, dates or criteria.
- Mark every finding with confidence: "stated" (the document says it plainly), "implied" (a reasonable reading), "uncertain" (ambiguous or thin).
- Include a short verbatim quote for a finding whenever one exists, otherwise null.
- Propose journey stages ONLY where the document justifies them. Omit a stage rather than padding the journey.
- Where a proposed stage lines up with the team's existing lifecycle stage, set lifecycleStage to that id; otherwise null.
- For each proposed stage, carry across only the customer responsibilities and acceptance criteria the SOW ties to that work. Empty arrays where the SOW says nothing.
- Capture anything the SOW marks as excluded in extraction.outOfScope, and named dependencies in extraction.dependencies.
- extraction.requirements: concrete things that must be delivered or configured. extraction.technicalSolutions: work needing technical/solution-engineering involvement (integrations, data migration, custom configuration). extraction.successMeasures: how the customer will judge value, with the metric where stated. extraction.risksAndQuestions: risks the SOW names plus anything genuinely unclear that a delivery lead would need to ask.
- Every proposed stage MUST set lifecycleStage to one of the existing lifecycle stage ids below. Use the closest fit; do not invent stages that map to nothing.
- Timing: capture the overall delivery window in deliveryWindow. statedText is the SOW's own wording (e.g. "16 to 22 weeks"). minWeeks/maxWeeks are that window in whole weeks, null when the SOW gives no duration. startDateStated is a calendar start the SOW names, otherwise null — never invent one. startCondition is what the SOW says the clock starts on (signature, kickoff, environment access), otherwise null. delayConditions are the conditions the SOW says would delay or extend delivery. stageTimingProvided is true only when the SOW gives timing per phase or stage.
- Stage timing must be a credible planning estimate of the actual work, NOT an even division of the total. Do not give every stage a similar duration. Weight the weeks by the scope, complexity, integration and migration load, customer responsibilities and sequencing the SOW describes: effort concentrates where the SOW describes the most work. Where the SOW states timing for a phase, use it exactly, set timing.fromSow=true and put the SOW wording in timing.statedText.
- Stages may and should overlap where the work can genuinely run in parallel (e.g. enablement content prepared during build). List the other stage names in timing.parallelWith. Do not overlap work that depends on an earlier output.
- Make dependencies explicit: timing.dependencyDriver is the one dependency that governs when the stage can start (e.g. "customer sandbox credentials", "a usable build to test against"). timing.rationale is one short sentence saying why that duration is credible for the described work.
- Keep the last stage's endWeek inside the stated window where the described work plausibly fits. If it genuinely does not fit, still give your honest estimate and add an assumption saying it exceeds the SOW window.
- If the SOW gives too little detail to estimate a stage credibly, set timing.insufficientInfo=true and leave startWeek/endWeek null. Never manufacture a schedule just because an overall duration exists — an honest "insufficient information" is required rather than invented precision. If the SOW supports no stage timing at all, say so in gaps.
- Never output calendar dates for stages. Weeks only, counted from week 1 as the first week of delivery.
- Add an assumption entry for anything you inferred about timing, sequencing or overlap.
- If the document is not a SOW, is empty, or cannot be read as text, set readable=false and explain in "problem", and leave the arrays empty.

Existing lifecycle stage ids: ${LIFECYCLE_STAGES.map((s) => s.id).join(", ")}.

Return JSON exactly in this shape:
{"readable":true,"problem":null,"summary":"","extraction":{"objectives":[{"text":"","confidence":"stated","quote":null}],"scope":[],"deliverables":[],"integrations":[],"customerResponsibilities":[],"providerResponsibilities":[],"trainingAndAdoption":[],"acceptanceCriteria":[],"timeline":[],"dependencies":[],"outOfScope":[],"requirements":[],"technicalSolutions":[],"successMeasures":[],"risksAndQuestions":[]},"deliveryWindow":{"statedText":null,"minWeeks":null,"maxWeeks":null,"startDateStated":null,"startCondition":null,"delayConditions":[],"stageTimingProvided":false,"quote":null},"proposedJourney":[{"name":"","lifecycleStage":"handoff","purpose":"","workstreams":[],"dependencies":[],"customerResponsibilities":[],"acceptanceCriteria":[],"timing":{"startWeek":null,"endWeek":null,"statedText":null,"fromSow":false,"rationale":null,"dependencyDriver":null,"parallelWith":[],"insufficientInfo":false},"confidence":"stated"}],"assumptions":[],"gaps":[]}`;

/** Build the user message content from the stored file, by type. */
async function sowContent(
  bytes: Uint8Array,
  fileName: string,
): Promise<Anthropic.ContentBlockParam[]> {
  const ext = extensionOf(fileName);
  const instruction: Anthropic.TextBlockParam = {
    type: "text",
    text: "Read this Statement of Work and return the JSON described in the system message. Ground everything in the document.",
  };

  if (ext === "pdf") {
    const base64 = Buffer.from(bytes).toString("base64");
    return [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      },
      instruction,
    ];
  }

  if (["txt", "md", "markdown", "csv", "json", "html", "rtf"].includes(ext) || ext === "") {
    const text = new TextDecoder().decode(bytes).slice(0, MAX_TEXT_CHARS).trim();
    if (text.length < 40) {
      throw new Error("The attached SOW looks empty — there is no readable text to analyse.");
    }
    return [{ type: "text", text }, instruction];
  }

  throw new Error(
    `The attached SOW is a .${ext} file, which this preview cannot read. Attach the SOW as a PDF or a text file and try again.`,
  );
}

function tryParseAnalysis(raw: string): SowAnalysis | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    console.error("[sow-analysis] not json", cleaned.slice(0, 300));
    return null;
  }
  const parsed = sowAnalysisSchema.safeParse(json);
  if (!parsed.success) {
    console.error(
      "[sow-analysis] shape mismatch",
      JSON.stringify(parsed.error.issues).slice(0, 800),
    );
    return null;
  }
  return parsed.data;
}

/**
 * Read the SOW already attached to an implementation and propose a journey.
 * Read-only: nothing is written to the implementation here.
 */
export async function analyzeSow(implementationId: string): Promise<SowAnalysisResult> {
  const { data: impl, error } = await db()
    .from("implementations")
    .select("id,sow_document_url,sow_document_name")
    .eq("id", implementationId)
    .maybeSingle();
  if (error) throw new Error("Could not load the implementation.");
  if (!impl) throw new Error("That implementation no longer exists.");
  if (!impl.sow_document_url) {
    throw new Error("No SOW is attached to this implementation yet — attach one first.");
  }

  const download = await db()
    .storage.from(ATTACHMENT_BUCKET)
    .download(impl.sow_document_url as string);
  if (download.error || !download.data) {
    throw new Error("Could not open the attached SOW file.");
  }
  const bytes = new Uint8Array(await download.data.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error("The attached SOW file is empty.");
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error("The attached SOW is too large for this preview to analyse.");
  }

  if (!process.env["ANTHROPIC_API_KEY"]) {
    throw new Error("AI analysis is not configured — set ANTHROPIC_API_KEY on the deployment.");
  }

  const content = await sowContent(
    bytes,
    (impl.sow_document_name as string | null) ?? (impl.sow_document_url as string),
  );

  // Loaded here, not at module scope: by this point the request really is a
  // SOW analysis, so paying for the SDK is warranted.
  const { default: AnthropicSDK } = await import("@anthropic-ai/sdk");
  const client = new AnthropicSDK();
  const requestAnalysis = async (): Promise<string> => {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      });
      if (response.stop_reason === "refusal") {
        throw new Error("The model declined to analyse this document.");
      }
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    } catch (e) {
      if (e instanceof AnthropicSDK.RateLimitError) {
        throw new Error("The AI service is busy — try again in a moment.");
      }
      if (e instanceof AnthropicSDK.AuthenticationError) {
        throw new Error("AI analysis is misconfigured: the ANTHROPIC_API_KEY was rejected.");
      }
      if (e instanceof AnthropicSDK.APIError) {
        console.error("[sow-analysis] api error", e.status, e.message);
        throw new Error("The SOW analysis failed. Nothing has been changed.");
      }
      throw e;
    }
  };

  let analysis = tryParseAnalysis(await requestAnalysis());
  if (!analysis) {
    // Models occasionally return a near-miss shape; one clean retry rather than
    // handing the user a failure they can only fix by clicking again themselves.
    analysis = tryParseAnalysis(await requestAnalysis());
  }
  if (!analysis) {
    throw new Error("The analysis came back incomplete. Run it again.");
  }
  if (!analysis.readable) {
    throw new Error(
      analysis.problem ?? "The attached document could not be read as a Statement of Work.",
    );
  }
  if (analysis.proposedJourney.length === 0) {
    throw new Error(
      "The SOW did not contain enough detail to propose a journey. Nothing has been changed.",
    );
  }

  return {
    sowName: (impl.sow_document_name as string | null) ?? null,
    sowPath: impl.sow_document_url as string,
    analysis,
  };
}

/**
 * Apply a reviewed SOW proposal. Additive only: goals are appended, records are
 * inserted, and nothing already recorded is updated or removed.
 */
export async function applySowProposal(input: {
  implementationId: string;
  authorId: string | null;
  goals: string | null;
  requirements: string[];
  successMeasures: string[];
  journeyNote: string | null;
}) {
  const { data: impl, error } = await db()
    .from("implementations")
    .select("id,customer_goals")
    .eq("id", input.implementationId)
    .maybeSingle();
  if (error) throw new Error("Could not load the implementation.");
  if (!impl) throw new Error("That implementation no longer exists.");

  const applied = { goals: false, requirements: 0, successMeasures: 0, note: false };

  if (input.goals) {
    const existing = (impl.customer_goals as string | null)?.trim() ?? "";
    const next =
      existing === "" ? input.goals : `${existing}\n\nFrom the SOW analysis:\n${input.goals}`;
    const { error: goalError } = await db()
      .from("implementations")
      .update({ customer_goals: next })
      .eq("id", input.implementationId);
    if (goalError) throw new Error("Could not save the customer goals.");
    applied.goals = true;
  }

  if (input.requirements.length > 0) {
    const rows = input.requirements.map((title) => ({
      implementation_id: input.implementationId,
      title,
      priority: "should_have",
      status: "open",
      scope_status: "original",
      source: "SOW analysis",
    }));
    const { error: reqError } = await db().from("requirements").insert(rows);
    if (reqError) throw new Error("Could not save the requirements.");
    applied.requirements = rows.length;
  }

  if (input.successMeasures.length > 0) {
    const rows = input.successMeasures.map((description) => ({
      implementation_id: input.implementationId,
      description,
      status: "pending",
      measurement_source: "SOW analysis",
    }));
    const { error: scError } = await db().from("success_criteria").insert(rows);
    if (scError) throw new Error("Could not save the success measures.");
    applied.successMeasures = rows.length;
  }

  if (input.journeyNote) {
    const { createJournalEntry } = await import("./hub.server");
    await createJournalEntry({
      implementationId: input.implementationId,
      note: input.journeyNote,
      authorId: input.authorId,
      links: null,
      attachmentUrl: null,
      attachmentName: null,
    });
    applied.note = true;
  }

  return applied;
}

/** Points the implementation at a newly uploaded SOW file. Nothing else changes. */
export async function setSowDocument(input: {
  implementationId: string;
  documentUrl: string;
  documentName: string;
}) {
  const { error } = await db()
    .from("implementations")
    .update({ sow_document_url: input.documentUrl, sow_document_name: input.documentName })
    .eq("id", input.implementationId);
  if (error) throw new Error("Could not attach that SOW.");
  return { ok: true };
}
