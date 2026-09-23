import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, Copy, Lock, UserRoundCheck } from "lucide-react";

import { FieldFusionGate } from "@/components/field-fusion-gate";
import { AiSource, ReadingStatus } from "@/components/fill-from-sources";
import { FactsStep, FlowStep, NotesIn, SowStep } from "@/components/intake-panel";
import { assignDealFn, claimDealFn, getDealAssignment } from "@/lib/assignment.functions";
import { canEditDeal, canManage, useProfile } from "@/lib/auth";
import { dealQuery, type DealData } from "@/lib/deal-query";
import {
  firstFormName,
  flowAnswered,
  formsOnly,
  readIntake,
  type IntakeAnswers,
} from "@/lib/intake-answers";
import { closeDateFor, timelineFor } from "@/lib/onboarding-plan";
import { dayCounter, localIso } from "@/lib/onboarding-timeline";
import { getWelcome } from "@/lib/welcome.functions";
import { wonStage } from "@/lib/pipeline-stages";
import { moveDealStage, saveIntake } from "@/lib/presale.functions";
import {
  DEAL_TYPES,
  KICKOFF_CADENCE,
  readingInFlight,
  stageFlow,
  type FlowStageKey,
  type FlowTask,
} from "@/lib/stage-flow";
import { syncDealStageFn } from "@/lib/stage-flow.functions";
import { moveWithGate } from "@/lib/stage-move";
import { aeReplyDraft, googleCalendarLink } from "@/lib/ae-reply";
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
      {moved ? (
        <p className="border-b border-border bg-status-ontrack/40 px-4 py-1.5 text-[12px] text-status-ontrack-foreground">
          <Check className="mr-1 inline h-3.5 w-3.5" strokeWidth={3} />
          Moved to {moved}.
        </p>
      ) : null}
      {/* WHAT HAPPENS NEXT, always in words. A deal that is not closed says
          so, with the button that closes it; a stage whose tasks are all done
          says where the deal goes now — a folded row is not an answer. */}
      {flow.current === null && deal.account.stage === "prospect" ? (
        <NotClosedBar deal={deal} editable={editable} ready={stage.done} />
      ) : stage.tasks.length > 0 && stage.done && shown === flow.current ? (
        <p className="border-b border-border bg-status-ontrack/40 px-4 py-2 text-[12px] text-status-ontrack-foreground">
          <Check className="mr-1 inline h-3.5 w-3.5" strokeWidth={3} />
          {flow.advanceTo
            ? `Everything here is done — moving the deal to ${flow.advanceTo === "in_onboarding" ? "Onboarding" : "Pre-kickoff"}…`
            : shown === "closed_won" && !flow.stages[0]!.tasks.find((x) => x.key === "assign")?.done
              ? "Waiting on an owner."
              : "Everything here is done."}
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
}: {
  deal: DealData;
  editable: boolean;
  ready: boolean;
}) {
  const qc = useQueryClient();
  const move = useServerFn(moveDealStage);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      moveWithGate((force) =>
        move({
          data: force
            ? { dealId: deal.account.id, toStage: "closed_won", force: true }
            : { dealId: deal.account.id, toStage: "closed_won" },
        }),
      ),
    onMutate: () => setError(null),
    onSuccess: () => void qc.invalidateQueries(),
    onError: (e) => {
      const msg = (e as Error).message;
      if (msg !== "Left where it was.") setError(msg);
    },
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px]">
      <span className="text-amber-900 dark:text-amber-200">
        <b>Not closed yet.</b>{" "}
        {ready
          ? "Everything here is ready — close it and the deal moves on straight away."
          : "You can get ahead on these; nothing moves until the deal is Closed Won."}
      </span>
      {editable ? (
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={m.isPending}
          onClick={() => m.mutate()}
        >
          {m.isPending ? "Closing…" : "Mark Closed Won"}
        </button>
      ) : null}
      {error ? <p className="w-full text-destructive">{error}</p> : null}
    </div>
  );
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
  const approved = Boolean(intake.handoff_tasks["reviewed"]);
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
  const pick = (path: (typeof DEAL_TYPES)[number]["path"]) => {
    if (intake.path === path) return;
    if (
      intake.path !== null &&
      !window.confirm(
        "Changing the type rebuilds the plan: the phases, the go-live date and what the customer's page says. Continue?",
      )
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
              onClick={() => pick(t.path)}
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
    company: deal.account.name,
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
          className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
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
            {deal.account.stage === "prospect"
              ? "Next: mark the deal Closed Won at the top — it goes straight to Onboarding."
              : deal.account.stage === "closed_won"
                ? "Next: finish the Closed Won tasks — the deal then goes straight to Onboarding."
                : deal.account.stage === "onboarding_kickoff"
                  ? "Moving the deal to Onboarding…"
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
}: {
  deal: DealData;
  date: string;
  time: string;
  zone: string;
}) {
  const share = (deal.account as { welcome_share_url?: string | null }).welcome_share_url ?? null;
  const token = share ? share.split("/").filter(Boolean).pop() : null;
  let google: string | null = null;
  try {
    google = googleCalendarLink({
      title: `${deal.account.name} × GoCanvas — kickoff and first form`,
      date,
      time,
      timezone: zone,
      minutes: 60,
      details: `Training day 1: introductions, your process walked together, then your first form built and published.${share ? `\n\nYour welcome page: ${share}` : ""}`,
      guests: deal.account.primary_contact_email ? [deal.account.primary_contact_email] : [],
    });
  } catch {
    google = null; // an unknown time zone: the .ics still works
  }
  const cls =
    "inline-flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[12px] hover:bg-muted";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-medium">Send the invite:</span>
      {google ? (
        <a href={google} target="_blank" rel="noreferrer noopener" className={cls}>
          Google Calendar
        </a>
      ) : null}
      {token ? (
        <a href={`/api/welcome-ics/${token}?event=kickoff`} className={cls}>
          Outlook / .ics
        </a>
      ) : null}
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
  const grad = useHandoffTick(deal.account.id);
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
                disabled={!editable || tick.isPending || grad.isPending}
                onChange={(e) =>
                  t.action === "graduate"
                    ? grad.mutate({ key: t.key, on: e.target.checked })
                    : tick.mutate({ doneKey: t.doneKey!, on: e.target.checked, hasLaterPhases })
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
