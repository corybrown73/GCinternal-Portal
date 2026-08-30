import { useEffect, type ReactNode } from "react";
import { useMatches, useRouterState } from "@tanstack/react-router";
import { useProfile } from "@/lib/auth";

// "/plan" (Phase 4) is the signed-link door: the visitor has no account by
// design. Matching is exact-or-slash below, so it cannot shadow /pipeline,
// /portfolio or anything else that merely starts with the same letters.
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/auth",
  "/view",
  "/tam",
  "/plan",
];

/**
 * Exported so the root loader can ask the same question. Two copies of "which
 * routes are public" drift, and the drift shows up as a signed-out visitor
 * triggering an authenticated request on a page that is meant to need nothing.
 */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isPublic(pathname: string): boolean {
  return isPublicRoute(pathname);
}

/**
 * Client-side route guard. Server functions independently enforce auth via the
 * Supabase bearer middleware — this gate only decides what shell to render.
 *
 * Renders:  public pages as-is · customers only under /portal · internal
 * users everywhere else.
 */
export function AuthGate({
  children,
  renderShell,
}: {
  children: ReactNode;
  renderShell: (opts: { chrome: boolean }) => ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session, profile, loading } = useProfile();

  /**
   * A path that matched no route is treated as public.
   *
   * Without this the 404 page could never be seen. A not-found route renders
   * through the root's <Outlet />, which is inside this gate; the gate saw a
   * path that is not in PUBLIC_PREFIXES, held the tree on "Loading…" while the
   * session resolved, and then either redirected a signed-out visitor to
   * /login or handed a signed-in one the app shell wrapped around a page they
   * never got to read. Either way the answer to "did I type that right?" was a
   * blank screen.
   *
   * Safe because there is nothing behind a 404 to protect: no loader ran, no
   * data was fetched, and the component is a static apology. Authorisation for
   * real routes is unchanged, and every server function enforces it again
   * regardless of what this gate decides.
   */
  const notFound = useMatches({
    select: (matches) =>
      matches.some(
        (m) => m.status === "notFound" || (m as { globalNotFound?: boolean }).globalNotFound,
      ),
  });

  const publicPage = isPublic(pathname) || notFound;
  const isCustomer = profile?.role === "customer";
  const onPortal = pathname === "/portal" || pathname.startsWith("/portal/");

  useEffect(() => {
    if (publicPage || loading) return;
    if (!session) {
      window.location.replace("/login");
      return;
    }
    if (profile && isCustomer && !onPortal) {
      window.location.replace("/portal");
      return;
    }
    if (profile && !isCustomer && onPortal) {
      window.location.replace("/");
    }
  }, [publicPage, loading, session, profile, isCustomer, onPortal]);

  if (publicPage) return <>{children}</>;

  if (loading || !session || (isCustomer && !onPortal)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Loading…
        </p>
      </div>
    );
  }

  // Customers get the portal's own chrome; internal users get the hub shell.
  return <>{renderShell({ chrome: !onPortal })}</>;
}
