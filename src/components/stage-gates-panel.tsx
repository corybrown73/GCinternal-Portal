import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, CircleDashed } from "lucide-react";

import { Panel } from "@/components/record";
import { Button } from "@/components/ui/button";
import { setTaskStatus } from "@/lib/plan.functions";
import { advanceImplementationStage } from "@/lib/hub.functions";
import { nextLifecycleStage } from "@/lib/stage-advance-input";
import { stageLabel } from "@/lib/hub-format";
import type { LifecycleStageId } from "@/lib/lifecycle";
import {
  canAdvance,
  gateSummary,
  isSettled,
  needsOverride,
  stageGateStatus,
  type GateItem,
} from "@/lib/stage-gates";
import { userMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

/**
 * The three things that have to be true before this project moves on.
 *
 * WHY THIS REPLACES A STAGE PICKER. Advancing used to mean finding a control
 * and choosing the next stage from a list — nothing connected the move to the
 * work, so you could leave Handoff without the kickoff being booked and book
 * the kickoff without anything moving. Here, ticking the last criterion IS the
 * prompt to advance: the checkbox and the stage change are one motion.
 *
 * The advance is still a deliberate press rather than automatic. A stage change
 * writes an append-only history row that everything downstream reads, and a
 * checkbox that silently rewrites the project's timeline is the kind of
 * helpfulness people learn to distrust.
 */
export function StageGatesPanel({
  customerId,
  implementationId,
  currentStage,
  stageGateMode,
  items,
}: {
  customerId: string;
  implementationId: string;
  currentStage: LifecycleStageId | null;
  stageGateMode: string | null;
  /** The work items belonging to the CURRENT stage only. */
  items: GateItem[];
}) {
  const status = stageGateStatus(items);
  const next = nextLifecycleStage(currentStage);
  const queryClient = useQueryClient();

  const tick = useServerFn(setTaskStatus);
  const advance = useServerFn(advanceImplementationStage);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["plan", implementationId] });
    void queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
  };

  const toggle = useMutation({
    mutationFn: (v: { id: string; done: boolean }) =>
      tick({ data: { workItemId: v.id, status: v.done ? "done" : "not_started" } }),
    onSuccess: refresh,
  });

  const move = useMutation({
    mutationFn: () =>
      advance({
        data: {
          implementationId,
          toStage: next!,
          enteredBy: null,
          notes: status.ready
            ? "All core criteria complete"
            : `Advanced with ${status.remaining.length} core criteria outstanding`,
        },
      }),
    onSuccess: refresh,
  });

  if (status.ungated && items.length === 0) return null;

  const allowed = canAdvance(status, stageGateMode);
  const override = needsOverride(status, stageGateMode);

  return (
    <Panel
      title="To leave this stage"
      level="primary"
      meta={
        status.total > 0 ? (
          <span className={cn("font-mono", status.ready ? "text-status-ontrack-foreground" : null)}>
            {status.done}/{status.total}
          </span>
        ) : null
      }
    >
      <ul className="divide-y divide-border">
        {status.gates.map((g) => {
          const done = isSettled(g.status);
          return (
            <li key={g.id} className="flex items-center gap-3 px-3 py-2">
              {/* The whole row is the target, not a 14px box. A checklist you
                  have to aim at is a checklist people stop ticking. */}
              <button
                type="button"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate({ id: g.id, done: !done })}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
                    done
                      ? "border-status-ontrack-foreground bg-status-ontrack-foreground text-white"
                      : "border-input",
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : null}
                </span>
                <span
                  className={cn(
                    "min-w-0 truncate text-[13px]",
                    done ? "text-muted-foreground line-through" : "font-medium",
                  )}
                >
                  {g.title}
                </span>
                {g.party === "customer" ? (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Customer
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-3 py-2">
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          {status.ready ? (
            <Check className="h-3.5 w-3.5 text-status-ontrack-foreground" />
          ) : (
            <CircleDashed className="h-3.5 w-3.5" />
          )}
          {gateSummary(status)}
        </p>

        {next ? (
          <Button
            size="sm"
            variant={status.ready ? "default" : "outline"}
            disabled={!allowed || move.isPending}
            onClick={() => move.mutate()}
            // The reason lives on the control that is refused, not in a
            // paragraph somewhere else on the page.
            title={
              allowed
                ? override
                  ? `Advance anyway — ${status.remaining.length} criteria outstanding`
                  : `Move to ${stageLabel(next)}`
                : gateSummary(status)
            }
          >
            {override ? "Advance anyway" : `Move to ${stageLabel(next)}`} <ArrowRight />
          </Button>
        ) : null}
      </div>

      {/* Both go through userMessage: a server function can still surface a
          driver message if a write fails somewhere that has not been wrapped
          yet, and this is the last place before it reaches a person. */}
      {move.error ? (
        <p className="px-3 py-2 text-[12px] text-destructive">
          {userMessage("move this project on", move.error)}
        </p>
      ) : null}
      {toggle.error ? (
        <p className="px-3 py-2 text-[12px] text-destructive">
          {userMessage("save that task", toggle.error)}
        </p>
      ) : null}
    </Panel>
  );
}
