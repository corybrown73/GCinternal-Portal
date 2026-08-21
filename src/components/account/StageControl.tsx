"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STAGES, STAGE_LABELS, type AccountStage } from "@/lib/stages";
import { transitionAccountAction } from "@/app/(app)/actions";

export function StageControl({
  accountId,
  currentStage,
}: {
  accountId: string;
  currentStage: AccountStage;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<AccountStage>(currentStage);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function apply() {
    if (target === currentStage) return;
    setError(null);
    startTransition(async () => {
      try {
        await transitionAccountAction(accountId, target, note.trim() || undefined);
        setNote("");
        router.refresh();
      } catch {
        setError("Couldn't change the stage — try again.");
        setTarget(currentStage);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="stage-select" className="mb-1 block text-xs font-medium text-slate-500">
          Move to stage
        </label>
        <select
          id="stage-select"
          value={target}
          onChange={(e) => setTarget(e.target.value as AccountStage)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1">
        <label htmlFor="stage-note" className="mb-1 block text-xs font-medium text-slate-500">
          Note (optional)
        </label>
        <input
          id="stage-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Kickoff call booked 9/2"
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
        />
      </div>
      <button
        type="button"
        onClick={apply}
        disabled={pending || target === currentStage}
        className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {pending ? "Moving…" : "Move"}
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}
