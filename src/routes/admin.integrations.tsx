import { Fragment, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Copy } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { NoRows, Panel } from "@/components/record";
import { fmtDateTime, stageLabel } from "@/lib/hub-format";
import { cn } from "@/lib/utils";
import {
  addWebhookEndpoint,
  getFieldMaps,
  getIntegrationStatus,
  getNeedsTemplate,
  getSyncLog,
  getWebhookDeliveries,
  getWebhookEndpoints,
  previewPayload,
  redeliverWebhookDelivery,
  rerunSyncLogRow,
  sendWebhookTestEvent,
  setIntegrationFeatureFlag,
  toggleWebhookEndpoint,
  upsertFieldMap,
} from "@/lib/sf-integration.functions";

/**
 * /admin/integrations — the operator's window onto the Salesforce integration.
 *
 * Four surfaces on one page rather than four routes: status and flags, the sync
 * log (with the full decision record behind every row), field maps, and
 * webhooks. The sync log is the point of the page — it is where "why does this
 * implementation exist, and why this template?" is answered from evidence
 * instead of from someone's memory.
 */

const statusQuery = queryOptions({
  queryKey: ["admin", "integrations", "status"],
  queryFn: () => getIntegrationStatus(),
});
const syncLogQuery = queryOptions({
  queryKey: ["admin", "integrations", "sync-log"],
  queryFn: () => getSyncLog({ data: {} }),
});
const fieldMapQuery = queryOptions({
  queryKey: ["admin", "integrations", "field-maps"],
  queryFn: () => getFieldMaps(),
});
const endpointsQuery = queryOptions({
  queryKey: ["admin", "integrations", "endpoints"],
  queryFn: () => getWebhookEndpoints(),
});
const deliveriesQuery = queryOptions({
  queryKey: ["admin", "integrations", "deliveries"],
  queryFn: () => getWebhookDeliveries({ data: {} }),
});
const needsTemplateQuery = queryOptions({
  queryKey: ["admin", "integrations", "needs-template"],
  queryFn: () => getNeedsTemplate(),
});

export const Route = createFileRoute("/admin/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Admin | GoCanvas Handoff Hub" }] }),
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(statusQuery).catch(() => {});
    void context.queryClient.ensureQueryData(syncLogQuery).catch(() => {});
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load integrations: {error.message}
    </div>
  ),
  component: IntegrationsPage,
});

const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50";
const primaryButtonClass =
  "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
const cellClass = "px-2 py-1.5 align-top text-[12px]";

const TABS = ["Status", "Sync log", "Field maps", "Webhooks"] as const;
type Tab = (typeof TABS)[number];

function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>("Status");

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Salesforce field mapping, the inbound exchange record, and outbound webhooks. Everything here is audited; nothing here shows a webhook signing secret."
        actions={
          <Link to="/admin" className={buttonClass}>
            <ChevronLeft className="h-3 w-3" strokeWidth={1.75} /> Admin
          </Link>
        }
      />
      <PageBody>
        <div className="mb-4 flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "-mb-px border-b-2 px-2 py-1.5 text-[12px]",
                tab === t
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Status" ? <StatusTab /> : null}
        {tab === "Sync log" ? <SyncLogTab /> : null}
        {tab === "Field maps" ? <FieldMapsTab /> : null}
        {tab === "Webhooks" ? <WebhooksTab /> : null}
      </PageBody>
    </>
  );
}

/* --------------------------------------------------------------- status */

