import { useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Download, FileText, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { PageBody, PageHeader } from "@/components/page";
import { Field, NoRows, Panel } from "@/components/record";
import { EditableField } from "@/components/editable-field";
import { canEditSales, canManage, isSuperAdmin, useProfile } from "@/lib/auth";
import {
  addNote,
  addReport,
  createTamRequestForDeal,
  generateBriefForDeal,
  getBriefDownloadUrl,
  getDeal,
  getHandoffOptions,
  removeNote,
  removeReport,
  setNoteReviewed,
  setDealField,
  startOnboardingForDeal,
} from "@/lib/presale.functions";
import {
  BUILTIN_PIPELINE_STAGES,
  isAtOrPast,
  stageLabel,
  wonStage,
  type PipelineStage,
} from "@/lib/pipeline-stages";
import { daysSince, fmtDate, fmtDateTime, fmtMoney } from "@/lib/hub-format";
import type { EditableDealField } from "@/lib/presale-fields";
import { cn } from "@/lib/utils";

const dealQuery = (dealId: string) =>
  queryOptions({
    queryKey: ["deal", dealId],
    queryFn: () => getDeal({ data: { dealId } }),
  });

export const Route = createFileRoute("/deals/$dealId")({
  head: () => ({
    meta: [
      { title: "Deal — GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "Presale deal record: notes, Gong reports, account briefs, TAM requests and stage history.",
      },
    ],
  }),
  loader: ({ context, params }) => {
    const { dealId } = params as unknown as { dealId: string };
    void context.queryClient.ensureQueryData(dealQuery(dealId)).catch(() => {});
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load this deal: {error.message}
    </div>
  ),
  component: DealPage,
});

type DealData = NonNullable<Awaited<ReturnType<typeof getDeal>>>;

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const areaClass =
  "w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50";
const primaryButtonClass =
  "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

function StageChip({ stage, stages }: { stage: string; stages: readonly PipelineStage[] }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] tracking-tight text-foreground">
      {stageLabel(stages, stage)}
    </span>
  );
}

const TAM_STATUS_CLASS: Record<string, string> = {
  pending: "bg-status-risk text-status-risk-foreground",
  approved: "bg-status-ontrack text-status-ontrack-foreground",
  declined: "bg-status-blocked text-status-blocked-foreground",
  expired: "bg-muted text-muted-foreground",
};

const BRIEF_STATUS_CLASS: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  generating: "bg-status-risk text-status-risk-foreground",
  complete: "bg-status-ontrack text-status-ontrack-foreground",
  failed: "bg-status-blocked text-status-blocked-foreground",
};

function StatusChip({ value, map }: { value: string; map: Record<string, string> }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
        map[value] ?? "bg-muted text-muted-foreground",
      )}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}

const markdownClass =
  "text-[13px] leading-relaxed [&_h1]:text-[14px] [&_h1]:font-semibold [&_h2]:text-[13px] [&_h2]:font-semibold [&_h3]:text-[13px] [&_h3]:font-medium [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-2 [&_blockquote]:text-muted-foreground";

function DealPage() {
  const { dealId } = Route.useParams() as unknown as { dealId: string };
  const { data } = useSuspenseQuery(dealQuery(dealId));

  if (!data) {
    return <div className="p-6 text-[13px] text-muted-foreground">This deal does not exist.</div>;
  }
  return <DealRecord deal={data} />;
}

