import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import type { AccountStage } from "@/lib/presale-stages";
import {
  BUILTIN_PIPELINE_STAGES,
  STAGE_COLOR_DOT_CLASS,
  terminalStage,
  type PipelineStage,
} from "@/lib/pipeline-stages";
import type { Account } from "@/lib/presale-types";
import { cn } from "@/lib/utils";

export type BoardDeal = Account & { am_owner_name: string | null };

function daysIn(since: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86400000));
}

function fmtArr(arr: number | null): string {
  if (arr == null) return "—";
  return `$${Number(arr).toLocaleString()}`;
}

function DealCard({
  deal,
  terminalKey,
  overlay = false,
}: {
  deal: BoardDeal;
  /** Days-in-stage stops being a warning once the deal is at the end. Which
   *  stage that is comes from the configuration, not from a literal. */
  terminalKey: string;
  overlay?: boolean;
}) {
  const days = daysIn(deal.stage_entered_at);
  return (
    <div
      className={cn(
        "rounded-sm border border-border bg-card px-2.5 py-2",
        overlay ? "rotate-1 shadow-md" : "hover:bg-muted/60",
      )}
    >
      <p className="truncate text-[13px] font-medium leading-snug">{deal.name}</p>
      <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
        <span>{fmtArr(deal.arr)}</span>
        <span
          title="Days in stage"
          className={cn(days > 14 && deal.stage !== terminalKey && "text-status-risk-foreground")}
        >
          {days}d
        </span>
      </div>
      {deal.am_owner_name ? (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">{deal.am_owner_name}</p>
      ) : null}
    </div>
  );
}

function DraggableCard({
  deal,
  canDrag,
  terminalKey,
}: {
  deal: BoardDeal;
  canDrag: boolean;
  terminalKey: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
    disabled: !canDrag,
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={isDragging ? "opacity-30" : ""}>
      <Link
        to="/deals/$dealId"
        params={{ dealId: deal.id }}
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
        className="block"
        draggable={false}
      >
        <DealCard deal={deal} terminalKey={terminalKey} />
      </Link>
    </div>
  );
}

function ColumnHeading({
  label,
  count,
  arrTotal,
  dotClass,
  note,
}: {
  label: string;
  count: number;
  arrTotal: number;
  dotClass: string | null;
  note?: string | undefined;
}) {
  return (
    <div className="mb-1.5 px-1">
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {dotClass ? (
            <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
          ) : null}
          {label}
          <span className="text-muted-foreground/60">{count}</span>
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {arrTotal > 0 ? `$${arrTotal.toLocaleString()}` : ""}
        </span>
      </div>
      {note ? <p className="mt-0.5 text-[10px] text-muted-foreground/60">{note}</p> : null}
    </div>
  );
}

function Column({
  stage,
  deals,
  canDrag,
  terminalKey,
}: {
  stage: PipelineStage;
  deals: BoardDeal[];
  canDrag: boolean;
  terminalKey: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key, disabled: !stage.enterable });
  const arrTotal = deals.reduce((sum, d) => sum + (d.arr ?? 0), 0);
  return (
    <div className="flex w-60 flex-none flex-col">
      <ColumnHeading
        label={stage.label}
        count={deals.length}
        arrTotal={arrTotal}
        dotClass={STAGE_COLOR_DOT_CLASS[stage.color]}
        // Honest rather than hidden: until the stage key is an account stage in
        // the database, nothing can be dragged in here. See
        // docs/design/presale-stages.md.
        note={stage.enterable ? undefined : "Configured, not yet in use"}
      />
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-44 flex-1 flex-col gap-1.5 rounded-md border p-1.5 transition-colors",
          isOver ? "border-primary/50 bg-muted" : "border-transparent bg-surface",
          !stage.enterable && "border-dashed border-border/70 bg-transparent",
        )}
      >
        {deals.map((d) => (
          <DraggableCard key={d.id} deal={d} canDrag={canDrag} terminalKey={terminalKey} />
        ))}
        {deals.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-muted-foreground/60">No deals</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Deals whose stage is not in the configured pipeline. It should be empty —
 * 0028 refuses to delete a stage accounts sit in — but a board that silently
 * dropped a deal would hide exactly the case somebody needs to see.
 */
function OrphanColumn({ stageKey, deals }: { stageKey: string; deals: BoardDeal[] }) {
  return (
    <div className="flex w-60 flex-none flex-col">
      <ColumnHeading
        label={stageKey}
        count={deals.length}
        arrTotal={deals.reduce((sum, d) => sum + (d.arr ?? 0), 0)}
        dotClass={null}
        note="Not in the configured pipeline"
      />
      <div className="flex min-h-44 flex-1 flex-col gap-1.5 rounded-md border border-dashed border-status-risk-foreground/40 p-1.5">
        {deals.map((d) => (
          <DraggableCard key={d.id} deal={d} canDrag={false} terminalKey="" />
        ))}
      </div>
    </div>
  );
}

/**
 * Presale Kanban. Drag is an optimistic stage move; `onMove` performs the real
 * transition (portal_transition_stage via serverFn) and rejects to revert.
 *
 * The columns come from the CONFIGURED pipeline
 * (docs/design/presale-stages.md), not from the enum's declaration order. The
 * default is the enum, so an unconfigured deployment renders the board it
 * always did.
 */
export function DealBoard({
  deals: incoming,
  stages = BUILTIN_PIPELINE_STAGES,
  canDrag,
  onMove,
}: {
  deals: BoardDeal[];
  stages?: readonly PipelineStage[];
  canDrag: boolean;
  onMove: (dealId: string, toStage: AccountStage) => Promise<unknown>;
}) {
  const [deals, setDeals] = useState(incoming);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Server truth replaces the optimistic board whenever the query refreshes.
  useEffect(() => setDeals(incoming), [incoming]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const dealId = String(e.active.id);
    const target = e.over?.id ? (String(e.over.id) as AccountStage) : null;
    if (!target) return;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === target) return;

    const previousStage = deal.stage;
    setDeals((prev) =>
      prev.map((d) =>
        d.id === dealId ? { ...d, stage: target, stage_entered_at: new Date().toISOString() } : d,
      ),
    );
    onMove(dealId, target).catch(() => {
      setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: previousStage } : d)));
    });
  }

  const active = activeId ? deals.find((d) => d.id === activeId) : null;
  const terminalKey = terminalStage(stages).key;

  const known = new Set(stages.map((s) => s.key));
  const orphanKeys = [...new Set(deals.map((d) => d.stage).filter((k) => !known.has(k)))];

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <Column
            key={stage.key}
            stage={stage}
            canDrag={canDrag}
            terminalKey={terminalKey}
            deals={deals.filter((d) => d.stage === stage.key)}
          />
        ))}
        {orphanKeys.map((key) => (
          <OrphanColumn key={key} stageKey={key} deals={deals.filter((d) => d.stage === key)} />
        ))}
      </div>
      <DragOverlay>
        {active ? <DealCard deal={active} terminalKey={terminalKey} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
