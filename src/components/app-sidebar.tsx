import { Link } from "@tanstack/react-router";
import { canManage, isSuperAdmin, ROLE_LABELS, signOut, type PortalProfile } from "@/lib/auth";

type NavItem = { to: string; label: string; hint: string; exact?: boolean };

export function AppSidebar({ profile }: { profile?: PortalProfile | null }) {
  const role = profile?.role;

  const nav: NavItem[] = [
    { to: "/", label: "Home", hint: "What needs attention", exact: true },
    { to: "/pipeline", label: "Pipeline", hint: "Deals & handoff" },
    { to: "/customers", label: "Customers", hint: "All implementations" },
    { to: "/technical-solutions", label: "Solutions", hint: "Technical work" },
    { to: "/tickets", label: "Tickets", hint: "Requests & SLA" },
    { to: "/journeys", label: "Journeys", hint: "Automated onboarding" },
    { to: "/access", label: "Customer access", hint: "Portal invites" },
    ...(canManage(role) ? [{ to: "/portfolio", label: "Leadership", hint: "Team overview" }] : []),
    ...(canManage(role) ? [{ to: "/settings", label: "Settings", hint: "Stages & defaults" }] : []),
    ...(isSuperAdmin(role) ? [{ to: "/admin", label: "Admin", hint: "Keys, users, routing" }] : []),
  ];

  return (
    <aside className="flex w-[228px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <span className="text-[13px] font-semibold tracking-tight">GoCanvas Handoff Hub</span>
      </div>

      <nav className="flex flex-col gap-0.5 p-2">
        {nav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact ?? false }}
            className="group flex flex-col rounded-sm px-2.5 py-1.5 transition-colors hover:bg-muted data-[status=active]:bg-muted"
          >
            <span className="text-[13px] font-medium text-muted-foreground transition-colors group-hover:text-foreground group-data-[status=active]:text-foreground">
              {item.label}
            </span>
            <span className="text-[11px] text-muted-foreground/70">{item.hint}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto border-t border-border p-3">
        {profile ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium">
                {profile.full_name || profile.email}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {ROLE_LABELS[profile.role] ?? profile.role}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="shrink-0 rounded-sm border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        ) : (
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Internal · Sales → Implementation
          </p>
        )}
      </div>
    </aside>
  );
}
