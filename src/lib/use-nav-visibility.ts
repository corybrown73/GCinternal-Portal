import { useQuery } from "@tanstack/react-query";

import { getNavVisibility } from "./nav-visibility.functions";
import { NO_HIDDEN, type NavVisibility } from "./nav-visibility";

/**
 * Same contract as useOrgBranding: the sidebar renders on every page, so this
 * never throws and returns "show everything" while loading or on any error.
 * The admin screen invalidates the key when it saves.
 */
export function useNavVisibility(): NavVisibility {
  const query = useQuery({
    queryKey: ["nav-visibility"],
    queryFn: () => getNavVisibility(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return query.data ?? NO_HIDDEN;
}
