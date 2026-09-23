import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, Copy, Lock, UserRoundCheck } from "lucide-react";

import { BuildIt } from "@/components/build-it";
import { FieldFusionGate } from "@/components/field-fusion-gate";
import { FillFromSources } from "@/components/fill-from-sources";
import { FactsStep, FlowStep, NotesIn, SowStep } from "@/components/intake-panel";
import { assignDealFn, claimDealFn, getDealAssignment } from "@/lib/assignment.functions";
import { canEditDeal, canManage, useProfile } from "@/lib/auth";
import { dealQuery, type DealData } from "@/lib/deal-query";
import { readIntake, type IntakeAnswers } from "@/lib/intake-answers";
import { closeDateFor, timelineFor } from "@/lib/onboarding-plan";
import { dayCounter, localIso } from "@/lib/onboarding-timeline";
import { wonStage } from "@/lib/pipeline-stages";
import { moveDealStage, saveIntake } from "@/lib/presale.functions";
import { KICKOFF_CADENCE, stageFlow, type FlowStageKey, type FlowTask } from "@/lib/stage-flow";
import { syncDealStageFn } from "@/lib/stage-flow.functions";
import { cn } from "@/lib/utils";

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
export function StageFlow({ deal }: { deal: DealData }) {
  const { profile } = useProfile();
  const editable = canEditDeal(profile?.role);
  const qc = useQueryClient();
  const dealId = deal.account.id;
  const intake = readIntake(deal.account.intake);

  const assignment = useQuery({
    queryKey: ["assignment", dealId],
    queryFn: () => getDealAssignment({ data: { dealId } }),
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

  // The page saw a stage finish: ask the server to move it. Once per target,
  // so a slow refetch cannot send the same move twice.
  const sync = useServerFn(syncDealStageFn);
  const asked = useRef<string | null>(null);
  const [moved, setMoved] = useState<string | null>(null);
  useEffect(() => {
    if (!editable || !flow.advanceTo || asked.current === flow.advanceTo) return;
    asked.current = flow.advanceTo;
    void sync({ data: { dealId } })
      .then((r) => {
        if (r.moved) {
          setMoved(r.moved === "onboarding_kickoff" ? "Pre-kickoff" : "Onboarding");
          void qc.invalidateQueries();
        }
      })
      .catch(() => {
        asked.current = null;
      });
  }, [editable, flow.advanceTo, dealId, sync, qc]);

  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localIso()), []);
  const counter = today ? dayCounter(timeline, today) : null;

  const [viewing, setViewing] = useState<FlowStageKey | null>(null);
  const shown = viewing ?? flow.current ?? "closed_won";
  const stage = flow.stages.find((s) => s.key === shown) ?? flow.stages[0]!;
  const doneCount = stage.tasks.filter((t) => t.done).length;
  const next = stage.tasks.find((t) => !t.done && !t.locked) ?? null;
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
        <p className="text-[12px]">
          <b className="font-semibold">{stage.label}</b>
          {stage.tasks.length ? (
            <span className="text-muted-foreground">
              {" "}
              · {doneCount} of {stage.tasks.length} done
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
          {counter && (flow.current === "onboarding" || flow.current === "pre_kickoff") ? (
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
          {stageFooter(shown, flow.current)}
        </p>
      </div>
      {/* After a new Gong brief or a re-uploaded SOW: one press refreshes
          everything the AI filled, from any stage. Hidden while the flow
          task is open, which carries the same button. */}
      {editable &&
      deal.gong_reports.length > 0 &&
      shown !== "complete" &&
      openTask?.action !== "flow" ? (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-border px-4 py-2">
          <FillFromSources deal={deal} compact />
          <p className="pt-1 text-[11px] text-muted-foreground">
            New Gong brief or SOW? This refreshes the flow, the forms, the process and the plan.
            Your own answers stay.
          </p>
        </div>
      ) : null}
      {moved ? (
        <p className="border-b border-border bg-status-ontrack/40 px-4 py-1.5 text-[12px] text-status-ontrack-foreground">
          <Check className="mr-1 inline h-3.5 w-3.5" strokeWidth={3} />
          Moved to {moved}.
        </p>
      ) : null}
      {flow.current === null && shown === "closed_won" ? (
        <p className="border-b border-border px-4 py-2 text-[12px] text-muted-foreground">
          Not closed yet. You can get ahead on these; the checklist starts counting at Closed Won.
        </p>
      ) : null}

      {shown === "onboarding" ? (
        <OnboardingList deal={deal} intake={intake} tasks={stage.tasks} editable={editable} />
      ) : shown === "complete" ? (
        <p className="px-4 py-3 text-[13px] text-muted-foreground">
          {flow.current === "complete"
            ? "Onboarding is complete."
            : "Marked from the Onboarding stage once every step there is done."}
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
    </section>
  );
}

/** The customer page's header: the checklist for the deal this project came from. */
export function DealStageFlow({ dealId }: { dealId: string }) {
  const q = useQuery(dealQuery(dealId));
  if (!q.data) return null;
  return <StageFlow deal={q.data} />;
}

/** One line under the stage name: what moves the deal on from here. */
function stageFooter(shown: FlowStageKey, current: FlowStageKey | null): string {
  if (shown !== current) return "Not the current stage — you can still work ahead.";
  switch (shown) {
    case "closed_won":
      return "Moves to Pre-kickoff when the welcome brief is generated.";
    case "field_fusion":
      return "Moves to Pre-kickoff when the setup is handed over.";
    case "pre_kickoff":
      return "Moves to Onboarding when the kickoff is booked.";
    case "onboarding":
      return "Mark it complete once every step is done.";
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

function TaskBody({
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
    case "assign":
      return task.locked ? null : <AssignBody dealId={deal.account.id} editable={editable} />;
    case "notes":
      return <NotesIn deal={deal} editable={editable} />;
    case "sow":
      return <SowStep deal={deal} editable={editable} />;
    case "flow":
      return (
        <div className="space-y-2">
          {editable ? <FillFromSources deal={deal} /> : null}
          <FlowStep deal={deal} editable={editable} />
          <details className="rounded-sm border border-border px-2.5 py-1.5">
            <summary className="cursor-pointer text-[12px] font-medium">
              The facts from the calls — industry, size, field users, the process today
            </summary>
            <div className="mt-2">
              <FactsStep deal={deal} editable={editable} />
            </div>
          </details>
        </div>
      );
    case "generate":
      return task.locked && !task.done ? null : <BuildIt deal={deal} />;
    case "reply_ae":
      return <ReplyBody deal={deal} intake={intake} editable={editable} />;
    case "cadence":
      return <CadenceBody deal={deal} intake={intake} editable={editable} />;
    case "kickoff":
      return <KickoffBody deal={deal} intake={intake} editable={editable} />;
    case "field_fusion":
      return <FieldFusionGate deal={deal} editable={editable} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------ the bodies */

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
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["assignment", dealId] });
    void qc.invalidateQueries({ queryKey: ["deal", dealId] });
  };
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
            {a.pool.map((p) => (
              <option key={p.teamMemberId} value={p.teamMemberId}>
                {p.name}
                {p.rank ? ` (#${p.rank}, carrying ${p.load})` : ""}
              </option>
            ))}
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

/** Tick one of the pre-kickoff tasks that live nowhere else. */
function useHandoffTick(dealId: string) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  return useMutation({
    mutationFn: (v: { key: string; on: boolean }) =>
      save({
        data: {
          dealId,
          patch: { handoff_tasks: { [v.key]: v.on ? new Date().toISOString() : null } },
        } as never,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["deal", dealId] }),
  });
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-[12px] font-medium disabled:opacity-50",
        done
          ? "border border-border hover:bg-muted"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
      )}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
      {pending ? "Saving…" : done ? "Undo" : label}
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
  const done = Boolean(intake.handoff_tasks["reply_ae"]);
  const share = (deal.account as { welcome_share_url?: string | null }).welcome_share_url ?? null;
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <ol className="list-decimal space-y-0.5 pl-5 text-[12px]">
        <li>Reply-all to the AE's closed-won email the same day.</li>
        <li>Introduce yourself and the three training days ahead.</li>
        <li>Share the welcome page and offer two kickoff times — sixty minutes.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {share ? (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[12px] hover:bg-muted"
            onClick={() => {
              void navigator.clipboard.writeText(share).then(() => setCopied(true));
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Link copied" : "Copy the welcome page link"}
          </button>
        ) : null}
        <Link
          to="/onboarding-plan/$dealId"
          params={{ dealId: deal.account.id }}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[12px] hover:bg-muted"
        >
          Open the welcome page
        </Link>
        <DoneButton
          done={done}
          label="I replied"
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
  const done = Boolean(intake.handoff_tasks["cadence"]);
  return (
    <div className="space-y-2">
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
        Take them out of the cadence once the kickoff is on the calendar.
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

function KickoffBody({
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
  const [time, setTime] = useState(t.times["kickoff"] ?? "");
  const [zone, setZone] = useState(t.timezone ?? browserZone ?? "");
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          dealId: deal.account.id,
          patch: {
            timeline: {
              ...t,
              overrides: { ...t.overrides, kickoff: date },
              times: { ...t.times, kickoff: time },
              timezone: zone || null,
            },
          },
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
          <input
            type="time"
            className="mt-0.5 block h-8 rounded-sm border border-border bg-background px-2 text-[12px] text-foreground"
            value={time}
            disabled={!editable || m.isPending}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Time zone
          <input
            className="mt-0.5 block h-8 w-44 rounded-sm border border-border bg-background px-2 text-[12px] text-foreground"
            value={zone}
            placeholder="America/Chicago"
            disabled={!editable || m.isPending}
            onChange={(e) => setZone(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={!editable || m.isPending || !date || !time || (booked && !changed)}
          onClick={() => m.mutate()}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
          {m.isPending ? "Saving…" : booked ? "Save the new time" : "Kickoff is booked"}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {planned
          ? `The plan had it on ${planned.date}. Every date after the kickoff moves with it.`
          : "Every date after the kickoff moves with it."}
      </p>
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
}: {
  deal: DealData;
  intake: IntakeAnswers;
  tasks: FlowTask[];
  editable: boolean;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const move = useServerFn(moveDealStage);
  const [error, setError] = useState<string | null>(null);
  const tick = useMutation({
    mutationFn: (v: { doneKey: string; on: boolean; hasLaterPhases: boolean }) => {
      const t = intake.timeline;
      const completed = { ...t.completed };
      if (v.on) completed[v.doneKey] = localIso();
      else delete completed[v.doneKey];
      // The first process live IS the form proven: phase 2 opens from it,
      // unless somebody already recorded an earlier day.
      const provenOn =
        v.on && v.doneKey === "live" && v.hasLaterPhases && !t.form_proven_on
          ? localIso()
          : t.form_proven_on;
      return save({
        data: {
          dealId: deal.account.id,
          patch: { timeline: { ...t, completed, form_proven_on: provenOn } },
        } as never,
      });
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] });
      void qc.invalidateQueries({ queryKey: ["welcome", deal.account.id] });
    },
    onError: (e) => setError((e as Error).message),
  });
  const complete = useMutation({
    mutationFn: () => move({ data: { dealId: deal.account.id, toStage: "onboarding_complete" } }),
    onMutate: () => setError(null),
    onSuccess: () => void qc.invalidateQueries(),
    onError: (e) => setError((e as Error).message),
  });
  const hasLaterPhases = tasks.some((t) => t.key.startsWith("svc:"));
  const allDone = tasks.length > 0 && tasks.every((t) => t.done);
  const nextKey = tasks.find((t) => !t.done)?.key ?? null;
  const today = localIso();
  return (
    <div>
      <ul className="divide-y divide-border">
        {tasks.map((t) => {
          const late = !t.done && t.date && t.date < today;
          return (
            <li
              key={t.key}
              className={cn(
                "flex items-start gap-2.5 px-4 py-2",
                t.key === nextKey && "bg-primary/5",
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0"
                checked={t.done}
                disabled={!editable || tick.isPending}
                onChange={(e) =>
                  tick.mutate({ doneKey: t.doneKey!, on: e.target.checked, hasLaterPhases })
                }
                aria-label={t.label}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span
                    className={cn("text-[13px]", t.done && "text-muted-foreground line-through")}
                  >
                    {t.label}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[11px]",
                      late ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                    )}
                  >
                    {t.done ? t.summary : t.date ? `${late ? "was due" : "due"} ${t.date}` : ""}
                  </span>
                </div>
                {t.key === nextKey ? (
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{t.hint}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
        <p className="text-[12px] text-muted-foreground">
          {allDone
            ? "Every step is done."
            : `${tasks.filter((t) => !t.done).length} step${tasks.filter((t) => !t.done).length === 1 ? "" : "s"} to go. Dates come from the plan; move them on the plan below.`}
        </p>
        {deal.account.stage === "in_onboarding" ? (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={!editable || !allDone || complete.isPending}
            title={allDone ? "Moves the deal to Onboarding Complete" : "Tick every step first"}
            onClick={() => complete.mutate()}
          >
            {complete.isPending ? "Saving…" : "Mark onboarding complete"}
          </button>
        ) : null}
      </div>
      {error ? <p className="px-4 pb-2 text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}
