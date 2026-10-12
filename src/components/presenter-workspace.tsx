import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { StageTargetsEditor } from "@/components/timeline-panel";
import { dealQuery, type DealData } from "@/lib/deal-query";
import { addJournalEntry } from "@/lib/hub.functions";
import {
  firstFormName,
  isGoCanvasFormUrl,
  readIntake,
  type IntakeAnswers,
} from "@/lib/intake-answers";
import {
  confirmImplementationFocusFn,
  confirmWorkflowStoryFn,
} from "@/lib/implementation-focus.functions";
import { closeDateFor } from "@/lib/onboarding-plan";
import { localIso, shortDay } from "@/lib/onboarding-timeline";
import { getParkingLot, addParkingItemFn, updateParkingItemFn } from "@/lib/parking-lot.functions";
import { wonStage } from "@/lib/pipeline-stages";
import {
  removeFormScreenshot,
  saveHandoffAnswer,
  saveIntake,
  saveStageTarget,
  uploadFormScreenshot,
} from "@/lib/presale.functions";
import {
  FORM_SCREENSHOT_MAX_BYTES,
  FORM_SCREENSHOT_TYPES,
  type FormScreenshotType,
} from "@/lib/form-screenshot";
import { PRESENTER_GUIDES, PRESENTER_SECTIONS } from "@/lib/presenter-guides";
import {
  announceWelcomeChanged,
  movesFor,
  sessionsAfterKickoff,
  type SessionRow,
} from "@/lib/presenter-workspace";
import { answerSource, answerValue } from "@/lib/sales-handoff";
import { bookMeetingPatch } from "@/lib/stage-flow";
import type { StageTargetUpdate } from "@/lib/stage-targets";
import type { WelcomeView } from "@/lib/welcome";
import { getWelcome } from "@/lib/welcome.functions";
import { cn } from "@/lib/utils";

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

  const [active, setActive] = useState<SectionN>(1);

  return (
    <div className="mx-auto max-w-5xl p-4 text-[13px]">
      <header className="mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Presenter workspace · internal
        </p>
        <h1 className="text-[18px] font-semibold">{view.clientName}</h1>
        <p className="text-[12px] text-muted-foreground">
          Saved changes reach the open presentation after a moment. Nothing here is shown to the
          customer.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Workspace sections"
        className="sticky top-0 z-10 -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur"
      >
        {PRESENTER_SECTIONS.map((s) => (
          <button
            key={s.n}
            type="button"
            role="tab"
            id={`ws-tab-${s.n}`}
            aria-selected={active === s.n}
            aria-controls={`ws-panel-${s.n}`}
            onClick={() => setActive(s.n)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-medium",
              active === s.n
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {s.n}. {s.short}
          </button>
        ))}
      </div>

      <div>
        <Section n={1} active={active} onStep={setActive}>
          <HandoffText
            dealId={dealId}
            intake={intake}
            fieldKey="business_outcome"
            label="Business outcome, in their words"
            long
            onSaved={onSaved}
          />
          <HandoffText
            dealId={dealId}
            intake={intake}
            fieldKey="success_measure"
            label="How they will know it worked"
            onSaved={onSaved}
          />
          <FirstFormField dealId={dealId} intake={intake} onSaved={onSaved} />
          <GapNote>
            The first form's objective is taken from the outcome on the Welcome slide. It has no
            separate field to edit here.
          </GapNote>
        </Section>

        <Section n={2} active={active} onStep={setActive}>
          <WorkflowEditor dealId={dealId} intake={intake} onSaved={onSaved} />
          <HandoffText
            dealId={dealId}
            intake={intake}
            fieldKey="open_questions"
            label="Unresolved questions"
            long
            onSaved={onSaved}
          />
        </Section>

        <Section n={3} active={active} onStep={setActive}>
          <StageTargetsSection dealId={dealId} intake={intake} view={view} onSaved={onSaved} />
        </Section>

        <Section n={4} active={active} onStep={setActive}>
          <HandoffText
            dealId={dealId}
            intake={intake}
            fieldKey="contact_decision_maker"
            label="Decision maker (signs off changes)"
            onSaved={onSaved}
          />
          <HandoffText
            dealId={dealId}
            intake={intake}
            fieldKey="contact_admin_builder"
            label="Form maintainer (builds and looks after the forms)"
            onSaved={onSaved}
          />
          <HandoffText
            dealId={dealId}
            intake={intake}
            fieldKey="contact_day_to_day"
            label="Day-to-day contact"
            onSaved={onSaved}
          />
          <HandoffText
            dealId={dealId}
            intake={intake}
            fieldKey="commitments"
            label="Scope boundaries: what was promised"
            long
            onSaved={onSaved}
          />
          <GapNote>
            Responsibilities and the update rhythm have no field in the Hub yet. Agree them on the
            call and record them in the call notes.
          </GapNote>
          <GapNote>
            The 10-business-day response term has no field in the Hub. Read it from the signed
            agreement before quoting it. If the agreement states no term, do not state one.
          </GapNote>
        </Section>

        <Section n={5} active={active} onStep={setActive}>
          <FormLinkSection dealId={dealId} intake={intake} onSaved={onSaved} />
          <FormScreenshotControl
            dealId={dealId}
            screenshot={intake.first_form_screenshot}
            previewUrl={view.formScreenshotUrl}
            onSaved={onSaved}
          />
          <RemainingChanges dealId={dealId} onSaved={onSaved} />
          <p className="text-[11px] text-muted-foreground">
            Testing owner and deadline are set in section 6.
          </p>
        </Section>

        <Section n={6} active={active} onStep={setActive}>
          <SessionsSection
            dealId={dealId}
            intake={intake}
            view={view}
            closeDate={closeDate}
            implementationId={deal.implementation_id}
            onSaved={onSaved}
          />
          <NextActions dealId={dealId} />
          <TesterSection dealId={dealId} intake={intake} onSaved={onSaved} />
          <ScopeConfirm dealId={dealId} intake={intake} onSaved={onSaved} />
        </Section>
      </div>
    </div>
  );
}

