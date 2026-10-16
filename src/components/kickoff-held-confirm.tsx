import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { localIso } from "@/lib/onboarding-timeline";
import { saveIntake } from "@/lib/presale.functions";
import { kickoffHeldPatch, type KickoffOutcomePrompt } from "@/lib/kickoff-held";

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
