import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";

import { StageStepper } from "@/components/stage-stepper";
import { CARD, JourneyBar, TONE } from "@/components/current-implementation-context";
import { StageGatesPanel } from "@/components/stage-gates-panel";
import { Button } from "@/components/ui/button";
import { MemberOptions } from "@/components/member-options";
import { ask } from "@/components/ui/ask";
import { getDealAssignment } from "@/lib/assignment.functions";
import { handOffPartnerImplementation } from "@/lib/hub.functions";
import {
  PARTNER_JOURNEY,
  partnerMoveFrom,
  type PartnerMoveView,
} from "@/lib/partner-implementation";
import { journeyPosition } from "@/lib/current-implementation-focus";
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
  // Focus Mode: the full journey is collapsed until asked for. Viewing another
  // stage is read-only; the controls below apply to the current stage only.
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const current = progress.stages.find((s) => s.key === progress.current) ?? null;
  const shownKey = viewing ?? progress.current ?? "";
  const shown = progress.stages.find((s) => s.key === shownKey) ?? null;
  const viewingOther = viewing !== null && viewing !== progress.current && shown !== null;
  const stageKeys: string[] = progress.stages.map((s) => s.key);
  const position = progress.current ? journeyPosition(stageKeys, progress.current) : null;
  const shownPosition =
    viewingOther && progress.current
      ? stageKeys.indexOf(shownKey) < stageKeys.indexOf(progress.current)
        ? "Completed stage"
        : "Upcoming stage"
      : null;
  const move = partnerMoveFrom(progress.current);
  const moveView: PartnerMoveView = {
    currentLabel: progress.currentLabel ?? "",
    next: move.next,
    handoff: move.handoff,
    graduation: partnerGraduation(progress),
  };
  const definition = (key: string | null) =>
    key ? (PARTNER_JOURNEY.find((s) => s.key === key)?.description ?? null) : null;
  return (
    <>
      <JourneyBar
        position={position}
        fallbackLabel="Partner journey"
        expanded={journeyOpen}
        onToggle={() => setJourneyOpen((o) => !o)}
        skip={null}
      />
      {journeyOpen ? (
        <section
          id="current-implementation-journey"
          className={cn(CARD, "overflow-hidden")}
          aria-label="Implementation journey"
        >
          <StageStepper
            stages={partnerStepperStages(progress)}
            shown={shownKey}
            onShow={(k) => setViewing(k === progress.current ? null : k)}
          />
        </section>
      ) : null}
      {viewingOther && shown ? (
        <PartnerStageReadOnly
          label={shown.label}
          description={definition(shown.key)}
          items={shown.items}
          position={shownPosition}
          onBack={() => setViewing(null)}
        />
      ) : progress.current === "partner_setup" ? (
        <PartnerHandoffSection
          dealId={dealId}
          implementationId={implementationId}
          gates={current?.items.filter((i) => i.isGate) ?? []}
          editable={editable}
        />
      ) : current ? (
        <>
          <StageGatesPanel
            customerId={customerId}
            implementationId={implementationId}
            currentStage={null}
            stageGateMode={current.gateMode}
            items={gateItemsFor(current.items)}
            partner={moveView}
            focus
            focusHeading={{ title: current.label, goal: definition(current.key) }}
          />
        </>
      ) : null}
    </>
  );
}

/**
 * A stage other than the current one, read for what it recorded. Read only: no
 * ticks and no move, because the partner's controls apply to the current stage.
 */
