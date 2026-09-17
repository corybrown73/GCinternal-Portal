import { z as z4 } from "zod/v4";

import { briefJsonSchema, type BriefJson } from "../schemas";

/**
 * The brief comes back from the model as text that holds one JSON object.
 *
 * WHY TEXT AND NOT A GRAMMAR. The brief's shape — two nested objects, a dozen
 * arrays of small records — is too large for the API to compile into a
 * constrained-decoding grammar: every request was rejected with a 400
 * ("The compiled grammar is too large") and the tool fell back to the
 * template brief without saying so. Asking for JSON in prose and validating
 * it with the same zod schema keeps the guarantee that matters (nothing
 * malformed reaches the deck) without the size limit.
 */

/** The shape, as JSON Schema text, for the system prompt. Computed once. */
export const BRIEF_SHAPE_JSON = JSON.stringify(z4.toJSONSchema(briefJsonSchema));

/**
 * Pull the one JSON object out of a reply that may wrap it in a code fence or
 * a sentence of preamble. Returns null when there is no object to find.
 */
export function extractJsonObject(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return body.slice(start, end + 1);
}

export type BriefParse = { ok: true; data: BriefJson } | { ok: false; error: string };

export function parseBriefText(text: string): BriefParse {
  const raw = extractJsonObject(text);
  if (!raw) return { ok: false, error: "The reply held no JSON object." };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const checked = briefJsonSchema.safeParse(value);
  if (checked.success) return { ok: true, data: checked.data };
  const issues = checked.error.issues
    .slice(0, 12)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, error: `Did not match the brief's shape — ${issues}` };
}
