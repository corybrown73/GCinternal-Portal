import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { briefJsonSchema, type BriefJson } from "../schemas";
import { BRIEF_SYSTEM_PROMPT, buildBriefUserPrompt } from "./prompt";
import type { Account, GongReport, OnboardingNote } from "../types";

export function llmAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Claude Opus 5 with structured output validated against the shared zod schema.
// Returns null on refusal or repeated parse failure — the caller falls back to
// the template generator so brief generation never hard-fails.
export async function generateBriefWithLLM(
  account: Account,
  reports: GongReport[],
  notes: OnboardingNote[]
): Promise<BriefJson | null> {
  const client = new Anthropic();
  const userPrompt = buildBriefUserPrompt(account, reports, notes);

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: BRIEF_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      output_config: { format: zodOutputFormat(briefJsonSchema) },
    });

    if (response.stop_reason === "refusal") return null;
    if (response.parsed_output) return response.parsed_output;
  }
  return null;
}
