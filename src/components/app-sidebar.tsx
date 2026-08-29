import { Link } from "@tanstack/react-router";

const NAV = [
  { to: "/", label: "Home", hint: "What needs attention", exact: true },
  { to: "/customers", label: "Customers", hint: "All implementations" },
  { to: "/technical-solutions", label: "Solutions", hint: "Technical work" },
  { to: "/portfolio", label: "Leadership", hint: "Team overview" },
  { to: "/settings", label: "Settings", hint: "Stages & defaults" },
] as const;

export function AppSidebar() {
  return (
    <aside className="flex w-[228px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <span className="text-[13px] font-semibold tracking-tight">Implementation Hub</span>
      </div>

      <nav className="flex flex-col gap-0.5 p-2">
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: "exact" in item ? item.exact : false }}
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
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Internal · Onboarding &amp; Implementation
        </p>
      </div>
    </aside>
  );
}
