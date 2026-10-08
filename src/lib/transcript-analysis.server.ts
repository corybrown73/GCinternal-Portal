// TYPE-only: erased at compile time, so importing it costs nothing at runtime.
// The SDK itself is ~578 kB and is pulled in dynamically by the shared AI
// client at the one call site below, the same way sow-analysis.server.ts does
// it — this module is reached from hub.functions.ts, which is loaded on
// essentially every request.
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { transcriptAnalysisSchema, type TranscriptAnalysis } from "./transcript-analysis";

const ATTACHMENT_BUCKET = "attachments";

const db = () => supabaseAdmin as any;

export type TranscriptAnalysisResult = {
  attachmentTitle: string | null;
  analysis: TranscriptAnalysis;
};

const SYSTEM_PROMPT = `You read transcripts of customer implementation meetings for a B2B SaaS delivery team and return structured JSON only.

Rules you must not break:
- You propose updates for a human to review. You never decide anything, and nothing you return is written anywhere automatically.
- Only report what the transcript actually supports. Never invent a risk, issue, decision, date or name that was not said.
- Mark every proposal with confidence: "stated" (said plainly), "implied" (a reasonable reading), "uncertain" (ambiguous or thin).
- Include a short, close-to-verbatim supporting quote for every proposal. Do not return a proposal with no supporting quote.
- type must be exactly one of: risk, issue, decision, target_date, owner, note.
  - "risk": something that could go wrong and has not yet.
  - "issue": something already wrong or already broken.
  - "decision": a choice the customer or the team actually made in this meeting.
  - "target_date": ONLY when the transcript states or clearly implies a specific new target or launch date. text must be that date in strict YYYY-MM-DD form. If only a relative time is said ("two weeks from now") and you cannot resolve it to a calendar date, use type "note" instead rather than guessing one.
  - "owner": ONLY when the transcript says a different, named person should now own or run the implementation. text is that person's name exactly as said — never an id, never a guess at who that maps to internally.
  - "note": a useful finding that does not cleanly fit the other types — a follow-up, an open question, context worth keeping.
- Never propose a stage change, a checklist task being marked done or complete, a change to purchased services or solutions, or a meeting/timeline edit. These are entirely out of scope for you. If the transcript raises one, capture it as type "note" describing what was discussed — never as an instruction to change it.
- title is a short label, under ten words. text is the proposed content: for risk/issue/decision/note, a concise description in your own words; for target_date, the ISO date only; for owner, the person's name only.
- summary is two or three sentences on what the meeting covered — context for the human reviewer, not a proposal itself.
- If the file is empty, unreadable, or is not a meeting transcript, set readable=false, explain briefly in "problem", and leave proposals empty.

Return JSON exactly in this shape:
{"readable":true,"problem":null,"summary":"","proposals":[{"type":"risk","title":"","text":"","confidence":"stated","quote":""}]}`;

/**
 * Read an uploaded transcript (an `account_files` row already on this
 * implementation) and propose updates. Read-only: nothing is written here.
 */
export async function analyzeTranscript(
  implementationId: string,
  attachmentId: string,
): Promise<TranscriptAnalysisResult> {
  const { data: file, error } = await db()
    .from("account_files")
    .select("id,title,storage_path,implementation_id,content_type")
    .eq("id", attachmentId)
    .maybeSingle();
  if (error) throw new Error("Could not load the transcript.");
  if (!file || file.implementation_id !== implementationId) {
    throw new Error("That transcript is no longer on this implementation.");
  }
  if (!file.storage_path) {
    throw new Error("That transcript has no stored file to read.");
  }

  const download = await db()
    .storage.from(ATTACHMENT_BUCKET)
    .download(file.storage_path as string);
  if (download.error || !download.data) {
    throw new Error("Could not open the uploaded transcript file.");
  }

  const { aiConfigured } = await import("./server/ai/config");
  if (!aiConfigured()) {
    throw new Error("AI analysis is not configured — set ANTHROPIC_API_KEY on the deployment.");
  }

  // A .vtt, a .docx export from the meeting tool, a PDF: the bytes decide,
  // and a file that cannot be read says why.
  const { prepareDocument } = await import("./server/ai/documents");
  const transcript = await prepareDocument(
    new Uint8Array(await download.data.arrayBuffer()),
    (file.title as string | null) ?? (file.storage_path as string).split("/").pop() ?? "transcript",
    (file.content_type as string | null) ?? null,
    { title: "Meeting transcript" },
  );
  if (!transcript.block) {
    throw new Error(transcript.problem ?? "The uploaded transcript could not be read.");
  }

  const content: BetaContentBlockParam[] = [
    transcript.block,
    {
      type: "text",
      text: "Read this meeting transcript and return the JSON described in the system message. Ground every proposal in what was actually said.",
    },
  ];

  const { data: impl } = await db()
    .from("implementations")
    .select("deal_id")
    .eq("id", implementationId)
    .maybeSingle();

  const { runStructured, describeAiError } = await import("./server/ai/client");
  let analysis: TranscriptAnalysis;
  try {
    const result = await runStructured({
      kind: "transcript",
      schema: transcriptAnalysisSchema,
      system: [{ type: "text", text: SYSTEM_PROMPT }],
      content,
      maxTokens: 16000,
      dealId: (impl?.deal_id as string | null) ?? null,
    });
    analysis = result.data;
  } catch (e) {
    console.error("[transcript-analysis] the reading failed", e);
    throw new Error(`${describeAiError(e, "The transcript analysis")} Nothing has been changed.`);
  }
  if (!analysis.readable) {
    throw new Error(analysis.problem ?? "That file could not be read as a meeting transcript.");
  }

  return {
    attachmentTitle: (file.title as string | null) ?? null,
    analysis,
  };
}
