import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { briefJsonSchema, type BriefJson } from "../schemas";
import { BRIEF_SYSTEM_PROMPT, buildBriefUserPrompt } from "./prompt";
import type { Account, GongReport, OnboardingNote } from "../../presale-types";

export function llmAvailable(): boolean {
  return Boolean(process.env["ANTHROPIC_API_KEY"]);
}

// Claude Opus 5 with structured output validated against the shared zod schema.
// Returns null on refusal or repeated parse failure — the caller falls back to
// the template generator so brief generation never hard-fails.
export async function generateBriefWithLLM(
  account: Account,
  reports: GongReport[],
  notes: OnboardingNote[],
): Promise<BriefJson | null> {
  const client = new Anthropic();
  const userPrompt = buildBriefUserPrompt(account, reports, notes);

  for (let attempt = 0; attempt < 2; attempt++) {
    // The SDK's zod helper is typed against zod v4; this project pins zod v3
    // for the hub code, so the format is cast and the output re-validated with
    // the same schema below — runtime safety is preserved either way.
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      // Reading a seat count, a named owner and what each workflow replaces out
      // of unstructured call notes — while holding the line on "say null" — is
      // exactly the kind of work adaptive thinking is for.
      thinking: { type: "adaptive" },
      system: BRIEF_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],

      output_config: { format: zodOutputFormat(briefJsonSchema as any) as any },
    });

    if (response.stop_reason === "refusal") return null;
    const checked = briefJsonSchema.safeParse(response.parsed_output);
    if (checked.success) return checked.data;
  }
  return null;
}
