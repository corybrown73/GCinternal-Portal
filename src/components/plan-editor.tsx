import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ArrowDownUp, GripVertical, Lock, Plus, RotateCcw, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlanIcon } from "@/components/plan-icon";
import { ask } from "@/components/ui/ask";
import { EMPTY_PLAN_EDITS, type IntakeAnswers, type PlanEdits } from "@/lib/intake-answers";
import {
  KIND_LABEL,
  OWNER_LABEL,
  PLAN_ICON_LABEL,
  PLAN_ICONS,
  defaultIconFor,
  type PlanIconName,
} from "@/lib/plan-icons";
import {
  addBusinessDays,
  businessDaysBetween,
  planFor,
  shortDay,
  type Milestone,
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
  /** The last day of a span (work between calls), YYYY-MM-DD; "" when it is one day. */
  end: string;
  /** Business days after the close the plan places this step on (its DAY label). */
  day: number;
  /** "HH:MM" for a call, when booked. */
  time: string;
  /** For a step that can be reshaped; false when the step comes from the SOW and only its dates move. */
  shape: boolean;
  /** The close and the finish line stay where they are. */
  anchor: boolean;
  /** A step this account added: not in the standard. */
  custom: boolean;
};

export type PlanEditorTarget = {
  /** "full": the account's own steps — reshape, reorder, add, remove. "dates": steps from the SOW — dates and times only. */
  mode: "full" | "dates";
  title: string;
  steps: Milestone[];
};

