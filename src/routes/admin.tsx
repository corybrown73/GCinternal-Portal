import { createFileRoute, Outlet } from "@tanstack/react-router";

import { isSuperAdmin, useProfile } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — GoCanvas Handoff Hub" },
      { name: "description", content: "API keys, users and routing configuration." },
    ],
  }),
  component: AdminLayout,
});

/**
 * Client-side gate only decides what to render — every admin serverFn
 * independently re-checks the caller's role server-side.
 */
function AdminLayout() {
  const { profile, loading } = useProfile();

  if (loading) {
    return (
      <div className="p-6">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Loading…
        </p>
      </div>
    );
  }

  if (!isSuperAdmin(profile?.role)) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-dashed border-border bg-card px-6 py-10 text-center">
          <p className="text-[13px] font-medium">Super admin only</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted-foreground">
            This area manages API keys, user roles and routing. Ask a super admin if you need a
            change made here.
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
