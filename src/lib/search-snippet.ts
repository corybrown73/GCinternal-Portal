/**
 * The line of a document that explains why it matched.
 *
 * WHY THIS EXISTS NOW. Search covered names, subjects and titles — which is
 * precisely where handoff context is NOT. The reason a customer bought, the
 * objection raised on the third call, the constraint somebody mentioned in
 * passing: all of it lives in note and report BODIES, and none of it was
 * findable.
 *
 * Once bodies are searchable, a result list of note dates is useless — every
 * hit looks identical and none says why it is there. So a hit carries the text
 * around its match.
 *
 * A NOTE ON THE RULE THIS BENDS. search.server.ts says `detail` is "never a
 * snippet with the query highlighted, which implies a full-text index this does
 * not have". The objection was to implying RANKING — that some engine judged
 * relevance. This does not: it finds the first literal occurrence, the same
 * substring the query itself matched, and shows its surroundings. Nothing is
 * scored, nothing is highlighted, and the order is still the order the database
 * returned. What the reader gets is evidence, not a verdict.
 *
 * Pure — no imports — so it is testable without a database.
 */

const WINDOW = 90;

/** A single line of plain text around the first match, or null if absent. */
export function snippet(body: string | null | undefined, query: string): string | null {
  if (!body || !query) return null;
  // Markdown collapses to one line: a snippet that keeps its newlines and
  // hashes reads as broken rather than as an excerpt.
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return null;

  const at = flat.toLowerCase().indexOf(query.trim().toLowerCase());
  if (at === -1) return null;

  const start = Math.max(0, at - Math.floor(WINDOW / 3));
  const end = Math.min(flat.length, start + WINDOW);
  // Avoid cutting mid-word at either edge, which reads as a typo rather than
  // as a trim.
  const from = start === 0 ? 0 : flat.indexOf(" ", start) + 1 || start;
  const to = end === flat.length ? end : flat.lastIndexOf(" ", end);

  const text = flat.slice(from, to > from ? to : end).trim();
  if (!text) return null;
  return `${from > 0 ? "…" : ""}${text}${to < flat.length ? "…" : ""}`;
}