export function PlanEditor({
  open,
  onClose,
  timeline,
  knobs,
  busy,
  target,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  timeline: Timeline;
  knobs: IntakeAnswers["timeline"];
  busy: boolean;
  /** What is being edited; phase 1 in full when absent. */
  target?: PlanEditorTarget | null;
  onSave: (patch: {
    plan_edits?: PlanEdits;
    overrides: Record<string, string>;
    times: Record<string, string>;
    timezone: string | null;
  }) => void;
}) {
  const mode = target?.mode ?? "full";
  const source = target?.steps ?? timeline.milestones;
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
    source.map((m) => ({
      key: m.key,
      label: m.label,
      kind: m.kind,
      icon: m.icon,
      owner: m.owner,
      minutes: m.minutes ?? null,
      detail: m.detail,
      date: m.date,
      // The span's end, as a date: the plan's through-day counted from its start.
      end:
        m.throughDay && m.throughDay > m.day
          ? addBusinessDays(m.date, m.throughDay - m.day, timeline.holidays)
          : "",
      day: m.day,
      time: m.time ?? "",
      anchor: mode === "full" && anchors.has(m.key),
      custom: mode === "full" && !standardKeys.has(m.key),
      shape: mode === "full",
    }));
  const [rows, setRows] = useState<Row[]>(fromTimeline);
  const [initial, setInitial] = useState<string>(() => JSON.stringify(fromTimeline()));
  const [seeded, setSeeded] = useState(open);
  // Re-seed from the plan each time the editor opens.
  if (open && !seeded) {
    const fresh = fromTimeline();
    setRows(fresh);
    setInitial(JSON.stringify(fresh));
    setSeeded(true);
  }
  if (!open && seeded) setSeeded(false);
  const dirty = JSON.stringify(rows) !== initial;
  // Cancel, the ✕, Esc and a click on the backdrop all come through here:
  // a clean form closes at once, a changed one asks first.
  const requestClose = async () => {
    if (!dirty) {
      onClose();
      return;
    }
    const discard = await ask({
      title: "Discard your changes to this plan?",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      destructive: true,
    });
    if (discard) onClose();
  };

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
  // A new step is the common case — a call — on the business day after the
  // step before the finish, and the cursor lands in its name.
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const addStep = () => {
    const key = `step-${Math.random().toString(36).slice(2, 8)}`;
    setRows((rs) => {
      const before = rs[rs.length - 2] ?? rs[0]!;
      const date = addBusinessDays(before.end || before.date, 1, timeline.holidays);
      const row: Row = {
        key,
        label: "New step",
        kind: "call",
        icon: defaultIconFor("call"),
        owner: "both",
        minutes: 60,
        detail: "",
        date,
        end: "",
        day: before.day + 1,
        time: "",
        anchor: false,
        custom: true,
        shape: true,
      };
      const next = [...rs];
      next.splice(Math.max(1, rs.length - 1), 0, row);
      return next;
    });
    setJustAdded(key);
  };
  useEffect(() => {
    if (!justAdded) return;
    const el = document.querySelector<HTMLElement>(`[data-row="${justAdded}"]`);
    const name = el?.querySelector<HTMLTextAreaElement>("textarea[name=label]");
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    name?.focus();
    name?.select();
    const t = setTimeout(() => setJustAdded(null), 1600);
    return () => clearTimeout(t);
  }, [justAdded]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const from = rows.findIndex((r) => r.key === String(e.active.id));
    const to = rows.findIndex((r) => r.key === String(e.over?.id ?? ""));
    if (from >= 0 && to >= 0) move(from, to);
  };

  const save = () => {
    const overrides: Record<string, string> = { ...knobs.overrides };
    const times: Record<string, string> = { ...knobs.times };
    const timezone =
      knobs.timezone ??
      (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null) ??
      null;
    // Call times travel with the dates: one save, one place.
    for (const r of rows) {
      if (r.kind === "call" && r.time) times[r.key] = r.time;
      else delete times[r.key];
    }
    if (mode === "dates") {
      for (const r of rows) {
        const shown = source.find((m) => m.key === r.key);
        if (shown && r.date !== shown.date) {
          if (r.date === shown.plannedDate) delete overrides[r.key];
          else overrides[r.key] = r.date;
        }
      }
      onSave({ overrides, times, timezone });
      onClose();
      return;
    }
    const edits: PlanEdits = { ...EMPTY_PLAN_EDITS, steps: {}, added: [], removed: [] };
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
          ...(r.kind === "build" && r.end && r.end > r.date
            ? {
                throughDay: Math.max(
                  0,
                  businessDaysBetween(timeline.closeDate, r.end, timeline.holidays),
                ),
              }
            : {}),
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
      // The span's end, as the plan counts it: the start's day plus the
      // business days from the start to the end date.
      const through =
        r.kind === "build" && r.end && r.end > r.date
          ? r.day + businessDaysBetween(r.date, r.end, timeline.holidays)
          : null;
      if ((through ?? null) !== (base.throughDay ?? null)) step.throughDay = through;
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
    onSave({ plan_edits: edits, overrides, times, timezone });
    onClose();
  };
  const reset = () => {
    onSave({
      plan_edits: EMPTY_PLAN_EDITS,
      overrides: knobs.overrides,
      times: knobs.times,
      timezone: knobs.timezone,
    });
    onClose();
  };

  const input =
    "h-7 rounded-sm border border-border bg-background px-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60";

  // Dates out of order are shown, not swallowed: a Stage 2 before Stage 1
  // gets an amber line on its row and a one-click sort. Only a date before
  // the close — before the plan exists — stops the save.
  const warnings = rows.map((r, i) =>
    r.kind === "build" && r.end && r.end < r.date
      ? "The end is before the start."
      : i > 0 && r.date < rows[i - 1]!.date
        ? "This is before the step above it."
        : null,
  );
  const endBeforeStart = rows.some((r) => r.kind === "build" && r.end && r.end < r.date);
  const outOfOrder = warnings.some(Boolean);
  const beforeClose = rows.filter((r, i) => i > 0 && r.date < timeline.closeDate);
  const sortByDate = () =>
    setRows((rs) => {
      const first = rs[0]!;
      const last = rs[rs.length - 1]!;
      const middle = rs
        .slice(1, -1)
        .map((r, i) => ({ r, i }))
        .sort((a, b) => a.r.date.localeCompare(b.r.date) || a.i - b.i)
        .map((x) => x.r);
      return [first, ...middle, last];
    });

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : void requestClose())}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,900px)] max-w-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {mode === "dates" ? `Edit dates · ${target?.title ?? ""}` : "Edit this account's plan"}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {mode === "dates"
              ? "Steps come from the SOW — dates and call times only. The customer's page and the invites follow."
              : "Starts from our standard. Drag a step to reorder it, take one off that already happened pre-sale, change what a step is, its icon, its date, time or length. The customer's page, the invites and the deck all read this plan. Changes here are for this account only."}
          </DialogDescription>
        </DialogHeader>

        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="rounded-md border border-border">
            {/* The header names the columns the rows line up under. Hidden on a
                phone, where each row stacks its own labelled fields. */}
            <div
              className={cn(
                ROW_GRID,
                "sticky top-0 z-10 hidden rounded-t-md border-b border-border bg-muted/60 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid",
              )}
              aria-hidden
            >
              <span />
              <span>Step</span>
              <span>Type</span>
              <span>Who</span>
              <span className="grid grid-cols-[7.5rem_5.5rem_3.5rem] gap-1.5">
                <span>Date</span>
                <span>Time</span>
                <span>Minutes</span>
              </span>
              <span />
              <span />
            </div>
            <ol className="divide-y divide-border">
              {rows.map((r, i) => (
                <EditorRow
                  key={r.key}
                  row={r}
                  index={i}
                  count={rows.length}
                  busy={busy}
                  inputClass={input}
                  flash={r.key === justAdded}
                  warning={
                    r.date < timeline.closeDate && i > 0
                      ? `Before the close date, ${shortDay(timeline.closeDate)} — the plan cannot start before it.`
                      : (warnings[i] ?? null)
                  }
                  onChange={(patch) => update(r.key, patch)}
                  onRemove={() => remove(r.key)}
                  onMove={(dir) => move(i, i + dir)}
                />
              ))}
            </ol>
          </div>
        </DndContext>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {mode === "full" ? (
              <>
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
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {outOfOrder ? (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-amber-500/50 bg-amber-500/10 px-3 text-[12px] text-amber-800 hover:bg-amber-500/20 dark:text-amber-300"
                onClick={sortByDate}
                disabled={busy}
                title="Put the steps in date order; the close and the finish stay at the ends"
              >
                <ArrowDownUp className="h-3.5 w-3.5" /> Sort by date
              </button>
            ) : null}
            {beforeClose.length ? (
              <span className="text-[11px] text-destructive">
                {beforeClose.length === 1 ? "A step is" : `${beforeClose.length} steps are`} before
                the close date.
              </span>
            ) : null}
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-sm border border-border px-3 text-[12px] hover:bg-muted"
              onClick={() => void requestClose()}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              onClick={save}
              disabled={busy || rows.length < 2 || beforeClose.length > 0 || endBeforeStart}
              title={
                beforeClose.length
                  ? "Move the steps that fall before the close date first"
                  : endBeforeStart
                    ? "An end date is before its start"
                    : undefined
              }
            >
              Save the plan
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One grid for the header and every row, so the columns line up:
 * handle · step · type · who · date/time/minutes · icon · remove.
 * On a phone the row stacks into one column with its own labels.
 */
const ROW_GRID =
  "grid grid-cols-1 gap-1.5 sm:grid-cols-[1.5rem_minmax(11rem,1fr)_8.25rem_7rem_17.5rem_2rem_1.75rem] sm:items-start";

function EditorRow({
  row,
  index,
  count,
  busy,
  inputClass,
  warning,
  flash,
  onChange,
  onRemove,
  onMove,
}: {
  row: Row;
  index: number;
  count: number;
  busy: boolean;
  inputClass: string;
  /** Why this row's date looks wrong, when it does. */
  warning: string | null;
  /** Just added: lit for a moment so the eye finds it. */
  flash: boolean;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const drag = useDraggable({ id: row.key, disabled: row.anchor || busy || !row.shape });
  const drop = useDroppable({ id: row.key, disabled: row.anchor || !row.shape });
  const canMoveUp = row.shape && !row.anchor && index > 1;
  const canMoveDown = row.shape && !row.anchor && index < count - 2;
  const [picking, setPicking] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!picking) return;
    const close = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPicking(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [picking]);
  const cell = "flex flex-col gap-0.5";
  const mobileLabel = "text-[10px] uppercase tracking-wider text-muted-foreground sm:hidden";
  return (
    <li
      ref={drop.setNodeRef}
      data-row={row.key}
      className={cn(
        ROW_GRID,
        "px-2 py-2 transition-colors",
        drop.isOver && !row.anchor && "bg-primary/5 ring-1 ring-inset ring-primary/40",
        drag.isDragging && "opacity-50",
        warning && "bg-amber-500/5",
        flash && "bg-primary/10",
      )}
      // Alt+↑/↓ on a focused row moves it: the keyboard's drag.
      onKeyDown={(e) => {
        if (!e.altKey) return;
        if (e.key === "ArrowUp" && canMoveUp) {
          e.preventDefault();
          onMove(-1);
        } else if (e.key === "ArrowDown" && canMoveDown) {
          e.preventDefault();
          onMove(1);
        }
      }}
    >
      {/* Handle, or the lock on the two fixed rows. */}
      {row.anchor ? (
        <span
          className="hidden items-center gap-1 self-center text-muted-foreground sm:flex"
          title="Every plan starts and ends here."
        >
          <Lock className="h-3.5 w-3.5" aria-hidden />
        </span>
      ) : (
        <button
          type="button"
          ref={drag.setNodeRef}
          {...drag.listeners}
          {...drag.attributes}
          className={cn(
            "hidden h-7 w-6 items-center justify-center self-center rounded-sm text-muted-foreground sm:flex",
            row.shape
              ? "cursor-grab hover:bg-muted active:cursor-grabbing"
              : "cursor-default opacity-30",
          )}
          aria-label={`Drag ${row.label} (or Alt+↑/↓ with the row focused)`}
          title={
            row.shape
              ? "Drag to reorder · Alt+↑/↓ on the keyboard"
              : "Steps from the SOW keep their order"
          }
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      {/* Step name — the widest, first. Wraps to a second line. */}
      <div className={cell}>
        <span className={mobileLabel}>Step</span>
        <div className="flex items-start gap-1.5">
          {row.anchor ? (
            <span
              className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-sm border border-border bg-muted px-1.5 py-px text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
              title="Every plan starts and ends here."
            >
              <Lock className="h-2.5 w-2.5 sm:hidden" aria-hidden /> Fixed
            </span>
          ) : null}
          <textarea
            name="label"
            rows={1}
            className={cn(
              inputClass,
              "h-auto min-h-7 w-full resize-none py-1 font-medium leading-5 [field-sizing:content]",
            )}
            aria-label="Step name"
            value={row.label}
            disabled={busy || !row.shape}
            onChange={(e) => onChange({ label: e.target.value.replace(/\n/g, " ") })}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
        </div>
      </div>

      {/* Type */}
      <div className={cell}>
        <span className={mobileLabel}>Type</span>
        <select
          className={cn(inputClass, "w-full")}
          aria-label={`${row.label} type`}
          value={row.kind}
          disabled={busy || row.anchor || !row.shape}
          onChange={(e) => {
            const kind = e.target.value as MilestoneKind;
            onChange({
              kind,
              minutes: kind === "call" ? (row.minutes ?? 60) : null,
              end: kind === "build" ? row.end : "",
              // The icon follows the type unless somebody chose one on purpose.
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
      </div>

      {/* Who */}
      <div className={cell}>
        <span className={mobileLabel}>Who</span>
        <select
          className={cn(inputClass, "w-full")}
          aria-label={`${row.label} owner`}
          value={row.owner}
          disabled={busy || !row.shape}
          onChange={(e) => onChange({ owner: e.target.value as MilestoneOwner })}
        >
          {(Object.keys(OWNER_LABEL) as MilestoneOwner[]).map((o) => (
            <option key={o} value={o}>
              {OWNER_LABEL[o]}
            </option>
          ))}
        </select>
      </div>

      {/* Date · Time · Minutes — the same three cells on every row, so the
          columns stay aligned; a step that is not a call leaves the last
          two empty, and work between calls uses them for its end date. */}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[7.5rem_5.5rem_3.5rem]">
        <div className={cell}>
          <span className={mobileLabel}>{row.kind === "build" ? "Start" : "Date"}</span>
          <input
            type="date"
            className={cn(inputClass, "w-full")}
            aria-label={row.kind === "build" ? `${row.label} start` : `${row.label} date`}
            value={row.date}
            disabled={busy || index === 0}
            onChange={(e) => e.target.value && onChange({ date: e.target.value })}
            title={index === 0 ? "The close date is set on the deal" : shortDay(row.date)}
          />
        </div>
        {row.kind === "call" ? (
          <>
            <div className={cell}>
              <span className={mobileLabel}>Time</span>
              <input
                type="time"
                className={cn(inputClass, "w-full")}
                aria-label={`${row.label} time`}
                value={row.time}
                disabled={busy}
                onChange={(e) => onChange({ time: e.target.value })}
                title="The call's time, in the customer's zone (Plan settings)"
              />
            </div>
            <div className={cell}>
              <span className={mobileLabel}>Minutes</span>
              <input
                type="number"
                min={15}
                max={240}
                step={15}
                className={cn(inputClass, "w-full")}
                aria-label={`${row.label} minutes`}
                value={row.minutes ?? 60}
                disabled={busy || !row.shape}
                onChange={(e) => onChange({ minutes: Number(e.target.value) || 60 })}
              />
            </div>
          </>
        ) : row.kind === "build" ? (
          <div className={cn(cell, "sm:col-span-2")}>
            <span className={mobileLabel}>End</span>
            <input
              type="date"
              className={cn(
                inputClass,
                "w-full",
                row.end && row.end < row.date && "border-destructive",
              )}
              aria-label={`${row.label} end`}
              value={row.end}
              min={row.date}
              disabled={busy}
              onChange={(e) => onChange({ end: e.target.value })}
              title="The last day of the work between calls"
            />
          </div>
        ) : (
          <span className="hidden sm:col-span-2 sm:block" aria-hidden />
        )}
      </div>

      {/* Icon: a small button; the grid opens on click. Defaults follow the type. */}
      <div ref={pickerRef} className="relative self-center">
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40"
          aria-label={`Icon: ${PLAN_ICON_LABEL[row.icon as PlanIconName] ?? row.icon}. Change`}
          title={`Icon — ${PLAN_ICON_LABEL[row.icon as PlanIconName] ?? row.icon}. The customer sees it on the welcome page and the deck.`}
          disabled={busy || !row.shape}
          onClick={() => setPicking((v) => !v)}
        >
          <PlanIcon name={row.icon} className="h-4 w-4" />
        </button>
        {picking ? (
          <div
            role="listbox"
            aria-label="Icon"
            className="absolute right-0 top-8 z-20 grid w-[13.5rem] grid-cols-6 gap-1 rounded-md border border-border bg-card p-1.5 shadow-lg"
          >
            {PLAN_ICONS.map((n) => (
              <button
                key={n}
                type="button"
                role="option"
                aria-selected={n === row.icon}
                title={PLAN_ICON_LABEL[n]}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted",
                  n === row.icon && "bg-primary/10 text-primary ring-1 ring-primary/40",
                )}
                onClick={() => {
                  onChange({ icon: n });
                  setPicking(false);
                }}
              >
                <PlanIcon name={n} className="h-4 w-4" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Remove */}
      <button
        type="button"
        className="self-center justify-self-end text-muted-foreground hover:text-destructive disabled:opacity-20"
        aria-label={`Remove ${row.label}`}
        title={
          row.anchor
            ? "Every plan starts and ends here."
            : row.shape
              ? "Take this step off this account's plan"
              : "Steps from the SOW stay"
        }
        disabled={busy || row.anchor || !row.shape}
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </button>

      {warning ? (
        <p role="alert" className="text-[11px] text-amber-800 dark:text-amber-300 sm:col-span-7">
          {warning}
        </p>
      ) : null}
      {row.shape ? (
        <input
          className={cn(inputClass, "w-full text-muted-foreground sm:col-span-7")}
          aria-label={`${row.label} detail`}
          placeholder="One line the customer reads under this step"
          value={row.detail}
          disabled={busy}
          onChange={(e) => onChange({ detail: e.target.value })}
        />
      ) : null}
    </li>
  );
}
