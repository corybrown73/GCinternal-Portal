import Anthropic from "@anthropic-ai/sdk";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { rankArticles, type HelpArticle, type HelpPick } from "@/lib/help-articles";

import { audit } from "../audit";
import { KB_INDEX, type SeedArticle } from "./kb-index";

const db = () => supabaseAdmin as any;

/** The public help centre's article feed. No key: it is the same page a customer reads. */
const HELP_API = "https://help.gocanvas.com/api/v2/help_center/en-us/articles.json?per_page=100";

function fromSeed(): SeedArticle[] {
  return KB_INDEX;
}

/**
 * The library, from the table. An empty table seeds itself from the index
 * the help bot shipped with (630 articles), so the picker works on a fresh
 * deployment before anyone has pressed Sync.
 */
export async function loadHelpArticles(): Promise<HelpArticle[]> {
  const { data } = await db()
    .from("portal_help_articles")
    .select("article_id,title,category,tags,url")
    .eq("active", true);
  const rows = (data ?? []) as HelpArticle[];
  if (rows.length > 0) return rows;
  await upsertArticles(fromSeed());
  return fromSeed().map(({ article_id, title, category, tags, url }) => ({
    article_id,
    title,
    category,
    tags,
    url,
  }));
}

async function upsertArticles(rows: SeedArticle[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => ({
      article_id: r.article_id,
      title: r.title,
      category: r.category || "General",
      tags: r.tags ?? [],
      url: r.url,
      last_updated: r.last_updated,
      active: true,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await db()
      .from("portal_help_articles")
      .upsert(chunk, { onConflict: "article_id" });
    if (error) throw new Error(`Could not save the help articles: ${error.message}`);
    n += chunk.length;
  }
  return n;
}

export type HelpSyncResult = {
  count: number;
  source: "help_center" | "bundled_index";
  note: string | null;
};

/**
 * Refresh the library from the help centre. Pages through the public
 * feed; when it cannot be reached, the bundled index stands in and the
 * result says so. A manager presses this under Settings.
 */
export async function syncHelpArticles(actorId: string | null): Promise<HelpSyncResult> {
  const rows: SeedArticle[] = [];
  let note: string | null = null;
  try {
    let url: string | null = HELP_API;
    let pages = 0;
    while (url && pages < 20) {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`help centre answered ${res.status}`);
      const body = (await res.json()) as {
        articles?: Array<{
          id: number | string;
          title: string;
          html_url: string;
          label_names?: string[];
          section_id?: number | string;
          updated_at?: string;
          draft?: boolean;
        }>;
        next_page?: string | null;
      };
      for (const a of body.articles ?? []) {
        if (a.draft) continue;
        rows.push({
          article_id: String(a.id),
          title: a.title,
          category: "General",
          tags: (a.label_names ?? []).map((t) => t.toLowerCase()),
          url: a.html_url,
          last_updated: a.updated_at ?? null,
        });
      }
      url = body.next_page ?? null;
      pages += 1;
    }
    // The feed carries no category names; the bundled index does. Keep
    // the category we know for an article we have seen before.
    const known = new Map(fromSeed().map((s) => [s.article_id, s]));
    for (const r of rows) {
      const k = known.get(r.article_id);
      if (k) {
        r.category = k.category;
        if (!r.tags.length) r.tags = k.tags;
      }
    }
  } catch (e) {
    note = `The help centre could not be reached (${e instanceof Error ? e.message : String(e)}); the bundled index was used instead.`;
    rows.length = 0;
    rows.push(...fromSeed());
  }
  const count = await upsertArticles(rows);
  await audit({
    actor_type: actorId ? "user" : "system",
    actor_id: actorId,
    action: "help_articles.synced",
    entity_type: "app",
    payload: { count, source: note ? "bundled_index" : "help_center" },
  });
  return { count, source: note ? "bundled_index" : "help_center", note };
}

export async function helpArticleStatus(): Promise<{ count: number; syncedAt: string | null }> {
  const { count } = await db()
    .from("portal_help_articles")
    .select("article_id", { count: "exact", head: true })
    .eq("active", true);
  const { data } = await db()
    .from("portal_help_articles")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { count: count ?? 0, syncedAt: (data?.synced_at as string | null) ?? null };
}

/* ------------------------------------------------------------ the picks */

/** What the calls said, flattened, for the ranker and the model. */
export function briefText(brief: unknown, notesText: string): string {
  const b = (brief ?? {}) as Record<string, unknown>;
  const parts: string[] = [notesText];
  const push = (v: unknown) => {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(push);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(push);
  };
  for (const k of [
    "goals",
    "what_we_know",
    "current_process",
    "process_gaps",
    "kickoff",
    "one_liner",
  ])
    push(b[k]);
  return parts.join("\n");
}

const PICK_SYSTEM = `You choose GoCanvas help-centre articles for a customer who has just bought GoCanvas, from the transcript of their sales calls and a list of candidate articles.

Pick 3 to 5 articles the customer said, or clearly implied, would make the difference for them: a feature they asked about, a problem they described that the article solves, a thing they will do in their first two weeks. Skip release notes, webinars and anything about the legacy builder. Prefer one article per feature.

For each pick, write "why" as one sentence in the customer's own words where the transcript gives them (quote a phrase if there is one), addressed to the customer: "You said ...", "You asked about ...". Under 30 words.

Reply with exactly one JSON object and nothing else: {"picks":[{"article_id":"...","why":"..."}]}. Use only article_id values from the candidate list.`;

/**
 * Three to five articles for this customer. The ranker narrows the library
 * to candidates that share words with the calls; the model chooses among
 * them and says why in the customer's words. With no model, or on a
 * failure, the top-ranked candidates stand with a plain "why".
 */
export async function pickHelpArticles(args: {
  brief: unknown;
  notesText: string;
  articles?: HelpArticle[];
}): Promise<HelpPick[]> {
  const articles = args.articles ?? (await loadHelpArticles());
  const text = briefText(args.brief, args.notesText);
  const candidates = rankArticles(text, articles, 40);
  if (candidates.length === 0) return [];
  const fallback = (): HelpPick[] =>
    candidates.slice(0, 4).map((a) => ({
      article_id: a.article_id,
      title: a.title,
      url: a.url,
      why: `${a.category}: something the calls touched on.`,
      source: "ai" as const,
    }));
  if (!process.env["ANTHROPIC_API_KEY"]) return fallback();
  try {
    const client = new Anthropic();
    const list = candidates.map((a) => `- ${a.article_id} · ${a.title} (${a.category})`).join("\n");
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1200,
      system: PICK_SYSTEM,
      messages: [
        {
          role: "user",
          content: `CANDIDATE ARTICLES\n${list}\n\nWHAT THE CALLS SAID\n${text.slice(0, 24000)}`,
        },
      ],
    });
    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { picks?: Array<{ article_id?: unknown; why?: unknown }> };
    const byId = new Map(candidates.map((a) => [a.article_id, a]));
    const picks: HelpPick[] = [];
    for (const p of parsed.picks ?? []) {
      const a = typeof p.article_id === "string" ? byId.get(p.article_id) : undefined;
      if (!a || picks.some((x) => x.article_id === a.article_id)) continue;
      picks.push({
        article_id: a.article_id,
        title: a.title,
        url: a.url,
        why: typeof p.why === "string" && p.why.trim() ? p.why.trim().slice(0, 240) : "",
        source: "ai",
      });
      if (picks.length === 5) break;
    }
    return picks.length >= 2 ? picks : fallback();
  } catch (e) {
    console.error("[help] the picker fell back to the ranked list", e);
    return fallback();
  }
}

/* ----------------------------------------------------------- the clicks */

/** First open per article, for the deal's page. Article id → ISO timestamp. */
export async function helpOpensFor(accountId: string): Promise<Record<string, string>> {
  const { data } = await db()
    .from("portal_help_clicks")
    .select("article_id,clicked_at")
    .eq("account_id", accountId)
    .order("clicked_at", { ascending: true });
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as Array<{ article_id: string; clicked_at: string }>) {
    if (!out[r.article_id]) out[r.article_id] = r.clicked_at;
  }
  return out;
}

export async function recordHelpClick(accountId: string, articleId: string): Promise<void> {
  const { error } = await db()
    .from("portal_help_clicks")
    .insert({ account_id: accountId, article_id: articleId });
  if (error) console.error("[help] could not record the click", error.message);
}
