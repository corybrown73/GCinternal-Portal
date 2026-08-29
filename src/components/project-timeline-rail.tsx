import { Link } from "@tanstack/react-router";

import { PaceChip } from "@/components/record";
// Type-only: erased at build, so this does not close a cycle with the route
// that renders this component.
import type { TabId } from "@/routes/customers.$customerId";
import { fmtDate } from "@/lib/hub-format";
import {
  buildProjectTimeline,
  planTimelineLayout,
  railSummary,
  timelineHeadline,
  type ProjectTimeline,
  type RailStage,
  type TimelineInput,
} from "@/lib/project-timeline";
import { cn } from "@/lib/utils";

/**
 * The top bar, reading the record.
 *
 * Two things were wrong with the old "Implementation Lifecycle" strip and they
 * are fixed here together, because they are one problem:
 *
 *  - It printed the same eight hardcoded stages on every page. A customer's
 *    integration project has five differently-named stages of its own, already
 *    stored per implementation since 0014. `buildProjectTimeline` reads them.
 *  - It showed one project. A customer signs a new logo in June, discovers what
 *    the platform does during implementation and adds an integration in August;
 *    those are two projects on one customer profile, running at once, at
 *    different paces. So the bar stacks a lane per project.
 *
 * Colour comes from `pace.ts` and obeys its rules: nothing tinted for on-pace
 * or unknown, every tint accompanied by its written reason, a missing target
 * read as "no target" rather than quietly passing.
 */

const CHIP_BASE =
  "relative shrink-0 whitespace-nowrap px-2 py-1 font-mono text-[11px] tracking-tight " +
  "border-y border-r first-of-type:border-l first-of-type:rounded-l-sm last-of-type:rounded-r-sm";

function stageChipClass(stage: RailStage, dimmed: boolean) {
  switch (stage.state) {
    case "current":
      return dimmed
        ? "border-border bg-muted text-foreground font-medium"
        : "border-primary bg-primary text-primary-foreground z-10";
    case "past":
      return "border-border bg-muted text-muted-foreground";
    case "skipped":
      return "border-border bg-card text-muted-foreground/70 line-through";
    default:
      return "border-border bg-card text-muted-foreground";
  }
}

function stageTitle(stage: RailStage): string {
  const parts = [`Stage ${stage.position} — ${stage.name}`];
  if (stage.state === "skipped") parts.push("Skipped.");
  else if (stage.state === "current") parts.push("Current stage.");
  else if (stage.state === "past") parts.push("Completed.");
  else parts.push("Not started.");
  if (stage.days !== null) parts.push(`${stage.days}d.`);
  if (stage.target_duration_days) parts.push(`Target ${stage.target_duration_days}d.`);
  if (stage.inferred) parts.push("State inferred at backfill, not observed.");
  return parts.join(" ");
}

/**
 * One project's stages, in order.
 *
 * The old rail clipped at 1187px because eight fixed chips in a `flex` with no
 * scroller simply ran out of room. This scrolls, fades at the edge it is
 * cutting off, and below `md` collapses to the one sentence that matters —
 * "Stage 4 of 8 · Build" — rather than showing a random four of them.
 *
 * The visual rail is `aria-hidden`: `railSummary` is the text alternative and
 * says strictly more (where, on what plan, and why the pace colour), so
 * exposing both would only make a screen reader read the same rail twice.
 */
