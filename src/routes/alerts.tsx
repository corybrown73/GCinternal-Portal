import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageBody, PageHeader } from "@/components/page";
import { NoRows } from "@/components/record";
import { ackAlert, getAlerts } from "@/lib/tickets.functions";
import { humanize } from "@/lib/hub-format";
import { cn } from "@/lib/utils";
import { When } from "@/components/when";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts — GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "Escalations: SLA breaches, deals stuck past their stage limit, AI readings that gave up, integration failures and API alerts.",
      },
    ],
  }),
  component: AlertsPage,
});

/** What each kind is called on the page; anything new reads through humanize. */
const KIND_LABEL: Record<string, string> = {
  sla_breach: "SLA breach",
  stalled_implementation: "Stuck",
  overdue_milestone: "Overdue milestone",
  ai_job_failed: "AI reading",
  webhook_exhausted: "Webhook",
  webhook_endpoint_disabled: "Webhook",
  sf_rewon_after_completion: "Salesforce",
  audit_write_failed: "Audit log",
  handoff_returned: "Handoff returned",
  champion_gone_quiet: "Champion quiet",
  launch_date_at_risk: "Launch at risk",
  external: "API",
};

const SEVERITY_CLASS: Record<string, string> = {
  critical: "bg-status-blocked text-status-blocked-foreground",
  warning: "bg-status-risk text-status-risk-foreground",
  info: "bg-muted text-muted-foreground",
};

function AlertsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["alerts"], queryFn: () => getAlerts() });
  const ack = useServerFn(ackAlert);
  const mutation = useMutation({
    mutationFn: (alertId: string) => ack({ data: { alertId } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const alerts = query.data ?? [];
  const open = alerts.filter((a) => !a.acknowledged_at);
  const acked = alerts.filter((a) => a.acknowledged_at);

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Escalations only: tickets past their first-response SLA, deals stuck past their stage's escalate limit, AI readings that gave up, failed webhook deliveries and Salesforce sync problems, and alerts sent in through the API. Everyday attention items stay on Home."
        actions={
          <span className="font-mono text-[11px] text-muted-foreground">{open.length} open</span>
        }
      />
      <PageBody className="space-y-4">
        {query.isPending ? (
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Loading alerts…
          </p>
        ) : query.isError ? (
          <p role="alert" className="text-[13px] text-destructive">
            Could not load alerts: {(query.error as Error).message}
          </p>
        ) : (
          <>
            <AlertList
              title="Unacknowledged"
              rows={open}
              emptyLabel="Nothing needs acknowledging."
              action={(id) => (
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(id)}
                  className="shrink-0 rounded-sm border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                >
                  Acknowledge
                </button>
              )}
            />
            <AlertList title="Acknowledged" rows={acked} emptyLabel="No acknowledged alerts yet." />
          </>
        )}
        {mutation.isError ? (
          <p role="alert" className="text-[12px] text-destructive">
            {(mutation.error as Error).message}
          </p>
        ) : null}
      </PageBody>
    </>
  );
}

type AlertItem = Awaited<ReturnType<typeof getAlerts>>[number];

function AlertList({
  title,
  rows,
  emptyLabel,
  action,
}: {
  title: string;
  rows: AlertItem[];
  emptyLabel: string;
  action?: (alertId: string) => React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em]">{title}</h2>
        <span className="font-mono text-[11px] text-muted-foreground">{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <NoRows label={emptyLabel} />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
                      SEVERITY_CLASS[a.severity] ?? "bg-muted text-muted-foreground",
                    )}
                  >
                    {humanize(a.severity)}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {KIND_LABEL[a.kind] ?? humanize(a.kind)}
                  </span>
                  <p className="text-[13px] font-medium">{a.title}</p>
                </div>
                {a.detail ? (
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{a.detail}</p>
                ) : null}
                <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                  <When value={a.created_at} />
                  {a.customer_id ? (
                    <>
                      {" · "}
                      <Link
                        to="/customers/$customerId"
                        params={{ customerId: a.customer_id }}
                        search={a.implementation_id ? { impl: a.implementation_id } : {}}
                        className="hover:underline"
                      >
                        {a.customer_name ?? "Customer"}
                      </Link>
                    </>
                  ) : a.deal_id ? (
                    <>
                      {" · "}
                      <Link
                        to="/deals/$dealId"
                        params={{ dealId: a.deal_id }}
                        className="hover:underline"
                      >
                        Open the deal
                      </Link>
                    </>
                  ) : null}
                  {a.source !== "system" ? ` · via ${a.source}` : null}
                  {a.acknowledged_at ? (
                    <>
                      {" · acknowledged "}
                      <When value={a.acknowledged_at} />
                    </>
                  ) : null}
                </p>
              </div>
              {action ? action(a.id) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
