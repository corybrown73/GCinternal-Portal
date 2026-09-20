import {
  BarChart3,
  Braces,
  Check,
  ClipboardList,
  Database,
  GraduationCap,
  Plug,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { BrandMark } from "@/lib/brand-marks";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  BarChart3,
  Braces,
  ClipboardList,
  Database,
  GraduationCap,
  Plug,
  Wrench,
};

const SIZE = {
  xs: {
    box: "h-5 w-5 rounded-[5px]",
    glyph: "h-3 w-3",
    text: "text-[8px]",
    badge: "h-2.5 w-2.5 -right-0.5 -bottom-0.5",
  },
  sm: {
    box: "h-7 w-7 rounded-md",
    glyph: "h-4 w-4",
    text: "text-[9px]",
    badge: "h-3 w-3 -right-1 -bottom-1",
  },
  md: {
    box: "h-10 w-10 rounded-lg",
    glyph: "h-5 w-5",
    text: "text-[11px]",
    badge: "h-4 w-4 -right-1 -bottom-1",
  },
  lg: {
    box: "h-12 w-12 rounded-xl",
    glyph: "h-6 w-6",
    text: "text-[13px]",
    badge: "h-4 w-4 -right-1 -bottom-1",
  },
} as const;

/**
 * One mark, one tile. `state` is how the tile reads on a checklist: done
 * carries a check, active carries a ring, upcoming is greyed. With no state
 * it is just the mark, for a card that only names what is being built.
 */
export function BrandMarkTile({
  mark,
  size = "md",
  state,
  className,
  title,
}: {
  mark: BrandMark;
  size?: keyof typeof SIZE;
  state?: "done" | "active" | "upcoming" | undefined;
  className?: string;
  title?: string;
}) {
  const s = SIZE[size];
  const label = title ?? mark.title;
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center border transition-opacity",
        s.box,
        mark.kind === "mono" ? "border-transparent" : "border-border bg-white",
        state === "upcoming" && "opacity-50 grayscale",
        state === "active" && "ring-2 ring-primary/40 ring-offset-1 ring-offset-background",
        className,
      )}
      style={mark.kind === "mono" ? { backgroundColor: mark.hex } : undefined}
    >
      {mark.kind === "svg" ? (
        <svg viewBox="0 0 24 24" className={s.glyph} aria-hidden="true">
          <path d={mark.path} fill={mark.hex} />
        </svg>
      ) : mark.kind === "mono" ? (
        <span
          className={cn("font-bold leading-none tracking-tight", s.text)}
          style={{ color: mark.dark ? "#1b1b1b" : "#fff" }}
        >
          {mark.text}
        </span>
      ) : (
        (() => {
          const I = ICONS[mark.icon] ?? Wrench;
          return (
            <I className={s.glyph} style={{ color: mark.hex }} strokeWidth={2} aria-hidden="true" />
          );
        })()
      )}
      {state === "done" ? (
        <span
          className={cn(
            "absolute inline-flex items-center justify-center rounded-full bg-emerald-600 text-white ring-2 ring-background",
            s.badge,
          )}
        >
          <Check className="h-[70%] w-[70%]" strokeWidth={3.5} />
        </span>
      ) : null}
    </span>
  );
}
