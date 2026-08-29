import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { NoRows, Panel } from "@/components/record";
import { ROLE_LABELS, type PortalRole } from "@/lib/auth";
import { getUsers, setUserRole } from "@/lib/presale.functions";
import { fmtDate } from "@/lib/hub-format";

/** Roles that can be assigned. Legacy roles (admin/am/se/onboarding) are shown
 *  on existing rows but no longer offered. */
const OFFERED_ROLES = [
  "super_admin",
  "manager",
  "sales",
  "implementation",
  "tam_se",
  "customer",
] as const;
type OfferedRole = (typeof OFFERED_ROLES)[number];

const LEGACY_ROLES = ["admin", "am", "se", "onboarding"];

const usersQuery = queryOptions({
  queryKey: ["admin", "users"],
  queryFn: () => getUsers(),
});

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users — Admin | GoCanvas Handoff Hub" }] }),
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(usersQuery).catch(() => {});
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load users: {error.message}
    </div>
  ),
  component: UsersPage,
});

const selectClass =
  "h-6 rounded-sm border border-border bg-background px-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";

function UsersPage() {
  const { data: users } = useSuspenseQuery(usersQuery);
  const queryClient = useQueryClient();
  const changeRole = useServerFn(setUserRole);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (vars: { profileId: string; role: OfferedRole }) => changeRole({ data: vars }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <>
      <PageHeader
        title="Users"
        description="Every portal profile and its role. Roles decide who can edit presale records, manage the team, or reach this admin area."
        actions={
          <Link to="/admin" className={buttonClass}>
            <ChevronLeft className="h-3 w-3" /> Admin
          </Link>
        }
      />
      <PageBody className="max-w-3xl space-y-3">
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-border bg-status-blocked px-3 py-2 text-[12px] text-status-blocked-foreground"
          >
            {error}
          </p>
        ) : null}

        <Panel title="Profiles" count={users.length}>
          {users.length === 0 ? (
            <NoRows label="No profiles yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-border bg-surface text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">User</th>
                    <th className="px-3 py-1.5 font-medium">Role</th>
                    <th className="px-3 py-1.5 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => {
                    const isLegacy = LEGACY_ROLES.includes(u.role);
                    return (
                      <tr key={u.id} className="hover:bg-muted/60">
                        <td className="px-3 py-1.5">
                          <p className="text-[13px] font-medium">{u.full_name || u.email}</p>
                          <p className="text-[11px] text-muted-foreground">{u.email}</p>
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <select
                              className={selectClass}
                              value={OFFERED_ROLES.includes(u.role as OfferedRole) ? u.role : ""}
                              disabled={mutation.isPending}
                              onChange={(e) => {
                                const role = e.target.value as OfferedRole;
                                if (!role) return;
                                mutation.mutate({ profileId: u.id, role });
                              }}
                            >
                              {isLegacy ? (
                                <option value="" disabled>
                                  {ROLE_LABELS[u.role as PortalRole] ?? u.role} (legacy: {u.role})
                                </option>
                              ) : null}
                              {OFFERED_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </option>
                              ))}
                            </select>
                            {isLegacy ? (
                              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                legacy
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                          {fmtDate(u.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <p className="text-[11px] text-muted-foreground">
          Legacy roles (admin, am, se, onboarding) keep working but are not offered for new
          assignments — pick a current role to migrate a profile.
        </p>
      </PageBody>
    </>
  );
}
