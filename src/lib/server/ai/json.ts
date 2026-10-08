/**
 * The one JSON object in a model's text reply, wherever it sits. A model
 * that reasons first sometimes writes a sentence before the object, wraps
 * it in a code fence, or adds a line after the closing brace; a reading
 * that is right must not be thrown away for the words around it.
 *
 * Fence first, then the outermost braces. Null when there is no object.
 */
export function extractJsonObject(raw: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const body = (fenced?.[1] ?? raw).trim();
  if (body.startsWith("{") && body.endsWith("}")) return body;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return body.slice(start, end + 1);
}
