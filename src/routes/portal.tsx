import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { signOut } from "@/lib/auth";
import { portalHomeQuery } from "@/components/portal/portal-queries";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "Your onboarding — GoCanvas" },
      { name: "description", content: "Track your GoCanvas onboarding progress." },
    ],
  }),
  component: PortalLayout,
});

/**
 * Customer portal shell: minimal top bar, no internal sidebar. Warmer and
 * simpler than the hub, same token system.
 */
function PortalLayout() {
  const { data } = useQuery(portalHomeQuery);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-12 w-full max-w-4xl items-center justify-between px-4">
          <Link to="/portal" className="flex items-baseline gap-2">
            <span className="text-[14px] font-semibold tracking-tight text-primary">GoCanvas</span>
            <span className="text-[13px] text-muted-foreground">
              · {data?.customer_name ?? "Customer portal"}
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              to="/portal"
              activeOptions={{ exact: true }}
              activeProps={{ className: "bg-surface text-foreground" }}
              className="rounded-sm px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              Progress
            </Link>
            <Link
              to="/portal/tickets"
              activeProps={{ className: "bg-surface text-foreground" }}
              className="rounded-sm px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              Help
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="ml-2 inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3 w-3" /> Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-border py-4">
        <p className="mx-auto max-w-4xl px-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          GoCanvas onboarding portal
        </p>
      </footer>
    </div>
  );
}
