import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pencil,
  RotateCcw,
  X,
} from "lucide-react";

import { Panel } from "@/components/record";
import { firstFormName, readIntake, type IntakeAnswers } from "@/lib/intake-answers";
import { buildIcs } from "@/lib/ics";
import { closeDateFor, extraFormServices, isIntakeForm, timelineFor } from "@/lib/onboarding-plan";
import {
  belongsAfterForm,
  normalizeServices,
  SERVICE_KIND_LIST,
  SERVICE_KINDS,
  type ServiceKind,
  type ServiceSpec,
} from "@/lib/onboarding-services";
import {
  daysToValue,
  dayLabel,
  daysToValueActual,
  INTEGRATION_TIERS,
  shortDay,
  type IntegrationTier,
  type Milestone,
  type Phase,
  type Timeline,
  localIso,
} from "@/lib/onboarding-timeline";
import { saveIntake } from "@/lib/presale.functions";
import { toolByKey, toolFromName, toolsForKind } from "@/lib/onboarding-tools";
import { mergeProposal, rowWeeks, type SowPlanProposal, type SowPlanRow } from "@/lib/sow-plan";
import { proposePlanFromSowFn } from "@/lib/sow-plan.functions";
import { isCall, planEvents } from "@/lib/welcome-events";
import { getWelcome } from "@/lib/welcome.functions";
import { cn } from "@/lib/utils";
import { Working } from "@/components/working";

/**
 * The seven-day plan, as dates a person can move.
 *
 * Computed from the close date by the rule in onboarding-timeline, shown as a
 * list of dated milestones with an owner on each. Any date can be moved — a
 * weird holiday, a customer closed Fridays — and the move is stored as an
 * override. Moving a date moves everything after it by the same number of
 * business days, never anything before it; a later date moved by hand sets
 * its own shift from there. Adding a holiday shifts every date after it.
 * The page prints exactly what this panel shows.
 */
