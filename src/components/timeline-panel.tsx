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
  daysToValue,
  daysToValueActual,
  INTEGRATION_TIERS,
  shortDay,
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
  const [target, setTarget] = useState(knobs.integration_target ?? "");
  const [deck, setDeck] = useState<{ url: string; fileName: string } | null>(null);

  const mutation = useMutation({
    mutationFn: (timeline: IntakeAnswers["timeline"]) =>
      save({ data: { dealId, patch: { timeline } } as never }),
    onMutate: () => setError(null),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["deal", dealId] }),
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
    staleTime: 30_000,
  });
  const readiness = welcome.data?.readiness ?? [];

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

        {/* The integration, after day seven. */}
        <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="space-y-1 text-[11px] text-muted-foreground">
            Integration complexity
            <select
              className={cn(input, "w-full")}
              value={knobs.integration_tier}
              disabled={busy}
              onChange={(e) => set({ integration_tier: Number(e.target.value) })}
            >
              {INTEGRATION_TIERS.map((t) => (
                <option key={t.tier} value={t.tier}>
                  {t.tier === 0
                    ? "None"
                    : `Tier ${t.tier} · ${t.name}${t.weeks ? ` · ${t.weeks} wk${t.weeks === 1 ? "" : "s"}` : ""}`}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11px] text-muted-foreground">
            Connecting to
            <input
              className={cn(input, "w-full")}
              value={target}
              disabled={busy || knobs.integration_tier === 0}
              placeholder="QuickBooks Online"
              onChange={(e) => setTarget(e.target.value)}
              onBlur={() => {
                if ((target.trim() || null) !== (knobs.integration_target ?? null)) {
                  set({ integration_target: target.trim() || null });
                }
              }}
            />
          </label>
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            {timeline.integration.tier > 0
              ? `${timeline.integration.name}: ${timeline.integration.summary}`
              : "The form first, always. An integration is phase 2; it never delays the form."}
          </p>

          {/* Phase 2, gated. No fixed dates until the form is dialed in. */}
          {timeline.integration.milestones.length ? (
            <div className="space-y-2 sm:col-span-2">
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2">
                <span
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    timeline.integration.tentative
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  {timeline.integration.tentative ? "Phase 2 · gated" : "Phase 2 · unlocked"}
                </span>
                <span className="text-[12px]">
                  {timeline.integration.tentative
                    ? "Starts once the form is tested and dialed in — tick 'Live — first value' above, or set the date here. Dates below are the earliest they could be."
                    : `Form dialed in ${shortDay(timeline.integration.provenOn!)}. Phase 2 starts ${shortDay(timeline.integration.startsOn!)}.`}
                </span>
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
                  {!knobs.form_proven_on ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => set({ form_proven_on: new Date().toISOString().slice(0, 10) })}
                    >
                      Dialed in today — start phase 2
                    </button>
                  ) : null}
                </span>
              </div>
              <ol className="divide-y divide-border rounded-md border border-border bg-background">
                {timeline.integration.milestones.map((m) => (
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
                      disabled={busy || timeline.integration.tentative}
                      onChange={(e) => markDone(m, e.target.checked ? today : null)}
                      title={
                        timeline.integration.tentative
                          ? "Phase 2 is gated until the form is dialed in"
                          : m.doneOn
                            ? `Done ${shortDay(m.doneOn)}`
                            : "Mark done"
                      }
                    />
                    <span className="w-12 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Ph. 2
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
                        {m.detail}
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
                          timeline.integration.tentative && "opacity-70",
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
            </div>
          ) : null}
        </div>
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
