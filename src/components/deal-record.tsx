import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Download, FileText, Trash2, Upload } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { PageBody, PageHeader } from "@/components/page";
import { dealQuery, type DealData } from "@/lib/deal-query";
import { CustomerLogo } from "@/components/customer-logo";
import { Field, NoRows, Panel } from "@/components/record";
import { EditableField } from "@/components/editable-field";
import { OwnerField } from "@/components/assignment-panel";
import { HelpPicksPanel } from "@/components/help-articles-panel";
import { DealGuide } from "@/components/deal-guide";
import { StageFlow } from "@/components/stage-flow";
import { PlanSection } from "@/components/plan-section";
import { DeliverablesStrip } from "@/components/deliverables-strip";
import { deliverablePhases } from "@/lib/deliverables";
import { useToolMarks } from "@/lib/use-tool-marks";
import { getSetupStatusFn } from "@/lib/setup-status.functions";
import { getWelcome } from "@/lib/welcome.functions";
import { guideSteps } from "@/lib/deal-guide";
import { readIntake } from "@/lib/intake-answers";
import { closeDateFor, timelineFor } from "@/lib/onboarding-plan";
import { dayCounter, localIso } from "@/lib/onboarding-timeline";
import { openPlanSection } from "@/components/timeline-panel";
import { openPanel } from "@/lib/panel-open";
import type { Deliverable } from "@/lib/deliverables";
import { canEditDeal, canManage, isSuperAdmin, useProfile } from "@/lib/auth";
import {
  addNote,
  addReport,
  createTamRequestForDeal,
  generateBriefForDeal,
  getBriefDownloadUrl,
  getDeal,
  getHandoffOptions,
  moveDealStage,
  removeNote,
  removeReport,
  saveIntake,
  setNoteReviewed,
  setDealField,
  startOnboardingForDeal,
  uploadSow,
} from "@/lib/presale.functions";
import {
  BUILTIN_PIPELINE_STAGES,
  isAtOrPast,
  stageLabel,
  wonStage,
  type PipelineStage,
} from "@/lib/pipeline-stages";
import { daysSince, fmtDate, fmtMoney } from "@/lib/hub-format";
import { When } from "@/components/when";
import { Working } from "@/components/working";
import type { EditableDealField } from "@/lib/presale-fields";
import { moveWithGate } from "@/lib/stage-move";
import type { AccountStage } from "@/lib/presale-stages";
import { cn } from "@/lib/utils";

// Shared field styles.
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

/**
 * Change the stage from the deal itself. The board's drag was the only way
 * before, which is a strange place to send somebody who is already on the
 * deal. Same gate as the board: Closed Won asks when the deal is not ready.
 */
