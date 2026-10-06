import { Fragment, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Copy, Plus, Trash2 } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { NoRows, Panel, TableScroll } from "@/components/record";
import { stageLabel } from "@/lib/hub-format";
import { cn } from "@/lib/utils";
import {
  addWebhookEndpoint,
  getFieldMaps,
  getIntegrationStatus,
  getNeedsTemplate,
  getSyncLog,
  getWebhookDeliveries,
  getWebhookEndpoints,
  previewClosedWonPayload,
  previewPayload,
  redeliverWebhookDelivery,
  removeFieldMap,
  rerunSyncLogRow,
  sendWebhookTestEvent,
  setIntegrationFeatureFlag,
  toggleWebhookEndpoint,
  upsertFieldMap,
} from "@/lib/sf-integration.functions";
import { DEAL_FIELD_GROUP_LABEL, DEAL_FIELDS, dealField } from "@/lib/deal-field-catalog";
import { TRANSFORMS, type FieldMap, type FieldMapDirection } from "@/lib/server/sf-field-maps";
import { When } from "@/components/when";
import { errorMessage } from "@/lib/error-message";

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
      Could not load integrations: {errorMessage(error)}
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

const TABS = ["Zapier", "Status", "Sync log", "Field maps", "Webhooks"] as const;
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

        {tab === "Zapier" ? <ZapierTab /> : null}
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
            detail="Moves the matched deal's stage — closed-won on ingest, and the onboarding tail forward from delivery progress. Forward only, never backward. It does not gate the deal↔customer link, which Start onboarding writes on the deal page under the account model and needs no Salesforce at all; auto-create writes the same link for opportunities that arrive through the API."
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
          <TableScroll>
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
                      <When value={row.created_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
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
        <TableScroll>
          <table className="w-full">
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <Fragment key={row.id}>
                  <tr>
                    <td className={cn(cellClass, "text-muted-foreground")}>
                      <When value={row.created_at} />
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
        </TableScroll>
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------- field maps */

type MapInput = {
  id: string | null;
  direction: FieldMapDirection;
  source_path: string;
  target_field: string;
  transform: string | null;
  fill_policy: "never" | "if_blank";
  required: boolean;
  active: boolean;
};

const DIRECTION_COPY: Record<
  FieldMapDirection,
  { title: string; meta: string; source: string; target: string }
> = {
  inbound_deal: {
    title: "Closed-won deal map",
    meta: "What POST /api/v1/closed-won reads: a sender's field → the deal, its people, its intake. The map is applied before the built-in aliases, so a mapped field always wins. Dotted paths read into a nested record (Account.Name, TIS_Assigned__r.Email).",
    source: "Salesforce field or path",
    target: "Deal field",
  },
  inbound: {
    title: "Project map",
    meta: "What POST /api/v1/implementations reads: an Opportunity field → a project column. Older route; the deal map above is the one Salesforce uses at close.",
    source: "Opportunity field",
    target: "Project column",
  },
  outbound: {
    title: "Write-back to Salesforce",
    meta: "What a salesforce.write_back webhook carries: a hub field → a Salesforce API name.",
    source: "Hub field",
    target: "Salesforce API name",
  },
};

function FieldMapsTab() {
  const { data: maps } = useSuspenseQuery(fieldMapQuery);
  const queryClient = useQueryClient();
  const save = useServerFn(upsertFieldMap);
  const remove = useServerFn(removeFieldMap);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "integrations"] });
  const saveMap = useMutation({
    mutationFn: (input: MapInput) => save({ data: input as never }),
    onSuccess: invalidate,
  });
  const removeMap = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: invalidate,
  });
  const byDirection = (d: FieldMapDirection) => maps.filter((m) => m.direction === d);

  return (
    <div className="space-y-4">
      {(["inbound_deal", "inbound", "outbound"] as const).map((d) => (
        <MapPanel
          key={d}
          direction={d}
          rows={byDirection(d)}
          busy={saveMap.isPending || removeMap.isPending}
          error={saveMap.error ?? removeMap.error}
          onSave={(input) => saveMap.mutate(input)}
          onRemove={(id) => removeMap.mutate(id)}
        />
      ))}

      <ClosedWonPreviewPanel />
      <ProjectPreviewPanel />
    </div>
  );
}

