import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  ChartBar,
  ChevronDown,
  ChevronRight,
  Cog,
  Handshake,
  House,
  KeyRound,
  LayoutTemplate,
  LifeBuoy,
  Radio,
  Search,
  Settings,
  SquareKanban,
  Users,
  UsersRound,
  Workflow,
  Wrench,
  CalendarDays,
} from "lucide-react";
import { homeVariantFor } from "@/lib/roles";
import { canManage, isSuperAdmin, ROLE_LABELS, signOut, type PortalProfile } from "@/lib/auth";
import {
  NO_HIDDEN,
  visibleNav,
  type NavEntry,
  type NavIcon,
  type NavVisibility,
} from "@/lib/nav-visibility";
import {
  DEFAULT_BRANDING,
  GOCANVAS_NAV,
  schemeFor,
  type OrgBrandingView,
} from "@/lib/org-branding";
import { useInterfaceTheme } from "@/lib/use-theme";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

const ICON: Record<NavIcon, typeof House> = {
  home: House,
  customers: Users,
  pipeline: SquareKanban,
  calendar: CalendarDays,
  reports: ChartBar,
  search: Search,
  forms: BookOpen,
  solutions: Wrench,
  tickets: LifeBuoy,
  sequences: Workflow,
  templates: LayoutTemplate,
  access: KeyRound,
  leadership: UsersRound,
  signals: Radio,
  settings: Settings,
  admin: Cog,
};

/**
 * The sidebar: the five places a person goes every day, each with an icon
 * and a one-line reason; everything else folded under "More"; Settings and
 * the person at the bottom. The scheme is applied as CSS variables on the
 * <aside> only, so nothing outside the nav is recoloured by a nav choice.
 */
export function AppSidebar({
  profile,
  branding,
  visibility,
}: {
  profile?: PortalProfile | null;
  branding?: OrgBrandingView | null;
  /** Which sections a super admin has switched off. Absent = everything. */
  visibility?: NavVisibility | null;
}) {
  const role = profile?.role;
  const theme = useInterfaceTheme();
  const scheme = theme === "gocanvas" ? GOCANVAS_NAV : schemeFor(branding?.nav_scheme);
  const appName = branding?.app_name ?? DEFAULT_BRANDING.app_name;

  // One catalogue, narrowed by role and then by what has been switched off.
  const nav = visibleNav(
    visibility ?? NO_HIDDEN,
    { canManage: canManage(role), isSuperAdmin: isSuperAdmin(role) },
    homeVariantFor(role),
  );
  const primary = nav.filter((n) => n.primary);
  const settings = nav.find((n) => n.to === "/settings") ?? null;
  const more = nav.filter((n) => !n.primary && n.to !== "/settings" && n.to !== "/search");
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <aside
      style={{ ...(scheme.vars as React.CSSProperties), backgroundColor: "var(--nav-bg)" }}
      className="sticky top-0 flex h-screen w-[164px] shrink-0 flex-col overflow-y-auto border-r lg:w-[236px]"
      data-nav-scheme={scheme.key}
    >
      <div className="flex h-14 items-center gap-2.5 px-4" style={{ color: "var(--nav-fg)" }}>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-[13px] font-bold",
            branding?.logo_url ? (scheme.dark ? "bg-white/90 p-0.5" : "") : "bg-sky-500 text-white",
          )}
        >
          {branding?.logo_url ? (
            <img src={branding.logo_url} alt="" className="h-full w-full object-contain" />
          ) : (
            "go"
          )}
        </span>
        <span
          className="min-w-0 text-[13px] font-semibold leading-tight tracking-tight"
          title={appName}
        >
          {appName}
        </span>
      </div>

      <nav className="mt-1 flex flex-col gap-0.5 px-2">
        {primary.map((item) => (
          <NavLink key={item.to} item={item} />
        ))}
        {more.length ? (
          <>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="mt-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12px] transition-colors hover:[background-color:var(--nav-active)]"
              style={{ color: "var(--nav-muted)" }}
              aria-expanded={moreOpen}
            >
              {moreOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              More
            </button>
            {moreOpen ? more.map((item) => <NavLink key={item.to} item={item} compact />) : null}
          </>
        ) : null}
      </nav>

      <div className="mt-auto px-2 pb-2">
        {settings ? <NavLink item={settings} compact /> : null}
        <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--nav-border)" }}>
          {profile ? (
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                style={{ backgroundColor: "var(--nav-active)", color: "var(--nav-fg)" }}
              >
                {initials(profile.full_name || profile.email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium" style={{ color: "var(--nav-fg)" }}>
                  {profile.full_name || profile.email}
                </p>
                <p className="truncate text-[11px]" style={{ color: "var(--nav-muted)" }}>
                  {ROLE_LABELS[profile.role] ?? profile.role}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                title="Sign out"
                className="shrink-0 rounded-sm px-1.5 py-1 text-[11px] transition-colors hover:[background-color:var(--nav-active)]"
                style={{ color: "var(--nav-muted)" }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <p
              className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider"
              style={{ color: "var(--nav-muted)" }}
            >
              Internal · Sales → Implementation
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

function NavLink({ item, compact = false }: { item: NavEntry; compact?: boolean }) {
  const Icon = ICON[item.icon] ?? Handshake;
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.exact ?? false }}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 transition-colors hover:[background-color:var(--nav-active)] data-[status=active]:[background-color:var(--nav-active)] data-[status=active]:shadow-[inset_3px_0_0_0_var(--nav-fg)]",
        compact ? "py-1.5" : "py-2",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--nav-fg)" }} strokeWidth={1.75} />
      <span className="min-w-0 flex flex-col">
        <span className="truncate text-[13px] font-medium" style={{ color: "var(--nav-fg)" }}>
          {item.label}
        </span>
        {!compact ? (
          <span
            className="hidden truncate text-[11px] lg:block"
            style={{ color: "var(--nav-muted)" }}
          >
            {item.hint}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
