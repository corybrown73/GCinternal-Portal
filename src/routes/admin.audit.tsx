import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { Field, NoRows, Panel } from "@/components/record";
import { getAuditHealth } from "@/lib/hygiene.functions";
import { fmtDateTime } from "@/lib/hub-format";

const healthQuery = queryOptions({
  queryKey: ["admin", "audit-health"],
  queryFn: () => getAuditHealth(),
});

export const Route = createFileRoute("/admin/audit")({
  head: () => ({ meta: [{ title: "Audit health — Admin | GoCanvas Handoff Hub" }] }),
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(healthQuery).catch(() => {});
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load audit health: {error.message}
    </div>
  ),
  component: AuditHealthPage,
});

const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";

/**
 * Does the audit log actually record what happened?
 *
 * The database writes an `.observed` row transactionally with every API-key and
 * role change, and the app writes an attributed row separately. An observed row
 * with no attributed sibling is not a duplicate — it is the evidence that the
 * app-side audit failed silently, which is the failure this page exists to make
 * impossible to miss.
 */
function AuditHealthPage() {
  const { data } = useSuspenseQuery(healthQuery);
  const unattributed = data.observed.filter((o) => o.unattributed);

  return (
    <>
      <PageHeader
        title="Audit health"
        description="An audit write that can fail quietly is worse than no audit, because an empty history reads as “nothing happened” rather than as “we don’t know”. This page is how you find out."
        actions={
          <Link to="/admin" className={buttonClass}>
            <ChevronLeft className="h-3 w-3" /> Admin
          </Link>
        }
      />
      <PageBody className="max-w-3xl space-y-4">
        <Panel title="Right now" level="primary">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-3 py-3 md:grid-cols-4">
            <Field label="Failures this instance" value={String(data.processFailures)} />
            <Field label="Open failure alerts" value={String(data.openAlerts)} />
            <Field label="Strict mode" value={data.strict ? "On" : "Off"} />
            <Field label="Activity feed" value={data.activityFeed ? "On" : "Off"} />
          </dl>
          {data.processFailures > 0 ? (
            <div className="border-t border-border px-3 py-2">
              <p className="text-[12px] text-destructive">
                Last failure: {data.lastFailureAction} — {data.lastFailureError}
                {data.lastFailureAt ? ` (${fmtDateTime(data.lastFailureAt)})` : ""}
              </p>
            </div>
          ) : null}
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            The counter is per serverless instance and resets on deploy — a smoke alarm, not a
            ledger. The alert count is the durable one.
          </p>
        </Panel>

        <Panel
          title="Database-observed changes"
          level="supporting"
          meta={
            unattributed.length
              ? `${unattributed.length} with no attributed record`
              : "all attributed"
          }
        >
          <p className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
            Every API-key and role change writes one of these from a trigger, transactionally with
            the change itself — so the change cannot happen without the row, whatever the app code
            does. A row marked “no attributed record” means the app-side audit write for the same
            event did not land.
          </p>
          {data.observed.length === 0 ? (
            <NoRows label="No observed changes yet." />
          ) : (
            <ul className="divide-y divide-border">
              {data.observed.map((o) => (
                <li key={o.id} className="flex items-start gap-3 px-3 py-2">
                  <span
                    className={
                      o.unattributed
                        ? "mt-0.5 shrink-0 rounded-sm border border-destructive/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-destructive"
                        : "mt-0.5 shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
                    }
                  >
                    {o.unattributed ? "Unattributed" : "Matched"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium">{o.action}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {o.entity_id ?? "—"} · {fmtDateTime(o.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