function MapPanel({
  direction,
  rows,
  busy,
  error,
  onSave,
  onRemove,
}: {
  direction: FieldMapDirection;
  rows: FieldMap[];
  busy: boolean;
  error: unknown;
  onSave: (input: MapInput) => void;
  onRemove: (id: string) => void;
}) {
  const copy = DIRECTION_COPY[direction];
  const isDeal = direction === "inbound_deal";
  const [draft, setDraft] = useState<{
    source_path: string;
    target_field: string;
    transform: string;
    required: boolean;
  }>({
    source_path: "",
    target_field: isDeal ? "company" : "",
    transform: "none",
    required: false,
  });
  const canAdd = draft.source_path.trim() !== "" && draft.target_field.trim() !== "";
  const add = () => {
    if (!canAdd) return;
    onSave({
      id: null,
      direction,
      source_path: draft.source_path.trim(),
      target_field: draft.target_field.trim(),
      transform: draft.transform === "none" ? null : draft.transform,
      fill_policy: "never",
      required: draft.required,
      active: true,
    });
    setDraft({
      source_path: "",
      target_field: isDeal ? "company" : "",
      transform: "none",
      required: false,
    });
  };
  const toRow = (m: FieldMap): MapInput => ({
    id: m.id ?? null,
    direction: m.direction,
    source_path: m.source_path,
    target_field: m.target_field,
    transform: m.transform,
    fill_policy: m.fill_policy,
    required: m.required,
    active: m.active,
  });

  return (
    <Panel title={copy.title} count={rows.length} meta={copy.meta}>
      <TableScroll>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className={cn(cellClass, "text-left", labelClass)}>{copy.source}</th>
              <th className={cn(cellClass, "text-left", labelClass)}>{copy.target}</th>
              <th className={cn(cellClass, "text-left", labelClass)}>Transform</th>
              {!isDeal ? (
                <th className={cn(cellClass, "text-left", labelClass)}>On replay</th>
              ) : null}
              <th className={cn(cellClass, "text-left", labelClass)}>Required</th>
              <th className={cn(cellClass, "text-left", labelClass)}>Active</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className={cn(cellClass, "text-muted-foreground")}>
                  {isDeal
                    ? "No rows yet. Without a map the endpoint still understands the common names (company, amount, rep_email, tis…); add a row for every Salesforce field that is named differently."
                    : "No rows."}
                </td>
              </tr>
            ) : null}
            {rows.map((m) => {
              const target = isDeal ? dealField(m.target_field) : null;
              return (
                <tr key={m.id ?? `${m.source_path}→${m.target_field}`}>
                  <td className={cn(cellClass, "font-mono text-[11px]")}>{m.source_path}</td>
                  <td className={cellClass}>
                    {target ? (
                      <span title={target.hint}>
                        {target.label}{" "}
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {m.target_field}
                        </span>
                      </span>
                    ) : (
                      <span className="font-mono text-[11px]">{m.target_field}</span>
                    )}
                  </td>
                  <td className={cellClass}>
                    <select
                      className={inputClass}
                      value={m.transform ?? "none"}
                      disabled={busy}
                      onChange={(e) =>
                        onSave({
                          ...toRow(m),
                          transform: e.target.value === "none" ? null : e.target.value,
                        })
                      }
                    >
                      {TRANSFORMS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  {!isDeal ? (
                    <td className={cellClass}>
                      <select
                        className={inputClass}
                        value={m.fill_policy}
                        disabled={busy}
                        onChange={(e) =>
                          onSave({
                            ...toRow(m),
                            fill_policy: e.target.value as "never" | "if_blank",
                          })
                        }
                      >
                        <option value="never">never fill</option>
                        <option value="if_blank">fill if blank</option>
                      </select>
                    </td>
                  ) : null}
                  <td className={cellClass}>
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={m.required}
                      disabled={busy}
                      onChange={(e) => onSave({ ...toRow(m), required: e.target.checked })}
                    />
                  </td>
                  <td className={cellClass}>
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={m.active}
                      disabled={busy}
                      onChange={(e) => onSave({ ...toRow(m), active: e.target.checked })}
                    />
                  </td>
                  <td className={cn(cellClass, "text-right")}>
                    {m.id ? (
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={busy}
                        title="Remove this row"
                        onClick={() => onRemove(m.id!)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-muted/20">
              <td className={cellClass}>
                <input
                  className={cn(inputClass, "font-mono")}
                  placeholder={isDeal ? "TIS_Assigned__r.Email" : "field"}
                  value={draft.source_path}
                  disabled={busy}
                  onChange={(e) => setDraft({ ...draft, source_path: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") add();
                  }}
                />
              </td>
              <td className={cellClass}>
                {isDeal ? (
                  <select
                    className={inputClass}
                    value={draft.target_field}
                    disabled={busy}
                    onChange={(e) => setDraft({ ...draft, target_field: e.target.value })}
                    title={dealField(draft.target_field)?.hint}
                  >
                    {(["deal", "people", "facts", "handoff"] as const).map((g) => (
                      <optgroup key={g} label={DEAL_FIELD_GROUP_LABEL[g]}>
                        {DEAL_FIELDS.filter((f) => f.group === g).map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                ) : (
                  <input
                    className={cn(inputClass, "font-mono")}
                    placeholder={direction === "outbound" ? "GCHub_Field__c" : "column"}
                    value={draft.target_field}
                    disabled={busy}
                    onChange={(e) => setDraft({ ...draft, target_field: e.target.value })}
                  />
                )}
              </td>
              <td className={cellClass}>
                <select
                  className={inputClass}
                  value={draft.transform}
                  disabled={busy}
                  onChange={(e) => setDraft({ ...draft, transform: e.target.value })}
                >
                  {TRANSFORMS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </td>
              {!isDeal ? (
                <td className={cn(cellClass, "text-muted-foreground")}>never fill</td>
              ) : null}
              <td className={cellClass}>
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={draft.required}
                  disabled={busy}
                  onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
                />
              </td>
              <td className={cn(cellClass, "text-muted-foreground")}>on</td>
              <td className={cn(cellClass, "text-right")}>
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={busy || !canAdd}
                  onClick={add}
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </TableScroll>
      {isDeal && dealField(draft.target_field) ? (
        <p className="px-3 pb-2 text-[12px] text-muted-foreground">
          <strong>{dealField(draft.target_field)!.label}:</strong>{" "}
          {dealField(draft.target_field)!.hint}
          {dealField(draft.target_field)!.fillsBlankOnly
            ? " Written only when the deal does not have one yet."
            : ""}
        </p>
      ) : null}
      {!isDeal ? (
        <p className="px-3 py-2 text-[12px] text-muted-foreground">
          <strong>Fill if blank</strong> lets a later replay write a field a person deliberately
          left empty. Every such fill is audited and posted to the implementation&apos;s journal,
          but the safe answer is <strong>never</strong> — a blank a human left is recorded state.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="px-3 pb-2 text-[12px] text-destructive">
          {errorMessage(error)}
        </p>
      ) : null}
    </Panel>
  );
}

function ClosedWonPreviewPanel() {
  const preview = useServerFn(previewClosedWonPayload);
  const [sample, setSample] = useState("");
  const run = useMutation({ mutationFn: () => preview({ data: { payload: sample } }) });
  const r = run.data;
  return (
    <Panel
      title="Test a closed-won payload"
      meta="Nothing is written. Paste what Salesforce or the Zap will send and see what the deal map and the aliases make of it, who the TIS and the AE resolve to, and what is still unmapped."
    >
      <div className="space-y-2 px-3 py-2">
        <textarea
          rows={8}
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          className="w-full rounded-sm border border-border bg-background p-2 font-mono text-[11px] outline-none focus:ring-1 focus:ring-ring"
          placeholder='{"Name":"Acme Roofing — Forms 2026","Amount":90000,"Account":{"Name":"Acme Roofing","Id":"0016g00000XYZ12AAB"},"TIS_Assigned__r":{"Email":"priya.nair@gocanvas.com"}, …}'
        />
        <button
          type="button"
          className={primaryButtonClass}
          disabled={run.isPending || sample.trim() === ""}
          onClick={() => run.mutate()}
        >
          Evaluate
        </button>
        {run.isError ? (
          <p role="alert" className="text-[12px] text-destructive">
            {errorMessage(run.error)}
          </p>
        ) : null}
        {r ? (
          <div className="space-y-2 text-[12px]">
            {r.errors.length > 0 ? (
              <p className="text-destructive">Would be refused: {r.errors.join("; ")}</p>
            ) : (
              <p className="text-status-ontrack-foreground">Would be accepted.</p>
            )}
            {r.missing_required.length > 0 ? (
              <p className="text-destructive">
                Required mapped field(s) missing: {r.missing_required.join(", ")}
              </p>
            ) : null}
            <p>
              <span className="text-muted-foreground">TIS:</span>{" "}
              {r.tis.input
                ? r.tis.resolved
                  ? `${r.tis.input} → ${r.tis.resolved}`
                  : `${r.tis.input} — nobody on the team matches; the assignment rule would pick`
                : "none named — the assignment rule would pick"}
              {" · "}
              <span className="text-muted-foreground">AE:</span>{" "}
              {r.ae.input
                ? r.ae.matched
                  ? `${r.ae.input} (a Hub login)`
                  : `${r.ae.input} — no Hub login with that email; not recorded`
                : "none"}
            </p>
            <TableScroll>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className={cn(cellClass, "text-left", labelClass)}>Deal field</th>
                    <th className={cn(cellClass, "text-left", labelClass)}>Value</th>
                    <th className={cn(cellClass, "text-left", labelClass)}>From</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(r.row as Record<string, unknown>)
                    .filter(([, v]) => v !== undefined && v !== null && v !== "")
                    .map(([k, v]) => (
                      <tr key={k}>
                        <td className={cellClass}>{dealField(k)?.label ?? k}</td>
                        <td className={cn(cellClass, "font-mono text-[11px]")}>
                          {typeof v === "string" ? v : JSON.stringify(v)}
                        </td>
                        <td
                          className={cn(cellClass, "font-mono text-[11px] text-muted-foreground")}
                        >
                          {(r.sources as Record<string, string>)[k] ?? "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </TableScroll>
            {r.unmapped_keys.length > 0 ? (
              <p className="text-muted-foreground">
                <strong className="text-foreground">Sent but landed nowhere:</strong>{" "}
                <span className="font-mono text-[11px]">{r.unmapped_keys.join(", ")}</span>. Add a
                row above for any of these that should reach the deal.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function ProjectPreviewPanel() {
  const preview = useServerFn(previewPayload);
  const [sample, setSample] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const runPreview = useMutation({
    mutationFn: () => preview({ data: { payload: sample } }),
    onSuccess: (r) => setResult(r),
  });
  return (
    <Panel
      title="Test an Opportunity payload (project route)"
      meta="For POST /api/v1/implementations. Nothing is written. Shows the mapped output and every template rule that was evaluated."
    >
      <div className="space-y-2 px-3 py-2">
        <label className={labelClass} htmlFor="sample">
          Opportunity JSON
        </label>
        <textarea
          id="sample"
          rows={6}
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
  );
}

/* ---------------------------------------------------------------- zapier */

/**
 * Closed-won in, project out — the setup, on the page where it is needed.
 *
 * The Zap is three steps and none of them is in this app: a Sheets trigger,
 * a webhook action, and a key. What this tab does is make the second step a
 * copy-paste instead of a guess — the URL, the header and the body with the
 * column names the endpoint already understands.
 */
function ZapierTab() {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/api/v1/closed-won`;
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (label: string, text: string) =>
    void navigator.clipboard.writeText(text).then(() => setCopied(label));

  const body = `{
  "company":              "{{Account Name}}",
  "opportunity":          "{{Opportunity Name}}",
  "amount":               "{{Amount}}",
  "products":             "{{Products}}",
  "rep_email":            "{{Opportunity Owner Email}}",
  "implementation_owner": "{{TIS Assigned Email}}",
  "close_date":           "{{Close Date}}",
  "seats":                "{{Field Users}}",
  "integration_tier":     "{{Integration Tier}}",
  "industry":             "{{Industry}}",
  "path":                 "{{Onboarding Type}}",
  "contact_name":         "{{Contact Name}}",
  "contact_email":        "{{Contact Email}}",
  "contact_role":         "{{Contact Title}}",
  "salesforce_id":        "{{Account ID}}",
  "notes":                "{{Description}}"
}`;

  return (
    <div className="max-w-3xl space-y-3">
      <Panel title="Closed won → onboarding, through Zapier" level="primary">
        <div className="space-y-3 px-3 py-2.5 text-[12px]">
          <p className="text-muted-foreground">
            A Salesforce Opportunity reaching Closed Won (or a new row in the closed-won sheet)
            becomes a deal at Closed Won <em>and</em> a project with its plan, assigned to the TIS
            the record names, in one call. Delivering the same record twice updates the deal and
            never makes a second project.
          </p>

          <ol className="list-decimal space-y-3 pl-5">
            <li>
              <span className="font-medium text-foreground">A key.</span>{" "}
              <Link to="/admin/api-keys" className="underline">
                Admin → API keys → Add
              </Link>{" "}
              with the <code className="font-mono">accounts:write</code> scope. It is shown once.
            </li>
            <li>
              <span className="font-medium text-foreground">The Zap.</span> Trigger:{" "}
              <em>Salesforce → Updated Field on Record</em> (Opportunity, StageName, Closed Won), or{" "}
              <em>Google Sheets → New Spreadsheet Row</em>. Action:{" "}
              <em>Webhooks by Zapier → POST</em>, payload type <em>json</em>.
            </li>
            <li>
              <span className="font-medium text-foreground">The action, exactly.</span>
              <div className="mt-1.5 space-y-1.5">
                <Row
                  label="URL"
                  value={url}
                  onCopy={() => copy("url", url)}
                  copied={copied === "url"}
                />
                <Row
                  label="Header"
                  value="Authorization: Bearer gcp_live_…"
                  onCopy={() => copy("header", "Authorization")}
                  copied={copied === "header"}
                />
              </div>
              <p className="mt-1.5 text-muted-foreground">
                Body — map each value to the matching column. Only{" "}
                <code className="font-mono">company</code> is required; leave out any column the
                sheet does not have.
              </p>
              <div className="relative mt-1">
                <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-2.5 font-mono text-[11px] leading-relaxed">
                  {body}
                </pre>
                <button
                  type="button"
                  onClick={() => copy("body", body)}
                  className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-sm border border-border bg-background px-1.5 py-0.5 text-[11px] hover:bg-muted"
                >
                  <Copy className="h-3 w-3" /> {copied === "body" ? "Copied" : "Copy"}
                </button>
              </div>
            </li>
            <li>
              <span className="font-medium text-foreground">Test it.</span> Add a row. Within a
              minute the company is on the{" "}
              <Link to="/pipeline" className="underline">
                pipeline
              </Link>{" "}
              at Closed Won with a project behind it.
            </li>
          </ol>

          <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-muted-foreground">
            <p className="font-medium text-foreground">Field names are forgiving, and mappable.</p>
            <p className="mt-0.5">
              <code className="font-mono">Account Name</code>,{" "}
              <code className="font-mono">account</code> and{" "}
              <code className="font-mono">customer</code> all mean company;{" "}
              <code className="font-mono">Deal Value</code>, <code className="font-mono">ARR</code>{" "}
              and <code className="font-mono">amount</code> all mean amount, and “$48,000” is read
              as a number. A Salesforce link yields the account id. A bad email is dropped, not a
              reason to reject the row. Anything named differently in your org — a custom TIS field,
              an industry pick-list — gets a row on the <em>Field maps</em> tab and lands where you
              point it.
            </p>
          </div>
        </div>
      </Panel>

      <SalesforceFlowCard url={url} copied={copied} copy={copy} />

      <FieldFusionRequestCard origin={origin} copied={copied} copy={copy} />
    </div>
  );
}

/**
 * The same endpoint, called straight from Salesforce: a record-triggered Flow
 * with an HTTP Callout action, no Zapier in between. The Flow posts the
 * Opportunity as Salesforce has it; the Field maps tab says which field is
 * which. The copy here is what a Salesforce admin needs and nothing else.
 */
function SalesforceFlowCard({
  url,
  copied,
  copy,
}: {
  url: string;
  copied: string | null;
  copy: (label: string, text: string) => void;
}) {
  const body = `{
  "Id":            "{!$Record.Id}",
  "Name":          "{!$Record.Name}",
  "Amount":        {!$Record.Amount},
  "CloseDate":     "{!$Record.CloseDate}",
  "StageName":     "{!$Record.StageName}",
  "Description":   "{!$Record.Description}",
  "Account":       { "Id": "{!$Record.AccountId}", "Name": "{!$Record.Account.Name}", "Website": "{!$Record.Account.Website}", "Industry": "{!$Record.Account.Industry}" },
  "Owner":         { "Email": "{!$Record.Owner.Email}" },
  "TIS_Assigned__r": { "Email": "{!$Record.TIS_Assigned__r.Email}", "Name": "{!$Record.TIS_Assigned__r.Name}" }
}`;
  return (
    <Panel title="Closed won → onboarding, straight from Salesforce (Flow)">
      <div className="space-y-3 px-3 py-2.5 text-[12px]">
        <p className="text-muted-foreground">
          No Zapier: a record-triggered Flow on Opportunity, when StageName becomes Closed Won, runs
          an HTTP Callout to the same endpoint. Field names do not have to match ours — post the
          record as Salesforce has it and map each field on the <em>Field maps</em> tab.
        </p>
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <span className="font-medium text-foreground">A key.</span>{" "}
            <Link to="/admin/api-keys" className="underline">
              Admin → API keys → Add
            </Link>{" "}
            with the <code className="font-mono">accounts:write</code> scope. Store it in a Named
            Credential (External Credential, custom header{" "}
            <code className="font-mono">Authorization: Bearer gcp_live_…</code>), never in the Flow.
          </li>
          <li>
            <span className="font-medium text-foreground">The callout.</span> POST, JSON,{" "}
            <Row
              label="URL"
              value={url}
              onCopy={() => copy("flow-url", url)}
              copied={copied === "flow-url"}
            />
          </li>
          <li>
            <span className="font-medium text-foreground">The body.</span> Any shape works; this one
            carries what the deal needs and nests the lookups so the map can read{" "}
            <code className="font-mono">Account.Name</code> and{" "}
            <code className="font-mono">TIS_Assigned__r.Email</code>. Rename{" "}
            <code className="font-mono">TIS_Assigned__r</code> to your org&apos;s TIS lookup.
            <div className="relative mt-1">
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-2.5 font-mono text-[11px] leading-relaxed">
                {body}
              </pre>
              <button
                type="button"
                onClick={() => copy("flow-body", body)}
                className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-sm border border-border bg-background px-1.5 py-0.5 text-[11px] hover:bg-muted"
              >
                <Copy className="h-3 w-3" /> {copied === "flow-body" ? "Copied" : "Copy"}
              </button>
            </div>
          </li>
          <li>
            <span className="font-medium text-foreground">The map.</span> On <em>Field maps</em>,
            add a row per field: <code className="font-mono">Account.Name → Company</code>,{" "}
            <code className="font-mono">Account.Id → Salesforce Account id</code>,{" "}
            <code className="font-mono">Amount → Amount</code>,{" "}
            <code className="font-mono">Owner.Email → Account Executive</code>,{" "}
            <code className="font-mono">TIS_Assigned__r.Email → TIS assigned</code>. Paste one real
            record into <em>Test a closed-won payload</em> and read the result before turning the
            Flow on.
          </li>
          <li>
            <span className="font-medium text-foreground">Responses.</span> 201 created, 200 already
            onboarding (facts updated, nothing new made), 422 the body or map needs fixing, 401/403
            the key. Retry 5xx only. The same record twice is safe.
          </li>
        </ol>
      </div>
    </Panel>
  );
}

/**
 * The second Zap: the "New FF Client Request" form in GoCanvas opens a
 * Field Fusion proof-of-concept deal, with every answer kept on it. This
 * card is the copy-paste for its webhook step — the body lists a key for
 * every field on the form, so mapping it in Zapier is matching names.
 */
function FieldFusionRequestCard({
  origin,
  copied,
  copy,
}: {
  origin: string;
  copied: string | null;
  copy: (label: string, text: string) => void;
}) {
  const url = `${origin}/api/v1/field-fusion-requests`;
  const body = `{
  "submission_id":       "{{Submission ID}}",
  "submission_no":       "{{No.}}",
  "submitted_at":        "{{Date}}",
  "company_name":        "{{Company Name}}",
  "logo_url":            "{{Logo}}",
  "admin_first_name":    "{{Main Admin First Name}}",
  "admin_last_name":     "{{Main Admin Last Name}}",
  "admin_gcid":          "{{Main Admin GCID}}",
  "admin_email":         "{{Main Admin Email}}",
  "admin_phone":         "{{Main Admin Phone}}",
  "salesforce_url":      "{{SalesForce Opp/Account link}}",
  "industry":            "{{Industry}}",
  "features":            "{{Relevant Features}}",
  "analytics_needs":     "{{Describe analytics needs}}",
  "output_destinations": "{{Output Destinations}}",
  "first_use_case":      "{{First Use Case is}}",
  "process_description": "{{Description of Process}}",
  "forms_in_progress":   "{{GoCanvas Form/s In-Progress}}",
  "pdf_designer":        "{{PDF is Designer}}",
  "data_sets":           "{{Relevant Data Sets}}",
  "customers_are":       "{{Customers are}}",
  "customers_have":      "{{Customers have}}",
  "sites_are":           "{{Customer Sites have/are}}",
  "notes":               "{{Notes / Other Use Cases}}",
  "requester_name":      "{{Requester name}}",
  "requester_email":     "{{Requester email address}}"
}`;
  return (
    <Panel title="Field Fusion request → proof-of-concept deal, from GoCanvas" level="primary">
      <div className="space-y-3 px-3 py-2.5 text-[12px]">
        <p className="text-muted-foreground">
          Every <em>New FF Client Request</em> submission opens the company as a{" "}
          <strong>Prospect</strong> on the Field Fusion path, marked <strong>POC</strong> on the
          board, with the main admin as its contact and every answer kept on the deal. The Field
          Fusion setup notes are written from it, so at Closed Won nothing is typed twice.
          Delivering the same submission again updates the deal; it never opens a second one, and it
          never moves a won deal back.
        </p>

        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <span className="font-medium text-foreground">A key.</span> The same{" "}
            <code className="font-mono">accounts:write</code> key as the closed-won Zap works here.
          </li>
          <li>
            <span className="font-medium text-foreground">The Zap.</span> Trigger:{" "}
            <em>GoCanvas → New Submission</em> on the New FF Client Request form. Action:{" "}
            <em>Webhooks by Zapier → POST</em>, payload type <em>json</em>.
          </li>
          <li>
            <span className="font-medium text-foreground">The action, exactly.</span>
            <div className="mt-1.5 space-y-1.5">
              <Row
                label="URL"
                value={url}
                onCopy={() => copy("ff-url", url)}
                copied={copied === "ff-url"}
              />
              <Row
                label="Header"
                value="Authorization: Bearer gcp_live_…"
                onCopy={() => copy("ff-header", "Authorization")}
                copied={copied === "ff-header"}
              />
            </div>
            <p className="mt-1.5 text-muted-foreground">
              Body — one key per field on the form. Only{" "}
              <code className="font-mono">company_name</code> is required. The checkbox groups
              (features, data sets, customers are/have, sites) take a list, or the text Zapier gives
              with commas or line breaks between the ticked boxes.
            </p>
            <div className="relative mt-1">
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-2.5 font-mono text-[11px] leading-relaxed">
                {body}
              </pre>
              <button
                type="button"
                onClick={() => copy("ff-body", body)}
                className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-sm border border-border bg-background px-1.5 py-0.5 text-[11px] hover:bg-muted"
              >
                <Copy className="h-3 w-3" /> {copied === "ff-body" ? "Copied" : "Copy"}
              </button>
            </div>
          </li>
          <li>
            <span className="font-medium text-foreground">Test it.</span> Submit the form once.
            Within a minute the company is on the{" "}
            <Link to="/pipeline" className="underline">
              pipeline
            </Link>{" "}
            as a Prospect with a POC mark, and its deal page has a “Field Fusion request” panel with
            every answer.
          </li>
        </ol>

        <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-muted-foreground">
          <p className="font-medium text-foreground">What fills in from the form.</p>
          <p className="mt-0.5">
            The deal’s type (Field Fusion), its industry when the form’s wording matches one of
            ours, the current process in the requester’s words, the primary contact, and the Field
            Fusion setup notes. A Salesforce <em>account</em> link (001…) also links the deal; an
            opportunity link is kept for the page but does not.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function Row({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-sm border border-border bg-muted/30 px-2 py-1 font-mono text-[11px]">
        {value}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 py-1 text-[11px] hover:bg-muted"
      >
        <Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy"}
      </button>
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
          <TableScroll>
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
          </TableScroll>
        )}
      </Panel>

      <Panel title="Deliveries" count={deliveries.length}>
        {deliveries.length === 0 ? (
          <NoRows label="Nothing delivered yet." />
        ) : (
          <TableScroll>
            <table className="w-full">
              <tbody className="divide-y divide-border">
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td className={cn(cellClass, "text-muted-foreground")}>
                      <When value={d.created_at} />
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
          </TableScroll>
        )}
      </Panel>
    </div>
  );
}
