import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { NoRows, StageBadge, StatusChip } from "@/components/record";
import { WAITING_ON_LABEL } from "@/lib/customer360-derive";
import { daysSince, fmtDate, fmtMoney } from "@/lib/hub-format";
import { LEADERSHIP_ACTION_LABEL, type OwnerAccountRow } from "@/lib/leadership";

function MetaLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="min-w-0 text-[11px] leading-relaxed text-muted-foreground">
      <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70">
        {label}
      </span>
      {children}
    </span>
  );
}

/**
 * The single account row used everywhere a list of accounts appears — leadership
 * filters, stage drill-downs and owner portfolios. Existing derived triage,
 * health and intervention fields only, linking through to the account record.
 */
export function AccountRowList({
  accounts,
  showOwner,
  showDaysInStage,
  emptyLabel = "No accounts match this filter.",
}: {
  accounts: OwnerAccountRow[];
  showOwner?: boolean;
  /** Shows how long each account has been sitting in its current stage. */
  showDaysInStage?: boolean;
  emptyLabel?: string;
}) {
  return (
    <ul className="divide-y divide-border">
      {accounts.map(({ row, health, intervention }) => (
        <li key={row.impl.id} className="px-3 py-3 hover:bg-muted/60">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <StatusChip status={health} />
            <Link
              to="/customers/$customerId"
              params={{ customerId: row.impl.customer_id }}
              search={{ tab: row.tab, impl: row.impl.id }}
              className="text-[13px] font-semibold tracking-tight hover:underline"
            >
              {row.impl.customer_name}
            </Link>
            <StageBadge stage={row.impl.current_stage} />
            {showOwner ? (
              row.impl.owner_name ? (
                <Link
                  to="/owners/$owner"
                  params={{ owner: row.impl.owner_name }}
                  className="font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                >
                  {row.impl.owner_name}
                </Link>
              ) : (
                <span className="font-mono text-[11px] text-destructive">Unassigned</span>
              )
            ) : null}
            {showDaysInStage ? (
              <span className="font-mono text-[11px] text-muted-foreground">
                {daysSince(row.impl.stage_entered_at) ?? 0}d in stage
              </span>
            ) : null}
            <span className="font-mono text-[11px] text-muted-foreground">
              {row.impl.arr != null ? `${fmtMoney(row.impl.arr)} ARR` : "ARR not recorded"}
              {row.impl.target_launch_date
                ? ` · launch ${fmtDate(row.impl.target_launch_date)}`
                : ""}
            </span>
            <Link
              to="/customers/$customerId"
              params={{ customerId: row.impl.customer_id }}
              search={{ tab: row.tab, impl: row.impl.id }}
              className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline"
            >
              {row.tab}
              <ArrowRight className="h-3 w-3" strokeWidth={2} />
            </Link>
          </div>

          {intervention ? (
            <>
              <p className="mt-2 text-[13px] font-semibold leading-snug tracking-tight">
                {LEADERSHIP_ACTION_LABEL[intervention.action]}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                {intervention.action_reason}
              </p>
            </>
          ) : null}

          <div className="mt-2 grid gap-x-8 gap-y-1 border-l-2 border-border pl-2.5 sm:grid-cols-2">
            <MetaLine label="Why">{row.reason}</MetaLine>
            <MetaLine label="Next">{row.next_action}</MetaLine>
            <MetaLine label="Impact">{row.impact}</MetaLine>
            {intervention ? (
              <MetaLine label="Waiting on">
                {WAITING_ON_LABEL[intervention.dependency.party]} — {intervention.dependency.reason}
              </MetaLine>
            ) : null}
          </div>
        </li>
      ))}
      {accounts.length === 0 ? <NoRows label={emptyLabel} /> : null}
    </ul>
  );
}