function DealRecord({ deal }: { deal: DealData }) {
  const { account } = deal;
  const days = daysSince(account.stage_entered_at);
  const { profile } = useProfile();
  const editable = canEditSales(profile?.role) || canManage(profile?.role);

  const queryClient = useQueryClient();
  const save = useServerFn(setDealField);
  const field = useMutation({
    mutationFn: (v: { field: EditableDealField; value: string | null }) =>
      save({ data: { dealId: account.id, field: v.field, value: v.value } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["deal", account.id] });
      // The board shows ARR and owner too; leaving it stale is how a number
      // that was just corrected shows up wrong one click later.
      void queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
  const set = (name: EditableDealField) => (value: string | null) =>
    field.mutateAsync({ field: name, value });

  return (
    <>
      <PageHeader
        title={account.name}
        {...(account.summary ? { description: account.summary } : {})}
        actions={<StartOnboarding deal={deal} />}
      />
      <PageBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <StageChip stage={account.stage} stages={deal.stages} />
            <span className="font-mono text-[11px] text-muted-foreground">
              {days ?? 0}d in stage
            </span>
          </div>
          {/* ARR leads, and is editable, because an account that starts at 5k
              and grows to 8k is the fact this pipeline exists to notice. Every
              change lands in the activity feed, so the account carries its own
              record of what the number was and when it moved. */}
          <EditableField
            label="ARR"
            value={account.arr != null ? String(account.arr) : null}
            format={(v) => (v ? fmtMoney(Number(v)) : "—")}
            type="number"
            placeholder="48000"
            onSave={set("arr")}
            disabled={!editable}
          />
          <EditableField
            label="Salesforce"
            value={account.salesforce_id ?? null}
            format={(v) => (v ? <span className="font-mono">{v}</span> : "—")}
            onSave={set("salesforce_id")}
            disabled={!editable}
          />
          <EditableField
            label="Domain"
            value={account.domain ?? null}
            onSave={set("domain")}
            disabled={!editable}
          />
          <EditableField
            label="AM owner"
            value={account.am_owner_id ?? null}
            display={deal.am_owner_name ?? "Unassigned"}
            type="select"
            options={deal.owner_options ?? []}
            onSave={set("am_owner_id")}
            disabled={!editable}
          />
          <EditableField
            label="SE owner"
            value={account.se_owner_id ?? null}
            display={deal.se_owner_name ?? "Unassigned"}
            type="select"
            options={deal.owner_options ?? []}
            onSave={set("se_owner_id")}
            disabled={!editable}
          />
          {/* The champion, and the two facts that make them reachable.
              Carried into customer_contacts when this deal becomes a project,
              which is the point at which one contact becomes many. */}
          <EditableField
            label="Contact"
            value={account.primary_contact_name ?? null}
            placeholder="Who to call at the customer"
            onSave={set("primary_contact_name")}
            disabled={!editable}
          />
          <EditableField
            label="Contact email"
            value={account.primary_contact_email ?? null}
            placeholder="name@company.com"
            onSave={set("primary_contact_email")}
            disabled={!editable}
          />
          <EditableField
            label="Contact role"
            value={account.primary_contact_role ?? null}
            placeholder="Champion, sponsor, ops lead"
            onSave={set("primary_contact_role")}
            disabled={!editable}
          />
          <Field label="Created" value={fmtDate(account.created_at)} />
        </div>
        {field.error ? (
          <p className="text-[12px] text-destructive">{(field.error as Error).message}</p>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <ReportsPanel deal={deal} />
            <NotesPanel deal={deal} />
          </div>
          <div className="space-y-4">
            <BriefsPanel deal={deal} />
            <TamPanel deal={deal} />
            <HistoryPanel deal={deal} />
          </div>
        </div>
      </PageBody>
    </>
  );
}

/* ---------- Start onboarding / View implementation ---------- */

type HandoffChoiceVars = { customerId: string | null; createNewCustomer: boolean };

function StartOnboarding({ deal }: { deal: DealData }) {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const start = useServerFn(startOnboardingForDeal);
  // Which account this deal hands off to. Only used while `account_model` is
  // on; with the flag off the response says so and the action below is
  // exactly the pre-Phase-1 one.
  const options = useQuery({
    queryKey: ["handoff-options", deal.account.id],
    queryFn: () => getHandoffOptions({ data: { dealId: deal.account.id } }),
  });
  // "" means "create a new account"; otherwise an existing account id.
  const [pick, setPick] = useState("");

  const opts = options.data;
  const flagOn = opts?.flagOn === true;

  const mutation = useMutation({
    mutationFn: (vars: HandoffChoiceVars) => start({ data: { dealId: deal.account.id, ...vars } }),
    onSuccess: (result) => {
      // The server refuses to invent an account: leave the picker open.
      if (result.outcome === "needs_account_choice") return;
      queryClient.invalidateQueries({ queryKey: ["deal", deal.account.id] });
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["home"] });
      if (flagOn) {
        queryClient.invalidateQueries({ queryKey: ["handoff-options", deal.account.id] });
      }
      navigate({
        to: "/customers/$customerId",
        params: { customerId: result.customerId },
        // startOnboarding returns an empty implementationId when the deal was
        // already linked; omit the param rather than sending a blank one.
        search: result.implementationId ? { impl: result.implementationId } : {},
      });
    },
  });

  const allowed = canEditSales(profile?.role) || canManage(profile?.role);
  // The Closed Won gate reads the stage MARKED as won, not the literal — the
  // same list startOnboarding checks server-side.
  const pipeline = deal.stages ?? BUILTIN_PIPELINE_STAGES;
  const stageReady = isAtOrPast(pipeline, deal.account.stage, wonStage(pipeline).key);

  const error = mutation.isError ? (
    <p className="text-[11px] text-destructive">{(mutation.error as Error).message}</p>
  ) : null;

  if (deal.account.customer_id) {
    const viewLink = (
      <Link
        to="/customers/$customerId"
        params={{ customerId: deal.account.customer_id }}
        className={primaryButtonClass}
      >
        View implementation <ArrowRight className="h-3 w-3" />
      </Link>
    );
    // An account can run several implementations: a linked deal is no longer
    // a dead end.
    if (!flagOn || !allowed) return viewLink;
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ customerId: null, createNewCustomer: false })}
          >
            {mutation.isPending ? "Starting…" : "Start another implementation"}
          </button>
          {viewLink}
        </div>
        {error}
      </div>
    );
  }

  if (!allowed || !stageReady) return null;

  if (!flagOn) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          className={primaryButtonClass}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ customerId: null, createNewCustomer: false })}
        >
          {mutation.isPending ? "Starting…" : "Start onboarding"} <ArrowRight className="h-3 w-3" />
        </button>
        {error}
      </div>
    );
  }

  const match = opts?.salesforceMatch ?? null;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {match ? (
          <span className="text-[11px] text-muted-foreground">
            Salesforce match: <span className="text-foreground">{match.name}</span>
          </span>
        ) : (
          <select
            className={cn(inputClass, "w-56")}
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            aria-label="Account to onboard under"
          >
            <option value="">Create a new account — {deal.account.name}</option>
            {(opts?.accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                Existing account — {a.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className={primaryButtonClass}
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate(
              match || pick === ""
                ? { customerId: null, createNewCustomer: !match }
                : { customerId: pick, createNewCustomer: false },
            )
          }
        >
          {mutation.isPending ? "Starting…" : "Start onboarding"} <ArrowRight className="h-3 w-3" />
        </button>
      </div>
      {error}
    </div>
  );
}

/* ---------- Notes & Gong reports ---------- */

function ReportsPanel({ deal }: { deal: DealData }) {
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const create = useServerFn(addReport);
  const destroy = useServerFn(removeReport);
  const fileRef = useRef<HTMLInputElement>(null);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [reportType, setReportType] = useState<"call_notes" | "account_map">("call_notes");
  const [contentMd, setContentMd] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["deal", deal.account.id] });

  const addMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          dealId: deal.account.id,
          title: title.trim(),
          reportType,
          contentMd: contentMd.trim(),
        },
      }),
    onSuccess: () => {
      invalidate();
      setAdding(false);
      setTitle("");
      setContentMd("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (reportId: string) => destroy({ data: { reportId } }),
    onSuccess: invalidate,
  });

  const canDelete = (uploadedBy: string | null) =>
    Boolean(profile) && (uploadedBy === profile!.id || isSuperAdmin(profile!.role));

  return (
    <Panel
      title="Notes & Gong reports"
      count={deal.gong_reports.length}
      action={
        <button type="button" className={buttonClass} onClick={() => setAdding((v) => !v)}>
          {adding ? "Close" : "Add report"}
        </button>
      }
    >
      {adding ? (
        <form
          className="space-y-2 border-b border-border bg-surface px-3 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!addMutation.isPending) addMutation.mutate();
          }}
        >
          <div className="grid grid-cols-[1fr_10rem] gap-2">
            <div>
              <label className={labelClass}>Title *</label>
              <input
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Type</label>
              <select
                className={inputClass}
                value={reportType}
                onChange={(e) => setReportType(e.target.value as "call_notes" | "account_map")}
              >
                <option value="call_notes">Call notes</option>
                <option value="account_map">Account map</option>
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className={labelClass}>Markdown *</label>
              <button
                type="button"
                className={buttonClass}
                onClick={() => fileRef.current?.click()}
              >
                Upload .md / .txt
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setContentMd(await file.text());
                  if (title.trim() === "") setTitle(file.name.replace(/\.(md|txt)$/i, ""));
                  e.target.value = "";
                }}
              />
            </div>
            <textarea
              className={areaClass}
              rows={6}
              value={contentMd}
              placeholder="Paste the Gong summary or meeting notes as markdown…"
              onChange={(e) => setContentMd(e.target.value)}
              required
            />
          </div>
          {addMutation.isError ? (
            <p className="text-[11px] text-destructive">{(addMutation.error as Error).message}</p>
          ) : null}
          <div className="flex justify-end">
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={addMutation.isPending || title.trim() === "" || contentMd.trim() === ""}
            >
              {addMutation.isPending ? "Saving…" : "Save report"}
            </button>
          </div>
        </form>
      ) : null}

      {deal.gong_reports.length === 0 && !adding ? (
        <NoRows label="No reports yet. Paste Gong call notes or an account map to feed brief generation." />
      ) : (
        <ul className="divide-y divide-border">
          {deal.gong_reports.map((r) => (
            <li key={r.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-2 text-left"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <FileText
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                  <span className="truncate text-[13px] font-medium hover:underline">
                    {r.title}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {r.report_type === "account_map" ? "Account map" : "Call notes"}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{r.uploaded_by_name ?? "—"}</span>
                  <span className="font-mono">{fmtDate(r.created_at)}</span>
                  {canDelete(r.uploaded_by) ? (
                    <button
                      type="button"
                      title="Delete report"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMutation.mutate(r.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  ) : null}
                </div>
              </div>
              {expanded === r.id ? (
                <div className={cn("mt-2 rounded-sm bg-surface px-3 py-2", markdownClass)}>
                  <ReactMarkdown>{r.content_md}</ReactMarkdown>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- Account brief ---------- */

type DiscoveryQuestion = { question: string; why_it_matters: string; category: string };

function BriefsPanel({ deal }: { deal: DealData }) {
  const queryClient = useQueryClient();
  const generate = useServerFn(generateBriefForDeal);
  const download = useServerFn(getBriefDownloadUrl);

  const generateMutation = useMutation({
    mutationFn: () => generate({ data: { dealId: deal.account.id } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["deal", deal.account.id] }),
  });

  const downloadMutation = useMutation({
    mutationFn: (briefId: string) => download({ data: { briefId } }),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener");
    },
  });

  const latestComplete = deal.briefs.find((b) => b.status === "complete");
  const questions: DiscoveryQuestion[] = Array.isArray(
    (latestComplete?.structured_json as { discovery_questions?: unknown } | null)
      ?.discovery_questions,
  )
    ? (latestComplete!.structured_json as { discovery_questions: DiscoveryQuestion[] })
        .discovery_questions
    : [];

  return (
    <Panel
      title="Account brief"
      count={deal.briefs.length}
      action={
        <button
          type="button"
          className={buttonClass}
          disabled={generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
        >
          {generateMutation.isPending ? "Generating…" : "Generate brief"}
        </button>
      }
    >
      {generateMutation.isError ? (
        <p className="border-b border-border px-3 py-2 text-[11px] text-destructive">
          {(generateMutation.error as Error).message}
        </p>
      ) : null}
      {downloadMutation.isError ? (
        <p className="border-b border-border px-3 py-2 text-[11px] text-destructive">
          {(downloadMutation.error as Error).message}
        </p>
      ) : null}

      {deal.briefs.length === 0 ? (
        <NoRows label="No briefs yet. Add at least one Gong report, then generate one." />
      ) : (
        <ul className="divide-y divide-border">
          {deal.briefs.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <StatusChip value={b.status} map={BRIEF_STATUS_CLASS} />
                {/* BUG-12. This used to render the raw enum — "TEMPLATE" in
                    grey, indistinguishable from decoration — so a brief with no
                    AI synthesis in it looked exactly like one that had been
                    synthesised. The only brief in production is a template one
                    whose own risks section reads "generated without AI
                    synthesis"; nothing on screen said so.

                    It matters beyond tidiness: the Closed Won gate is meant to
                    require a real brief, and a template fallback would satisfy
                    a naive check while containing no synthesis at all. */}
                {b.generator === "llm" ? (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    AI synthesis
                  </span>
                ) : b.generator ? (
                  <span
                    className="rounded-sm bg-status-risk px-1.5 py-0.5 text-[10px] font-medium text-status-risk-foreground"
                    title={
                      b.error ??
                      "The AI step did not run — most often because ANTHROPIC_API_KEY is not set. The content is the template fallback, not a synthesis of the calls."
                    }
                  >
                    Template only — no AI synthesis
                  </span>
                ) : null}
                {b.error ? (
                  <span className="truncate text-[11px] text-destructive" title={b.error}>
                    {b.error}
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                <span>{b.created_by_name ?? "—"}</span>
                <span className="font-mono">{fmtDateTime(b.created_at)}</span>
                {b.status === "complete" && b.pptx_storage_path ? (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={downloadMutation.isPending}
                    onClick={() => downloadMutation.mutate(b.id)}
                  >
                    <Download className="h-3 w-3" /> .pptx
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {questions.length > 0 ? (
        <div className="border-t border-border">
          <p className="bg-surface px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Discovery questions · latest brief
          </p>
          <ul className="divide-y divide-border">
            {questions.map((q, i) => (
              <li key={i} className="px-3 py-2">
                <p className="text-[13px]">{q.question}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  <span className="font-mono text-[10px] uppercase tracking-wider">
                    {q.category}
                  </span>
                  {" · "}
                  {q.why_it_matters}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

/* ---------- TAM request ---------- */

function TamPanel({ deal }: { deal: DealData }) {
  const queryClient = useQueryClient();
  const create = useServerFn(createTamRequestForDeal);
  const [justification, setJustification] = useState("");
  const [urgency, setUrgency] = useState<"low" | "medium" | "high">("medium");
  const [formOpen, setFormOpen] = useState(false);

  const hasPending = deal.tam_requests.some((t) => t.status === "pending");

  const mutation = useMutation({
    mutationFn: () =>
      create({ data: { dealId: deal.account.id, justification: justification.trim(), urgency } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deal", deal.account.id] });
      setJustification("");
      setFormOpen(false);
    },
  });

  return (
    <Panel
      title="TAM request"
      count={deal.tam_requests.length}
      action={
        hasPending ? (
          <span className="text-[11px] text-muted-foreground">Awaiting a decision</span>
        ) : (
          <button type="button" className={buttonClass} onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? "Close" : "Request a TAM"}
          </button>
        )
      }
    >
      {formOpen && !hasPending ? (
        <form
          className="space-y-2 border-b border-border bg-surface px-3 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!mutation.isPending) mutation.mutate();
          }}
        >
          <div>
            <label className={labelClass}>Justification * (min 10 characters)</label>
            <textarea
              className={areaClass}
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              required
            />
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="w-36">
              <label className={labelClass}>Urgency</label>
              <select
                className={inputClass}
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as "low" | "medium" | "high")}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={mutation.isPending || justification.trim().length < 10}
            >
              {mutation.isPending ? "Sending…" : "Send request"}
            </button>
          </div>
          {mutation.isError ? (
            <p className="text-[11px] text-destructive">{(mutation.error as Error).message}</p>
          ) : null}
        </form>
      ) : null}

      {deal.tam_requests.length === 0 && !formOpen ? (
        <NoRows label="No TAM requests. Approvers get one-click approve/decline links by email." />
      ) : (
        <ul className="divide-y divide-border">
          {deal.tam_requests.map((t) => (
            <li key={t.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusChip value={t.status} map={TAM_STATUS_CLASS} />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t.urgency}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {fmtDate(t.created_at)}
                </span>
              </div>
              <p className="mt-1 text-[12px]">{t.justification}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t.requested_by_name ?? t.requester_email}
                {t.decided_at
                  ? ` · decided ${fmtDate(t.decided_at)}${t.decided_via ? ` via ${t.decided_via}` : ""}${t.decision_note ? ` — ${t.decision_note}` : ""}`
                  : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- Onboarding plan / sales notes ---------- */

function NotesPanel({ deal }: { deal: DealData }) {
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const create = useServerFn(addNote);
  const review = useServerFn(setNoteReviewed);
  const destroy = useServerFn(removeNote);
  const [body, setBody] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["deal", deal.account.id] });

  const addMutation = useMutation({
    mutationFn: () => create({ data: { dealId: deal.account.id, bodyMd: body.trim() } }),
    onSuccess: () => {
      invalidate();
      setBody("");
    },
  });
  const reviewMutation = useMutation({
    mutationFn: (vars: { noteId: string; reviewed: boolean }) => review({ data: vars }),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => destroy({ data: { noteId } }),
    onSuccess: invalidate,
  });

  const canDelete = (authorId: string | null) =>
    Boolean(profile) && (authorId === profile!.id || isSuperAdmin(profile!.role));

  return (
    <Panel
      title="Onboarding plan / sales notes"
      count={deal.notes.length}
      meta="Reviewed notes feed brief generation"
    >
      <form
        className="space-y-1.5 border-b border-border bg-surface px-3 py-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!addMutation.isPending && body.trim() !== "") addMutation.mutate();
        }}
      >
        <textarea
          className={areaClass}
          rows={3}
          value={body}
          placeholder="What should the onboarding team know? Markdown is fine."
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex items-center justify-between">
          {addMutation.isError ? (
            <p className="text-[11px] text-destructive">{(addMutation.error as Error).message}</p>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className={primaryButtonClass}
            disabled={addMutation.isPending || body.trim() === ""}
          >
            {addMutation.isPending ? "Saving…" : "Add note"}
          </button>
        </div>
      </form>

      {deal.notes.length === 0 ? (
        <NoRows label="No notes yet." />
      ) : (
        <ul className="divide-y divide-border">
          {deal.notes.map((n) => (
            <li key={n.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  {n.author_name ?? "—"} ·{" "}
                  <span className="font-mono">{fmtDateTime(n.created_at)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    className={cn(
                      "rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                      n.review_status === "reviewed"
                        ? "border-transparent bg-status-ontrack text-status-ontrack-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                    title={
                      n.review_status === "reviewed"
                        ? `Reviewed by ${n.reviewed_by_name ?? "someone"} — click to reopen`
                        : "Mark reviewed so brief generation can use it"
                    }
                    onClick={() =>
                      reviewMutation.mutate({
                        noteId: n.id,
                        reviewed: n.review_status !== "reviewed",
                      })
                    }
                  >
                    {n.review_status === "reviewed" ? "Reviewed" : "Needs review"}
                  </button>
                  {canDelete(n.author_id) ? (
                    <button
                      type="button"
                      title="Delete note"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMutation.mutate(n.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  ) : null}
                </span>
              </div>
              <div className={cn("mt-1", markdownClass)}>
                <ReactMarkdown>{n.body_md}</ReactMarkdown>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- Stage history ---------- */

function HistoryPanel({ deal }: { deal: DealData }) {
  return (
    <Panel title="Stage history" count={deal.stage_history.length} level="supporting">
      {deal.stage_history.length === 0 ? (
        <NoRows label="No stage changes recorded." />
      ) : (
        <ul className="divide-y divide-border/70">
          {deal.stage_history.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[12px]">
                  {t.from_stage ? (
                    <>
                      {stageLabel(deal.stages, t.from_stage)}
                      <span className="mx-1 text-muted-foreground">→</span>
                    </>
                  ) : null}
                  <span className="font-medium">{stageLabel(deal.stages, t.to_stage)}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  <span className="font-mono text-[10px] uppercase tracking-wider">{t.source}</span>
                  {t.actor_name ? ` · ${t.actor_name}` : null}
                  {t.note ? ` · ${t.note}` : null}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {fmtDateTime(t.occurred_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
