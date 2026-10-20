import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { SavedViews } from "@/components/saved-views";
import { searchToView } from "@/lib/saved-view-input";
import { HealthNote } from "@/components/health-note";
import { PaceChip, StageBadge, StatusDot, NoRows } from "@/components/record";
import { useScope } from "@/lib/use-scope";
import { getHome } from "@/lib/hub.functions";
import { healthByImplementation } from "@/lib/home-triage";
import { DEAL_STAGE_OPTIONS, dealStageIndex } from "@/lib/deal-stage";
import { fmtDate, humanize } from "@/lib/hub-format";
import { businessDaysBetween, localIso } from "@/lib/onboarding-timeline";
import { datePace, dwellPace } from "@/lib/pace";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";
import { GRADUATED_STAGE } from "@/lib/claimed-owner";
import type { ImplHealth } from "@/lib/customer360-derive";
import {
  graduatedCount,
  graduatedSectionOffered,
  partitionCustomerRows,
} from "@/lib/customer-list-sections";
import { readShowTests } from "@/lib/test-accounts";
import { ShowTestsToggle } from "@/components/show-tests-toggle";

// Its own entry, not Home's ["home", scope]: Home asks for "mine" when no
// scope is set and this list asks for the server default, so a shared key
// let whichever page loaded first fill the other. It stays under "home" so
// every save that refreshes Home refreshes this list too.
const implementationsQuery = (scope: string | null, tests = false) =>
  queryOptions({
    queryKey: tests ? ["home", "customers", scope, "tests"] : ["home", "customers", scope],
    queryFn: () =>
      getHome({ data: { ...(scope ? { scope } : {}), ...(tests ? { includeTests: true } : {}) } }),
  });

const SORTS = ["customer", "stage", "status", "owner", "tier", "launch", "days"] as const;
type SortKey = (typeof SORTS)[number];

/** One row of the list, as the home data returns it. */
type CustomerRowData = Awaited<ReturnType<typeof getHome>>["implementations"][number];

type CustomerSearch = {
  stage?: string;
  status?: string;
  sort: SortKey;
  dir: "asc" | "desc";
  scope?: string;
  /** "Show test accounts" (0085). */
  tests?: boolean;
};