type SectionN = 1 | 2 | 3 | 4 | 5 | 6;

function Section({
  n,
  active,
  onStep,
  children,
}: {
  n: SectionN;
  active: SectionN;
  onStep: (next: SectionN) => void;
  children: ReactNode;
}) {
  const meta = PRESENTER_SECTIONS.find((s) => s.n === n)!;
  const guide = PRESENTER_GUIDES[n];
  const prev = PRESENTER_SECTIONS.find((s) => s.n === n - 1);
  const next = PRESENTER_SECTIONS.find((s) => s.n === n + 1);
  return (
    <section
      id={`ws-panel-${n}`}
      role="tabpanel"
      aria-labelledby={`ws-tab-${n}`}
      hidden={active !== n}
      className="rounded-md border border-border bg-card"
    >
      <header className="flex items-baseline gap-2 border-b border-border px-4 py-2">
        <span className="text-[11px] font-semibold text-muted-foreground">{n}</span>
        <h2 className="text-[14px] font-semibold">{meta.title}</h2>
      </header>
      <div className="grid md:grid-cols-[2fr_3fr]">
        <details
          open
          className="border-b border-border bg-muted/20 px-4 py-3 md:border-b-0 md:border-r"
        >
          <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Conversation guide
          </summary>
          <dl className="mt-2.5 space-y-2.5 text-[12px] leading-relaxed">
            <GuideRow term="Objective">{guide.objective}</GuideRow>
            <GuideRow term="Open with">
              <span className="italic">“{guide.opening}”</span>
            </GuideRow>
            <GuideRow term="Ask">
              <ol className="ml-4 list-decimal space-y-0.5">
                {guide.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            </GuideRow>
            <GuideRow term="Capture">{guide.capture}</GuideRow>
            <GuideRow term="Move on when">{guide.ready}</GuideRow>
          </dl>
        </details>
        <div className="space-y-4 px-4 py-3">{children}</div>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-[12px]">
        {prev ? (
          <button
            type="button"
            onClick={() => onStep(prev.n)}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            ← Previous: {prev.short}
          </button>
        ) : (
          <span />
        )}
        {next ? (
          <button
            type="button"
            onClick={() => onStep(next.n)}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Next: {next.short} →
          </button>
        ) : null}
      </footer>
    </section>
  );
}

function GuideRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {term}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function GapNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-sm border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
      <span className="font-semibold text-foreground">Not in the Hub yet.</span> {children}
    </p>
  );
}

