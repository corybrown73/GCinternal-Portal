import { useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { createSavedView, getSavedViews, removeSavedView } from "@/lib/search.functions";
import type { SavedViewSurface } from "@/lib/saved-view-input";
import { cn } from "@/lib/utils";

/**
 * Named, re-runnable search parameters for one surface.
 *
 * A saved view stores the QUERY, never the rows: a view that stored results
 * would go stale silently, and re-running it is the whole point. Applying one
 * writes its query into the URL, so the result is an ordinary, shareable,
 * bookmarkable link and nothing about the surface's search-param contract
 * changes.
 *
 * Renders nothing at all when the saved_views flag is off.
 */
export function SavedViews({
  surface,
  current,
  onApply,
}: {
  surface: SavedViewSurface;
  /** The parameters that would be saved if the user pressed Save now. */
  current: Record<string, string | number | boolean>;
  onApply: (query: Record<string, string | number | boolean>) => void;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(createSavedView);
  const remove = useServerFn(removeSavedView);

  const views = useQuery(
    queryOptions({
      queryKey: ["saved-views", surface],
      queryFn: () => getSavedViews({ data: { surface } }),
    }),
  );

  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [open, setOpen] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["saved-views", surface] });

  const saveMutation = useMutation({
    mutationFn: () => create({ data: { surface, name: name.trim(), query: current, shared } }),
    onSuccess: () => {
      invalidate();
      setName("");
      setOpen(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: invalidate,
  });

  if (!views.data?.enabled) return null;

  const buttonClass =
    "rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-3 py-2">
      <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        Saved views
      </span>

      {views.data.views.length === 0 ? (
        <span className="text-[12px] text-muted-foreground">None yet.</span>
      ) : (
        views.data.views.map((v) => (
          <span key={v.id} className="inline-flex items-center gap-1">
            <button type="button" className={buttonClass} onClick={() => onApply(v.query)}>
              {v.name}
              {v.shared ? " · shared" : ""}
            </button>
            {v.mine ? (
              <button
                type="button"
                aria-label={`Delete saved view ${v.name}`}
                className="text-[11px] text-muted-foreground hover:text-destructive"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate(v.id)}
              >
                ×
              </button>
            ) : null}
          </span>
        ))
      )}

      <div className="ml-auto flex items-center gap-2">
        {open ? (
          <>
            <input
              className="h-6 w-40 rounded-sm border border-border bg-background px-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring"
              placeholder="Name this view"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Saved view name"
            />
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
              />
              Share
            </label>
            <button
              type="button"
              className={cn(buttonClass, "text-foreground")}
              disabled={!name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Save
            </button>
            <button type="button" className={buttonClass} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
            Save this view
          </button>
        )}
      </div>

      {saveMutation.isError ? (
        <p className="w-full text-[11px] text-destructive">
          {(saveMutation.error as Error).message}
        </p>
      ) : null}
    </div>
  );
}
