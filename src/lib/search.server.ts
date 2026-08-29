import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isFlagOn } from "./app-config.server";
import { createMasker } from "./demo-mode";
import { type SavedView, type SavedViewSurface, type SaveViewInput } from "./saved-view-input";

const db = () => supabaseAdmin as any;

/**
 * Global search and saved views. See docs/design/hygiene.md §5.
 *
 * Search is deliberately NOT ranked and NOT fuzzy. A relevance score across six
 * unrelated tables is a number that stands in for judgement, which this project
 * refuses everywhere else; grouping by kind and showing the count per group
 * lets the reader do the ranking with information the ranker does not have.
 */

export type SearchGroupId =
  "customers" | "implementations" | "deals" | "tickets" | "solutions" | "people";

export type SearchHit = {
  id: string;
  title: string;
  /** One line of context — never a snippet with the query highlighted, which
   * implies a full-text index this does not have. */
  detail: string | null;
  /** Route + params the UI turns into a Link. Kept as data so the server never
   * builds a URL string the router might disagree with. */
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
};

export type SearchGroup = {
  id: SearchGroupId;
  label: string;
  hits: SearchHit[];
  /** True when the cap was hit, so the UI can say "narrow it down" honestly. */
  capped: boolean;
};

export type SearchResult = {
  /** False when global_search is off — the page explains rather than errors. */
  enabled: boolean;
  query: string;
  groups: SearchGroup[];
  total: number;
};

const PER_GROUP = 8;

/**
 * PostgREST `ilike` takes the pattern verbatim, so `%` and `_` in user input
 * would silently widen the match. Escaped here rather than stripped, because a
 * customer genuinely called "100% Glass" should be findable by its name.
 */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function globalSearch(rawQuery: string): Promise<SearchResult> {
  const query = rawQuery.trim();
  if (!(await isFlagOn("global_search"))) {
    return { enabled: false, query, groups: [], total: 0 };
  }
  if (query.length < 2) return { enabled: true, query, groups: [], total: 0 };

  const pattern = likePattern(query);
  const demo = createMasker(await isFlagOn("demo_mode"));
  const cap = PER_GROUP + 1;

  const [customers, impls, deals, tickets, solutions, people] = await Promise.all([
    db().from("customers").select("id,name,segment,industry").ilike("name", pattern).limit(cap),
    db()
      .from("implementations")
      .select("id,name,customer_id,current_stage")
      .ilike("name", pattern)
      .limit(cap),
    db().from("portal_accounts").select("id,name,stage").ilike("name", pattern).limit(cap),
    db().from("tickets").select("id,subject,status,priority").ilike("subject", pattern).limit(cap),
    db()
      .from("technical_solutions")
      .select("id,title,status,implementation_id")
      .ilike("title", pattern)
      .limit(cap),
    // The `people` view from 0025 — one row per person across the identity and
    // directory tables, so this does not have to join them by hand for the
    // fourth time in this codebase.
    db().from("people").select("team_member_id,profile_id,name,email,auth_role").limit(cap),
  ]);

  // The view has no index to ilike against and is small, so it is filtered in
  // memory rather than pushed down. Said out loud because it is the one group
  // here that would not scale.
  const needle = query.toLowerCase();
  const peopleRows = (people.data ?? []).filter(
    (p: any) =>
      String(p.name ?? "")
        .toLowerCase()
        .includes(needle) ||
      String(p.email ?? "")
        .toLowerCase()
        .includes(needle),
  );

  const customerName = new Map<string, string>();
  for (const c of customers.data ?? []) customerName.set(c.id, c.name);

  const group = (
    id: SearchGroupId,
    label: string,
    rows: any[],
    map: (row: any) => SearchHit,
  ): SearchGroup => ({
    id,
    label,
    hits: rows.slice(0, PER_GROUP).map(map),
    capped: rows.length > PER_GROUP,
  });

  const groups: SearchGroup[] = [
    group("customers", "Customers", customers.data ?? [], (c) => ({
      id: c.id,
      title: demo.org(c.name, c.id),
      detail: [c.segment, c.industry].filter(Boolean).join(" · ") || null,
      to: "/customers/$customerId",
      params: { customerId: c.id },
    })),
    group("implementations", "Implementations", impls.data ?? [], (i) => ({
      id: i.id,
      title: i.name,
      detail: i.current_stage ? `Stage: ${i.current_stage}` : null,
      to: "/customers/$customerId",
      params: { customerId: i.customer_id },
      search: { impl: i.id },
    })),
    group("deals", "Deals", deals.data ?? [], (d) => ({
      id: d.id,
      title: demo.org(d.name, d.id),
      detail: d.stage ? `Stage: ${d.stage}` : null,
      to: "/deals/$dealId",
      params: { dealId: d.id },
    })),
    group("tickets", "Tickets", tickets.data ?? [], (t) => ({
      id: t.id,
      title: t.subject,
      detail: [t.status, t.priority].filter(Boolean).join(" · ") || null,
      to: "/tickets/$ticketId",
      params: { ticketId: t.id },
    })),
    group("solutions", "Technical solutions", solutions.data ?? [], (s) => ({
      id: s.id,
      title: s.title,
      detail: s.status ?? null,
      to: "/technical-solutions/$id",
      params: { id: s.id },
    })),
    // People are internal staff, so they are NOT masked by demo mode — they are
    // the demo. Their route is the admin user list, which only a super admin can
    // open; the hit itself carries no more than the sidebar already shows.
    group("people", "People", peopleRows, (p) => ({
      id: p.profile_id ?? p.team_member_id,
      title: p.name ?? p.email ?? "Unnamed",
      detail: [p.email, p.auth_role].filter(Boolean).join(" · ") || null,
      to: "/admin/users",
    })),
  ].filter((g) => g.hits.length > 0);

  return {
    enabled: true,
    query,
    groups,
    total: groups.reduce((n, g) => n + g.hits.length, 0),
  };
}

