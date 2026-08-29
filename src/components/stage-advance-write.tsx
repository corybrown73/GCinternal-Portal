import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";

import { advanceImplementationStage } from "@/lib/hub.functions";
import { nextLifecycleStage } from "@/lib/stage-advance-input";
import { LIFECYCLE_STAGE_MAP, type LifecycleStageId } from "@/lib/lifecycle";
import { stageLabel } from "@/lib/hub-format";
import { LAUNCH_GATE_TITLE, type LaunchGate } from "@/lib/launch-gate";

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const areaClass =
  "w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const primaryClass =
  "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

const nullable = (v: string) => (v.trim() === "" ? null : v.trim());

export type TeamOption = { id: string; name: string; role: string };

/**
 * Advance one stage forward. Deferred write: the draft is local until Confirm,
 * and a confirmation step states exactly what will be stored.
 */
export function AdvanceStage({
  customerId,
  implementationId,
  currentStage,
  team,
  gate,
}: {
  customerId: string;
  implementationId: string;
  currentStage: LifecycleStageId | null;
  team: TeamOption[];
  /** Solution acceptance gate for the next stage, when that stage is Launch. */
  gate?: LaunchGate | null;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [enteredBy, setEnteredBy] = useState("");
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();
  const advance = useServerFn(advanceImplementationStage);

  const next = nextLifecycleStage(currentStage);

  const mutation = useMutation({
    mutationFn: () =>
      advance({
        data: {
          implementationId,
          toStage: next!,
          enteredBy: nullable(enteredBy),
          notes: nullable(notes),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
      await queryClient.invalidateQueries({ queryKey: ["home"] });
      setOpen(false);
      setConfirming(false);
      setEnteredBy("");
      setNotes("");
    },
  });

  if (!next) {
    return (
      <p className="text-[11px] text-muted-foreground">
        End of the lifecycle — no further stage to advance to.
      </p>
    );
  }

  const nextStage = LIFECYCLE_STAGE_MAP[next];
  const blocked = gate?.blocked === true;

  // Blocked before the user tries: the move is not offered at all, and the
  // reason plus what is outstanding is stated here.
  if (blocked) {
    return (
      <div className="space-y-1 rounded-sm border border-status-risk bg-status-risk/10 px-2 py-1.5">
        <p className="text-[12px] font-semibold text-status-risk-foreground">{LAUNCH_GATE_TITLE}</p>
        <p className="text-[11px] text-muted-foreground">
          The technical solution must be accepted before this implementation can move to{" "}
          {nextStage.label}. {gate?.reason}
        </p>
        {gate && gate.outstanding.length ? (
          <ul className="space-y-0.5">
            {gate.outstanding.map((o, i) => (
              <li key={i} className="text-[11px] text-foreground">
                • {o}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          Record acceptance on the Solution tab, then this move becomes available.
        </p>
      </div>
    );
  }

  const reset = () => {
    mutation.reset();
    setConfirming(false);
    setEnteredBy("");
    setNotes("");
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={primaryClass}
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          Move to {nextStage.label} <ArrowRight className="h-3 w-3" />
        </button>
        <span className="text-[11px] text-muted-foreground">
          Next stage: {nextStage.label} — {nextStage.intent}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-sm border border-border bg-background p-2">
      <div className="flex flex-wrap items-baseline gap-2 text-[12px]">
        <span className={labelClass}>Move to next stage</span>
        <span className="font-medium">{stageLabel(currentStage ?? "")}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium">{nextStage.label}</span>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <label className="block space-y-0.5">
          <span className={labelClass}>Recorded by (optional)</span>
          <select
            className={inputClass}
            aria-label="Recorded by"
            value={enteredBy}
            disabled={mutation.isPending}
            onChange={(e) => setEnteredBy(e.target.value)}
          >
            <option value="">Not stated</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Transition note (optional)</span>
          <textarea
            className={areaClass}
            aria-label="Transition note"
            rows={2}
            value={notes}
            disabled={mutation.isPending}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </div>

      {confirming ? (
        <div className="rounded-sm border border-dashed border-border bg-muted/40 px-2 py-1.5 text-[11px]">
          Confirm: close {stageLabel(currentStage ?? "")} now, open {nextStage.label} and set it as
          the current stage. This is recorded in stage history and cannot be undone here.
        </div>
      ) : null}

      {mutation.isError ? (
        <p className="text-[11px] text-status-risk-foreground">
          {(mutation.error as Error).message}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        {confirming ? (
          <button
            type="button"
            className={primaryClass}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Moving…" : `Confirm move to ${nextStage.label}`}
          </button>
        ) : (
          <button type="button" className={primaryClass} onClick={() => setConfirming(true)}>
            Move to next stage
          </button>
        )}
        <button
          type="button"
          className={buttonClass}
          disabled={mutation.isPending}
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
