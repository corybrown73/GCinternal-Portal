import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { signOut } from "@/lib/auth";
import { portalHomeQuery } from "@/components/portal/portal-queries";
import { GoCanvasLogo } from "@/components/gocanvas-logo";

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
 * Customer portal shell.
 *
 * WHY THIS WEARS THE MARKETING BRAND. A customer arrives here from a link in an
 * email, seconds after being on gocanvas.com. If this looked like the internal
 * hub — grey, dense, built for someone who lives in it — the handoff would read
 * as being passed to a different company's software. So it takes the navy bar,
 * the wordmark, the blue and the generous spacing from the site they just left.
 *
 * The internal app deliberately does NOT: it is a working tool and needs the
 * density. The palette is scoped to `.gc-brand` so the two cannot bleed.
 */
function PortalLayout() {
  const { data } = useQuery(portalHomeQuery);

  return (
    <div className="gc-brand gc-brand-page flex min-h-screen flex-col">
      {/* The site's own navy utility bar, so the top of the page is the same
          colour as the one the customer just came from. */}
      <div className="gc-topbar">
        <div className="mx-auto flex h-9 w-full max-w-5xl items-center justify-end gap-5 px-5 text-[11px]">
          <span className="opacity-90">p. 703-436-8069</span>
          <a href="https://www.gocanvas.com/help" className="opacity-90 hover:opacity-100">
            Help Center
          </a>
        </div>
      </div>

      <header
        className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur"
        style={{ borderColor: "var(--gc-line)" }}
      >
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
          <Link to="/portal" className="flex items-center gap-3">
            <GoCanvasLogo showEndorsement={false} />
            {data?.customer_name ? (
              <>
                <span aria-hidden="true" style={{ color: "var(--gc-line)" }}>
                  |
                </span>
                <span className="text-[14px] font-medium" style={{ color: "var(--gc-body)" }}>
                  {data.customer_name}
                </span>
              </>
            ) : null}
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              to="/portal"
              activeOptions={{ exact: true }}
              activeProps={{
                style: { color: "var(--gc-ink)", backgroundColor: "var(--gc-blue-soft)" },
              }}
              className="rounded-full px-3 py-1.5 text-[13px] font-medium"
              style={{ color: "var(--gc-body)" }}
            >
              Progress
            </Link>
            <Link
              to="/portal/tickets"
              activeProps={{
                style: { color: "var(--gc-ink)", backgroundColor: "var(--gc-blue-soft)" },
              }}
              className="rounded-full px-3 py-1.5 text-[13px] font-medium"
              style={{ color: "var(--gc-body)" }}
            >
              Help
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="gc-btn ml-2 h-9 px-3 text-[13px]"
              style={{ border: "1px solid var(--gc-line)", color: "var(--gc-body)" }}
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <Outlet />
      </main>

      <footer className="border-t py-6" style={{ borderColor: "var(--gc-line)" }}>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5">
          <GoCanvasLogo className="opacity-70" />
          <p className="text-[12px]" style={{ color: "var(--gc-body)" }}>
            Your onboarding, run with your GoCanvas team.
          </p>
        </div>
      </footer>
    </div>
  );
}
