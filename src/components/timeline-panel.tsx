import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  Download,
  ExternalLink,
  RotateCcw,
  X,
} from "lucide-react";

import { Panel } from "@/components/record";
import { readIntake, type IntakeAnswers } from "@/lib/intake-answers";
import { buildIcs } from "@/lib/ics";
import { closeDateFor, timelineFor } from "@/lib/onboarding-plan";
import {
  normalizeServices,
  SERVICE_KIND_LIST,
  SERVICE_KINDS,
  type ServiceKind,
  type ServiceSpec,
} from "@/lib/onboarding-services";
import {
  daysToValue,
  daysToValueActual,
  INTEGRATION_TIERS,
  shortDay,
  type IntegrationTier,
  type Milestone,
} from "@/lib/onboarding-timeline";
import { generateOnboardingDeck, saveIntake } from "@/lib/presale.functions";
import { isCall, planEvents } from "@/lib/welcome-events";
import { getWelcome } from "@/lib/welcome.functions";
import { cn } from "@/lib/utils";

/**
 * The seven-day plan, as dates a person can move.
 *
 * Computed from the close date by the rule in onboarding-timeline, shown as a
 * list of dated milestones with an owner on each. Any date can be moved — a
 * weird holiday, a customer closed Fridays — and the move is stored as an
 * override. Moving a date moves everything after it by the same number of
 * business days, never anything before it; a later date moved by hand sets
 * its own shift from there. Adding a holiday shifts every date after it.
 * The page and the deck print exactly what this panel shows.
 */
