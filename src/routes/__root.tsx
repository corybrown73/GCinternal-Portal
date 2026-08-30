import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { applyStageOverrides } from "@/lib/lifecycle";
import { isPublicRoute } from "@/components/auth-gate";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportClientError } from "../lib/error-reporting";
import { AppSidebar } from "@/components/app-sidebar";
import { useOrgBranding } from "@/lib/use-branding";
import { LifecycleRail } from "@/components/lifecycle-rail";
import { AuthGate } from "@/components/auth-gate";
import { useProfile } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/**
 * What a mistyped URL shows.
 *
 * THE BUG THIS FIXES. This component was written and never reached. A 404 is
 * rendered through the root's <Outlet />, which sits inside <AuthGate> — and
 * the gate, seeing a path that is not public and a visitor whose session has
 * not resolved yet, held the tree on "Loading…" and then redirected to /login.
 * A signed-in person mistyping a URL got a blank page for a moment and then
 * the app's home screen, with nothing anywhere saying the address was wrong.
 * The fix is in AuthGate: a not-found path is treated as public, because there
 * is nothing behind it to protect.
 *
 * Rendered without the sidebar on purpose. The address does not correspond to
 * anything, so there is no "here" for the navigation to be highlighting.
 */
function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          404
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
          That page isn&apos;t here
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          The address doesn&apos;t match anything in the portal. It may have been mistyped, or the
          record it pointed at may have been removed.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/">Go to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportClientError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-surface p-2 text-left font-mono text-[11px] text-muted-foreground">
          {String(error?.message ?? error)}
        </pre>
        {/* The shared Button, not a hand-rolled one: these two were the last
            pair in the app still carrying their own colour and radius, so they
            missed the hover lift and the radius scale everything else got. */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </Button>
          <Button variant="outline" asChild>
            <a href="/">Go home</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "Internal Implementation Operating System for the Customer Onboarding & Implementation team.",
      },
      { property: "og:title", content: "GoCanvas Handoff Hub" },
      {
        property: "og:description",
        content: "Internal operating system for customer implementations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
    ],
  }),
  /**
   * Load the configured stage labels before anything renders.
   *
   * A loader rather than a component effect, because `stageLabel` is called
   * during the render of components all over the tree — populating the registry
   * afterwards would paint the compiled-in names first and swap them a frame
   * later, which is a visible flicker on every navigation.
   *
   * Never throws. Stage names are not worth a blank page: a failure here leaves
   * the compiled-in labels in place, which is exactly the pre-config behaviour.
   */
  loader: async ({ location }) => {
    // Public routes — a plan link, the sign-in page — have no session, and the
    // stage config is an authenticated read. Asking anyway would mean a failed
    // request and a logged error on every single one of them, which is noise
    // that trains people to ignore the log. Those pages render the compiled-in
    // labels, which is correct: nothing there shows a configurable stage name.
    if (isPublicRoute(location.pathname)) return null;
    try {
      const { getLifecycleStages } = await import("@/lib/lifecycle-stages.functions");
      const stages = await getLifecycleStages();
      applyStageOverrides(stages as never);
    } catch (e) {
      // An unauthenticated caller is not a fault worth logging: a signed-out
      // visitor, or anyone on a mistyped URL, reaches this line every time,
      // and an error that fires on ordinary behaviour trains people to skip
      // the log. Anything else is a real failure and stays loud.
      const message = e instanceof Error ? e.message : String(e);
      if (!/unauthorized|no authorization header/i.test(message)) {
        console.error("[lifecycle] could not load configured stage labels", e);
      }
    }
    return null;
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // The Customer 360 record renders its own lifecycle rail scoped to that
  // implementation, so the global context rail would be a duplicate there.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showGlobalRail = !/^\/customers\/[^/]+/.test(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate
        renderShell={({ chrome }) =>
          chrome ? (
            <ShellWithSidebar showGlobalRail={showGlobalRail} />
          ) : (
            <main className="min-h-screen bg-background text-foreground">
              <Outlet />
            </main>
          )
        }
      >
        <Outlet />
      </AuthGate>
    </QueryClientProvider>
  );
}

function ShellWithSidebar({ showGlobalRail }: { showGlobalRail: boolean }) {
  const { profile } = useProfile();
  const branding = useOrgBranding();
  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <AppSidebar profile={profile ?? null} branding={branding} />
      <div className="flex min-w-0 flex-1 flex-col">
        {showGlobalRail ? <LifecycleRail /> : null}
        <main className="min-w-0 flex-1">
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
