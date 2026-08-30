import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { TERM_LABELS } from "@/lib/terms";

export type PortalRole =
  | "admin"
  | "super_admin"
  | "manager"
  | "sales"
  | "implementation"
  | "tam_se"
  | "onboarding"
  | "am"
  | "se"
  | "customer";

export interface PortalProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: PortalRole;
}

/**
 * What a login's role is called on screen.
 *
 * Sourced from src/lib/terms.ts so that this table and `humanize()` cannot
 * drift into calling the same role two different things — which they did:
 * /admin/users read "TAM / SE" from here while the ticket-routing picker
 * printed "Tam se" from humanize for the identical value.
 *
 * Two entries deliberately differ from the dictionary. `am` and `se` are
 * PORTAL roles here — an account manager's login gets the sales surface, a
 * solutions engineer's gets the TAM/SE surface — while in the team directory
 * the same two strings are job titles. The permission this grants is the thing
 * worth naming in a list of logins, so these say what the login can do.
 */
export const ROLE_LABELS: Record<PortalRole, string> = {
  admin: TERM_LABELS.admin,
  super_admin: TERM_LABELS.super_admin,
  manager: TERM_LABELS.manager,
  sales: TERM_LABELS.sales,
  implementation: TERM_LABELS.implementation,
  tam_se: TERM_LABELS.tam_se,
  onboarding: TERM_LABELS.onboarding,
  am: TERM_LABELS.sales,
  se: TERM_LABELS.tam_se,
  customer: TERM_LABELS.customer,
};

export function isSuperAdmin(role: PortalRole | undefined): boolean {
  return role === "admin" || role === "super_admin";
}
export function canManage(role: PortalRole | undefined): boolean {
  return isSuperAdmin(role) || role === "manager";
}
export function isInternal(role: PortalRole | undefined): boolean {
  return Boolean(role) && role !== "customer";
}
export function canEditSales(role: PortalRole | undefined): boolean {
  return canManage(role) || role === "sales" || role === "am";
}
export function canEditTechnical(role: PortalRole | undefined): boolean {
  return canManage(role) || role === "tam_se" || role === "se" || role === "implementation";
}

/** Live Supabase session; undefined while loading, null when signed out. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return session;
}

export function useProfile() {
  const session = useSession();
  const query = useQuery({
    queryKey: ["profile", session?.user?.id ?? "none"],
    enabled: Boolean(session?.user),
    queryFn: async (): Promise<PortalProfile | null> => {
      const { data } = await supabase
        .from("portal_profiles")
        .select("id, email, full_name, role")
        .eq("id", session!.user.id)
        .maybeSingle<PortalProfile>();
      return data ?? null;
    },
  });
  return {
    session,
    profile: query.data,
    loading: session === undefined || (Boolean(session) && query.isPending),
  };
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "/login";
}