function StageControl({
  dealId,
  stage,
  stages,
  editable,
}: {
  dealId: string;
  stage: string;
  stages: readonly PipelineStage[];
  editable: boolean;
}) {
  const move = useServerFn(moveDealStage);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (toStage: AccountStage) =>
      moveWithGate((force) =>
        move({ data: force ? { dealId, toStage, force: true } : { dealId, toStage } }),
      ),
    onMutate: () => setError(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["deal", dealId] });
      void queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
    onError: (e) => {
      const msg = (e as Error).message;
      if (msg !== "Left where it was.") setError(msg);
    },
  });
  if (!editable) return <StageChip stage={stage} stages={stages} />;
  return (
    <span className="inline-flex flex-col">
      <select
        className="h-6 rounded-sm border border-border bg-muted px-1.5 font-mono text-[11px] tracking-tight text-foreground"
        value={stage}
        disabled={m.isPending}
        onChange={(e) => m.mutate(e.target.value as AccountStage)}
        title="Move this deal to another stage. Every move is written to the stage history."
      >
        {stages
          .filter((s) => s.enterable || s.key === stage)
          .map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
      </select>
      {error ? <span className="mt-0.5 text-[11px] text-destructive">{error}</span> : null}
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

/**
 * The deal, as a record: the guide, what we are building, the facts, the
 * notes and documents, the intake, the plan, the history.
 *
 * Rendered two ways. On its own route for a deal that has not closed, and
 * embedded as the Pre-kickoff tab of the customer's page once it has — one
 * account page, and the brief and the welcome deck are a tab on it, not a
 * separate screen.
 */
export function DealRecord({ deal, embedded = false }: { deal: DealData; embedded?: boolean }) {
  const { account } = deal;
  const days = daysSince(account.stage_entered_at);
  const { profile } = useProfile();
  const editable = canEditDeal(profile?.role);

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

  // What is done and what is next, from the record. Clicking a step opens
  // its section; the section the guide points at carries a ring. The share
  // step also reads the welcome page's own readiness list, so "send the
  // link" cannot tick while the page still has blanks.
  const welcome = useQuery({
    queryKey: ["welcome", account.id],
    queryFn: () => getWelcome({ data: { dealId: account.id } }),
    refetchInterval: 10_000,
  });
  const setup = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => getSetupStatusFn(),
    staleTime: 60_000,
  });
  const steps = guideSteps({
    intake: account.intake,
    gongReports: deal.gong_reports.length,
    aiBriefs: deal.briefs.filter((b) => b.status === "complete" && b.generator === "llm").length,
    hasSow: Boolean(deal.sow_url),
    shareUrl: ((account as { welcome_share_url?: string | null }).welcome_share_url ?? null) as
      string | null,
    stageHistory: deal.stage_history,
    wonStageKey: wonStage(deal.stages).key,
    readiness: welcome.data?.readiness ?? [],
    customerOpened: Boolean(welcome.data?.openedAt),
    today: localIso(),
  });
  const nextPanel = steps.find((s) => !s.done)?.panel.id ?? null;

  // The day counter: where this account sits against its plan, today.
  const intakeForDay = readIntake(account.intake);
  const dayTimeline = timelineFor(
    intakeForDay,
    closeDateFor({
      intake: intakeForDay,
      stageHistory: deal.stage_history,
      wonStageKey: wonStage(deal.stages).key,
      today: localIso(),
    }).date,
  );
  // What we are building, as tiles: the first form, then every service the
  // SOW bought, checked off as the plan marks them live.
  const deliverables = deliverablePhases(intakeForDay, dayTimeline);
  const toolMarks = useToolMarks();

  // From the strip at the top: open the stage on the plan, or tick the
  // item's last step done today without scrolling anywhere.
  const saveIntakeFn = useServerFn(saveIntake);
  const tick = useMutation({
    mutationFn: (doneKey: string) =>
      saveIntakeFn({
        data: {
          dealId: account.id,
          patch: {
            timeline: {
              ...intakeForDay.timeline,
              completed: { ...intakeForDay.timeline.completed, [doneKey]: localIso() },
            },
          },
        } as never,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["deal", account.id] });
      void queryClient.invalidateQueries({ queryKey: ["welcome", account.id] });
      void queryClient.invalidateQueries({ queryKey: ["deal-pulse", account.id] });
    },
  });
  const openStage = (d: Deliverable) => {
    openPanel("deal:plan", "panel-plan");
    const id =
      d.id === "form"
        ? "plan-phase-1"
        : d.phase === 1
          ? "plan-phase-1-services"
          : `plan-phase-${d.phase}`;
    setTimeout(() => openPlanSection(id), 50);
  };
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localIso()), []);
  const counter = today ? dayCounter(dayTimeline, today) : null;
  const onPlan = isAtOrPast(deal.stages, account.stage, wonStage(deal.stages).key);

  return (
    <>
      {embedded ? (
        // The checklist sits in the customer page's header, above every tab;
        // this tab is the record behind it.
        <div className="flex justify-end">
          <StartOnboarding deal={deal} />
        </div>
      ) : (
        <PageHeader
          title={
            <span className="inline-flex items-center gap-2">
              {/* The customer's logo, captured here rather than after handoff:
                the kickoff deck is built from this record and is the document
                that most needs it. Carried into the customer at handoff. */}
              <CustomerLogo
                subject="deal"
                customerId={account.id}
                customerName={account.name}
                logoUrl={deal.logo_url}
              />
              {account.name}
            </span>
          }
          {...(account.summary ? { description: account.summary } : {})}
          // The deal page is long and dense; a header that re-states the summary
          // over every scroll clipped the record beneath it.
          sticky={false}
          actions={<StartOnboarding deal={deal} />}
        />
      )}
      <PageBody className={cn("space-y-4", embedded && "px-0 py-0")}>
        {embedded ? null : <StageFlow deal={deal} />}
        {deliverables.length ? (
          <div className="rounded-md border border-border bg-card px-4 py-3">
            <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              What we&apos;re building
            </p>
            <DeliverablesStrip
              phases={deliverables}
              overrides={toolMarks}
              onOpen={openStage}
              {...(editable ? { onComplete: (d: Deliverable) => tick.mutate(d.done_key) } : {})}
            />
          </div>
        ) : null}

        {/* THE ORDER OF THE PAGE. What we collect up front, folded once it is
            in; the intake, folded once it is complete; the brief beside them;
            then the plan across the whole width, because it is the thing
            everyone works from; and the opportunity's history last, folded,
            for the day somebody needs it. */}
        <Panel
          id="panel-gong"
          highlight={nextPanel === "panel-gong"}
          title="Notes & documents"
          meta={`${deal.gong_reports.length} call note${deal.gong_reports.length === 1 ? "" : "s"} · SOW ${deal.sow_url ? "on file" : "missing"} · ${deal.notes.length} sales note${deal.notes.length === 1 ? "" : "s"}`}
          level="primary"
          collapsible
          // Step 1 of the front door collects the notes and the paper now;
          // this is the full record, folded until somebody wants it.
          defaultOpen={false}
          collapseKey="deal:gong"
        >
          <div className="space-y-3 p-3">
            <p className="text-[12px] text-muted-foreground">
              Everything we collect up front: the Gong brief and call notes, the signed statement of
              work, and any sales notes. The AI synthesis and the welcome page read from here.
            </p>
            <ReportsPanel deal={deal} />
            <SowPanel deal={deal} onSave={set} editable={editable} />
            <NotesPanel deal={deal} />
          </div>
        </Panel>

        <PlanSection deal={deal} editable={editable} highlight={nextPanel === "panel-plan"} />

        <HelpPicksPanel deal={deal} editable={editable} />

        {/* EVERYTHING ELSE, FOLDED. The checklist, the deal's facts, the
            intake and the opportunity's history are all still here — a
            person building a deck does not need to look at any of them until
            "Build it" names a blank, and then it names where. */}
        <Panel
          id="panel-details"
          title="Details"
          meta="The checklist, the deal's facts, the intake answers, the history"
          level="supporting"
          collapsible
          defaultOpen={false}
          collapseKey="deal:details"
        >
          <div className="space-y-4 p-3">
            <DealGuide
              steps={steps}
              setup={setup.data ?? null}
              manager={canManage(profile?.role)}
            />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border bg-card px-4 py-3">
              {/* One clock. Before closed-won it is days in stage; after, it is
              the day counter against the plan. Two numbers side by side is
              how somebody asks which one they are meant to be watching. */}
              <div className="flex items-center gap-2">
                <StageControl
                  dealId={account.id}
                  stage={account.stage}
                  stages={deal.stages}
                  editable={editable}
                />
                {!(counter && onPlan) ? (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {days ?? 0}d in stage
                  </span>
                ) : null}
              </div>
              {counter && onPlan ? (
                <span
                  className={cn(
                    "inline-flex items-baseline gap-2 rounded-full border px-2.5 py-1 text-[11px]",
                    counter.state === "live"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                      : counter.state === "past_due"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                        : "border-primary/30 bg-primary/5 text-foreground",
                  )}
                  title={counter.detail}
                >
                  <b className="font-semibold">{counter.label}</b>
                  <span className="text-muted-foreground">{counter.detail}</span>
                </span>
              ) : null}
              {/* ARR leads, and is editable, because an account that starts at 5k
              and grows to 8k is the fact this pipeline exists to notice. Every
              change lands in the activity feed, so the account carries its own
              record of what the number was and when it moved. */}
              <EditableField
                label="Company name"
                value={account.name}
                placeholder="The company, as the customer says it"
                onSave={set("name")}
                disabled={!editable}
              />
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
                options={deal.am_owner_options ?? deal.owner_options ?? []}
                onSave={set("am_owner_id")}
                disabled={!editable}
              />
              <EditableField
                label="SE owner"
                value={account.se_owner_id ?? null}
                display={deal.se_owner_name ?? "Unassigned"}
                type="select"
                options={deal.se_owner_options ?? deal.owner_options ?? []}
                onSave={set("se_owner_id")}
                disabled={!editable}
              />
              {/* The champion, and the two facts that make them reachable.
              Carried into customer_contacts when this deal becomes a project,
              which is the point at which one contact becomes many. */}
              <span id="deal-contact" className="contents">
                <EditableField
                  label="Contact"
                  value={account.primary_contact_name ?? null}
                  placeholder="Who to call at the customer"
                  onSave={set("primary_contact_name")}
                  disabled={!editable}
                />
              </span>
              <EditableField
                label="Contact email"
                value={account.primary_contact_email ?? null}
                type="email"
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
              <span id="deal-owner" className="contents">
                <OwnerField dealId={account.id} editable={editable} />
              </span>
              <Field label="Created" value={fmtDate(account.created_at)} />
            </div>
            {field.error ? (
              <p className="text-[12px] text-destructive">{(field.error as Error).message}</p>
            ) : null}
            <Panel
              title="Opportunity history"
              meta="Generated briefs, the stage history and TAM requests"
              collapsible
              defaultOpen={false}
              collapseKey="deal:more"
            >
              <div className="space-y-4 p-3">
                <BriefsPanel deal={deal} />
                <HistoryPanel deal={deal} />
                <TamPanel deal={deal} />
              </div>
            </Panel>
          </div>
        </Panel>
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

  const allowed = canEditDeal(profile?.role);
  // The Closed Won gate reads the stage MARKED as won, not the literal — the
  // same list startOnboarding checks server-side.
  const pipeline = deal.stages ?? BUILTIN_PIPELINE_STAGES;
  const stageReady = isAtOrPast(pipeline, deal.account.stage, wonStage(pipeline).key);

  const error = mutation.isError ? (
    <p className="text-[11px] text-destructive">{(mutation.error as Error).message}</p>
  ) : null;
  // Closed Won tried to start onboarding and could not — usually a customer
  // with the same name already exists. Say so, next to the picker that
  // resolves it, instead of leaving a closed deal that quietly has no page.
  const deferred = deal.onboarding_deferred ? (
    <p className="max-w-sm text-right text-[11px] text-amber-800 dark:text-amber-300">
      Onboarding did not start on its own: {deal.onboarding_deferred} Pick the account below.
    </p>
  ) : null;

  // A linked deal is already on its customer's page; the implementation is a tab there.
  if (deal.account.customer_id) return null;

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
        {deferred}
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
      {deferred}
      {error}
    </div>
  );
}

