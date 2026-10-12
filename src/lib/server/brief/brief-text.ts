import { z as z4 } from "zod/v4";

import { briefJsonSchema, type BriefJson } from "../schemas";
import { extractJsonObject } from "../ai/json";

export { extractJsonObject };

/**
 * The brief as text that holds one JSON object: the shape the text path
 * sends when the API cannot compile the brief's schema into a grammar.
 *
 * WHY TEXT AND NOT A GRAMMAR. The brief's shape — two nested objects, a dozen
 * arrays of small records — has been too large for the API to compile into a
 * constrained-decoding grammar ("The compiled grammar is too large"). The
 * shared client tries the grammar first and falls back to asking for JSON in
 * prose with this schema in the prompt, validated with the same zod schema,
 * so nothing malformed reaches the deck either way.
 */

/** The shape, as JSON Schema text, for the system prompt. Computed once. */
export const BRIEF_SHAPE_JSON = JSON.stringify(z4.toJSONSchema(briefJsonSchema));

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