function StatusTab() {
  const { data: status } = useSuspenseQuery(statusQuery);
  const { data: needsTemplate } = useSuspenseQuery(needsTemplateQuery);
  const queryClient = useQueryClient();
  const setFlag = useServerFn(setIntegrationFeatureFlag);

  const flip = useMutation({
    mutationFn: (input: { flag: "sf_auto_create" | "sf_presale_bridge"; enabled: boolean }) =>
      setFlag({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "integrations"] }),
  });

  return (
    <div className="space-y-4">
      <Panel
        title="Feature flags"
        meta="Both ship off. Turn on auto-create first, against a test key."
      >
        <div className="divide-y divide-border">
          <FlagRow
            name="sf_auto_create"
            title="Salesforce auto-create"
            detail="POST /api/v1/implementations creates customers and implementations, adopts a customer an earlier handoff already made, and links the deal. Off: the endpoint returns 503."
            enabled={status.flags.sf_auto_create}
            busy={flip.isPending}
            onToggle={(enabled) => flip.mutate({ flag: "sf_auto_create", enabled })}
          />
          <FlagRow
            name="sf_presale_bridge"
            title="Presale stage bridge"
            detail="Moves the matched deal's stage — closed-won on ingest, and the onboarding tail forward from delivery progress. Forward only, never backward. The deal↔customer link is NOT gated by this: it is part of auto-create, because it is what stops a human duplicating the same records from the deal page."
            enabled={status.flags.sf_presale_bridge}
            busy={flip.isPending}
            onToggle={(enabled) => flip.mutate({ flag: "sf_presale_bridge", enabled })}
          />
        </div>
        {status.killSwitch ? (
          <p className="px-3 py-2 text-[12px] text-destructive">
            SF_INTEGRATION_DISABLED=1 is set: the integration is off regardless of these flags.
          </p>
        ) : null}
        {!status.flags.journey_templates ? (
          <p className="px-3 py-2 text-[12px] text-muted-foreground">
            The <code>journey_templates</code> flag is off, so a matched template is recorded in the
            sync log but not applied — every new implementation lands in the needs-template queue.
          </p>
        ) : null}
      </Panel>

      <Panel title="Last 24 hours">
        <dl className="grid grid-cols-2 gap-3 px-3 py-3 sm:grid-cols-5">
          <Stat label="Exchanges" value={status.counts.sync_log_24h} />
          <Stat label="Rejected / failed" value={status.counts.failed_24h} />
          <Stat label="Events waiting" value={status.counts.undispatched_events} />
          <Stat label="Active endpoints" value={status.counts.endpoints} />
          <Stat label="Needs template" value={status.counts.needs_template} />
        </dl>
      </Panel>

      <Panel title="Needs a template" count={needsTemplate.length}>
        {needsTemplate.length === 0 ? (
          <NoRows label="Every Salesforce-created implementation has a plan." />
        ) : (
          <table className="w-full">
            <tbody className="divide-y divide-border">
              {needsTemplate.map((row) => (
                <tr key={row.id}>
                  <td className={cellClass}>
                    <Link
                      to="/customers/$customerId"
                      params={{ customerId: row.customer_id }}
                      search={{ impl: row.id } as never}
                      className="hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className={cn(cellClass, "font-mono text-[11px] text-muted-foreground")}>
                    {row.salesforce_opportunity_id ?? "—"}
                  </td>
                  <td className={cn(cellClass, "text-muted-foreground")}>
                    {stageLabel(row.current_stage)}
                  </td>
                  <td className={cn(cellClass, "text-muted-foreground")}>
                    {fmtDateTime(row.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className={labelClass}>{label}</dt>
      <dd className="mt-0.5 text-[15px] font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function FlagRow({
  name,
  title,
  detail,
  enabled,
  busy,
  onToggle,
}: {
  name: string;
  title: string;
  detail: string;
  enabled: boolean;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <div>
        <p className="text-[13px] font-medium">
          {title} <code className="text-[11px] text-muted-foreground">{name}</code>
        </p>
        <p className="mt-0.5 max-w-3xl text-[12px] text-muted-foreground">{detail}</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onToggle(!enabled)}
        className={enabled ? primaryButtonClass : buttonClass}
      >
        {enabled ? "On" : "Off"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- sync log */

function SyncLogTab() {
  const { data: rows } = useSuspenseQuery(syncLogQuery);
  const queryClient = useQueryClient();
  const rerun = useServerFn(rerunSyncLogRow);
  const [open, setOpen] = useState<string | null>(null);

  const rerunRow = useMutation({
    mutationFn: (id: string) => rerun({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "integrations"] }),
  });

  return (
    <Panel
      title="Sync log"
      count={rows.length}
      meta="Cross-system exchanges. A replay writes nothing — the drift report says what Salesforce now claims and what the hub still holds."
    >
      {rows.length === 0 ? (
        <NoRows label="No exchanges recorded yet." />
      ) : (
        <table className="w-full">
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr>
                  <td className={cn(cellClass, "text-muted-foreground")}>
                    {fmtDateTime(row.created_at)}
                  </td>
                  <td className={cellClass}>{row.kind}</td>
                  <td className={cn(cellClass, "font-mono text-[11px]")}>
                    {row.external_id ?? "—"}
                  </td>
                  <td className={cellClass}>
                    <span
                      className={cn(
                        "rounded-sm px-1.5 py-0.5 text-[11px]",
                        row.status === "failed" || row.status === "rejected"
                          ? "bg-status-blocked text-status-blocked-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className={cn(cellClass, "text-right")}>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => setOpen(open === row.id ? null : row.id)}
                    >
                      {open === row.id ? "Hide" : "Why"}
                    </button>{" "}
                    {row.status === "failed" || row.status === "rejected" ? (
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={rerunRow.isPending}
                        onClick={() => rerunRow.mutate(row.id)}
                      >
                        Re-run
                      </button>
                    ) : null}
                  </td>
                </tr>
                {open === row.id ? (
                  <tr>
                    <td colSpan={5} className="bg-muted/40 px-2 py-2">
                      <p className={labelClass}>Decision</p>
                      <pre className="mt-1 max-h-96 overflow-auto rounded-sm border border-border bg-background p-2 text-[11px]">
                        {JSON.stringify(row.decision, null, 2)}
                      </pre>
                      <p className={cn(labelClass, "mt-2")}>Payload received</p>
                      <pre className="mt-1 max-h-64 overflow-auto rounded-sm border border-border bg-background p-2 text-[11px]">
                        {JSON.stringify(row.request_payload, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------- field maps */

function FieldMapsTab() {
  const { data: maps } = useSuspenseQuery(fieldMapQuery);
  const queryClient = useQueryClient();
  const save = useServerFn(upsertFieldMap);
  const preview = useServerFn(previewPayload);
  const [sample, setSample] = useState("");
  const [result, setResult] = useState<unknown>(null);

  const saveMap = useMutation({
    mutationFn: (input: {
      id: string | null;
      direction: "inbound" | "outbound";
      source_path: string;
      target_field: string;
      transform: string | null;
      fill_policy: "never" | "if_blank";
      required: boolean;
      active: boolean;
    }) => save({ data: input as never }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "integrations"] }),
  });
  const runPreview = useMutation({
    mutationFn: () => preview({ data: { payload: sample } }),
    onSuccess: (r) => setResult(r),
  });

  return (
    <div className="space-y-4">
      <Panel
        title="Salesforce field mapping"
        count={maps.length}
        meta="Not the per-implementation customer-data mapping on the Customer 360 — this maps Salesforce payload fields to hub columns and back."
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className={cn(cellClass, "text-left", labelClass)}>Direction</th>
              <th className={cn(cellClass, "text-left", labelClass)}>Source</th>
              <th className={cn(cellClass, "text-left", labelClass)}>Target</th>
              <th className={cn(cellClass, "text-left", labelClass)}>Transform</th>
              <th className={cn(cellClass, "text-left", labelClass)}>On replay</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {maps.map((m) => (
              <tr key={m.id}>
                <td className={cellClass}>{m.direction}</td>
                <td className={cn(cellClass, "font-mono text-[11px]")}>{m.source_path}</td>
                <td className={cn(cellClass, "font-mono text-[11px]")}>{m.target_field}</td>
                <td className={cn(cellClass, "text-muted-foreground")}>{m.transform ?? "none"}</td>
                <td className={cellClass}>
                  <select
                    className={inputClass}
                    value={m.fill_policy}
                    disabled={saveMap.isPending}
                    onChange={(e) =>
                      saveMap.mutate({
                        id: m.id ?? null,
                        direction: m.direction,
                        source_path: m.source_path,
                        target_field: m.target_field,
                        transform: m.transform,
                        fill_policy: e.target.value as "never" | "if_blank",
                        required: m.required,
                        active: m.active,
                      })
                    }
                  >
                    <option value="never">never fill</option>
                    <option value="if_blank">fill if blank</option>
                  </select>
                </td>
                <td className={cn(cellClass, "text-muted-foreground")}>
                  {m.active ? "active" : "off"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-3 py-2 text-[12px] text-muted-foreground">
          <strong>Fill if blank</strong> lets a later replay write a field a person deliberately
          left empty. Every such fill is audited and posted to the implementation&apos;s journal,
          but the safe answer is <strong>never</strong> — a blank a human left is recorded state.
        </p>
      </Panel>

      <Panel
        title="Test a payload"
        meta="Nothing is written. Shows the mapped output and every template rule that was evaluated."
      >
        <div className="space-y-2 px-3 py-2">
          <label className={labelClass} htmlFor="sample">
            Opportunity JSON
          </label>
          <textarea
            id="sample"
            rows={8}
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            className="w-full rounded-sm border border-border bg-background p-2 font-mono text-[11px] outline-none focus:ring-1 focus:ring-ring"
            placeholder='{"salesforce_opportunity_id":"0066g00000ABCDEAA5", …}'
          />
          <button
            type="button"
            className={primaryButtonClass}
            disabled={runPreview.isPending || sample.trim() === ""}
            onClick={() => runPreview.mutate()}
          >
            Evaluate
          </button>
          {result ? (
            <pre className="max-h-96 overflow-auto rounded-sm border border-border bg-background p-2 text-[11px]">
              {JSON.stringify(result, null, 2)}
            </pre>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

/* -------------------------------------------------------------- webhooks */

function WebhooksTab() {
  const { data: endpoints } = useSuspenseQuery(endpointsQuery);
  const { data: deliveries } = useSuspenseQuery(deliveriesQuery);
  const queryClient = useQueryClient();
  const add = useServerFn(addWebhookEndpoint);
  const toggle = useServerFn(toggleWebhookEndpoint);
  const redeliver = useServerFn(redeliverWebhookDelivery);
  const test = useServerFn(sendWebhookTestEvent);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [freshSecret, setFreshSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "integrations"] });

  const create = useMutation({
    mutationFn: () => add({ data: { name, url, eventTypes: [] } }),
    onSuccess: (r) => {
      setFreshSecret(r.secret);
      setName("");
      setUrl("");
      void invalidate();
    },
  });
  const setActive = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => toggle({ data: input }),
    onSuccess: invalidate,
  });
  const resend = useMutation({
    mutationFn: (id: string) => redeliver({ data: { id } }),
    onSuccess: invalidate,
  });
  const sendTest = useMutation({
    mutationFn: (endpointId: string) => test({ data: { endpointId } }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-4">
      {freshSecret ? (
        <Panel title="Signing secret — shown once" level="primary">
          <div className="space-y-2 px-3 py-2">
            <p className="text-[12px] text-muted-foreground">
              Copy this now. Only the last four characters and an encrypted copy are stored; no page
              or endpoint in this application can show it again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-sm border border-border bg-muted px-2 py-1 font-mono text-[11px]">
                {freshSecret}
              </code>
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  void navigator.clipboard.writeText(freshSecret);
                  setCopied(true);
                }}
              >
                <Copy className="h-3 w-3" strokeWidth={1.75} /> {copied ? "Copied" : "Copy"}
              </button>
              <button type="button" className={buttonClass} onClick={() => setFreshSecret(null)}>
                Done
              </button>
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel title="Endpoints" count={endpoints.length}>
        <div className="flex flex-wrap items-end gap-2 border-b border-border px-3 py-2">
          <div className="w-48">
            <label className={labelClass} htmlFor="wh-name">
              Name
            </label>
            <input
              id="wh-name"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="min-w-64 flex-1">
            <label className={labelClass} htmlFor="wh-url">
              URL
            </label>
            <input
              id="wh-url"
              className={inputClass}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.zapier.com/…"
            />
          </div>
          <button
            type="button"
            className={primaryButtonClass}
            disabled={create.isPending || name.trim() === "" || url.trim() === ""}
            onClick={() => create.mutate()}
          >
            Add endpoint
          </button>
        </div>
        {endpoints.length === 0 ? (
          <NoRows label="No endpoints. With none configured, the dispatch cron does nothing." />
        ) : (
          <table className="w-full">
            <tbody className="divide-y divide-border">
              {endpoints.map((e) => (
                <tr key={e.id}>
                  <td className={cellClass}>{e.name}</td>
                  <td className={cn(cellClass, "break-all font-mono text-[11px]")}>{e.url}</td>
                  <td className={cn(cellClass, "text-muted-foreground")}>…{e.secret_last4}</td>
                  <td className={cn(cellClass, "text-muted-foreground")}>
                    {e.active ? "active" : (e.disabled_reason ?? "disabled")}
                  </td>
                  <td className={cn(cellClass, "text-right")}>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={sendTest.isPending}
                      onClick={() => sendTest.mutate(e.id)}
                    >
                      Send test
                    </button>{" "}
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={setActive.isPending}
                      onClick={() => setActive.mutate({ id: e.id, active: !e.active })}
                    >
                      {e.active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Deliveries" count={deliveries.length}>
        {deliveries.length === 0 ? (
          <NoRows label="Nothing delivered yet." />
        ) : (
          <table className="w-full">
            <tbody className="divide-y divide-border">
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td className={cn(cellClass, "text-muted-foreground")}>
                    {fmtDateTime(d.created_at)}
                  </td>
                  <td className={cellClass}>{d.status}</td>
                  <td className={cn(cellClass, "tabular-nums text-muted-foreground")}>
                    attempt {d.attempt}
                  </td>
                  <td className={cn(cellClass, "text-muted-foreground")}>
                    {d.response_status ?? d.last_error ?? "—"}
                  </td>
                  <td className={cn(cellClass, "text-right")}>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={resend.isPending}
                      onClick={() => resend.mutate(d.id)}
                    >
                      Redeliver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