/* ------------------------------------------------------------------------- */
/* Saved views                                                               */
/* ------------------------------------------------------------------------- */

function toSavedView(row: any, profileId: string): SavedView {
  return {
    id: row.id,
    surface: row.surface as SavedViewSurface,
    name: row.name,
    query: (row.query ?? {}) as Record<string, string | number | boolean>,
    shared: !!row.shared,
    owner_profile_id: row.owner_profile_id,
    mine: row.owner_profile_id === profileId,
  };
}

export async function listSavedViews(
  profileId: string,
  surface: SavedViewSurface,
): Promise<{ enabled: boolean; views: SavedView[] }> {
  if (!(await isFlagOn("saved_views"))) return { enabled: false, views: [] };

  // Authorization in app code, not RLS: every app read runs on the service-role
  // client and bypasses the policy 0025 added.
  const { data } = await db()
    .from("saved_views")
    .select("*")
    .eq("surface", surface)
    .or(`shared.eq.true,owner_profile_id.eq.${profileId}`)
    .order("name");
  return { enabled: true, views: (data ?? []).map((r: any) => toSavedView(r, profileId)) };
}

export async function saveView(profileId: string, input: SaveViewInput): Promise<SavedView> {
  if (!(await isFlagOn("saved_views"))) throw new Error("Saved views are not enabled.");

  // Upsert by (owner, surface, name) so re-saving a view under the same name
  // updates it instead of erroring on the unique index — which is what a person
  // pressing "Save" a second time means.
  const { data, error } = await db()
    .from("saved_views")
    .upsert(
      {
        owner_profile_id: profileId,
        surface: input.surface,
        name: input.name,
        query: input.query,
        shared: input.shared,
      },
      { onConflict: "owner_profile_id,surface,name" },
    )
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save the view");
  return toSavedView(data, profileId);
}

export async function deleteSavedView(profileId: string, id: string): Promise<{ ok: true }> {
  // Ownership is re-checked in the delete predicate rather than read-then-write:
  // a shared view is visible to everyone, and "visible" must not become
  // "deletable".
  const { error } = await db()
    .from("saved_views")
    .delete()
    .eq("id", id)
    .eq("owner_profile_id", profileId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
