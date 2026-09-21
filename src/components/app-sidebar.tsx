import { Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { canManage, isSuperAdmin, ROLE_LABELS, signOut, type PortalProfile } from "@/lib/auth";
import { NO_HIDDEN, visibleNav, type NavVisibility } from "@/lib/nav-visibility";
import {
  DEFAULT_BRANDING,
  GOCANVAS_NAV,
  schemeFor,
  type OrgBrandingView,
} from "@/lib/org-branding";
import { useInterfaceTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

/**
 * The scheme is applied as CSS variables on the <aside> only, so nothing
 * outside the nav is recoloured by a nav choice — a dark sidebar cannot drag
 * the rest of the app somewhere unreadable.
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
  // The list itself lives in lib/nav-visibility so the admin screen that
  // toggles sections and the sidebar that draws them cannot disagree about
  // what the sections are.
  const nav = visibleNav(visibility ?? NO_HIDDEN, {
    canManage: canManage(role),
    isSuperAdmin: isSuperAdmin(role),
  });

  return (
    <aside
      /* The scheme's variables AND the background that reads them. The
         variables alone painted nothing: the panel showed the page colour
         under white text, which is how a dark scheme became unreadable. */
      style={{ ...(scheme.vars as React.CSSProperties), backgroundColor: "var(--nav-bg)" }}
      /* Narrower below lg. At 228px on an 820px window the nav takes more
         than a quarter of the screen and the content beside it has nowhere to
         go. The links stay full-width and readable; only the hint line under
         each one is dropped, because it is the part a person reads once. */
      className="flex w-[164px] shrink-0 flex-col border-r lg:w-[228px]"
      data-nav-scheme={scheme.key}
    >
      <div
        className="flex h-12 items-center gap-2 border-b px-4"
        style={{ borderColor: "var(--nav-border)" }}
      >
        {branding?.logo_url ? (
          // object-contain, never stretched. On a dark scheme the mark gets a
          // light plate: most logos are drawn for white and would otherwise
          // disappear into the panel.
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-sm",
              scheme.dark && "bg-white/90 p-0.5",
            )}
          >
            <img src={branding.logo_url} alt="" className="h-full w-full object-contain" />
          </span>
        ) : null}
        <span
          className="truncate text-[13px] font-semibold tracking-tight"
          style={{ color: "var(--nav-fg)" }}
          title={appName}
        >
          {appName}
        </span>
      </div>

      <SearchBox />
      <nav className="flex flex-col gap-0.5 p-2">
        {nav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact ?? false }}
            className="group flex flex-col rounded-sm px-2.5 py-1.5 transition-colors hover:[background-color:var(--nav-active)] data-[status=active]:[background-color:var(--nav-active)]"
          >
            <span
              className="text-[13px] font-medium transition-colors"
              style={{ color: "var(--nav-fg)" }}
            >
              {item.label}
            </span>
            <span className="hidden text-[11px] lg:block" style={{ color: "var(--nav-muted)" }}>
              {item.hint}
            </span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto border-t p-3" style={{ borderColor: "var(--nav-border)" }}>
        {profile ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium" style={{ color: "var(--nav-fg)" }}>
                {profile.full_name || profile.email}
              </p>
              <p
                className="font-mono text-[10px] uppercase tracking-wider"
                style={{ color: "var(--nav-muted)" }}
              >
                {ROLE_LABELS[profile.role] ?? profile.role}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="shrink-0 rounded-sm border px-2 py-1 text-[11px] transition-colors hover:[background-color:var(--nav-active)]"
              style={{ borderColor: "var(--nav-border)", color: "var(--nav-muted)" }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <p
            className="font-mono text-[10px] uppercase tracking-wider"
            style={{ color: "var(--nav-muted)" }}
          >
            Internal · Sales → Implementation
          </p>
        )}
      </div>
    </aside>
  );
}

/** Search, as a box rather than a page in the list: type, Enter, results. */
function SearchBox() {
  const navigate = useNavigate();
  return (
    <form
      className="px-3 pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
        if (q) void navigate({ to: "/search", search: { q } });
      }}
    >
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
          style={{ color: "var(--nav-muted)" }}
        />
        <input
          name="q"
          type="search"
          placeholder="Search"
          aria-label="Search across every surface"
          className="h-7 w-full rounded-sm border bg-transparent pl-7 pr-2 text-[12px] outline-none focus:ring-1"
          style={{ borderColor: "var(--nav-border)", color: "var(--nav-fg)" }}
        />
      </label>
    </form>
  );
}
