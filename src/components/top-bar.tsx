import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, Search } from "lucide-react";

import { ScopeSwitch, type ScopeState } from "@/components/scope-switch";
import { getTeamOptions } from "@/lib/hub.functions";
import { getAlerts } from "@/lib/tickets.functions";
import { useScope } from "@/lib/use-scope";
import type { PortalProfile } from "@/lib/auth";

/** The pages whose lists are filtered by whose accounts you are looking at. */
const SCOPED = new Set(["/", "/pipeline", "/customers", "/portfolio", "/calendar", "/reports"]);

/**
 * The bar across the top of every page: search, whose accounts, today,
 * and the alerts. One place for the three things a person reaches for
 * from anywhere, instead of a search box in the nav and a scope switch on
 * some pages and not others.
 */
export function TopBar({ profile }: { profile: PortalProfile | null }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const scoped = SCOPED.has(pathname.replace(/\/$/, "") || "/");
  const { param, setScope } = useScope();

  // The scope, as the switch wants it: mode, the person, the viewer's name.
  const team = useQuery({
    queryKey: ["team-options"],
    queryFn: () => getTeamOptions(),
    enabled: Boolean(param?.startsWith("owner:")),
  });
  const viewer = profile?.full_name?.split(" ")[0] || "My";
  const scope: ScopeState =
    param === "all"
      ? { mode: "all", person_id: null, label: "All accounts", viewer_name: viewer }
      : param?.startsWith("owner:")
        ? {
            mode: "person",
            person_id: param.slice(6),
            label: `Covering for ${(team.data ?? []).find((m: { id: string; name: string }) => m.id === param.slice(6))?.name ?? "…"}`,
            viewer_name: viewer,
          }
        : { mode: "mine", person_id: null, label: `${viewer}'s accounts`, viewer_name: viewer };

  const alerts = useQuery({
    queryKey: ["alerts", "open-count"],
    queryFn: () => getAlerts(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const open = (alerts.data ?? []).filter((a) => !a.acknowledged_at).length;

  // Today, in the reader's zone, after mount so the server and the client agree.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    );
  }, []);

  return (
    // relative + z-40: the blur makes this a stacking context, and the page
    // header below is sticky z-30 — without a z-index of its own the scope
    // menu opened underneath the header and its top rows could not be clicked.
    <div className="relative z-40 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
      <form
        className="min-w-0 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
          if (q) void navigate({ to: "/search", search: { q } });
        }}
      >
        <label className="relative block max-w-2xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            type="search"
            placeholder="Search accounts, customers, or deals…"
            aria-label="Search across every surface"
            className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-3 text-[13px] outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
          />
        </label>
      </form>
      {scoped ? <ScopeSwitch scope={scope} onChange={setScope} /> : null}
      {today ? (
        <span
          className="hidden text-[12px] text-muted-foreground md:inline"
          suppressHydrationWarning
        >
          {today}
        </span>
      ) : null}
      <Link
        to="/alerts"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
        title={open ? `${open} open alert${open === 1 ? "" : "s"}` : "Alerts"}
        aria-label="Alerts"
      >
        <Bell className="h-4 w-4" />
        {open ? (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-status-blocked-foreground px-1 text-[9px] font-semibold text-white">
            {open > 9 ? "9+" : open}
          </span>
        ) : null}
      </Link>
    </div>
  );
}