export function TimelinePanel({
  dealId,
  raw,
  stageHistory,
  wonStageKey,
  editable,
  hasSow,
  highlight,
}: {
  dealId: string;
  raw: unknown;
  stageHistory: ReadonlyArray<{ to_stage: string; occurred_at: string }>;
  wonStageKey: string;
  editable: boolean;
  /** True when the deal has a signed SOW attached — the plan can be read from it. */
  hasSow?: boolean | undefined;
  highlight?: boolean | undefined;
}) {
  const answers = readIntake(raw);
  const close = closeDateFor({ intake: answers, stageHistory, wonStageKey, today: localIso() });
  const timeline = timelineFor(answers, close.date);
  const knobs = answers.timeline;

  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const loadWelcome = useServerFn(getWelcome);
  const [error, setError] = useState<string | null>(null);
  const [holiday, setHoliday] = useState("");
  const [tester, setTester] = useState(knobs.field_tester ?? "");
  const [newKind, setNewKind] = useState<ServiceKind>("integration");
  const [newName, setNewName] = useState("");
  const [newPhase, setNewPhase] = useState<number>(SERVICE_KINDS.integration.defaultPhase);
  const [newTool, setNewTool] = useState<string>("");
  const pickKind = (k: ServiceKind) => {
    setNewKind(k);
    setNewPhase(SERVICE_KINDS[k].defaultPhase);
    setNewTool("");
  };
  // Picking a known system names the service and sets its usual tier, so
  // the analytics count every QuickBooks Online project as one thing.
  const pickTool = (key: string) => {
    setNewTool(key);
    const tool = toolByKey(key);
    if (tool) setNewName(tool.name);
  };
  // The services as the plan sees them: the stored list, with the legacy
  // single-integration knobs folded in until somebody edits the list.
  const services = normalizeServices(knobs.services as ServiceSpec[], knobs);
  // The intake's extra forms, as the plan sees them: phase-2 builds that are
  // edited on the intake, not here.
  const intakeForms = extraFormServices(answers);
  const shown = [...services, ...intakeForms];
  const writeServices = (next: ServiceSpec[]) =>
    // Editing materialises the list and retires the legacy knobs, so the two
    // can never disagree.
    set({ services: next, integration_tier: 0, integration_target: null });
  const addService = () => {
    const name = newName.trim();
    if (!name) return;
    const id = `${newKind.slice(0, 4)}-${Math.random().toString(36).slice(2, 8)}`;
    const tool = toolByKey(newTool) ?? toolFromName(name);
    writeServices([
      ...services,
      {
        id,
        kind: newKind,
        name,
        phase: newPhase,
        ...(newKind === "integration" && { tier: tool?.tier ?? 3 }),
        ...(tool && tool.kind === newKind && { tool: tool.key }),
      },
    ]);
    setNewName("");
    setNewTool("");
  };
  const updateService = (id: string, patch: Partial<ServiceSpec>) =>
    writeServices(services.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeService = (id: string) => writeServices(services.filter((x) => x.id !== id));

  // Reading the SOW: the model proposes rows, a person edits and ticks them,
  // apply merges them into the list and the dates follow from the rule.
  const readSow = useServerFn(proposePlanFromSowFn);
  const [proposal, setProposal] = useState<{
    sowName: string | null;
    proposal: SowPlanProposal;
    rows: Array<SowPlanRow & { accept: boolean; edited?: boolean }>;
  } | null>(null);
  const sowRead = useMutation({
    mutationFn: () => readSow({ data: { dealId } }),
    onMutate: () => setError(null),
    onSuccess: (r) =>
      setProposal({
        sowName: r.sowName,
        proposal: r.proposal,
        rows: r.proposal.services.map((row) => ({
          ...row,
          accept: row.confidence !== "uncertain",
        })),
      }),
    onError: (e) => setError((e as Error).message),
  });
  const editRow = (i: number, patch: Partial<SowPlanRow & { accept: boolean; edited: boolean }>) =>
    setProposal((p) =>
      p ? { ...p, rows: p.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : p,
    );
  const applyProposal = (replace: boolean) => {
    if (!proposal) return;
    // A form the intake already names is not added a second time as an
    // "additional form build" from the SOW: one list, one name.
    const wanted = new Set(answers.wanted_forms.map((f) => f.name.trim().toLowerCase()));
    const accepted = proposal.rows.filter(
      (r) => r.accept && !(r.kind === "paid_form" && wanted.has(r.name.trim().toLowerCase())),
    );
    const makeId = (row: SowPlanRow) =>
      `${row.kind.slice(0, 4)}-${Math.random().toString(36).slice(2, 8)}`;
    set({
      services: mergeProposal(replace ? [] : services, accepted, makeId),
      integration_tier: 0,
      integration_target: null,
      sow_applied_at: new Date().toISOString(),
      // The dates and exclusions the SOW names, for the watch-outs to read
      // against the plan. Before this they were shown once and dropped.
      sow_notes: proposal.proposal.notes.map((n) => n.slice(0, 300)).slice(0, 20),
    });
    setProposal(null);
  };

  const mutation = useMutation({
    mutationFn: (timeline: IntakeAnswers["timeline"]) =>
      save({ data: { dealId, patch: { timeline } } as never }),
    onMutate: () => setError(null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["deal", dealId] });
      void qc.invalidateQueries({ queryKey: ["welcome", dealId] });
    },
    onError: (e) => setError((e as Error).message),
  });
  const set = (patch: Partial<IntakeAnswers["timeline"]>) =>
    mutation.mutate({ ...knobs, ...patch });

  const busy = !editable || mutation.isPending;
  const input =
    "rounded-sm border border-border bg-background px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60";
  const moved = timeline.milestones.filter((m) => m.moved).length;

  const moveDate = (m: Milestone, iso: string) => {
    const overrides = { ...knobs.overrides };
    if (!iso || iso === m.plannedDate) delete overrides[m.key];
    else overrides[m.key] = iso;
    set({ overrides });
  };
  const markDone = (m: Milestone, iso: string | null) => {
    const completed = { ...knobs.completed };
    if (iso) completed[m.key] = iso;
    else delete completed[m.key];
    set({ completed });
  };
  const setTime = (m: Milestone, hhmm: string) => {
    const times = { ...knobs.times };
    if (hhmm) times[m.key] = hhmm;
    else delete times[m.key];
    set({
      times,
      timezone: knobs.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    });
  };
  const today = new Date().toISOString().slice(0, 10);

  // What the page still needs, from the same server view the page renders.
  const welcome = useQuery({
    queryKey: ["welcome", dealId],
    queryFn: () => loadWelcome({ data: { dealId } }),
    // Live: the customer's homework ticks and link opens land here within
    // ten seconds, without anyone refreshing.
    refetchInterval: 10_000,
  });
  const homeworkDone = welcome.data?.homeworkDone ?? {};

  const downloadIcs = (only?: string) => {
    const events = planEvents({
      timeline,
      clientName: welcome.data?.clientName ?? "Customer",
      url: null,
      only: only ?? null,
    });
    const blob = new Blob([buildIcs(events)], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${only ?? "onboarding-plan"}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const actual = daysToValueActual(timeline);
  const planEnd = timeline.phases.length
    ? (timeline.phases[timeline.phases.length - 1]?.endsOn ?? null)
    : null;

  const formName =
    firstFormName(answers) ?? (timeline.path === "existing" ? "Form review" : "First form");
  const phaseOneDone = timeline.milestones.filter((m) => m.doneOn).length;
  const tzLabel = (knobs.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
    .replace(/^(America|Pacific|Europe)\//, "")
    .replace("_", " ");
  const stepHandlers = { busy, today, markDone, setTime, moveDate, downloadIcs };
  const stages = [...alongsidePhase(timeline), ...timeline.phases];

  return (
    <Panel
      id="panel-plan"
      highlight={Boolean(highlight)}
      title="Onboarding plan"
      collapsible
      collapseKey="deal:plan"
      meta={
        (actual !== null
          ? `${timeline.phases.length ? "Form live" : "Live"} ${shortDay(timeline.liveDoneOn!)} · ${actual} business days to value`
          : `${timeline.phases.length ? "Form live" : "Live"} ${shortDay(timeline.liveDate)} · ${daysToValue(timeline)} business days planned`) +
        (planEnd ? ` · all phases by ${shortDay(planEnd)}` : "") +
        ` · ${timeline.progress.done}/${timeline.progress.total} done`
      }
      level="primary"
      action={
        <div className="flex items-center gap-1.5">
          <Link
            to="/onboarding-plan/$dealId"
            params={{ dealId }}
            className="inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
            title="The page: present it, print it, send it"
          >
            <ExternalLink className="h-3 w-3" />
            Open the welcome page
          </Link>
        </div>
      }
    >
      <div className="space-y-2 px-3 py-2.5">
        {error ? (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        ) : null}
        {/* What the customer has done on their page. Live. */}
        {welcome.data ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12px]">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Customer
            </span>
            <span className="text-muted-foreground">
              {welcome.data.sharedAt
                ? welcome.data.openedAt
                  ? `Opened their page ${shortDay(welcome.data.openedAt.slice(0, 10))}`
                  : "Link sent, not opened yet"
                : "No link sent yet"}
            </span>
            {(
              [
                ["app", "App installed"],
                ["user", "Field user added"],
                ["list", "List sent"],
              ] as const
            ).map(([k, label]) => (
              <span
                key={k}
                className={cn(
                  "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px]",
                  homeworkDone[k]
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground",
                )}
                title={
                  homeworkDone[k] ? `Ticked ${shortDay(homeworkDone[k]!.slice(0, 10))}` : "Not yet"
                }
              >
                {homeworkDone[k] ? <Check className="h-3 w-3" /> : null}
                {label}
              </span>
            ))}
          </div>
        ) : null}

        {/* PHASE 1 — the form. Seven steps while it is being built; one line
            once it is live. The section a person opens the page for is the
            one that is open; everything finished has folded to its result. */}
        <PlanSection
          id="plan-phase-1"
          key={`p1-${Boolean(timeline.liveDoneOn)}-${timeline.currentPhase}`}
          chip={timeline.liveDoneOn ? "done" : timeline.currentPhase === 1 ? "now" : "later"}
          title={`Phase 1 · ${formName}`}
          summary={
            timeline.liveDoneOn
              ? `Form build complete · ${timeline.path === "existing" ? "ready" : "live"} ${shortDay(timeline.liveDoneOn)}`
              : `${phaseOneDone}/${timeline.milestones.length} steps · ${timeline.path === "existing" ? "ready" : "live"} ${shortDay(timeline.liveDate)}`
          }
          defaultOpen={!timeline.liveDoneOn}
          adjustable={editable}
        >
          {(adjust) => (
            <>
              <StepList steps={timeline.milestones} adjust={adjust} showDay {...stepHandlers} />
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-1 pt-1">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  Field tester
                  <input
                    className={cn(input, "w-48")}
                    value={tester}
                    disabled={busy}
                    placeholder="Who runs it on real jobs"
                    onChange={(e) => setTester(e.target.value)}
                    onBlur={() => {
                      if ((tester.trim() || null) !== (knobs.field_tester ?? null)) {
                        set({ field_tester: tester.trim() || null });
                      }
                    }}
                  />
                </label>
                <p className="text-[11px] text-muted-foreground">
                  {moved
                    ? `${moved} date${moved === 1 ? "" : "s"} moved by hand; everything after follows.`
                    : `Tick a step when it happens. Call times in ${tzLabel}.`}
                </p>
              </div>
            </>
          )}
        </PlanSection>

        {/* SCOPE — what the SOW bought beyond the form. Open until there is
            a list; a line once there is one. */}
        <PlanSection
          key={`scope-${services.length === 0}-${proposal !== null}`}
          chip={shown.length ? null : hasSow ? "next" : "later"}
          title="Beyond the form"
          summary={
            proposal
              ? "Reviewing what the SOW says"
              : shown.length
                ? `${shown.length} service${shown.length === 1 ? "" : "s"} · ${shown
                    .map((s) => s.name)
                    .join(" + ")}`
                : hasSow
                  ? "Read the SOW into the plan"
                  : "Nothing yet — attach the SOW, or add what it includes by hand"
          }
          defaultOpen={shown.length === 0 || proposal !== null}
          right={
            editable && !proposal ? (
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] font-medium disabled:opacity-50",
                  services.length
                    ? "border border-border hover:bg-muted"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
                disabled={!hasSow || sowRead.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  sowRead.mutate();
                }}
                title={
                  hasSow
                    ? "Read the signed SOW and propose the services — you review every row before it lands"
                    : "Upload the signed SOW first"
                }
              >
                {sowRead.isPending ? (
                  <Working label="Reading the SOW…" estimateSeconds={60} />
                ) : services.length ? (
                  "Re-read the SOW"
                ) : (
                  "Read the SOW into the plan"
                )}
              </button>
            ) : null
          }
        >
          {() => (
            <div className="space-y-2">
              {proposal ? (
                <div className="space-y-2 rounded-md border border-primary/40 bg-background p-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[12px]">
                      <span className="font-semibold">From the SOW</span>
                      {proposal.sowName ? (
                        <span className="text-muted-foreground"> · {proposal.sowName}</span>
                      ) : null}
                      {proposal.proposal.summary ? (
                        <span className="text-muted-foreground">
                          {" "}
                          — {proposal.proposal.summary}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Tick what is right, fix what is not. Dates follow once you apply.
                    </p>
                  </div>
                  {proposal.rows.length ? (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {proposal.rows.map((row, i) => (
                        <li
                          key={i}
                          className={cn(
                            "flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5",
                            !row.accept && "opacity-60",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-primary"
                            checked={row.accept}
                            onChange={(e) => editRow(i, { accept: e.target.checked })}
                            aria-label={`Accept ${row.name}`}
                          />
                          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {SERVICE_KINDS[row.kind].label}
                          </span>
                          <input
                            className={cn(input, "min-w-0 flex-1")}
                            value={row.name}
                            onChange={(e) => editRow(i, { name: e.target.value })}
                          />
                          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            Phase
                            <select
                              className={input}
                              value={row.phase}
                              onChange={(e) => editRow(i, { phase: Number(e.target.value) })}
                            >
                              {PHASE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {row.kind === "integration" ? (
                            <select
                              className={input}
                              value={row.tier ?? 3}
                              onChange={(e) =>
                                editRow(i, { tier: Number(e.target.value), edited: true })
                              }
                            >
                              {INTEGRATION_TIERS.filter((t) => t.weeks > 0).map((t) => (
                                <option key={t.tier} value={t.tier}>
                                  Tier {t.tier} · {t.name} · {t.weeks} wk
                                  {Number(t.weeks) === 1 ? "" : "s"}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <input
                                type="number"
                                min={0.5}
                                step={0.5}
                                className={cn(input, "w-16")}
                                value={row.weeks ?? rowWeeks(row)}
                                onChange={(e) =>
                                  editRow(i, {
                                    weeks: Number(e.target.value) || null,
                                    edited: true,
                                  })
                                }
                              />
                              wks
                            </label>
                          )}
                          <span
                            className={cn(
                              "rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                              row.edited
                                ? "bg-muted text-muted-foreground"
                                : row.confidence === "stated"
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                  : row.confidence === "implied"
                                    ? "bg-sky-500/10 text-sky-700 dark:text-sky-400"
                                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                            )}
                            title={
                              row.edited
                                ? `You changed this from what the SOW ${row.confidence}. ${row.evidence ?? ""}`.trim()
                                : (row.evidence ?? undefined)
                            }
                          >
                            {row.edited ? "edited" : row.confidence}
                          </span>
                          {row.evidence ? (
                            <span className="w-full truncate text-[11px] italic text-muted-foreground">
                              “{row.evidence}”
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[12px] text-muted-foreground">
                      The SOW names nothing beyond the first form. Nothing to add.
                    </p>
                  )}
                  {proposal.proposal.first_form || proposal.proposal.seats != null ? (
                    <p className="text-[11px] text-muted-foreground">
                      {proposal.proposal.first_form
                        ? `First form: ${proposal.proposal.first_form}. `
                        : ""}
                      {proposal.proposal.seats != null ? `Seats: ${proposal.proposal.seats}.` : ""}
                    </p>
                  ) : null}
                  {proposal.proposal.notes.length ? (
                    <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                      {proposal.proposal.notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  ) : null}
                  {proposal.proposal.gaps.length ? (
                    <div className="text-[11px] text-amber-700 dark:text-amber-400">
                      <span className="font-semibold">Ask on the kickoff</span>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {proposal.proposal.gaps.map((g) => (
                          <li key={g}>{g}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      className="rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      disabled={busy || !proposal.rows.some((r) => r.accept)}
                      onClick={() => applyProposal(false)}
                    >
                      Add {proposal.rows.filter((r) => r.accept).length} to the plan
                    </button>
                    {services.length ? (
                      <button
                        type="button"
                        className="rounded-sm border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
                        disabled={busy || !proposal.rows.some((r) => r.accept)}
                        onClick={() => applyProposal(true)}
                        title="Drop what is on the plan now and use the ticked rows instead"
                      >
                        Replace the plan
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-sm border border-border px-2 py-1 text-[11px] hover:bg-muted"
                      onClick={() => setProposal(null)}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              ) : null}

              {shown.length ? (
                <ul className="divide-y divide-border rounded-md border border-border bg-background">
                  {shown.map((svc) =>
                    isIntakeForm(svc.id) ? (
                      <li
                        key={svc.id}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5 text-[12px]"
                      >
                        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          Form build
                        </span>
                        <span className="min-w-0 flex-1 truncate">{svc.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          Phase 2 · from the intake&apos;s form list
                        </span>
                      </li>
                    ) : (
                      <li
                        key={svc.id}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5"
                      >
                        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {SERVICE_KINDS[svc.kind].label}
                        </span>
                        {toolsForKind(svc.kind).length ? (
                          <select
                            className={input}
                            value={svc.tool ?? toolFromName(svc.name)?.key ?? ""}
                            disabled={busy}
                            title="Which system this is, for the analytics"
                            onChange={(e) => {
                              const tool = toolByKey(e.target.value);
                              updateService(svc.id, {
                                tool: tool?.key ?? null,
                                ...(tool && !svc.name.trim() && { name: tool.name }),
                              });
                            }}
                          >
                            <option value="">System…</option>
                            {toolsForKind(svc.kind).map((t) => (
                              <option key={t.key} value={t.key}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <input
                          className={cn(input, "min-w-0 flex-1")}
                          value={svc.name}
                          disabled={busy}
                          onChange={(e) => updateService(svc.id, { name: e.target.value })}
                        />
                        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          Phase
                          <select
                            className={input}
                            value={svc.phase}
                            disabled={busy}
                            onChange={(e) =>
                              updateService(svc.id, { phase: Number(e.target.value) })
                            }
                          >
                            {PHASE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {svc.kind === "integration" ? (
                          <select
                            className={input}
                            value={svc.tier ?? 3}
                            disabled={busy}
                            title="Complexity tier — sets the length and the assignment weight"
                            onChange={(e) =>
                              updateService(svc.id, {
                                tier: Number(e.target.value) as IntegrationTier,
                              })
                            }
                          >
                            {INTEGRATION_TIERS.filter((t) => t.weeks > 0).map((t) => (
                              <option key={t.tier} value={t.tier}>
                                Tier {t.tier} · {t.name} · {t.weeks} wk
                                {Number(t.weeks) === 1 ? "" : "s"}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <input
                              type="number"
                              min={0.5}
                              step={0.5}
                              className={cn(input, "w-16")}
                              value={svc.weeks ?? SERVICE_KINDS[svc.kind].weeks}
                              disabled={busy}
                              onChange={(e) =>
                                updateService(svc.id, { weeks: Number(e.target.value) || null })
                              }
                            />
                            wks
                          </label>
                        )}
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                          aria-label={`Remove ${svc.name}`}
                          disabled={busy}
                          onClick={() => removeService(svc.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <label className="flex w-full items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="shrink-0">We need from you</span>
                          <input
                            className={cn(input, "min-w-0 flex-1")}
                            value={svc.needs ?? ""}
                            placeholder={SERVICE_KINDS[svc.kind].needs}
                            disabled={busy}
                            onChange={(e) =>
                              updateService(svc.id, { needs: e.target.value || null })
                            }
                          />
                        </label>
                        {svc.phase <= 1 && belongsAfterForm(svc.kind) ? (
                          <p className="w-full text-[11px] text-amber-700 dark:text-amber-400">
                            {SERVICE_KINDS[svc.kind].label}s are built on real submissions — phase
                            2, once the form is dialed in, is what works. Phase 1 is your call.
                          </p>
                        ) : null}
                      </li>
                    ),
                  )}
                </ul>
              ) : !proposal ? (
                <p className="text-[12px] text-muted-foreground">
                  {hasSow
                    ? "Read the SOW and every service it names lands here with a phase and a length. Or add them by hand below."
                    : "Nothing beyond the form yet. Attach the signed SOW to read it in, or add what it includes by hand — an integration, a custom PDF, more forms — and give each a phase."}
                </p>
              ) : null}

              {editable ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    className={input}
                    value={newKind}
                    onChange={(e) => pickKind(e.target.value as ServiceKind)}
                  >
                    {SERVICE_KIND_LIST.map((k) => (
                      <option key={k.kind} value={k.kind}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  {toolsForKind(newKind).length ? (
                    <select
                      className={input}
                      value={newTool}
                      onChange={(e) => pickTool(e.target.value)}
                      title="A known system — one name, one row in the analytics"
                    >
                      <option value="">Which system?</option>
                      {toolsForKind(newKind).map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.name}
                        </option>
                      ))}
                      <option value="other">Other — type it</option>
                    </select>
                  ) : null}
                  <input
                    className={cn(input, "min-w-[160px] flex-1")}
                    placeholder={
                      newKind === "integration"
                        ? "QuickBooks Online"
                        : newKind === "custom_pdf"
                          ? "Invoice PDF"
                          : newKind === "paid_form"
                            ? "Safety Inspection"
                            : "What the SOW calls it"
                    }
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addService();
                    }}
                  />
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    Phase
                    <select
                      className={input}
                      value={newPhase}
                      onChange={(e) => setNewPhase(Number(e.target.value))}
                    >
                      {PHASE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
                    disabled={busy || !newName.trim()}
                    onClick={addService}
                  >
                    Add
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </PlanSection>

        {/* THE PHASES — each one a line until it is the one being worked;
            a line again once it is done. */}
        {stages.map((ph) => {
          const now = timeline.currentPhase === ph.phase && !ph.done;
          const names = ph.services.map((x) => x.name).join(" + ");
          return (
            <PlanSection
              id={ph.phase === 1 ? "plan-phase-1-services" : `plan-phase-${ph.phase}`}
              key={`ph-${ph.phase}-${ph.done}-${now}`}
              chip={ph.done ? "done" : now ? "now" : ph.tentative ? "gated" : "later"}
              title={`${ph.label.replace(" · alongside the form", "")} · ${names}`}
              summary={
                ph.done
                  ? `Complete · live ${shortDay(ph.endsOn!)}`
                  : ph.tentative
                    ? `${ph.gate}. Earliest ${shortDay(ph.startsOn!)} → ${shortDay(ph.endsOn!)}`
                    : `${shortDay(ph.startsOn!)} → ${shortDay(ph.endsOn!)}${ph.services.length > 1 ? " · at the same time" : ""}`
              }
              defaultOpen={now}
              adjustable={editable && !ph.done}
              right={
                ph.phase === 2 && !ph.done ? (
                  <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <label className="text-[11px] text-muted-foreground">
                      {timeline.path === "existing" ? "Form optimised on" : "Form dialed in on"}
                      <input
                        type="date"
                        className={cn(input, "ml-1.5")}
                        value={knobs.form_proven_on ?? ""}
                        disabled={busy}
                        min={timeline.liveDate}
                        onChange={(e) => set({ form_proven_on: e.target.value || null })}
                      />
                    </label>
                    {!knobs.form_proven_on && !timeline.liveDoneOn ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => set({ form_proven_on: today })}
                      >
                        {timeline.path === "existing"
                          ? "Optimised today — start phase 2"
                          : "Dialed in today — start phase 2"}
                      </button>
                    ) : null}
                  </span>
                ) : null
              }
            >
              {(adjust) => (
                <div className="space-y-2">
                  {ph.services.map((svc) => (
                    <div key={svc.id}>
                      <div className="flex items-center gap-2 px-1 pb-1 text-[11px]">
                        <span className="font-semibold">{svc.name}</span>
                        <span className="text-muted-foreground">
                          {svc.label}
                          {svc.tier ? ` · tier ${svc.tier}` : ""} · {svc.weeks} wk
                          {svc.weeks === 1 ? "" : "s"}
                        </span>
                        {svc.doneOn ? (
                          <span className="ml-auto text-emerald-700 dark:text-emerald-400">
                            Live {shortDay(svc.doneOn)}
                          </span>
                        ) : null}
                      </div>
                      <StepList
                        steps={svc.milestones}
                        adjust={adjust}
                        gated={ph.tentative ? ph.label : null}
                        {...stepHandlers}
                      />
                    </div>
                  ))}
                </div>
              )}
            </PlanSection>
          );
        })}

        {/* PLAN SETTINGS — the knobs behind every date. Folded: they are set
            once, and a page that shows them all the time reads as a form. */}
        <PlanSection
          key="settings"
          chip={null}
          title="Plan settings"
          summary={`Closed ${shortDay(close.date)}${close.source === "today" ? " (not closed yet — planned as if today)" : ""} · call times in ${tzLabel} · ${
            knobs.holidays.length
              ? `${knobs.holidays.length} holiday${knobs.holidays.length === 1 ? "" : "s"} skipped`
              : "no holidays"
          }`}
          defaultOpen={false}
          right={
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                downloadIcs();
              }}
              title="Every date on the plan as one calendar file; calls with a time are timed"
            >
              <CalendarPlus className="h-3 w-3" /> All dates (.ics)
            </button>
          }
        >
          {() => (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-[11px] text-muted-foreground">
                Closed on
                <input
                  type="date"
                  className={cn(input, "block")}
                  value={close.date}
                  disabled={busy}
                  onChange={(e) => set({ close_date: e.target.value || null })}
                />
                <span className="block">
                  {close.source === "stage"
                    ? "From the day the deal moved to Closed Won."
                    : close.source === "intake"
                      ? "Set by hand."
                      : "Not closed yet — planned as if it closed today."}{" "}
                  Kickoff is the next business day; the form is live within seven.
                </span>
              </label>
              <label className="space-y-1 text-[11px] text-muted-foreground">
                Call times in
                <select
                  className={cn(input, "block")}
                  value={timeline.timezone ?? ""}
                  disabled={!editable}
                  onChange={(e) => set({ timezone: e.target.value || null })}
                  title="The customer's zone. The invites and the page say the time in this zone."
                >
                  <option value="">
                    Browser default ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                  </option>
                  {[
                    "America/New_York",
                    "America/Chicago",
                    "America/Denver",
                    "America/Phoenix",
                    "America/Los_Angeles",
                    "America/Anchorage",
                    "Pacific/Honolulu",
                    "America/Toronto",
                    "America/Vancouver",
                    "Europe/London",
                  ].map((z) => (
                    <option key={z} value={z}>
                      {z
                        .replace("America/", "")
                        .replace("Pacific/", "")
                        .replace("Europe/", "")
                        .replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <div className="space-y-1 text-[11px] text-muted-foreground">
                Holidays to skip — every date after one moves
                <div className="flex flex-wrap items-center gap-1.5">
                  {knobs.holidays.map((h) => (
                    <span
                      key={h}
                      className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[11px] text-foreground"
                    >
                      <CalendarDays className="h-3 w-3 text-muted-foreground" />
                      {shortDay(h)}
                      {editable ? (
                        <button
                          type="button"
                          aria-label={`Remove ${shortDay(h)}`}
                          className="text-muted-foreground hover:text-foreground"
                          disabled={busy}
                          onClick={() => set({ holidays: knobs.holidays.filter((x) => x !== h) })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      ) : null}
                    </span>
                  ))}
                  <input
                    type="date"
                    aria-label="Add a holiday"
                    className={input}
                    value={holiday}
                    disabled={busy}
                    onChange={(e) => setHoliday(e.target.value)}
                    onBlur={() => {
                      if (holiday && !knobs.holidays.includes(holiday)) {
                        set({ holidays: [...knobs.holidays, holiday].sort() });
                      }
                      setHoliday("");
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </PlanSection>
      </div>
    </Panel>
  );
}

type Chip = "done" | "now" | "next" | "gated" | "later" | null;

const CHIP: Record<NonNullable<Chip>, { label: string; className: string }> = {
  done: { label: "Done", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  now: { label: "Now", className: "bg-primary text-primary-foreground" },
  next: { label: "Next", className: "bg-primary/10 text-primary" },
  gated: { label: "Gated", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  later: { label: "Later", className: "bg-muted text-muted-foreground" },
};

/**
 * One stage of the plan, folded to a line until it is the one being worked.
 *
 * WHY. The plan had every step of every phase open at once — seven rows for
 * the form, four per service, each with a checkbox, an owner, a time, a
 * date and a reset — and a person looking for the one thing to do next had
 * to find it among sixty controls. Now a finished stage is one line that
 * says it finished; a future stage is one line that says when it opens; the
 * current stage is open, and its date and time inputs appear only when
 * somebody asks to adjust them.
 */
export const PLAN_SECTION_OPEN_EVENT = "gc:plan-section-open";

/** Ask a plan stage to open and scroll into view — the strip at the top does this. */
export function openPlanSection(id: string): void {
  window.dispatchEvent(new CustomEvent(PLAN_SECTION_OPEN_EVENT, { detail: id }));
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function PlanSection({
  id,
  chip,
  title,
  summary,
  defaultOpen,
  right,
  adjustable = false,
  children,
}: {
  id?: string;
  chip: Chip;
  title: string;
  summary: string;
  defaultOpen: boolean;
  right?: React.ReactNode;
  /** Offer an "Adjust dates" switch that reveals the date and time inputs. */
  adjustable?: boolean;
  children: (adjust: boolean) => React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [adjust, setAdjust] = useState(false);
  const c = chip ? CHIP[chip] : null;
  useEffect(() => {
    if (!id) return;
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<string>).detail === id) setOpen(true);
    };
    window.addEventListener(PLAN_SECTION_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(PLAN_SECTION_OPEN_EVENT, onOpen);
  }, [id]);
  return (
    <section
      id={id}
      className={cn(
        "rounded-md border bg-background",
        chip === "now" ? "border-primary/40" : "border-border",
        chip === "done" && !open && "bg-muted/20",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-2.5 py-2 text-left hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        {c ? (
          <span
            className={cn(
              "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              c.className,
            )}
          >
            {c.label}
          </span>
        ) : null}
        <span
          className={cn("text-[12.5px] font-semibold", chip === "done" && "text-muted-foreground")}
        >
          {title}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{summary}</span>
        {right}
        {open && adjustable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAdjust((v) => !v);
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px]",
              adjust
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
            title="Show the date and time inputs"
          >
            <Pencil className="h-3 w-3" /> {adjust ? "Done adjusting" : "Adjust dates"}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-2 border-t border-border px-2.5 py-2">{children(adjust)}</div>
      ) : null}
    </section>
  );
}

/**
 * The steps of one stage. Read mode: a checkbox, the step, who owns it and
 * the date as words. Adjust mode adds the inputs.
 */
function StepList({
  steps,
  adjust,
  showDay = false,
  gated = null,
  busy,
  today,
  markDone,
  setTime,
  moveDate,
  downloadIcs,
}: {
  steps: Milestone[];
  adjust: boolean;
  showDay?: boolean;
  /** The phase's label when its dates are still "earliest", so nothing can be ticked. */
  gated?: string | null;
  busy: boolean;
  today: string;
  markDone: (m: Milestone, iso: string | null) => void;
  setTime: (m: Milestone, hhmm: string) => void;
  moveDate: (m: Milestone, iso: string) => void;
  downloadIcs: (only?: string) => void;
}) {
  const input =
    "rounded-sm border border-border bg-background px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60";
  return (
    <ol className="divide-y divide-border">
      {steps.map((m) => (
        <li
          key={m.key}
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-1.5",
            m.doneOn && "text-muted-foreground",
          )}
        >
          <input
            type="checkbox"
            aria-label={`${m.label} done`}
            className="h-3.5 w-3.5 accent-emerald-600"
            checked={Boolean(m.doneOn)}
            disabled={busy || Boolean(gated) || m.key === "close"}
            onChange={(e) => markDone(m, e.target.checked ? today : null)}
            title={
              gated ? `${gated} is gated` : m.doneOn ? `Done ${shortDay(m.doneOn)}` : "Mark done"
            }
          />
          {showDay ? (
            <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {dayLabel(m)}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block text-[12px] font-medium",
                m.doneOn && "line-through decoration-muted-foreground/40",
              )}
            >
              {m.label}
              {m.minutes ? (
                <span className="ml-1.5 font-normal text-muted-foreground">{m.minutes} min</span>
              ) : null}
            </span>
            {!m.doneOn && !adjust ? (
              <span className="block truncate text-[11px] text-muted-foreground">{m.detail}</span>
            ) : null}
          </span>
          <OwnerChip owner={m.owner} />
          {adjust ? (
            <>
              {m.doneOn ? (
                <label className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                  Done
                  <input
                    type="date"
                    aria-label={`${m.label} done on`}
                    className={input}
                    value={m.doneOn}
                    max={today}
                    disabled={busy}
                    onChange={(e) => markDone(m, e.target.value || null)}
                  />
                </label>
              ) : null}
              {isCall(m) ? (
                <span className="flex items-center gap-1">
                  <input
                    type="time"
                    aria-label={`${m.label} time`}
                    className={input}
                    value={m.time ?? ""}
                    disabled={busy}
                    onChange={(e) => setTime(m, e.target.value)}
                  />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                    title={m.time ? "Add to calendar" : "Set a time first"}
                    disabled={!m.time}
                    onClick={() => downloadIcs(m.key)}
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : null}
              <span className="flex items-center gap-1">
                <input
                  type="date"
                  aria-label={`${m.label} date`}
                  className={cn(input, m.moved && "border-primary")}
                  value={m.date}
                  disabled={busy || m.key === "close"}
                  onChange={(e) => moveDate(m, e.target.value)}
                />
                {m.moved ? (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                    title={`Back to the plan's date, ${shortDay(m.plannedDate)}`}
                    disabled={busy}
                    onClick={() => moveDate(m, "")}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            </>
          ) : (
            <span
              className={cn(
                "w-32 shrink-0 text-right font-mono text-[11px]",
                m.doneOn ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
              )}
              title={
                m.doneOn
                  ? `Done ${shortDay(m.doneOn)}`
                  : m.moved
                    ? `Moved by hand from ${shortDay(m.plannedDate)}`
                    : m.shifted
                      ? "Moved because an earlier date was moved"
                      : undefined
              }
            >
              {m.doneOn ? `Done ${shortDay(m.doneOn)}` : shortDay(m.date)}
              {!m.doneOn && m.time ? ` · ${m.time}` : ""}
              {!m.doneOn && (m.moved || m.shifted) ? " *" : ""}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

const PHASE_OPTIONS = [
  { value: 1, label: "1 · with the form" },
  { value: 2, label: "2 · after the form" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
];

/**
 * Phase 1's companions, shaped like a phase so the rows render the same way.
 * Never gated: they start on the kickoff call.
 */
function alongsidePhase(t: Timeline): Phase[] {
  if (!t.alongside.length) return [];
  const endsOn = t.alongside.reduce<string | null>(
    (acc, p) => (!acc || p.endsOn > acc ? p.endsOn : acc),
    null,
  );
  return [
    {
      phase: 1,
      label: "Phase 1 · alongside the form",
      gate: "Starts on the kickoff call",
      tentative: false,
      startsOn: t.alongside[0]!.startsOn,
      endsOn,
      done: t.alongside.every((p) => p.doneOn),
      services: t.alongside,
    },
  ];
}

const OWNER: Record<string, { label: string; className: string }> = {
  gocanvas: { label: "GoCanvas", className: "bg-primary/10 text-primary" },
  client: {
    label: "Customer",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  both: { label: "Together", className: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
};

function OwnerChip({ owner }: { owner: string }) {
  const o = OWNER[owner] ?? { label: owner, className: "bg-muted text-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex w-[72px] shrink-0 justify-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
        o.className,
      )}
    >
      {o.label}
    </span>
  );
}
