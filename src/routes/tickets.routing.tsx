import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageBody } from "@/components/page";
import { getInternalProfiles, getTicketRouting, setTicketRouting } from "@/lib/tickets.functions";
import { canManage, useProfile } from "@/lib/auth";
import { humanize } from "@/lib/hub-format";
import { cn } from "@/lib/utils";
import { selectClass } from "@/components/tickets/ticket-ui";
import { assigneeLabel, unlinkedStaffNote } from "@/lib/ticket-assignees";

export const Route = createFileRoute("/tickets/routing")({
  head: () => ({
    meta: [{ title: "Ticket routing — Implementation Hub" }],
  }),
  component: RoutingPage,
});

/** Roles a category can route to. Aliases resolve to the same pool server-side. */
const ROUTE_ROLES = ["tam_se", "implementation", "manager", "sales"] as const;

function RoutingPage() {
  const { profile, loading } = useProfile();
  const routingQuery = useQuery({
    queryKey: ["ticket-routing"],
    queryFn: () => getTicketRouting(),
  });
  const teamQuery = useQuery({
    queryKey: ["internal-profiles"],
    queryFn: () => getInternalProfiles(),
  });

  if (!loading && !canManage(profile?.role)) {
    return (
      <PageBody>
        <p className="text-[13px] text-muted-foreground">
          Routing rules are managed by managers and super admins.
        </p>
      </PageBody>
    );
  }

  return (
    <PageBody className="space-y-3">
      <p className="max-w-2xl text-[13px] text-muted-foreground">
        Each category routes to a role. New tickets go to the person in that role with the fewest
        open tickets; the fallback person catches categories whose role has no members.
      </p>
      <PoolNote
        assignable={teamQuery.data?.profiles.length ?? 0}
        directory={teamQuery.data?.directoryCount ?? 0}
        ready={!teamQuery.isPending && !teamQuery.isError}
      />
      {routingQuery.isPending || teamQuery.isPending ? (
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Loading routing…
        </p>
      ) : routingQuery.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          Could not load routing: {(routingQuery.error as Error).message}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-surface text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-medium">Category</th>
                <th className="px-3 py-1.5 font-medium">Routes to role</th>
                <th className="px-3 py-1.5 font-medium">Fallback person</th>
                <th className="px-3 py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(routingQuery.data ?? []).map((row) => (
                <RoutingRow key={row.id} row={row} team={teamQuery.data?.profiles ?? []} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageBody>
  );
}

function RoutingRow({
  row,
  team,
}: {
  row: { id: string; category: string; route_role: string; fallback_profile_id: string | null };
  team: Array<{ id: string; email: string; full_name: string | null; role: string }>;
}) {
  const [role, setRole] = useState(row.route_role);
  const [fallback, setFallback] = useState(row.fallback_profile_id ?? "");
  const queryClient = useQueryClient();
  const save = useServerFn(setTicketRouting);
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: row.id,
          routeRole: role,
          fallbackProfileId: fallback === "" ? null : fallback,
        },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ticket-routing"] }),
  });

  const dirty = role !== row.route_role || (fallback || null) !== row.fallback_profile_id;

  return (
    <tr className="hover:bg-muted/60">
      <td className="px-3 py-1.5 font-mono text-[11px]">{row.category}</td>
      <td className="px-3 py-1.5">
        <select
          className={selectClass}
          aria-label={`Role for ${row.category}`}
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {/* Keep any legacy value selectable so a save never silently changes it. */}
          {[...new Set([...ROUTE_ROLES, row.route_role])].map((r) => (
            <option key={r} value={r}>
              {humanize(r)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-1.5">
        <select
          className={cn(selectClass, "min-w-40")}
          aria-label={`Fallback person for ${row.category}`}
          value={fallback}
          onChange={(e) => setFallback(e.target.value)}
        >
          <option value="">No fallback</option>
          {team.map((p) => (
            <option key={p.id} value={p.id}>
              {assigneeLabel(p, humanize)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-1.5 text-right">
        <button
          type="button"
          disabled={!dirty || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="rounded-sm border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
        {mutation.isError ? (
          <p role="alert" className="mt-1 text-[11px] text-destructive">
            {(mutation.error as Error).message}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * Say why the fallback list is shorter than the staff directory.
 *
 * Without this the picker looks broken: the same names that appear everywhere
 * else in the app are missing here, with nothing on screen to explain it. The
 * cause is real and not fixable by widening the query — a fallback is routed
 * live tickets and has to be able to sign in and work them.
 */
function PoolNote({
  assignable,
  directory,
  ready,
}: {
  assignable: number;
  directory: number;
  ready: boolean;
}) {
  if (!ready) return null;
  const note = unlinkedStaffNote({ assignable, directory });
  if (!note) return null;

  return (
    <p className="max-w-2xl rounded-md border border-border bg-surface px-3 py-2 text-[12px] text-muted-foreground">
      {note}{" "}
      <Link to="/admin/users" className="font-medium text-foreground hover:underline">
        Invite them on Admin → Users
      </Link>{" "}
      to make them routable.
    </p>
  );
}
