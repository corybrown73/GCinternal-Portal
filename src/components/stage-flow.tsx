import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, Copy, Lock, Send, UserRoundCheck } from "lucide-react";

import { FieldFusionGate } from "@/components/field-fusion-gate";
import { AiSource, ReadingStatus } from "@/components/fill-from-sources";
import { ImplementationFocusPanel } from "@/components/implementation-focus-panel";
import { MeetingRecap } from "@/components/meeting-recap";
import { ParkingLot } from "@/components/parking-lot";
import { Field, StatusDot } from "@/components/record";
import { SolutionsCard } from "@/components/solutions-card";
import { TranscriptUpdatePanel } from "@/components/transcript-update-panel";
import { WorkflowStoryPanel } from "@/components/workflow-story-panel";
import { ImplementationUpdatePanel } from "@/components/implementation-update-panel";
import { ImplementationHistorySection } from "@/components/implementation-history";
import { FactsStep, FlowStep, NotesIn, SowStep } from "@/components/intake-panel";
import { assignDealFn, claimDealFn, getDealAssignment } from "@/lib/assignment.functions";
import { MemberOptions } from "@/components/member-options";
import { fieldFusionChecklist } from "@/lib/field-fusion";
import { handToImplementationFn } from "@/lib/field-fusion.functions";
import { useOptimisticTick } from "@/lib/use-optimistic-tick";
import { bookingWarnings, typedDatesFor } from "@/lib/watch-outs";
import { canEditDeal, canManage, useProfile } from "@/lib/auth";
import { reasonLabel } from "@/lib/complexity-tiers";
import { deriveHealth } from "@/lib/customer360-derive";
import { dealQuery, type DealData } from "@/lib/deal-query";
import type { Customer360 } from "@/lib/hub-types";
import {
  firstFormName,
  flowAnswered,
  formsOnly,
  readIntake,
  type IntakeAnswers,
} from "@/lib/intake-answers";
import { closeDateFor, timelineFor } from "@/lib/onboarding-plan";
import { coreWindowEnd, dayCounter, localIso, shortDay } from "@/lib/onboarding-timeline";
import { getParkingLot } from "@/lib/parking-lot.functions";
import { getWelcome } from "@/lib/welcome.functions";
import { getKickoffCadence } from "@/lib/kickoff-cadence.functions";
import { wonStage } from "@/lib/pipeline-stages";
import type { AccountStage } from "@/lib/presale-stages";
import { finishImplementation, moveDealStage, saveIntake } from "@/lib/presale.functions";
import { ask } from "@/components/ui/ask";
import {
  CANONICAL_JOURNEY_KEYS,
  CORE_MEETINGS,
  DEAL_TYPES,
  bookMeetingPatch,
  completedAfterTick,
  FLOW_STAGES,
  flowLabel,
  isWorkingStageKey,
  KICKOFF_CADENCE,
  latestStageTransition,
  PREP_ITEMS,
  readingInFlight,
  showKickoffOutcomePrompt,
  stageFlow,
  stageTargetDate,
  stampDay,
  targetDidChange,
  whenLabel,
  type FlowStageKey,
  type FlowTask,
} from "@/lib/stage-flow";
import { syncDealStageFn } from "@/lib/stage-flow.functions";
import { stageGuidanceFor } from "@/lib/stage-guidance";
import { parseWonGate, type WonGateMissing } from "@/lib/won-gate";
import { ClosedWonGateNotice } from "@/components/closed-won-gate";
import { aeReplyDraft, googleCalendarLink } from "@/lib/ae-reply";
import { customerLabel } from "@/lib/customer-labels";
import { customerFacingName } from "@/lib/names";
import { cn } from "@/lib/utils";
import { shortMeeting, workspaceFor } from "@/lib/workspace";

/**
 * The deal's stages as one checklist, at the top of the page.
 *
 * Only the stage the deal is in is shown, and inside it only the next task
 * is open: finish it and the one after opens by itself. Nothing to fold or
 * unfold. When a stage's tasks are all done the deal moves on without anyone
 * touching the stage picker — Closed Won to Pre-kickoff when the welcome
 * brief is generated, Pre-kickoff to Onboarding when the kickoff is booked.
 * The rules live in stage-flow.ts; the server checks them again before it
 * moves anything.
 */
/**
 * The page saw a stage finish: ask the server to move it. Once per target,
 * so a slow refetch cannot send the same move twice. Shared by the checklist
 * and the workspace, so the deal moves on whichever screen the owner works
 * from.
 */
