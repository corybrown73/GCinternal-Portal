/**
 * Help articles on the customer's page. Client-safe.
 *
 * After the brief is written, the features the calls flagged as valuable
 * are matched to GoCanvas help centre articles, and the customer's page
 * shows them under "Get started on your own", each with why it is there in
 * the customer's own words. Every open goes through /go on our domain so
 * the deal can show what they tried.
 */

export type HelpPick = {
  article_id: string;
  title: string;
  url: string;
  /** Why this one, in the customer's words from the calls. */
  why: string;
  /** "ai" when the picker chose it; "person" once somebody edited or added it. */
  source: "ai" | "person";
};

export type HelpArticle = {
  article_id: string;
  title: string;
  category: string;
  tags: string[];
  url: string;
};

/** The deck screen's key; hidden the usual way. */
export const HELP_SCREEN_KEY = "help";

const STOP = new Set(
  "the a an and or to of in on for with your you we our their it is are be as at by from this that these those how what when into via not no yes can will do does use using used new get set up out one two all any per about more than then them they".split(
    " ",
  ),
);

/** Words worth matching: lower-cased, three letters or more, not glue. */
export function keywords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length >= 3 && !STOP.has(w)) out.add(w);
  }
  return out;
}

/**
 * Rank the library against what the calls said. Title words count double;
 * a category or tag hit counts once. Release notes and legacy-builder pages
 * are pushed down: a customer starting out does not need either. The top
 * N become the picker's candidates, or the picks themselves when there is
 * no model to ask.
 */
export function rankArticles(text: string, articles: HelpArticle[], limit = 40): HelpArticle[] {
  const words = keywords(text);
  if (words.size === 0) return [];
  const scored = articles.map((a) => {
    let score = 0;
    for (const w of keywords(a.title)) if (words.has(w)) score += 2;
    for (const t of a.tags) if (words.has(t.toLowerCase())) score += 1;
    for (const w of keywords(a.category)) if (words.has(w)) score += 1;
    if (/release notes|webinar/i.test(a.title) || /^20\d\d$/.test(a.category)) score -= 6;
    if (/legacy/i.test(a.category) || /legacy/i.test(a.title)) score -= 3;
    return { a, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score || x.a.title.localeCompare(y.a.title))
    .slice(0, limit)
    .map((s) => s.a);
}
