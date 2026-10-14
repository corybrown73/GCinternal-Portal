import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, CircleDashed } from "lucide-react";

import { Panel } from "@/components/record";
import { Button } from "@/components/ui/button";
import { setTaskStatus } from "@/lib/plan.functions";
import { advanceImplementationStage, graduatePartnerImplementationFn } from "@/lib/hub.functions";
import { nextLifecycleStage } from "@/lib/stage-advance-input";
import { stageLabel } from "@/lib/hub-format";
import type { LifecycleStageId } from "@/lib/lifecycle";
import {
  partnerMoveBlocked,
  advanceLabel,
  gateOutcome,
  overridePrompt,
  requiresReason,
  gateSummary,
  isSettled,
  needsOverride,
  stageGateStatus,
  type GateItem,
} from "@/lib/stage-gates";
import { userMessage } from "@/lib/errors";
import { CARD, TONE } from "@/components/current-implementation-context";
import { cn } from "@/lib/utils";
import { ask } from "@/components/ui/ask";
import type { PartnerMoveView } from "@/lib/partner-implementation";

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
/**
 * The focus view's shell: a Home card with a 16px heading and the count as a
 * chip. The default view keeps the Panel it always drew.
 */
function FocusShell({
  title,
  meta,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  level?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(CARD, "overflow-hidden")}
      aria-label={typeof title === "string" ? title : undefined}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
        <h2 className="text-[18px] font-semibold tracking-tight text-foreground">{title}</h2>
        {meta ? (
          <span
            className={cn("rounded-full px-2 py-px text-[12px] font-semibold", TONE.muted.chip)}
          >
            {meta}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function StageGatesPanel({
  customerId,
  implementationId,
  currentStage,
  stageGateMode,
  items,
  partner,
  focus = false,
  focusHeading = null,
}: {
  customerId: string;
  implementationId: string;
  currentStage: LifecycleStageId | null;
  stageGateMode: string | null;
  /** The work items belonging to the CURRENT stage only. */
  items: GateItem[];
  /** A Partner Implementation's move, from the partner order. Replaces the lifecycle step. */
  partner?: PartnerMoveView | null;
  /**
   * Focus Mode: show only the next open criterion, in the order the stage gives
   * them, with the rest one click away. The move and graduate controls are the
   * same either way.
   */
  focus?: boolean;
  /**
   * Focus Mode's card heading for a partner stage: the stage's own name and goal,
   * so the stage reads as one card, as the standard stage does.
   */
  focusHeading?: { title: string; goal: string | null } | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const status = stageGateStatus(items);
  // A partner implementation moves along its own order; the house lifecycle has none of its stages.
  const next: string | null = partner
    ? (partner.next?.key ?? null)
    : nextLifecycleStage(currentStage);
  const nextName = partner ? (partner.next?.label ?? "") : stageLabel(next);
  const queryClient = useQueryClient();

  const tick = useServerFn(setTaskStatus);
  const advance = useServerFn(advanceImplementationStage);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["partner-progress", implementationId] });
    void queryClient.invalidateQueries({ queryKey: ["plan", implementationId] });
    void queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
  };

  // The row changes as it is clicked; the save follows, and a failure puts
  // it back and says why.
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const toggle = useMutation({
    mutationFn: (v: { id: string; done: boolean }) =>
      tick({ data: { workItemId: v.id, status: v.done ? "done" : "not_started" } }),
    onMutate: (v) => setOptimistic((o) => ({ ...o, [v.id]: v.done })),
    onSuccess: refresh,
    onError: (_e, v) => {
      setOptimistic((o) => {
        const next = { ...o };
        delete next[v.id];
        return next;
      });
    },
    onSettled: (_r, _e, v) => {
      // Cleared once the record has been read back, not before: the row
      // would flash to its old state between the save and the refetch.
      void queryClient.invalidateQueries({ queryKey: ["plan", implementationId] }).then(() =>
        setOptimistic((o) => {
          const next = { ...o };
          delete next[v.id];
          return next;
        }),
      );
    },
  });

  // A partner stage's blocking gates are mandatory: the move is refused while any
  // is open and cannot be overridden, so no override control is offered for it.
  const partnerBlocked =
    Boolean(partner) && partnerMoveBlocked(status, stageGateMode, next !== null);

  // Complete & Graduate is its own transactional action, never the stage advance. It
  // also refreshes the deal, the dashboard and the home list, which the deal moves to
  // Graduate and the customer's journey reads.
  const graduateNow = useServerFn(graduatePartnerImplementationFn);
  const refreshGraduation = () => {
    refresh();
    void queryClient.invalidateQueries({ queryKey: ["deal"] });
    void queryClient.invalidateQueries({ queryKey: ["welcome"] });
    void queryClient.invalidateQueries({ queryKey: ["home"] });
  };
  const graduate = useMutation({
    mutationFn: () => graduateNow({ data: { implementationId } }),
    onSuccess: refreshGraduation,
  });
  // The database's rule: every Roll Out criterion must be done (not skipped).
  const openCriteria = status.gates.filter((g) => g.status !== "done");
  const graduationReady = status.gates.length > 0 && openCriteria.length === 0;

  const move = useMutation({
    mutationFn: (v: { reason: string | null }) =>
      advance({
        data: {
          implementationId,
          toStage: next!,
          // Null: the server resolves the actor from the authenticated caller
          // rather than asking the client who it is.
          enteredBy: null,
          // A partner advance has no override field: a reason given on an advisory
          // partner gap is recorded as the move's note, so it is not lost.
          notes: status.ready
            ? "All core criteria complete"
            : partner && v.reason
              ? v.reason
              : `Advanced with ${status.remaining.length} core criteria outstanding`,
          override: status.ready ? null : { reason: v.reason },
        },
      }),
    onSuccess: refresh,
  });

  if (status.ungated && items.length === 0) return null;

  const outcome = gateOutcome(status, stageGateMode);
  const override = needsOverride(status, stageGateMode);
  const mustExplain = requiresReason(status, stageGateMode);
  const Shell = focus ? FocusShell : Panel;

  return (
    <Shell
      title={focusHeading ? focusHeading.title : "To leave this stage"}
      level="primary"
      meta={
        status.total > 0 ? (
          <span className={cn("font-mono", status.ready ? "text-status-ontrack-foreground" : null)}>
            {status.done}/{status.total}
          </span>
        ) : null
      }
    >
      {focusHeading ? (
        <div className="px-4 pt-1.5">
          {focusHeading.goal ? (
            <p className="text-[14px] leading-relaxed text-foreground/85">{focusHeading.goal}</p>
          ) : null}
          <p className="mt-3 text-[12px] font-semibold text-muted-foreground">
            To leave this stage
          </p>
        </div>
      ) : null}
      <ul className={focus && !showAll ? "" : "divide-y divide-border"}>
        {(focus && !showAll ? status.remaining.slice(0, 1) : status.gates).map((g) => {
          const done = optimistic[g.id] ?? isSettled(g.status);
          const featured = focus && !showAll && !done;
          return (
            <li
              key={g.id}
              className={cn(
                "flex items-center gap-3",
                featured
                  ? "mx-4 my-4 rounded-md border border-border bg-card px-4 py-4"
                  : "px-3 py-2",
              )}
              style={featured ? { boxShadow: `inset 3px 0 0 0 ${TONE.info.bar}` } : undefined}
            >
              {/* The whole row is the target, not a 14px box. A checklist you
                  have to aim at is a checklist people stop ticking. */}
              <button
                type="button"
                onClick={() => toggle.mutate({ id: g.id, done: !done })}
                className={cn(
                  "flex min-w-0 flex-1 items-center text-left",
                  featured ? "gap-3" : "gap-2.5",
                )}
              >
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-sm border transition-colors",
                    featured ? "h-5 w-5" : "h-4 w-4",
                    done
                      ? "border-status-ontrack-foreground bg-status-ontrack-foreground text-white"
                      : "border-input",
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : null}
                </span>
                <span
                  className={cn(
                    featured ? "min-w-0 text-[16px] font-semibold" : "min-w-0 truncate text-[13px]",
                    done ? "text-muted-foreground line-through" : "font-medium",
                  )}
                >
                  {g.title}
                </span>
                {done && g.verified !== undefined ? (
                  g.verified ? (
                    <span className="shrink-0 rounded-full border border-status-ontrack-foreground/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-status-ontrack-foreground">
                      Verified
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Done, not verified
                    </span>
                  )
                ) : null}
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

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-t border-border",
          focus ? "px-4 py-3" : "bg-surface px-3 py-2",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            {status.ready ? (
              <Check className="h-3.5 w-3.5 text-status-ontrack-foreground" />
            ) : (
              <CircleDashed className="h-3.5 w-3.5" />
            )}
            {gateSummary(status)}
          </p>
          {focus && status.gates.length > 1 ? (
            <button
              type="button"
              aria-expanded={showAll}
              onClick={() => setShowAll((o) => !o)}
              className="text-[12px] font-medium text-primary underline-offset-2 hover:underline"
            >
              {showAll
                ? "Show only the next criterion"
                : `View all ${status.gates.length} criteria`}
            </button>
          ) : null}
        </div>

        {next && partnerBlocked ? (
          <p className="text-[12px] font-medium text-status-risk-foreground">
            Mandatory for this stage: {gateSummary(status)}. This move cannot be overridden.
          </p>
        ) : next ? (
          <Button
            size="sm"
            // Demoted whenever anything is outstanding. A primary button is a
            // recommendation, and skipping the criteria is never the
            // recommended path — it is the available one.
            variant={outcome === "clear" ? "default" : "outline"}
            disabled={move.isPending}
            onClick={async () => {
              if (outcome === "clear") {
                move.mutate({ reason: null });
                return;
              }
              // Names every unmet criterion, then asks for words. The typed
              // reason is what turns "clicked through a dialog" into
              // "somebody said why", and it is required on a blocking gate.
              const answer = await ask({
                title: `Move to ${nextName} anyway?`,
                body: overridePrompt(status, nextName),
                confirmLabel: `Move to ${nextName}`,
                ...(mustExplain
                  ? {
                      prompt: {
                        label: "Why? This is recorded against your name.",
                        placeholder: "The reason for moving on",
                        required: true,
                      },
                    }
                  : {}),
              });
              if (answer === null || answer === false) return;
              move.mutate({ reason: typeof answer === "string" ? answer.trim() : null });
            }}
            // The reason lives on the control it applies to, not in a
            // paragraph somewhere else on the page.
            title={
              outcome === "clear"
                ? `Move to ${nextName}`
                : `${gateSummary(status)} — you will be asked to confirm${
                    mustExplain ? " and say why" : ""
                  }`
            }
          >
            {advanceLabel(outcome, nextName)} <ArrowRight />
          </Button>
        ) : partner?.graduation === "graduated" ? (
          <p className="text-[12px] font-medium text-status-ontrack-foreground">
            Graduated. Roll Out &amp; Graduation is complete and the deal is at Graduate.
          </p>
        ) : partner?.graduation === "available" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!graduationReady || graduate.isPending}
              title={
                graduationReady
                  ? "Completes Roll Out & Graduation and moves the deal to Graduate"
                  : "Every Roll Out criterion must be done first"
              }
              onClick={async () => {
                if (
                  await ask({
                    title: "Complete & graduate this implementation?",
                    body: "This completes Roll Out & Graduation and moves the deal to Graduate. It is recorded in the change history.",
                    confirmLabel: "Complete & Graduate",
                  })
                )
                  graduate.mutate();
              }}
            >
              {graduate.isPending ? "Graduating…" : "Complete & Graduate"}
            </Button>
            {!graduationReady ? (
              <span className="text-[11px] text-muted-foreground">
                {openCriteria.length === 1
                  ? `Waiting on: ${openCriteria[0]!.title}`
                  : `${openCriteria.length} criteria still open.`}
              </span>
            ) : null}
          </div>
        ) : partner?.handoff ? (
          <p className="text-[11px] text-muted-foreground">
            Partner Setup ends with the handoff to the GoCanvas implementation team, from the
            handoff panel above.
          </p>
        ) : null}
      </div>

      {/* Both go through userMessage: a server function can still surface a
          driver message if a write fails somewhere that has not been wrapped
          yet, and this is the last place before it reaches a person. */}
      {graduate.error ? (
        <p role="alert" className="px-3 py-2 text-[12px] text-destructive">
          {userMessage("graduate this implementation", graduate.error)}
        </p>
      ) : null}
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
    </Shell>
  );
}