export const Route = createFileRoute("/customers/")({
  head: () => ({
    meta: [
      { title: "Customers — GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "Every customer implementation with its stage, health, owner, tier, plan end date and time in the current stage.",
      },
      { property: "og:title", content: "Customers — GoCanvas Handoff Hub" },
      {
        property: "og:description",
        content: "The full list of customer implementations.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): CustomerSearch => {
    const raw = search as {
      stage?: unknown;
      status?: unknown;
      sort?: unknown;
      dir?: unknown;
      scope?: unknown;
      tests?: unknown;
    };
    const out: CustomerSearch = {
      sort: (SORTS as readonly string[]).includes(String(raw.sort))
        ? (raw.sort as SortKey)
        : "days",
      dir: raw.dir === "asc" ? "asc" : "desc",
    };
    if (typeof raw.stage === "string") out.stage = raw.stage;
    if (typeof raw.status === "string") out.status = raw.status;
    if (typeof raw.scope === "string") out.scope = raw.scope;
    if (readShowTests(raw.tests)) out.tests = true;
    return out;
  },
  loaderDeps: ({ search }: { search: CustomerSearch }) => ({
    scope: search.scope ?? null,
    tests: search.tests === true,
  }),
  loader: ({ context, deps }) => {
    context.queryClient.ensureQueryData(implementationsQuery(deps.scope, deps.tests));
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load customers: {errorMessage(error)}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-[13px]">No customers found.</div>,
  component: CustomersPage,
});

/** Derived health levels, matching deriveHealth output. */
const STATUSES = ["blocked", "at_risk", "on_track", "no_signal"];

/** Business days since the stage was entered — the pipeline's unit and field. */
function businessDaysIn(enteredAt: string | null | undefined): number {
  if (!enteredAt) return 0;
  return Math.max(0, businessDaysBetween(String(enteredAt).slice(0, 10), localIso()));
}

/**
 * The "days" sort's key. Graduate has no dwell clock (the column shows "—"),
 * so graduated rows sort as -1: last when longest-first, first otherwise.
 */
function daysForSort(r: { deal_stage: string | null; stage_entered_at: string | null }): number {
  return r.deal_stage === GRADUATED_STAGE ? -1 : businessDaysIn(r.stage_entered_at);
}

function CustomersPage() {
  const { param, setScope } = useScope();
  const { stage, status, sort, dir, scope, tests } = Route.useSearch();
  const { data } = useSuspenseQuery(implementationsQuery(param, tests === true));
  const navigate = useNavigate({ from: Route.fullPath });
  // A click is kept for the stage filter it was made under, so each stage filter starts
  // from its own default: collapsed, or open when the filter asks for graduated customers.
  const [graduatedChoice, setGraduatedChoice] = useState<{
    forStage: string | undefined;
    open: boolean;
  } | null>(null);

  const setSearch = (patch: Record<string, unknown>) =>
    navigate({ search: (prev: CustomerSearch) => ({ ...prev, ...patch }) });

  const toggleSort = (key: SortKey) =>
    setSearch({ sort: key, dir: sort === key && dir === "desc" ? "asc" : "desc" });

  // Single source of truth: same deriveHealth result Home and Customer 360 use.
  const health = healthByImplementation(data.implementations, data.triage);
  const levelOf = (id: string) => health.get(id)?.level ?? "no_signal";

  // The filters and the sort apply to every row, before the rows are divided between
  // the main table and the graduated section, so both follow the same rules.
  const rows = data.implementations
    .filter((r) => (stage ? r.deal_stage === stage : true))
    .filter((r) => (status ? levelOf(r.id) === status : true))
    .sort((a, b) => {
      const factor = dir === "asc" ? 1 : -1;
      switch (sort) {
        case "customer":
          return factor * a.customer_name.localeCompare(b.customer_name);
        case "stage":
          return factor * (dealStageIndex(a.deal_stage) - dealStageIndex(b.deal_stage));
        case "status":
          return factor * levelOf(a.id).localeCompare(levelOf(b.id));
        case "owner":
          return factor * (a.owner_name ?? "").localeCompare(b.owner_name ?? "");
        case "tier":
          return factor * (a.tier ?? "").localeCompare(b.tier ?? "");
        case "launch":
          return (
            factor *
            (a.plan_end ?? a.target_launch_date ?? "9999").localeCompare(
              b.plan_end ?? b.target_launch_date ?? "9999",
            )
          );
        default:
          return factor * (daysForSort(a) - daysForSort(b));
      }
    });

  const { active, graduated } = partitionCustomerRows(rows);
  const offerGraduated = graduatedSectionOffered(stage);
  const graduatedOpen =
    graduatedChoice && graduatedChoice.forStage === stage
      ? graduatedChoice.open
      : stage === GRADUATED_STAGE;
  const graduatedTotal = graduatedCount(graduated);

  // The count is the real book; test accounts shown are counted apart, in
  // the shown rows as in the total, so the numerator never passes it.
  const testCount = data.implementations.filter((r) => r.is_test).length;
  const realCount = data.implementations.length - testCount;
  const realShown = rows.filter((r) => !r.is_test).length;

  const Th = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <th className="px-3 py-1.5 font-medium">
      <button
        type="button"
        onClick={() => toggleSort(sortKey)}
        className="inline-flex items-center gap-1 uppercase tracking-[0.1em] hover:text-foreground"
      >
        {label}
        {sort === sortKey ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    </th>
  );

  // The same column headings on both tables, so the graduated section reads as the
  // same list, sorted the same way.
  const columnHeads = (
    <thead className="border-b border-border bg-surface text-[10px] text-muted-foreground">
      <tr>
        <Th label="Customer" sortKey="customer" />
        <Th label="Stage" sortKey="stage" />
        <Th label="Health" sortKey="status" />
        <Th label="Owner" sortKey="owner" />
        <Th label="Tier" sortKey="tier" />
        <Th label="Plan end" sortKey="launch" />
        <Th label="Days in stage" sortKey="days" />
      </tr>
    </thead>
  );

  const noMatchLabel =
    rows.length === 0
      ? "No implementations match these filters. Try clearing a filter."
      : stage === GRADUATED_STAGE
        ? "Graduated customers are listed below."
        : "No active customers match these filters. Try clearing a filter.";

  return (
    <>
      <PageHeader
        title="Customers"
        description="One row per customer implementation. Longest in its current stage first; click a heading to sort another way. Graduated customers are listed beneath the table."
        actions={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              {realShown} / {realCount}
              {testCount ? ` · +${testCount} test` : ""}
            </span>
            <ShowTestsToggle
              checked={tests === true}
              onChange={(on) => setSearch({ tests: on ? true : undefined })}
            />
          </div>
        }
      />

      <PageBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <FilterGroup
            label="Stage"
            value={stage}
            options={DEAL_STAGE_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
            onChange={(v) => setSearch({ stage: v })}
          />
          <FilterGroup
            label="Status"
            value={status}
            options={STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
            onChange={(v) => setSearch({ status: v })}
          />
        </div>

        {/* Phase 7. A saved view stores this surface's search PARAMETERS, not
            its rows, and applying one writes them back into the URL — so the
            result stays an ordinary, shareable link and nothing about the
            existing ?stage/?status/?sort/?dir contract changes. Renders nothing
            while the saved_views flag is off. */}
        <SavedViews
          surface="customers"
          // `scope` belongs in a saved view like every other filter. It was
          // omitted here — not by the serializer, which copies whatever it is
          // given, but by this hand-built object — so a view saved from
          // ?scope=all applied as "mine" and showed nothing. A saved view that
          // silently changes whose accounts you are looking at is worse than
          // one that does not exist.
          current={searchToView({ stage, status, sort, dir, scope })}
          onApply={(view) => {
            // A stored view is re-validated on the way back in, exactly as the
            // URL is: it was written months ago against a sort key that may
            // since have gone.
            const savedSort = String(view["sort"] ?? "");
            const savedStage = view["stage"];
            const savedStatus = view["status"];
            const savedScope = view["scope"];
            // A view saved BEFORE scope was stored has no opinion about it, and
            // the honest reading of no opinion is "leave the reader where they
            // are" — not "send them back to their own book". Only a view that
            // actually recorded a scope gets to change it.
            const nextScope = typeof savedScope === "string" ? savedScope : scope;
            void navigate({
              search: () => ({
                sort: ((SORTS as readonly string[]).includes(savedSort)
                  ? savedSort
                  : "days") as SortKey,
                dir: view["dir"] === "asc" ? ("asc" as const) : ("desc" as const),
                ...(typeof savedStage === "string" ? { stage: savedStage } : {}),
                ...(typeof savedStatus === "string" ? { status: savedStatus } : {}),
                ...(nextScope ? { scope: nextScope } : {}),
              }),
            });
          }}
        />

        <div className="w-full overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full text-left">
            <caption className="sr-only">Active customers</caption>
            {columnHeads}
            <tbody className="divide-y divide-border">
              {active.map((r) => (
                <CustomerRow key={r.id} row={r} status={levelOf(r.id)} />
              ))}
              {active.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <NoRows label={noMatchLabel} />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {offerGraduated ? (
          <section aria-label="Graduated customers">
            <button
              type="button"
              aria-expanded={graduatedOpen}
              aria-controls="graduated-customers"
              onClick={() => setGraduatedChoice({ forStage: stage, open: !graduatedOpen })}
              className="flex w-full items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {graduatedOpen ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Graduated customers ({graduatedTotal})
            </button>
            <div
              id="graduated-customers"
              hidden={!graduatedOpen}
              className="w-full overflow-x-auto rounded-b-md border border-t-0 border-border bg-card"
            >
              <table className="w-full text-left">
                <caption className="sr-only">Graduated customers</caption>
                {columnHeads}
                <tbody className="divide-y divide-border">
                  {graduated.map((r) => (
                    <CustomerRow key={r.id} row={r} status={levelOf(r.id)} />
                  ))}
                  {graduated.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <NoRows label="No graduated customers match these filters." />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </PageBody>
    </>
  );
}

/** One customer row. Both the main table and the graduated section render through it. */
function CustomerRow({ row: r, status }: { row: CustomerRowData; status: ImplHealth }) {
  return (
    <tr className="group hover:bg-muted/60">
      <td className="px-3 py-1.5">
        <Link
          to="/customers/$customerId"
          params={{ customerId: r.customer_id }}
          search={{ impl: r.id }}
          className="block text-[13px] font-medium hover:underline"
        >
          {r.customer_name}
          {r.is_test ? (
            <span
              title="A test account: left out of every count"
              className="ml-2 rounded-sm border border-dashed border-border px-1 py-px text-[10px] font-normal uppercase tracking-wider text-muted-foreground"
            >
              Test
            </span>
          ) : null}
          <span className="ml-2 text-[11px] font-normal text-muted-foreground">
            {r.name && r.name !== r.customer_name
              ? r.name
              : [r.industry, r.segment].filter(Boolean).join(" · ") || "—"}
          </span>
        </Link>
      </td>
      <td className="px-3 py-1.5">
        <StageBadge stage={r.deal_stage} />
      </td>
      <td className="px-3 py-1.5">
        <StatusDot status={status} />
        <HealthNote
          recorded={r.health_recorded}
          recordedReason={r.health_recorded_reason}
          legacyStatus={r.status}
          computed={status}
          className="mt-0.5 block text-[10px] text-muted-foreground"
        />
      </td>
      <td className="px-3 py-1.5 text-[12px]">{r.owner_name ?? "Unassigned"}</td>
      <td className="px-3 py-1.5 text-[12px]">{r.tier ?? "—"}</td>
      {/* The plan end carries its own pace: a date alone does
          not say whether it has already passed. */}
      <td className="px-3 py-1.5 font-mono text-[12px]">
        <PaceChip
          quiet
          pace={datePace(r.plan_end ?? r.target_launch_date, r.actual_launch_date)}
          label={fmtDate(r.plan_end ?? r.target_launch_date)}
        />
      </td>
      {/* Was a bare `> 14` with no explanation. Same threshold, but
          the chip now says it is a general one rather than this
          stage's own target — this list does not load
          stage_instances, and inventing a target would be worse
          than naming the fallback. The 360 uses the real one. */}
      <td className="px-3 py-1.5 font-mono text-[12px]">
        {/* Graduate is the end: no clock to run. */}
        {r.deal_stage === GRADUATED_STAGE ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <PaceChip
            quiet
            pace={dwellPace(r.stage_entered_at, null)}
            label={`${businessDaysIn(r.stage_entered_at)}bd`}
          />
        )}
      </td>
    </tr>
  );
}

function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={cn(
          "rounded-sm border border-border px-1.5 py-0.5 text-[11px]",
          value === undefined
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-card text-muted-foreground hover:text-foreground",
        )}
      >
        All
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(value === o.value ? undefined : o.value)}
          className={cn(
            "rounded-sm border border-border px-1.5 py-0.5 text-[11px]",
            value === o.value
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
