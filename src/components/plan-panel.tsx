import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, Lock } from "lucide-react";

import { NoRows, Panel } from "@/components/record";
import { getPlan } from "@/lib/plan.functions";
import type { PlanStage, PlanWorkItem } from "@/lib/plan.server";
import { fmtDate, humanize } from "@/lib/hub-format";
import { dueState, indexById, isClosed, openDependencies, summarisePlan } from "@/lib/work-items";
import { cn } from "@/lib/utils";

/**
 * The templated plan for an implementation.
 *
 * Two things this deliberately shows rather than hides:
 *  - Where a stage's state was INFERRED from stage order at backfill rather
 *    than observed in the history, it says so. A timestamp nobody recorded
 *    should not look like one that was.
 *  - "Blocked" here always means a predecessor is genuinely outstanding, and
 *    names it. Someone marking an item blocked is shown as their statement,
 *    separately, so the two never get conflated.
 */

const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

function StageStatusDot({ status }: { status: PlanStage["status"] }) {
  const tone =
    status === "done"
      ? "bg-status-ontrack-foreground"
      : status === "active"
        ? "bg-status-risk-foreground"
        : status === "skipped"
          ? "bg-muted-foreground/40"
          : "bg-border";
  return <span className={cn("inline-block h-2 w-2 rounded-full", tone)} />;
}

function ItemRow({ item, byId }: { item: PlanWorkItem; byId: Map<string, PlanWorkItem> }) {
  const open = openDependencies(item, byId);
  const due = dueState(item);
  const closed = isClosed(item.status);

  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={cn("text-[13px]", closed && "text-muted-foreground line-through")}>
          {item.title}
        </span>

        {item.party !== "internal" ? (
          <span className="rounded-sm border border-border px-1 text-[10px] text-muted-foreground">
            {item.party === "customer" ? "Customer" : "Partner"}
          </span>
        ) : null}

        {item.visibility === "shared" ? (
          <span className="rounded-sm border border-border px-1 text-[10px] text-muted-foreground">
            Shared
          </span>
        ) : null}

        <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          {item.due_at ? (
            <span
              className={cn(
                due === "overdue" && "text-status-blocked-foreground",
                due === "due_today" && "text-status-risk-foreground",
              )}
              title={item.due_at_edited ? "Set by hand — never recalculated" : undefined}
            >
              {due === "overdue" ? "overdue " : ""}
              {fmtDate(item.due_at)}
              {item.due_at_edited ? " (pinned)" : ""}
            </span>
          ) : null}
          <span>{humanize(item.status)}</span>
        </span>
      </div>

      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>
          {item.owner_name ??
            (item.role_key ? `${humanize(item.role_key)} (unassigned)` : "Unassigned")}
        </span>

        {item.status === "waiting" && item.waiting_on_party ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" strokeWidth={1.75} />
            Waiting on {item.waiting_on_party}
          </span>
        ) : null}

        {/* Computed: names what is actually holding this up. */}
        {!closed && open.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-status-blocked-foreground">
            <Lock className="h-3 w-3" strokeWidth={1.75} />
            Waiting on {open.map((d) => d.title).join(", ")}
          </span>
        ) : null}

        {/* A person's statement, kept separate from the computed fact above. */}
        {item.status === "blocked" && open.length === 0 ? (
          <span
            className="inline-flex items-center gap-1"
            title="Marked blocked by a person; no dependency is outstanding."
          >
            <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
            Marked blocked
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function PlanPanel({ implementationId }: { implementationId: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["plan", implementationId],
    queryFn: () => getPlan({ data: { implementationId } }),
  });

  if (isPending) {
    return <Panel title="Plan">{<NoRows label="Loading the plan…" />}</Panel>;
  }
  if (!data?.enabled) {
    return (
      <Panel title="Plan">
        <NoRows label="Templated plans are not switched on yet." />
      </Panel>
    );
  }
  if (data.stages.length === 0) {
    return (
      <Panel title="Plan">
        <NoRows label="This implementation has no plan stages recorded." />
      </Panel>
    );
  }

  const byId = indexById(data.items) as Map<string, PlanWorkItem>;
  const summary = summarisePlan(data.items);
  const itemsByStage = new Map<string, PlanWorkItem[]>();
  for (const item of data.items) {
    const key = item.stage_instance_id ?? "__unassigned";
    itemsByStage.set(key, [...(itemsByStage.get(key) ?? []), item]);
  }

  return (
    <Panel
      title="Plan"
      count={summary.total}
      meta={
        data.template
          ? `${data.template.name} v${data.template.version}`
          : "No template pinned — stages only"
      }
    >
      {summary.total > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
          <span>
            {summary.done}/{summary.total} done
          </span>
          {summary.overdue > 0 ? (
            <span className="text-status-blocked-foreground">{summary.overdue} overdue</span>
          ) : null}
          {summary.blocked > 0 ? <span>{summary.blocked} waiting on something else</span> : null}
          {summary.waitingOnCustomer > 0 ? (
            <span>{summary.waitingOnCustomer} waiting on the customer</span>
          ) : null}
        </div>
      ) : null}

      <ul className="divide-y divide-border">
        {data.stages.map((stage) => {
          const items = itemsByStage.get(stage.id) ?? [];
          return (
            <li key={stage.id}>
              <div className="flex flex-wrap items-center gap-2 bg-surface px-3 py-1.5">
                <StageStatusDot status={stage.status} />
                <span className="text-[12px] font-medium">{stage.name}</span>
                <span className={labelClass}>{humanize(stage.status)}</span>

                {stage.gate_mode === "blocking" ? (
                  <span
                    className="rounded-sm border border-border px-1 text-[10px]"
                    title="Advancing past this stage is enforced server-side."
                  >
                    Gated
                  </span>
                ) : null}

                {/* Say plainly where a timestamp was never actually recorded. */}
                {stage.provenance === "backfill_inferred" ? (
                  <span
                    className="text-[10px] text-muted-foreground"
                    title="Derived from stage order during migration; no recorded entry for this stage."
                  >
                    inferred
                  </span>
                ) : null}

                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {stage.entered_at ? fmtDate(stage.entered_at) : "—"}
                </span>
              </div>

              {items.length > 0 ? (
                <ul className="divide-y divide-border">
                  {items.map((item) => (
                    <ItemRow key={item.id} item={item} byId={byId} />
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* work_items.stage_instance_id is ON DELETE SET NULL, so an item can
          outlive its stage. Without this it would still be counted in the
          summary above while being invisible, and the numbers would stop
          adding up to the rows with no explanation. */}
      {(itemsByStage.get("__unassigned") ?? []).length > 0 ? (
        <div>
          <div className="flex items-center gap-2 bg-surface px-3 py-1.5">
            <span className="text-[12px] font-medium">Not on a stage</span>
            <span
              className={labelClass}
              title="These items are not attached to any stage of the plan."
            >
              unassigned
            </span>
          </div>
          <ul className="divide-y divide-border">
            {(itemsByStage.get("__unassigned") ?? []).map((item) => (
              <ItemRow key={item.id} item={item} byId={byId} />
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
