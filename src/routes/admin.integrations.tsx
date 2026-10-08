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
  getSalesforcePullStatus,
  getSyncLog,
  getWebhookDeliveries,
  getWebhookEndpoints,
  previewClosedWonPayload,
  previewPayload,
  previewSalesforce,
  redeliverWebhookDelivery,
  removeFieldMap,
  rerunSyncLogRow,
  runSalesforcePull,
  sendWebhookTestEvent,
  setIntegrationFeatureFlag,
  testSalesforce,
  toggleWebhookEndpoint,
  updateSalesforcePullState,
  upsertFieldMap,
} from "@/lib/sf-integration.functions";
import {
  getAiStatusFn,
  listAiJobsFn,
  rerunAiJobFn,
  setAiAutoReadFn,
  setAiEffortFn,
} from "@/lib/ai-admin.functions";
import { AI_EFFORTS, type AiEffort } from "@/lib/server/ai/config";
import { DEAL_FIELD_GROUP_LABEL, DEAL_FIELDS, dealField } from "@/lib/deal-field-catalog";
import { TRANSFORMS, type FieldMap, type FieldMapDirection } from "@/lib/server/sf-field-maps";
import {
  DEFAULT_INCLUDE_RULE,
  FIELD_OP_LABEL,
  type FieldOp,
  type IncludeCondition,
  type IncludeGroup,
  type IncludeRule,
} from "@/lib/salesforce-rule";
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
const salesforcePullQuery = queryOptions({
  queryKey: ["admin", "integrations", "salesforce-pull"],
  queryFn: () => getSalesforcePullStatus(),
});
const aiStatusQuery = queryOptions({
  queryKey: ["admin", "integrations", "ai", "status"],
  queryFn: () => getAiStatusFn(),
});
const aiJobsQuery = queryOptions({
  queryKey: ["admin", "integrations", "ai", "jobs"],
  queryFn: () => listAiJobsFn({ data: {} }),
  // A reading walks its steps over minutes; the table follows while one is live.
  refetchInterval: (query) =>
    (query.state.data ?? []).some((j) => j.status === "queued" || j.status === "running")
      ? 15_000
      : false,
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

const TABS = [
  "AI",
  "Salesforce",
  "Field maps",
  "Sync log",
  "Status",
  "Zapier",
  "Webhooks",
] as const;
type Tab = (typeof TABS)[number];

function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>("Salesforce");

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

        {tab === "AI" ? <AiTab /> : null}
        {tab === "Salesforce" ? <SalesforceTab /> : null}
        {tab === "Zapier" ? <ZapierTab /> : null}
        {tab === "Status" ? <StatusTab /> : null}
        {tab === "Sync log" ? <SyncLogTab /> : null}
        {tab === "Field maps" ? <FieldMapsTab /> : null}
        {tab === "Webhooks" ? <WebhooksTab /> : null}
      </PageBody>
    </>
  );
}

/* ------------------------------------------------------------------- ai */

