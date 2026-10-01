import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  Handshake,
  ListChecks,
  Lock,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";

import { MeetingRecap } from "@/components/meeting-recap";
import { ParkingLot } from "@/components/parking-lot";
import { TaskBody, useHandoffTick, useStageSync } from "@/components/stage-flow";
import { When } from "@/components/when";
import { canEditDeal, useProfile } from "@/lib/auth";
import { StatusChip } from "@/components/record";
import { HandoffChip, handoffDetail } from "@/components/handoff-chip";
import { handoffChecks } from "@/lib/sales-handoff";
import { deriveHealth } from "@/lib/customer360-derive";
import { dealStageProgress } from "@/lib/deal-stage";
import { dealValue } from "@/lib/deal-value";
import { fmtMoney } from "@/lib/hub-format";
import { watchOutsFor } from "@/lib/watch-outs";
import { dealQuery, type DealData } from "@/lib/deal-query";
import { addJournalEntry } from "@/lib/hub.functions";
import type { Customer360 } from "@/lib/hub-types";
import { readIntake, type IntakeAnswers } from "@/lib/intake-answers";
import { closeDateFor, timelineFor } from "@/lib/onboarding-plan";
import { localIso, shortDay } from "@/lib/onboarding-timeline";
import { getParkingLot } from "@/lib/parking-lot.functions";
import { wonStage } from "@/lib/pipeline-stages";
import { saveIntake } from "@/lib/presale.functions";
import {
  completedAfterTick,
  readinessFor,
  stageFlow,
  whenLabel,
  FUNCTIONAL,
  type TaskKind,
} from "@/lib/stage-flow";
import { getWelcome } from "@/lib/welcome.functions";
import { byKind, shortMeeting, workspaceFor, type WorkItem, type Workspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";

/**
 * The implementation owner's workspace.
 *
 * One screen, six answers, in the order the owner asks them: where are we,
 * what do I do now, what am I waiting on and from whom, what is my next
 * step, when is the next customer meeting, where do my notes go. Everything
 * on it is read from the same checklist, plan, parking lot and homework the
 * rest of the page keeps — the Hub does the bookkeeping behind this screen,
 * and the owner sees only the window of work before the next stage.
 */
export function ImplementationWorkspace({
  record,
  customerId,
}: {
  record: Customer360;
  customerId: string;
}) {
  const impl = record.implementation!;
  const dealId = impl.deal_id!;
  const q = useQuery(dealQuery(dealId));
  if (q.isPending) {
    return <p className="px-6 py-4 text-[13px] text-muted-foreground">Loading the workspace…</p>;
  }
  if (!q.data) {
    return (
      <p className="px-6 py-4 text-[13px] text-muted-foreground">
        The deal behind this implementation is gone.
      </p>
    );
  }
  return <WorkspaceBody deal={q.data} record={record} customerId={customerId} />;
}

function WorkspaceBody({
  deal,
  record,
  customerId,
}: {
  deal: DealData;
  record: Customer360;
  customerId: string;
}) {
  const { profile } = useProfile();
  const editable = canEditDeal(profile?.role);
  const impl = record.implementation!;
  const dealId = deal.account.id;
  const intake = readIntake(deal.account.intake);

  const [today, setToday] = useState<string>(() => localIso());
  useEffect(() => setToday(localIso()), []);

  const close = closeDateFor({
    intake,
    stageHistory: deal.stage_history,
    wonStageKey: wonStage(deal.stages).key,
    today,
  });
  const timeline = timelineFor(intake, close.date);
  const flow = stageFlow({
    stage: deal.account.stage,
    intake,
    owner: impl.owner_name,
    gongReports: deal.gong_reports.length,
    hasSow: Boolean(deal.sow_url),
    hasBrief: deal.briefs.some((b) => b.status === "complete" && b.generator === "llm"),
    hasLink: Boolean((deal.account as { welcome_share_url?: string | null }).welcome_share_url),
    timeline,
  });
  // The deal moves on from here too, not only from the full checklist.
  const { moved, syncError, retry } = useStageSync(dealId, flow.advanceTo, editable);

  const parking = useQuery({
    queryKey: ["parking-lot", dealId],
    queryFn: () => getParkingLot({ data: { dealId } }),
  });
  const welcome = useQuery({
    queryKey: ["welcome", dealId],
    queryFn: () => getWelcome({ data: { dealId } }),
    // The customer's ticks and link opens land here without a refresh.
    refetchInterval: 10_000,
  });

  // The watch-outs the plan contradicts: a count here, the detail on the Plan tab.
  const latestBrief =
    deal.briefs.find((b) => b.status === "complete" && b.generator === "llm") ?? null;
  const watchOuts = watchOutsFor({
    brief: latestBrief?.structured_json ?? null,
    notes: deal.gong_reports.map((r) => ({
      text: r.content_md,
      date: r.call_date ?? r.created_at ?? null,
    })),
    intake,
    timeline,
  });

  const ws = workspaceFor({
    flow,
    intake,
    timeline,
    today,
    parkingLot: parking.data ?? [],
    homeworkDone: welcome.data?.homeworkDone ?? {},
    link: welcome.data
      ? { sharedAt: welcome.data.sharedAt ?? null, openedAt: welcome.data.openedAt ?? null }
      : null,
  });

  return (
    <div className="space-y-4 px-6 py-4">
      <WhereBar
        ws={ws}
        flow={flow}
        deal={deal}
        record={record}
        customerId={customerId}
        watchOuts={watchOuts.filter((w) => w.severity === "conflict").length}
        moved={moved}
        syncError={syncError}
        retry={retry}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <NowPanel ws={ws} deal={deal} intake={intake} editable={editable} timeline={timeline} />
          <NotesPanel record={record} customerId={customerId} />
        </div>
        <div className="space-y-4">
          <NextMeetingCard
            ws={ws}
            deal={deal}
            intake={intake}
            timeline={timeline}
            editable={editable}
          />
          <WaitingCard ws={ws} />
          <ParkingLotCard dealId={dealId} editable={editable} ourOpen={ws.ourOpen} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- where */

/**
 * Where we are: the rail with the stage we are in, the day of the plan, the
 * target said as a target, and the four facts a person glances at — health,
 * progress, this deal's value, the owner. The watch-outs count sits beside
 * it because a plan that contradicts what the calls said is the first thing
 * to know.
 */
function WhereBar({
  ws,
  flow,
  deal,
  record,
  customerId,
  watchOuts,
  moved,
  syncError,
  retry,
}: {
  ws: Workspace;
  flow: ReturnType<typeof stageFlow>;
  deal: DealData;
  record: Customer360;
  customerId: string;
  watchOuts: number;
  moved: string | null;
  syncError: string | null;
  retry: () => void;
}) {
  const impl = record.implementation!;
  const health = deriveHealth(record, impl);
  const progress = dealStageProgress(impl.deal_stage);
  const at = flow.stages.findIndex((s) => s.key === flow.current);
  const value = dealValue(deal.account);
  const dealIntake = readIntake(deal.account.intake);
  const handoff = dealIntake.path === "field_fusion" ? null : handoffChecks(dealIntake);
  return (
    <section className="rounded-lg border border-border bg-card" aria-label="Where we are">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3.5">
        <h2 className="text-[15px] font-semibold">Implementation progress</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">Health</span>
            <StatusChip status={health.level} />
          </span>
          <span>
            <span className="text-muted-foreground">Progress</span> {progress.position} /{" "}
            {progress.total} stages
          </span>
          <span>
            <span className="text-muted-foreground">This deal</span> {fmtMoney(value)}
          </span>
          <span>
            <span className="text-muted-foreground">Owner</span> {impl.owner_name ?? "Nobody yet"}
          </span>
          {handoff ? (
            <Link
              to="/customers/$customerId"
              params={{ customerId }}
              search={{ tab: "record", impl: impl.id }}
              title="Open the handoff from Sales on the Record tab"
              className="inline-flex items-center gap-1"
            >
              <HandoffChip status={handoff.status} detail={handoffDetail(handoff)} />
              {handoff.status !== "complete" ? (
                <span className="text-[11px] text-primary underline-offset-2 hover:underline">
                  Open handoff →
                </span>
              ) : null}
            </Link>
          ) : null}
        </div>
      </div>
      <ol className="flex flex-wrap items-center gap-1 px-4 pt-3">
        {flow.stages.map((s, i) => {
          const past = at >= 0 && i < at;
          const isCurrent = s.key === flow.current;
          return (
            <li key={s.key} className="flex items-center gap-1">
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium",
                  isCurrent
                    ? "border-primary bg-primary text-primary-foreground"
                    : past
                      ? "border-status-ontrack-foreground/40 bg-status-ontrack/60 text-status-ontrack-foreground"
                      : "border-border text-muted-foreground",
                )}
              >
                {past ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                {s.label}
              </span>
              {i < flow.stages.length - 1 ? (
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              ) : null}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[12px]">
        {ws.where.gate ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">Gate to move on</span>
            <span className="rounded-full border border-border px-2 py-0.5 font-medium">
              {ws.where.gate}
            </span>
            {ws.now.filter((t) => !t.done && !t.optional && !t.locked).length ? (
              <span className="text-muted-foreground">
                · {ws.now.filter((t) => !t.done && !t.optional && !t.locked).length} to go
              </span>
            ) : null}
          </span>
        ) : null}
        {ws.where.day ? (
          <span
            className={cn(
              "font-medium",
              ws.where.day.state === "past_due" ? "text-amber-800 dark:text-amber-300" : "",
            )}
          >
            {ws.where.day.label} · {ws.where.day.detail}
          </span>
        ) : null}
        {ws.where.target ? (
          <span className="text-muted-foreground">
            Target: {ws.where.target.word} by {shortDay(ws.where.target.date)}
          </span>
        ) : null}
        {watchOuts > 0 ? (
          <Link
            to="/customers/$customerId"
            params={{ customerId }}
            search={{ tab: "plan", impl: impl.id }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[12px] font-medium text-amber-800 hover:bg-amber-500/15 dark:text-amber-300"
          >
            <TriangleAlert className="h-3.5 w-3.5" />
            {watchOuts} watch-out{watchOuts === 1 ? "" : "s"} the plan contradicts · view
          </Link>
        ) : null}
      </div>
      {moved ? (
        <p className="border-t border-border px-4 py-2 text-[12px] text-status-ontrack-foreground">
          <Check className="mr-1 inline h-3.5 w-3.5" strokeWidth={3} />
          Moved to {moved}.
        </p>
      ) : null}
      {syncError ? (
        <p className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2 text-[12px] text-destructive">
          Everything here is done, but the deal could not be moved: {syncError}
          <button
            type="button"
            className="rounded-sm border border-destructive/40 px-2 py-0.5 font-medium hover:bg-destructive/10"
            onClick={retry}
          >
            Try again
          </button>
        </p>
      ) : null}
    </section>
  );
}

/* --------------------------------------------------------------- now */

const KIND_ICON: Record<TaskKind, typeof CalendarDays> = {
  meeting: CalendarDays,
  action: ListChecks,
  gate: Handshake,
  readiness: ShieldCheck,
};

/** The completed map, ticked as fast as it is clicked, saved in order. */
function useCompletedTick(deal: DealData, intake: IntakeAnswers) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const [optimistic, setOptimistic] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef<Record<string, string> | null>(null);
  const pending = useRef(0);
  const isDone = (t: WorkItem) =>
    t.doneKey && optimistic[t.doneKey] !== undefined ? Boolean(optimistic[t.doneKey]) : t.done;
  const tick = (doneKey: string, on: boolean) => {
    const t = intake.timeline;
    const completed = completedAfterTick(
      intake,
      latest.current ?? t.completed,
      doneKey,
      on,
      localIso(),
    );
    latest.current = completed;
    setError(null);
    setOptimistic((o) => ({
      ...o,
      [doneKey]: completed[doneKey] ?? null,
      ...(completed["live"] && !t.completed["live"] ? { live: completed["live"] } : {}),
    }));
    pending.current += 1;
    queue.current = queue.current
      .then(() =>
        save({
          data: { dealId: deal.account.id, patch: { timeline: { ...t, completed } } },
        } as never),
      )
      .then(
        async () => {
          pending.current -= 1;
          if (pending.current === 0) {
            await qc.invalidateQueries({ queryKey: ["deal", deal.account.id] });
            latest.current = null;
            setOptimistic({});
          }
        },
        (e: unknown) => {
          pending.current = 0;
          latest.current = null;
          setOptimistic({});
          setError(e instanceof Error ? e.message : "That did not save.");
        },
      );
  };
  return { isDone, tick, error };
}

function NowPanel({
  ws,
  deal,
  intake,
  editable,
  timeline,
}: {
  ws: Workspace;
  deal: DealData;
  intake: IntakeAnswers;
  editable: boolean;
  timeline: ReturnType<typeof timelineFor>;
}) {
  const groups = byKind(ws.now);
  const completed = useCompletedTick(deal, intake);
  const handoff = useHandoffTick(deal.account.id);
  // The next step is open; one opened by hand stays open until it is done.
  const [manual, setManual] = useState<string | null>(null);
  const manualItem = manual ? ws.now.find((t) => t.key === manual) : undefined;
  const openKey = manualItem ? manualItem.key : ws.nextStep?.key;
  const [showOff, setShowOff] = useState(false);
  const off = FUNCTIONAL.filter((f) => !readinessFor(intake).some((r) => r.key === f.key));

  return (
    <section className="rounded-md border border-border bg-card" aria-label="What to do now">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">
          Now <span className="font-normal text-muted-foreground">· {ws.windowLabel}</span>
        </h2>
        {ws.nextStep ? (
          <p className="text-[12px] text-muted-foreground">
            Next step: <span className="text-foreground">{ws.nextStep.label}</span>
          </p>
        ) : ws.now.length ? (
          <p className="text-[12px] text-status-ontrack-foreground">
            Everything in this window is done.
          </p>
        ) : null}
      </div>
      {completed.error ? (
        <p role="alert" className="px-4 py-2 text-[12px] text-destructive">
          {completed.error}
        </p>
      ) : null}
      {ws.now.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-muted-foreground">
          {ws.where.stage === "complete"
            ? "Onboarding is complete. The record stays under Details."
            : "Nothing to do here yet."}
        </p>
      ) : null}
      {groups.map((g) => {
        const Icon = KIND_ICON[g.kind];
        return (
          <div key={g.kind}>
            <div className="flex items-center gap-1.5 bg-muted/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Icon className="h-3 w-3" />
              {g.label}
              <span className="font-normal normal-case tracking-normal">· {g.hint}</span>
              {g.kind === "readiness" ? (
                <span className="ml-auto font-normal normal-case tracking-normal">
                  {g.items.filter((t) => completed.isDone(t)).length} of {g.items.length}
                </span>
              ) : null}
            </div>
            <ol className="divide-y divide-border">
              {g.items.map((t) => {
                const done =
                  t.action === "tick"
                    ? completed.isDone(t)
                    : t.action === "graduate"
                      ? handoff.isOn(t.key, t.done)
                      : t.done;
                const open = openKey === t.key;
                const late = !done && !t.optional && t.date && t.date < localIso();
                const plain = t.action === "tick" || t.action === "graduate";
                return (
                  <li
                    key={t.key}
                    className={cn(
                      "px-4 py-2",
                      open && !plain && "bg-primary/5",
                      t.key === ws.nextStep?.key && "bg-primary/5",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      {plain && editable ? (
                        <input
                          type="checkbox"
                          className="mt-1 h-3.5 w-3.5 shrink-0"
                          checked={done}
                          aria-label={t.label}
                          onChange={(e) => {
                            if (t.action === "graduate")
                              handoff.mutate({ key: t.key, on: e.target.checked });
                            else if (t.doneKey) completed.tick(t.doneKey, e.target.checked);
                          }}
                        />
                      ) : (
                        <span
                          className={cn(
                            "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]",
                            done
                              ? "border-status-ontrack bg-status-ontrack text-status-ontrack-foreground"
                              : t.locked
                                ? "border-border text-muted-foreground"
                                : "border-primary text-primary",
                          )}
                        >
                          {done ? (
                            <Check className="h-3 w-3" strokeWidth={3} />
                          ) : t.locked ? (
                            <Lock className="h-2.5 w-2.5" />
                          ) : null}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          disabled={plain}
                          onClick={() => setManual(open ? "" : t.key)}
                          className="flex w-full flex-wrap items-baseline justify-between gap-x-3 text-left disabled:cursor-default"
                        >
                          <span
                            className={cn(
                              "text-[13px]",
                              done
                                ? "text-muted-foreground line-through decoration-border"
                                : "font-medium",
                              t.locked && !done && "text-muted-foreground",
                            )}
                          >
                            {t.label}
                            {t.optional ? (
                              <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                                optional
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={cn(
                              "text-[11px] text-muted-foreground",
                              late && "text-amber-800 dark:text-amber-300",
                            )}
                          >
                            {done && t.summary
                              ? t.summary
                              : t.date
                                ? `${late ? "Was due " : ""}${shortDay(t.date)}`
                                : t.locked && !open
                                  ? t.locked
                                  : null}
                            {!plain ? (
                              open ? (
                                <ChevronDown className="ml-1 inline h-3 w-3" />
                              ) : (
                                <ChevronRight className="ml-1 inline h-3 w-3" />
                              )
                            ) : null}
                          </span>
                        </button>
                        {open && !plain ? (
                          <div className="mt-2 space-y-2">
                            <p className="text-[12px] text-muted-foreground">{t.hint}</p>
                            {t.locked && !done ? (
                              <p className="text-[12px] text-amber-800 dark:text-amber-300">
                                {t.locked}.
                              </p>
                            ) : null}
                            <TaskBody task={t} deal={deal} intake={intake} editable={editable} />
                          </div>
                        ) : null}
                        {g.kind === "meeting" &&
                        done &&
                        t.doneKey &&
                        timeline.milestones.some((m) => m.key === t.key && m.kind === "call") ? (
                          <RecapLine
                            deal={deal}
                            intake={intake}
                            meetingKey={t.key}
                            label={t.label}
                            editable={editable}
                            ws={ws}
                          />
                        ) : null}
                      </div>
                      {g.kind === "readiness" && editable && !done ? (
                        <ReadinessOff deal={deal} intake={intake} itemKey={t.key} />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
            {g.kind === "readiness" && off.length ? (
              <p className="px-4 py-1.5 text-[11px] text-muted-foreground">
                {off.length} item{off.length === 1 ? "" : "s"} not part of this implementation
                {showOff ? (
                  <>
                    {": "}
                    {off.map((f, i) => (
                      <span key={f.key}>
                        {i ? " · " : ""}
                        {f.label} <ReadinessOn deal={deal} intake={intake} itemKey={f.key} />
                      </span>
                    ))}
                  </>
                ) : null}{" "}
                <button
                  type="button"
                  className="underline decoration-dotted"
                  onClick={() => setShowOff((v) => !v)}
                >
                  {showOff ? "Hide" : "Show"}
                </button>
              </p>
            ) : null}
          </div>
        );
      })}
      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        Only what happens before the next stage is shown. The full checklist is on the{" "}
        <span className="text-foreground">Record</span> tab.
      </p>
    </section>
  );
}

/** "Not part of this implementation": takes a readiness item off this account. */
function ReadinessOff({
  deal,
  intake,
  itemKey,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  itemKey: string;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          dealId: deal.account.id,
          patch: {
            readiness_off: [
              ...new Set([...intake.readiness_off.filter((k) => k !== `+${itemKey}`), itemKey]),
            ],
          },
        },
      } as never),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] }),
  });
  return (
    <button
      type="button"
      title="Not part of this implementation — take it off this account"
      className="mt-0.5 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      disabled={m.isPending}
      onClick={() => m.mutate()}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

/** Puts a readiness item back on this account (a "+key" entry forces a data item on). */
function ReadinessOn({
  deal,
  intake,
  itemKey,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  itemKey: string;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const needsData = FUNCTIONAL.find((f) => f.key === itemKey)?.needs === "data";
  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          dealId: deal.account.id,
          patch: {
            readiness_off: [
              ...intake.readiness_off.filter((k) => k !== itemKey),
              ...(needsData ? [`+${itemKey}`] : []),
            ],
          },
        },
      } as never),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] }),
  });
  return (
    <button
      type="button"
      className="underline decoration-dotted"
      disabled={m.isPending}
      onClick={() => m.mutate()}
    >
      add
    </button>
  );
}

/** Under a held meeting: the recap, written or not. */
function RecapLine({
  deal,
  intake,
  meetingKey,
  label,
  editable,
  ws,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  meetingKey: string;
  label: string;
  editable: boolean;
  ws: Workspace;
}) {
  const [open, setOpen] = useState(false);
  const written = Boolean(intake.recaps[meetingKey]?.at);
  const next = ws.nextMeeting
    ? {
        label: ws.nextMeeting.label,
        when:
          ws.nextMeeting.booked && ws.nextMeeting.time
            ? whenLabel(ws.nextMeeting.date, ws.nextMeeting.time, intake.timeline.timezone)
            : null,
      }
    : null;
  return (
    <div className="mt-1">
      <button
        type="button"
        className="text-[11px] text-primary underline decoration-dotted"
        onClick={() => setOpen((v) => !v)}
      >
        {written ? `${shortMeeting(label)} recap` : `Write the ${shortMeeting(label)} recap`}
        {open ? " — close" : ""}
      </button>
      {open ? (
        <div className="mt-2">
          <MeetingRecap
            deal={deal}
            intake={intake}
            meetingKey={meetingKey}
            meetingLabel={label}
            next={next}
            editable={editable}
          />
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------- next meeting */

function NextMeetingCard({
  ws,
  intake,
  timeline,
}: {
  ws: Workspace;
  deal: DealData;
  intake: IntakeAnswers;
  timeline: ReturnType<typeof timelineFor>;
  editable: boolean;
}) {
  const m = ws.nextMeeting;
  const held = timeline.milestones.filter((x) => x.kind === "call" && !x.serviceId && x.doneOn);
  const last = held[held.length - 1];
  return (
    <section
      className="rounded-md border border-border bg-card px-4 py-3"
      aria-label="Next customer meeting"
    >
      <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <CalendarDays className="h-3 w-3" /> Next customer meeting
      </h2>
      {m ? (
        <>
          <p className="mt-1.5 text-[14px] font-semibold">{m.label}</p>
          {m.booked && m.time ? (
            <p className="text-[13px]">
              {whenLabel(m.date, m.time, intake.timeline.timezone)}
              {m.minutes ? <span className="text-muted-foreground"> · {m.minutes} min</span> : null}
            </p>
          ) : (
            <p className="text-[12px] text-amber-800 dark:text-amber-300">
              Not on the calendar yet · the plan says {shortDay(m.date)}. Book it under Now.
            </p>
          )}
        </>
      ) : (
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {held.length ? "Every core meeting has been held." : "No meetings on the plan yet."}
        </p>
      )}
      {last ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Last: {shortMeeting(last.label)} held {shortDay(last.doneOn!)}
          {intake.recaps[last.key]?.at ? " · recap written" : " · recap not written yet"}
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------ waiting */

function WaitingCard({ ws }: { ws: Workspace }) {
  return (
    <section className="rounded-md border border-border bg-card px-4 py-3" aria-label="Waiting on">
      <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Flag className="h-3 w-3" /> Waiting on
      </h2>
      {ws.waiting.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Nothing is on anyone else’s desk.
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {ws.waiting.map((w, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px]">
              <span
                className={cn(
                  "mt-0.5 shrink-0 rounded-sm px-1 py-px text-[10px] font-medium uppercase tracking-wider",
                  w.who === "customer"
                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                    : "bg-primary/10 text-primary",
                )}
              >
                {w.who === "customer" ? "Customer" : "Us"}
              </span>
              <span className="min-w-0">
                {w.what}
                {w.since ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · since {shortDay(w.since.slice(0, 10))}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ParkingLotCard({
  dealId,
  editable,
  ourOpen,
}: {
  dealId: string;
  editable: boolean;
  ourOpen: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-md border border-border bg-card" aria-label="Parking lot">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Parking lot
        </span>
        <span className="text-[11px] text-muted-foreground">
          {ourOpen ? `${ourOpen} open on our side` : "nothing open on our side"}
          {open ? (
            <ChevronDown className="ml-1 inline h-3 w-3" />
          ) : (
            <ChevronRight className="ml-1 inline h-3 w-3" />
          )}
        </span>
      </button>
      {open ? (
        <div className="border-t border-border">
          <ParkingLot dealId={dealId} editable={editable} />
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------- notes */

/**
 * Implementation notes. One box, one button. A note is what happened, what
 * was decided, what is next — the owner never has to decide what kind of
 * information it is before writing it down. Filed under the stage the
 * implementation is in, by the person signed in, newest first.
 */
function NotesPanel({ record, customerId }: { record: Customer360; customerId: string }) {
  const impl = record.implementation!;
  const qc = useQueryClient();
  const create = useServerFn(addJournalEntry);
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () =>
      create({
        data: {
          implementationId: impl.id,
          note: note.trim(),
          authorId: null,
          links: null,
          attachmentUrl: null,
          attachmentName: null,
        },
      }),
    onSuccess: async () => {
      setNote("");
      await qc.invalidateQueries({ queryKey: ["customer360", customerId] });
    },
  });
  const entries = [...record.journal].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <section className="rounded-md border border-border bg-card" aria-label="Implementation notes">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">Implementation notes</h2>
      </div>
      <div className="space-y-2 px-4 py-3">
        <textarea
          className="min-h-[72px] w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus:ring-1 focus:ring-ring"
          placeholder="What happened, what you decided, what’s next…"
          aria-label="Implementation note"
          value={note}
          disabled={m.isPending}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && note.trim()) m.mutate();
          }}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-sm bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
            disabled={m.isPending || note.trim() === ""}
            onClick={() => m.mutate()}
          >
            {m.isPending ? "Saving…" : "Add implementation note"}
          </button>
          <span className="text-[11px] text-muted-foreground">⌘↵ saves</span>
          {m.isError ? (
            <span className="text-[11px] text-destructive">
              {m.error instanceof Error ? m.error.message : "That did not save."}
            </span>
          ) : null}
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="border-t border-border px-4 py-3 text-[12px] text-muted-foreground">
          No notes yet. The first one is usually written after the first call.
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {entries.map((e) => (
            <li key={e.id} className="px-4 py-2.5">
              <p className="text-[11px] text-muted-foreground">
                <When value={e.created_at} /> · {e.author_name ?? "Author not recorded"}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-[13px]">{e.note}</p>
              {e.attachment_name ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Attachment: {e.attachment_name}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        Sales notes, the Gong brief and the SOW are on the{" "}
        <Link
          to="/customers/$customerId"
          params={{ customerId }}
          search={{ tab: "record", impl: impl.id }}
          className="underline"
        >
          Record
        </Link>{" "}
        tab.
      </p>
    </section>
  );
}
