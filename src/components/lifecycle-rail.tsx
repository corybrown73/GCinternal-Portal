import { LIFECYCLE_STAGES } from "@/lib/lifecycle";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The house vocabulary, on the surfaces where no single project is in view.
 *
 * This bar used to sit over every page claiming to be "Implementation
 * Lifecycle" while highlighting nothing and, on a customer record, describing
 * a journey that project may not even be on. Both jobs have been separated:
 *
 *  - A customer or project page draws that project's OWN stages, read from
 *    `stage_instances` — see `project-timeline-rail.tsx`.
 *  - A list route has no single project to describe, so it keeps this: a
 *    glossary of the standard stages, labelled as a glossary so nobody reads
 *    an unhighlighted rail as "nothing is happening".
 *
 * The clipping is fixed here too. Eight fixed chips ran out of room at about
 * 1187px and were simply cut off; this scrolls, fades the edge it is cutting
 * off, and below `md` states the vocabulary in one line instead of showing a
 * severed fragment of it.
 */
export function LifecycleRail({ className }: { className?: string }) {
  return (
    <TooltipProvider delayDuration={120}>
      <div className={cn("relative border-b border-border bg-surface px-4 py-1.5", className)}>
        {/* Below md there is no width for a readable rail, so the vocabulary is
            stated rather than clipped. */}
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground md:hidden">
          Standard journey · {LIFECYCLE_STAGES.length} stages · Handoff → Handover to Customer
          Success
        </p>

        <div className="hidden items-center gap-px overflow-x-auto md:flex">
          <span
            className="mr-3 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            title="The standard implementation journey. This is the vocabulary, not the state of any one project — open a customer to see that project's own stages."
          >
            Standard journey
          </span>
          <span
            className="mr-1.5 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70"
            title="Closed / Won is the trigger into Handoff, not an implementation stage."
          >
            Closed / Won →
          </span>

          {LIFECYCLE_STAGES.map((stage, i) => (
            <Tooltip key={stage.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "group relative shrink-0 whitespace-nowrap px-2 py-1 font-mono text-[11px] tracking-tight transition-colors",
                    "border-y border-r border-border first-of-type:rounded-l-sm first-of-type:border-l last-of-type:rounded-r-sm",
                    "bg-card text-muted-foreground hover:text-foreground",
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
          ))}
          {/* Fades whatever the scroller is cutting off. The chips are
              left-aligned, so with room to spare this gradient lies over empty
              background and is invisible — no scroll listener needed to avoid
              faking an edge that is not there. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent"
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
