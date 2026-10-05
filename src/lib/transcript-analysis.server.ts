// TYPE-only: erased at compile time, so importing it costs nothing at runtime.
// The SDK itself is ~578 kB and is pulled in dynamically at the one call site
// below, the same way sow-analysis.server.ts does it — this module is reached
// from hub.functions.ts, which is loaded on essentially every request.
import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { transcriptAnalysisSchema, type TranscriptAnalysis } from "./transcript-analysis";

const ATTACHMENT_BUCKET = "attachments";
const MODEL = "claude-opus-5";

/** How much of a text transcript we hand to the model — POC scale. */
const MAX_TEXT_CHARS = 120_000;
/** ~8 MB of PDF; larger files are rejected with a clear message. */
const MAX_FILE_BYTES = 8_000_000;

const db = () => supabaseAdmin as any;

export type TranscriptAnalysisResult = {
  attachmentTitle: string | null;
  analysis: TranscriptAnalysis;
};

function extensionOf(name: string) {
  const m = /\.([A-Za-z0-9]+)$/.exec(name.trim());
  return m ? m[1]!.toLowerCase() : "";
}

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

/** Build the user message content from the stored file, by type. */
async function transcriptContent(
  bytes: Uint8Array,
  fileName: string,
): Promise<Anthropic.ContentBlockParam[]> {
  const ext = extensionOf(fileName);
  const instruction: Anthropic.TextBlockParam = {
    type: "text",
    text: "Read this meeting transcript and return the JSON described in the system message. Ground every proposal in what was actually said.",
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

  if (["txt", "md", "markdown", "csv", "json", "html", "vtt", "srt"].includes(ext) || ext === "") {
    const text = new TextDecoder().decode(bytes).slice(0, MAX_TEXT_CHARS).trim();
    if (text.length < 40) {
      throw new Error(
        "The uploaded transcript looks empty — there is no readable text to analyse.",
      );
    }
    return [{ type: "text", text }, instruction];
  }

  throw new Error(
    `The uploaded transcript is a .${ext} file, which this preview cannot read. Attach it as a PDF or a text file (.txt, .vtt, .srt) and try again.`,
  );
}

function tryParseAnalysis(raw: string): TranscriptAnalysis | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    console.error("[transcript-analysis] not json", cleaned.slice(0, 300));
    return null;
  }
  const parsed = transcriptAnalysisSchema.safeParse(json);
  if (!parsed.success) {
    console.error(
      "[transcript-analysis] shape mismatch",
      JSON.stringify(parsed.error.issues).slice(0, 800),
    );
    return null;
  }
  return parsed.data;
}

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
    .select("id,title,storage_path,implementation_id")
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
  const bytes = new Uint8Array(await download.data.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error("The uploaded transcript file is empty.");
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error("That transcript is too large for this preview to analyse.");
  }

  if (!process.env["ANTHROPIC_API_KEY"]) {
    throw new Error("AI analysis is not configured — set ANTHROPIC_API_KEY on the deployment.");
  }

  const content = await transcriptContent(bytes, (file.title as string | null) ?? "transcript");

  // Loaded here, not at module scope: by this point the request really is a
  // transcript analysis, so paying for the SDK is warranted.
  const { default: AnthropicSDK } = await import("@anthropic-ai/sdk");
  const client = new AnthropicSDK();
  const requestAnalysis = async (): Promise<string> => {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      });
      if (response.stop_reason === "refusal") {
        throw new Error("The model declined to analyse this transcript.");
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
        console.error("[transcript-analysis] api error", e.status, e.message);
        throw new Error("The transcript analysis failed. Nothing has been changed.");
      }
      throw e;
    }
  };

  let analysis = tryParseAnalysis(await requestAnalysis());
  if (!analysis) {
    // One clean retry for an occasional near-miss shape, rather than handing
    // the user a failure only fixable by clicking the same button again.
    analysis = tryParseAnalysis(await requestAnalysis());
  }
  if (!analysis) {
    throw new Error("The analysis came back incomplete. Run it again.");
  }
  if (!analysis.readable) {
    throw new Error(analysis.problem ?? "That file could not be read as a meeting transcript.");
  }

  return {
    attachmentTitle: (file.title as string | null) ?? null,
    analysis,
  };
}
