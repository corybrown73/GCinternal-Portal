import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { NO_HIDDEN, sanitizeHidden, type NavVisibility } from "./nav-visibility";

/**
 * Persistence for which nav sections are switched off: one row in
 * `portal_app_config`, keyed `nav_visibility`, the same place the feature
 * flags and the branding live. No migration — the table is key/value JSON and
 * exists for exactly this.
 *
 * No cache. The sidebar reads this through a query with a long staleTime on
 * the client, and the admin screen invalidates that on save; a server-side
 * cache would only add a second place for the value to be stale.
 */

const KEY = "nav_visibility";
const db = () => supabaseAdmin as any;

export async function loadNavVisibility(): Promise<NavVisibility> {
  try {
    const { data } = await db()
      .from("portal_app_config")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    return { hidden: sanitizeHidden((data?.value as { hidden?: unknown } | null)?.hidden) };
  } catch (e) {
    // The sidebar renders on every page; a config read failure must never be
    // the reason a page fails to paint. Everything visible is the safe default.
    console.error("[nav-visibility] could not read; showing everything", e);
    return NO_HIDDEN;
  }
}

export async function saveNavVisibility(hidden: string[]): Promise<NavVisibility> {
  const value = { hidden: sanitizeHidden(hidden) };
  const { data: existing } = await db()
    .from("portal_app_config")
    .select("key")
    .eq("key", KEY)
    .maybeSingle();
  const { error } = existing
    ? await db()
        .from("portal_app_config")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("key", KEY)
    : await db().from("portal_app_config").insert({ key: KEY, value });
  if (error) throw new Error(`Could not save the navigation: ${error.message}`);
  return value;
}
