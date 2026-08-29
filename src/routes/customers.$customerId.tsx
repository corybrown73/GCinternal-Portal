import type { ReactNode } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight, ArrowRight } from "lucide-react";

import { HealthNote } from "@/components/health-note";
import { PlanPanel } from "@/components/plan-panel";
import { HandoffPanel } from "@/components/handoff-panel";
import { LifecycleRail } from "@/components/lifecycle-rail";
import { AdvanceStage } from "@/components/stage-advance-write";
import { launchAcceptanceGate } from "@/lib/launch-gate";
import { nextLifecycleStage } from "@/lib/stage-advance-input";
import { AddSuccessCriterion, EditSuccessCriterion } from "@/components/success-criterion-write";
import { AddObservation, CustomerConfirmationEditor } from "@/components/success-observation-write";
import {
  AddAdoptionArea,
  AddAdoptionObservation,
  EditAdoptionArea,
} from "@/components/adoption-write";
import {
  AddApproval,
  AddCommitment,
  AddDecision,
  AddEscalation,
  AddEvidence,
  AddIssue,
  AddRequirement,
  AddRisk,
  EditApproval,
  EditCommitment,
  EditDecision,
  EditEscalation,
  EditEvidence,
  EditIssue,
  EditRequirement,
  EditRisk,
  type RelatedRecord,
} from "@/components/delivery-write";
import { EditImplementation } from "@/components/implementation-write";
import { SowPanel } from "@/components/sow-write";
import { SowAnalysisPanel } from "@/components/sow-analysis";
import {
  CustomerGoalsPanel,
  DiscoveryBoardPanel,
  type DiscoveryBoardImplementation,
} from "@/components/discovery-board-write";
import { JournalPanel } from "@/components/journal-write";

import { ADOPTION_KIND_LABEL, type AdoptionKind } from "@/lib/adoption-input";
import { contactRoleLabel } from "@/lib/customer-contact-input";
import { AddCustomerContact, EditCustomerContact } from "@/components/customer-contact-write";
import {
  AttentionBand,
  Field,
  NoRows,
  Panel,
  PrimarySignal,
  SeverityChip,
  StageBadge,
  StatusChip,
} from "@/components/record";

import { getCustomer360 } from "@/lib/hub.functions";
import type { Customer360, TraceStep } from "@/lib/hub-types";
import { LIFECYCLE_STAGES } from "@/lib/lifecycle";
import {
  daysSince,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  humanize,
  isOverdue,
  isPreHandoffStage,
  normalizeStage,
  stageLabel,
} from "@/lib/hub-format";
import {
  adoptionAreaLevel,
  adoptionSummary,
  ADOPTION_LEVEL_LABEL,
  latestAdoptionObservation,
  deriveHealth,
  launchStateConflict,
  meaningfulEvents,
  nextAction,
  openItems,
  progress,
  proveValueState,
  proveValueGaps,
  PROVE_VALUE_LABEL,
  whatMattersNow,
  waitingOnForCustomer,
  WAITING_ON_LABEL,
} from "@/lib/customer360-derive";
import {
  graduationReadiness,
  graduationReadinessSummary,
  graduationEvidence,
  READINESS_STATE_LABEL,
} from "@/lib/graduation-readiness";
import { cn } from "@/lib/utils";

const TABS = [
  "overview",
  "journey",
  "solution",
  "requirements",
  "decisions",
  "risks",
  "evidence",
  "history",
] as const;
type TabId = (typeof TABS)[number];

const TAB_LABEL: Record<TabId, string> = {
  overview: "Overview",
  journey: "Journey",
  solution: "Solution",
  requirements: "Requirements",
  decisions: "Decisions",
  risks: "Risks & Issues",
  evidence: "Evidence",
  history: "History",
};

// A customer can have several implementations running at once. `implementationId`
// picks which one this page shows; without it we show the most recent.
const customerQuery = (customerId: string, implementationId?: string | null) =>
  queryOptions({
    queryKey: ["customer360", customerId, implementationId ?? null],
    queryFn: () =>
      getCustomer360({ data: { customerId, implementationId: implementationId ?? null } }),
  });

