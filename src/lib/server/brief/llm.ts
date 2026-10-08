import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";

import { briefJsonSchema, type BriefJson } from "../schemas";
import { aiConfigured } from "../ai/config";
import { AiParseError, AiRefusedError, runStructured } from "../ai/client";
import type { PreparedDocument } from "../ai/documents";
import { BRIEF_SYSTEM_PROMPT, buildBriefUserPrompt, SOW_ATTACHED_NOTE } from "./prompt";
import type { Account, GongReport, OnboardingNote } from "../../presale-types";

export function llmAvailable(): boolean {
  return aiConfigured();
}

/**
 * The model reads the calls and writes the brief as JSON, validated
 * against the shared zod schema. Returns null on refusal or when the reply
 * and its repair both fail to parse — the caller falls back to the template
 * generator so brief generation never hard-fails. An API error (bad key,
 * 400, 429) is thrown so the caller can record and show it.
 */
export async function generateBriefWithLLM(
  account: Account,
  reports: GongReport[],
  notes: OnboardingNote[],
  /** The signed SOW, when one is on file and readable: read with the calls, not after them. */
  sow?: PreparedDocument | null,
): Promise<BriefJson | null> {
  const calls = buildBriefUserPrompt(account, reports, notes);
  const content: BetaContentBlockParam[] = sow?.block
    ? [sow.block, { type: "text", text: `${SOW_ATTACHED_NOTE}\n\n${calls}` }]
    : [{ type: "text", text: calls }];

  try {
    const result = await runStructured({
      kind: "brief",
      schema: briefJsonSchema,
      system: [{ type: "text", text: BRIEF_SYSTEM_PROMPT }],
      content,
      // The brief's grammar has been too large to compile before; the text
      // path with the schema in the prompt is the known-good road.
      fallbackToText: true,
      // Reading a seat count, a named owner and what each workflow replaces
      // out of unstructured call notes — while holding the line on "say
      // null" — is exactly the kind of work adaptive thinking is for.
      maxTokens: 32000,
      dealId: account.id,
    });
    return result.data;
  } catch (e) {
    if (e instanceof AiRefusedError || e instanceof AiParseError) return null;
    throw e;
  }
}
