import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";

import { addJournalEntry } from "@/lib/hub.functions";
import type { IntakeAnswers } from "@/lib/intake-answers";
import { timelineFor } from "@/lib/onboarding-plan";
import { saveIntake } from "@/lib/presale.functions";
import { cn } from "@/lib/utils";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Adjust plan dates": move one plan milestone by hand and preview the
 * knock-on effect before saving.
 *
 * Reuses the plan engine and save path end to end — nothing here recomputes
 * a date. Picking a milestone and a new date previews `timelineFor()` with
 * that one key added to `intake.timeline.overrides` (the same per-deal
 * override map `KickoffBody`'s "Reschedule" and the transcript-applied
 * proposals already write); every date that preview disagrees with today's
 * is exactly what the plan's own cascade shifted, which is why only
 * subsequent, not-yet-pinned milestones ever move. Saving sends that same
 * patch through `saveIntake` (the existing whole-timeline save every other
 * plan edit on this page already uses) and then a working note through
 * `addJournalEntry` — the account's existing history feed — carrying the
 * reason, so the change and why it was made both read back from mechanisms
 * that already exist.
 *
 * Completed milestones (`doneOn` set) are never offered as the one to move.
 * `buildTimeline()`'s cascade itself now keeps a completed milestone's own
 * `date` at its scheduled value regardless of an upstream shift — see the
 * "done" handling in `onboarding-timeline.ts`'s cascade() — so the filter
 * below is a second, redundant guard against ever listing one as "moved",
 * not the only thing preventing it.
 *
 * The save and the reason cannot come apart: the journal note recording the
 * reason is written before the timeline save, so a failure to record the
 * reason stops the date change before it happens, and a date that did
 * change is always one a reason was successfully recorded for.
 */
export function AdjustPlanDatesPanel({
  dealId,
  implementationId,
  customerId,
  intake,
  closeDate,
  editable,
}: {
  dealId: string;
  implementationId: string;
  customerId: string;
  intake: IntakeAnswers;
  closeDate: string;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const addNote = useServerFn(addJournalEntry);
  const [open, setOpen] = useState(false);
  const [milestoneKey, setMilestoneKey] = useState("");
  const [newDate, setNewDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const current = timelineFor(intake, closeDate);
  const pickable = current.milestones.filter((m) => !m.doneOn);
  const selected = pickable.find((m) => m.key === milestoneKey) ?? null;

  const previewIntake: IntakeAnswers | null =
    selected && ISO_RE.test(newDate) && newDate !== selected.date
      ? {
          ...intake,
          timeline: {
            ...intake.timeline,
            overrides: { ...intake.timeline.overrides, [milestoneKey]: newDate },
          },
        }
      : null;
  const preview = previewIntake ? timelineFor(previewIntake, closeDate) : null;
  const changedRows = preview
    ? current.milestones
        .map((m, i) => ({ m, after: preview!.milestones[i]! }))
        // Completed milestones keep their real date (doneOn) no matter what
        // the engine's own `date` field does under a shift — never shown as
        // moved, which is what "preserve completed milestones" means here.
        .filter(({ m, after }) => !m.doneOn && m.date !== after.date)
    : [];

  const valid =
    editable &&
    Boolean(selected) &&
    ISO_RE.test(newDate) &&
    newDate !== selected?.date &&
    reason.trim() !== "";

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick a milestone to move.");
      const trimmedReason = reason.trim();
      if (!trimmedReason) throw new Error("A reason is required.");
      // The reason is written FIRST. If this fails, the date is never
      // touched below — the one thing this panel must never produce is a
      // moved date with no recorded reason, and the save that follows is
      // the only step that can actually move it.
      await addNote({
        data: {
          implementationId,
          note: `Plan date adjusted: "${selected.label}" moved from ${selected.date} to ${newDate}. Reason: ${trimmedReason}`,
          authorId: null,
          links: null,
          attachmentUrl: null,
          attachmentName: null,
          kind: "note",
        } as never,
      });
      const t = intake.timeline;
      await save({
        data: {
          dealId,
          patch: { timeline: { ...t, overrides: { ...t.overrides, [milestoneKey]: newDate } } },
        } as never,
      });
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["deal", dealId] });
      void qc.invalidateQueries({ queryKey: ["customer360", customerId] });
      setOpen(false);
      setMilestoneKey("");
      setNewDate("");
      setReason("");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not save the change."),
  });

  return (
    <section className="rounded-md border border-border bg-card" aria-label="Adjust plan dates">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-[12px] font-semibold"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground", open && "rotate-90")} />
        Adjust plan dates
      </button>
      {open ? (
        <div className="space-y-2.5 border-t border-border px-4 py-3">
          <p className="text-[11px] text-muted-foreground">
            Covers the initial plan's milestones only — not phase 2 or later service work, which
            follows its own schedule.
          </p>
          {pickable.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              Every remaining milestone is already done.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-[11px] text-muted-foreground">
                  Milestone
                  <select
                    className="mt-0.5 block h-8 min-w-[12rem] rounded-sm border border-border bg-background px-2 text-[12px] text-foreground"
                    value={milestoneKey}
                    disabled={!editable || mutation.isPending}
                    onChange={(e) => {
                      const key = e.target.value;
                      setMilestoneKey(key);
                      setNewDate(pickable.find((p) => p.key === key)?.date ?? "");
                    }}
                  >
                    <option value="">Choose one…</option>
                    {pickable.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label} ({m.date})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] text-muted-foreground">
                  New date
                  <input
                    type="date"
                    className="mt-0.5 block h-8 rounded-sm border border-border bg-background px-2 text-[12px] text-foreground"
                    value={newDate}
                    disabled={!editable || !selected || mutation.isPending}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </label>
              </div>

              <label className="block text-[11px] text-muted-foreground">
                Reason for the change
                <textarea
                  className="mt-0.5 block w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
                  rows={2}
                  maxLength={500}
                  value={reason}
                  disabled={!editable || mutation.isPending}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why this date is moving — the customer asked, a dependency slipped, …"
                />
              </label>

              {selected && newDate === selected.date ? (
                <p className="text-[11px] text-muted-foreground">
                  That's already {selected.label}'s planned date.
                </p>
              ) : null}

              {preview ? (
                <div className="rounded-sm border border-border">
                  <p className="border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {changedRows.length === 0
                      ? "No other dates move"
                      : `${changedRows.length} date${changedRows.length === 1 ? "" : "s"} will move`}
                  </p>
                  {changedRows.length > 0 ? (
                    <ul className="divide-y divide-border">
                      {changedRows.map((r) => (
                        <li
                          key={r.m.key}
                          className="flex items-center justify-between gap-3 px-3 py-1.5 text-[12px]"
                        >
                          <span>{r.m.label}</span>
                          <span className="text-muted-foreground">
                            {r.m.date} <ChevronRight className="inline h-3 w-3" /> {r.after.date}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-8 items-center rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  disabled={!valid || mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending ? "Saving…" : "Save the new date"}
                </button>
                {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