function PartnerStageReadOnly({
  label,
  description,
  items,
  position,
  onBack,
}: {
  label: string;
  description: string | null;
  items: readonly PartnerWorkItem[];
  position: string | null;
  onBack: () => void;
}) {
  const criteria = items.filter((i) => i.isGate);
  return (
    <section className={cn(CARD, "overflow-hidden")} aria-label={`${label} stage, read only`}>
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]",
          TONE.info.chip,
        )}
      >
        <span>
          <span className="font-medium text-foreground">Viewing: {label}</span>
          {position ? <span className="text-muted-foreground"> · {position}</span> : null}
          <span className="text-muted-foreground"> · read only</span>
        </span>
        <button
          type="button"
          onClick={onBack}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Back to current stage
        </button>
      </div>
      <div className="px-4 pb-3 pt-3">
        {description ? <p className="text-[13px] text-foreground/80">{description}</p> : null}
        {criteria.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground">No criteria recorded here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {criteria.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span
                  className={cn(
                    "text-[13px]",
                    c.status === "done" && "text-muted-foreground line-through",
                  )}
                >
                  {c.title}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {c.status === "done" ? "Done" : c.status === "skipped" ? "Skipped" : "Open"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** What the partner body shows, from its progress query. Nothing else is ever drawn in its place. */
export function partnerBodyState(query: {
  data: unknown;
  isError: boolean;
}): "ready" | "error" | "loading" {
  if (query.data) return "ready";
  return query.isError ? "error" : "loading";
}

/**
 * The partner body while its progress is loading, or when it could not be
 * loaded. A clear message and a retry, never the standard stage controls.
 */
export function PartnerProgressStatus({
  state,
  retrying,
  onRetry,
}: {
  state: "ready" | "error" | "loading";
  retrying: boolean;
  onRetry: () => void;
}) {
  // Ready is drawn by PartnerJourney; this shows nothing in its place.
  if (state === "ready") return null;
  if (state === "loading") {
    return (
      <section
        className="rounded-md border border-border bg-card px-4 py-3"
        aria-label="Partner progress loading"
      >
        <p className="text-[13px] text-muted-foreground">Loading the partner journey…</p>
      </section>
    );
  }
  return (
    <section
      className="rounded-md border border-status-risk bg-status-risk/10 px-4 py-3"
      aria-label="Partner progress unavailable"
      role="alert"
    >
      <p className="text-[13px] font-semibold text-foreground">
        The partner journey can&apos;t be loaded right now.
      </p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        Nothing has been changed. Its stages, gates and handoff will appear here once they load.
      </p>
      <div className="mt-2">
        <Button size="sm" variant="outline" disabled={retrying} onClick={onRetry}>
          {retrying ? "Trying again…" : "Try again"}
        </Button>
      </div>
    </section>
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
  const [showAll, setShowAll] = useState(false);

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
  // Focus Mode: the next open criterion, in the order given, with the rest one click away.
  const isChecked = (g: GateItem) => optimistic[g.id] ?? g.status === "done";
  const visibleGates = showAll ? gateItems : gateItems.filter((g) => !isChecked(g)).slice(0, 1);
  const busy = toggle.isPending || handoff.isPending;
  const ownerName = assignment.data?.owner?.name ?? null;
  const members = assignment.data?.members ?? [];

  return (
    <section className={cn(CARD, "overflow-hidden")} aria-label="Partner implementation handoff">
      <div className={cn("px-4 py-3", TONE.warning.chip)}>
        <p className="text-[15px] font-semibold">Being prepared for handoff</p>
        <p className="mt-0.5 text-[13px]">
          {assignment.isPending
            ? "Checking who owns this…"
            : ownerName
              ? `With the partner implementation lead (${ownerName}) until handed to the GoCanvas implementation team.`
              : "With the partner implementation lead until handed to the GoCanvas implementation team — nobody is assigned yet."}
        </p>
      </div>
      <div className="space-y-3 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-[12px] text-muted-foreground">
            Complete the Partner Setup criteria, then hand it over to start the GoCanvas
            implementation.
          </p>
          {gateItems.length > 1 ? (
            <button
              type="button"
              aria-expanded={showAll}
              onClick={() => setShowAll((o) => !o)}
              className="text-[12px] font-medium text-primary underline-offset-2 hover:underline"
            >
              {showAll ? "Show only the next criterion" : `View all ${gateItems.length} criteria`}
            </button>
          ) : null}
        </div>
        <ul className="space-y-2.5">
          {visibleGates.map((g) => {
            const checked = isChecked(g);
            const featured = !showAll && !checked;
            return (
              <li
                key={g.id}
                className={cn(featured && "rounded-md border border-border bg-card px-4 py-3.5")}
                style={featured ? { boxShadow: `inset 3px 0 0 0 ${TONE.info.bar}` } : undefined}
              >
                <label
                  className={cn(
                    "flex items-center gap-2.5 text-[13px]",
                    featured && "text-[16px] font-semibold",
                    editable ? "cursor-pointer" : "cursor-default",
                  )}
                >
                  <input
                    type="checkbox"
                    className={cn("h-4 w-4", featured && "h-5 w-5")}
                    checked={checked}
                    disabled={!editable || busy}
                    onChange={() => toggle.mutate({ id: g.id, done: !checked })}
                  />
                  {featured ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-px text-[12px] font-semibold",
                        TONE.info.chip,
                      )}
                    >
                      Up next
                    </span>
                  ) : null}
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
