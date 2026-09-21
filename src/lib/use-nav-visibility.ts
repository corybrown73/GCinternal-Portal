import { useQuery } from "@tanstack/react-query";

import { getNavVisibility } from "./nav-visibility.functions";
import { hideableKeys, NO_HIDDEN, type NavVisibility } from "./nav-visibility";

/** Until the answer is in: only what cannot be switched off. */
const CORE_ONLY: NavVisibility = { hidden: hideableKeys() };

/**
 * Same contract as useOrgBranding: the sidebar renders on every page, so this
 * never throws. While the first answer loads it shows only the locked entries
 * — "show everything" flashed the whole catalogue, including sections the
 * admin had switched off, and then took them away a moment later. On an
 * error, everything: a config read failing is not a reason to hide the app.
 * The admin screen invalidates the key when it saves.
 */
export function useNavVisibility(initial: NavVisibility | null = null): NavVisibility {
  const query = useQuery({
    queryKey: ["nav-visibility"],
    queryFn: () => getNavVisibility(),
    staleTime: 5 * 60_000,
    retry: false,
    // The root loader fetched it with the page: the first paint is the
    // right list, and the admin screen's invalidation still refetches.
    ...(initial ? { initialData: initial } : {}),
  });
  if (query.data) return query.data;
  return query.isError ? NO_HIDDEN : CORE_ONLY;
}
