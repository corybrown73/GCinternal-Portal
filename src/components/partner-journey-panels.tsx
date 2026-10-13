import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";

import { StageStepper } from "@/components/stage-stepper";
import { StageGatesPanel } from "@/components/stage-gates-panel";
import { MemberOptions } from "@/components/member-options";
import { ask } from "@/components/ui/ask";
import { getDealAssignment } from "@/lib/assignment.functions";
import { handOffPartnerImplementation } from "@/lib/hub.functions";
import { partnerMoveFrom, type PartnerMoveView } from "@/lib/partner-implementation";
import {
  partnerGraduation,
  partnerStepperStages,
  type PartnerProgress,
  type PartnerWorkItem,
} from "@/lib/partner-journey";
import { setTaskStatus } from "@/lib/plan.functions";
import { stageGateStatus, type GateItem } from "@/lib/stage-gates";
import { cn } from "@/lib/utils";

/**
 * A Partner Implementation on Current Implementation: its seven stages from its
 * own records, then the controls for the stage it is in. At Partner Setup that
 * is the handoff to the GoCanvas implementation team; anywhere else it is the
 * existing gates panel, with the gate items and the move to the next stage.
 *
 * Nothing here reads the deal stage or the standard checklist. The stepper and
 * the status strip are drawn from the same progress the customer dashboard reads.
 */
export function PartnerJourney({
  progress,
  customerId,
  implementationId,
  dealId,
  editable,
}: {
  progress: PartnerProgress;
  customerId: string;
  implementationId: string;
  dealId: string;
  editable: boolean;
}) {
  const current = progress.stages.find((s) => s.key === progress.current) ?? null;
  const move = partnerMoveFrom(progress.current);
  const moveView: PartnerMoveView = {
    currentLabel: progress.currentLabel ?? "",
    next: move.next,
    handoff: move.handoff,
    graduation: partnerGraduation(progress),
  };
  return (
    <>
      <section
        id="current-implementation-journey"
        className="overflow-hidden rounded-md border border-border bg-card"
        aria-label="Implementation journey"
      >
        <StageStepper stages={partnerStepperStages(progress)} shown={progress.current ?? ""} />
      </section>
      {progress.current === "partner_setup" ? (
        <PartnerHandoffSection
          dealId={dealId}
          implementationId={implementationId}
          gates={current?.items.filter((i) => i.isGate) ?? []}
          editable={editable}
        />
      ) : current ? (
        <StageGatesPanel
          customerId={customerId}
          implementationId={implementationId}
          currentStage={null}
          stageGateMode={current.gateMode}
          items={gateItemsFor(current.items)}
          partner={moveView}
        />
      ) : null}
    </>
  );
}

/** A partner work item in the shape the existing gates panel draws. */
function gateItemsFor(items: readonly PartnerWorkItem[]): GateItem[] {
  return items.map((i) => ({
    id: i.id,
    task_key: null,
    title: i.title,
    status: i.status,
    is_gate: i.isGate,
    party: i.party,
    owner_name: null,
    due_at: i.dueAt,
  }));
}

/**
 * The Implementation Ready handoff for a Partner Implementation. Its checklist is
 * the Partner Setup gate criteria, ticked here; the handoff itself is the
 * transactional partner path (handOffPartnerImplementation), which refuses while
 * any criterion is open. It replaces the legacy Field Fusion handoff for partner
 * implementations; the legacy panel is untouched and still serves Field Fusion.
 */