/* ---------- Notes & Gong reports ---------- */

/**
 * What was sold.
 *
 * On the deal because that is when it is signed. Implementation used to be the
 * only place a SOW could be recorded, which meant it could not be recorded
 * until after the handoff it was supposed to inform — and in production, not
 * one project had one. It prints on the kickoff deck, and the deck says
 * plainly when it is missing.
 */
function SowPanel({
  deal,
  onSave,
  editable,
}: {
  deal: DealData;
  onSave: (field: EditableDealField) => (value: string | null) => Promise<unknown>;
  editable: boolean;
}) {
  const { account } = deal;
  const recorded =
    account.sow_reference ||
    account.sow_signed_date ||
    account.sow_value != null ||
    account.sow_document_url ||
    deal.sow_url;
  // "On file" means the signed document is here. A reference number alone
  // is a promise, and the Closed Won check reads the document, not the promise.
  // The upload lands in storage as a path, signed onto the record as sow_url;
  // the old external-link column is the other way a document can be here.
  const onFile = Boolean(deal.sow_url || account.sow_document_url);

  return (
    <Panel
      title="Statement of work"
      meta={onFile ? "On file" : recorded ? "Details only — upload the signed PDF" : "Not recorded"}
      collapsible
      defaultOpen={!recorded}
      collapseKey="deal:sow"
    >
      <div className="space-y-2 px-3 py-2.5">
        {!recorded ? (
          <p className="text-[12px] text-muted-foreground">
            Nothing recorded. The kickoff deck will say so, in front of the customer — the reference
            and the signed document are what implementation builds against.
          </p>
        ) : onFile && !account.sow_reference && !account.sow_signed_date ? (
          <p className="text-[12px] text-muted-foreground">
            The signed document is on file. Reference, signed date and value are still blank — fill
            them in if the SOW names them; the plan reads the document either way.
          </p>
        ) : null}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <EditableField
            label="Reference"
            value={account.sow_reference ?? null}
            placeholder="SOW-2026-0114"
            onSave={onSave("sow_reference")}
            disabled={!editable}
          />
          <EditableField
            label="Signed"
            value={account.sow_signed_date ?? null}
            format={(v) => (v ? fmtDate(v) : "—")}
            type="date"
            placeholder="2026-01-14"
            onSave={onSave("sow_signed_date")}
            disabled={!editable}
          />
          <EditableField
            label="Value"
            value={account.sow_value != null ? String(account.sow_value) : null}
            format={(v) => (v ? fmtMoney(Number(v)) : "—")}
            type="number"
            placeholder="84000"
            onSave={onSave("sow_value")}
            disabled={!editable}
          />
          <SowDocument deal={deal} editable={editable} />
          {/* Still here, for a SOW that genuinely lives in Docusign or Drive.
              Most of the time the AE has the PDF and uploads it above. */}
          <EditableField
            label="Or link to it"
            value={account.sow_document_url ?? null}
            format={(v) =>
              v ? (
                <a href={v} target="_blank" rel="noreferrer" className="underline">
                  Open
                </a>
              ) : (
                "—"
              )
            }
            placeholder="https://…"
            onSave={onSave("sow_document_url")}
            disabled={!editable}
          />
        </div>
      </div>
    </Panel>
  );
}