function StatusChip({
  tone,
  children,
}: {
  tone: "missing" | "proposed" | "entered";
  children: ReactNode;
}) {
  const cls =
    tone === "missing"
      ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
      : tone === "proposed"
        ? "bg-primary/10 text-primary"
        : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>
  );
}

function FieldLabel({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-semibold">{label}</span>
      {children}
    </div>
  );
}

function HandoffText({
  dealId,
  intake,
  fieldKey,
  label,
  long = false,
  onSaved,
}: {
  dealId: string;
  intake: IntakeAnswers;
  fieldKey: string;
  label: string;
  long?: boolean;
  onSaved: () => void;
}) {
  const save = useServerFn(saveHandoffAnswer);
  const raw = answerValue(intake, fieldKey);
  const saved = typeof raw === "string" ? raw : "";
  const source = answerSource(intake, fieldKey);
  const [text, setText] = useState(saved);
  useEffect(() => setText(saved), [saved]);
  const m = useMutation({
    mutationFn: () =>
      save({ data: { dealId, key: fieldKey, value: text.trim() || null } } as never),
    onSuccess: onSaved,
  });
  const dirty = text.trim() !== saved;

  return (
    <div>
      <FieldLabel label={label}>
        {saved ? (
          source === "ai" ? (
            <StatusChip tone="proposed">Proposed by the AI reading — check it</StatusChip>
          ) : (
            <StatusChip tone="entered">Entered</StatusChip>
          )
        ) : (
          <StatusChip tone="missing">Missing — ask</StatusChip>
        )}
      </FieldLabel>
      <div className="flex flex-wrap items-start gap-2">
        {long ? (
          <textarea
            rows={2}
            maxLength={1200}
            value={text}
            disabled={m.isPending}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[3.5rem] flex-1 rounded-sm border border-border bg-background px-2 py-1.5 text-[12px]"
          />
        ) : (
          <input
            type="text"
            maxLength={400}
            value={text}
            disabled={m.isPending}
            onChange={(e) => setText(e.target.value)}
            className="h-8 flex-1 rounded-sm border border-border bg-background px-2 text-[12px]"
          />
        )}
        <button
          type="button"
          disabled={!dirty || m.isPending}
          onClick={() => m.mutate()}
          className="h-8 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {m.isPending ? "Saving…" : "Save"}
        </button>
      </div>
      {m.error ? <p className="mt-1 text-[11px] text-destructive">{m.error.message}</p> : null}
    </div>
  );
}

function FirstFormField({
  dealId,
  intake,
  onSaved,
}: {
  dealId: string;
  intake: IntakeAnswers;
  onSaved: () => void;
}) {
  const save = useServerFn(saveIntake);
  const current = firstFormName(intake) ?? "";
  const [name, setName] = useState(current);
  useEffect(() => setName(current), [current]);
  const m = useMutation({
    mutationFn: () => {
      const trimmed = name.trim();
      const forms = intake.wanted_forms;
      const at = current ? forms.findIndex((f) => f.name === current) : -1;
      const next =
        at >= 0
          ? forms.map((f, i) => (i === at ? { ...f, name: trimmed } : f))
          : [
              ...forms,
              {
                id: `form-${Math.random().toString(36).slice(2, 10)}`,
                name: trimmed,
                template_id: null,
              },
            ];
      return save({ data: { dealId, patch: { wanted_forms: next } } as never });
    },
    onSuccess: onSaved,
  });
  const dirty = name.trim() !== current;

  return (
    <div>
      <FieldLabel label="First form">
        {current ? (
          <StatusChip tone="entered">Named</StatusChip>
        ) : (
          <StatusChip tone="missing">Missing — ask</StatusChip>
        )}
      </FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          maxLength={160}
          value={name}
          disabled={m.isPending}
          onChange={(e) => setName(e.target.value)}
          className="h-8 flex-1 rounded-sm border border-border bg-background px-2 text-[12px]"
        />
        <button
          type="button"
          disabled={!dirty || !name.trim() || m.isPending}
          onClick={() => m.mutate()}
          className="h-8 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {m.isPending ? "Saving…" : "Save"}
        </button>
      </div>
      {m.error ? <p className="mt-1 text-[11px] text-destructive">{m.error.message}</p> : null}
    </div>
  );
}