function PartnerHandoffSection({
  dealId,
  implementationId,
  gates,
  editable,
}: {
  dealId: string;
  implementationId: string;
  gates: PartnerWorkItem[];
  editable: boolean;
}) {
  const qc = useQueryClient();
  const hand = useServerFn(handOffPartnerImplementation);
  const tick = useServerFn(setTaskStatus);
  const assignment = useQuery({
    queryKey: ["assignment", dealId],
    queryFn: () => getDealAssignment({ data: { dealId } }),
  });
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["partner-progress", implementationId] });
    void qc.invalidateQueries({ queryKey: ["customer360"] });
    void qc.invalidateQueries({ queryKey: ["plan", implementationId] });
  };
  const toggle = useMutation({
    mutationFn: (v: { id: string; done: boolean }) =>
      tick({ data: { workItemId: v.id, status: v.done ? "done" : "not_started" } }),
    onMutate: (v) => {
      setError(null);
      setOptimistic((o) => ({ ...o, [v.id]: v.done }));
    },
    onSettled: (_data, _err, v) =>
      setOptimistic((o) => {
        const next = { ...o };
        delete next[v.id];
        return next;
      }),
    onSuccess: refresh,
    onError: (e) => setError((e as Error).message),
  });
  const handoff = useMutation({
    mutationFn: () => hand({ data: { implementationId, teamMemberId: pick || null } }),
    onMutate: () => setError(null),
    onSuccess: (r) => {
      setDone(
        r.assigned
          ? "Handed over. The implementation team has the work."
          : "Handed over. Nobody was named, so the implementation team has been told to claim it.",
      );
      refresh();
    },
    onError: (e) => setError((e as Error).message),
  });

  const gateItems = gateItemsFor(gates);
  const status = stageGateStatus(gateItems);
  const ready = status.ready;
  const busy = toggle.isPending || handoff.isPending;
  const ownerName = assignment.data?.owner?.name ?? null;
  const members = assignment.data?.members ?? [];

  return (
    <section
      className="overflow-hidden rounded-md border border-border bg-card"
      aria-label="Partner implementation handoff"
    >
      <div className="border-b border-border bg-amber-500/10 px-4 py-2.5">
        <p className="text-[13px] font-semibold text-foreground">Being prepared for handoff</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {assignment.isPending
            ? "Checking who owns this…"
            : ownerName
              ? `With the partner implementation lead (${ownerName}) until handed to the GoCanvas implementation team.`
              : "With the partner implementation lead until handed to the GoCanvas implementation team — nobody is assigned yet."}
        </p>
      </div>
      <div className="space-y-3 px-4 py-3">
        <p className="text-[12px] text-muted-foreground">
          Complete the Partner Setup criteria below, then hand it over to start the GoCanvas
          implementation.
        </p>
        <ul className="space-y-1.5">
          {gateItems.map((g) => {
            const checked = optimistic[g.id] ?? g.status === "done";
            return (
              <li key={g.id}>
                <label
                  className={cn(
                    "flex items-center gap-2 text-[13px]",
                    editable ? "cursor-pointer" : "cursor-default",
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={checked}
                    disabled={!editable || busy}
                    onChange={() => toggle.mutate({ id: g.id, done: !checked })}
                  />
                  <span className={cn(checked && "text-muted-foreground line-through")}>
                    {g.title}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
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
              <option value="">Let the implementation team claim it</option>
              <MemberOptions members={members} />
            </select>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={!editable || busy || !ready}
              title={ready ? "Starts the GoCanvas implementation" : "Complete the criteria first"}
              onClick={async () => {
                if (
                  await ask({
                    title: pick
                      ? "Hand this account to the implementation team now?"
                      : "Hand this account over with nobody named?",
                    body: pick
                      ? "They get the account and the GoCanvas implementation journey starts."
                      : "Everyone on the implementation team gets told to claim it.",
                    confirmLabel: "Hand it over",
                  })
                )
                  handoff.mutate();
              }}
            >
              <Send className="h-3.5 w-3.5" />
              {handoff.isPending ? "Handing over…" : "Hand to GoCanvas implementation"}
            </button>
            {!ready ? (
              <span className="text-[11px] text-muted-foreground">
                {status.remaining.length} criteria still open.
              </span>
            ) : null}
          </div>
        )}
        {error ? (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
