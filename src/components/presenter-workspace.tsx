import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { StageTargetsEditor } from "@/components/timeline-panel";
import { dealQuery, type DealData } from "@/lib/deal-query";
import { addJournalEntry } from "@/lib/hub.functions";
import { isGoCanvasFormUrl, readIntake, type IntakeAnswers } from "@/lib/intake-answers";
import { closeDateFor } from "@/lib/onboarding-plan";
import { localIso, shortDay } from "@/lib/onboarding-timeline";
import { wonStage } from "@/lib/pipeline-stages";
import { saveIntake, saveStageTarget } from "@/lib/presale.functions";
import {
  announceWelcomeChanged,
  movesFor,
  sessionsAfterKickoff,
  type SessionRow,
} from "@/lib/presenter-workspace";
import { bookMeetingPatch } from "@/lib/stage-flow";
import type { StageTargetUpdate } from "@/lib/stage-targets";
import type { WelcomeView } from "@/lib/welcome";
import { getWelcome } from "@/lib/welcome.functions";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * The presenter's own window, opened beside the presentation. Everything here
 * is internal: nothing on this page is rendered into a slide, a shared link or
 * the PowerPoint export. Each save goes through the same server function the
 * deal page uses, and then the presentation window is told to re-read the plan.
 */
export function PresenterWorkspace({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getWelcome);
  const deal = useQuery(dealQuery(dealId));
  const welcome = useQuery({
    queryKey: ["welcome", dealId],
    queryFn: () => load({ data: { dealId } }),
    refetchInterval: 10_000,
  });

  if (!deal.data || !welcome.data) {
    return <p className="p-6 text-[13px] text-muted-foreground">Loading the workspace…</p>;
  }

  const onSaved = () => {
    void qc.invalidateQueries({ queryKey: ["deal", dealId] });
    void qc.invalidateQueries({ queryKey: ["welcome", dealId] });
    announceWelcomeChanged(dealId);
  };

  return <Workspace dealId={dealId} deal={deal.data} view={welcome.data} onSaved={onSaved} />;
}

function Workspace({
  dealId,
  deal,
  view,
  onSaved,
}: {
  dealId: string;
  deal: DealData;
  view: WelcomeView;
  onSaved: () => void;
}) {
  const intake = readIntake(deal.account.intake);
  const closeDate = closeDateFor({
    intake,
    stageHistory: deal.stage_history,
    wonStageKey: wonStage(deal.stages).key,
    today: localIso(),
  }).date;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-5 text-[13px]">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Presenter workspace · internal
        </p>
        <h1 className="text-[18px] font-semibold">{view.clientName}</h1>
        <p className="text-[12px] text-muted-foreground">
          Saved changes reach the open presentation after a moment. Nothing here is shown to the
          customer.
        </p>
      </header>

      <FormLinkSection dealId={dealId} intake={intake} onSaved={onSaved} />
      <StageTargetsSection dealId={dealId} intake={intake} view={view} onSaved={onSaved} />
      <SessionsSection
        dealId={dealId}
        intake={intake}
        view={view}
        closeDate={closeDate}
        implementationId={deal.implementation_id}
        onSaved={onSaved}
      />
      <TesterSection dealId={dealId} intake={intake} onSaved={onSaved} />

      <section className="rounded-md border border-border bg-card px-4 py-3">
        <h2 className="text-[12px] font-semibold">Agreed scope and action owners</h2>
        <p className="text-[12px] text-muted-foreground">
          Not in this window yet. Edit them on the deal page, where the focus and parking-lot
          editors already live.
        </p>
      </section>
    </div>
  );
}

