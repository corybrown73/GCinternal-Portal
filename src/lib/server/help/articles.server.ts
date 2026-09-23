import Anthropic from "@anthropic-ai/sdk";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { HelpArticle, HelpPick } from "@/lib/help-articles";
import {
  briefWords,
  buildHelpQuery,
  describeQuery,
  enforcePickRules,
  fallbackPicks,
  retrieveCandidates,
  type Candidate,
  type HelpQuery,
} from "@/lib/help-query";
import type { IntakeAnswers } from "@/lib/intake-answers";

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

const PICK_SYSTEM = `You choose GoCanvas help-centre articles for a customer who has just bought GoCanvas. You are given the QUERY the onboarding tool built from the deal (the flow, what phase 1 is, the integrations the SOW allows, and each feature with the sentence from the calls that named it), the CANDIDATE articles retrieved for each feature, and what the calls said.

Rules, in order:
1. Pick only from the candidates, by article_id. At most one article per feature. Three to five picks.
2. A feature the calls named (it has a quote) beats one the plan added. Within a feature, choose the article that teaches exactly what the quote describes: "upload a Google Sheet" beats "reference data overview" when the customer said Google Sheet.
3. Never pick an integration article unless the query lists that system as allowed. Never pick release notes, webinars or legacy-builder pages.
4. Prefer the article a person would read before the session that covers the feature: a how-to over a concept page, a setup page over a troubleshooting page.
5. Write "why" for each pick in one sentence addressed to the customer, quoting their own words where the quote gives them ("You said the parts list lives in a Google Sheet"). Under 30 words. Never invent a quote.

Reply with exactly one JSON object and nothing else: {"picks":[{"article_id":"...","why":"..."}]}`;

/**
 * Three to five articles for this customer, from a query built out of what
 * the tool already knows. The query names the features with their evidence
 * and the rules (the flow, the SOW's integrations); retrieval narrows the
 * library to a few candidates per feature under those rules; the model
 * chooses and writes why; the rules are enforced again on what it returns.
 * With no model, the best candidate per feature stands.
 */
export async function pickHelpArticles(args: {
  intake: IntakeAnswers;
  brief: unknown;
  notesText: string;
  articles?: HelpArticle[];
}): Promise<{ picks: HelpPick[]; query: HelpQuery }> {
  const articles = args.articles ?? (await loadHelpArticles());
  const query = buildHelpQuery({
    intake: args.intake,
    brief: args.brief,
    notesText: args.notesText,
  });
  const candidates = retrieveCandidates(query, articles, 4);
  if (candidates.length === 0) return { picks: [], query };
  if (!process.env["ANTHROPIC_API_KEY"]) return { picks: fallbackPicks(query, candidates), query };
  try {
    const client = new Anthropic();
    const byFeature = new Map<string, Candidate[]>();
    for (const c of candidates) byFeature.set(c.feature, [...(byFeature.get(c.feature) ?? []), c]);
    const list = [...byFeature.entries()]
      .map(
        ([feature, cs]) =>
          `${feature}:\n${cs.map((c) => `  - ${c.article_id} · ${c.title} (${c.category})`).join("\n")}`,
      )
      .join("\n");
    // The query already carries the evidence sentence for every feature;
    // the calls are here for tone, not for a second reading.
    const said = `${args.notesText}\n\n${briefWords(args.brief)}`.slice(0, 8000);
    const response = await client.messages.create({
      // The articles land on the customer's page under their own words:
      // the stronger reader, with room to think, picks them.
      model: "claude-opus-5",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: PICK_SYSTEM,
      messages: [
        {
          role: "user",
          content: `QUERY\n${describeQuery(query)}\n\nCANDIDATES\n${list}\n\nWHAT THE CALLS SAID\n${said}`,
        },
      ],
    });
    if (response.stop_reason === "refusal")
      return { picks: fallbackPicks(query, candidates), query };
    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { picks?: Array<{ article_id?: unknown; why?: unknown }> };
    const chosen = (parsed.picks ?? [])
      .filter((p) => typeof p.article_id === "string")
      .map((p) => ({
        article_id: String(p.article_id),
        why: typeof p.why === "string" ? p.why : undefined,
      }));
    const picks = enforcePickRules(chosen, query, candidates);
    return { picks: picks.length >= 2 ? picks : fallbackPicks(query, candidates), query };
  } catch (e) {
    console.error("[help] the picker fell back to the ranked candidates", e);
    return { picks: fallbackPicks(query, candidates), query };
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
