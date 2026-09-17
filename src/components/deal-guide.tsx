import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, ChevronRight, HelpCircle } from "lucide-react";

import { openPanel } from "@/lib/panel-open";
import type { GuideStep } from "@/lib/deal-guide";
import { setupWarnings } from "@/lib/setup-warnings";
import type { SetupStatus } from "@/lib/setup-status.server";
import { cn } from "@/lib/utils";

/**
 * The deal page, in order.
 *
 * WHY. A page with nine sections is a page where nobody knows what to touch
 * first. This strip says: here is the order, here is what is done, here is
 * the one thing to do next — and clicking a step opens that section and
 * scrolls to it. Every step is computed from the record, so it is never
 * out of date and never ticked by hand.
 *
 * Below the steps, the things that are nobody's step but everybody's
 * problem: an empty assignment pool, AI switched off, a profile with no
 * photo. Each one names the page that fixes it.
 */

export function DealGuide({
  steps,
  setup,
  manager = false,
}: {
  steps: GuideStep[];
  setup?: SetupStatus | null;
  manager?: boolean;
}) {
  const next = steps.find((s) => !s.done) ?? null;
  const done = steps.filter((s) => s.done).length;
  const warnings = setupWarnings(setup, manager);
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Getting started · {done}/{steps.length}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {next ? (
            <p className="text-[12px]">
              <span className="font-semibold">Next:</span> {next.label}
              <span className="text-muted-foreground"> — {next.hint}</span>
            </p>
          ) : (
            <p className="text-[12px] text-emerald-700 dark:text-emerald-400">
              All set. Present the welcome page and start the clock.
            </p>
          )}
          <Link
            to="/how-it-works"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
            title="The whole flow, by role, on one page"
          >
            <HelpCircle className="h-3 w-3" /> How this works
          </Link>
        </div>
      </div>
      <ol className="mt-2 flex flex-wrap gap-1.5">
        {steps.map((s, i) => {
          const isNext = next?.key === s.key;
          return (
            <li key={s.key}>
              <button
                type="button"
                title={s.hint}
                onClick={() => openPanel(s.panel.key, s.panel.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  s.done
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                    : isNext
                      ? "border-primary bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30"
                      : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold",
                    s.done
                      ? "bg-emerald-600 text-white"
                      : isNext
                        ? "bg-primary-foreground text-primary"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {s.done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                </span>
                {s.label}
                {isNext ? <ChevronRight className="h-3 w-3" /> : null}
              </button>
            </li>
          );
        })}
      </ol>
      {next && next.blockers.length ? (
        <p className="mt-2 text-[12px] text-amber-800 dark:text-amber-300">
          <span className="font-semibold">Before the link goes out, the page still needs:</span>{" "}
          {next.blockers.join(" · ")}
        </p>
      ) : null}
      {warnings.length ? (
        <ul className="mt-2 space-y-1 border-t border-border pt-2">
          {warnings.map((w) => (
            <li
              key={w.key}
              className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-amber-800 dark:text-amber-300"
            >
              <AlertTriangle className="relative top-0.5 h-3 w-3 shrink-0" />
              <span>{w.text}</span>
              <Link to={w.to} className="font-medium underline-offset-2 hover:underline">
                {w.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
