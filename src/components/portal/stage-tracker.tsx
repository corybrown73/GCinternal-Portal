import { Check } from "lucide-react";
import { LIFECYCLE_STAGES } from "@/lib/lifecycle";
import { normalizeStage } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

/**
 * Customer-facing horizontal stage tracker: completed / current / upcoming.
 * Warmer and bigger than the internal rail, same token system.
 */
export function StageTracker({ currentStage }: { currentStage: string }) {
  const normalized = normalizeStage(currentStage);
  const currentIndex = normalized
    ? LIFECYCLE_STAGES.findIndex((s) => s.id === normalized)
    : -1;

  return (
    <ol className="flex w-full items-start gap-0 overflow-x-auto pb-1" aria-label="Onboarding stages">
      {LIFECYCLE_STAGES.map((stage, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
        return (
          <li key={stage.id} className="flex min-w-[72px] flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <div
                className={cn(
                  "h-0.5 flex-1",
                  i === 0 ? "bg-transparent" : i <= currentIndex ? "bg-status-ontrack-foreground/60" : "bg-border",
                )}
              />
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                  state === "done" &&
                    "border-status-ontrack-foreground/40 bg-status-ontrack text-status-ontrack-foreground",
                  state === "current" &&
                    "border-primary bg-primary text-primary-foreground shadow-sm",
                  state === "upcoming" && "border-border bg-card text-muted-foreground",
                )}
                aria-current={state === "current" ? "step" : undefined}
              >
                {state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <div
                className={cn(
                  "h-0.5 flex-1",
                  i === LIFECYCLE_STAGES.length - 1
                    ? "bg-transparent"
                    : i < currentIndex
                      ? "bg-status-ontrack-foreground/60"
                      : "bg-border",
                )}
              />
            </div>
            <span
              className={cn(
                "px-1 text-center text-[11px] leading-tight",
                state === "current" ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {stage.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="font-mono text-[13px] font-medium tabular-nums">{clamped}%</span>
    </div>
  );
}
