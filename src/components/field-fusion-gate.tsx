import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Send } from "lucide-react";

import { Panel } from "@/components/record";
import { When } from "@/components/when";
import { getDealAssignment } from "@/lib/assignment.functions";
import type { DealData } from "@/lib/deal-query";
import { FIELD_FUSION_STAGE, fieldFusionChecklist, fieldFusionReady } from "@/lib/field-fusion";
import { handToImplementationFn } from "@/lib/field-fusion.functions";
import { readIntake } from "@/lib/intake-answers";
import { saveIntake } from "@/lib/presale.functions";
import { cn } from "@/lib/utils";

/**
 * The Field Fusion gate, on the deal.
 *
 * Shown only on a Field Fusion account, from the close until the handoff.
 * Two ticks, a note, one button. The button moves the deal to Onboarding
 * Kickoff and sends implementation the use case and goals from the calls
 * plus the note — the training call is theirs from there.
 */
export function FieldFusionGate({ deal, editable }: { deal: DealData; editable: boolean }) {
  const intake = readIntake(deal.account.intake);
  const ff = intake.field_fusion;
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const hand = useServerFn(handToImplementationFn);
  const assignment = useQuery({
    queryKey: ["assignment", deal.account.id],
    queryFn: () => getDealAssignment({ data: { dealId: deal.account.id } }),
  });
  const [notes, setNotes] = useState(ff.notes);
  useEffect(() => setNotes(ff.notes), [ff.notes]);
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const patch = useMutation({
    mutationFn: (p: Record<string, unknown>) =>
      save({ data: { dealId: deal.account.id, patch: { field_fusion: p } } as never }),
    onMutate: () => setError(null),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] }),
    onError: (e) => setError((e as Error).message),
  });
  const handoff = useMutation({
    mutationFn: () => hand({ data: { dealId: deal.account.id, teamMemberId: pick || null } }),
    onMutate: () => setError(null),
    onSuccess: (r) => {
      setDone(
        r.assigneeName
          ? `Handed to ${r.assigneeName}. Their email has the use case, the goals and your note.`
          : "Handed over. Nobody was named, so the pool has been told to claim it — with your note.",
      );
      void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] });
      void qc.invalidateQueries({ queryKey: ["assignment", deal.account.id] });
      void qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  if (intake.path !== "field_fusion") return null;
  const handedOff = Boolean(ff.handed_off_at);
  const inSetup = deal.account.stage === FIELD_FUSION_STAGE;
  if (handedOff && !inSetup) {
    return (
      <div className="rounded-md border border-status-ontrack-foreground/30 bg-status-ontrack/40 px-3 py-2 text-[12px] text-status-ontrack-foreground">
        <Check className="mr-1 inline h-3.5 w-3.5" strokeWidth={3} />
        Field Fusion set up and handed to implementation <When value={ff.handed_off_at} />. Their
        first call is a training call; the plan below is the training week.
      </div>
    );
  }
  const checks = fieldFusionChecklist(intake);
  const ready = fieldFusionReady(intake);
  const busy = patch.isPending || handoff.isPending;
  const ownerName = assignment.data?.owner?.name ?? null;
  const pool = assignment.data?.pool ?? [];

  return (
    <Panel
      id="panel-field-fusion"
      title="Field Fusion setup — before the handoff"
      meta={
        ownerName
          ? `${ownerName} confirms the setup, then hands it over`
          : "Nobody owns the setup yet — assign it under Details"
      }
      level="primary"
      highlight={!ready}
    >
      <div className="space-y-3 px-3 py-2.5">
        <p className="text-[12px] text-muted-foreground">
          Field Fusion ships set up, so there is no form to build. Confirm the two things below,
          write what implementation should know, and hand it over. Implementation&apos;s first call
          is a training call — the plan on this page is already the training week.
        </p>
        <ul className="space-y-1.5">
          {checks.map((c) => (
            <li key={c.key}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 text-[13px]",
                  !editable && "cursor-default",
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={c.done}
                  disabled={!editable || busy}
                  onChange={(e) => patch.mutate({ [c.key]: e.target.checked })}
                />
                <span className={cn(c.done && "text-muted-foreground line-through")}>
                  {c.label}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div>
          <label
            htmlFor="ff-notes"
            className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
          >
            What implementation should know
          </label>
          <textarea
            id="ff-notes"
            className="mt-1 min-h-[72px] w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[13px]"
            placeholder="Anything the calls did not say: who to train first, what they care about, what was awkward in the setup."
            value={notes}
            disabled={!editable || busy}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes.trim() !== ff.notes) patch.mutate({ notes: notes.trim() });
            }}
          />
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            The use case and goals from the calls go with it automatically, from the brief.
          </p>
        </div>
        {done ? (
          <p className="text-[12px] text-status-ontrack-foreground">{done}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-7 rounded-sm border border-border bg-background px-1.5 text-[12px]"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              disabled={!editable || busy}
            >
              <option value="">Let the team claim it</option>
              {pool.map((p) => (
                <option key={p.teamMemberId} value={p.teamMemberId}>
                  {p.name}
                  {p.rank ? ` (#${p.rank}, carrying ${p.load})` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={!editable || busy || !ready}
              title={
                ready
                  ? "Moves the deal to Onboarding Kickoff and emails implementation"
                  : "Tick both boxes first"
              }
              onClick={() => {
                if (
                  window.confirm(
                    pick
                      ? "Hand this account to implementation now? They get an email with the use case, goals and your note."
                      : "Hand this account over with nobody named? Everyone in the pool gets an email to claim it, with your note.",
                  )
                )
                  handoff.mutate();
              }}
            >
              <Send className="h-3.5 w-3.5" />
              {handoff.isPending ? "Handing over…" : "Hand to implementation"}
            </button>
            {!ready ? (
              <span className="text-[11px] text-muted-foreground">Tick both boxes first.</span>
            ) : null}
          </div>
        )}
        {error ? (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