function WorkflowEditor({
  dealId,
  intake,
  onSaved,
}: {
  dealId: string;
  intake: IntakeAnswers;
  onSaved: () => void;
}) {
  const save = useServerFn(saveIntake);
  const confirm = useServerFn(confirmWorkflowStoryFn);
  const story = intake.workflow_story;
  const savedWords = {
    before: story.before ?? "",
    during: story.during ?? "",
    after: story.after ?? "",
  };
  const [draft, setDraft] = useState(savedWords);
  useEffect(
    () =>
      setDraft({
        before: story.before ?? "",
        during: story.during ?? "",
        after: story.after ?? "",
      }),
    [story.before, story.during, story.after],
  );
  const dirty =
    draft.before !== savedWords.before ||
    draft.during !== savedWords.during ||
    draft.after !== savedWords.after;
  const filled = Object.values(savedWords).filter((s) => s.trim()).length;
  const confirmed = Boolean(story.validated_at);

  // Editing the words clears their confirmation, as the workflow panel does.
  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          dealId,
          patch: {
            workflow_story: {
              before: draft.before.trim() || null,
              during: draft.during.trim() || null,
              after: draft.after.trim() || null,
              validated_at: null,
              validated_by: null,
            },
          },
        } as never,
      }),
    onSuccess: onSaved,
  });
  const c = useMutation({
    mutationFn: () => confirm({ data: { dealId } }),
    onSuccess: onSaved,
  });

  return (
    <div className="space-y-2">
      <FieldLabel label="Before, during and after">
        {confirmed ? (
          <StatusChip tone="entered">Confirmed with them</StatusChip>
        ) : filled ? (
          <StatusChip tone="proposed">Not confirmed yet</StatusChip>
        ) : (
          <StatusChip tone="missing">Missing — ask</StatusChip>
        )}
      </FieldLabel>
      {(["before", "during", "after"] as const).map((part) => (
        <label key={part} className="block text-[11px] text-muted-foreground">
          {part === "before"
            ? "Before the job"
            : part === "during"
              ? "During the job"
              : "After the job"}
          <textarea
            rows={2}
            maxLength={4000}
            value={draft[part]}
            disabled={m.isPending}
            onChange={(e) => setDraft({ ...draft, [part]: e.target.value })}
            className="mt-0.5 block w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
          />
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!dirty || m.isPending}
          onClick={() => m.mutate()}
          className="h-8 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {m.isPending ? "Saving…" : "Save workflow"}
        </button>
        <button
          type="button"
          disabled={dirty || confirmed || filled === 0 || c.isPending}
          onClick={() => c.mutate()}
          className="h-8 rounded-sm border border-border px-3 text-[12px] font-medium disabled:opacity-50"
        >
          {c.isPending ? "Confirming…" : "Confirm with them"}
        </button>
      </div>
      {m.error ? <p className="text-[11px] text-destructive">{m.error.message}</p> : null}
      {c.error ? <p className="text-[11px] text-destructive">{c.error.message}</p> : null}
    </div>
  );
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read that picture."));
    reader.readAsDataURL(file);
  });
}

/**
 * One screenshot of the customer's first form, shown on Kickoff Slide 5 in
 * place of the phone mockup. The file is checked here for type and size, and
 * again on the server against its actual bytes.
 */
