import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

const REMEMBERED = "scope:last";

function remember(next: string | null) {
  try {
    if (next) window.localStorage.setItem(REMEMBERED, next);
    else window.localStorage.removeItem(REMEMBERED);
  } catch {
    /* storage blocked; the choice still applies to this page */
  }
}

function recall(): string | null {
  try {
    return window.localStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
}

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
 * server's single definition of the default applies.
 *
 * IT ALSO HAS TO SURVIVE NAVIGATION. Living only in the URL meant that choosing
 * "everyone" on /customers and then clicking Pipeline in the nav silently put
 * you back on your own book — the nav links carry no search params. So the last
 * explicit choice is remembered per browser and re-applied when a page opens
 * with no scope of its own.
 *
 * The URL still wins whenever it says anything. That ordering is what keeps a
 * pasted link showing the sender what the recipient sees: a link with
 * ?scope=owner:… is never quietly overwritten by the reader's own memory.
 *
 * `strict: false` because these pages have different search schemas and this
 * hook has no business knowing them; it reads one key and writes one key.
 */
export function useScope(): { param: string | null; setScope: (next: string | null) => void } {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const raw = search["scope"];
  const param = typeof raw === "string" && raw.length > 0 ? raw : null;

  // Re-apply the remembered choice on a page that arrived without one, by
  // writing it into the URL rather than holding it beside the URL. The address
  // bar stays the whole truth, so the page is still shareable and the back
  // button still means something.
  //
  // Runs after mount, never during render: the server has no localStorage, and
  // deciding this during render would make the first client pass disagree with
  // the HTML that arrived.
  useEffect(() => {
    if (param) return;
    const last = recall();
    if (!last) return;
    void navigate({
      to: ".",
      search: ((prev: Record<string, unknown>) => ({ ...prev, scope: last })) as never,
      replace: true,
    } as never);
    // `navigate` is stable for this router; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  const setScope = (next: string | null) => {
    // Remember the explicit choice, including an explicit clear.
    remember(next);
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
