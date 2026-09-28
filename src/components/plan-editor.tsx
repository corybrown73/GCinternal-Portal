import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ArrowDown, ArrowUp, GripVertical, Plus, RotateCcw, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlanIcon } from "@/components/plan-icon";
import { EMPTY_PLAN_EDITS, type IntakeAnswers, type PlanEdits } from "@/lib/intake-answers";
import { KIND_LABEL, OWNER_LABEL, PLAN_ICONS, defaultIconFor } from "@/lib/plan-icons";
import {
  businessDaysBetween,
  planFor,
  shortDay,
  type MilestoneKind,
  type MilestoneOwner,
  type Timeline,
} from "@/lib/onboarding-timeline";
import { cn } from "@/lib/utils";

/**
 * Edit this account's plan.
 *
 * Every account starts from our standard (Settings → Onboarding plans).
 * This is where the implementation team departs from it for one account:
 * a stage that already happened pre-sale comes off, two stages swap by
 * drag, a call becomes a working session, a step is renamed, given another
 * icon, moved to another day. What is shown is what the customer sees —
 * the welcome page, the invites and the deck read the same plan. Saving
 * stores only the differences from the standard, so a later change to the
 * standard still reaches untouched steps.
 */
type Row = {
  key: string;
  label: string;
  kind: MilestoneKind;
  icon: string;
  owner: MilestoneOwner;
  minutes: number | null;
  detail: string;
  /** YYYY-MM-DD as the plan shows it now. */
  date: string;
  /** The close and the finish line stay where they are. */
  anchor: boolean;
  /** A step this account added: not in the standard. */
  custom: boolean;
};