/**
 * The signed SOW itself.
 *
 * An upload, not a URL: what an AE has after close is the PDF, and asking them
 * to park it somewhere else first and paste a link is why the field stayed
 * empty. Into the private attachments bucket, opened through a short-lived
 * signed link — a countersigned contract must never sit behind a URL that
 * works for anyone who has it.
 */
function SowDocument({ deal, editable }: { deal: DealData; editable: boolean }) {
  const { account } = deal;
  const qc = useQueryClient();
  const upload = useServerFn(uploadSow);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      return upload({
        data: {
          dealId: account.id,
          fileName: file.name,
          contentType: "application/pdf",
          dataBase64,
        },
      });
    },
    onSuccess: async () => {
      setError(null);
      await qc.invalidateQueries({ queryKey: ["deal", account.id] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Upload failed."),
  });

  const pick = (file: File | undefined) => {
    if (!file) return;
    // Checked here as well as on the server so the person gets the reason
    // immediately rather than after uploading 20MB.
    if (file.type !== "application/pdf") {
      setError("The signed SOW should be a PDF.");
      return;
    }
    if (file.size > 25_000_000) {
      setError(
        `That file is ${Math.round(file.size / 1_000_000)}MB. The limit is 25MB — link to it instead.`,
      );
      return;
    }
    setError(null);
    mutation.mutate(file);
  };

  return (
    <div className="space-y-0.5">
      <span className={labelClass}>Signed document</span>
      <div className="flex items-center gap-2">
        {deal.sow_url ? (
          <a
            href={deal.sow_url}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] underline"
            title={account.sow_document_name ?? "Open the signed SOW"}
          >
            {account.sow_document_name ?? "Open"}
          </a>
        ) : (
          <span className="text-[12px] text-muted-foreground">Not uploaded</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            // Reset so choosing the same file twice still fires a change.
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className={buttonClass}
          disabled={!editable || mutation.isPending}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3 w-3" aria-hidden />
          {mutation.isPending ? "Uploading…" : deal.sow_url ? "Replace" : "Upload PDF"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

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
  const [callDate, setCallDate] = useState("");
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
          callDate: callDate || null,
        },
      }),
    onSuccess: () => {
      invalidate();
      setAdding(false);
      setTitle("");
      setContentMd("");
      setCallDate("");
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
      title="Gong brief & call notes"
      count={deal.gong_reports.length}
      collapsible
      collapseKey="deal:gong-reports"
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
          <div className="grid grid-cols-[1fr_9rem_9rem] gap-2">
            <div>
              <label className={labelClass} htmlFor="gong-title">
                Title *
              </label>
              <input
                id="gong-title"
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="gong-type">
                Type
              </label>
              <select
                id="gong-type"
                className={inputClass}
                value={reportType}
                onChange={(e) => setReportType(e.target.value as "call_notes" | "account_map")}
              >
                <option value="call_notes">Call notes</option>
                <option value="account_map">Account map</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="gong-call-date">
                Call date
              </label>
              <input
                id="gong-call-date"
                type="date"
                className={inputClass}
                value={callDate}
                onChange={(e) => setCallDate(e.target.value)}
                title="The day the call happened. Leave empty if it was today."
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className={labelClass}>Call notes *</label>
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
              placeholder="Paste the Gong recap or your meeting notes here. Plain text is fine."
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
        <NoRows label="No reports yet. Paste Gong call notes or an account map — they feed the welcome page and the handoff." />
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
                  <span
                    className="font-mono"
                    title={r.call_date ? `Added ${fmtDate(r.created_at)}` : "The day it was added"}
                  >
                    {r.call_date ? `Call ${fmtDate(r.call_date)}` : fmtDate(r.created_at)}
                  </span>
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

/**
 * The brief IS the welcome page now. The seventeen-slide PowerPoint this
 * panel used to generate is not something anyone presents any more; the
 * customer-facing page — team, timeline, what's expected, how we get there —
 * is the document, and it is always current. Old briefs stay listed for
 * their history and their discovery questions.
 */
function BriefsPanel({ deal }: { deal: DealData }) {
  const download = useServerFn(getBriefDownloadUrl);
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
      title="Brief history"
      count={deal.briefs.length}
      meta="Every generated brief, newest first"
      collapsible
      defaultOpen={false}
      collapseKey="deal:brief"
    >
      {downloadMutation.isError ? (
        <p className="border-b border-border px-3 py-2 text-[11px] text-destructive">
          {(downloadMutation.error as Error).message}
        </p>
      ) : null}
      {deal.briefs.length === 0 ? null : (
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
                <span className="font-mono">
                  <When value={b.created_at} />
                </span>
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
      collapsible
      defaultOpen={false}
      collapseKey="deal:tam"
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
      collapsible
      defaultOpen={false}
      collapseKey="deal:notes"
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
                  <span className="font-mono">
                    <When value={n.created_at} />
                  </span>
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
    <Panel
      title="Stage history"
      count={deal.stage_history.length}
      level="supporting"
      collapsible
      defaultOpen={false}
      collapseKey="deal:history"
    >
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
                <When value={t.occurred_at} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
