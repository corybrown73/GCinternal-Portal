import { useEffect, useRef, useState } from "react";
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
import { useOptimisticTick } from "@/lib/use-optimistic-tick";
import { cn } from "@/lib/utils";
import { ask } from "@/components/ui/ask";
import { MemberOptions } from "@/components/member-options";

/**
 * The Field Fusion gate, on the deal.
 *
 * Shown only on a Field Fusion account, from the close until the handoff.
 * Two ticks, a note, one button. The button moves the deal to Pre-kickoff
 * and sends implementation the use case and goals from the calls plus the
 * note — the training sessions are theirs from there.
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
  // The saved note only refreshes the box when the box is not being typed
  // in: ticking a checkbox re-renders this panel, and a naive sync threw
  // away whatever had been typed since.
  const [notes, setNotes] = useState(ff.notes);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const dirty = useRef(false);
  useEffect(() => {
    if (dirty.current || document.activeElement === notesRef.current) return;
    setNotes(ff.notes);
  }, [ff.notes]);
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // The two checks change the moment they are clicked.
  const check = useOptimisticTick({
    dealId: deal.account.id,
    section: "field_fusion",
    encode: (on) => on,
  });
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
      // Everything: the customer header shows the new owner too.
      void qc.invalidateQueries();
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
        Field Fusion set up and handed to implementation <When value={ff.handed_off_at} />. The
        forms are already built; the plan below is GoCanvas training — three sessions over two
        weeks.
      </div>
    );
  }
  const checks = fieldFusionChecklist(intake).map((c) => ({
    ...c,
    done: check.isOn(c.key, c.done),
  }));
  const ready = checks.every((c) => c.done);
  const busy = patch.isPending || handoff.isPending;
  // One source for the owner: the assignment ledger, the same one the
  // header and the checklist read. "Nobody" only once it has answered.
  const ownerName = assignment.data?.owner?.name ?? null;
  const members = assignment.data?.members ?? [];

  return (
    <Panel
      id="panel-field-fusion"
      title="Field Fusion setup — before the handoff"
      meta={
        assignment.isPending
          ? "Checking who owns the setup…"
          : ownerName
            ? `${ownerName} confirms the setup, then hands it over`
            : "Nobody owns the setup yet — assign it in the checklist above"
      }
      level="primary"
      highlight={!ready}
    >
      <div className="space-y-3 px-3 py-2.5">
        <p className="text-[12px] text-muted-foreground">
          Field Fusion ships with its forms built, so there is nothing to build. Confirm the two
          things below, write what implementation should know, and hand it over. Implementation runs
          GoCanvas training on the forms as built — three thirty-minute sessions over two weeks.
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
                  disabled={!editable}
                  onChange={(e) => check.mutate({ key: c.key, on: e.target.checked })}
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
            ref={notesRef}
            value={notes}
            disabled={!editable}
            onChange={(e) => {
              dirty.current = true;
              setNotes(e.target.value);
            }}
            onBlur={() => {
              dirty.current = false;
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
              <MemberOptions members={members} />
            </select>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={!editable || busy || !ready}
              title={
                ready
                  ? "Moves the deal to Intake & Process and emails implementation"
                  : "Tick both boxes first"
              }
              onClick={async () => {
                if (
                  await ask({
                    title: pick
                      ? "Hand this account to implementation now?"
                      : "Hand this account over with nobody named?",
                    body: pick
                      ? "They get an email with the use case, goals and your note."
                      : "Everyone in the pool gets an email to claim it, with your note.",
                    confirmLabel: "Hand it over",
                  })
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
        {error || check.error ? (
          <p role="alert" className="text-[12px] text-destructive">
            {error ?? check.error}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
