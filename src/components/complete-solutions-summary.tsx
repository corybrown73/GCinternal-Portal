import { Link } from "@tanstack/react-router";

import type { CompleteSolutionsPanel } from "@/lib/hub-types";
import {
  READINESS_LABEL,
  SOLUTION_SCOPE_LABEL,
  SOLUTION_STATUS_LABEL,
  shortDate,
} from "@/lib/complete-solutions";
import { cn } from "@/lib/utils";

/**
 * Customer 360's concise view of what is being delivered: each complete
 * solution with its readiness, what is overdue, what is waiting on something,
 * and the next actions. The detail and every change live in the workspace.
 */
export function CompleteSolutionsSummary({
  panel,
  implementationId,
  customerId,
}: {
  panel: CompleteSolutionsPanel;
  implementationId: string;
  customerId: string;
}) {
  const link = (
    <Link
      to="/solutions/$implId"
      params={{ implId: implementationId }}
      search={{ customer: customerId }}
      className="text-[12px] font-medium text-primary hover:underline"
    >
      Open the Solutions workspace →
    </Link>
  );

  if (panel.failed) {
    return (
      <section
        className="rounded-lg border border-border bg-card p-4"
        aria-label="Complete solutions"
      >
        <h2 className="text-[14px] font-semibold">Solutions being delivered</h2>
        <p role="alert" className="mt-1 text-[12px] text-destructive">
          {panel.failed}
        </p>
      </section>
    );
  }

  const s = panel.summary;
  if (!s) return null;

  if (s.solutions === 0) {
    return (
      <section
        className="rounded-lg border border-border bg-card p-4"
        aria-label="Complete solutions"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[14px] font-semibold">Solutions being delivered</h2>
          {link}
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          No complete solutions yet. Set them up from the signed SOW, or add one by hand.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border border-border bg-card p-4"
      aria-label="Complete solutions"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[14px] font-semibold">
          Solutions being delivered{" "}
          <span className="text-[12px] font-normal text-muted-foreground">
            · {s.solutions} · {s.purchased} purchased
            {s.requested ? ` · ${s.requested} requested` : ""} · {s.openGoLive} go-live component
            {s.openGoLive === 1 ? "" : "s"} open
          </span>
        </h2>
        {link}
      </div>

      <ul className="mt-3 divide-y divide-border">
        {s.rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-[12px]"
          >
            <span className="font-medium">{row.title}</span>
            <span className="text-muted-foreground">{SOLUTION_SCOPE_LABEL[row.scope]}</span>
            <span className="text-muted-foreground">{SOLUTION_STATUS_LABEL[row.status]}</span>
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 text-[11px]",
                row.readinessConfirmed === "ready" && "bg-emerald-500/10 text-emerald-700",
                row.readinessConfirmed === "at_risk" && "bg-amber-500/10 text-amber-700",
                row.readinessConfirmed === "not_ready" && "bg-muted text-muted-foreground",
              )}
            >
              {READINESS_LABEL[row.readinessConfirmed]}
            </span>
            {row.readinessSuggested !== row.readinessConfirmed ? (
              <span className="text-[11px] text-muted-foreground">
                Suggested: {READINESS_LABEL[row.readinessSuggested]} — to confirm
              </span>
            ) : null}
            <span className="text-muted-foreground">
              {row.components} component{row.components === 1 ? "" : "s"}
            </span>
            {row.targetDate ? (
              <span
                className={cn(
                  "text-muted-foreground",
                  row.overdue && "font-medium text-destructive",
                )}
              >
                {row.overdue ? "Overdue · " : ""}Target {shortDate(row.targetDate)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {s.overdue.length > 0 || s.waiting.length > 0 || s.nextActions.length > 0 ? (
        <div className="mt-2 grid gap-3 border-t border-border pt-3 text-[12px] md:grid-cols-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Overdue
            </div>
            {s.overdue.length ? (
              <ul className="mt-1 space-y-0.5">
                {s.overdue.slice(0, 3).map((o) => (
                  <li key={`${o.label}-${o.targetDate}`}>
                    {o.label} · {shortDate(o.targetDate)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">Nothing overdue.</p>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Waiting on
            </div>
            {s.waiting.length ? (
              <ul className="mt-1 space-y-0.5">
                {s.waiting.slice(0, 3).map((w) => (
                  <li key={w.label}>
                    {w.label}: <span className="text-muted-foreground">{w.reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">Nothing waiting.</p>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Next</div>
            {s.nextActions.length ? (
              <ul className="mt-1 space-y-0.5">
                {s.nextActions.slice(0, 3).map((n) => (
                  <li key={`${n.label}-${n.action}`}>
                    {n.action} <span className="text-muted-foreground">({n.label})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">No next action recorded.</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
