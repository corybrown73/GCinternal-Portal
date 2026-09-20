import { ArrowRight, Check } from "lucide-react";

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
}: {
  phases: DeliverablePhase[];
  size?: "sm" | "md";
  className?: string;
  /** Uploaded logos, tool key → URL (useToolMarks). */
  overrides?: Record<string, string>;
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
                  <li key={d.id} className="flex items-center gap-2">
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
                      title={d.sublabel}
                    >
                      {d.label}
                    </span>
                    {d.state === "done" ? (
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                        strokeWidth={3}
                        aria-label="Live"
                      />
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