const fmtTokens = (n: number) => n.toLocaleString();
const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
const fmtDuration = (ms: number | null) => {
  if (ms === null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** The list prices behind the estimate, for the meta line. */
const AI_PRICE_LABEL = "4 in, $20 out, $0.20 cache read, $5 cache write per million tokens";

/**
 * The reading, watched: whether the key is there, which model and how hard
 * it thinks, whether deals are read on their own, what the last month cost,
 * and every job with its step, its spend and its error. "Run again" is the
 * one action on a job; the effort select and the flag are the settings.
 */
function AiTab() {
  const { data: ai } = useSuspenseQuery(aiStatusQuery);
  const { data: jobs } = useSuspenseQuery(aiJobsQuery);
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "integrations", "ai"] });
  const setEffort = useServerFn(setAiEffortFn);
  const setAutoRead = useServerFn(setAiAutoReadFn);
  const rerun = useServerFn(rerunAiJobFn);

  const effort = useMutation({
    mutationFn: (effort: AiEffort) => setEffort({ data: { effort } }),
    onSuccess: invalidate,
  });
  const flip = useMutation({
    mutationFn: (enabled: boolean) => setAutoRead({ data: { enabled } }),
    onSuccess: invalidate,
  });
  const runAgain = useMutation({
    mutationFn: (jobId: string) => rerun({ data: { jobId } }),
    onSuccess: invalidate,
  });

  const t = ai.totals30d;
  const last = ai.lastJob;

  return (
    <div className="space-y-4">
      <Panel
        title="Status"
        level="primary"
        meta="Every deal is read by one background job: the SOW and contract, the call notes, the brief, a verification pass, then the record and the welcome deck filled from it. One step per minute-cron tick, so a cut-off function is a retry, not a lost reading."
      >
        <div className="space-y-2 px-3 py-2.5 text-[12px]">
          <p>
            <span className="text-muted-foreground">Key:</span>{" "}
            {ai.configured ? (
              <span className="text-status-ontrack-foreground">configured</span>
            ) : (
              <span className="text-destructive">not set — nothing is read until it is</span>
            )}{" "}
            <code className="font-mono text-[11px] text-muted-foreground">ANTHROPIC_API_KEY</code>
          </p>
          <p>
            <span className="text-muted-foreground">Model:</span>{" "}
            <code className="font-mono">{ai.model}</code>{" "}
            <span className="text-muted-foreground">
              (override with <code className="font-mono text-[11px]">ANTHROPIC_MODEL</code>;
              redeploy after changing it)
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Effort:</span>
            <select
              className={cn(inputClass, "w-auto")}
              value={ai.effort}
              disabled={effort.isPending}
              onChange={(e) => effort.mutate(e.target.value as AiEffort)}
              title="How hard the model thinks on every reading; higher is slower and dearer"
            >
              {AI_EFFORTS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">
              applies to the next job; high is the default, xhigh when a reading misses things.
            </span>
            {effort.isError ? (
              <span role="alert" className="text-destructive">
                {errorMessage(effort.error)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="divide-y divide-border border-t border-border">
          <FlagRow
            name="ai_auto_read"
            title="Read deals automatically"
            detail="A SOW upload, pasted call notes or a close (from Salesforce, the API or the board) queues the reading on its own. Off: only “Read again” on the deal starts one."
            enabled={ai.autoRead}
            busy={flip.isPending}
            onToggle={(enabled) => flip.mutate(enabled)}
          />
        </div>
        {flip.isError ? (
          <p role="alert" className="px-3 pb-2 text-[12px] text-destructive">
            {errorMessage(flip.error)}
          </p>
        ) : null}
        <p className="border-t border-border px-3 py-2 text-[12px] text-muted-foreground">
          <span>Last job:</span>{" "}
          {last ? (
            <>
              <When value={last.created_at} /> · {last.deal_name ?? last.kind} · {last.status}
              {last.step ? ` at ${last.step}` : ""} · {fmtDuration(last.duration_ms)}
              {last.last_error ? (
                <span className="text-destructive"> · {truncate(last.last_error, 80)}</span>
              ) : null}
            </>
          ) : (
            "none yet"
          )}
        </p>
      </Panel>

      <Panel
        title="Last 30 days"
        meta={`Summed from every model call's usage row. Cost is an estimate at list price — $${AI_PRICE_LABEL} — the invoice is the truth.`}
      >
        <dl className="grid grid-cols-2 gap-3 px-3 py-3 sm:grid-cols-6">
          <Stat label="Jobs" value={t.jobs} />
          <Stat label="Calls" value={t.calls} />
          <Stat label="Tokens in" value={fmtTokens(t.input_tokens)} />
          <Stat label="Tokens out" value={fmtTokens(t.output_tokens)} />
          <Stat
            label="Cached"
            value={
              <span title={`${fmtTokens(t.cache_creation_input_tokens)} written to the cache`}>
                {fmtTokens(t.cache_read_input_tokens)}
              </span>
            }
          />
          <Stat label="Estimated cost" value={fmtUsd(t.estimated_cost_usd)} />
        </dl>
      </Panel>

      <Panel
        title="Jobs"
        count={jobs.length}
        meta="The last 50 readings, newest first. A queued or running job refreshes the table every 15 seconds. “Run again” reads the deal from scratch, even when nothing changed."
      >
        {runAgain.isError ? (
          <p role="alert" className="px-3 py-2 text-[12px] text-destructive">
            {errorMessage(runAgain.error)}
          </p>
        ) : null}
        {jobs.length === 0 ? (
          <NoRows label="No readings yet. Upload a SOW or close a deal and one appears here." />
        ) : (
          <TableScroll minWidth={960}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className={cn(cellClass, "text-left", labelClass)}>Created</th>
                  <th className={cn(cellClass, "text-left", labelClass)}>Deal</th>
                  <th className={cn(cellClass, "text-left", labelClass)}>Kind</th>
                  <th className={cn(cellClass, "text-left", labelClass)}>Trigger</th>
                  <th className={cn(cellClass, "text-left", labelClass)}>Status</th>
                  <th className={cn(cellClass, "text-left", labelClass)}>Duration</th>
                  <th className={cn(cellClass, "text-left", labelClass)}>
                    Tokens in / out / cached
                  </th>
                  <th className={cn(cellClass, "text-left", labelClass)}>Error</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className={cn(cellClass, "text-muted-foreground")}>
                      <When value={j.created_at} />
                    </td>
                    <td className={cellClass}>
                      {j.deal_id ? (
                        <Link
                          to="/deals/$dealId"
                          params={{ dealId: j.deal_id }}
                          className="hover:underline"
                        >
                          {j.deal_name ?? "(deal)"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={cn(cellClass, "font-mono text-[11px]")}>{j.kind}</td>
                    <td className={cn(cellClass, "text-muted-foreground")}>{j.trigger}</td>
                    <td className={cellClass}>
                      <span
                        className={cn(
                          "rounded-sm px-1.5 py-0.5 text-[11px]",
                          j.status === "failed"
                            ? "bg-status-blocked text-status-blocked-foreground"
                            : j.status === "done"
                              ? "bg-status-ontrack text-status-ontrack-foreground"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {j.status}
                      </span>
                      {j.step && j.status !== "done" ? (
                        <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                          {j.step}
                        </span>
                      ) : null}
                      {j.attempts > 1 ? (
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          · attempt {j.attempts}
                        </span>
                      ) : null}
                    </td>
                    <td className={cn(cellClass, "tabular-nums text-muted-foreground")}>
                      {fmtDuration(j.duration_ms)}
                    </td>
                    <td className={cn(cellClass, "tabular-nums text-muted-foreground")}>
                      {j.usage.calls === 0
                        ? "—"
                        : `${fmtTokens(j.usage.input_tokens)} / ${fmtTokens(j.usage.output_tokens)} / ${fmtTokens(j.usage.cache_read_input_tokens)}`}
                    </td>
                    <td
                      className={cn(cellClass, "max-w-[16rem] text-destructive")}
                      title={j.last_error ?? undefined}
                    >
                      {j.last_error ? truncate(j.last_error, 60) : ""}
                    </td>
                    <td className={cn(cellClass, "text-right")}>
                      {j.deal_id ? (
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={runAgain.isPending}
                          onClick={() => runAgain.mutate(j.id)}
                          title="Queue a fresh reading of this deal, even when nothing changed"
                        >
                          Run again
                        </button>
                      ) : null}
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

/* ----------------------------------------------------------- salesforce */

/**
 * The pull: the Hub's own Connected App key asks Salesforce for won
 * opportunities on a schedule and runs each through the closed-won ingest.
 * Nothing is built in Salesforce. This tab is where the admin checks the
 * key works, sees exactly what will be fetched, starts a backfill, and reads
 * what the last run did.
 */
function SalesforceTab() {
  const { data: pull } = useSuspenseQuery(salesforcePullQuery);
  const { data: status } = useSuspenseQuery(statusQuery);
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "integrations"] });
  const test = useServerFn(testSalesforce);
  const run = useServerFn(runSalesforcePull);
  const setState = useServerFn(updateSalesforcePullState);
  const setFlag = useServerFn(setIntegrationFeatureFlag);
  const [backfill, setBackfill] = useState("");

  const testIt = useMutation({ mutationFn: () => test() });
  const runIt = useMutation({ mutationFn: () => run(), onSuccess: invalidate });
  const flip = useMutation({
    mutationFn: (enabled: boolean) => setFlag({ data: { flag: "sf_pull_enabled", enabled } }),
    onSuccess: invalidate,
  });
  const move = useMutation({
    mutationFn: (backfillFrom: string) => setState({ data: { backfillFrom } }),
    onSuccess: () => {
      setBackfill("");
      invalidate();
    },
  });

  const t = testIt.data;
  const last = pull.state.last_result;

  return (
    <div className="space-y-4">
      <Panel
        title="Connection"
        level="primary"
        meta="A Connected App's Consumer Key and Secret, exchanged for a token by the Hub itself (client-credentials flow). Set as SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET and SALESFORCE_LOGIN_URL on the Vercel project; redeploy after changing them."
      >
        <div className="space-y-2 px-3 py-2.5 text-[12px]">
          <p>
            <span className="text-muted-foreground">Variables:</span>{" "}
            {pull.configured ? (
              <span className="text-status-ontrack-foreground">all three set</span>
            ) : (
              <span className="text-destructive">
                not set — the pull reports “not configured” until they are
              </span>
            )}
            {pull.killSwitch ? (
              <span className="text-destructive">
                {" "}
                · SF_INTEGRATION_DISABLED=1 is set, nothing runs
              </span>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={primaryButtonClass}
              disabled={!pull.configured || testIt.isPending}
              onClick={() => testIt.mutate()}
            >
              {testIt.isPending ? "Testing…" : "Test connection"}
            </button>
            {t ? (
              t.ok ? (
                <span className="text-status-ontrack-foreground">
                  Connected as {t.userName ?? "(unknown user)"} · org {t.organizationId ?? "?"} ·{" "}
                  {t.wonOpportunities ?? "?"} won opportunities visible
                </span>
              ) : (
                <span role="alert" className="text-destructive">
                  {t.error}
                </span>
              )
            ) : null}
            {testIt.isError ? (
              <span role="alert" className="text-destructive">
                {errorMessage(testIt.error)}
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground">
            On the Connected App the Salesforce admin ticks <em>Enable Client Credentials Flow</em>,
            picks a <em>Run As</em> user who can read Opportunity, Account, Contact and User, and
            relaxes IP restrictions. The My Domain URL looks like{" "}
            <code className="font-mono">https://gocanvas.my.salesforce.com</code>.
          </p>
        </div>
      </Panel>

      <Panel
        title="The pull"
        meta="Every 10 minutes: opportunities with IsWon = true modified since the watermark, oldest first, each run through the closed-won ingest — deal at Closed Won, facts, project, TIS. The same record again only refreshes the deal."
      >
        <div className="divide-y divide-border">
          <FlagRow
            name="sf_pull_enabled"
            title="Poll Salesforce for won opportunities"
            detail="Off: the schedule runs and does nothing. On: each run creates deals for new wins and refreshes deals for modified ones. Turn on after Test connection passes and one Run now looked right."
            enabled={status.flags.sf_pull_enabled}
            busy={flip.isPending}
            onToggle={(enabled) => flip.mutate(enabled)}
          />
        </div>
        <div className="space-y-3 px-3 py-2.5 text-[12px]">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Watermark" value={<When value={pull.state.watermark} />} />
            <Stat
              label="Last run"
              value={pull.state.last_run_at ? <When value={pull.state.last_run_at} /> : "never"}
            />
            <Stat label="Batch" value={pull.state.batch_limit} />
            <Stat
              label="Last result"
              value={
                last
                  ? `${last.found} found · ${last.created} created · ${last.updated} refreshed · ${last.failed} failed`
                  : "—"
              }
            />
          </dl>
          {pull.state.last_error ? (
            <p role="alert" className="text-destructive">
              Last error: {pull.state.last_error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Backfill from</span>
              <input
                type="datetime-local"
                className={cn(inputClass, "w-auto")}
                value={backfill}
                onChange={(e) => setBackfill(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={buttonClass}
              disabled={!backfill || move.isPending}
              onClick={() => move.mutate(new Date(backfill).toISOString())}
              title="Moves the watermark back so wins since then are fetched on the next run"
            >
              Set watermark
            </button>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={!pull.configured || runIt.isPending}
              onClick={() => runIt.mutate()}
            >
              {runIt.isPending ? "Running…" : "Run now"}
            </button>
            {runIt.isError ? (
              <span role="alert" className="text-destructive">
                {errorMessage(runIt.error)}
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground">
            The watermark starts one day back, so history is not imported by accident. Set it to an
            earlier date to backfill; move it forward past a record that keeps failing to skip it. A
            failed record stops the watermark and is retried next run.
          </p>
        </div>
      </Panel>

      <IncludeRulePanel rule={pull.state.include} />

      {last && last.records.length > 0 ? (
        <Panel title="Last run, record by record" count={last.records.length}>
          <TableScroll>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className={cn(cellClass, "text-left", labelClass)}>Opportunity</th>
                  <th className={cn(cellClass, "text-left", labelClass)}>Rule</th>
                  <th className={cn(cellClass, "text-left", labelClass)}>Result</th>
                  <th className={cn(cellClass, "text-left", labelClass)}>Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {last.records.map((r) => (
                  <tr key={r.id}>
                    <td className={cellClass}>
                      {r.name}{" "}
                      <span className="font-mono text-[10px] text-muted-foreground">{r.id}</span>
                    </td>
                    <td className={cn(cellClass, "text-muted-foreground")}>{r.group ?? "—"}</td>
                    <td className={cn(cellClass, r.status === "failed" && "text-destructive")}>
                      {r.status}
                    </td>
                    <td className={cn(cellClass, "text-muted-foreground")}>{r.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Panel>
      ) : null}

      <Panel
        title="What is fetched"
        meta="The query the current deal map produces: the core fields plus every mapped source path. Map a custom field on the Field maps tab and it is fetched too."
      >
        {pull.soql ? (
          <pre className="overflow-x-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {pull.soql}
          </pre>
        ) : (
          <p role="alert" className="px-3 py-2 text-[12px] text-destructive">
            {pull.soqlError}
          </p>
        )}
        <p className="px-3 pb-2 text-[12px] text-muted-foreground">
          Without a map row the record still lands: Account.Name → company, Account.Id → Salesforce
          id, Name → opportunity, Amount, CloseDate, Description → notes, Account.Website,
          Account.Industry, Owner.Email → Account Executive. Add{" "}
          <code className="font-mono">YourTisField__r.Email → TIS assigned</code> to assign the
          owner.
        </p>
      </Panel>
    </div>
  );
}

/**
 * Which won opportunities are ours. Groups are OR'd, conditions inside a
 * group are AND'd. Nothing imports until a rule is saved, and Preview shows
 * exactly which opportunities the saved rule would pull before anything does.
 */
function IncludeRulePanel({ rule }: { rule: IncludeRule | null }) {
  const queryClient = useQueryClient();
  const setState = useServerFn(updateSalesforcePullState);
  const preview = useServerFn(previewSalesforce);
  const [draft, setDraft] = useState<IncludeRule>(rule ?? { groups: [] });
  const [since, setSince] = useState("");
  const save = useMutation({
    mutationFn: (next: IncludeRule | null) => setState({ data: { include: next } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "integrations"] }),
  });
  const run = useMutation({
    mutationFn: () =>
      preview({ data: { sinceIso: since ? new Date(since).toISOString() : null, limit: 50 } }),
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(rule ?? { groups: [] });

  const setGroup = (i: number, g: IncludeGroup) =>
    setDraft({ groups: draft.groups.map((x, j) => (j === i ? g : x)) });
  const addGroup = () =>
    setDraft({
      groups: [
        ...draft.groups,
        {
          label: `Rule ${draft.groups.length + 1}`,
          conditions: [{ kind: "field", field: "Type", op: "in", values: [] }],
          path: null,
        },
      ],
    });

  return (
    <Panel
      title="Which won opportunities come through"
      count={rule?.groups.length ?? 0}
      meta="A deal is pulled when ANY rule below matches it; inside a rule EVERY condition must hold. Without a saved rule the pull refuses to run. Products conditions look at the opportunity's line items."
    >
      <div className="space-y-3 px-3 py-2.5 text-[12px]">
        {draft.groups.length === 0 ? (
          <p className="text-destructive">
            No rule: nothing will be pulled.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setDraft(DEFAULT_INCLUDE_RULE)}
            >
              Start from the preset
            </button>{" "}
            (new logos, and AM deals with Form Build, Integration or Analytics on them).
          </p>
        ) : null}
        {draft.groups.map((g, i) => (
          <GroupEditor
            key={i}
            group={g}
            index={i}
            onChange={(next) => setGroup(i, next)}
            onRemove={() => setDraft({ groups: draft.groups.filter((_, j) => j !== i) })}
          />
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={buttonClass} onClick={addGroup}>
            <Plus className="h-3 w-3" /> Add a rule
          </button>
          <button
            type="button"
            className={primaryButtonClass}
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate(draft.groups.length ? draft : null)}
          >
            {save.isPending ? "Saving…" : "Save rule"}
          </button>
          {dirty ? <span className="text-muted-foreground">unsaved changes</span> : null}
          {save.isError ? (
            <span role="alert" className="text-destructive">
              {errorMessage(save.error)}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Preview wins since</span>
            <input
              type="datetime-local"
              className={cn(inputClass, "w-auto")}
              value={since}
              onChange={(e) => setSince(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={buttonClass}
            disabled={run.isPending || dirty}
            title={
              dirty
                ? "Save the rule first"
                : "Lists what the saved rule would pull; imports nothing"
            }
            onClick={() => run.mutate()}
          >
            {run.isPending ? "Asking Salesforce…" : "Preview matches"}
          </button>
          <span className="text-muted-foreground">
            Empty date = since the watermark. Nothing is imported.
          </span>
        </div>
        {run.isError ? (
          <p role="alert" className="text-destructive">
            {errorMessage(run.error)}
          </p>
        ) : null}
        {run.data ? (
          run.data.error ? (
            <p role="alert" className="text-destructive">
              {run.data.error}
            </p>
          ) : run.data.rows.length === 0 ? (
            <p className="text-muted-foreground">Nothing matches since that date.</p>
          ) : (
            <TableScroll>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className={cn(cellClass, "text-left", labelClass)}>Opportunity</th>
                    <th className={cn(cellClass, "text-left", labelClass)}>Account → company</th>
                    <th className={cn(cellClass, "text-left", labelClass)}>Type</th>
                    <th className={cn(cellClass, "text-left", labelClass)}>Products</th>
                    <th className={cn(cellClass, "text-left", labelClass)}>Rule</th>
                    <th className={cn(cellClass, "text-left", labelClass)}>TIS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {run.data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className={cellClass}>
                        {r.name}
                        {r.amount !== null ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · ${r.amount.toLocaleString()}
                          </span>
                        ) : null}
                      </td>
                      <td className={cellClass}>{r.company ?? r.account ?? "—"}</td>
                      <td className={cn(cellClass, "text-muted-foreground")}>{r.type ?? "—"}</td>
                      <td className={cn(cellClass, "text-muted-foreground")}>
                        {r.products.length ? r.products.join(", ") : "—"}
                      </td>
                      <td className={cellClass}>{r.group ?? "—"}</td>
                      <td className={cn(cellClass, "text-muted-foreground")}>
                        {r.tis ?? "rule picks"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )
        ) : null}
      </div>
    </Panel>
  );
}

const FIELD_OPS: FieldOp[] = [
  "in",
  "not_in",
  "eq",
  "ne",
  "contains",
  "gte",
  "lte",
  "true",
  "false",
];

function GroupEditor({
  group,
  index,
  onChange,
  onRemove,
}: {
  group: IncludeGroup;
  index: number;
  onChange: (g: IncludeGroup) => void;
  onRemove: () => void;
}) {
  const setCondition = (i: number, c: IncludeCondition) =>
    onChange({ ...group, conditions: group.conditions.map((x, j) => (j === i ? c : x)) });
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={labelClass}>{index === 0 ? "Pull when" : "or when"}</span>
        <input
          className={cn(inputClass, "w-56")}
          value={group.label}
          onChange={(e) => onChange({ ...group, label: e.target.value })}
          placeholder="Name this rule"
        />
        <span className={labelClass}>deal type</span>
        <select
          className={cn(inputClass, "w-auto")}
          value={group.path ?? ""}
          onChange={(e) =>
            onChange({ ...group, path: (e.target.value || null) as IncludeGroup["path"] })
          }
          title="The onboarding type a deal matched by this rule gets, unless a map row sets it"
        >
          <option value="">leave to the map</option>
          <option value="new_logo">New logo</option>
          <option value="existing">Existing customer</option>
          <option value="dm_conversion">DM conversion</option>
          <option value="field_fusion">Field Fusion</option>
        </select>
        <button
          type="button"
          className={cn(buttonClass, "ml-auto")}
          onClick={onRemove}
          title="Remove this rule"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-2 space-y-1.5">
        {group.conditions.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-8 text-right text-[11px] text-muted-foreground">
              {i === 0 ? "" : "and"}
            </span>
            <select
              className={cn(inputClass, "w-auto")}
              value={c.kind}
              onChange={(e) =>
                setCondition(
                  i,
                  e.target.value === "products"
                    ? { kind: "products", by: "name", values: c.values }
                    : { kind: "field", field: "Type", op: "in", values: c.values },
                )
              }
            >
              <option value="field">a field</option>
              <option value="products">a product on the line items</option>
            </select>
            {c.kind === "field" ? (
              <>
                <input
                  className={cn(inputClass, "w-48 font-mono")}
                  value={c.field}
                  placeholder="Type, RecordType.Name, Owner.UserRole.Name, Amount"
                  onChange={(e) => setCondition(i, { ...c, field: e.target.value })}
                />
                <select
                  className={cn(inputClass, "w-auto")}
                  value={c.op}
                  onChange={(e) => setCondition(i, { ...c, op: e.target.value as FieldOp })}
                >
                  {FIELD_OPS.map((op) => (
                    <option key={op} value={op}>
                      {FIELD_OP_LABEL[op]}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <select
                className={cn(inputClass, "w-auto")}
                value={c.by}
                onChange={(e) => setCondition(i, { ...c, by: e.target.value as "name" | "family" })}
              >
                <option value="name">named any of</option>
                <option value="family">in a family among</option>
              </select>
            )}
            {c.kind === "products" || (c.op !== "true" && c.op !== "false") ? (
              <input
                className={cn(inputClass, "min-w-[16rem] flex-1")}
                value={c.values.join(", ")}
                placeholder={
                  c.kind === "products"
                    ? "Form Build, Integration, Analytics"
                    : "values, comma-separated"
                }
                onChange={(e) =>
                  setCondition(i, {
                    ...c,
                    values: e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  } as IncludeCondition)
                }
              />
            ) : null}
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                onChange({ ...group, conditions: group.conditions.filter((_, j) => j !== i) })
              }
              title="Remove this condition"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className={buttonClass}
          onClick={() =>
            onChange({
              ...group,
              conditions: [...group.conditions, { kind: "field", field: "", op: "eq", values: [] }],
            })
          }
        >
          <Plus className="h-3 w-3" /> and
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- status */

function StatusTab() {
  const { data: status } = useSuspenseQuery(statusQuery);
  const { data: needsTemplate } = useSuspenseQuery(needsTemplateQuery);
  const queryClient = useQueryClient();
  const setFlag = useServerFn(setIntegrationFeatureFlag);

  const flip = useMutation({
    mutationFn: (input: {
      flag: "sf_auto_create" | "sf_presale_bridge" | "sf_pull_enabled";
      enabled: boolean;
    }) => setFlag({ data: input }),
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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
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
  const { data: allRows } = useSuspenseQuery(syncLogQuery);
  const queryClient = useQueryClient();
  const rerun = useServerFn(rerunSyncLogRow);
  const [open, setOpen] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("");
  const kinds = Array.from(new Set(allRows.map((r) => r.kind))).sort();
  const rows = kind ? allRows.filter((r) => r.kind === kind) : allRows;

  const rerunRow = useMutation({
    mutationFn: (id: string) => rerun({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "integrations"] }),
  });

  return (
    <Panel
      title="Sync log"
      count={rows.length}
      meta="Cross-system exchanges. A Salesforce pull row (sf_pull_closed_won) carries the record as fetched and what the deal map made of it; a project-route replay writes nothing and its drift report says what Salesforce now claims and what the hub still holds."
    >
      {kinds.length > 1 ? (
        <div className="flex items-center gap-2 px-3 py-2 text-[12px]">
          <span className={labelClass}>Kind</span>
          <select
            className={cn(inputClass, "w-auto")}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">all</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      ) : null}
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
