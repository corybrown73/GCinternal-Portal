import { BrandMarkTile } from "@/components/brand-mark";
import type { BrandMark } from "@/lib/brand-marks";
import type { Deliverable } from "@/lib/deliverables";
import { cn } from "@/lib/utils";

/**
 * What we are building, as tiles you can check off.
 *
 * Done tiles carry a check, the current phase carries a ring, later phases
 * are greyed. Read left to right it is the project: first form, then the
 * QuickBooks integration, then the dashboard. It answers "what did they
 * buy and how far along is it" before anyone reads a line of the plan.
 */
export function DeliverablesStrip({
  items,
  size = "md",
  className,
}: {
  items: Deliverable[];
  size?: "sm" | "md";
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <ol className={cn("flex flex-wrap gap-x-5 gap-y-3", className)}>
      {items.map((d) => (
        <li key={d.id} className="flex min-w-0 items-center gap-2.5">
          <BrandMarkTile mark={d.mark} size={size} state={d.state} />
          <div className="min-w-0">
            <p
              className={cn(
                "truncate text-[12.5px] font-medium leading-tight",
                d.state === "upcoming" && "text-muted-foreground",
                d.state === "done" &&
                  "text-muted-foreground line-through decoration-muted-foreground/50",
              )}
            >
              {d.label}
            </p>
            <p className="truncate text-[10.5px] text-muted-foreground">{d.sublabel}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Marks only, for a card: the pipeline board, a list row. */
export function MarkRow({
  marks,
  max = 6,
  size = "xs",
  className,
}: {
  marks: BrandMark[];
  max?: number;
  size?: "xs" | "sm";
  className?: string;
}) {
  if (marks.length === 0) return null;
  const shown = marks.slice(0, max);
  const more = marks.length - shown.length;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {shown.map((m, i) => (
        <BrandMarkTile key={`${m.title}-${i}`} mark={m} size={size} />
      ))}
      {more > 0 ? <span className="text-[10px] text-muted-foreground">+{more}</span> : null}
    </span>
  );
}