function FormLinkSection({
  dealId,
  intake,
  onSaved,
}: {
  dealId: string;
  intake: IntakeAnswers;
  onSaved: () => void;
}) {
  const save = useServerFn(saveIntake);
  const saved = intake.form_editor_url ?? "";
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);
  const trimmed = value.trim();
  const valid = trimmed === "" || isGoCanvasFormUrl(trimmed);
  const m = useMutation({
    mutationFn: () =>
      save({ data: { dealId, patch: { form_editor_url: trimmed || null } } as never }),
    onSuccess: onSaved,
  });

  return (
    <section className="rounded-md border border-border bg-card px-4 py-3">
      <h2 className="text-[12px] font-semibold">Editable form in GoCanvas</h2>
      <p className="text-[11px] text-muted-foreground">
        The live form you edit with the customer. Separate from the uploaded documents and mockups
        on the intake.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="url"
          aria-label="Editable GoCanvas form link"
          value={value}
          placeholder="https://…gocanvas.com/…"
          disabled={m.isPending}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 min-w-[16rem] flex-1 rounded-sm border border-border bg-background px-2 text-[12px]"
        />
        <button
          type="button"
          disabled={!valid || m.isPending || trimmed === saved}
          onClick={() => m.mutate()}
          className="h-8 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {m.isPending ? "Saving…" : "Save link"}
        </button>
        {saved ? (
          <a
            href={saved}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] font-medium text-primary underline-offset-2 hover:underline"
          >
            Open form
          </a>
        ) : null}
      </div>
      {!valid ? (
        <p className="mt-1 text-[11px] text-destructive">Paste an https link on gocanvas.com.</p>
      ) : null}
      {m.error ? <p className="mt-1 text-[11px] text-destructive">{m.error.message}</p> : null}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Internal only. Never on a slide, a shared link or the PowerPoint export.
      </p>
    </section>
  );
}

function StageTargetsSection({
  dealId,
  intake,
  view,
  onSaved,
}: {
  dealId: string;
  intake: IntakeAnswers;
  view: WelcomeView;
  onSaved: () => void;
}) {
  const saveTarget = useServerFn(saveStageTarget);
  const m = useMutation({
    mutationFn: (update: StageTargetUpdate) => saveTarget({ data: { dealId, update } }),
    onSuccess: onSaved,
  });

  return (
    <div className="space-y-1.5">
      <StageTargetsEditor
        targets={intake.timeline.stage_targets}
        disabled={m.isPending}
        actualDateFor={(key) =>
          view.journey?.stages.find((stage) => stage.key === key)?.target?.actualDate ?? null
        }
        onSave={(update) => m.mutate(update)}
      />
      {m.error ? <p className="text-[11px] text-destructive">{m.error.message}</p> : null}
    </div>
  );
}

