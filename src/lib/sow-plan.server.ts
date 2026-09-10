import type Anthropic from "@anthropic-ai/sdk";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { requireInternal } from "./presale.server";
import {
  catalogueForPrompt,
  normalizeProposal,
  sowPlanProposalSchema,
  type SowPlanProposal,
} from "./sow-plan";

/**
 * Read the deal's signed SOW and propose the services list.
 *
 * Read-only: nothing is written. The person applies the rows they accept
 * from the timeline panel, and the plan computes the dates from there.
 */

const BUCKET = "attachments";
const MODEL = "claude-opus-5";
const MAX_FILE_BYTES = 8_000_000;

const db = () => supabaseAdmin as any;

const SYSTEM_PROMPT = `You read a signed Statement of Work for GoCanvas, a mobile forms product, and return JSON only.

The implementation team runs every customer the same way: phase 1 is the first form, built with the customer in seven business days. Everything else the customer bought is a SERVICE from the catalogue below, assigned to a phase. Phase 1 services run alongside the form from the kickoff call. Phase 2 opens once the first form is proven in the field; phase 3 opens when phase 2 is live. Services in the same phase run at the same time.

Your job is the reading, not the calendar:
- List every purchased service as a row using ONLY the catalogue kinds. Use the name the SOW uses ("QuickBooks Online", "Invoice PDF", "Job Safety Analysis form"). One row per distinct thing: three additional forms are three paid_form rows with their names, not one row.
- The FIRST form is not a service — it is phase 1 itself. Put its name in first_form and do not list it as a paid_form row. Every additional form build is a paid_form row.
- Phases: paid_form, data_load and training rows are ALWAYS phase 1 — they run alongside the first form from the kickoff call, two or three forms at once is normal. integration, custom_pdf, analytics and other rows are phase 2 unless the SOW clearly sequences one after another purchased item, in which case phase 3.
- tier: integrations only, from the tiers below, by the complexity the SOW describes. weeks: only when the SOW states a duration for that item, else null. needs: only when the SOW names something the customer must provide for that item, else null.
- evidence: a short verbatim quote for each row when one exists. confidence: "stated" when the SOW says it plainly, "implied" when it is a reasonable reading, "uncertain" when thin.
- seats: the licensed user count when stated, else null.
- Never output calendar dates. Dates the SOW names go in notes as text; the plan computes its own.
- notes: exclusions, conditions, named dates, anything the SOW says that a services list cannot hold. gaps: what the SOW leaves unsaid that the plan needs (which system, how many forms, who owns the mapping).
- Never invent a service the SOW does not support. Fewer rows, well grounded, beats a full list.
- If the document is not a SOW, is empty or unreadable, set readable=false, explain in problem, and leave services empty.

${catalogueForPrompt()}

Return JSON exactly in this shape:
{"readable":true,"problem":null,"summary":"","first_form":null,"seats":null,"services":[{"kind":"integration","name":"","tier":3,"weeks":null,"phase":2,"needs":null,"evidence":null,"confidence":"stated"}],"notes":[],"gaps":[]}`;

function tryParse(raw: string): SowPlanProposal | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    console.error("[sow-plan] not json", cleaned.slice(0, 300));
    return null;
  }
  const parsed = sowPlanProposalSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[sow-plan] shape mismatch", JSON.stringify(parsed.error.issues).slice(0, 800));
    return null;
  }
  return parsed.data;
}

export async function proposePlanFromSow(
  userId: string,
  dealId: string,
): Promise<{ sowName: string | null; proposal: SowPlanProposal }> {
  await requireInternal(userId);

  const { data: deal } = await db()
    .from("portal_accounts")
    .select("id,sow_document_path,sow_document_name")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) throw new Error("Deal not found");
  if (!deal.sow_document_path) {
    throw new Error("Upload the signed SOW first — the plan is read from that document.");
  }
  if (!process.env["ANTHROPIC_API_KEY"]) {
    throw new Error("AI reading is not configured — set ANTHROPIC_API_KEY on the deployment.");
  }

  const download = await db()
    .storage.from(BUCKET)
    .download(deal.sow_document_path as string);
  if (download.error || !download.data) throw new Error("Could not open the attached SOW.");
  const bytes = new Uint8Array(await download.data.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("The attached SOW file is empty.");
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error("The attached SOW is too large to read here — under 8MB works.");
  }

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: Buffer.from(bytes).toString("base64"),
      },
    },
    {
      type: "text",
      text: "Read this Statement of Work and return the JSON described in the system message. Ground every row in the document.",
    },
  ];

  // Loaded here, not at module scope: the SDK is only worth parsing when a
  // SOW is actually being read.
  const { default: AnthropicSDK } = await import("@anthropic-ai/sdk");
  const client = new AnthropicSDK();
  const ask = async (): Promise<string> => {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      });
      if (response.stop_reason === "refusal") {
        throw new Error("The model declined to read this document.");
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
        throw new Error("AI reading is misconfigured: the ANTHROPIC_API_KEY was rejected.");
      }
      if (e instanceof AnthropicSDK.APIError) {
        console.error("[sow-plan] api error", e.status, e.message);
        throw new Error("Reading the SOW failed. Nothing has been changed.");
      }
      throw e;
    }
  };

  let proposal = tryParse(await ask());
  if (!proposal) proposal = tryParse(await ask());
  if (!proposal) throw new Error("The reading came back incomplete. Run it again.");
  proposal = normalizeProposal(proposal);
  if (!proposal.readable) {
    throw new Error(
      proposal.problem ??
        "The attached document could not be read as a Statement of Work — set the plan by hand.",
    );
  }

  const { audit } = await import("./server/audit");
  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "sow_plan.proposed",
    entity_type: "account",
    entity_id: dealId,
    payload: { services: proposal.services.length, seats: proposal.seats },
  });

  return { sowName: (deal.sow_document_name as string | null) ?? null, proposal };
}