export function useStageSync(dealId: string, advanceTo: string | null, editable: boolean) {
  const qc = useQueryClient();
  const sync = useServerFn(syncDealStageFn);
  const asked = useRef<string | null>(null);
  const [moved, setMoved] = useState<string | null>(null);
  // A move that failed says so, with the button that tries again; a page
  // that only ever said "moving…" would be lying from the second attempt on.
  const [syncError, setSyncError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // A "moved" notice is news for a moment, then clutter.
  useEffect(() => {
    if (!moved) return;
    const timer = setTimeout(() => setMoved(null), 6000);
    return () => clearTimeout(timer);
  }, [moved]);
  useEffect(() => {
    if (!editable || !advanceTo || asked.current === advanceTo) return;
    asked.current = advanceTo;
    setSyncError(null);
    void sync({ data: { dealId } })
      .then((r) => {
        if (r.moved) {
          setMoved(FLOW_STAGES.find((s) => s.stage === r.moved)?.label ?? r.moved);
          void qc.invalidateQueries();
        }
      })
      .catch((e: unknown) => {
        asked.current = null;
        setSyncError(e instanceof Error ? e.message : "The deal could not be moved.");
      });
  }, [editable, advanceTo, dealId, sync, qc, attempt]);
  return { moved, syncError, retry: () => setAttempt((n) => n + 1) };
}

/**
 * When the shown stage was entered, from the deal's own stage history — the
 * record a move already writes, never a second one. Nothing renders for a
 * stage never entered (prospect, usually: a deal starts there without a
 * transition row) or one the history has not caught up to yet.
 */
function StageHistory({
  shown,
  history,
}: {
  shown: FlowStageKey;
  history: DealData["stage_history"];
}) {
  const accountStage = FLOW_STAGES.find((s) => s.key === shown)?.stage;
  const entries = accountStage
    ? history
        .filter((t) => t.to_stage === accountStage)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    : [];
  if (entries.length === 0) return null;
  return (
    <ul className="space-y-0.5 border-b border-border bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
      {entries.map((t) => (
        <li key={t.id}>
          Entered {stampDay(t.occurred_at)}
          {t.actor_name ? ` · ${t.actor_name}` : ""}
          {t.note ? ` — ${t.note}` : ""}
        </li>
      ))}
    </ul>
  );
}

/**
 * Date accountability for the canonical stage being shown, in Current
 * Implementation only: when it actually started (the same transition
 * StageHistory itself reads, so the two never disagree) and, only where
 * the plan genuinely schedules a closing date for it, when it's expected
 * to finish. Shown in place of StageHistory there, not alongside it, so
 * the start date is said once; StageFlow's own Closed Won fallback keeps
 * using StageHistory exactly as before.
 */
function StageTiming({
  shown,
  history,
  targetDate,
}: {
  shown: FlowStageKey;
  history: DealData["stage_history"];
  targetDate: string | null;
}) {
  const accountStage = FLOW_STAGES.find((s) => s.key === shown)?.stage;
  const latest = latestStageTransition(history, accountStage);
  if (!latest && !targetDate) return null;
  return (
    <div className="space-y-0.5 border-b border-border bg-muted/20 px-4 py-2 text-[11px]">
      <p className="font-semibold text-foreground">{flowLabel(shown)}</p>
      <p className="text-muted-foreground">
        {latest ? (
          <>
            Started {stampDay(latest.occurred_at)}
            {latest.actor_name ? ` · ${latest.actor_name}` : ""}
            {latest.note ? ` — ${latest.note}` : ""}
          </>
        ) : (
          "Start date not recorded"
        )}
        {targetDate ? ` · Target ${shortDay(targetDate)}` : ""}
      </p>
    </div>
  );
}

/**
 * The implementation's own target — the canonical date model (0073:
 * target_date / baseline_date / target_date_changes), never timeline.liveDate.
 * The status word reuses the exact deriveHealth() call the page header's
 * StatusChip already makes; this is the same computation shown a second
 * place, not a second algorithm. The baseline only appears once it has
 * actually diverged from the current target, and the change history stays
 * behind a toggle rather than sitting on the page by default.
 */
function ImplementationTargetSection({ record }: { record: Customer360 }) {
  const impl = record.implementation;
  const [open, setOpen] = useState(false);
  if (!impl) return null;
  const target = impl.dates.target;
  const baseline = impl.dates.baseline;
  const changed = targetDidChange(baseline, target);
  const health = deriveHealth(record, impl);
  return (
    <section
      className="rounded-md border border-border bg-card px-4 py-3"
      aria-label="Implementation target"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Target graduation
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
        {target ? shortDay(target) : "Not set"}
        {target ? <StatusDot status={health.level} className="text-[12px] font-normal" /> : null}
      </p>
      {changed ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Originally {shortDay(baseline!)} ·{" "}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="font-medium text-primary hover:underline"
          >
            Target changed
          </button>
        </p>
      ) : null}
      {open && impl.target_changes.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
          {impl.target_changes.map((c) => (
            <li key={c.id}>
              {c.from_date ? `${shortDay(c.from_date)} → ` : ""}
              {shortDay(c.to_date)} —{" "}
              {c.reason_code ? reasonLabel(c.reason_code) : "Reason not given yet"}
              {c.note ? `: ${c.note}` : ""}
              <span className="ml-1 font-mono">{stampDay(c.changed_at)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Stage guidance for the shown stage — read-only reference material, not a
 * second checklist. The Hub's own tasks above stay the source of truth for
 * what is actually done; nothing here is tracked or saved, selecting a
 * stuck scenario included. Renders nothing for a stage with no guidance yet
 * (Prospect, Closed Won, Intake & Process).
 *
 * Selecting a stuck scenario is an attention state, not a second-tier
 * accordion: the result gets the strongest visual weight on the panel so a
 * TIS mid-call can see what's wrong and what to do about it without hunting
 * for it.
 */
function StageGuidancePanel({ shown }: { shown: FlowStageKey }) {
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const guidance = stageGuidanceFor(shown);
  if (!guidance) return null;
  const active = guidance.stuck.find((s) => s.key === openIssue) ?? null;
  return (
    <div
      className="border-t border-border bg-card px-4 py-3.5 text-[12.5px]"
      aria-label="Stage guidance"
    >
      <p className="font-semibold text-foreground">{guidance.objective}</p>
      <p className="mt-0.5 text-muted-foreground">{guidance.objectiveDetail}</p>

      <div className="mt-3.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Before you move on, confirm
        </div>
        <ul className="mt-1.5 space-y-1 text-foreground">
          {guidance.checks.map((c) => (
            <li key={c} className="flex items-start gap-2">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              {c}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          If you're stuck
        </div>
        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
          {guidance.stuck.map((s) => {
            const isOpen = s.key === openIssue;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setOpenIssue(isOpen ? null : s.key)}
                aria-expanded={isOpen}
                className={cn(
                  "rounded-sm border px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors",
                  isOpen
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted hover:text-foreground",
                )}
              >
                {s.label} →
              </button>
            );
          })}
        </div>

        {active ? (
          <div
            className={cn(
              "mt-2.5 rounded-md border-l-4 p-3",
              active.blocks
                ? "border-l-status-blocked bg-status-blocked/15"
                : "border-l-status-risk bg-status-risk/15",
            )}
            aria-label="Stuck guidance"
          >
            <span
              className={cn(
                "inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]",
                active.blocks
                  ? "bg-status-blocked text-status-blocked-foreground"
                  : "bg-status-risk text-status-risk-foreground",
              )}
            >
              {active.status}
            </span>

            <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground">
              What to do next
            </div>
            <ol className="mt-1.5 space-y-1.5">
              {active.actions.map((a, i) => (
                <li key={a} className="flex gap-2 text-foreground">
                  <span className="font-semibold text-muted-foreground">{i + 1}.</span>
                  <span>{a}</span>
                </li>
              ))}
            </ol>

            <p
              className={cn(
                "mt-2.5 font-semibold",
                active.blocks ? "text-status-blocked-foreground" : "text-status-risk-foreground",
              )}
            >
              {active.gate}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-3.5 border-t border-border pt-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {guidance.readyLabel}
        </div>
        <ul className="mt-1.5 space-y-1 text-foreground">
          {guidance.readyWhen.map((r) => (
            <li key={r} className="flex items-start gap-2">
              <Check
                className="mt-0.5 h-3 w-3 shrink-0 text-status-ontrack-foreground"
                aria-hidden
              />
              {r}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
          Next: {guidance.next} →
        </p>
      </div>
    </div>
  );
}

export function StageFlow({ deal }: { deal: DealData }) {
  const { profile } = useProfile();
  const editable = canEditDeal(profile?.role);
  const dealId = deal.account.id;
  const intake = readIntake(deal.account.intake);

  const assignment = useQuery({
    queryKey: ["assignment", dealId],
    queryFn: () => getDealAssignment({ data: { dealId } }),
  });
  // While the AI reads, the record changes under the page: follow it.
  useQuery({
    ...dealQuery(dealId),
    refetchInterval: readingInFlight(intake.ai_reading) ? 4000 : false,
  });
  const close = closeDateFor({
    intake,
    stageHistory: deal.stage_history,
    wonStageKey: wonStage(deal.stages).key,
    today: localIso(),
  });
  const timeline = timelineFor(intake, close.date);
  const flow = stageFlow({
    stage: deal.account.stage,
    intake,
    owner: assignment.data?.owner?.name ?? null,
    gongReports: deal.gong_reports.length,
    hasSow: Boolean(deal.sow_url),
    hasBrief: deal.briefs.some((b) => b.status === "complete" && b.generator === "llm"),
    hasLink: Boolean((deal.account as { welcome_share_url?: string | null }).welcome_share_url),
    timeline,
  });

  const { moved, syncError, retry } = useStageSync(dealId, flow.advanceTo, editable);

  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localIso()), []);
  const counter = today ? dayCounter(timeline, today) : null;

  const [viewing, setViewing] = useState<FlowStageKey | null>(null);
  // A prospect's own stage has no tasks; its checklist is the Closed Won
  // work that can be done ahead, so that is what opens.
  const shown =
    viewing ??
    (flow.current === "prospect" || flow.current === "negotiate" ? "closed_won" : flow.current) ??
    "closed_won";
  const stage = flow.stages.find((s) => s.key === shown) ?? flow.stages[0]!;
  // The count is over the required steps — every row listed, optional ones
  // left out and said so — the same set the footer's "to go" counts.
  const openTasks = stage.tasks.filter((t) => !t.optional);
  const optionalCount = stage.tasks.length - openTasks.length;
  const doneCount = openTasks.filter((t) => t.done).length;
  const next = stage.tasks.find((t) => !t.done && !t.locked && !t.optional) ?? null;
  // The next task is open. One opened by hand stays open — until it is done,
  // when the next one opens; a done one reopened to change it stays open.
  const [manual, setManual] = useState<{ key: string; wasDone: boolean } | null>(null);
  const manualTask = manual ? stage.tasks.find((t) => t.key === manual.key) : undefined;
  const openTask = manualTask && (manual!.wasDone || !manualTask.done) ? manualTask : next;

  return (
    <section
      id="stage-flow"
      className="overflow-hidden rounded-md border border-border bg-card"
      aria-label="Stage checklist"
    >
      <Stepper
        stages={flow.stages}
        current={flow.current}
        shown={shown}
        onShow={(k) => {
          setViewing(k === flow.current ? null : k);
          setManual(null);
        }}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2">
        <p className="flex flex-wrap items-center gap-x-1 text-[12px]">
          {/* The type of deal, on every stage: it is what the plan follows. */}
          <button
            type="button"
            onClick={() => {
              setViewing(flow.current === "closed_won" ? null : "closed_won");
              setManual({ key: "type", wasDone: intake.path !== null });
            }}
            className={cn(
              "mr-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              intake.path
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300",
            )}
            title="The type of deal decides the plan. Click to change it."
          >
            {intake.path
              ? DEAL_TYPES.find((t) => t.path === intake.path)!.label
              : "Type of deal not set"}
          </button>
          <b className="font-semibold">{stage.label}</b>
          {openTasks.length ? (
            <span className="text-muted-foreground">
              {" "}
              · {doneCount} of {openTasks.length} done
              {optionalCount ? ` · ${optionalCount} optional` : ""}
              {next ? (
                <>
                  {" "}
                  · next: <span className="text-foreground">{next.label}</span>
                </>
              ) : null}
            </span>
          ) : null}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {counter && (isWorkingStageKey(flow.current) || flow.current === "pre_kickoff") ? (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 font-medium",
                counter.state === "past_due"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                  : "border-border text-foreground",
              )}
              title={counter.detail}
            >
              {counter.label} · {counter.detail}
            </span>
          ) : null}
          {intake.path === "new_logo" &&
          (isWorkingStageKey(flow.current) || flow.current === "pre_kickoff") ? (
            <span className="rounded-full border border-border px-2 py-0.5">
              Functional by {shortDay(timeline.liveDate)} · 30-day window ends{" "}
              {shortDay(coreWindowEnd(timeline))}
            </span>
          ) : null}
          {stageFooter(shown, flow.current, intake.path)}
        </p>
      </div>
      {moved ? (
        <p className="border-b border-border bg-status-ontrack/40 px-4 py-1.5 text-[12px] text-status-ontrack-foreground">
          <Check className="mr-1 inline h-3.5 w-3.5" strokeWidth={3} />
          Moved to {moved}.
        </p>
      ) : null}
      {/* WHAT HAPPENS NEXT, always in words. A deal that is not closed says
          so, with the button that closes it; a stage whose tasks are all done
          says where the deal goes now — a folded row is not an answer. */}
      {flow.current === "prospect" || flow.current === "negotiate" ? (
        <NotClosedBar
          deal={deal}
          editable={editable}
          ready={openTasks.length > 0 && openTasks.every((t) => t.done || t.optional)}
          onOpenTask={(k) => setManual({ key: k, wasDone: false })}
        />
      ) : syncError && flow.advanceTo && shown === flow.current ? (
        <p className="flex flex-wrap items-center gap-2 border-b border-border bg-destructive/10 px-4 py-2 text-[12px] text-destructive">
          Everything here is done, but the deal could not be moved: {syncError}
          <button
            type="button"
            className="rounded-sm border border-destructive/40 px-2 py-0.5 font-medium hover:bg-destructive/10"
            onClick={retry}
          >
            Try again
          </button>
        </p>
      ) : stage.tasks.length > 0 && stage.done && shown === flow.current ? (
        <p className="border-b border-border bg-status-ontrack/40 px-4 py-2 text-[12px] text-status-ontrack-foreground">
          <Check className="mr-1 inline h-3.5 w-3.5" strokeWidth={3} />
          {flow.advanceTo
            ? editable
              ? `Everything here is done — moving the deal to ${stageLabelFor(flow.advanceTo)}…`
              : `Everything here is done — the deal moves to ${stageLabelFor(flow.advanceTo)} when its owner opens it.`
            : shown === "closed_won" &&
                !flow.stages
                  .find((x) => x.key === "closed_won")!
                  .tasks.find((x) => x.key === "assign")?.done
              ? "Waiting on an owner."
              : "Everything here is done."}
        </p>
      ) : null}

      <StageHistory shown={shown} history={deal.stage_history} />

      {isWorkingStageKey(shown) ? (
        <OnboardingList
          deal={deal}
          intake={intake}
          tasks={stage.tasks}
          editable={editable}
          stageKey={shown}
          current={flow.current}
        />
      ) : shown === "prospect" || shown === "negotiate" ? (
        <p className="px-4 py-3 text-[13px] text-muted-foreground">
          {flow.current === "negotiate"
            ? "Sales is closing. Assign the TIS under Closed Won so they can join the closing call; the other Closed Won tasks can be worked ahead."
            : flow.current === "prospect"
              ? "Not closed yet. The Closed Won tasks can be worked ahead; mark the deal won when it is."
              : "The deal was a prospect before it closed."}
        </p>
      ) : (
        <ol className="divide-y divide-border">
          {stage.tasks.map((t, i) => (
            <TaskRow
              key={t.key}
              n={i + 1}
              task={t}
              open={openTask?.key === t.key}
              onOpen={() => setManual({ key: t.key, wasDone: t.done })}
            >
              <TaskBody task={t} deal={deal} intake={intake} editable={editable} />
            </TaskRow>
          ))}
        </ol>
      )}
      {/* The parking lot lives beside the work from the first call on. */}
      {(shown === "pre_kickoff" || isWorkingStageKey(shown)) &&
      flow.current !== null &&
      flow.current !== "prospect" &&
      flow.current !== "negotiate" ? (
        <ParkingLot dealId={dealId} editable={editable} />
      ) : null}
      <StageGuidancePanel shown={shown} />
    </section>
  );
}

/** The customer page's header: the checklist for the deal this project came from. */
export function DealStageFlow({ dealId }: { dealId: string }) {
  const q = useQuery(dealQuery(dealId));
  if (!q.data) return null;
  return <StageFlow deal={q.data} />;
}

/**
 * Overview's two live-computed facts about a deal-linked implementation —
 * the current target date and the ball — read off the exact same
 * `workspaceFor()` computation Current Implementation uses, so the two tabs
 * never disagree. Everything else about that computation (tasks, guidance,
 * meetings, waiting-on) stays on Current Implementation; this renders
 * nothing but the two `Field`s, as children of Overview's own `<dl>`.
 */
export function ImplementationStatusFacts({
  dealId,
  ownerName,
}: {
  dealId: string;
  ownerName: string | null;
}) {
  const q = useQuery(dealQuery(dealId));
  const parking = useQuery({
    queryKey: ["parking-lot", dealId],
    queryFn: () => getParkingLot({ data: { dealId } }),
  });
  const welcome = useQuery({
    queryKey: ["welcome", dealId],
    queryFn: () => getWelcome({ data: { dealId } }),
  });
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localIso()), []);

  if (!q.data) return <Field label="Target" value={null} />;
  const deal = q.data;
  const intake = readIntake(deal.account.intake);
  const nowIso = today ?? localIso();
  const close = closeDateFor({
    intake,
    stageHistory: deal.stage_history,
    wonStageKey: wonStage(deal.stages).key,
    today: nowIso,
  });
  const timeline = timelineFor(intake, close.date);
  const flow = stageFlow({
    stage: deal.account.stage,
    intake,
    owner: ownerName,
    gongReports: deal.gong_reports.length,
    hasSow: Boolean(deal.sow_url),
    hasBrief: deal.briefs.some((b) => b.status === "complete" && b.generator === "llm"),
    hasLink: Boolean((deal.account as { welcome_share_url?: string | null }).welcome_share_url),
    timeline,
  });
  const ws = workspaceFor({
    flow,
    intake,
    timeline,
    today: nowIso,
    parkingLot: parking.data ?? [],
    homeworkDone: welcome.data?.homeworkDone ?? {},
    link: welcome.data
      ? { sharedAt: welcome.data.sharedAt ?? null, openedAt: welcome.data.openedAt ?? null }
      : null,
  });

  return (
    <>
      <Field label="Target" value={ws.where.target ? shortDay(ws.where.target.date) : null} />
      <Field
        label="Ball"
        value={ws.ball ? (ws.ball.who === "customer" ? "With the customer" : "With us") : null}
      />
    </>
  );
}

/**
 * Current Implementation, while the account is still with a Partner
 * Implementation Lead — today, the Field Fusion setup stage — before the
 * handoff into the GoCanvas implementation team. This is the existing
 * handoff `FieldFusionGate` already runs on the deal page (the same two
 * checks, the same `handToImplementationFn`, the same stamp and stage
 * transition into Intake & Process): that page is simply unreachable once
 * the account has a Customer 360 of its own, which is immediately at Closed
 * Won. This panel just makes the same handoff reachable from there, in
 * copy written for a generic reader rather than a Field-Fusion-specific
 * one. FieldFusion is the first case this covers, not a second
 * implementation journey — nothing here runs after the handoff.
 */
function PartnerHandoffPanel({ deal, editable }: { deal: DealData; editable: boolean }) {
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
  // in — same guard as FieldFusionGate, for the same reason.
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
          ? `Handed to ${r.assigneeName}. They have the context you entered.`
          : "Handed over. Nobody was named, so the implementation team has been told to claim it.",
      );
      // Everything: the status strip and journey rail above pick up the move too.
      void qc.invalidateQueries();
    },
    onError: (e) => setError((e as Error).message),
  });

  const checks = fieldFusionChecklist(intake).map((c) => ({
    ...c,
    done: check.isOn(c.key, c.done),
  }));
  const ready = checks.every((c) => c.done);
  const busy = patch.isPending || handoff.isPending;
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
          Confirm the two things below, note anything the implementation team should know, then hand
          it over to start the GoCanvas implementation.
        </p>
        <ul className="space-y-1.5">
          {checks.map((c) => (
            <li key={c.key}>
              <label
                className={cn(
                  "flex items-center gap-2 text-[13px]",
                  editable ? "cursor-pointer" : "cursor-default",
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
            htmlFor="partner-handoff-notes"
            className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
          >
            What the implementation team should know
          </label>
          <textarea
            id="partner-handoff-notes"
            className="mt-1 min-h-[72px] w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[13px]"
            placeholder="Anything the calls did not say: who to train first, what they care about, what was awkward in setup."
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
              <option value="">Let the implementation team claim it</option>
              <MemberOptions members={members} />
            </select>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={!editable || busy || !ready}
              title={ready ? "Starts the GoCanvas implementation" : "Tick both boxes first"}
              onClick={async () => {
                if (
                  await ask({
                    title: pick
                      ? "Hand this account to the implementation team now?"
                      : "Hand this account over with nobody named?",
                    body: pick
                      ? "They get the use case, goals and your note, and the GoCanvas implementation journey starts."
                      : "Everyone on the implementation team gets told to claim it, with your note.",
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
    </section>
  );
}

/**
 * Customer 360's Current Implementation tab: the canonical journey Intake &
 * Process → Kickoff → Get It Working → Make It Yours → Make It Run →
 * Implementation Complete, the current stage's tasks and Navigator
 * guidance, the next customer meeting, and Technical Solutions running in
 * parallel. Reads the same deal the full checklist and workspace read —
 * nothing here is a second model, and nothing before Intake & Process (the
 * Sales/handoff stages) shows on this rail.
 */
export function CurrentImplementationTab({
  customerId,
  implementationId,
  dealId,
  ownerName,
  record,
}: {
  customerId: string;
  implementationId: string;
  dealId: string;
  ownerName: string | null;
  record: Customer360;
}) {
  const { profile } = useProfile();
  const editable = canEditDeal(profile?.role);
  const q = useQuery(dealQuery(dealId));
  const parking = useQuery({
    queryKey: ["parking-lot", dealId],
    queryFn: () => getParkingLot({ data: { dealId } }),
  });
  const welcome = useQuery({
    queryKey: ["welcome", dealId],
    queryFn: () => getWelcome({ data: { dealId } }),
  });
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localIso()), []);
  const [viewing, setViewing] = useState<FlowStageKey | null>(null);
  const [manual, setManual] = useState<{ key: string; wasDone: boolean } | null>(null);

  if (!q.data) return null;
  const deal = q.data;
  const intake = readIntake(deal.account.intake);
  const nowIso = today ?? localIso();
  const close = closeDateFor({
    intake,
    stageHistory: deal.stage_history,
    wonStageKey: wonStage(deal.stages).key,
    today: nowIso,
  });
  const timeline = timelineFor(intake, close.date);
  const flow = stageFlow({
    stage: deal.account.stage,
    intake,
    owner: ownerName,
    gongReports: deal.gong_reports.length,
    hasSow: Boolean(deal.sow_url),
    hasBrief: deal.briefs.some((b) => b.status === "complete" && b.generator === "llm"),
    hasLink: Boolean((deal.account as { welcome_share_url?: string | null }).welcome_share_url),
    timeline,
  });
  const ws = workspaceFor({
    flow,
    intake,
    timeline,
    today: nowIso,
    parkingLot: parking.data ?? [],
    homeworkDone: welcome.data?.homeworkDone ?? {},
    link: welcome.data
      ? { sharedAt: welcome.data.sharedAt ?? null, openedAt: welcome.data.openedAt ?? null }
      : null,
  });

  const canonicalStages = flow.stages.filter((s) => CANONICAL_JOURNEY_KEYS.includes(s.key));
  const currentInCanon =
    flow.current && CANONICAL_JOURNEY_KEYS.includes(flow.current) ? flow.current : null;

  const shown = viewing ?? currentInCanon ?? "pre_kickoff";
  const stage = canonicalStages.find((s) => s.key === shown) ?? canonicalStages[0]!;
  const next = stage.tasks.find((t) => !t.done && !t.locked && !t.optional) ?? null;
  const manualTask = manual ? stage.tasks.find((t) => t.key === manual.key) : undefined;
  const openTask = manualTask && (manual!.wasDone || !manualTask.done) ? manualTask : next;

  const m = ws.nextMeeting;

  // Only the implementation's actual current stage, never a historical one
  // picked on the rail — the same stageFlow() the checklist itself reads.
  const kickoffOutcome = showKickoffOutcomePrompt(flow) ? { dealId, intake } : null;

  // Viewing a stage other than the actual current one: say so plainly, with
  // its position relative to current (completed/upcoming), and a way back.
  // Only when there IS an actual current stage on this rail to contrast
  // against — otherwise nothing is highlighted as "current" to confuse.
  const viewingOther = viewing !== null && currentInCanon !== null && viewing !== currentInCanon;
  const viewingPosition =
    viewingOther && currentInCanon
      ? canonicalStages.findIndex((s) => s.key === shown) <
        canonicalStages.findIndex((s) => s.key === currentInCanon)
        ? "Completed stage"
        : "Upcoming stage"
      : null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Update the implementation
        </div>
        <div className="space-y-2.5">
          {/* An implementation that came from a deal has its target on the plan; a proposed date moves the plan's live date. */}
          <TranscriptUpdatePanel
            customerId={customerId}
            implementationId={implementationId}
            planOwnsTarget={Boolean(dealId)}
            kickoffOutcome={kickoffOutcome}
          />
          <ImplementationUpdatePanel implementationId={implementationId} />
        </div>
      </div>

      <ImplementationTargetSection record={record} />

      <section
        className="rounded-md border border-border bg-card px-4 py-3"
        aria-label="Implementation status"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
          <span>
            <span className="text-muted-foreground">Owner</span>{" "}
            <span className="text-foreground">{ownerName ?? "Nobody yet"}</span>
          </span>
          {ws.ball ? (
            <span className="inline-flex items-center gap-1.5" title={ws.ball.detail}>
              <span className="text-muted-foreground">Ball</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  ws.ball.who === "customer"
                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                    : "bg-primary/10 text-primary",
                )}
              >
                {ws.ball.who === "customer" ? "With the customer" : "With us"}
              </span>
            </span>
          ) : null}
          <span>
            <span className="text-muted-foreground">Next action</span>{" "}
            <span className="text-foreground">
              {ws.nextStep ? ws.nextStep.label : "Nothing open"}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">Waiting on</span>{" "}
            <span className="text-foreground">
              {ws.waiting.length === 0
                ? "Nothing on anyone's desk"
                : ws.waiting.length === 1
                  ? ws.waiting[0]!.what
                  : `${ws.waiting[0]!.what} (+${ws.waiting.length - 1} more)`}
            </span>
          </span>
        </div>
      </section>

      <section
        className="rounded-md border border-border bg-card px-4 py-3"
        aria-label="Next customer meeting"
      >
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Next customer meeting
        </h2>
        {m?.booked && m.time ? (
          <>
            <p className="mt-1.5 text-[14px] font-semibold">{m.label}</p>
            <p className="text-[13px]">
              {whenLabel(m.date, m.time, intake.timeline.timezone)}
              {m.minutes ? <span className="text-muted-foreground"> · {m.minutes} min</span> : null}
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            No upcoming customer meeting scheduled
          </p>
        )}
      </section>

      {flow.current === "field_fusion" ? (
        // With a Partner Implementation Lead, before the handoff: its own
        // surface, never the Closed Won fallback below.
        <PartnerHandoffPanel deal={deal} editable={editable} />
      ) : flow.current === "closed_won" ? (
        // Closed Won's own gate tasks (assign an owner, the Gong brief, the
        // SOW, the sales handoff) are outside the canonical journey below
        // and would otherwise be unreachable from here — the same full
        // checklist the deal page runs, so completing them is never a dead
        // end: do it here and the canonical journey below picks up the
        // moment the deal moves on.
        <StageFlow deal={deal} />
      ) : (
        <section
          id="current-implementation-journey"
          className="overflow-hidden rounded-md border border-border bg-card"
          aria-label="Implementation journey"
        >
          <Stepper
            stages={canonicalStages}
            current={currentInCanon}
            shown={shown}
            onShow={(k) => {
              setViewing(k === currentInCanon ? null : k);
              setManual(null);
            }}
          />
          {viewingOther ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-amber-500/10 px-4 py-1.5 text-[12px]">
              <span>
                <span className="font-medium text-foreground">Viewing: {stage.label}</span>
                {viewingPosition ? (
                  <span className="text-muted-foreground"> · {viewingPosition}</span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => {
                  setViewing(null);
                  setManual(null);
                }}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Back to current stage
              </button>
            </div>
          ) : null}
          <StageTiming
            shown={shown}
            history={deal.stage_history}
            targetDate={stageTargetDate(shown, timeline)}
          />
          {isWorkingStageKey(shown) ? (
            // The working stages are ticks (meetings held, the plan's steps,
            // readiness, Go-Live, graduation) — the same list the deal page
            // runs, with its checkboxes. TaskBody has no body for a tick, so
            // routing these through TaskRow left every one of them unclickable.
            <OnboardingList
              deal={deal}
              intake={intake}
              tasks={stage.tasks}
              editable={editable}
              stageKey={shown}
              current={flow.current}
            />
          ) : stage.tasks.length > 0 ? (
            <ol className="divide-y divide-border">
              {stage.tasks.map((t, i) => (
                <TaskRow
                  key={t.key}
                  n={i + 1}
                  task={t}
                  open={openTask?.key === t.key}
                  onOpen={() => setManual({ key: t.key, wasDone: t.done })}
                >
                  <TaskBody task={t} deal={deal} intake={intake} editable={editable} />
                </TaskRow>
              ))}
            </ol>
          ) : (
            <p className="px-4 py-3 text-[13px] text-muted-foreground">
              Nothing to do yet at this stage.
            </p>
          )}
          <StageGuidancePanel shown={shown} />
        </section>
      )}

      <SolutionsCard deal={deal} editable={editable} />

      <ImplementationFocusPanel dealId={dealId} intake={intake} />

      <WorkflowStoryPanel dealId={dealId} intake={intake} />

      <ImplementationHistorySection
        dealStageHistory={deal.stage_history}
        journal={record.journal}
        risks={record.risks}
        issues={record.issues}
        decisions={record.decisions}
        evidence={record.evidence}
      />
    </div>
  );
}

/**
 * The deal is still a prospect: say so plainly, with the button that closes
 * it. Closing runs the Closed Won check (the Gong brief and the SOW), makes
 * the customer's page, and hands it to the rotation; anything already done
 * here counts straight away.
 */
function NotClosedBar({
  deal,
  editable,
  ready,
  onOpenTask,
}: {
  deal: DealData;
  editable: boolean;
  ready: boolean;
  onOpenTask: (key: "notes" | "sow") => void;
}) {
  const qc = useQueryClient();
  const { profile } = useProfile();
  const move = useServerFn(moveDealStage);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<WonGateMissing[] | null>(null);
  // Closed Won creates the customer's page, the plan and the assignment,
  // then the page redirects: several seconds. The bar says so the whole way.
  const [closed, setClosed] = useState(false);
  const m = useMutation({
    mutationFn: (force: boolean) =>
      move({
        data: force
          ? { dealId: deal.account.id, toStage: "closed_won", force: true }
          : { dealId: deal.account.id, toStage: "closed_won" },
      }),
    onMutate: () => setError(null),
    onSuccess: () => {
      setMissing(null);
      setClosed(true);
      void qc.invalidateQueries();
    },
    onError: (e) => {
      const gate = parseWonGate((e as Error).message);
      if (gate) setMissing(gate);
      else setError((e as Error).message);
    },
  });
  return (
    <div className="space-y-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-amber-900 dark:text-amber-200">
          {closed ? (
            <>
              <b>Closed Won.</b> Setting up the customer's page and the plan — this takes a few
              seconds, then the page opens on it.
            </>
          ) : (
            <>
              <b>Not closed yet.</b>{" "}
              {ready
                ? "Everything here is ready — close it and the deal moves on straight away."
                : "You can get ahead on these; nothing moves until the deal is Closed Won."}
            </>
          )}
        </span>
        {editable && !closed ? (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={m.isPending}
            onClick={() => m.mutate(false)}
          >
            {m.isPending ? "Closing…" : "Mark Closed Won"}
          </button>
        ) : null}
        {error ? <p className="w-full text-destructive">{error}</p> : null}
      </div>
      {missing ? (
        <ClosedWonGateNotice
          missing={missing}
          dealId={deal.account.id}
          onOpen={onOpenTask}
          canForce={canManage(profile?.role)}
          onForce={() => m.mutate(true)}
          forcing={m.isPending}
        />
      ) : null}
    </div>
  );
}

/** The deal stage's name on the rail, for "moving the deal to …". */
function stageLabelFor(stage: AccountStage | null): string {
  if (!stage) return "the next stage";
  return FLOW_STAGES.find((s) => s.stage === stage)?.label ?? stage;
}

/** One line under the stage name: what moves the deal on from here. */
function stageFooter(
  shown: FlowStageKey,
  current: FlowStageKey | null,
  path: IntakeAnswers["path"],
): string {
  if (current === "prospect" && shown === "closed_won")
    return "Moves to Closed Won when the deal is marked won; everything here can be done ahead.";
  if (current === "negotiate" && shown === "closed_won")
    return "Assign the TIS now so they can join the closing call. Moves to Closed Won when the deal is marked won; everything else here can be done ahead.";
  if (shown !== current) return "Not the current stage — you can still work ahead.";
  switch (shown) {
    case "prospect":
      return "Moves to Closed Won when the deal is marked won.";
    case "negotiate":
      return "Sales is closing. Assign the TIS now; the deal moves to Closed Won when it is marked won.";
    case "closed_won":
      return "Moves to Intake & Process when the review is approved.";
    case "field_fusion":
      return "Moves to Intake & Process when the setup is handed over.";
    case "pre_kickoff":
      return path === "new_logo"
        ? "Gate: Ready for Kickoff — the handoff complete, the customer ready, the AE answered, the prep done and all three meetings booked."
        : "Gate: Ready for Kickoff — the handoff complete, the customer ready, the AE answered, the cadence on and the kickoff booked.";
    case "kickoff":
      return "Gate: Kickoff held — the kickoff call happened.";
    case "get_it_working":
      return "Gate: Working end to end — Stage 1 held, the plan and dates agreed, one submission end to end.";
    case "make_it_yours":
      return "Gate: Ready to run — Stage 2 held, real data in, and they can run it without us (Functional).";
    case "make_it_run":
      return "Gate: Operational Go-Live — Stage 3 held, what the SOW bought delivered, their people using it for real.";
    case "complete":
      return "The proof window: close it out, then finish as Proven or Not Proven.";
    default:
      return "";
  }
}

function Stepper({
  stages,
  current,
  shown,
  onShow,
}: {
  stages: ReturnType<typeof stageFlow>["stages"];
  current: FlowStageKey | null;
  shown: FlowStageKey;
  onShow: (k: FlowStageKey) => void;
}) {
  const at = stages.findIndex((s) => s.key === current);
  return (
    <ol className="flex flex-wrap items-center gap-1 px-4 py-2.5">
      {stages.map((s, i) => {
        const past = at >= 0 && i < at;
        const isCurrent = s.key === current;
        return (
          <li key={s.key} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onShow(s.key)}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                isCurrent
                  ? "border-primary bg-primary text-primary-foreground"
                  : past
                    ? "border-status-ontrack-foreground/40 bg-status-ontrack/60 text-status-ontrack-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                s.key === shown && !isCurrent && "ring-2 ring-primary/40",
              )}
            >
              {past ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              {s.label}
            </button>
            {i < stages.length - 1 ? (
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function TaskRow({
  n,
  task,
  open,
  onOpen,
  children,
}: {
  n: number;
  task: FlowTask;
  open: boolean;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <li className={cn("px-4 py-2.5", open && "bg-primary/5")}>
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
            task.done
              ? "border-status-ontrack-foreground bg-status-ontrack text-status-ontrack-foreground"
              : open
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground",
          )}
        >
          {task.done ? <Check className="h-3 w-3" strokeWidth={3} /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            disabled={open}
            className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-left disabled:cursor-default"
          >
            <span
              className={cn(
                "text-[13px] font-medium",
                !task.done && task.locked && "text-muted-foreground",
              )}
            >
              {task.label}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {task.done ? (
                <>
                  {task.summary}
                  {!open ? <span className="ml-2 underline decoration-dotted">Change</span> : null}
                </>
              ) : task.locked && !open ? (
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-3 w-3" /> {task.locked}
                </span>
              ) : null}
            </span>
          </button>
          {open ? (
            <div className="mt-2 space-y-2">
              <p className="text-[12px] text-muted-foreground">{task.hint}</p>
              {task.locked && !task.done ? (
                <p className="text-[12px] text-amber-800 dark:text-amber-300">{task.locked}.</p>
              ) : null}
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function TaskBody({
  task,
  deal,
  intake,
  editable,
}: {
  task: FlowTask;
  deal: DealData;
  intake: IntakeAnswers;
  editable: boolean;
}) {
  switch (task.action) {
    case "deal_type":
      return <DealTypeBody deal={deal} intake={intake} editable={editable} />;
    case "assign":
      return task.locked ? null : <AssignBody dealId={deal.account.id} editable={editable} />;
    case "notes":
      return <NotesIn deal={deal} editable={editable} />;
    case "sow":
      return <SowStep deal={deal} editable={editable} />;
    case "review":
      return task.locked && !task.done ? null : (
        <ReviewBody deal={deal} intake={intake} editable={editable} />
      );
    case "reply_ae":
      return <ReplyBody deal={deal} intake={intake} editable={editable} />;
    case "cadence":
      return <CadenceBody deal={deal} intake={intake} editable={editable} />;
    case "kickoff":
      return <KickoffBody deal={deal} intake={intake} editable={editable} />;
    case "field_fusion":
      return <FieldFusionGate deal={deal} editable={editable} />;
    case "prep":
      return <PrepBody deal={deal} intake={intake} editable={editable} />;
    case "book_core":
      return <BookCoreBody deal={deal} intake={intake} editable={editable} />;
    case "intake":
      return <IntakeCompleteBody deal={deal} intake={intake} editable={editable} />;
    case "process_understanding":
      return <ProcessUnderstandingBody deal={deal} intake={intake} editable={editable} />;
    case "process_call":
      return <ProcessCallBody deal={deal} intake={intake} editable={editable} />;
    case "solution":
      return (
        <p className="text-[12px] text-muted-foreground">
          {task.summary ? `Now: ${task.summary}. ` : ""}
          Managed on the Purchased solutions card — the owner, the steps, who has the ball, and how
          it ends.
        </p>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------ the bodies */

function IntakeCompleteBody({
  deal,
  intake,
  editable,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  editable: boolean;
}) {
  const tick = useHandoffTick(deal.account.id);
  const done = tick.isOn("intake_complete", Boolean(intake.handoff_tasks["intake_complete"]));
  return (
    <div className="space-y-2">
      <DoneButton
        done={done}
        label="Mark the intake complete"
        pending={tick.isPending}
        disabled={!editable}
        onClick={() => tick.mutate({ key: "intake_complete", on: !done })}
      />
      {tick.error ? (
        <p role="alert" className="text-[12px] text-destructive">
          {tick.error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The TIS's own call, captured either way so how often the intake is enough
 * is reportable later. Yes needs no more; No adds the Process Call task.
 */
function ProcessUnderstandingBody({
  deal,
  intake,
  editable,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const value = intake.handoff_tasks["process_understanding"] ?? null;
  const m = useMutation({
    mutationFn: (v: "yes" | "no") =>
      save({
        data: {
          dealId: deal.account.id,
          patch: { handoff_tasks: { process_understanding: v } },
        } as never,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] });
    },
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!editable || m.isPending}
          onClick={() => m.mutate("yes")}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-[12px] font-medium disabled:opacity-50",
            value === "yes"
              ? "bg-primary text-primary-foreground"
              : "border border-border hover:bg-muted",
          )}
        >
          {value === "yes" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
          Yes — enough to prepare
        </button>
        <button
          type="button"
          disabled={!editable || m.isPending}
          onClick={() => m.mutate("no")}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-[12px] font-medium disabled:opacity-50",
            value === "no"
              ? "bg-primary text-primary-foreground"
              : "border border-border hover:bg-muted",
          )}
        >
          {value === "no" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
          No — hold a Process Call
        </button>
      </div>
      {m.isError ? (
        <p role="alert" className="text-[12px] text-destructive">
          {(m.error as Error).message}
        </p>
      ) : null}
    </div>
  );
}

function ProcessCallBody({
  deal,
  intake,
  editable,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  editable: boolean;
}) {
  const tick = useHandoffTick(deal.account.id);
  const done = tick.isOn("process_call_held", Boolean(intake.handoff_tasks["process_call_held"]));
  return (
    <div className="space-y-2">
      <DoneButton
        done={done}
        label="Mark the Process Call held"
        pending={tick.isPending}
        disabled={!editable}
        onClick={() => tick.mutate({ key: "process_call_held", on: !done })}
      />
      {tick.error ? (
        <p role="alert" className="text-[12px] text-destructive">
          {tick.error}
        </p>
      ) : null}
    </div>
  );
}

function AssignBody({ dealId, editable }: { dealId: string; editable: boolean }) {
  const qc = useQueryClient();
  const { profile } = useProfile();
  const assign = useServerFn(assignDealFn);
  const claim = useServerFn(claimDealFn);
  const q = useQuery({
    queryKey: ["assignment", dealId],
    queryFn: () => getDealAssignment({ data: { dealId } }),
  });
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Everything: the customer header and the board show the owner too.
  const done = () => void qc.invalidateQueries();
  const m = useMutation({
    mutationFn: (teamMemberId: string | null) => assign({ data: { dealId, teamMemberId } }),
    onMutate: () => setError(null),
    onSuccess: (r) => {
      if (!r) setError("Nobody is in the assignment pool. Add people under Admin → Assignment.");
      done();
    },
    onError: (e) => setError((e as Error).message),
  });
  const c = useMutation({
    mutationFn: () => claim({ data: { dealId } }),
    onMutate: () => setError(null),
    onSuccess: done,
    onError: (e) => setError((e as Error).message),
  });
  const a = q.data;
  if (!a) return <p className="text-[12px] text-muted-foreground">Loading the team…</p>;
  const manager = canManage(profile?.role);
  const myEmail = (profile?.email ?? "").toLowerCase();
  const inPool = Boolean(myEmail) && a.pool.some((p) => (p.email ?? "").toLowerCase() === myEmail);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {manager && editable ? (
        <>
          <select
            className="h-8 rounded-sm border border-border bg-background px-2 text-[12px]"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            disabled={m.isPending}
            aria-label="Who owns this onboarding"
          >
            <option value="">
              {a.nextUp ? `Next in rotation — ${a.nextUp.name}` : "Pick someone…"}
            </option>
            <MemberOptions members={a.members} />
          </select>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={m.isPending || (!pick && !a.nextUp)}
            onClick={() => m.mutate(pick || null)}
          >
            <UserRoundCheck className="h-3.5 w-3.5" />
            {m.isPending ? "Assigning…" : a.owner ? "Reassign" : "Assign"}
          </button>
        </>
      ) : null}
      {!a.owner && inPool ? (
        <button
          type="button"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-[12px] font-medium disabled:opacity-50",
            manager
              ? "border border-border hover:bg-muted"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
          disabled={c.isPending}
          onClick={() => c.mutate()}
        >
          {c.isPending ? "Claiming…" : "Take it myself"}
        </button>
      ) : null}
      {!manager && !inPool && !a.owner ? (
        <p className="text-[12px] text-muted-foreground">
          A manager assigns this, or someone in the assignment pool takes it.
        </p>
      ) : null}
      {a.owner ? (
        <p className="text-[12px] text-muted-foreground">
          Owned by <b className="text-foreground">{a.owner.name}</b>.
        </p>
      ) : null}
      {error ? <p className="w-full text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}

/**
 * The one review. What the AI read, laid out to be checked in a glance —
 * the flow, the forms, the process, what the SOW bought, and what the calls
 * never said — each with where it came from. Edit opens the answers in
 * place; Approve moves the deal to Pre-kickoff once the deck exists.
 */
function ReviewBody({
  deal,
  intake,
  editable,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  editable: boolean;
}) {
  const tick = useHandoffTick(deal.account.id);
  const welcome = useQuery({
    queryKey: ["welcome", deal.account.id],
    queryFn: () => getWelcome({ data: { dealId: deal.account.id } }),
  });
  const running = readingInFlight(intake.ai_reading);
  const flowDone = intake.path !== null && flowAnswered(intake);
  const hasBrief = deal.briefs.some((b) => b.status === "complete" && b.generator === "llm");
  const hasLink = Boolean(
    (deal.account as { welcome_share_url?: string | null }).welcome_share_url,
  );
  const [editing, setEditing] = useState(false);
  const approved = tick.isOn("reviewed", Boolean(intake.handoff_tasks["reviewed"]));
  const forms = formsOnly(intake);
  const services = intake.timeline.services ?? [];
  const blanks = welcome.data?.readiness ?? [];
  const showEdit = editing || (!running && !flowDone);
  const why = !hasBrief
    ? "The AI has not read the Gong brief yet"
    : !hasLink
      ? "The customer's page is not made yet — read again"
      : !flowDone
        ? "Pick the onboarding flow first"
        : null;

  return (
    <div className="space-y-3">
      <ReadingStatus deal={deal} editable={editable} />
      {hasBrief || intake.path ? (
        <dl className="grid gap-x-4 gap-y-1.5 rounded-md border border-border bg-background px-3 py-2.5 text-[12px] sm:grid-cols-[140px_1fr]">
          <dt className="text-muted-foreground">Type of deal</dt>
          <dd>
            {intake.path ? (
              DEAL_TYPES.find((t) => t.path === intake.path)!.label
            ) : (
              <i className="text-amber-700">not set — answer the first question</i>
            )}
            {intake.training_only ? " · training only" : ""}
            <AiSource answers={intake} field="path" />
          </dd>
          {!intake.training_only && intake.path !== "field_fusion" ? (
            <>
              <dt className="text-muted-foreground">First form</dt>
              <dd>
                {firstFormName(intake) ?? <i className="text-amber-700">not named</i>}
                {forms.length > 1 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · then{" "}
                    {forms
                      .slice(1)
                      .map((f) => f.name)
                      .join(", ")}
                  </span>
                ) : null}
                <AiSource answers={intake} field="wanted_forms" />
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Process today</dt>
          <dd>
            {intake.current_process ?? <i className="text-amber-700">not described</i>}
            <AiSource answers={intake} field="current_process" />
          </dd>
          <dt className="text-muted-foreground">From the SOW</dt>
          <dd>
            {services.length
              ? services.map((sv) => `${sv.name} (phase ${sv.phase})`).join(" · ")
              : deal.sow_url
                ? "Core only — no services"
                : "No SOW"}
          </dd>
          {blanks.length ? (
            <>
              <dt className="text-muted-foreground">The calls did not say</dt>
              <dd className="text-amber-800 dark:text-amber-300">
                {blanks.map((b) => b.label).join(" · ")}
                <span className="block text-[11px] text-muted-foreground">
                  Fine to leave: the deck marks each one for you to fill on the call.
                </span>
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}
      {showEdit ? (
        <div className="space-y-2 rounded-md border border-border px-3 py-2.5">
          <FlowStep deal={deal} editable={editable} />
          <details className="rounded-sm border border-border px-2.5 py-1.5">
            <summary className="cursor-pointer text-[12px] font-medium">
              Industry, size, people in the field, the process today
            </summary>
            <div className="mt-2">
              <FactsStep deal={deal} editable={editable} />
            </div>
          </details>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <DoneButton
          done={approved}
          label="Looks right — approve"
          pending={tick.isPending}
          disabled={!editable || running || (!approved && Boolean(why))}
          onClick={() => tick.mutate({ key: "reviewed", on: !approved })}
        />
        {!showEdit || editing ? (
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-sm border border-border px-3 text-[12px] hover:bg-muted"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Done editing" : "Edit"}
          </button>
        ) : null}
        {hasLink ? (
          <Link
            to="/onboarding-plan/$dealId"
            params={{ dealId: deal.account.id }}
            className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[12px] hover:bg-muted"
          >
            Open the deck <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
        {why && !running && !approved ? (
          <span className="text-[11px] text-muted-foreground">{why}.</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The one question that decides the plan. Four choices, each saying how
 * that kind of onboarding runs; the calls' suggestion is pre-marked, and a
 * change of mind asks first because it rebuilds the dates.
 */
function DealTypeBody({
  deal,
  intake,
  editable,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (path: (typeof DEAL_TYPES)[number]["path"]) =>
      save({ data: { dealId: deal.account.id, patch: { path } } as never }),
    onMutate: () => setError(null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] });
      void qc.invalidateQueries({ queryKey: ["welcome", deal.account.id] });
    },
    onError: (e) => setError((e as Error).message),
  });
  const suggested = intake.path === null ? intake.path_suggested : null;
  const pick = async (path: (typeof DEAL_TYPES)[number]["path"]) => {
    if (intake.path === path) return;
    if (
      intake.path !== null &&
      !(await ask({
        title: "Change the deal type?",
        body: "Changing the type rebuilds the plan: the phases, the go-live date and what the customer's page says.",
        confirmLabel: "Change type",
      }))
    )
      return;
    m.mutate(path);
  };
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {DEAL_TYPES.map((t) => {
          const active = intake.path === t.path;
          return (
            <button
              key={t.path}
              type="button"
              disabled={!editable || m.isPending}
              onClick={() => void pick(t.path)}
              aria-pressed={active}
              className={cn(
                "rounded-md border px-3 py-2.5 text-left transition-colors disabled:opacity-60",
                active
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              <span className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                {t.label}
                {active ? (
                  <Check className="h-4 w-4 text-primary" strokeWidth={3} />
                ) : suggested === t.path ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    The calls suggest this
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[12px] text-muted-foreground">{t.plan}</span>
            </button>
          );
        })}
      </div>
      <AiSource answers={intake} field="path" />
      {m.isPending ? <p className="text-[12px] text-muted-foreground">Saving…</p> : null}
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}

/** Tick one of the pre-kickoff tasks that live nowhere else. */
/** The handoff tasks' ticks: the box changes at once, the save follows. */
export function useHandoffTick(dealId: string) {
  return useOptimisticTick({ dealId, section: "handoff_tasks" });
}

function DoneButton({
  done,
  label,
  pending,
  disabled,
  onClick,
}: {
  done: boolean;
  label: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  // The button never waits on the save: the state shown is the state
  // clicked, and a failed save reverts it with a message.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={pending ? "Saving…" : undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-[12px] font-medium disabled:opacity-50",
        done
          ? "border border-border hover:bg-muted"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
      )}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
      {done ? "Undo" : label}
    </button>
  );
}

function ReplyBody({
  deal,
  intake,
  editable,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  editable: boolean;
}) {
  const tick = useHandoffTick(deal.account.id);
  const done = tick.isOn("reply_ae", Boolean(intake.handoff_tasks["reply_ae"]));
  const share = (deal.account as { welcome_share_url?: string | null }).welcome_share_url ?? null;
  const assignment = useQuery({
    queryKey: ["assignment", deal.account.id],
    queryFn: () => getDealAssignment({ data: { dealId: deal.account.id } }),
  });
  const planned = timelineFor(
    intake,
    closeDateFor({
      intake,
      stageHistory: deal.stage_history,
      wonStageKey: wonStage(deal.stages).key,
      today: localIso(),
    }).date,
  ).milestones.find((m) => m.key === "kickoff");
  const draft = aeReplyDraft({
    company: customerFacingName(deal.account),
    contactName: deal.account.primary_contact_name ?? null,
    ownerName: assignment.data?.owner?.name ?? null,
    intake,
    welcomeUrl: share,
    plannedKickoff: planned?.date ?? null,
    today: localIso(),
    timezone:
      intake.timeline.timezone ??
      (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null),
  });
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 6000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div className="space-y-2">
      <p className="text-[12px]">
        Reply-all to the AE's closed-won email with this — written for you from the deal.
      </p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background px-3 py-2 font-sans text-[12px] leading-relaxed">
        <b>Subject: {draft.subject}</b>
        {"\n\n"}
        {draft.body}
      </pre>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex h-8 min-w-[9.5rem] items-center justify-center gap-1.5 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
          onClick={() => {
            void navigator.clipboard
              .writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
              .then(() => setCopied(true));
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy the email"}
        </button>
        <DoneButton
          done={done}
          label="Sent — mark it done"
          pending={tick.isPending}
          disabled={!editable}
          onClick={() => tick.mutate({ key: "reply_ae", on: !done })}
        />
      </div>
    </div>
  );
}

function CadenceBody({
  deal,
  intake,
  editable,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  editable: boolean;
}) {
  const tick = useHandoffTick(deal.account.id);
  const done = tick.isOn("cadence", Boolean(intake.handoff_tasks["cadence"]));
  const cadence = useQuery({ queryKey: ["kickoff-cadence"], queryFn: () => getKickoffCadence() });
  const { profile } = useProfile();
  return (
    <div className="space-y-2">
      {/* WHICH cadence. The Hub says it; the reader never has to know. */}
      {cadence.data?.name ? (
        <p className="text-[13px]">
          Cadence:{" "}
          {cadence.data.url ? (
            <a
              href={cadence.data.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline"
            >
              {cadence.data.name}
            </a>
          ) : (
            <span className="font-medium">{cadence.data.name}</span>
          )}
          <span className="text-muted-foreground"> in Salesloft</span>
        </p>
      ) : cadence.isPending ? null : (
        <p className="text-[12px] text-amber-800 dark:text-amber-300">
          The cadence has not been named yet.{" "}
          {canManage(profile?.role) ? (
            <Link to="/settings" className="underline">
              Name it under Settings → Kickoff cadence
            </Link>
          ) : (
            "Ask a manager to name it under Settings → Kickoff cadence."
          )}
        </p>
      )}
      <table className="w-full max-w-xl text-[12px]">
        <tbody>
          {KICKOFF_CADENCE.map((c) => (
            <tr key={c.day} className="border-b border-border last:border-0">
              <td className="w-16 py-1 pr-3 font-mono text-[11px] text-muted-foreground">
                {c.day}
              </td>
              <td className="py-1">{c.step}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-muted-foreground">
        Take them out of the cadence once the first meeting is on the calendar.
      </p>
      <DoneButton
        done={done}
        label="Added to the cadence"
        pending={tick.isPending}
        disabled={!editable}
        onClick={() => tick.mutate({ key: "cadence", on: !done })}
      />
    </div>
  );
}

/**
 * The first meeting's booking: date, time, zone, then the invite. On the
 * Pre-kickoff checklist for the TIS, and on the handoff for Sales to book it
 * before the close — the same form, the same record.
 */
export function KickoffBody({
  deal,
  intake,
  editable,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const t = intake.timeline;
  const planned = timelineFor(
    intake,
    closeDateFor({
      intake,
      stageHistory: deal.stage_history,
      wonStageKey: wonStage(deal.stages).key,
      today: localIso(),
    }).date,
  ).milestones.find((m) => m.key === "kickoff");
  const browserZone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  const [date, setDate] = useState(t.overrides["kickoff"] ?? planned?.date ?? "");
  // 10:00 unless it was booked at another time: an empty time field was a
  // disabled button with no reason, which read as the page freezing.
  const [time, setTime] = useState(t.times["kickoff"] ?? "10:00");
  const [zone, setZone] = useState(t.timezone ?? browserZone ?? "America/New_York");
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          dealId: deal.account.id,
          patch: { timeline: bookMeetingPatch(t, [{ key: "kickoff", date, time }], zone) },
        } as never,
      }),
    onMutate: () => setError(null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] });
      void qc.invalidateQueries({ queryKey: ["welcome", deal.account.id] });
    },
    onError: (e) => setError((e as Error).message),
  });
  const booked = Boolean(t.overrides["kickoff"] && t.times["kickoff"]);
  const changed =
    date !== (t.overrides["kickoff"] ?? "") ||
    time !== (t.times["kickoff"] ?? "") ||
    zone !== (t.timezone ?? "");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-muted-foreground">
          Date
          <input
            type="date"
            className="mt-0.5 block h-8 rounded-sm border border-border bg-background px-2 text-[12px] text-foreground"
            value={date}
            disabled={!editable || m.isPending}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Time
          {/* A list, not the browser's time box: that one reports nothing
              until AM/PM is filled too, and a half-typed time blanked out
              the moment you clicked away. */}
          <select
            className="mt-0.5 block h-8 rounded-sm border border-border bg-background px-2 text-[12px] text-foreground"
            value={time}
            disabled={!editable || m.isPending}
            onChange={(e) => setTime(e.target.value)}
          >
            {[...new Set([time, ...TIMES])].sort().map((v) => (
              <option key={v} value={v}>
                {clock(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted-foreground">
          Their time zone
          <select
            className="mt-0.5 block h-8 w-48 rounded-sm border border-border bg-background px-2 text-[12px] text-foreground"
            value={zone}
            disabled={!editable || m.isPending}
            onChange={(e) => setZone(e.target.value)}
          >
            {[...new Set([zone, ...ZONES.map((z) => z[0])])].map((z) => (
              <option key={z} value={z}>
                {ZONES.find((x) => x[0] === z)?.[1] ?? z}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={!editable || m.isPending || !date || !time || (booked && !changed)}
          onClick={() => m.mutate()}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
          {m.isPending ? "Saving…" : booked ? "Reschedule to this time" : "Kickoff is booked"}
        </button>
      </div>
      {!date || !time ? (
        <p className="text-[12px] text-amber-800 dark:text-amber-300">
          Pick {!date ? "the date" : "the time"} the customer agreed to.
        </p>
      ) : !booked ? (
        <p className="text-[11px] text-muted-foreground">
          {planned
            ? `The plan had it on ${planned.date}. Every date after the kickoff moves with it.`
            : "Every date after the kickoff moves with it."}
        </p>
      ) : null}
      {booked ? (
        <div className="rounded-md border border-status-ontrack-foreground/30 bg-status-ontrack/40 px-3 py-2 text-[12px] text-status-ontrack-foreground">
          <Check className="mr-1 inline h-3.5 w-3.5" strokeWidth={3} />
          Kickoff booked for {t.overrides["kickoff"]} at {clock(t.times["kickoff"]!)}
          {t.timezone
            ? ` (${ZONES.find((z) => z[0] === t.timezone)?.[1] ?? t.timezone})`
            : ""}.{" "}
          <span className="text-foreground">
            {deal.account.stage === "prospect" || deal.account.stage === "negotiate"
              ? "Next: mark the deal Closed Won at the top — it goes on to Kickoff once Intake & Process is done."
              : deal.account.stage === "closed_won"
                ? "Next: finish the Closed Won tasks — the deal then moves on through Intake & Process."
                : deal.account.stage === "onboarding_kickoff"
                  ? "Moving the deal to Kickoff once Intake & Process's gate is met…"
                  : "Next: send the invite below, then run the call."}
          </span>
        </div>
      ) : null}
      {booked && t.timezone ? (
        <InviteLinks
          deal={deal}
          date={t.overrides["kickoff"]!}
          time={t.times["kickoff"]!}
          zone={t.timezone}
        />
      ) : null}
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}

/** Kickoff times on offer: every quarter hour, 7:00 to 6:00 pm. */
const TIMES: readonly string[] = Array.from({ length: 45 }, (_, i) => {
  const mins = 7 * 60 + i * 15;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
});

/** "14:30" → "2:30 pm". */
function clock(v: string): string {
  const [h, m] = v.split(":").map(Number) as [number, number];
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** The zones a kickoff is booked in, with the words a person reads. */
const ZONES: ReadonlyArray<[string, string]> = [
  ["America/New_York", "Eastern"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"],
  ["America/Los_Angeles", "Pacific"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
  ["America/Halifax", "Atlantic"],
  ["Europe/London", "UK"],
  ["Australia/Sydney", "Sydney"],
];

/**
 * The invite, one click from the booked time: a Google Calendar event with
 * the contact on it and the welcome page in it, or the .ics for Outlook.
 */
function InviteLinks({
  deal,
  date,
  time,
  zone,
  event = "kickoff",
  title = "kickoff and first form",
  about = "Training day 1: introductions, your process walked together, then your first form built and published.",
  label = "Send the invite:",
  minutes = 60,
}: {
  deal: DealData;
  date: string;
  time: string;
  zone: string;
  event?: string;
  title?: string;
  about?: string;
  label?: string;
  /** The meeting's length, from the plan's milestone. */
  minutes?: number;
}) {
  const share = (deal.account as { welcome_share_url?: string | null }).welcome_share_url ?? null;
  const token = share ? share.split("/").filter(Boolean).pop() : null;
  let google: string | null = null;
  try {
    google = googleCalendarLink({
      title: `${customerFacingName(deal.account)} × GoCanvas — ${customerLabel(title)}`,
      date,
      time,
      timezone: zone,
      minutes,
      details: `${about}${share ? `\n\nYour welcome page: ${share}` : ""}`,
      guests: deal.account.primary_contact_email ? [deal.account.primary_contact_email] : [],
    });
  } catch {
    google = null; // an unknown time zone: the .ics still works
  }
  const cls =
    "inline-flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[12px] hover:bg-muted";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-medium">{label}</span>
      {google ? (
        <a href={google} target="_blank" rel="noreferrer noopener" className={cls}>
          Google Calendar
        </a>
      ) : null}
      {token ? (
        <a href={`/api/welcome-ics/${token}?event=${event}`} className={cls}>
          Outlook / .ics
        </a>
      ) : null}
    </div>
  );
}

/** The playbook's "come prepared": three ticks, each with what good looks like. */
function PrepBody({
  deal,
  intake,
  editable,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  editable: boolean;
}) {
  const tick = useHandoffTick(deal.account.id);
  return (
    <ul className="space-y-1.5">
      {PREP_ITEMS.map((p) => {
        const on = tick.isOn(p.key, Boolean(intake.handoff_tasks[p.key]));
        return (
          <li key={p.key}>
            <label className="flex cursor-pointer items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={on}
                disabled={!editable}
                onChange={(e) => tick.mutate({ key: p.key, on: e.target.checked })}
              />
              <span>
                <span className={cn(on && "text-muted-foreground line-through")}>{p.label}</span>
                <span className="block text-[11px] text-muted-foreground">{p.hint}</span>
              </span>
            </label>
          </li>
        );
      })}
      <li className="pt-1 text-[11px] text-muted-foreground">
        Not ready? Say so here rather than on the call. No starting form possible? Use Stage 1 to
        get the decisions, so Stage 2 starts prepared.
      </li>
      {tick.error ? (
        <li role="alert" className="text-[12px] text-destructive">
          {tick.error}
        </li>
      ) : null}
    </ul>
  );
}

/**
 * All three core meetings on the calendar at once — the playbook's rule. One
 * row per stage, one time zone, one save; then an invite per stage. Every
 * date after a moved one follows, and any row can be changed for a
 * reschedule.
 */
function BookCoreBody({
  deal,
  intake,
  editable,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const t = intake.timeline;
  const plan = timelineFor(
    intake,
    closeDateFor({
      intake,
      stageHistory: deal.stage_history,
      wonStageKey: wonStage(deal.stages).key,
      today: localIso(),
    }).date,
  );
  const plannedDate = (k: string) => plan.milestones.find((m) => m.key === k)?.date ?? "";
  // The plan's own words for each meeting: "Stage 1 — Get it working" on a new
  // logo, "Stage 1 — Get it working: the form the integration reads" on an
  // existing account.
  const labelFor = (k: string) =>
    plan.milestones.find((m) => m.key === k)?.label ??
    CORE_MEETINGS.find((c) => c.key === k)?.label ??
    k;
  const browserZone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  const [rows, setRows] = useState(() =>
    CORE_MEETINGS.map((m) => ({
      key: m.key,
      date: t.overrides[m.key] ?? plannedDate(m.key),
      time: t.times[m.key] ?? "10:00",
    })),
  );
  const [zone, setZone] = useState(t.timezone ?? browserZone ?? "America/New_York");
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          dealId: deal.account.id,
          patch: { timeline: bookMeetingPatch(t, rows, zone) },
        } as never,
      }),
    onMutate: () => setError(null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] });
      void qc.invalidateQueries({ queryKey: ["welcome", deal.account.id] });
    },
    onError: (e) => setError((e as Error).message),
  });
  const booked = CORE_MEETINGS.every((c) => t.overrides[c.key] && t.times[c.key]);
  const order = rows.every((r, i) => i === 0 || r.date > rows[i - 1]!.date);
  // What each chosen day runs into — a stakeholder's absence, a deadline it
  // falls after — from the dates the SOW and the calls stated.
  const latestBrief =
    deal.briefs.find((b) => b.status === "complete" && b.generator === "llm") ?? null;
  const typed = typedDatesFor({ brief: latestBrief?.structured_json ?? null, intake });
  const typedAll = [...(typed.sow ?? []), ...(typed.brief ?? [])];
  const warningsFor = (date: string) => (date ? bookingWarnings(date, typedAll) : []);
  const changed =
    rows.some((r) => r.date !== (t.overrides[r.key] ?? "") || r.time !== (t.times[r.key] ?? "")) ||
    zone !== (t.timezone ?? "");
  const zoneName = ZONES.find((z) => z[0] === zone)?.[1] ?? zone;
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        {CORE_MEETINGS.map((c, i) => (
          <div key={c.key} className="flex flex-wrap items-end gap-2">
            <span className="w-56 pb-1.5 text-[12px] font-medium">{labelFor(c.key)}</span>
            <input
              type="date"
              aria-label={`${labelFor(c.key)} date`}
              className="h-8 rounded-sm border border-border bg-background px-2 text-[12px]"
              value={rows[i]!.date}
              disabled={!editable || m.isPending}
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((r, j) => (j === i ? { ...r, date: e.target.value } : r)),
                )
              }
            />
            <select
              aria-label={`${labelFor(c.key)} time`}
              className="h-8 rounded-sm border border-border bg-background px-2 text-[12px]"
              value={rows[i]!.time}
              disabled={!editable || m.isPending}
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((r, j) => (j === i ? { ...r, time: e.target.value } : r)),
                )
              }
            >
              {[...new Set([rows[i]!.time, ...TIMES])].sort().map((v) => (
                <option key={v} value={v}>
                  {clock(v)}
                </option>
              ))}
            </select>
            {warningsFor(rows[i]!.date).map((w) => (
              <span
                key={w}
                role="alert"
                className="w-full text-[11px] text-amber-800 dark:text-amber-300"
              >
                {w} — check the date before it goes out.
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-muted-foreground">
          Their time zone
          <select
            className="mt-0.5 block h-8 w-48 rounded-sm border border-border bg-background px-2 text-[12px] text-foreground"
            value={zone}
            disabled={!editable || m.isPending}
            onChange={(e) => setZone(e.target.value)}
          >
            {[...new Set([zone, ...ZONES.map((z) => z[0])])].map((z) => (
              <option key={z} value={z}>
                {ZONES.find((x) => x[0] === z)?.[1] ?? z}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={
            !editable || m.isPending || rows.some((r) => !r.date) || !order || (booked && !changed)
          }
          onClick={() => m.mutate()}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
          {m.isPending ? "Saving…" : booked ? "Save the new times" : "All three are booked"}
        </button>
      </div>
      {!order ? (
        <p className="text-[12px] text-amber-800 dark:text-amber-300">
          Stage 2 has to fall after Stage 1, and Stage 3 after Stage 2.
        </p>
      ) : !booked ? (
        <p className="text-[11px] text-muted-foreground">
          Pre-filled from the plan. Change any date to what they agreed; every date after it
          follows.
        </p>
      ) : null}
      {booked ? (
        <div className="space-y-1.5 rounded-md border border-status-ontrack-foreground/30 bg-status-ontrack/40 px-3 py-2">
          <p className="text-[12px] text-status-ontrack-foreground">
            <Check className="mr-1 inline h-3.5 w-3.5" strokeWidth={3} />
            All three booked ({zoneName}). Send each invite:
          </p>
          {t.timezone
            ? CORE_MEETINGS.map((c) => (
                <InviteLinks
                  key={c.key}
                  deal={deal}
                  date={t.overrides[c.key]!}
                  time={t.times[c.key]!}
                  zone={t.timezone!}
                  event={c.key}
                  title={labelFor(c.key)}
                  about={plan.milestones.find((x) => x.key === c.key)?.detail ?? ""}
                  label={`${labelFor(c.key)} — ${t.overrides[c.key]} ${clock(t.times[c.key]!)}:`}
                  minutes={plan.milestones.find((x) => x.key === c.key)?.minutes ?? 60}
                />
              ))
            : null}
        </div>
      ) : null}
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------- the onboarding */

/**
 * The Onboarding stage: the plan's steps and every service the SOW bought,
 * each one tick on its own row. No rows to open — a tick is the whole job.
 */
function OnboardingList({
  deal,
  intake,
  tasks,
  editable,
  stageKey,
  current,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  tasks: FlowTask[];
  editable: boolean;
  /** Which of the working stages this list is. */
  stageKey: FlowStageKey;
  current: FlowStageKey | null;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const move = useServerFn(moveDealStage);
  const grad = useHandoffTick(deal.account.id);
  const [error, setError] = useState<string | null>(null);
  // Ticks land as fast as they are clicked: the box changes at once, the
  // saves go out one after another, and each carries every tick made so far
  // (the server replaces the plan whole, so the last save is the truth).
  // The record is read back once the last save is in; a failed save puts
  // the boxes back and says why.
  const [optimistic, setOptimistic] = useState<Record<string, string | null>>({});
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef<Record<string, string> | null>(null);
  const pending = useRef(0);
  const isDone = (t: FlowTask) =>
    t.doneKey && optimistic[t.doneKey] !== undefined ? Boolean(optimistic[t.doneKey]) : t.done;
  const tick = (v: { doneKey: string; on: boolean; hasLaterPhases: boolean }) => {
    const t = intake.timeline;
    // Functional IS the first form live: the last readiness tick marks it,
    // so nobody ticks the same fact twice (the rule is shared with the
    // workspace).
    const completed = completedAfterTick(
      intake,
      latest.current ?? t.completed,
      v.doneKey,
      v.on,
      localIso(),
    );
    // The first process live IS the form proven: phase 2 opens from it,
    // unless somebody already recorded an earlier day.
    const provenOn =
      v.on && completed["live"] && !t.completed["live"] && v.hasLaterPhases && !t.form_proven_on
        ? localIso()
        : t.form_proven_on;
    latest.current = completed;
    setError(null);
    setOptimistic((o) => ({
      ...o,
      [v.doneKey]: completed[v.doneKey] ?? null,
      ...(completed["live"] && !t.completed["live"] ? { live: completed["live"] } : {}),
    }));
    pending.current += 1;
    const id = deal.account.id;
    queue.current = queue.current
      .then(() =>
        save({
          data: { dealId: id, patch: { timeline: { ...t, completed, form_proven_on: provenOn } } },
        } as never),
      )
      .then(
        async () => {
          pending.current -= 1;
          if (pending.current > 0) return;
          await Promise.all([
            qc.invalidateQueries({ queryKey: ["deal", id] }),
            qc.invalidateQueries({ queryKey: ["welcome", id] }),
          ]);
          latest.current = null;
          setOptimistic({});
        },
        async (e: unknown) => {
          pending.current -= 1;
          setError(e instanceof Error ? e.message : "The tick did not save.");
          latest.current = null;
          setOptimistic({});
          await qc.invalidateQueries({ queryKey: ["deal", id] });
        },
      );
  };
  const finish = useServerFn(finishImplementation);
  const complete = useMutation({
    mutationFn: (v: { kind: "proven" | "not_proven"; reason: string | null }) =>
      finish({ data: { dealId: deal.account.id, kind: v.kind, reason: v.reason } }),
    onMutate: () => setError(null),
    onSuccess: () => void qc.invalidateQueries(),
    onError: (e) => setError((e as Error).message),
  });
  void move;
  const [recapFor, setRecapFor] = useState<string | null>(null);
  const playbook = intake.path === "new_logo";
  const meetingWhen = (k: string) => {
    const d = intake.timeline.overrides[k];
    const tm = intake.timeline.times[k];
    return d ? `${d}${tm ? ` at ${clock(tm)}` : ""}` : null;
  };
  const hasLaterPhases = tasks.some((t) => t.key.startsWith("svc:"));
  const allDone = tasks.length > 0 && tasks.every((t) => t.done || t.optional);
  const nextKey = tasks.find((t) => !t.done && !t.optional)?.key ?? null;
  const today = localIso();
  return (
    <div>
      <ul className="divide-y divide-border">
        {tasks.map((t, i) => {
          const late = !t.done && !t.optional && t.date && t.date < today;
          const heading = t.group && t.group !== tasks[i - 1]?.group ? t.group : null;
          return (
            <Fragment key={t.key}>
              {heading ? (
                <li className="bg-muted/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {heading}
                  {heading.startsWith("Functional") ? (
                    <span className="ml-2 font-normal normal-case tracking-normal">
                      {tasks.filter((x) => x.group === heading && isDone(x)).length} of{" "}
                      {tasks.filter((x) => x.group === heading).length} — the last one marks the
                      first form live
                    </span>
                  ) : null}
                </li>
              ) : null}
              <li
                className={cn(
                  "flex items-start gap-2.5 px-4 py-2",
                  t.key === nextKey && "bg-primary/5",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={t.action === "graduate" ? grad.isOn(t.key, t.done) : isDone(t)}
                  disabled={!editable}
                  onChange={(e) =>
                    t.action === "graduate"
                      ? grad.mutate({ key: t.key, on: e.target.checked })
                      : tick({ doneKey: t.doneKey!, on: e.target.checked, hasLaterPhases })
                  }
                  aria-label={t.label}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span
                      className={cn(
                        "text-[13px]",
                        isDone(t) && "text-muted-foreground line-through",
                      )}
                    >
                      {t.label}
                      {t.optional ? (
                        <span className="ml-1.5 rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground">
                          optional
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[11px]",
                        late ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                      )}
                    >
                      {isDone(t)
                        ? t.summary
                        : t.date
                          ? `${late ? "was due" : "due"} ${shortDay(t.date)}`
                          : ""}
                    </span>
                  </div>
                  {t.key === nextKey || (t.optional && !t.done) ? (
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{t.hint}</p>
                  ) : null}
                  {playbook && CORE_MEETINGS.some((c) => c.key === t.key) ? (
                    <button
                      type="button"
                      className="mt-1 text-[11px] text-primary underline decoration-dotted"
                      onClick={() => setRecapFor(recapFor === t.key ? null : t.key)}
                    >
                      {intake.recaps[t.key]
                        ? recapFor === t.key
                          ? "Hide the recap"
                          : "Recap sent — view or edit"
                        : "Write the recap"}
                    </button>
                  ) : null}
                  {recapFor === t.key
                    ? (() => {
                        const i = CORE_MEETINGS.findIndex((c) => c.key === t.key);
                        const nxt = CORE_MEETINGS[i + 1];
                        return (
                          <MeetingRecap
                            deal={deal}
                            intake={intake}
                            meetingKey={t.key}
                            meetingLabel={CORE_MEETINGS[i]!.label}
                            next={nxt ? { label: nxt.label, when: meetingWhen(nxt.key) } : null}
                            editable={editable}
                          />
                        );
                      })()
                    : null}
                </div>
              </li>
            </Fragment>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
        <p className="text-[12px] text-muted-foreground">
          {tasks.length === 0
            ? "Nothing to do on this stage for this setup; it is passed through."
            : allDone
              ? stageKey === "complete"
                ? "Every step is done. Finish it below."
                : `Every step is done — the gate is met; the deal moves on.`
              : `${tasks.filter((t) => !t.done && !t.optional).length} step${tasks.filter((t) => !t.done && !t.optional).length === 1 ? "" : "s"} to go. Dates come from the plan; move them on the plan below.`}
        </p>
        {stageKey === "complete" && current === "complete" ? (
          intake.outcome ? (
            <span className="text-[12px] font-medium">
              Finished: {intake.outcome.kind === "proven" ? "Proven" : "Not Proven"}
              {intake.outcome.reason ? ` — ${intake.outcome.reason}` : ""}
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={!editable || complete.isPending}
                title="The agreed outcome is shown in real use"
                onClick={async () => {
                  const why = await ask({
                    title: "Finish as Proven?",
                    body: "The agreed outcome happened in real use and every step is closed out. Internal status only; the customer never sees it.",
                    confirmLabel: "Finish — Proven",
                    prompt: { label: "What proved it (optional)", required: false },
                  });
                  if (why === false || why === null) return;
                  complete.mutate({
                    kind: "proven",
                    reason: typeof why === "string" && why.trim() ? why.trim() : null,
                  });
                }}
              >
                {complete.isPending ? "Saving…" : "Finish — Proven"}
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[12px] font-medium hover:bg-muted disabled:opacity-50"
                disabled={!editable || complete.isPending}
                title="We could not prove the agreed outcome; never a way to close unfinished work"
                onClick={async () => {
                  const why = await ask({
                    title: "Finish as Not Proven?",
                    body: "Only when the outcome could not be proven — an adoption problem that now belongs to the AM or Customer Success. Delivery or capability problems stay open. Say why.",
                    confirmLabel: "Finish — Not Proven",
                    destructive: true,
                    prompt: {
                      label: "Why",
                      placeholder: "Rolled out to one crew only; adoption with the AM",
                      required: true,
                    },
                  });
                  if (typeof why !== "string" || !why.trim()) return;
                  complete.mutate({ kind: "not_proven", reason: why.trim() });
                }}
              >
                Finish — Not Proven
              </button>
            </span>
          )
        ) : null}
      </div>
      {error ? <p className="px-4 pb-2 text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}
