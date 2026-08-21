"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { STAGES, STAGE_LABELS, STAGE_STYLES, type AccountStage } from "@/lib/stages";
import type { Account } from "@/lib/types";
import { transitionAccountAction } from "@/app/(app)/actions";

function daysIn(since: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86400000));
}

function Card({ account, overlay = false }: { account: Account; overlay?: boolean }) {
  const days = daysIn(account.stage_entered_at);
  return (
    <div
      className={`rounded-md border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900 ${
        overlay ? "rotate-2 shadow-lg" : ""
      }`}
    >
      <div className="font-medium">{account.name}</div>
      <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{account.arr ? `$${Number(account.arr).toLocaleString()} ARR` : "—"}</span>
        <span title="Days in stage">{days}d</span>
      </div>
    </div>
  );
}

function DraggableCard({ account }: { account: Account }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: account.id,
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={isDragging ? "opacity-30" : ""}>
      <Link
        href={`/accounts/${account.id}`}
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
        className="block"
        draggable={false}
      >
        <Card account={account} />
      </Link>
    </div>
  );
}

function Column({ stage, accounts }: { stage: AccountStage; accounts: Account[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div className="flex w-64 flex-none flex-col">
      <div
        className={`mb-2 border-t-4 ${STAGE_STYLES[stage].column} rounded-t bg-white px-3 py-2 text-sm font-semibold shadow-sm dark:bg-slate-900`}
      >
        {STAGE_LABELS[stage]}
        <span className="ml-2 text-xs font-normal text-slate-400">{accounts.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-40 flex-1 flex-col gap-2 rounded-md p-2 transition-colors ${
          isOver ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-slate-100/60 dark:bg-slate-900/40"
        }`}
      >
        {accounts.map((a) => (
          <DraggableCard key={a.id} account={a} />
        ))}
        {accounts.length === 0 && (
          <div className="py-6 text-center text-xs text-slate-400">No accounts</div>
        )}
      </div>
    </div>
  );
}

export function Board({ accounts: initial }: { accounts: Account[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [accounts, setAccounts] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const accountId = String(e.active.id);
    const target = e.over?.id ? (String(e.over.id) as AccountStage) : null;
    if (!target) return;
    const account = accounts.find((a) => a.id === accountId);
    if (!account || account.stage === target) return;

    // Optimistic move; the server action records the transition + history.
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === accountId
          ? { ...a, stage: target, stage_entered_at: new Date().toISOString() }
          : a
      )
    );
    startTransition(async () => {
      try {
        await transitionAccountAction(accountId, target);
        router.refresh();
      } catch {
        setAccounts((prev) =>
          prev.map((a) => (a.id === accountId ? { ...a, stage: account.stage } : a))
        );
      }
    });
  }

  const active = activeId ? accounts.find((a) => a.id === activeId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            accounts={accounts.filter((a) => a.stage === stage)}
          />
        ))}
      </div>
      <DragOverlay>{active ? <Card account={active} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
