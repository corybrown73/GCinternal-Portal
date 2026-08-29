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

import { STAGES, STAGE_LABELS, type AccountStage } from "@/lib/presale-stages";
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

function DealCard({ deal, overlay = false }: { deal: BoardDeal; overlay?: boolean }) {
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
          className={cn(
            days > 14 && deal.stage !== "onboarding_complete" && "text-status-risk-foreground",
          )}
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

function DraggableCard({ deal, canDrag }: { deal: BoardDeal; canDrag: boolean }) {
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
        <DealCard deal={deal} />
      </Link>
    </div>
  );
}

function Column({
  stage,
  deals,
  canDrag,
}: {
  stage: AccountStage;
  deals: BoardDeal[];
  canDrag: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const arrTotal = deals.reduce((sum, d) => sum + (d.arr ?? 0), 0);
  return (
    <div className="flex w-60 flex-none flex-col">
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {STAGE_LABELS[stage]}
          <span className="ml-1.5 text-muted-foreground/60">{deals.length}</span>
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {arrTotal > 0 ? `$${arrTotal.toLocaleString()}` : ""}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-44 flex-1 flex-col gap-1.5 rounded-md border p-1.5 transition-colors",
          isOver ? "border-primary/50 bg-muted" : "border-transparent bg-surface",
        )}
      >
        {deals.map((d) => (
          <DraggableCard key={d.id} deal={d} canDrag={canDrag} />
        ))}
        {deals.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-muted-foreground/60">No deals</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Presale Kanban. Drag is an optimistic stage move; `onMove` performs the real
 * transition (portal_transition_stage via serverFn) and rejects to revert.
 */
export function DealBoard({
  deals: incoming,
  canDrag,
  onMove,
}: {
  deals: BoardDeal[];
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

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            canDrag={canDrag}
            deals={deals.filter((d) => d.stage === stage)}
          />
        ))}
      </div>
      <DragOverlay>{active ? <DealCard deal={active} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
