import { ArrowRight, Check } from "lucide-react";

import type { StepperStage } from "@/lib/stage-flow";
import { cn } from "@/lib/utils";

/**
 * The implementation's stage rail, drawn from a generic stage model. It knows
 * nothing about the journey it shows: the standard flow and the partner flow
 * each map their own stages into StepperStage, and this renders them the same
 * way. Dates are drawn only when the stage carries one.
 */
export function StageStepper({
  stages,
  shown,
  onShow,
}: {
  stages: ReadonlyArray<StepperStage>;
  /** The stage whose detail is open below the rail. */
  shown: string;
  /** Omit for a rail that only reads. */
  onShow?: (key: string) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-1 px-4 py-2.5">
      {stages.map((s, i) => {
        const skipped = s.status === "skipped";
        return (
          <li key={s.key} className="flex items-center gap-1">
            <button
              type="button"
              onClick={onShow ? () => onShow(s.key) : undefined}
              aria-current={s.isCurrent ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                s.isCurrent
                  ? "border-primary bg-primary text-primary-foreground"
                  : skipped
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                    : s.passed
                      ? "border-status-ontrack-foreground/40 bg-status-ontrack/60 text-status-ontrack-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                s.key === shown && !s.isCurrent && "ring-2 ring-primary/40",
              )}
            >
              {skipped ? (
                <span className="text-[10px] uppercase tracking-wide">Skipped</span>
              ) : s.passed ? (
                <Check className="h-3 w-3" strokeWidth={3} />
              ) : null}
              {s.label}
              {s.date ? (
                <span className="font-normal opacity-75">
                  · {s.date.label} {s.date.text}
                </span>
              ) : null}
            </button>
            {i < stages.length - 1 ? (
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
