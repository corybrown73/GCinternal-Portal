import Anthropic from "@anthropic-ai/sdk";

import type { BriefJson } from "../schemas";
import { BRIEF_SHAPE_JSON, parseBriefText } from "./brief-text";
import { BRIEF_SYSTEM_PROMPT, buildBriefUserPrompt, SOW_ATTACHED_NOTE } from "./prompt";
import type { Account, GongReport, OnboardingNote } from "../../presale-types";

export function llmAvailable(): boolean {
  return Boolean(process.env["ANTHROPIC_API_KEY"]);
}

const OUTPUT_RULES = `

Output: reply with exactly one JSON object and nothing else — no preamble, no code fence. It must match this JSON Schema (every listed property present; use null or [] where the notes do not say):
`;

/**
 * Claude Opus 5 reads the calls and writes the brief as JSON, validated
 * against the shared zod schema. Returns null on refusal or when two tries
 * both fail to parse — the caller falls back to the template generator so
 * brief generation never hard-fails. An API error (bad key, 400, 429) is
 * thrown so the caller can record and show it.
 */
export async function generateBriefWithLLM(
  account: Account,
  reports: GongReport[],
  notes: OnboardingNote[],
  /** The signed SOW, when one is on file: read with the calls, not after them. */
  sowPdf?: Uint8Array | null,
): Promise<BriefJson | null> {
  const client = new Anthropic();
  const system = `${BRIEF_SYSTEM_PROMPT}${OUTPUT_RULES}${BRIEF_SHAPE_JSON}`;
  const calls = buildBriefUserPrompt(account, reports, notes);
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: sowPdf
        ? [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: Buffer.from(sowPdf).toString("base64"),
              },
              title: "Signed Statement of Work",
            },
            { type: "text", text: `${SOW_ATTACHED_NOTE}\n\n${calls}` },
          ]
        : calls,
    },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: "claude-opus-5",
      // Non-streaming: the SDK refuses a ceiling it thinks could outlast ten
      // minutes, and the route itself stops at five. 16k is ample.
      max_tokens: 16000,
      // Reading a seat count, a named owner and what each workflow replaces out
      // of unstructured call notes — while holding the line on "say null" — is
      // exactly the kind of work adaptive thinking is for.
      thinking: { type: "adaptive" },
      system,
      messages,
    });
    if (response.stop_reason === "refusal") return null;

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const parsed = parseBriefText(text);
    if (parsed.ok) return parsed.data;

    // Second try: hand the reply back with what was wrong with it. A normal
    // user turn, not a prefill.
    messages.push(
      { role: "assistant", content: response.content },
      {
        role: "user",
        content: `That reply could not be used: ${parsed.error}. Reply again with exactly one JSON object matching the schema, and nothing else.`,
      },
    );
  }
  return null;
}
