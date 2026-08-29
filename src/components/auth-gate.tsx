import { useEffect, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useProfile } from "@/lib/auth";

const PUBLIC_PREFIXES = ["/login", "/signup", "/forgot-password", "/auth", "/view", "/tam"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
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

  const publicPage = isPublic(pathname);
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
