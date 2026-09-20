import { AlertTriangle, CircleCheck, Eye } from "lucide-react";

import { Panel } from "@/components/record";
import type { WatchOut } from "@/lib/watch-outs";
import { cn } from "@/lib/utils";

/**
 * The calls, the SOW and the plan, read against each other, on the deal.
 *
 * Every row names the sentence it came from, so a wrong match is dismissed
 * in a glance and a right one is quoted on the kickoff. Conflicts first: the
 * things the deck would otherwise promise against what the customer said.
 */
export function WatchOutsPanel({
  rows,
  hasBrief,
}: {
  rows: WatchOut[];
  /** False when no brief has been generated: then there is nothing to read yet. */
  hasBrief: boolean;
}) {
  const conflicts = rows.filter((r) => r.severity === "conflict").length;
  const checks = rows.filter((r) => r.severity === "check").length;
  const meta = !hasBrief
    ? "Generate the brief first"
    : rows.length === 0
      ? "Nothing crossed — the calls, the SOW and the plan agree"
      : [
          conflicts ? `${conflicts} conflict${conflicts === 1 ? "" : "s"}` : null,
          checks ? `${checks} to check` : null,
          rows.length - conflicts - checks ? `${rows.length - conflicts - checks} met` : null,
        ]
          .filter(Boolean)
          .join(" · ");
  return (
    <Panel
      id="panel-watch-outs"
      title="Watch-outs"
      meta={meta}
      level={conflicts ? "primary" : "supporting"}
      collapsible
      defaultOpen={conflicts > 0}
      collapseKey="deal:watch-outs"
    >
      {!hasBrief ? (
        <p className="px-3 py-2.5 text-[12px] text-muted-foreground">
          Once the customer brief is generated, this reads what was said on the calls and what the
          SOW names against the plan&apos;s dates: a deadline the plan runs past, a person out
          during their phase, devices that will not be there for the field test, a duration the
          customer was told that the plan does not keep.
        </p>
      ) : rows.length === 0 ? (
        <p className="px-3 py-2.5 text-[12px] text-muted-foreground">
          No dates, absences or promises in the call notes or the SOW disagree with the plan.
        </p>
      ) : (
        <ul className="divide-y divide-border/70">
          {rows.map((r) => (
            <li key={r.key} className="flex items-start gap-2.5 px-3 py-2">
              {r.severity === "conflict" ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-blocked-foreground" />
              ) : r.severity === "check" ? (
                <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-risk-foreground" />
              ) : (
                <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-ontrack-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium">{r.title}</p>
                <p className="text-[11px] text-muted-foreground">{r.detail}</p>
                <p
                  className={cn("mt-0.5 truncate text-[11px] italic text-muted-foreground/80")}
                  title={r.quote}
                >
                  <span className="font-mono not-italic text-[10px] uppercase tracking-wider">
                    {r.source === "sow" ? "SOW" : "Calls"}
                  </span>{" "}
                  “{r.quote}”
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