function SessionsSection({
  dealId,
  intake,
  view,
  closeDate,
  implementationId,
  onSaved,
}: {
  dealId: string;
  intake: IntakeAnswers;
  view: WelcomeView;
  closeDate: string;
  implementationId: string | null;
  onSaved: () => void;
}) {
  const rows = sessionsAfterKickoff(view.timeline.milestones);
  const [open, setOpen] = useState<string | null>(null);
  const booked = rows.filter((r) => r.booked).length;

  return (
    <section className="rounded-md border border-border bg-card px-4 py-3">
      <h2 className="text-[12px] font-semibold">
        Next working sessions · {booked} of {rows.length} booked
      </h2>
      {rows.length === 0 ? (
        <p className="mt-1 text-[12px] text-muted-foreground">No working sessions on this plan.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {rows.map((row) => (
            <li key={row.key} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{row.label}</span>
                  <span className="ml-2 text-[12px] text-muted-foreground">
                    {row.booked
                      ? `Booked ${shortDay(row.date)} at ${row.time}`
                      : `Not booked · planned ${shortDay(row.date)}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(open === row.key ? null : row.key)}
                  className="text-[12px] font-medium text-primary underline-offset-2 hover:underline"
                >
                  {open === row.key ? "Close" : row.booked ? "Reschedule" : "Book"}
                </button>
              </div>
              {open === row.key ? (
                <BookSession
                  key={row.key}
                  dealId={dealId}
                  intake={intake}
                  row={row}
                  closeDate={closeDate}
                  implementationId={implementationId}
                  onSaved={() => {
                    setOpen(null);
                    onSaved();
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BookSession({
  dealId,
  intake,
  row,
  closeDate,
  implementationId,
  onSaved,
}: {
  dealId: string;
  intake: IntakeAnswers;
  row: SessionRow;
  closeDate: string;
  implementationId: string | null;
  onSaved: () => void;
}) {
  const save = useServerFn(saveIntake);
  const addNote = useServerFn(addJournalEntry);
  const browserZone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  const zone = intake.timeline.timezone || browserZone || "America/New_York";
  const [date, setDate] = useState(row.date);
  const [time, setTime] = useState(row.time ?? "10:00");
  const [reason, setReason] = useState("");

  const dateOk = ISO_RE.test(date);
  const timeOk = TIME_RE.test(time);
  const moves = dateOk ? movesFor(intake, closeDate, row.key, date) : [];
  const needsReason = moves.length > 0;
  const valid =
    dateOk && timeOk && (!needsReason || (reason.trim() !== "" && implementationId !== null));

  const m = useMutation({
    mutationFn: async () => {
      if (needsReason) {
        // The reason is written before the date moves, as the plan's own
        // date changes do: a moved session never exists without its reason.
        await addNote({
          data: {
            implementationId,
            note: `Session "${row.label}" set to ${date} ${time}; moves ${moves
              .map((mv) => `${mv.label} ${mv.from} → ${mv.to}`)
              .join(", ")}. Reason: ${reason.trim()}`,
            authorId: null,
            links: null,
            attachmentUrl: null,
            attachmentName: null,
            kind: "note",
          } as never,
        });
      }
      await save({
        data: {
          dealId,
          patch: {
            timeline: bookMeetingPatch(intake.timeline, [{ key: row.key, date, time }], zone),
          },
        } as never,
      });
    },
    onSuccess: onSaved,
  });

  return (
    <div className="mt-2 space-y-2 rounded-sm border border-border bg-muted/20 p-2.5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-muted-foreground">
          Date
          <input
            type="date"
            value={date}
            disabled={m.isPending}
            onChange={(e) => setDate(e.target.value)}
            className="mt-0.5 block h-8 rounded-sm border border-border bg-background px-2 text-[12px]"
          />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Time ({zone})
          <input
            type="time"
            value={time}
            disabled={m.isPending}
            onChange={(e) => setTime(e.target.value)}
            className="mt-0.5 block h-8 rounded-sm border border-border bg-background px-2 text-[12px]"
          />
        </label>
      </div>

      {dateOk ? (
        <div className="rounded-sm border border-border bg-background">
          <p className="border-b border-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {moves.length === 0
              ? "No other dates move"
              : `${moves.length} other date${moves.length === 1 ? "" : "s"} will move`}
          </p>
          {moves.length > 0 ? (
            <ul className="divide-y divide-border">
              {moves.map((mv) => (
                <li key={mv.key} className="flex justify-between gap-3 px-2.5 py-1 text-[12px]">
                  <span>{mv.label}</span>
                  <span className="text-muted-foreground">
                    {mv.from} → {mv.to}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {needsReason ? (
        <label className="block text-[11px] text-muted-foreground">
          Reason for moving the later dates
          <textarea
            rows={2}
            maxLength={500}
            value={reason}
            disabled={m.isPending}
            onChange={(e) => setReason(e.target.value)}
            className="mt-0.5 block w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[12px]"
            placeholder="Why the dates after this one are moving"
          />
        </label>
      ) : null}
      {needsReason && implementationId === null ? (
        <p className="text-[11px] text-destructive">
          This deal has no implementation record to write the reason to.
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!valid || m.isPending}
          onClick={() => m.mutate()}
          className="h-8 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {m.isPending ? "Saving…" : needsReason ? "Save and move dates" : "Save the session"}
        </button>
        {m.error ? <p className="text-[11px] text-destructive">{m.error.message}</p> : null}
      </div>
    </div>
  );
}

function TesterSection({
  dealId,
  intake,
  onSaved,
}: {
  dealId: string;
  intake: IntakeAnswers;
  onSaved: () => void;
}) {
  const save = useServerFn(saveIntake);
  const [name, setName] = useState(intake.timeline.field_tester ?? "");
  const [due, setDue] = useState(intake.timeline.field_tester_due ?? "");
  const dueOk = due === "" || ISO_RE.test(due);
  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          dealId,
          patch: {
            timeline: {
              ...intake.timeline,
              field_tester: name.trim() || null,
              field_tester_due: due || null,
            },
          },
        } as never,
      }),
    onSuccess: onSaved,
  });

  return (
    <section className="rounded-md border border-border bg-card px-4 py-3">
      <h2 className="text-[12px] font-semibold">Testing owner and deadline</h2>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-muted-foreground">
          Who tests the form
          <input
            type="text"
            maxLength={120}
            value={name}
            disabled={m.isPending}
            onChange={(e) => setName(e.target.value)}
            className="mt-0.5 block h-8 min-w-[12rem] rounded-sm border border-border bg-background px-2 text-[12px]"
          />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Due
          <input
            type="date"
            value={due}
            disabled={m.isPending}
            onChange={(e) => setDue(e.target.value)}
            className="mt-0.5 block h-8 rounded-sm border border-border bg-background px-2 text-[12px]"
          />
        </label>
        <button
          type="button"
          disabled={!dueOk || m.isPending}
          onClick={() => m.mutate()}
          className="h-8 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {m.isPending ? "Saving…" : "Save"}
        </button>
      </div>
      {m.error ? <p className="mt-1 text-[11px] text-destructive">{m.error.message}</p> : null}
    </section>
  );
}