function FormScreenshotControl({
  dealId,
  screenshot,
  previewUrl,
  onSaved,
}: {
  dealId: string;
  screenshot: IntakeAnswers["first_form_screenshot"];
  previewUrl: string | null;
  onSaved: () => void;
}) {
  const upload = useServerFn(uploadFormScreenshot);
  const remove = useServerFn(removeFormScreenshot);
  const inputRef = useRef<HTMLInputElement>(null);
  const up = useMutation({
    mutationFn: async (file: File) => {
      if (!FORM_SCREENSHOT_TYPES.includes(file.type as FormScreenshotType)) {
        throw new Error("Choose a PNG, JPG or WebP picture.");
      }
      if (file.size > FORM_SCREENSHOT_MAX_BYTES) {
        throw new Error("That picture is over 8 MB — a screenshot of the form is enough.");
      }
      const dataBase64 = await readBase64(file);
      return upload({ data: { dealId, fileName: file.name, dataBase64 } });
    },
    onSuccess: onSaved,
  });
  const rm = useMutation({
    mutationFn: () => remove({ data: { dealId } }),
    onSuccess: onSaved,
  });
  const busy = up.isPending || rm.isPending;
  const error = up.error ?? rm.error;

  return (
    <div className="space-y-2">
      <FieldLabel label="Screenshot of the form">
        {screenshot ? (
          <StatusChip tone="entered">On the slide</StatusChip>
        ) : (
          <StatusChip tone="missing">None yet — the phone is shown</StatusChip>
        )}
      </FieldLabel>
      {screenshot && previewUrl ? (
        <img
          src={previewUrl}
          alt="Preview of the form screenshot"
          className="max-h-48 rounded-sm border border-border"
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={FORM_SCREENSHOT_TYPES.join(",")}
          aria-label="Choose a screenshot of the form"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) up.mutate(file);
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="h-8 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {up.isPending ? "Uploading…" : screenshot ? "Replace screenshot" : "Upload screenshot"}
        </button>
        {screenshot ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => rm.mutate()}
            className="h-8 rounded-sm border border-border px-3 text-[12px] font-medium disabled:opacity-50"
          >
            {rm.isPending ? "Removing…" : "Remove"}
          </button>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground">
        PNG, JPG or WebP, up to 8 MB. Shown only on this deal's Kickoff slide.
      </p>
      {error ? <p className="text-[11px] text-destructive">{error.message}</p> : null}
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
    <div>
      <FieldLabel label="Editable form in GoCanvas">
        {saved ? (
          <StatusChip tone="entered">Link saved</StatusChip>
        ) : (
          <StatusChip tone="missing">Missing — paste it</StatusChip>
        )}
      </FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
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
      <p className="mt-1 text-[11px] text-muted-foreground">
        Internal only. Never on a slide, a shared link or the PowerPoint export.
      </p>
    </div>
  );
}

function useOpenChanges(dealId: string) {
  const load = useServerFn(getParkingLot);
  const q = useQuery({
    queryKey: ["parking-lot", dealId],
    queryFn: () => load({ data: { dealId } }),
  });
  return (q.data ?? []).filter((i) => i.status === "open" || i.status === "scheduled");
}

const OWNER_LABEL = { gocanvas: "GoCanvas", customer: "Customer", both: "Both" } as const;

function RemainingChanges({ dealId, onSaved }: { dealId: string; onSaved: () => void }) {
  const qc = useQueryClient();
  const open = useOpenChanges(dealId);
  const add = useServerFn(addParkingItemFn);
  const update = useServerFn(updateParkingItemFn);
  const [request, setRequest] = useState("");
  const [owner, setOwner] = useState<"gocanvas" | "customer" | "both">("customer");
  const [target, setTarget] = useState("");
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["parking-lot", dealId] });
    onSaved();
  };
  const addM = useMutation({
    mutationFn: () =>
      add({
        data: { dealId, item: { request: request.trim(), owner, target: target.trim() } },
      } as never),
    onSuccess: () => {
      setRequest("");
      setTarget("");
      refresh();
    },
  });
  const doneM = useMutation({
    mutationFn: (id: string) => update({ data: { id, patch: { status: "done" } } } as never),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-2">
      <FieldLabel label="Remaining changes before the test">
        <StatusChip tone={open.length ? "proposed" : "entered"}>
          {open.length ? `${open.length} open` : "None open"}
        </StatusChip>
      </FieldLabel>
      {open.length ? (
        <ul className="divide-y divide-border rounded-sm border border-border">
          {open.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5"
            >
              <span className="text-[12px]">
                {item.request}
                <span className="ml-2 text-[11px] text-muted-foreground">
                  {OWNER_LABEL[item.owner]} · {item.target || "No date yet"}
                </span>
              </span>
              <button
                type="button"
                disabled={doneM.isPending}
                onClick={() => doneM.mutate(item.id)}
                className="text-[12px] font-medium text-primary underline-offset-2 hover:underline"
              >
                Mark done
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-[11px] text-muted-foreground">
          Change
          <input
            type="text"
            maxLength={300}
            value={request}
            disabled={addM.isPending}
            onChange={(e) => setRequest(e.target.value)}
            className="mt-0.5 block h-8 w-full rounded-sm border border-border bg-background px-2 text-[12px] text-foreground"
          />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Owner
          <select
            value={owner}
            disabled={addM.isPending}
            onChange={(e) => setOwner(e.target.value as typeof owner)}
            className="mt-0.5 block h-8 rounded-sm border border-border bg-background px-2 text-[12px] text-foreground"
          >
            <option value="customer">Customer</option>
            <option value="gocanvas">GoCanvas</option>
            <option value="both">Both</option>
          </select>
        </label>
        <label className="text-[11px] text-muted-foreground">
          Target
          <input
            type="text"
            maxLength={80}
            value={target}
            disabled={addM.isPending}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. Before the test"
            className="mt-0.5 block h-8 w-36 rounded-sm border border-border bg-background px-2 text-[12px] text-foreground"
          />
        </label>
        <button
          type="button"
          disabled={!request.trim() || addM.isPending}
          onClick={() => addM.mutate()}
          className="h-8 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {addM.isPending ? "Adding…" : "Add change"}
        </button>
      </div>
      {addM.error ? <p className="text-[11px] text-destructive">{addM.error.message}</p> : null}
      {doneM.error ? <p className="text-[11px] text-destructive">{doneM.error.message}</p> : null}
    </div>
  );
}

function NextActions({ dealId }: { dealId: string }) {
  const open = useOpenChanges(dealId);
  return (
    <div className="space-y-1.5">
      <FieldLabel label="Next actions, owners and dates">
        <span className="text-[11px] text-muted-foreground">Edited in section 5</span>
      </FieldLabel>
      {open.length ? (
        <ul className="space-y-1 text-[12px]">
          {open.map((item) => (
            <li key={item.id}>
              {item.request}
              <span className="ml-2 text-muted-foreground">
                {OWNER_LABEL[item.owner]} · {item.target || "No date yet"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-muted-foreground">No open actions.</p>
      )}
    </div>
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
    <div className="space-y-1.5">
      <FieldLabel label={`Next working sessions · ${booked} of ${rows.length} booked`} />
      {rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">No working sessions on this plan.</p>
      ) : (
        <ul className="divide-y divide-border">
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
    </div>
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
    <div className="space-y-1.5">
      <FieldLabel label="Testing owner and deadline">
        {intake.timeline.field_tester ? (
          <StatusChip tone="entered">Named</StatusChip>
        ) : (
          <StatusChip tone="missing">Missing — ask</StatusChip>
        )}
      </FieldLabel>
      <div className="flex flex-wrap items-end gap-2">
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
      {m.error ? <p className="text-[11px] text-destructive">{m.error.message}</p> : null}
    </div>
  );
}

function ScopeConfirm({
  dealId,
  intake,
  onSaved,
}: {
  dealId: string;
  intake: IntakeAnswers;
  onSaved: () => void;
}) {
  const confirm = useServerFn(confirmImplementationFocusFn);
  const focus = intake.implementation_focus;
  const agreed = focus.items.filter((i) => i.status === "agreed").length;
  const proposed = focus.items.length - agreed;
  const confirmed = Boolean(focus.validated_at);
  const m = useMutation({
    mutationFn: () => confirm({ data: { dealId } }),
    onSuccess: onSaved,
  });

  return (
    <div className="space-y-1.5">
      <FieldLabel label="First scope confirmation">
        {confirmed ? (
          <StatusChip tone="entered">Confirmed with them</StatusChip>
        ) : focus.items.length ? (
          <StatusChip tone="proposed">Not confirmed yet</StatusChip>
        ) : (
          <StatusChip tone="missing">Missing — ask</StatusChip>
        )}
      </FieldLabel>
      <p className="text-[12px] text-muted-foreground">
        {focus.items.length
          ? `${agreed} agreed, ${proposed} proposed.`
          : "No scope items on the focus yet."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={focus.items.length === 0 || confirmed || m.isPending}
          onClick={() => m.mutate()}
          className="h-8 rounded-sm border border-border px-3 text-[12px] font-medium disabled:opacity-50"
        >
          {m.isPending ? "Confirming…" : "Confirm first scope"}
        </button>
      </div>
      <GapNote>Editing scope items is on the deal page, where the focus editor lives.</GapNote>
      {m.error ? <p className="text-[11px] text-destructive">{m.error.message}</p> : null}
    </div>
  );
}
