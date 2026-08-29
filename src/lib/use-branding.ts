import { useQuery } from "@tanstack/react-query";

import { getOrgBranding } from "./org-branding.functions";
import { DEFAULT_BRANDING, DEFAULT_SCHEME_KEY, type OrgBrandingView } from "./org-branding";

const FALLBACK: OrgBrandingView = {
  app_name: DEFAULT_BRANDING.app_name,
  nav_scheme: DEFAULT_SCHEME_KEY,
  logo_url: null,
};

/**
 * The sidebar renders on every page, so this must never be a reason a page
 * fails to paint. It returns the defaults while loading and on any error —
 * the nav is always drawable, just unbranded.
 *
 * `staleTime` is long because branding changes roughly never; the settings
 * form invalidates this key explicitly when it does.
 */
export function useOrgBranding(): OrgBrandingView {
  const query = useQuery({
    queryKey: ["org-branding"],
    queryFn: () => getOrgBranding(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return query.data ?? FALLBACK;
}
