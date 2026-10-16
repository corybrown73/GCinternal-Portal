import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { localIso } from "@/lib/onboarding-timeline";
import { saveIntake } from "@/lib/presale.functions";
import { correctKickoffHeld } from "@/lib/kickoff-correction.functions";
import { shortDay } from "@/lib/onboarding-timeline";
import { flowLabel } from "@/lib/stage-flow";
import {
  kickoffHeldPatch,
  type KickoffCorrection,
  type KickoffOutcomePrompt,
} from "@/lib/kickoff-held";

/**
 * "Kickoff held": the one explicit confirmation that the kickoff call happened.
 * Shown in the Kickoff focus card and in the transcript panel. Both use this
 * component, so there is one completion action, not two. Confirming saves the
 * same checklist tick through saveIntake; the server then moves the stage
 * through the existing sync. A transcript never confirms it.
 */
export function KickoffHeldConfirm({ prompt }: { prompt: KickoffOutcomePrompt }) {
  const qc = useQueryClient();
  const saveIntakeFn = useServerFn(saveIntake);
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (pending) return;
    const { dealId, intake } = prompt;
    setChecked(true);
    setError(null);
    setPending(true);
    try {
      await saveIntakeFn({
        data: { dealId, patch: { timeline: kickoffHeldPatch(intake, localIso()) } },
      });
      // The real transition already happened server-side inside that save (or
      // it didn't, and the rail stays where it is). Refetch what Current
      // Implementation reads rather than assuming the result.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["deal", dealId] }),
        qc.invalidateQueries({ queryKey: ["welcome", dealId] }),
      ]);
    } catch (e) {
      setChecked(false);
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Kickoff call
      </div>
      <label className="flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          className="mt-0.5 h-3.5 w-3.5"
          checked={checked}
          disabled={pending}
          onChange={() => void confirm()}
        />
        <span>
          <span className="font-medium text-foreground">Kickoff held</span>
          <span className="mt-0.5 block text-[12px] text-muted-foreground">
            Tick this only after the kickoff call has actually happened. Confirming it moves the
            implementation to Get It Working.
          </span>
        </span>
      </label>
      {pending ? <p className="text-[11px] text-muted-foreground">Saving…</p> : null}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

/**
 * Kickoff held, once it is recorded. It stays visible after the deal moves on,
 * so a mistake can be corrected. Unticking it goes through correctKickoffHeld,
 * which decides on the server from the record as it is now and writes the
 * Kickoff record, the stage and the history together.
 *
 *   auto                  unticks at once and returns the deal to Kickoff
 *   confirm_later_work    asks first; later tasks are kept
 *   blocked               a later stage is complete: no tick here, a review is needed
 */
export function KickoffHeldRecord({
  dealId,
  stage,
  completed,
  correction,
  editable,
}: {
  dealId: string;
  /** The deal's stage as the page read it; the server refuses if it has moved. */
  stage: string;
  completed: Record<string, string>;
  correction: KickoffCorrection;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const correctFn = useServerFn(correctKickoffHeld);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (correction.kind === "not_held" || correction.kind === "not_applicable") return null;
  const kind = correction.kind;
  const when = shortDay(correction.date);
  const words =
    kind === "auto"
      ? `Held ${when}. Unticking returns the deal to Kickoff. Nothing else is removed.`
      : kind === "confirm_later_work"
        ? `Held ${when}. Later tasks are already done. Unticking keeps them and returns the deal to Kickoff, after you confirm.`
        : `Held ${when}. ${flowLabel(correction.completedStage)} is already complete, so this cannot be unticked here. Ask for a stage-correction review.`;
  const canUntick = editable && (kind === "auto" || kind === "confirm_later_work");

  const untick = async (confirmLaterWork: boolean) => {
    if (pending || !canUntick) return;
    setPending(true);
    setError(null);
    try {
      await correctFn({
        data: {
          dealId,
          expected: { stage, completed, kind: kind === "auto" ? "auto" : "confirm_later_work" },
          confirmLaterWork,
          note: null,
        },
      });
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not untick Kickoff. Try again.");
    } finally {
      setPending(false);
      // Whatever happened, the page shows what the record now says.
      void Promise.all([
        qc.invalidateQueries({ queryKey: ["deal", dealId] }),
        qc.invalidateQueries({ queryKey: ["welcome", dealId] }),
      ]);
    }
  };

  const onUntick = () => {
    if (kind === "auto") void untick(false);
    else if (kind === "confirm_later_work") setConfirming(true);
  };

  const laterTasks = kind === "confirm_later_work" ? correction.laterTasksDone : 0;

  return (
    <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Kickoff call
      </div>
      <label className="flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          className="mt-0.5 h-3.5 w-3.5"
          checked
          disabled={!canUntick || pending}
          onChange={onUntick}
          aria-describedby="kickoff-held-record-note"
        />
        <span>
          <span className="font-medium text-foreground">Kickoff held</span>
          <span
            id="kickoff-held-record-note"
            className="mt-0.5 block text-[12px] text-muted-foreground"
          >
            {words}
            {!editable && kind !== "blocked" ? " Only a deal editor can change this." : ""}
          </span>
        </span>
      </label>
      {confirming ? (
        <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
          <p className="text-[12px] text-muted-foreground">
            {`Unticking keeps the ${laterTasks} later ${laterTasks === 1 ? "task" : "tasks"} already done, and returns the deal to Kickoff. Nothing else is removed.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
              disabled={pending}
              onClick={() => void untick(true)}
            >
              Untick and return to Kickoff
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-2.5 py-1 text-[12px] disabled:opacity-50"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Keep Kickoff held
            </button>
          </div>
        </div>
      ) : null}
      {pending ? <p className="text-[11px] text-muted-foreground">Saving…</p> : null}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
