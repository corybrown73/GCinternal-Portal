import { ArrowRight, Check } from "lucide-react";

import type { Deliverable } from "@/lib/deliverables";

import { BrandMarkTile } from "@/components/brand-mark";
import type { BrandMark } from "@/lib/brand-marks";
import type { DeliverablePhase } from "@/lib/deliverables";
import { cn } from "@/lib/utils";

const STATE = {
  done: { chip: "Done", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  active: { chip: "Now", className: "bg-primary text-primary-foreground" },
  upcoming: { chip: "Later", className: "bg-muted text-muted-foreground" },
} as const;

/**
 * What we are building, as phases left to right with an arrow between.
 *
 * The phase carries the state and the dates; each thing inside it is one
 * line, a mark and a name, with a check once it is live. Read left to
 * right it is the project: the form first, then what waits on the form.
 */
export function DeliverablesStrip({
  phases,
  size = "md",
  className,
  overrides = {},
  onOpen,
  onComplete,
}: {
  phases: DeliverablePhase[];
  size?: "sm" | "md";
  className?: string;
  /** Uploaded logos, tool key → URL (useToolMarks). */
  overrides?: Record<string, string>;
  /** Clicking an item: go to its stage on the plan. */
  onOpen?: (d: Deliverable) => void;
  /** The check that appears on hover: mark the item's last step done today. */
  onComplete?: (d: Deliverable) => void;
}) {
  const shown = phases.filter((p) => p.items.length > 0);
  if (shown.length === 0) return null;
  const compact = size === "sm";
  return (
    <ol className={cn("flex flex-wrap items-stretch gap-y-2", className)}>
      {shown.map((p, i) => {
        const st = STATE[p.state];
        return (
          <li key={p.phase} className="flex items-stretch">
            <div
              className={cn(
                "flex min-w-0 flex-col rounded-md border",
                compact ? "px-2.5 py-1.5" : "px-3 py-2",
                p.state === "active"
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-background",
                p.state === "done" && "bg-muted/20",
              )}
            >
              <div
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
                title={p.gate ? `${p.when} · ${p.gate}` : p.when}
              >
                <span
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    st.className,
                  )}
                >
                  {st.chip}
                </span>
                <span className={cn("font-semibold", compact ? "text-[11.5px]" : "text-[12.5px]")}>
                  {p.label}
                </span>
              </div>
              <ul className={cn("mt-1.5 space-y-1", compact && "mt-1 space-y-0.5")}>
                {p.items.map((d) => (
                  <li key={d.id} className="group flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpen?.(d)}
                      disabled={!onOpen}
                      title={onOpen ? `${d.sublabel} · open on the plan` : d.sublabel}
                      className="flex min-w-0 items-center gap-2 text-left enabled:hover:underline disabled:cursor-default"
                    >
                      <BrandMarkTile
                        mark={d.mark}
                        size={compact ? "xs" : "sm"}
                        override={d.mark.tool ? (overrides[d.mark.tool] ?? null) : null}
                      />
                      <span
                        className={cn(
                          "min-w-0 truncate",
                          compact ? "text-[11.5px]" : "text-[12.5px]",
                          d.state === "done" ? "text-muted-foreground" : "font-medium",
                        )}
                      >
                        {d.label}
                      </span>
                    </button>
                    {d.state === "done" ? (
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                        strokeWidth={3}
                        aria-label="Live"
                      />
                    ) : onComplete && p.state !== "upcoming" ? (
                      <button
                        type="button"
                        onClick={() => onComplete(d)}
                        title="Mark this live today"
                        aria-label={`Mark ${d.label} live`}
                        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border text-transparent hover:border-emerald-600 hover:text-emerald-600 group-hover:text-muted-foreground/60"
                      >
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            {i < shown.length - 1 ? (
              <span className="flex items-center px-1.5 text-muted-foreground/60" aria-hidden>
                <ArrowRight className="h-4 w-4" />
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Marks only, for a card: the pipeline board, a list row. */
export function MarkRow({
  marks,
  max = 6,
  size = "xs",
  className,
  overrides = {},
}: {
  marks: BrandMark[];
  max?: number;
  size?: "xs" | "sm";
  className?: string;
  overrides?: Record<string, string>;
}) {
  if (marks.length === 0) return null;
  const shown = marks.slice(0, max);
  const more = marks.length - shown.length;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {shown.map((m, i) => (
        <BrandMarkTile
          key={`${m.title}-${i}`}
          mark={m}
          size={size}
          override={m.tool ? (overrides[m.tool] ?? null) : null}
        />
      ))}
      {more > 0 ? <span className="text-[10px] text-muted-foreground">+{more}</span> : null}
    </span>
  );
}