export function PlanEditor({
  open,
  onClose,
  timeline,
  knobs,
  busy,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  timeline: Timeline;
  knobs: IntakeAnswers["timeline"];
  busy: boolean;
  onSave: (patch: { plan_edits: PlanEdits; overrides: Record<string, string> }) => void;
}) {
  // Our standard for this kind of account: what "reset" returns to, and
  // what the saved edits are measured against.
  const standard = useMemo(
    () =>
      planFor(timeline.path, {
        trainingOnly: timeline.training,
        existingBuild: timeline.existingBuild,
        servicesOnly: timeline.servicesOnly,
      }),
    [timeline.path, timeline.training, timeline.existingBuild, timeline.servicesOnly],
  );
  const standardKeys = useMemo(() => new Set(standard.map((s) => s.key)), [standard]);
  const anchors = useMemo(
    () => new Set([standard[0]?.key, standard[standard.length - 1]?.key].filter(Boolean)),
    [standard],
  );

  const fromTimeline = (): Row[] =>
    timeline.milestones.map((m) => ({
      key: m.key,
      label: m.label,
      kind: m.kind,
      icon: m.icon,
      owner: m.owner,
      minutes: m.minutes ?? null,
      detail: m.detail,
      date: m.date,
      anchor: anchors.has(m.key),
      custom: !standardKeys.has(m.key),
    }));
  const [rows, setRows] = useState<Row[]>(fromTimeline);
  const [seeded, setSeeded] = useState(open);
  // Re-seed from the plan each time the editor opens.
  if (open && !seeded) {
    setRows(fromTimeline());
    setSeeded(true);
  }
  if (!open && seeded) setSeeded(false);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));
  const move = (from: number, to: number) =>
    setRows((rs) => {
      if (from === to || from < 0 || to < 0 || from >= rs.length || to >= rs.length) return rs;
      // The ends are anchors: nothing goes above the close or below the finish.
      const lo = 1;
      const hi = rs.length - 2;
      const target = Math.min(Math.max(to, lo), hi);
      if (rs[from]!.anchor) return rs;
      const next = [...rs];
      const [it] = next.splice(from, 1);
      next.splice(target, 0, it!);
      return next;
    });
  const addStep = () =>
    setRows((rs) => {
      const key = `step-${Math.random().toString(36).slice(2, 8)}`;
      const before = rs[rs.length - 2] ?? rs[0]!;
      const row: Row = {
        key,
        label: "New step",
        kind: "milestone",
        icon: defaultIconFor("milestone"),
        owner: "both",
        minutes: null,
        detail: "",
        date: before.date,
        anchor: false,
        custom: true,
      };
      const next = [...rs];
      next.splice(Math.max(1, rs.length - 1), 0, row);
      return next;
    });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const from = rows.findIndex((r) => r.key === String(e.active.id));
    const to = rows.findIndex((r) => r.key === String(e.over?.id ?? ""));
    if (from >= 0 && to >= 0) move(from, to);
  };

  const save = () => {
    const edits: PlanEdits = { ...EMPTY_PLAN_EDITS, steps: {}, added: [], removed: [] };
    const overrides: Record<string, string> = { ...knobs.overrides };
    const present = new Set(rows.map((r) => r.key));
    edits.removed = standard.map((s) => s.key).filter((k) => !present.has(k) && !anchors.has(k));
    for (const r of rows) {
      if (r.custom) {
        edits.added.push({
          key: r.key,
          label: r.label.trim() || "Step",
          kind: r.kind,
          icon: r.icon,
          owner: r.owner,
          minutes: r.kind === "call" ? (r.minutes ?? 60) : null,
          detail: r.detail.trim(),
          day: Math.max(0, businessDaysBetween(timeline.closeDate, r.date, timeline.holidays)),
        });
        delete overrides[r.key];
        continue;
      }
      const base = standard.find((s) => s.key === r.key)!;
      const step: NonNullable<PlanEdits["steps"][string]> = {};
      if (r.label.trim() !== base.label) step.label = r.label.trim();
      if (r.kind !== base.kind) step.kind = r.kind;
      if (r.icon !== base.icon) step.icon = r.icon;
      if (r.owner !== base.owner) step.owner = r.owner;
      if (r.detail.trim() !== base.detail) step.detail = r.detail.trim();
      if (r.kind === "call" && r.minutes !== null && r.minutes !== (base.minutes ?? null))
        step.minutes = r.minutes;
      if (Object.keys(step).length) edits.steps[r.key] = step;
      // A date changed here is a moved date, like on the plan itself.
      const shown = timeline.milestones.find((m) => m.key === r.key);
      if (shown && r.date !== shown.date) {
        if (r.date === shown.plannedDate) delete overrides[r.key];
        else overrides[r.key] = r.date;
      }
    }
    const standardOrder = [
      ...standard.map((s) => s.key).filter((k) => present.has(k)),
      ...rows.filter((r) => r.custom).map((r) => r.key),
    ];
    const order = rows.map((r) => r.key);
    edits.order = order.join("|") === standardOrder.join("|") ? null : order;
    onSave({ plan_edits: edits, overrides });
    onClose();
  };
  const reset = () => {
    onSave({ plan_edits: EMPTY_PLAN_EDITS, overrides: knobs.overrides });
    onClose();
  };

  const input =
    "h-7 rounded-sm border border-border bg-background px-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60";

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,900px)] max-w-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Edit this account's plan</DialogTitle>
          <DialogDescription className="text-[12px]">
            Starts from our standard. Drag a step to reorder it, take one off that already happened
            pre-sale, change what a step is, its icon, its date or its length. The customer's page,
            the invites and the deck all read this plan. Changes here are for this account only.
          </DialogDescription>
        </DialogHeader>

        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <ol className="divide-y divide-border rounded-md border border-border">
            {rows.map((r, i) => (
              <EditorRow
                key={r.key}
                row={r}
                index={i}
                count={rows.length}
                busy={busy}
                inputClass={input}
                onChange={(patch) => update(r.key, patch)}
                onRemove={() => remove(r.key)}
                onMove={(dir) => move(i, i + dir)}
              />
            ))}
          </ol>
        </DndContext>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[12px] hover:bg-muted"
              onClick={addStep}
              disabled={busy}
            >
              <Plus className="h-3.5 w-3.5" /> Add a step
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[12px] text-muted-foreground hover:bg-muted"
              onClick={reset}
              disabled={busy || !timeline.edited}
              title="Back to our standard plan for this kind of account. Dates you moved by hand stay."
            >
              <RotateCcw className="h-3.5 w-3.5" /> Back to the standard
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-sm border border-border px-3 text-[12px] hover:bg-muted"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              onClick={save}
              disabled={busy || rows.length < 2}
            >
              Save the plan
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditorRow({
  row,
  index,
  count,
  busy,
  inputClass,
  onChange,
  onRemove,
  onMove,
}: {
  row: Row;
  index: number;
  count: number;
  busy: boolean;
  inputClass: string;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const drag = useDraggable({ id: row.key, disabled: row.anchor || busy });
  const drop = useDroppable({ id: row.key, disabled: row.anchor });
  const canMoveUp = !row.anchor && index > 1;
  const canMoveDown = !row.anchor && index < count - 2;
  return (
    <li
      ref={drop.setNodeRef}
      className={cn(
        "space-y-1.5 px-2 py-2",
        drop.isOver && !row.anchor && "bg-primary/5 ring-1 ring-inset ring-primary/40",
        drag.isDragging && "opacity-50",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          ref={drag.setNodeRef}
          {...drag.listeners}
          {...drag.attributes}
          className={cn(
            "flex h-7 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground",
            row.anchor
              ? "cursor-default opacity-30"
              : "cursor-grab hover:bg-muted active:cursor-grabbing",
          )}
          aria-label={row.anchor ? "This step stays where it is" : `Drag ${row.label}`}
          title={
            row.anchor ? "The close and the finish line stay where they are" : "Drag to reorder"
          }
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="flex w-16 shrink-0 flex-col">
          <button
            type="button"
            className="text-muted-foreground disabled:opacity-20"
            aria-label="Move up"
            disabled={!canMoveUp || busy}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="text-muted-foreground disabled:opacity-20"
            aria-label="Move down"
            disabled={!canMoveDown || busy}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </span>
        <label
          className="flex items-center gap-1"
          title="Icon — the one the customer sees on the welcome page and the deck"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <PlanIcon name={row.icon} className="h-4 w-4" />
          </span>
          <select
            className={cn(inputClass, "w-32")}
            aria-label={`${row.label} icon`}
            value={row.icon}
            disabled={busy}
            onChange={(e) => onChange({ icon: e.target.value })}
          >
            {PLAN_ICONS.map((n) => (
              <option key={n} value={n}>
                {n.replace(/([a-z])([A-Z0-9])/g, "$1 $2")}
              </option>
            ))}
          </select>
        </label>
        <input
          className={cn(inputClass, "min-w-[12rem] flex-1 font-medium")}
          aria-label="Step name"
          value={row.label}
          disabled={busy}
          onChange={(e) => onChange({ label: e.target.value })}
        />
        <select
          className={cn(inputClass, "w-36")}
          aria-label={`${row.label} type`}
          value={row.kind}
          disabled={busy || row.anchor}
          onChange={(e) => {
            const kind = e.target.value as MilestoneKind;
            onChange({
              kind,
              minutes: kind === "call" ? (row.minutes ?? 60) : null,
              icon: row.icon === defaultIconFor(row.kind) ? defaultIconFor(kind) : row.icon,
            });
          }}
        >
          {(Object.keys(KIND_LABEL) as MilestoneKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <select
          className={cn(inputClass, "w-28")}
          aria-label={`${row.label} owner`}
          value={row.owner}
          disabled={busy}
          onChange={(e) => onChange({ owner: e.target.value as MilestoneOwner })}
        >
          {(Object.keys(OWNER_LABEL) as MilestoneOwner[]).map((o) => (
            <option key={o} value={o}>
              {OWNER_LABEL[o]}
            </option>
          ))}
        </select>
        <input
          type="date"
          className={cn(inputClass, "w-36")}
          aria-label={`${row.label} date`}
          value={row.date}
          disabled={busy || index === 0}
          onChange={(e) => e.target.value && onChange({ date: e.target.value })}
          title={index === 0 ? "The close date is set on the deal" : shortDay(row.date)}
        />
        {row.kind === "call" ? (
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <input
              type="number"
              min={15}
              max={240}
              step={15}
              className={cn(inputClass, "w-16")}
              aria-label={`${row.label} minutes`}
              value={row.minutes ?? 60}
              disabled={busy}
              onChange={(e) => onChange({ minutes: Number(e.target.value) || 60 })}
            />
            min
          </label>
        ) : null}
        <button
          type="button"
          className="ml-auto text-muted-foreground hover:text-destructive disabled:opacity-20"
          aria-label={`Remove ${row.label}`}
          title={
            row.anchor
              ? "The close and the finish line cannot be removed"
              : "Take this step off this account's plan"
          }
          disabled={busy || row.anchor}
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <input
        className={cn(inputClass, "w-full text-muted-foreground")}
        aria-label={`${row.label} detail`}
        placeholder="One line the customer reads under this step"
        value={row.detail}
        disabled={busy}
        onChange={(e) => onChange({ detail: e.target.value })}
      />
    </li>
  );
}
