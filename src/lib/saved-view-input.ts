import { z } from "zod";

/**
 * A saved view is a named set of SEARCH PARAMETERS for one surface —
 * deliberately not a saved result set, which would go stale silently.
 * Re-running the query is the point.
 *
 * A view is applied by writing its query into the URL, so it produces an
 * ordinary, shareable, bookmarkable URL and nothing about any existing
 * search-param contract changes.
 */
export const SAVED_VIEW_SURFACES = ["customers", "search", "pipeline", "tickets"] as const;
export type SavedViewSurface = (typeof SAVED_VIEW_SURFACES)[number];

/**
 * The query is stored as jsonb, so it has to be bounded at the edge: flat
 * string/number/boolean pairs only, capped in both key count and value length.
 * An unbounded jsonb blob written from the browser is a storage bill and an
 * injection surface for whatever reads it later.
 */
const queryValue = z.union([z.string().max(200), z.number(), z.boolean()]);

export const savedViewQuery = z
  .record(z.string().min(1).max(40), queryValue)
  .refine((q) => Object.keys(q).length <= 20, "A saved view can hold at most 20 parameters.");

export const saveViewInput = z.object({
  surface: z.enum(SAVED_VIEW_SURFACES),
  name: z.string().trim().min(1, "Name the view").max(60),
  query: savedViewQuery,
  shared: z.boolean().default(false),
});

export type SaveViewInput = z.infer<typeof saveViewInput>;

export type SavedView = {
  id: string;
  surface: SavedViewSurface;
  name: string;
  query: Record<string, string | number | boolean>;
  shared: boolean;
  owner_profile_id: string;
  /** True when the signed-in user owns it, so the UI knows what it may delete. */
  mine: boolean;
};

/**
 * Drop empty values before saving: a view that pins `status=""` filters on the
 * empty string on the surfaces that treat a present key as a filter.
 */
export function searchToView(
  search: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(search)) {
    if (v == null) continue;
    if (typeof v === "string") {
      if (v.trim() === "") continue;
      out[k] = v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}