export function TimelinePanel({
  dealId,
  raw,
  stageHistory,
  wonStageKey,
  editable,
}: {
  dealId: string;
  raw: unknown;
  stageHistory: ReadonlyArray<{ to_stage: string; occurred_at: string }>;
  wonStageKey: string;
  editable: boolean;
}) {
  const answers = readIntake(raw);
  const close = closeDateFor({ intake: answers, stageHistory, wonStageKey });
  const timeline = timelineFor(answers, close.date);
  const knobs = answers.timeline;

  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const generate = useServerFn(generateOnboardingDeck);
  const loadWelcome = useServerFn(getWelcome);
  const [error, setError] = useState<string | null>(null);
  const [holiday, setHoliday] = useState("");
  const [tester, setTester] = useState(knobs.field_tester ?? "");
  const [newKind, setNewKind] = useState<ServiceKind>("integration");
  const [newName, setNewName] = useState("");
  const [newPhase, setNewPhase] = useState(2);
  // The services as the plan sees them: the stored list, with the legacy
  // single-integration knobs folded in until somebody edits the list.
  const services = normalizeServices(knobs.services as ServiceSpec[], knobs);
  const writeServices = (next: ServiceSpec[]) =>
    // Editing materialises the list and retires the legacy knobs, so the two
    // can never disagree.
    set({ services: next, integration_tier: 0, integration_target: null });
  const addService = () => {
    const name = newName.trim();
    if (!name) return;
    const id = `${newKind.slice(0, 4)}-${Math.random().toString(36).slice(2, 8)}`;
    writeServices([
      ...services,
      { id, kind: newKind, name, phase: newPhase, ...(newKind === "integration" && { tier: 3 }) },
    ]);
    setNewName("");
  };
  const updateService = (id: string, patch: Partial<ServiceSpec>) =>
    writeServices(services.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeService = (id: string) => writeServices(services.filter((x) => x.id !== id));
  const [deck, setDeck] = useState<{ url: string; fileName: string } | null>(null);

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

  const deckMutation = useMutation({
    mutationFn: () => generate({ data: { dealId } }),
    onMutate: () => setError(null),
    onSuccess: (r) => {
      setDeck(r);
      window.open(r.url, "_blank", "noopener");
      void qc.invalidateQueries({ queryKey: ["deal", dealId] });
    },
    onError: (e) => setError((e as Error).message),
  });

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
  const readiness = welcome.data?.readiness ?? [];
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

  return (
    <Panel
      title="Onboarding plan"
      meta={
        actual !== null
          ? `Live ${shortDay(timeline.liveDoneOn!)} · ${actual} days to value · ${timeline.progress.done}/${timeline.progress.total} done`
          : `Live ${shortDay(timeline.liveDate)} · ${daysToValue(timeline)} days planned · ${timeline.progress.done}/${timeline.progress.total} done`
      }
      level="primary"
      action={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={deckMutation.isPending}
            onClick={() => deckMutation.mutate()}
            title="The PowerPoint fallback: six slides with these dates, filed on the account"
          >
            <Download className="h-3 w-3" />
            {deckMutation.isPending ? "Building…" : "PowerPoint"}
          </button>
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
      <div className="space-y-3 px-3 py-2.5">
        {error ? (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        ) : null}
        {deck ? (
          <p className="text-[12px] text-muted-foreground">
            Deck ready —{" "}
            <a className="underline" href={deck.url} target="_blank" rel="noopener noreferrer">
              {deck.fileName}
            </a>
            . It is filed under the account&apos;s attachments when the project exists.
          </p>
        ) : null}

        {/* What the page still needs before it goes to the customer. */}
        {readiness.length ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Before this goes to the customer · {readiness.length} to fill in
            </p>
            <ul className="mt-1.5 space-y-1">
              {readiness.map((r) => (
                <li key={r.key} className="text-[12px]">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-muted-foreground"> — {r.hint}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : welcome.data ? (
          <p className="flex items-center gap-1.5 text-[12px] text-emerald-700 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" /> The page has everything it needs.
          </p>
        ) : null}

        {/* What the customer has done on their page. Live. */}
        {welcome.data ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px]">
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

        {/* The close date: where the whole plan starts. */}
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/20 p-2.5">
          <label className="space-y-1 text-[11px] text-muted-foreground">
            Closed on
            <input
              type="date"
              className={cn(input, "block")}
              value={close.date}
              disabled={busy}
              onChange={(e) => set({ close_date: e.target.value || null })}
            />
          </label>
          <p className="pb-1 text-[11px] text-muted-foreground">
            {close.source === "stage"
              ? "From the day the deal moved to Closed Won."
              : close.source === "intake"
                ? "Set by hand."
                : "Not closed yet — planned as if it closed today."}{" "}
            Kickoff is the next business day; the form is live within seven. Move any date and the
            ones after it move with it.
          </p>
        </div>

        {/* The milestones, each with a date that can be moved. */}
        <ol className="divide-y divide-border rounded-md border border-border bg-background">
          {timeline.milestones.map((m) => (
            <li
              key={m.key}
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5",
                m.doneOn && "bg-emerald-500/5",
              )}
            >
              <input
                type="checkbox"
                aria-label={`${m.label} done`}
                className="h-3.5 w-3.5 accent-emerald-600"
                checked={Boolean(m.doneOn)}
                disabled={busy}
                onChange={(e) => markDone(m, e.target.checked ? today : null)}
                title={m.doneOn ? `Done ${shortDay(m.doneOn)}` : "Mark done"}
              />
              <span className="w-12 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Day {m.day}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium">
                  {m.label}
                  {m.minutes ? (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      {m.minutes} min
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {m.doneOn ? (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      Done{" "}
                      <input
                        type="date"
                        aria-label={`${m.label} done on`}
                        className="rounded-sm border border-border bg-background px-1 text-[11px]"
                        value={m.doneOn}
                        max={today}
                        disabled={busy}
                        onChange={(e) => markDone(m, e.target.value || null)}
                      />
                    </span>
                  ) : (
                    m.detail
                  )}
                </span>
              </span>
              <OwnerChip owner={m.owner} />
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
              {m.shifted ? (
                <span
                  className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                  title="Moved because an earlier date was moved"
                >
                  follows
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
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {moved
              ? `${moved} date${moved === 1 ? "" : "s"} moved by hand. Everything after a moved date follows it by the same number of business days.`
              : "Tick a step when it happens; the customer's page shows the progress."}
            {timeline.timezone ? ` Call times are ${timeline.timezone}.` : ""}
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => downloadIcs()}
            title="Every date on the plan as one calendar file; calls with a time are timed"
          >
            <CalendarPlus className="h-3 w-3" /> All dates (.ics)
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Holidays: shift everything after them. */}
          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">
              Holidays to skip — every date after one moves.
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {knobs.holidays.map((h) => (
                <span
                  key={h}
                  className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[11px]"
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

          {/* The customer's tester: named on the deck. */}
          <label className="space-y-1 text-[11px] text-muted-foreground">
            Field tester — who runs the form on real jobs
            <input
              className={cn(input, "w-full")}
              value={tester}
              disabled={busy}
              placeholder="Dale, lead on crew 2"
              onChange={(e) => setTester(e.target.value)}
              onBlur={() => {
                if ((tester.trim() || null) !== (knobs.field_tester ?? null)) {
                  set({ field_tester: tester.trim() || null });
                }
              }}
            />
          </label>
        </div>

        {/* Beyond the form: services from the SOW, by phase. Phase 1 is the
            form and nothing here moves it. Services in a phase run together;
            a phase opens when the one before it is done. */}
        <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Beyond the form · services from the SOW
            </p>
            <a href="#sow" className="text-[11px] text-muted-foreground hover:text-foreground">
              The SOW is the record — attach it above
            </a>
          </div>

          {services.length ? (
            <ul className="divide-y divide-border rounded-md border border-border bg-background">
              {services.map((svc) => (
                <li
                  key={svc.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5"
                >
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {SERVICE_KINDS[svc.kind].label}
                  </span>
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
                      onChange={(e) => updateService(svc.id, { phase: Number(e.target.value) })}
                    >
                      {[2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n}
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
                        updateService(svc.id, { tier: Number(e.target.value) as IntegrationTier })
                      }
                    >
                      {INTEGRATION_TIERS.filter((t) => t.weeks > 0).map((t) => (
                        <option key={t.tier} value={t.tier}>
                          Tier {t.tier} · {t.name} · {t.weeks} wk{t.weeks === 1 ? "" : "s"}
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
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              Nothing beyond the form yet. Tick what the SOW includes — an integration, a custom
              PDF, more forms — and give each a phase. Phase 2 starts once the form is dialed in.
            </p>
          )}

          {editable ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                className={input}
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as ServiceKind)}
              >
                {SERVICE_KIND_LIST.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </select>
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
                  {[2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
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

        {/* The phases, gated, with every service's dates. */}
        {timeline.phases.map((ph) => (
          <div key={ph.phase} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2">
              <span
                className={cn(
                  "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  ph.done
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : ph.tentative
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "bg-primary/10 text-primary",
                )}
              >
                {ph.label} · {ph.done ? "done" : ph.tentative ? "gated" : "unlocked"}
                {timeline.currentPhase === ph.phase && !ph.done ? " · now" : ""}
              </span>
              <span className="text-[12px]">
                {ph.services.map((x) => x.name).join(" + ")}
                {ph.services.length > 1 ? " — at the same time" : ""}
                {" · "}
                {ph.tentative
                  ? `${ph.gate}. Earliest ${shortDay(ph.startsOn!)} → ${shortDay(ph.endsOn!)}.`
                  : `${shortDay(ph.startsOn!)} → ${shortDay(ph.endsOn!)}.`}
              </span>
              {ph.phase === 2 ? (
                <span className="ml-auto flex items-center gap-1.5">
                  <label className="text-[11px] text-muted-foreground">
                    Form dialed in on
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
                      Dialed in today — start phase 2
                    </button>
                  ) : null}
                </span>
              ) : null}
            </div>
            {ph.services.map((svc) => (
              <ol
                key={svc.id}
                className="divide-y divide-border rounded-md border border-border bg-background"
              >
                <li className="flex items-center gap-2 bg-muted/40 px-2.5 py-1 text-[11px]">
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
                </li>
                {svc.milestones.map((m) => (
                  <li
                    key={m.key}
                    className={cn(
                      "flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5",
                      m.doneOn && "bg-emerald-500/5",
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={`${m.label} done`}
                      className="h-3.5 w-3.5 accent-emerald-600"
                      checked={Boolean(m.doneOn)}
                      disabled={busy || ph.tentative}
                      onChange={(e) => markDone(m, e.target.checked ? today : null)}
                      title={
                        ph.tentative
                          ? `${ph.label} is gated`
                          : m.doneOn
                            ? `Done ${shortDay(m.doneOn)}`
                            : "Mark done"
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium">
                        {m.label}
                        {m.minutes ? (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            {m.minutes} min
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {m.doneOn ? `Done ${shortDay(m.doneOn)}` : m.detail}
                      </span>
                    </span>
                    <OwnerChip owner={m.owner} />
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
                    {m.shifted ? (
                      <span
                        className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                        title="Moved because an earlier date was moved"
                      >
                        follows
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1">
                      <input
                        type="date"
                        aria-label={`${m.label} date`}
                        className={cn(
                          input,
                          m.moved && "border-primary",
                          ph.tentative && "opacity-70",
                        )}
                        value={m.date}
                        disabled={busy}
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
                  </li>
                ))}
              </ol>
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
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