export const Route = createFileRoute("/customers/$customerId")({
  validateSearch: (search: Record<string, unknown>): { tab?: TabId; impl?: string } => {
    const raw = String(search["tab"] ?? "overview") as TabId;
    const impl = typeof search["impl"] === "string" ? (search["impl"] as string) : undefined;
    return { tab: TABS.includes(raw) ? raw : "overview", ...(impl ? { impl } : {}) };
  },
  head: () => ({
    meta: [
      { title: "Customer implementation — Implementation Hub" },
      {
        name: "description",
        content:
          "Structured implementation record: current state, journey, solution, requirements, decisions, risks and full change history.",
      },
      { property: "og:title", content: "Customer implementation — Implementation Hub" },
      {
        property: "og:description",
        content: "Current state and historical context for one customer implementation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loaderDeps: ({ search }) => ({ impl: search.impl ?? null }),
  loader: async ({ context, params, deps }) => {
    const data = await context.queryClient.ensureQueryData(
      customerQuery(params.customerId, deps.impl),
    );
    if (!data) throw notFound();
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load this implementation: {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-[13px]">
      Customer not found.{" "}
      <Link to="/customers" search={{ sort: "days", dir: "desc" }} className="underline">
        Back to customers
      </Link>
    </div>
  ),
  component: Customer360Page,
});

/* ------------------------------------------------------------------ */
/* small shared bits                                                    */
/* ------------------------------------------------------------------ */

const dash = (v: unknown): ReactNode =>
  v === null || v === undefined || v === "" ? "—" : (v as ReactNode);

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cn("px-3 py-2.5", className)}>{children}</li>;
}

function Meta({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {items.map(([k, v]) => (
        <span key={k}>
          <span className="uppercase tracking-[0.08em]">{k}</span>{" "}
          <span className="text-foreground">{v ?? "—"}</span>
        </span>
      ))}
    </div>
  );
}

function TraceChain({ trace }: { trace: TraceStep[] }) {
  if (!trace.length)
    return <span className="text-[11px] text-muted-foreground">No trace links recorded</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="uppercase tracking-[0.08em] text-muted-foreground">Traced to</span>
      {trace.map((s, i) => (
        <span key={`${s.entity_type}-${s.id}`} className="flex items-center gap-1.5">
          {i > 0 ? <ArrowRight className="h-3 w-3 text-muted-foreground" /> : null}
          <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5">
            <span className="text-muted-foreground">{humanize(s.entity_type)}:</span> {s.label}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * Every implementation this customer has. Selecting one reloads this page for
 * that record — each keeps its own stage, owner, dates and notes.
 */
function ImplementationSwitcher({
  customerId,
  tab,
  activeId,
  implementations,
}: {
  customerId: string;
  tab: TabId;
  activeId: string;
  implementations: Customer360["implementations"];
}) {
  if (implementations.length < 2) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        Implementations
      </span>
      {implementations.map((row) => (
        <Link
          key={row.id}
          to="/customers/$customerId"
          params={{ customerId }}
          search={{ tab, impl: row.id }}
          className={cn(
            "rounded-sm border px-1.5 py-0.5 text-[11px]",
            row.id === activeId
              ? "border-primary bg-muted text-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {row.name}
          <span className="ml-1.5 text-muted-foreground">
            {stageLabel(row.current_stage)} · {row.owner_name ?? "Unassigned"}
          </span>
        </Link>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Customer360Page() {
  const { customerId } = Route.useParams();
  const { tab = "overview", impl: selectedImplId } = Route.useSearch();
  const { data } = useSuspenseQuery(customerQuery(customerId, selectedImplId ?? null));
  const record = data as Customer360;
  const { customer, implementation: impl } = record;
  const health = impl ? deriveHealth(record, impl) : { level: "no_signal" as const, reason: null };

  if (!impl) {
    return (
      <div className="p-6">
        <h1 className="text-[17px] font-semibold">{customer.name}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          This customer has no implementation record yet.
        </p>
      </div>
    );
  }

  const prog = progress(impl.current_stage);

  return (
    <div className="pb-16">
      {/* ---------------- PERSISTENT HEADER ---------------- */}
      <header className="border-b border-border bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Link
                to="/customers"
                search={{ sort: "days", dir: "desc" }}
                className="hover:underline"
              >
                Customers
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span>{customer.name}</span>
            </div>
            <h1 className="mt-1 text-[17px] font-semibold tracking-tight">{customer.name}</h1>
            <ImplementationSwitcher
              customerId={customerId}
              tab={tab}
              activeId={impl.id}
              implementations={record.implementations}
            />
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {[customer.industry, impl.tier, customer.segment].filter(Boolean).join(" · ") || "—"}
              {" · Owner "}
              {impl.owner_name ?? "Unassigned"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusChip status={health.level} />
            <HealthNote
              recorded={impl.health_recorded}
              recordedReason={impl.health_recorded_reason}
              recordedAt={impl.health_recorded_at}
              legacyStatus={impl.status}
              computed={health.level}
            />
            <StageBadge stage={impl.current_stage} />
            <span className="font-mono text-[11px] text-muted-foreground">
              {daysSince(impl.stage_entered_at)}d in stage
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              stage {prog.index}/{prog.total}
            </span>
            <div className="h-1 w-24 overflow-hidden rounded-sm bg-muted">
              <div className="h-full bg-primary" style={{ width: `${prog.pct}%` }} />
            </div>
            <span className="text-[11px] text-muted-foreground">
              Target launch{" "}
              <span className="text-foreground">{fmtDate(impl.target_launch_date)}</span>
            </span>
          </div>
        </div>

        <div className="px-6 pb-4 pt-3">
          <AttentionBand>
            <PrimarySignal label="What matters now" value={whatMattersNow(record)} />
            <PrimarySignal label="Next action" value={nextAction(record, impl)} />
          </AttentionBand>
        </div>

        <nav className="flex flex-wrap gap-px border-t border-border px-4">
          {TABS.map((t) => (
            <Link
              key={t}
              to="/customers/$customerId"
              params={{ customerId }}
              search={{ tab: t, ...(selectedImplId ? { impl: selectedImplId } : {}) }}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-[12px] font-medium transition-colors",
                t === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {TAB_LABEL[t]}
            </Link>
          ))}
        </nav>
      </header>

      <div className="space-y-4 px-6 py-4">
        {tab === "overview" ? <OverviewTab record={record} customerId={customerId} /> : null}
        {tab === "journey" ? <JourneyTab record={record} customerId={customerId} /> : null}
        {tab === "solution" ? <SolutionTab record={record} customerId={customerId} /> : null}
        {tab === "requirements" ? (
          <RequirementsTab record={record} customerId={customerId} />
        ) : null}
        {tab === "decisions" ? <DecisionsTab record={record} customerId={customerId} /> : null}
        {tab === "risks" ? <RisksTab record={record} customerId={customerId} /> : null}

        {tab === "evidence" ? <EvidenceTab record={record} customerId={customerId} /> : null}
        {tab === "history" ? <HistoryTab record={record} /> : null}
      </div>
    </div>
  );
}

/* ---------------- 1. OVERVIEW ---------------- */

function OverviewTab({ record, customerId }: { record: Customer360; customerId: string }) {
  const impl = record.implementation!;
  const open = openItems(record);
  const prog = progress(impl.current_stage);
  const boardImpl: DiscoveryBoardImplementation = {
    id: impl.id,
    name: impl.name,
    owner_id: impl.owner_id,
    sales_owner: impl.sales_owner,
    tier: impl.tier,
    status: impl.status,
    sow_reference: impl.sow_reference,
    sow_document_url: impl.sow_document_url,
    sow_document_name: impl.sow_document_name,
    sow_value: impl.sow_value,
    sow_signed_date: impl.sow_signed_date,
    contract_start_date: impl.contract_start_date,
    target_launch_date: impl.target_launch_date,
    actual_launch_date: impl.actual_launch_date,
    customer_goals: impl.customer_goals,
    discovery_board_url: impl.discovery_board_url,
    discovery_board_image_url: impl.discovery_board_image_url,
    discovery_board_image_name: impl.discovery_board_image_name,
    discovery_board_notes: impl.discovery_board_notes,
  };
  const events = meaningfulEvents(record);
  const waiting = waitingOnForCustomer(record);
  const valueGaps = proveValueGaps(record.success_criteria, impl.current_stage);
  // Behavioural only — never derived from success criteria or health.
  const adoption = adoptionSummary(record.adoption);
  // Read-only readiness view; deliberately independent of health/triage/waitingOn.
  const readiness = graduationReadiness(record, impl);
  const readinessSummary = graduationReadinessSummary(readiness);
  const gradEvidence = graduationEvidence(record, impl);
  const solutionOwners = Array.from(
    new Set(record.technical_solutions.map((s: any) => s.owner_name).filter(Boolean)),
  );
  const approvers = Array.from(
    new Map(
      record.approvals.filter((a: any) => a.approver_name).map((a: any) => [a.approver_name, a]),
    ).values(),
  );

  return (
    <div className="grid items-start gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Panel title="Current state" level="primary">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-3 py-2.5 md:grid-cols-4">
            <Field label="Stage" value={stageLabel(impl.current_stage)} />
            <Field
              label="Health"
              value={<StatusChip status={deriveHealth(record, impl).level} />}
            />
            <Field label="Target launch" value={fmtDate(impl.target_launch_date)} />
            <Field label="Progress" value={`${prog.index} / ${prog.total} stages`} />
          </dl>
          <div className="space-y-2 border-t border-border px-3 py-3">
            <PrimarySignal
              label="Waiting on"
              emphasis="medium"
              value={
                waiting.party === "none" ? "No current dependency" : WAITING_ON_LABEL[waiting.party]
              }
              detail={
                waiting.party === "none"
                  ? undefined
                  : waiting.reason.replace(/^Waiting on [^—]+ — /, "")
              }
            />
            {valueGaps.length ? (
              <p className="text-[12px] leading-snug text-muted-foreground">
                Value proof · {valueGaps.length} success criteri
                {valueGaps.length > 1 ? "a" : "on"} late — {valueGaps[0]!.reason}
              </p>
            ) : null}
            {adoption ? (
              <p className="text-[12px] leading-snug text-muted-foreground">
                Usage · {ADOPTION_LEVEL_LABEL[adoption.level]} — {adoption.reason}
              </p>
            ) : null}
          </div>

          <div className="border-t border-border px-3 py-2">
            <p className="mb-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Statement of work
            </p>
            <SowPanel
              customerId={customerId}
              implementation={{
                id: impl.id,
                name: impl.name,
                owner_id: impl.owner_id,
                sales_owner: impl.sales_owner,
                tier: impl.tier,
                status: impl.status,
                sow_reference: impl.sow_reference,
                sow_document_url: impl.sow_document_url,
                sow_document_name: impl.sow_document_name,
                sow_value: impl.sow_value,
                sow_signed_date: impl.sow_signed_date,
                contract_start_date: impl.contract_start_date,
                target_launch_date: impl.target_launch_date,
                actual_launch_date: impl.actual_launch_date,
                customer_goals: impl.customer_goals,
              }}
            />
          </div>
          <div className="border-t border-border px-3 py-2">
            <EditImplementation
              customerId={customerId}
              implementation={{
                id: impl.id,
                name: impl.name,
                owner_id: impl.owner_id,
                sales_owner: impl.sales_owner,
                tier: impl.tier,
                status: impl.status,
                sow_reference: impl.sow_reference,
                sow_value: impl.sow_value,
                sow_signed_date: impl.sow_signed_date,
                contract_start_date: impl.contract_start_date,
                target_launch_date: impl.target_launch_date,
                actual_launch_date: impl.actual_launch_date,
                customer_goals: impl.customer_goals,
              }}
              team={record.team}
            />
          </div>
        </Panel>

        <Panel title="What the customer wants to achieve" level="primary">
          <div className="px-3 py-3">
            <CustomerGoalsPanel customerId={customerId} implementation={boardImpl} />
          </div>
          <div className="border-t border-border bg-surface px-3 py-2">
            <p className="mb-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Discovery board (Miro) · supporting context
            </p>
            <DiscoveryBoardPanel customerId={customerId} implementation={boardImpl} />
          </div>
        </Panel>

        <Panel
          title="What success looks like"
          count={record.success_criteria.length}
          level="primary"
        >
          <p className="border-b border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Each measure records what success looks like, how it will be measured, the starting
            point and target where they apply, and who owns it. Working context belongs in the TIS
            journal, not here.
          </p>

          {/* Kickoff intake: the named customer people outcomes and adoption are
              owned by, and who confirms value. Reuses the customer contact record. */}
          <div className="border-b border-border px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Customer contacts
            </p>
            {record.contacts.length ? (
              <ul className="mt-1 divide-y divide-border border-y border-border">
                {record.contacts.map((c) => (
                  <li key={c.id} className="py-1.5">
                    <div className="flex flex-wrap items-baseline gap-2 text-[12px]">
                      <span className="font-medium">{c.name}</span>
                      <span className="rounded border border-border px-1 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        {contactRoleLabel(c.role) ?? c.role}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{dash(c.email)}</span>
                      <span className="ml-auto">
                        <EditCustomerContact customerId={customerId} contact={c} />
                      </span>
                    </div>
                    {c.notes ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{c.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                No customer contacts recorded — outcome ownership, value confirmation and adoption
                ownership cannot be attributed yet.
              </p>
            )}
            <div className="mt-1.5">
              <AddCustomerContact customerId={customerId} />
            </div>
          </div>
          {record.success_criteria.length ? (
            <ul className="divide-y divide-border">
              {record.success_criteria.map((s) => (
                <SuccessCriterionRow
                  key={s.id}
                  criterion={s}
                  customerId={customerId}
                  implementationId={impl.id}
                  team={record.team}
                  contacts={record.contacts}
                  evidence={record.evidence}
                  currentStage={impl.current_stage}
                />
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap items-center gap-3 px-3 py-3">
              <span className="text-[12px] text-muted-foreground">
                No success measures recorded yet. Add one so we can measure whether this
                implementation delivers value.
              </span>
            </div>
          )}
          <div className="border-t border-border px-3 py-2">
            <AddSuccessCriterion
              customerId={customerId}
              implementationId={impl.id}
              team={record.team}
              contacts={record.contacts}
            />
          </div>
        </Panel>

        {/* Adoption is behavioural ("are they using it as intended?") and is kept
            deliberately separate from Value & success above. */}
        <Panel
          title="How the customer will use it"
          count={record.adoption.length}
          meta={adoption ? ADOPTION_LEVEL_LABEL[adoption.level] : undefined}
          level="supporting"
        >
          <p className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
            Each row records how the customer is expected to use the solution — the intended users,
            how often, and what counts as being in use. Usage observations underneath record what is
            actually happening; the discovery board is supporting context only.
          </p>

          {adoption?.workarounds.length ? (
            <p className="border-b border-border px-3 py-2 text-[12px]">
              <span className="text-muted-foreground">Workarounds still in use · </span>
              {adoption.workarounds
                .map((w) => `${w.name}${w.description ? ` (${w.description})` : ""}`)
                .join("; ")}
            </p>
          ) : null}
          {record.adoption.length ? (
            <ul className="divide-y divide-border">
              {record.adoption.map((a) => (
                <AdoptionAreaRow
                  key={a.id}
                  area={a}
                  customerId={customerId}
                  team={record.team}
                  contacts={record.contacts}
                  evidence={record.evidence}
                />
              ))}
            </ul>
          ) : (
            <div className="px-3 py-3 text-[12px] text-muted-foreground">
              No usage areas recorded yet.
            </div>
          )}
          <div className="border-t border-border px-3 py-2">
            <AddAdoptionArea
              customerId={customerId}
              implementationId={impl.id}
              team={record.team}
              contacts={record.contacts}
            />
          </div>
        </Panel>

        {/* Read-only readiness view. Not a gate: it never blocks or moves a stage. */}
        <Panel title="Ready to hand over" level="supporting" meta={readinessSummary.line}>
          <p className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
            Read-only assessment of whether this customer is actually ready for handover to Customer
            Success. Nothing here blocks stage movement.
          </p>
          <ul className="divide-y divide-border">
            {readiness.map((area) => (
              <li key={area.id} className="flex items-start gap-3 px-3 py-2">
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]",
                    area.state === "ready"
                      ? "border-border text-foreground"
                      : area.state === "needs_attention"
                        ? "border-destructive/60 text-destructive"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {READINESS_STATE_LABEL[area.state]}
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium">{area.label}</p>
                  <p className="text-[12px] text-muted-foreground">{area.reason}</p>
                </div>
                {area.tab && area.tab !== "overview" ? (
                  <Link
                    to="/customers/$customerId"
                    params={{ customerId }}
                    search={{ tab: area.tab as TabId }}
                    className="ml-auto shrink-0 text-[11px] text-muted-foreground underline hover:text-foreground"
                  >
                    {TAB_LABEL[area.tab as TabId]}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          {gradEvidence.hasRecord ? (
            <>
              <div className="border-t border-border px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  Verified by structured records
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
                  {gradEvidence.verified.map((f) => (
                    <Field key={f.label} label={f.label} value={f.value} />
                  ))}
                </dl>
              </div>
              {gradEvidence.narrative.length ? (
                <div className="border-t border-dashed border-border bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    Recorded as narrative — not independently verified
                  </p>
                  <ul className="mt-2 space-y-2">
                    {gradEvidence.narrative.map((n) => (
                      <li
                        key={n.label}
                        className="border-l-2 border-dashed border-muted-foreground/40 pl-2"
                      >
                        <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                          {n.label} · {n.source}
                        </p>
                        <p className="text-[12px] italic text-muted-foreground">{n.value}</p>
                      </li>
                    ))}
                  </ul>
                  {gradEvidence.corroboration ? (
                    <p className="mt-2 border-t border-dashed border-border pt-2 text-[11px] text-destructive">
                      {gradEvidence.corroboration}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="border-t border-border px-3 py-2 text-[12px] text-muted-foreground">
              No handover record exists yet — nothing is assumed on its behalf.
            </p>
          )}
        </Panel>

        <Panel
          title="Open items"
          level="primary"
          meta={`${
            open.commitments.length +
            open.risks.length +
            open.issues.length +
            open.escalations.length
          } open`}
        >
          <div className="grid grid-cols-2 divide-x divide-border border-b border-border md:grid-cols-4">
            {(
              [
                ["Commitments", open.commitments.length],
                ["Risks", open.risks.length],
                ["Issues", open.issues.length],
                ["Escalations", open.escalations.length],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  {k}
                </div>
                <div className="font-mono text-[16px]">{v}</div>
              </div>
            ))}
          </div>
          <ul className="divide-y divide-border">
            {[
              ...open.escalations.map((e: any) => ({
                id: `e-${e.id}`,
                kind: "Escalation",
                title: e.title,
                severity: e.severity,
                extra: e.status,
              })),
              ...open.risks.map((r: any) => ({
                id: `r-${r.id}`,
                kind: "Risk",
                title: r.title,
                severity: r.severity,
                extra: `${r.likelihood} likelihood`,
              })),
              ...open.issues.map((r: any) => ({
                id: `i-${r.id}`,
                kind: "Issue",
                title: r.title,
                severity: r.severity,
                extra: r.status,
              })),
              ...open.commitments.map((c: any) => ({
                id: `c-${c.id}`,
                kind: "Commitment",
                title: c.description,
                severity: null,
                extra: c.due_date
                  ? `${isOverdue(c.due_date) ? "Overdue" : "Due"} ${fmtDate(c.due_date)}`
                  : "No due date",
              })),
            ]
              .slice(0, 10)
              .map((row) => (
                <Row key={row.id} className="flex flex-wrap items-baseline gap-2">
                  <span className="w-20 shrink-0 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    {row.kind}
                  </span>
                  <span className="text-[13px]">{row.title}</span>
                  {row.severity ? <SeverityChip value={row.severity} /> : null}
                  <span className="text-[11px] text-muted-foreground">{row.extra}</span>
                </Row>
              ))}
            {open.commitments.length +
              open.risks.length +
              open.issues.length +
              open.escalations.length ===
            0 ? (
              <NoRows label="Nothing open" />
            ) : null}
          </ul>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel title="Key people" level="supporting">
          <dl className="grid grid-cols-2 gap-3 px-3 py-2.5">
            <Field label="Implementation owner" value={dash(impl.owner_name)} />
            <Field label="Sales owner" value={dash(impl.sales_owner)} />
            <Field
              label="Technical solution owners"
              value={solutionOwners.length ? solutionOwners.join(", ") : "—"}
            />
            <Field label="ARR" value={fmtMoney(record.customer.arr)} />
          </dl>
          <div className="border-t border-border">
            <div className="px-3 pt-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Customer approvers
            </div>
            {approvers.length ? (
              <ul className="divide-y divide-border">
                {approvers.map((a: any) => (
                  <Row key={a.id} className="flex items-baseline justify-between gap-2 py-2">
                    <span className="text-[12px]">
                      {a.approver_name}
                      <span className="text-muted-foreground"> · {dash(a.approver_role)}</span>
                    </span>
                    <StatusChip status={a.status} />
                  </Row>
                ))}
              </ul>
            ) : (
              <NoRows label="No named approvers" />
            )}
          </div>
        </Panel>

        <Panel title="Recent activity" meta="Meaningful events only" level="supporting">
          {events.length ? (
            <ul className="divide-y divide-border">
              {events.map((e) => (
                <Row key={e.key}>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="w-16 shrink-0 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {e.kind}
                    </span>
                    <span className="text-[12px]">
                      {e.kind === "Stage" ? stageLabel(e.detail) : e.title}
                    </span>
                  </div>
                  <Meta
                    items={[
                      ["When", fmtDateTime(e.at)],
                      ["Who", dash(e.actor)],
                      ...(e.kind === "Stage"
                        ? []
                        : ([["State", humanize(e.detail)]] as Array<[string, ReactNode]>)),
                    ]}
                  />
                </Row>
              ))}
            </ul>
          ) : (
            <NoRows label="No recent events" />
          )}
          <div className="border-t border-border px-3 py-2">
            <Link
              to="/customers/$customerId"
              params={{ customerId }}
              search={{ tab: "history" }}
              className="text-[11px] underline"
            >
              Full change history →
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** Prove Value presentation for one success criterion, with observation + confirmation writes. */
function SuccessCriterionRow({
  criterion,
  customerId,
  implementationId,
  team,
  contacts,
  evidence,
  currentStage,
}: {
  criterion: Customer360["success_criteria"][number];
  currentStage: string;
  customerId: string;
  implementationId: string;
  team: Customer360["team"];
  contacts: Customer360["contacts"];
  evidence: Customer360["evidence"];
}) {
  const state = proveValueState(criterion, criterion.observations, criterion.confirmations);
  const gap = proveValueGaps([criterion], currentStage)[0] ?? null;
  const observations = [...criterion.observations].sort(
    (a, b) => new Date(b.observed_at ?? 0).getTime() - new Date(a.observed_at ?? 0).getTime(),
  );
  const latest = observations[0];
  const confirmation = criterion.confirmations[0] ?? null;
  const evidenceOptions = (evidence ?? []).map((e: any) => ({
    id: e.id,
    title: e.title,
    type: e.type,
  }));

  return (
    <Row>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[13px]">{criterion.description}</span>
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {PROVE_VALUE_LABEL[state]}
        </span>
        {gap ? (
          <span className="rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-destructive">
            Late{gap.due_stage ? ` · due by ${stageLabel(gap.due_stage)}` : ""}
            {gap.explicit_due_stage ? "" : " (implied)"}
          </span>
        ) : null}
        <span className="ml-auto">
          <EditSuccessCriterion
            customerId={customerId}
            criterion={criterion}
            team={team}
            contacts={contacts}
          />
        </span>
      </div>

      {/* From SOW: the original agreed outcome language, unchanged. */}
      <div className="mt-1.5">
        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">From SOW</p>
        <Meta
          items={[
            ["Outcome", criterion.description],
            ["Metric", dash(criterion.metric)],
          ]}
        />
      </div>

      {/* Confirmed at kickoff: customer-supplied measurement frame. Blank fields
          stay visibly blank — nothing is inferred from the SOW. */}
      <div className="mt-1.5 border-l-2 border-border pl-2">
        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Confirmed at kickoff
        </p>
        <Meta
          items={[
            ["Starting point", dash(criterion.baseline_value)],
            ["Starting point period", dash(criterion.baseline_period)],
            ["Target", dash(criterion.target_value)],
            ["Target date", criterion.target_date ? fmtDate(criterion.target_date) : "—"],
            ["How we'll measure it", dash(criterion.measurement_source)],
            ["Due stage", criterion.due_stage ? stageLabel(criterion.due_stage) : "—"],
            ["Internal owner", dash(criterion.owner_name)],
            [
              "Customer-side owner",
              criterion.customer_owner_name
                ? `${criterion.customer_owner_name}${
                    criterion.customer_owner_role ? ` (${criterion.customer_owner_role})` : ""
                  }`
                : "—",
            ],
          ]}
        />
      </div>

      <Meta
        items={[
          [
            "Latest observed",
            latest ? `${latest.observed_value} · ${fmtDate(latest.observed_at)}` : "—",
          ],
        ]}
      />

      {/* Observations: append-only history, newest first. */}
      <div className="mt-2">
        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Observations ({observations.length})
        </p>
        {observations.length ? (
          <ul className="mt-1 divide-y divide-border border-y border-border">
            {observations.map((o) => (
              <li key={o.id} className="py-1.5">
                <div className="flex flex-wrap items-baseline gap-2 text-[12px]">
                  <span className="font-medium">{o.observed_value}</span>
                  <span className="rounded border border-border px-1 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    {o.assessment ? humanize(o.assessment) : "—"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {fmtDate(o.observed_at)}
                  </span>
                </div>
                <Meta
                  items={[
                    ["Observed by", dash(o.observed_by_name)],
                    ["Source", dash(o.source)],
                    ["Evidence", o.evidence ? o.evidence.title : "—"],
                  ]}
                />
                {o.notes ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{o.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">
            No success measurements recorded yet.
          </p>
        )}
        <div className="mt-2">
          <AddObservation
            customerId={customerId}
            criterionId={criterion.id}
            team={team}
            evidence={evidenceOptions}
          />
        </div>
      </div>

      {/* Customer confirmation, recorded against the structured customer contact. */}
      <div className="mt-2">
        {confirmation ? (
          <p className="text-[11px] text-muted-foreground">
            Customer confirmation · {humanize(confirmation.status)} ·{" "}
            <span className="text-foreground">
              {dash(confirmation.contact_name ?? confirmation.approver_name)}
            </span>
            {(confirmation.contact_role ?? confirmation.approver_role)
              ? ` (${confirmation.contact_role ?? confirmation.approver_role})`
              : ""}
            {confirmation.decided_at ? ` · ${fmtDate(confirmation.decided_at)}` : ""}
            {confirmation.evidence ? ` · Evidence: ${confirmation.evidence.title}` : ""}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">No customer confirmation recorded.</p>
        )}
        <div className="mt-1">
          <CustomerConfirmationEditor
            customerId={customerId}
            implementationId={implementationId}
            criterionId={criterion.id}
            existing={confirmation}
            contacts={contacts}
            evidence={evidenceOptions}
          />
        </div>
      </div>
    </Row>
  );
}

/** Adoption presentation for one intended user group / workflow. */
function AdoptionAreaRow({
  area,
  customerId,
  team,
  contacts,
  evidence,
}: {
  area: Customer360["adoption"][number];
  customerId: string;
  team: Customer360["team"];
  contacts: Customer360["contacts"];
  evidence: Customer360["evidence"];
}) {
  const level = adoptionAreaLevel(area);
  const latest = latestAdoptionObservation(area.observations);
  const observations = [...area.observations].sort(
    (a, b) => new Date(b.observed_at ?? 0).getTime() - new Date(a.observed_at ?? 0).getTime(),
  );
  const evidenceOptions = (evidence ?? []).map((e: any) => ({
    id: e.id,
    title: e.title,
    type: e.type,
  }));

  return (
    <Row>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {ADOPTION_KIND_LABEL[area.kind as AdoptionKind] ?? humanize(area.kind)}
        </span>
        <span className="text-[13px]">{area.name}</span>
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {ADOPTION_LEVEL_LABEL[level]}
        </span>
        {latest?.workaround_in_use ? (
          <span className="rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-destructive">
            Workaround in use
          </span>
        ) : null}
        <span className="ml-auto">
          <EditAdoptionArea customerId={customerId} area={area} team={team} contacts={contacts} />
        </span>
      </div>

      {/* From SOW: original intent language, read-only and never reinterpreted. */}
      <div className="mt-1.5">
        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">From SOW</p>
        <Meta items={[["Intended use", dash(area.intended_usage)]]} />
      </div>

      {/* Confirmed at kickoff: measurable intended usage. Blank stays blank. */}
      <div className="mt-1.5 border-l-2 border-border pl-2">
        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Confirmed at kickoff
        </p>
        <Meta
          items={[
            ["Intended users", dash(area.intended_users)],
            ["Expected frequency", dash(area.expected_frequency)],
            ['"In use" means', dash(area.in_use_definition)],
            [
              "Customer-side owner",
              area.customer_owner_name
                ? `${area.customer_owner_name}${
                    area.customer_owner_role ? ` (${area.customer_owner_role})` : ""
                  }`
                : "—",
            ],
          ]}
        />
      </div>

      <Meta
        items={[
          ["Internal owner", dash(area.owner_name)],
          ["Last observed", latest ? fmtDate(latest.observed_at) : "—"],
        ]}
      />
      {area.notes ? <p className="mt-0.5 text-[11px] text-muted-foreground">{area.notes}</p> : null}

      <div className="mt-2">
        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Usage observations ({observations.length})
        </p>
        {observations.length ? (
          <ul className="mt-1 divide-y divide-border border-y border-border">
            {observations.map((o) => (
              <li key={o.id} className="py-1.5">
                <div className="flex flex-wrap items-baseline gap-2 text-[12px]">
                  <span className="font-medium">{humanize(o.state)}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {fmtDate(o.observed_at)}
                  </span>
                  {o.workaround_in_use ? (
                    <span className="rounded border border-border px-1 py-0.5 text-[10px] uppercase tracking-[0.08em] text-destructive">
                      Workaround
                    </span>
                  ) : null}
                </div>
                <Meta
                  items={[
                    ["Observed by", dash(o.observed_by_name)],
                    ["Source", dash(o.source)],
                    ["Evidence", o.evidence ? o.evidence.title : "—"],
                  ]}
                />
                {o.workaround_description ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Workaround: {o.workaround_description}
                  </p>
                ) : null}
                {o.notes ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{o.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">
            No usage observations recorded yet.
          </p>
        )}
        <div className="mt-2">
          <AddAdoptionObservation
            customerId={customerId}
            areaId={area.id}
            team={team}
            evidence={evidenceOptions}
          />
        </div>
      </div>
    </Row>
  );
}

/* ---------------- 2. JOURNEY ---------------- */

function JourneyTab({ record, customerId }: { record: Customer360; customerId: string }) {
  const impl = record.implementation!;
  const activeStage = normalizeStage(impl.current_stage);
  const activeIndex = LIFECYCLE_STAGES.findIndex((s) => s.id === activeStage);
  const launchGate = launchAcceptanceGate({
    toStage: nextLifecycleStage(activeStage),
    solutions: record.technical_solutions as any[],
    approvals: record.approvals as any[],
  });
  const open = openItems(record);
  const historyByStage = new Map<string, (typeof record.stage_history)[number]>();
  const preHandoffHistory: typeof record.stage_history = [];
  for (const h of record.stage_history) {
    const id = normalizeStage(h.stage);
    if (id) historyByStage.set(id, h);
    else if (isPreHandoffStage(h.stage)) preHandoffHistory.push(h);
  }

  const duration = (h: { entered_at: string; exited_at: string | null } | undefined) => {
    if (!h) return null;
    const end = h.exited_at ? new Date(h.exited_at).getTime() : Date.now();
    return Math.max(0, Math.round((end - new Date(h.entered_at).getTime()) / 86_400_000));
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md bg-surface">
        <LifecycleRail
          activeStage={activeStage ?? undefined}
          className="border-b-0 bg-transparent"
        />
      </div>

      <div className="rounded-md bg-surface px-4 py-3.5">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Move to next stage
        </div>
        <div className="mt-2">
          <AdvanceStage
            customerId={customerId}
            implementationId={impl.id}
            currentStage={activeStage}
            team={record.team}
            gate={launchGate}
          />
        </div>
      </div>

      {/* The sales → delivery handoff gate, next to the stage move it gates.
          Renders an explanatory empty state while the flag is off. */}
      <HandoffPanel customerId={customerId} implementationId={impl.id} />

      {/* The templated plan: stage instances and the work items on them.
          Renders an explanatory empty state while the flag is off. */}
      <PlanPanel implementationId={impl.id} />

      {/* Reads the SOW attached to this implementation, proposes a journey and
          lets the TIS choose what — if anything — to apply. */}
      <Panel
        title="Proposed journey from the SOW"
        meta="Draft suggestion — only applied when you choose to"
      >
        <div className="px-3 py-2.5">
          <SowAnalysisPanel
            customerId={customerId}
            customerName={record.customer.name}
            implementationId={impl.id}
            sowDocumentUrl={impl.sow_document_url}
            sowDocumentName={impl.sow_document_name}
            team={record.team}
            currentGoals={impl.customer_goals}
            requirementCount={record.requirements.length}
            successMeasureCount={record.success_criteria.length}
            startDate={impl.contract_start_date}
          />
        </div>
      </Panel>

      {/* The one place working notes are written and read. The stage timeline
          below stays the record of how the implementation moved. */}
      <Panel
        title="TIS journal"
        count={record.journal.length}
        level="reference"
        meta={`Working notes, filed under the stage they were written in — currently ${stageLabel(impl.current_stage)}`}
      >
        <div className="py-1.5">
          <JournalPanel
            customerId={customerId}
            implementationId={impl.id}
            currentStage={impl.current_stage}
            team={record.team}
            entries={record.journal}
          />
        </div>
      </Panel>

      {/* Commitments: promises made during the journey. Read surface + write path
          live together; Home/Leadership consume these rows as they already did. */}
      <Panel
        title="Commitments"
        count={(record.commitments as any[]).length}
        meta="Promises made to the customer or internally"
        action={
          <AddCommitment customerId={customerId} implementationId={impl.id} team={record.team} />
        }
      >
        {(record.commitments as any[]).length ? (
          <ul className="divide-y divide-border">
            {(record.commitments as any[]).map((c) => (
              <Row key={c.id}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[13px]">{c.description}</span>
                  <StatusChip status={c.status} />
                  <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    {humanize(c.committed_to ?? "customer")}
                  </span>
                  {c.status === "open" && isOverdue(c.due_date) ? (
                    <span className="text-[11px] text-destructive">Overdue</span>
                  ) : null}
                  <span className="ml-auto">
                    <EditCommitment customerId={customerId} commitment={c} team={record.team} />
                  </span>
                </div>
                <Meta
                  items={[
                    ["Owner", dash(c.owner_name)],
                    ["Due", fmtDate(c.due_date)],
                    ["Fulfilled", fmtDate(c.fulfilled_at)],
                  ]}
                />
              </Row>
            ))}
          </ul>
        ) : (
          <NoRows label="No commitments recorded" />
        )}
      </Panel>

      {launchStateConflict(impl) ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Data quality — launch state conflict
          </div>
          <p className="mt-1 text-[12px]">
            Current stage is {stageLabel(impl.current_stage)}, which sits after Launch, but{" "}
            <span className="font-mono">actual_launch_date</span> is not recorded. This is a record
            completeness gap, not an operational blocker.
          </p>
        </div>
      ) : null}

      {preHandoffHistory.length ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Pre-handoff — recorded before this app owned the journey
          </div>
          <ul className="mt-1.5 space-y-1">
            {preHandoffHistory.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 text-[12px]">
                <span className="font-medium">{stageLabel(h.stage)}</span>
                <span className="text-[11px] text-muted-foreground">
                  {fmtDateTime(h.entered_at)}
                  {h.exited_at ? ` → ${fmtDateTime(h.exited_at)}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Not an implementation stage. Kept as historical fact only.
          </p>
        </div>
      ) : null}

      <Panel title="Stage timeline" count={LIFECYCLE_STAGES.length} meta="From stage history">
        <ul className="divide-y divide-border">
          {LIFECYCLE_STAGES.map((stage, i) => {
            const h = historyByStage.get(stage.id);
            const state =
              i === activeIndex
                ? "current"
                : h || (activeIndex > -1 && i < activeIndex)
                  ? "completed"
                  : "upcoming";
            const days = duration(h);
            return (
              <li key={stage.id} className="flex gap-3 px-3 py-2.5">
                <span className="w-6 shrink-0 pt-0.5 font-mono text-[11px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    state === "current"
                      ? "bg-primary"
                      : state === "completed"
                        ? "bg-status-ontrack-foreground"
                        : "bg-muted-foreground/40",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span
                      className={cn(
                        "text-[13px]",
                        state === "upcoming" ? "text-muted-foreground" : "font-medium",
                      )}
                    >
                      {stage.label}
                    </span>
                    <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      {state}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{stage.intent}</p>
                  <Meta
                    items={[
                      ["Entered", h ? fmtDateTime(h.entered_at) : "—"],
                      ["Exited", h?.exited_at ? fmtDateTime(h.exited_at) : h ? "in stage" : "—"],
                      ["Duration", days == null ? "—" : `${days}d`],
                      ["By", dash(h?.entered_by_name)],
                    ]}
                  />
                  {h?.notes ? (
                    <p className="mt-1 text-[12px] text-muted-foreground">{h.notes}</p>
                  ) : null}
                  {state === "current" ? (
                    <div className="mt-2 rounded-sm border border-border bg-muted/50 px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                        Blocking progression
                      </div>
                      {open.risks.length + open.issues.length + open.escalations.length ? (
                        <ul className="mt-1 space-y-0.5">
                          {[...open.escalations, ...open.risks, ...open.issues].map((x: any) => (
                            <li
                              key={x.id}
                              className="flex flex-wrap items-baseline gap-2 text-[12px]"
                            >
                              <SeverityChip value={x.severity} />
                              <span>{x.title}</span>
                              <span className="text-[11px] text-muted-foreground">
                                {humanize(x.status)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          Nothing open against this stage.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

/* ---------------- 3. SOLUTION ---------------- */

function SolutionTab({ record, customerId }: { record: Customer360; customerId: string }) {
  const solutions = record.technical_solutions as any[];
  const mappings = solutions.flatMap((s) =>
    (s.field_mappings ?? []).map((m: any) => ({ ...m, solution_title: s.title })),
  );

  return (
    <div className="space-y-4">
      <Panel title="Business requirements" count={record.requirements.length}>
        <div className="px-3 py-2.5 text-[12px] text-muted-foreground">
          {record.requirements.length} requirement(s) drive this solution.{" "}
          <Link
            to="/customers/$customerId"
            params={{ customerId }}
            search={{ tab: "requirements" }}
            className="underline"
          >
            Open the Requirements tab →
          </Link>
        </div>
      </Panel>

      <Panel title="Solution" count={solutions.length} meta="Design record">
        {solutions.length ? (
          <ul className="divide-y divide-border">
            {solutions.map((s) => (
              <Row key={s.id}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[13px] font-medium">{s.title}</span>
                  <StatusChip status={s.status} />
                </div>
                <div className="mt-1.5 grid gap-2 md:grid-cols-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      Design summary
                    </div>
                    <p className="text-[12px] leading-relaxed">{dash(s.design_summary)}</p>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      Configuration details
                    </div>
                    <p className="whitespace-pre-wrap text-[12px] leading-relaxed">
                      {dash(s.configuration_details)}
                    </p>
                  </div>
                </div>
              </Row>
            ))}
          </ul>
        ) : (
          <NoRows label="No solution recorded" />
        )}
      </Panel>

      <Panel title="Solutions" count={solutions.length}>
        {solutions.length ? (
          <ul className="divide-y divide-border">
            {solutions.map((s) => (
              <Row key={s.id}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    to="/technical-solutions/$id"
                    params={{ id: s.id }}
                    className="text-[13px] font-medium hover:underline"
                  >
                    {s.title}
                  </Link>
                  <StatusChip status={s.status} />
                </div>
                <Meta
                  items={[
                    ["Owner", dash(s.owner_name)],
                    ["Implements requirement", dash(s.requirement_title)],
                    ["Created", fmtDate(s.created_at)],
                    ["Mappings", (s.field_mappings ?? []).length],
                  ]}
                />
              </Row>
            ))}
          </ul>
        ) : (
          <NoRows label="No solutions" />
        )}
      </Panel>

      <Panel title="Field mapping" count={mappings.length}>
        {mappings.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="px-3 py-1.5 font-medium">Source field</th>
                  <th className="px-3 py-1.5 font-medium">Source system</th>
                  <th className="px-3 py-1.5 font-medium">GoCanvas field</th>
                  <th className="px-3 py-1.5 font-medium">Transformation / logic</th>
                  <th className="px-3 py-1.5 font-medium">Required</th>
                  <th className="px-3 py-1.5 font-medium">Status</th>
                  <th className="px-3 py-1.5 font-medium">Solution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mappings.map((m: any) => (
                  <tr key={m.id}>
                    <td className="px-3 py-1.5 font-mono">{dash(m.source_field)}</td>
                    <td className="px-3 py-1.5">{dash(m.source_system)}</td>
                    <td className="px-3 py-1.5 font-mono">{dash(m.target_field)}</td>
                    <td className="px-3 py-1.5">{dash(m.transformation_notes)}</td>
                    <td className="px-3 py-1.5">
                      {m.required == null ? "—" : m.required ? "Yes" : "No"}
                    </td>
                    <td className="px-3 py-1.5">
                      {m.status ? <StatusChip status={m.status} /> : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{m.solution_title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <NoRows label="No field mappings recorded" />
        )}
      </Panel>
    </div>
  );
}

/* ---------------- 4. REQUIREMENTS ---------------- */

function RequirementsTab({ record, customerId }: { record: Customer360; customerId: string }) {
  const impl = record.implementation!;
  return (
    <Panel
      title="Requirements"
      count={record.requirements.length}
      meta="Traceability and validation from linked records"
      action={
        <AddRequirement customerId={customerId} implementationId={impl.id} team={record.team} />
      }
    >
      {record.requirements.length ? (
        <ul className="divide-y divide-border">
          {record.requirements.map((r) => (
            <Row key={r.id}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13px] font-medium">{r.title}</span>
                <SeverityChip value={r.priority} />
                <StatusChip status={r.status} />
                <span className="ml-auto">
                  <EditRequirement customerId={customerId} requirement={r} team={record.team} />
                </span>
              </div>
              {r.description ? (
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {r.description}
                </p>
              ) : null}
              <Meta
                items={[
                  ["Source", dash(r.source)],
                  ["Category", dash(r.category)],
                  ["Scope", humanize(r.scope_status)],
                  ["Owner", dash(r.owner_name)],
                  [
                    "Approval",
                    r.validation.approval_status ? humanize(r.validation.approval_status) : "—",
                  ],
                  ["Evidence", r.validation.evidence_count || "—"],
                ]}
              />
              <div className="mt-1.5">
                <TraceChain trace={r.trace} />
              </div>
            </Row>
          ))}
        </ul>
      ) : (
        <NoRows label="No requirements recorded" />
      )}
    </Panel>
  );
}

/* ---------------- 5. DECISIONS ---------------- */

function DecisionsTab({ record, customerId }: { record: Customer360; customerId: string }) {
  const impl = record.implementation!;
  const decisions = record.decisions as any[];
  return (
    <Panel
      title="Decisions"
      count={decisions.length}
      meta="What was decided, by whom, when, and what it affects"
      action={<AddDecision customerId={customerId} implementationId={impl.id} />}
    >
      {decisions.length ? (
        <ul className="divide-y divide-border">
          {decisions.map((d) => (
            <Row key={d.id}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13px] font-medium">{d.title}</span>
                <StatusChip status={d.status} />
                <span className="ml-auto">
                  <EditDecision customerId={customerId} decision={d} />
                </span>
              </div>

              <p className="mt-1 text-[12px] leading-relaxed">
                <span className="text-muted-foreground">Decided by · </span>
                {d.decided_by ?? "Not recorded"}
                <span className="text-muted-foreground">
                  {" "}
                  · {d.decision_date ? `on ${fmtDate(d.decision_date)}` : "date not recorded"}
                </span>
              </p>

              {d.description ? (
                <p className="mt-0.5 text-[12px] leading-relaxed">
                  <span className="text-muted-foreground">What was decided · </span>
                  {d.description}
                </p>
              ) : null}
              {d.rationale ? (
                <p className="mt-0.5 text-[12px] leading-relaxed">
                  <span className="text-muted-foreground">Why · </span>
                  {d.rationale}
                </p>
              ) : null}

              <div className="mt-1.5">
                <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70">
                  Affects
                </span>
                <TraceChain trace={d.links ?? []} />
              </div>
            </Row>
          ))}
        </ul>
      ) : (
        <NoRows label="No decisions recorded" />
      )}
    </Panel>
  );
}

/* ---------------- 6. RISKS & ISSUES ---------------- */

function RisksTab({ record, customerId }: { record: Customer360; customerId: string }) {
  const impl = record.implementation!;
  const risks = record.risks as any[];
  const issues = record.issues as any[];
  const escalations = record.escalations as any[];
  const riskOptions = risks.map((r) => ({ id: r.id, title: r.title }));
  const issueOptions = issues.map((r) => ({ id: r.id, title: r.title }));

  return (
    <div className="space-y-4">
      <Panel
        title="Risks"
        count={risks.length}
        action={<AddRisk customerId={customerId} implementationId={impl.id} team={record.team} />}
      >
        {risks.length ? (
          <ul className="divide-y divide-border">
            {risks.map((r) => (
              <Row key={r.id}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[13px] font-medium">{r.title}</span>
                  <SeverityChip value={r.severity} />
                  <StatusChip status={r.status} />
                  <span className="ml-auto">
                    <EditRisk customerId={customerId} risk={r} team={record.team} />
                  </span>
                </div>
                {r.description ? (
                  <p className="mt-1 text-[12px] text-muted-foreground">{r.description}</p>
                ) : null}
                <Meta
                  items={[
                    ["Likelihood", humanize(r.likelihood)],
                    ["Owner", dash(r.owner_name)],
                    ["Identified", fmtDate(r.identified_at)],
                    ["Resolved", fmtDate(r.resolved_at)],
                    ["Impact", dash(r.impact)],
                  ]}
                />
                <p className="mt-1 text-[12px]">
                  <span className="text-muted-foreground">Mitigation · </span>
                  {dash(r.mitigation)}
                </p>
              </Row>
            ))}
          </ul>
        ) : (
          <NoRows label="No risks recorded" />
        )}
      </Panel>

      <Panel
        title="Issues"
        count={issues.length}
        action={<AddIssue customerId={customerId} implementationId={impl.id} team={record.team} />}
      >
        {issues.length ? (
          <ul className="divide-y divide-border">
            {issues.map((r) => (
              <Row key={r.id}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[13px] font-medium">{r.title}</span>
                  <SeverityChip value={r.severity} />
                  <StatusChip status={r.status} />
                  <span className="ml-auto">
                    <EditIssue customerId={customerId} issue={r} team={record.team} />
                  </span>
                </div>
                {r.description ? (
                  <p className="mt-1 text-[12px] text-muted-foreground">{r.description}</p>
                ) : null}
                <Meta
                  items={[
                    ["Owner", dash(r.owner_name)],
                    ["Raised", fmtDate(r.raised_at)],
                    ["Resolved", fmtDate(r.resolved_at)],
                  ]}
                />
                <p className="mt-1 text-[12px]">
                  <span className="text-muted-foreground">Resolution · </span>
                  {dash(r.resolution)}
                </p>
              </Row>
            ))}
          </ul>
        ) : (
          <NoRows label="No issues recorded" />
        )}
      </Panel>

      <Panel
        title="Escalations"
        count={escalations.length}
        action={
          <AddEscalation
            customerId={customerId}
            implementationId={impl.id}
            team={record.team}
            risks={riskOptions}
            issues={issueOptions}
          />
        }
      >
        {escalations.length ? (
          <ul className="divide-y divide-border">
            {escalations.map((e) => (
              <Row key={e.id}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[13px] font-medium">{e.title}</span>
                  <SeverityChip value={e.severity} />
                  <StatusChip status={e.status} />
                  {e.escalation_type ? (
                    <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      {humanize(e.escalation_type)}
                    </span>
                  ) : null}
                  <span className="ml-auto">
                    <EditEscalation
                      customerId={customerId}
                      escalation={e}
                      team={record.team}
                      risks={riskOptions}
                      issues={issueOptions}
                    />
                  </span>
                </div>
                {e.description ? (
                  <p className="mt-1 text-[12px] text-muted-foreground">{e.description}</p>
                ) : null}
                <Meta
                  items={[
                    ["Owner", dash(e.raised_by_name)],
                    ["Raised", fmtDate(e.raised_at)],
                    ["Resolved", fmtDate(e.resolved_at)],
                    ["Linked issue", dash(e.related_issue_title)],
                    ["Linked risk", dash(e.related_risk_title)],
                  ]}
                />
                <p className="mt-1 text-[12px]">
                  <span className="text-muted-foreground">Resolution · </span>
                  {dash(e.resolution_summary)}
                </p>
              </Row>
            ))}
          </ul>
        ) : (
          <NoRows label="No escalations recorded" />
        )}
      </Panel>
    </div>
  );
}

/* ---------------- 7. EVIDENCE ---------------- */

const EVIDENCE_TAB: Record<string, TabId> = {
  requirement: "requirements",
  requirements: "requirements",
  decision: "decisions",
  decisions: "decisions",
  technical_solution: "solution",
  technical_solutions: "solution",
  field_mapping: "solution",
  risk: "risks",
  risks: "risks",
  issue: "risks",
  issues: "risks",
  escalation: "risks",
  escalations: "risks",
  milestone: "journey",
  implementation: "overview",
  success_criterion: "overview",
  approval: "evidence",
};

function EvidenceTab({ record, customerId }: { record: Customer360; customerId: string }) {
  const evidence = record.evidence as any[];
  const approvals = record.approvals as any[];
  const impl = record.implementation;

  // Existing records this implementation can attach proof or an approval to.
  const related: RelatedRecord[] = [
    ...record.requirements.map((r) => ({ type: "requirement", id: r.id, title: r.title })),
    ...(record.decisions as any[]).map((d) => ({ type: "decision", id: d.id, title: d.title })),
    ...(record.risks as any[]).map((r) => ({ type: "risk", id: r.id, title: r.title })),
    ...(record.issues as any[]).map((i) => ({ type: "issue", id: i.id, title: i.title })),
    ...(record.escalations as any[]).map((e) => ({
      type: "escalation",
      id: e.id,
      title: e.title,
    })),
    ...(record.milestones as any[]).map((m) => ({ type: "milestone", id: m.id, title: m.name })),
    ...(record.technical_solutions as any[]).map((s) => ({
      type: "technical_solution",
      id: s.id,
      title: s.title,
    })),
    ...record.success_criteria.map((s) => ({
      type: "success_criterion",
      id: s.id,
      title: s.description,
    })),
  ];
  const evidenceOptions = evidence.map((e) => ({ id: e.id, title: e.title }));

  return (
    <div className="space-y-4">
      <Panel
        title="Proof"
        count={evidence.length}
        meta="What we can show, and the record it backs up"
        action={
          impl ? (
            <AddEvidence
              customerId={customerId}
              implementationId={impl.id}
              team={record.team}
              related={related}
            />
          ) : null
        }
      >
        {evidence.length ? (
          <ul className="divide-y divide-border">
            {evidence.map((e) => {
              const target = e.related_entity_type
                ? (EVIDENCE_TAB[e.related_entity_type] ?? null)
                : null;
              const supportLabel = e.related_entity_type
                ? `${humanize(e.related_entity_type)}: ${e.related_label ?? "record"}`
                : null;
              return (
                <Row key={e.id}>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      {humanize(e.type)}
                    </span>
                    <span className="text-[13px] font-medium">{e.title}</span>
                    {e.url ? (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] underline"
                      >
                        Open link
                      </a>
                    ) : null}
                    <span className="ml-auto">
                      <EditEvidence
                        customerId={customerId}
                        evidence={e}
                        team={record.team}
                        related={related}
                      />
                    </span>
                  </div>

                  <p className="mt-1 text-[12px] leading-relaxed">
                    <span className="text-muted-foreground">Backs up · </span>
                    {supportLabel ? (
                      target ? (
                        <Link
                          to="/customers/$customerId"
                          params={{ customerId }}
                          search={{ tab: target }}
                          className="underline"
                        >
                          {supportLabel}
                        </Link>
                      ) : (
                        supportLabel
                      )
                    ) : (
                      <span className="text-muted-foreground">
                        Not linked to a record yet — add the record it supports
                      </span>
                    )}
                  </p>

                  {e.description ? (
                    <p className="mt-0.5 text-[12px] leading-relaxed">
                      <span className="text-muted-foreground">What it shows · </span>
                      {e.description}
                    </p>
                  ) : null}

                  <Meta
                    items={[
                      ["Added by", dash(e.uploaded_by_name)],
                      ["Added", fmtDateTime(e.created_at)],
                    ]}
                  />
                </Row>
              );
            })}
          </ul>
        ) : (
          <NoRows label="No proof recorded yet" />
        )}
      </Panel>

      <Panel
        title="Approvals"
        count={approvals.length}
        meta="What was signed off, by whom, and when"
        action={
          impl ? (
            <AddApproval
              customerId={customerId}
              implementationId={impl.id}
              related={related}
              evidenceOptions={evidenceOptions}
              contacts={record.contacts}
            />
          ) : null
        }
      >
        {approvals.length ? (
          <ul className="divide-y divide-border">
            {approvals.map((a) => {
              const proof = a.evidence_id
                ? (evidence.find((e) => e.id === a.evidence_id) ?? null)
                : null;
              const contact = a.customer_contact_id
                ? ((record.contacts as any[]).find((c) => c.id === a.customer_contact_id) ?? null)
                : null;
              const approver = a.approver_name ?? contact?.name ?? null;
              const approverRole = a.approver_role ?? contact?.role ?? null;
              const decided = a.status === "approved" || a.status === "rejected";
              return (
                <Row key={a.id}>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[13px] font-medium">{a.title}</span>
                    <StatusChip status={a.status} />
                    {a.approved_entity_type === "success_criterion" ? null : (
                      <span className="ml-auto">
                        <EditApproval
                          customerId={customerId}
                          approval={a}
                          related={related}
                          evidenceOptions={evidenceOptions}
                          contacts={record.contacts}
                        />
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-[12px] leading-relaxed">
                    <span className="text-muted-foreground">Approves · </span>
                    {a.approved_entity_label ? (
                      <>
                        {a.approved_entity_type ? `${humanize(a.approved_entity_type)}: ` : ""}
                        {a.approved_entity_label}
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Not linked to a record — the title above is all we hold
                      </span>
                    )}
                  </p>

                  <p className="mt-0.5 text-[12px] leading-relaxed">
                    <span className="text-muted-foreground">
                      {decided ? `${humanize(a.status)} by · ` : "Waiting on · "}
                    </span>
                    {approver ?? "Approver not recorded"}
                    {approverRole ? ` (${approverRole})` : ""}
                  </p>

                  <Meta
                    items={[
                      ["Requested", fmtDate(a.requested_at)],
                      ["Decided", decided ? fmtDate(a.decided_at) : "Not decided yet"],
                      [
                        "Supporting proof",
                        proof ? (
                          <Link
                            to="/customers/$customerId"
                            params={{ customerId }}
                            search={{ tab: "evidence" }}
                            className="underline"
                          >
                            {proof.title}
                          </Link>
                        ) : (
                          "—"
                        ),
                      ],
                    ]}
                  />
                </Row>
              );
            })}
          </ul>
        ) : (
          <NoRows label="No approvals recorded" />
        )}
      </Panel>
    </div>
  );
}

/* ---------------- 8. HISTORY ---------------- */

function HistoryTab({ record }: { record: Customer360 }) {
  const entries = [
    ...record.stage_history.map((h) => ({
      key: `stage-${h.id}`,
      at: h.entered_at,
      actor: h.entered_by_name,
      entity: "Implementation",
      field: "current_stage",
      change: `→ ${stageLabel(h.stage)}`,
      reason: h.notes,
    })),
    ...record.stage_history
      .filter((h) => h.exited_at)
      .map((h) => ({
        key: `stage-exit-${h.id}`,
        at: h.exited_at as string,
        actor: h.entered_by_name,
        entity: "Implementation",
        field: "stage_exit",
        change: `${stageLabel(h.stage)} exited`,
        reason: null,
      })),
    ...record.audit_log.map((a) => ({
      key: `audit-${a.id}`,
      at: a.changed_at,
      actor: a.changed_by_name,
      entity: humanize(a.entity_type),
      field: a.field_name ?? "—",
      change: a.field_name ? `${a.old_value ?? "—"} → ${a.new_value ?? "—"}` : "record updated",
      reason: a.change_reason,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <Panel
      title="Change history"
      count={entries.length}
      level="reference"
      meta="Stage history + audit log"
    >
      {entries.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                <th className="px-3 py-1.5 font-medium">When</th>
                <th className="px-3 py-1.5 font-medium">Actor</th>
                <th className="px-3 py-1.5 font-medium">Entity</th>
                <th className="px-3 py-1.5 font-medium">Field</th>
                <th className="px-3 py-1.5 font-medium">Change</th>
                <th className="px-3 py-1.5 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => (
                <tr key={e.key}>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px]">
                    {fmtDateTime(e.at)}
                  </td>
                  <td className="px-3 py-1.5">{dash(e.actor)}</td>
                  <td className="px-3 py-1.5">{e.entity}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">{e.field}</td>
                  <td className="px-3 py-1.5">{e.change}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{dash(e.reason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <NoRows label="No recorded changes" />
      )}
    </Panel>
  );
}
