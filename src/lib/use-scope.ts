import { useNavigate, useSearch } from "@tanstack/react-router";

/**
 * The `?scope=` parameter, read and written from any scoped page.
 *
 * It lives in the URL rather than in component state or a stored preference,
 * and that is the important decision: a colleague asking "can you look at
 * Teya's book with me" is answered by sending a link. A view that only exists
 * inside one browser session cannot be shared, cannot be bookmarked, and cannot
 * be pasted into the ticket where somebody is asking about it.
 *
 * The default is absent, not "mine" — so an unscoped URL stays clean and the
 * server's default is the single definition of what "mine" means.
 *
 * `strict: false` because these pages have different search schemas and this
 * hook has no business knowing them; it reads one key and writes one key.
 */
export function useScope(): { param: string | null; setScope: (next: string | null) => void } {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const raw = search["scope"];
  const param = typeof raw === "string" && raw.length > 0 ? raw : null;

  const setScope = (next: string | null) => {
    // `to: "."` keeps the current route; this hook is used from four different
    // routes and has no business naming any of them.
    void navigate({
      to: ".",
      // Whatever else is in the URL stays: switching whose accounts you are
      // looking at must not silently drop the sort, the filter or the tab.
      // Cast because the router's search type is per-route and this hook is
      // route-agnostic by design. The shape is checked by each route's own
      // validateSearch on the way back in, which is where it matters.
      search: ((prev: Record<string, unknown>) => {
        const out = { ...prev };
        if (next) out["scope"] = next;
        else delete out["scope"];
        return out;
      }) as never,
      replace: true,
    } as never);
  };

  return { param, setScope };
}
