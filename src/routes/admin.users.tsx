import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Mail, Plus, X } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { NoRows, Panel } from "@/components/record";
import { ROLE_LABELS, type PortalRole } from "@/lib/auth";
import {
  getPendingInvites,
  getUsers,
  inviteUser,
  revokeUserInvite,
  setUserRole,
} from "@/lib/presale.functions";
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

/** Roles somebody can be invited AS. `customer` is absent: a customer arrives
 *  through the customer invite on /access, with an account attached. One that
 *  came through here would be a customer-role profile linked to no customer. */
const INVITABLE_ROLES = ["manager", "sales", "implementation", "tam_se", "super_admin"] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];

const usersQuery = queryOptions({
  queryKey: ["admin", "users"],
  queryFn: () => getUsers(),
});

const invitesQuery = queryOptions({
  queryKey: ["admin", "user-invites"],
  queryFn: () => getPendingInvites(),
});

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users — Admin | GoCanvas Handoff Hub" }] }),
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(usersQuery).catch(() => {});
    void context.queryClient.ensureQueryData(invitesQuery).catch(() => {});
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
  const { data: invites } = useSuspenseQuery(invitesQuery);
  const queryClient = useQueryClient();
  const changeRole = useServerFn(setUserRole);
  const invite = useServerFn(inviteUser);
  const revoke = useServerFn(revokeUserInvite);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; link: string | null } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState<{ email: string; fullName: string; role: InvitableRole }>({
    email: "",
    fullName: "",
    role: "sales",
  });

  const refreshInvites = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "user-invites"] });

  const sendInvite = useMutation({
    mutationFn: () =>
      invite({
        data: {
          email: form.email.trim(),
          ...(form.fullName.trim() ? { fullName: form.fullName.trim() } : {}),
          role: form.role,
        },
      }),
    onSuccess: (result) => {
      setError(null);
      // Two different outcomes, said differently. "Invited" when the mail
      // actually went; the honest version otherwise, because an admin waiting
      // for an email nobody sent is worse than a slightly longer message.
      setNotice(
        result.emailed
          ? {
              text: `Invited ${result.email}. They'll get an email with a sign-in link.`,
              link: null,
            }
          : {
              text:
                `${result.email} is invited and will get the right role when they sign up — ` +
                `but the email did not send (${result.reason ?? "unknown reason"}). ` +
                (result.link ? "Send them this link:" : "Ask them to sign up at the login page."),
              link: result.link,
            },
      );
      setForm({ email: "", fullName: "", role: "sales" });
      setInviting(false);
      void refreshInvites();
    },
    onError: (e) => {
      setNotice(null);
      setError((e as Error).message);
    },
  });

  const revokeInvite = useMutation({
    mutationFn: (inviteId: string) => revoke({ data: { inviteId } }),
    onSuccess: () => {
      setError(null);
      void refreshInvites();
    },
    onError: (e) => setError((e as Error).message),
  });

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
          <div className="flex items-center gap-2">
            <button type="button" className={buttonClass} onClick={() => setInviting((v) => !v)}>
              <Plus className="h-3 w-3" /> Add user
            </button>
            <Link to="/admin" className={buttonClass}>
              <ChevronLeft className="h-3 w-3" /> Admin
            </Link>
          </div>
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

        {notice ? (
          <div className="rounded-md border border-border bg-surface px-3 py-2 text-[12px]">
            <p>{notice.text}</p>
            {notice.link ? (
              // Shown, not hidden behind a copy button: an admin who cannot send
              // the link has to be able to select it.
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {notice.link}
              </p>
            ) : null}
          </div>
        ) : null}

        {inviting ? (
          <Panel title="Add a user">
            <form
              className="space-y-2 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.email.trim()) return;
                sendInvite.mutate();
              }}
            >
              <div className="flex flex-wrap gap-2">
                <label className="min-w-[200px] flex-1">
                  <span className="mb-0.5 block text-[11px] text-muted-foreground">Email</span>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="teya@gocanvas.com"
                    className="h-7 w-full rounded-sm border border-border bg-background px-2 text-[13px] outline-none focus:ring-1 focus:ring-ring"
                  />
                </label>
                <label className="min-w-[160px] flex-1">
                  <span className="mb-0.5 block text-[11px] text-muted-foreground">
                    Name (optional)
                  </span>
                  <input
                    value={form.fullName}
                    onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                    placeholder="Teya Alvarez"
                    className="h-7 w-full rounded-sm border border-border bg-background px-2 text-[13px] outline-none focus:ring-1 focus:ring-ring"
                  />
                </label>
                <label>
                  <span className="mb-0.5 block text-[11px] text-muted-foreground">Role</span>
                  <select
                    value={form.role}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, role: e.target.value as InvitableRole }))
                    }
                    className="h-7 rounded-sm border border-border bg-background px-1 text-[13px] outline-none focus:ring-1 focus:ring-ring"
                  >
                    {INVITABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={sendInvite.isPending || !form.email.trim()}
                  className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[12px] disabled:opacity-40"
                >
                  <Mail className="h-3 w-3" />
                  {sendInvite.isPending ? "Sending…" : "Send invite"}
                </button>
                <button type="button" className={buttonClass} onClick={() => setInviting(false)}>
                  Cancel
                </button>
                <p className="text-[11px] text-muted-foreground">
                  They arrive with the role you pick. An invite works even if their email domain is
                  not on the signup allowlist, and lapses after 14 days.
                </p>
              </div>
            </form>
          </Panel>
        ) : null}

        {invites.length > 0 ? (
          <Panel title="Invited, not signed up yet" count={invites.length}>
            <ul className="divide-y divide-border">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                  <span className="text-[13px]">{i.full_name || i.email}</span>
                  {i.full_name ? (
                    <span className="text-[11px] text-muted-foreground">{i.email}</span>
                  ) : null}
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {ROLE_LABELS[i.role as PortalRole] ?? i.role}
                  </span>
                  {i.expired ? (
                    // Shown as dead rather than hidden: an admin who cannot see
                    // a lapsed invite re-invites into silence.
                    <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      lapsed
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      expires {fmtDate(i.expires_at)}
                    </span>
                  )}
                  {i.invited_by_name ? (
                    <span className="text-[11px] text-muted-foreground">
                      by {i.invited_by_name}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={`${buttonClass} ml-auto`}
                    disabled={revokeInvite.isPending}
                    onClick={() => revokeInvite.mutate(i.id)}
                  >
                    <X className="h-3 w-3" /> Revoke
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
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
