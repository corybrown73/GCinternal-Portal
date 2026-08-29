import { LIFECYCLE_STAGES, type LifecycleStageId } from "@/lib/lifecycle";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type LifecycleRailProps = {
  /** Stage currently in focus, if any context is selected. */
  activeStage?: LifecycleStageId | undefined;
  className?: string | undefined;
};

export function LifecycleRail({ activeStage, className }: LifecycleRailProps) {
  const activeIndex = activeStage ? LIFECYCLE_STAGES.findIndex((s) => s.id === activeStage) : -1;

  return (
    <TooltipProvider delayDuration={120}>
      <div
        className={cn(
          "flex items-center gap-px overflow-x-auto border-b border-border bg-surface px-4 py-1.5",
          className,
        )}
      >
        <span className="mr-3 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Implementation Lifecycle
        </span>
        <span
          className="mr-1.5 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70"
          title="Closed / Won is the trigger into Handoff, not an implementation stage."
        >
          Closed / Won →
        </span>

        {LIFECYCLE_STAGES.map((stage, i) => {
          const isActive = i === activeIndex;
          const isPast = activeIndex > -1 && i < activeIndex;
          return (
            <Tooltip key={stage.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-state={isActive ? "active" : isPast ? "past" : "future"}
                  className={cn(
                    "group relative shrink-0 px-2 py-1 font-mono text-[11px] tracking-tight transition-colors",
                    "border-y border-r border-border first-of-type:border-l first-of-type:rounded-l-sm last-of-type:rounded-r-sm",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary z-10"
                      : isPast
                        ? "bg-muted text-muted-foreground hover:text-foreground"
                        : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="mr-1.5 hidden opacity-50 xl:inline">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {stage.label}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64">
                <p className="font-medium">{stage.label}</p>
                <p className="mt-1 text-muted-foreground">{stage.intent}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
