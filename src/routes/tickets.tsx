import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { canManage, useProfile } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tickets")({
  component: TicketsLayout,
});

function TicketsLayout() {
  const { profile } = useProfile();

  const tabs = [
    { to: "/tickets", label: "Queue", exact: true },
    ...(canManage(profile?.role) ? [{ to: "/tickets/routing", label: "Routing", exact: false }] : []),
    { to: "/alerts", label: "Alerts", exact: false },
  ];

  return (
    <div>
      <div className="border-b border-border px-6 pt-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight">Tickets</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
              Support requests routed by category, with a 24-hour first-response SLA.
            </p>
          </div>
        </div>
        <nav className="mt-3 flex gap-4">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              activeOptions={{ exact: t.exact }}
              className={cn(
                "border-b-2 border-transparent pb-2 text-[12px] font-medium text-muted-foreground transition-colors",
                "hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
