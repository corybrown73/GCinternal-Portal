import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";

import { NewImplementation } from "@/components/implementation-write";
import { PageBody, PageHeader } from "@/components/page";
import { SavedViews } from "@/components/saved-views";
import { searchToView } from "@/lib/saved-view-input";
import { HealthNote } from "@/components/health-note";
import { PaceChip, StageBadge, StatusDot, NoRows } from "@/components/record";
import { getHome } from "@/lib/hub.functions";
import { healthByImplementation } from "@/lib/home-triage";
import { LIFECYCLE_STAGES } from "@/lib/lifecycle";
import { daysSince, fmtDate, humanize, normalizeStage, stageIndex } from "@/lib/hub-format";
import { datePace, dwellPace } from "@/lib/pace";
import { cn } from "@/lib/utils";

const implementationsQuery = queryOptions({
  queryKey: ["home"],
  queryFn: () => getHome(),
});

const SORTS = ["customer", "stage", "status", "owner", "tier", "launch", "days"] as const;
type SortKey = (typeof SORTS)[number];

type CustomerSearch = {
  stage?: string;
  status?: string;
  sort: SortKey;
  dir: "asc" | "desc";
};

export const Route = createFileRoute("/customers/")({
  head: () => ({
    meta: [
      { title: "Customers — Implementation Hub" },
      {
        name: "description",
        content:
          "Every customer implementation with its stage, health, owner, tier, target launch date and time in the current stage.",
      },
      { property: "og:title", content: "Customers — Implementation Hub" },
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
    };
    const out: CustomerSearch = {
      sort: (SORTS as readonly string[]).includes(String(raw.sort))
        ? (raw.sort as SortKey)
        : "days",
      dir: raw.dir === "asc" ? "asc" : "desc",
    };
    if (typeof raw.stage === "string") out.stage = raw.stage;
    if (typeof raw.status === "string") out.status = raw.status;
    return out;
  },
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(implementationsQuery);
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load customers: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-[13px]">No customers found.</div>,
  component: CustomersPage,
});

/** Derived health levels, matching deriveHealth output. */
const STATUSES = ["blocked", "at_risk", "on_track", "no_signal"];

function CustomersPage() {
  const { data } = useSuspenseQuery(implementationsQuery);
  const { stage, status, sort, dir } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const setSearch = (patch: Record<string, unknown>) =>
    navigate({ search: (prev: CustomerSearch) => ({ ...prev, ...patch }) });

  const toggleSort = (key: SortKey) =>
    setSearch({ sort: key, dir: sort === key && dir === "desc" ? "asc" : "desc" });

  // Single source of truth: same deriveHealth result Home and Customer 360 use.
  const health = healthByImplementation(data.implementations, data.triage);
  const levelOf = (id: string) => health.get(id)?.level ?? "no_signal";

  // Customer options come from the already-loaded implementations list — no new query.
  const customerOptions = Array.from(
    new Map(
      data.implementations.map((r) => [
        r.customer_id,
        { id: r.customer_id, name: r.customer_name, hasImplementation: true },
      ]),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));

  const rows = data.implementations
    .filter((r) => (stage ? normalizeStage(r.current_stage) === stage : true))
    .filter((r) => (status ? levelOf(r.id) === status : true))
    .sort((a, b) => {
      const factor = dir === "asc" ? 1 : -1;
      switch (sort) {
        case "customer":
          return factor * a.customer_name.localeCompare(b.customer_name);
        case "stage":
          return factor * (stageIndex(a.current_stage) - stageIndex(b.current_stage));
        case "status":
          return factor * levelOf(a.id).localeCompare(levelOf(b.id));
        case "owner":
          return factor * (a.owner_name ?? "").localeCompare(b.owner_name ?? "");
        case "tier":
          return factor * (a.tier ?? "").localeCompare(b.tier ?? "");
        case "launch":
          return (
            factor * (a.target_launch_date ?? "9999").localeCompare(b.target_launch_date ?? "9999")
          );
        default:
          return (
            factor * ((daysSince(a.stage_entered_at) ?? 0) - (daysSince(b.stage_entered_at) ?? 0))
          );
      }
    });

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

  return (
    <>
      <PageHeader
        title="Customers"
        description="One row per customer implementation, grouped by the stage it is in."
        actions={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              {rows.length} / {data.implementations.length}
            </span>
            <NewImplementation customers={customerOptions} />
          </div>
        }
      />

      <PageBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <FilterGroup
            label="Stage"
            value={stage}
            options={LIFECYCLE_STAGES.map((s) => ({ value: s.id, label: s.label }))}
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
          current={searchToView({ stage, status, sort, dir })}
          onApply={(view) => {
            // A stored view is re-validated on the way back in, exactly as the
            // URL is: it was written months ago against a sort key that may
            // since have gone.
            const savedSort = String(view["sort"] ?? "");
            const savedStage = view["stage"];
            const savedStatus = view["status"];
            void navigate({
              search: () => ({
                sort: ((SORTS as readonly string[]).includes(savedSort)
                  ? savedSort
                  : "days") as SortKey,
                dir: view["dir"] === "asc" ? ("asc" as const) : ("desc" as const),
                ...(typeof savedStage === "string" ? { stage: savedStage } : {}),
                ...(typeof savedStatus === "string" ? { status: savedStatus } : {}),
              }),
            });
          }}
        />

        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-surface text-[10px] text-muted-foreground">
              <tr>
                <Th label="Customer" sortKey="customer" />
                <Th label="Stage" sortKey="stage" />
                <Th label="Health" sortKey="status" />
                <Th label="Owner" sortKey="owner" />
                <Th label="Tier" sortKey="tier" />
                <Th label="Target launch" sortKey="launch" />
                <Th label="Days in stage" sortKey="days" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="group hover:bg-muted/60">
                  <td className="px-3 py-1.5">
                    <Link
                      to="/customers/$customerId"
                      params={{ customerId: r.customer_id }}
                      search={{ impl: r.id }}
                      className="block text-[13px] font-medium hover:underline"
                    >
                      {r.customer_name}
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                        {r.industry ?? "—"} · {r.segment ?? "—"}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-1.5">
                    <StageBadge stage={r.current_stage} />
                  </td>
                  <td className="px-3 py-1.5">
                    <StatusDot status={levelOf(r.id)} />
                    <HealthNote
                      recorded={r.health_recorded}
                      recordedReason={r.health_recorded_reason}
                      legacyStatus={r.status}
                      computed={levelOf(r.id)}
                      className="mt-0.5 block text-[10px] text-muted-foreground"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-[12px]">{r.owner_name ?? "Unassigned"}</td>
                  <td className="px-3 py-1.5 text-[12px]">{r.tier ?? "—"}</td>
                  {/* The launch date carries its own pace: a date alone does
                      not say whether it has already passed. */}
                  <td className="px-3 py-1.5 font-mono text-[12px]">
                    <PaceChip
                      quiet
                      pace={datePace(r.target_launch_date, r.actual_launch_date)}
                      label={fmtDate(r.target_launch_date)}
                    />
                  </td>
                  {/* Was a bare `> 14` with no explanation. Same threshold, but
                      the chip now says it is a general one rather than this
                      stage's own target — this list does not load
                      stage_instances, and inventing a target would be worse
                      than naming the fallback. The 360 uses the real one. */}
                  <td className="px-3 py-1.5 font-mono text-[12px]">
                    <PaceChip
                      quiet
                      pace={dwellPace(r.stage_entered_at, null)}
                      label={`${daysSince(r.stage_entered_at) ?? 0}d`}
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <NoRows label="No implementations match these filters. Try clearing a filter." />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </PageBody>
    </>
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