export function StageRail({
  timeline,
  dimmed = false,
  className,
}: {
  timeline: ProjectTimeline;
  /** A background lane: still legible, but not competing with the active one. */
  dimmed?: boolean;
  className?: string;
}) {
  const isDefault = timeline.source === "lifecycle_default";

  return (
    <div className={cn("min-w-0", className)}>
      <span className="sr-only">{railSummary(timeline)}</span>

      {/* Below md the rail is not readable at any width worth having, so it
          becomes its own summary rather than a clipped fragment of itself. */}
      <p
        aria-hidden
        className={cn(
          "font-mono text-[11px] md:hidden",
          dimmed ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {timelineHeadline(timeline)}
      </p>

      <div className="relative hidden min-w-0 md:block">
        <div
          aria-hidden
          className={cn(
            "flex items-center gap-px overflow-x-auto",
            // A rail drawn from a default is drawn as one: dashed, so it can
            // never be mistaken for a plan somebody chose.
            isDefault && "rounded-sm border border-dashed border-border/70 p-0.5",
          )}
        >
          {timeline.stages.map((stage) => (
            <span
              key={stage.key}
              data-state={stage.state}
              title={stageTitle(stage)}
              className={cn(CHIP_BASE, stageChipClass(stage, dimmed))}
            >
              {stage.name}
              {stage.state === "current" && stage.days !== null ? (
                <span className="ml-1.5 opacity-70">{stage.days}d</span>
              ) : null}
              {stage.inferred ? <span className="ml-1 opacity-60">~</span> : null}
            </span>
          ))}
        </div>
        {/* Fades whatever the scroller is cutting off. Left-aligned chips mean
            an un-overflowed rail ends in empty background, where a
            surface-to-transparent gradient is invisible — so this needs no
            scroll listener to avoid faking an edge that is not there. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent"
        />
      </div>
    </div>
  );
}

/** Says out loud that these stages are a house default, not this project's plan. */
function DefaultStagesNote({ total }: { total: number }) {
  return (
    <span
      className="rounded-sm border border-dashed border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
      title={`No journey has been applied to this project, so the ${total} default implementation stages are shown. They are not a plan anybody chose for it.`}
    >
      Default stages — no plan applied
    </span>
  );
}

function LaneMeta({ timeline }: { timeline: ProjectTimeline }) {
  // Days IN the stage, not `dwell.days` — with a target that field is the
  // signed overage, which would read as "-5d in stage".
  const currentDays = timeline.stages.find((s) => s.state === "current")?.days ?? null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span>
        Started <span className="font-mono">{fmtDate(timeline.startedAt)}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        {timeline.actualLaunchDate ? "Launched" : "Target launch"}
        <PaceChip
          pace={timeline.launch}
          label={fmtDate(timeline.actualLaunchDate ?? timeline.targetLaunchDate)}
          className="font-mono"
        />
      </span>
      {timeline.isComplete ? null : (
        <PaceChip
          pace={timeline.dwell}
          label={currentDays != null ? `${currentDays}d in stage` : "No stage-entry date"}
          className="font-mono"
        />
      )}
      {timeline.source === "lifecycle_default" ? (
        <DefaultStagesNote total={timeline.total} />
      ) : null}
    </div>
  );
}

/**
 * One project's rail with its dates and pace under it, and no lane chrome.
 *
 * This is what a customer with a single project sees, and what the Journey tab
 * shows for the project being viewed: a heading and a switcher over one rail
 * would be furniture.
 */
export function ProjectRail({ project, now }: { project: TimelineInput; now?: Date }) {
  const timeline = buildProjectTimeline(project, now ?? new Date());
  return (
    <div className="min-w-0">
      <StageRail timeline={timeline} />
      <LaneMeta timeline={timeline} />
    </div>
  );
}

/**
 * One project's lane: its name, its own rail, its own dates, its own pace.
 *
 * The user's model is "the individual project kanban board", stacked — so a
 * lane is the whole project at a glance and a click deep-links to it through
 * `?impl=`, which is how every other surface already addresses a project.
 */
function ProjectLane({
  timeline,
  customerId,
  tab,
  isActive,
}: {
  timeline: ProjectTimeline;
  customerId: string;
  tab: TabId;
  isActive: boolean;
}) {
  return (
    <li>
      <Link
        to="/customers/$customerId"
        params={{ customerId }}
        search={{ tab, impl: timeline.id }}
        aria-current={isActive ? "true" : undefined}
        className={cn(
          // No lane background: the rail's fade edge is a surface-coloured
          // gradient, so every lane has to sit on the same surface for it to
          // stay invisible. Emphasis is carried by the border and by the
          // weight of the text instead.
          "block rounded-sm border px-2.5 py-2 transition-colors",
          isActive ? "border-primary/60" : "border-transparent hover:border-border",
          // Finished work stops competing for attention without disappearing.
          timeline.isComplete && !isActive && "opacity-70 hover:opacity-100",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              "text-[12px]",
              isActive ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {timeline.name}
          </span>
          {isActive ? (
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-foreground">
              Viewing
            </span>
          ) : null}
          {timeline.isAddOn ? (
            <span
              className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
              title="Added to an existing implementation rather than started as a new one."
            >
              Add-on
            </span>
          ) : null}
          <span
            className={cn(
              "rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]",
              timeline.isComplete
                ? "border border-border text-muted-foreground"
                : "bg-muted text-foreground",
            )}
          >
            {timeline.isComplete ? "Complete" : "Outstanding"}
          </span>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {timelineHeadline(timeline)}
          </span>
        </div>

        <StageRail timeline={timeline} dimmed={!isActive} className="mt-1.5" />
        <LaneMeta timeline={timeline} />
      </Link>
    </li>
  );
}

export type ProjectTimelinesProps = {
  customerId: string;
  tab: TabId;
  activeId: string;
  /** Every project on this customer, each with its own stages and dates. */
  implementations: TimelineInput[];
  /** Fixed clock, for deterministic rendering in tests. */
  now?: Date;
};

/**
 * Every project this customer runs, as stacked lanes.
 *
 * One project gets no chrome at all — a heading and a disclosure over a single
 * rail would be pure furniture. Two to four all fit. Beyond that the active
 * project and the outstanding work stay on screen and the rest folds into a
 * `<details>`: still one click away, no longer eating the page.
 */
export function ProjectTimelines({
  customerId,
  tab,
  activeId,
  implementations,
  now,
}: ProjectTimelinesProps) {
  if (!implementations.length) return null;

  const timelines = implementations.map((row) => buildProjectTimeline(row, now ?? new Date()));

  // One project: just the rail. Its name, dates and pace are already in the
  // header beside it, so a lane would repeat them into wasted space.
  if (timelines.length === 1) {
    return <ProjectRail project={implementations[0]!} {...(now ? { now } : {})} />;
  }

  const layout = planTimelineLayout(timelines, activeId);
  const summary = `${timelines.length} projects · ${layout.outstandingCount} outstanding${
    layout.completeCount ? ` · ${layout.completeCount} complete` : ""
  }`;

  return (
    <section className="min-w-0" aria-label="Projects on this customer">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Projects
        </h2>
        <span className="text-[11px] text-muted-foreground">{summary}</span>
      </div>

      <ul className="mt-1 space-y-1">
        {layout.visible.map((t) => (
          <ProjectLane
            key={t.id}
            timeline={t}
            customerId={customerId}
            tab={tab}
            isActive={t.id === activeId}
          />
        ))}
      </ul>

      {layout.hidden.length ? (
        <details className="mt-1">
          <summary className="cursor-pointer list-none px-2.5 py-1 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
            {layout.hidden.length} more {layout.hidden.length === 1 ? "project" : "projects"}
            {layout.completeCount ? ` (${layout.completeCount} complete)` : ""}
          </summary>
          <ul className="mt-1 space-y-1">
            {layout.hidden.map((t) => (
              <ProjectLane
                key={t.id}
                timeline={t}
                customerId={customerId}
                tab={tab}
                isActive={t.id === activeId}
              />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
