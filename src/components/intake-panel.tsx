import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUp, Check, ExternalLink, ListPlus, Upload, X } from "lucide-react";

import { AiSource, useStartReading } from "@/components/fill-from-sources";
import { TemplateCard } from "@/components/template-card";
import { suggestFormTemplatesFn } from "@/lib/form-templates.functions";
import type { DealData } from "@/lib/deal-query";
import {
  addWantedForm,
  chosenFrom,
  COMPANY_SIZES,
  formsOnly,
  INDUSTRIES,
  isTrainingOnly,
  makeFirstWantedForm,
  readIntake,
  templateIds,
  toggleWantedTemplate,
  type IntakeAnswers,
} from "@/lib/intake-answers";
import { SERVICE_KINDS, type ServiceSpec } from "@/lib/onboarding-services";
import {
  addReport,
  getIntakeFormLink,
  saveIntake,
  uploadContract,
  uploadIntakeForm,
  uploadSow,
} from "@/lib/presale.functions";
import { cn } from "@/lib/utils";

/**
 * The onboarding intake, on the deal, as the pieces the stage checklist
 * opens one at a time (see stage-flow.tsx): the SOW, the flow, and the facts
 * the calls gave. Each answer saves as it is given; there is no form to
 * submit, because an intake is a conversation and the person typing is on a
 * call.
 */

/**
 * One save at a time. Two answers given quickly — a number, then a blur into
 * the next field — used to go up as two overlapping requests, each reading
 * the record and writing it back whole: the second silently undid the
 * first. Chaining them keeps every answer.
 */
function useIntakeSaver(dealId: string) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const [error, setError] = useState<string | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const mutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => {
      const next = chain.current.then(() => save({ data: { dealId, patch } as never }));
      chain.current = next.catch(() => undefined);
      return next;
    },
    onMutate: () => setError(null),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["deal", dealId] }),
    onError: (e) => setError((e as Error).message),
  });
  return {
    set: (patch: Record<string, unknown>) => mutation.mutate(patch),
    busy: mutation.isPending,
    error,
  };
}

function SaveError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-1.5 text-[12px] text-destructive">
      {error}
    </p>
  ) : null;
}

/** The SOW: on file, or upload it, or say there is none and upload the contract. */
export function SowStep({ deal, editable }: { deal: DealData; editable: boolean }) {
  const dealId = deal.account.id;
  const answers = readIntake(deal.account.intake);
  const { set, busy, error } = useIntakeSaver(dealId);
  const hasSowFile = Boolean(deal.sow_url);
  const sowFacts = [
    deal.account.sow_reference,
    deal.account.sow_signed_date ? `signed ${deal.account.sow_signed_date}` : null,
    deal.account.sow_value != null ? `$${Number(deal.account.sow_value).toLocaleString()}` : null,
  ].filter(Boolean) as string[];
  return (
    <div>
      {hasSowFile ? (
        <div className="text-[12px]">
          <p className="font-medium">
            SOW on file{sowFacts.length ? ` · ${sowFacts.join(" · ")}` : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {sowFacts.length
              ? "Read from the signed document. Replace it under Notes & documents."
              : "The reference, signed date and value are read from the document when the plan reads the SOW."}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-1.5 text-[12px] font-medium">Is there a SOW?</p>
          <div className="flex flex-wrap items-center gap-2">
            <Choice
              active={answers.has_sow === true}
              disabled={!editable || busy}
              onClick={() => set({ has_sow: true })}
            >
              Yes — upload the SOW
            </Choice>
            <Choice
              active={answers.has_sow === false}
              disabled={!editable || busy}
              onClick={() => set({ has_sow: false })}
            >
              No — upload the contract
            </Choice>
          </div>
          {answers.has_sow === true ? (
            <div className="mt-2">
              <PdfUpload dealId={dealId} kind="sow" editable={editable} onFile={null} path={null} />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Integrations and services come from here, never from the notes.
              </p>
            </div>
          ) : answers.has_sow === false ? (
            <div className="mt-2">
              <PdfUpload
                dealId={dealId}
                kind="contract"
                editable={editable}
                onFile={answers.contract ? `${answers.contract.name} is on file.` : null}
                path={answers.contract?.path ?? null}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                No SOW means nothing bought beyond the core. The contract says how many seats and
                for how long, so implementation is not guessing.
              </p>
            </div>
          ) : null}
        </>
      )}
      <SaveError error={error} />
    </div>
  );
}

/** Were integrations involved, and who they are. Pre-filled by the brief. */
export function FactsStep({ deal, editable }: { deal: DealData; editable: boolean }) {
  const answers = readIntake(deal.account.intake);
  const { set, busy, error } = useIntakeSaver(deal.account.id);
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-medium">
        Were integrations or solutions part of the sale?
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Choice
          active={answers.solutions_involved === true}
          disabled={!editable || busy}
          onClick={() => set({ solutions_involved: true })}
        >
          Yes
        </Choice>
        <Choice
          active={answers.solutions_involved === false}
          disabled={!editable || busy}
          onClick={() => set({ solutions_involved: false })}
        >
          No — just the core
        </Choice>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {answers.solutions_involved === true
          ? answers.has_sow === false
            ? "Yes, but no SOW: the plan cannot hold a service it has no paper for. Add the SOW under step 1, or go back to No."
            : "The plan reads which ones from the SOW — the notes only say that there were some."
          : answers.solutions_involved === false
            ? "Phase 1 is the whole plan: the form, the conversion, or the training."
            : "The notes usually say. The SOW says which."}
      </p>
      <div className="mt-3 border-t border-border pt-2.5">
        <p className="mb-1 text-[12px] font-medium">
          Who are they? Industry, size, people in the field, the process today.
        </p>
        <NoForms answers={answers} editable={editable} busy={busy} onSet={set} />
        <AiSource answers={answers} field="current_process" />
      </div>
      <SaveError error={error} />
    </div>
  );
}

/** The onboarding flow, and the one question the flow itself asks. */
export function FlowStep({ deal, editable }: { deal: DealData; editable: boolean }) {
  const dealId = deal.account.id;
  const answers = readIntake(deal.account.intake);
  const { set, busy, error } = useIntakeSaver(dealId);
  const training = isTrainingOnly(answers);
  return (
    <div>
      {/* The type of deal is its own question on the checklist; this is
          what that type asks next. */}
      {answers.path === null ? (
        <p className="text-[12px] text-muted-foreground">
          Answer "What type of deal is this?" first — these questions depend on it.
        </p>
      ) : null}
      {answers.path === "new_logo" || answers.path === "dm_conversion" ? (
        <div className="mt-3 border-t border-border pt-2.5">
          <p className="mb-1.5 text-[12px] font-medium">Do they already have forms built?</p>
          <div className="flex flex-wrap items-center gap-2">
            <Choice
              active={!training && answers.forms_built === true}
              disabled={!editable || busy}
              onClick={() => set({ forms_built: true, training_only: false })}
            >
              Yes — upload them
            </Choice>
            <Choice
              active={!training && answers.forms_built === false}
              disabled={!editable || busy}
              onClick={() => set({ forms_built: false, training_only: false })}
            >
              No — we build the first one together
            </Choice>
            <Choice
              active={training}
              disabled={!editable || busy}
              onClick={() => {
                if (
                  !training &&
                  (answers.wanted_forms.length > 0 || answers.uploaded_forms.length > 0) &&
                  !window.confirm(
                    "Training only rebuilds phase 1 as two weeks of training — no first form. The forms already named stay on the record. Continue?",
                  )
                )
                  return;
                set({ training_only: true });
              }}
            >
              No form — they just need training
            </Choice>
          </div>
          {training ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Phase 1 becomes GoCanvas training: three 30-minute sessions over two weeks. Anything
              the SOW bought still follows in phase 2.
            </p>
          ) : null}
          {!training && answers.forms_built === true ? (
            <div className="mt-2">
              <HaveForms dealId={dealId} answers={answers} editable={editable} />
            </div>
          ) : null}
          {!training && answers.forms_built !== null ? (
            <div className="mt-2">
              <WantedForms answers={answers} editable={editable} busy={busy} onSet={set} />
              <AiSource answers={answers} field="wanted_forms" />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Up to three forms in phase 1: the first is built live on the kickoff call, the next
                two alongside it. A fourth waits for phase 2.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {answers.path === "existing" ? (
        <ExistingQuestions answers={answers} editable={editable} busy={busy} onSet={set} />
      ) : null}

      {answers.path === "field_fusion" ? (
        <p className="mt-3 border-t border-border pt-2.5 text-[12px] text-muted-foreground">
          Nothing more to answer here. At the close the deal moves to Field Fusion setup and Liesl
          gets it; her gate — form connected, client trained, a note — sits at the top of this page
          until she presses Hand to implementation.
        </p>
      ) : null}
      <SaveError error={error} />
    </div>
  );
}

/**
 * The Account Manager's questions on an existing account. Is the form
 * final? If not, who builds it? A customer build has a date; the
 * integration waits behind the freeze.
 */
function ExistingQuestions({
  answers,
  editable,
  busy,
  onSet,
}: {
  answers: IntakeAnswers;
  editable: boolean;
  busy: boolean;
  onSet: (patch: Record<string, unknown>) => void;
}) {
  const e = answers.existing;
  const [by, setBy] = useState(e.customer_build_by ?? "");
  useEffect(() => setBy(e.customer_build_by ?? ""), [e.customer_build_by]);
  return (
    <div className="mt-3 border-t border-border pt-2.5">
      <p className="mb-1.5 text-[12px] font-medium">Is the form finalized and complete?</p>
      <div className="flex flex-wrap items-center gap-2">
        <Choice
          active={e.form_final === true}
          disabled={!editable || busy}
          onClick={() => onSet({ existing: { form_final: true }, training_only: false })}
        >
          Yes — it is final
        </Choice>
        <Choice
          active={e.form_final === false}
          disabled={!editable || busy}
          onClick={() => onSet({ existing: { form_final: false }, training_only: false })}
        >
          No — it still needs building
        </Choice>
      </div>
      {e.form_final === true ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Phase 1 is a 45-minute review of the form with the integration in mind — a finished form
          usually needs a field or two for a mapping — then the integration starts.
        </p>
      ) : null}
      {e.form_final === false ? (
        <div className="mt-2.5">
          <p className="mb-1.5 text-[12px] font-medium">Who builds it?</p>
          <div className="flex flex-wrap items-center gap-2">
            <Choice
              active={e.builder === "us"}
              disabled={!editable || busy}
              onClick={() => onSet({ existing: { builder: "us" } })}
            >
              We build it, with them
            </Choice>
            <Choice
              active={e.builder === "customer"}
              disabled={!editable || busy}
              onClick={() => onSet({ existing: { builder: "customer" } })}
            >
              The customer builds it
            </Choice>
          </div>
          {e.builder === "us" ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Phase 1 is the two-week build, their hands on the keyboard. The integration starts
              once the form is proven on real jobs.
            </p>
          ) : null}
          {e.builder === "customer" ? (
            <div className="mt-2">
              <label className="block text-[11px] text-muted-foreground" htmlFor="existing-by">
                They build it by
              </label>
              <input
                id="existing-by"
                type="date"
                className="mt-0.5 h-7 rounded-sm border border-border bg-background px-1.5 text-[12px]"
                value={by}
                disabled={!editable || busy}
                onChange={(ev) => setBy(ev.target.value)}
                onBlur={() => {
                  if (by !== (e.customer_build_by ?? ""))
                    onSet({ existing: { customer_build_by: by || null } });
                }}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                The kickoff splits the work out loud — you build the form, we build the integration.
                A check-in on day 5, a freeze on day 9, and the integration starts the day it is
                frozen. If the date slips, the plan says so.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The paste box: the transcript goes in, the brief follows on its own. */
export function NotesIn({ deal, editable }: { deal: DealData; editable: boolean }) {
  const qc = useQueryClient();
  const create = useServerFn(addReport);
  const reading = useStartReading(deal.account.id);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [callDate, setCallDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const add = useMutation({
    // A file saves as it is dropped: its name is the title, its text the notes.
    mutationFn: (file?: { name: string; text: string }) =>
      create({
        data: {
          dealId: deal.account.id,
          title: file ? file.name : title.trim() || `Call notes${callDate ? ` — ${callDate}` : ""}`,
          reportType: "call_notes",
          contentMd: (file ? file.text : content).trim(),
          callDate: callDate || null,
        },
      }),
    onMutate: () => setError(null),
    onSuccess: () => {
      setContent("");
      setTitle("");
      setCallDate("");
      void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] });
      void qc.invalidateQueries({ queryKey: ["welcome", deal.account.id] });
      // Every new Gong brief is read on its own: the flow, the forms, the
      // process and the plan refresh, and a person's own answers stand.
      reading.mutate();
    },
    onError: (e) => setError((e as Error).message),
  });
  // The Gong brief comes out of Gong as a Markdown file; a text export works
  // the same way. Read in the browser, saved as the notes — no PDF parsing.
  const readFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (!/\.(md|markdown|txt)$/i.test(f.name) && !/^text\//.test(f.type)) {
      setError("A Markdown (.md) or text (.txt) file, please.");
      return;
    }
    if (f.size > 2_000_000) {
      setError("That file is over 2 MB. Paste the part that matters instead.");
      return;
    }
    const text = await f.text();
    if (!text.trim()) {
      setError("That file is empty.");
      return;
    }
    add.mutate({ name: f.name.replace(/\.(md|markdown|txt)$/i, ""), text });
  };

  return (
    <div>
      {deal.gong_reports.length ? (
        <ul className="mb-2 space-y-0.5 text-[12px]">
          {deal.gong_reports.map((r) => (
            <li key={r.id} className="flex items-center gap-1.5">
              <Check className="h-3 w-3 text-status-ontrack-foreground" strokeWidth={3} />
              <span className="truncate">{r.title}</span>
              {r.call_date ? <span className="text-muted-foreground">· {r.call_date}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {editable ? (
        <div className="space-y-1.5">
          <textarea
            className={cn(
              "min-h-[88px] w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[12px]",
              dragging && "border-primary bg-primary/5",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void readFile(e.dataTransfer.files?.[0]);
            }}
            placeholder={
              deal.gong_reports.length
                ? "Another call? Paste it here, or drop the Gong brief (.md) on this box."
                : "Paste the Gong transcript or call notes here — or drop the Gong brief (.md) on this box."
            }
            value={content}
            disabled={add.isPending}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              className="h-7 w-44 rounded-sm border border-border bg-background px-1.5 text-[12px]"
              placeholder="Title (optional)"
              value={title}
              disabled={add.isPending}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              type="date"
              className="h-7 rounded-sm border border-border bg-background px-1.5 text-[12px]"
              value={callDate}
              disabled={add.isPending}
              onChange={(e) => setCallDate(e.target.value)}
              title="The day of the call, when it is not today"
            />
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-sm bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={add.isPending || !content.trim()}
              onClick={() => add.mutate()}
            >
              {add.isPending ? "Saving…" : "Add the notes"}
            </button>
            <span className="text-[11px] text-muted-foreground">or</span>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              className="hidden"
              onChange={(e) => {
                void readFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-sm border border-border px-2.5 text-[12px] hover:bg-muted disabled:opacity-50"
              disabled={add.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-3 w-3" />
              Upload the Gong brief (.md)
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A PDF onto the deal: the SOW onto the record, or the contract onto the intake. */
function PdfUpload({
  dealId,
  kind,
  editable,
  onFile,
  path,
}: {
  dealId: string;
  kind: "sow" | "contract";
  editable: boolean;
  /** What to say when a file is already there; null when there is none. */
  onFile: string | null;
  /** The contract's path, for the open link. */
  path: string | null;
}) {
  const qc = useQueryClient();
  const sow = useServerFn(uploadSow);
  const contract = useServerFn(uploadContract);
  const link = useServerFn(getIntakeFormLink);
  const reading = useStartReading(dealId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.type !== "application/pdf") throw new Error("A PDF, please.");
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      const data = {
        dealId,
        fileName: file.name,
        contentType: "application/pdf" as const,
        dataBase64,
      };
      return kind === "sow" ? sow({ data }) : contract({ data });
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["deal", dealId] });
      // A new SOW is read on its own, with the calls: services onto the plan.
      if (kind === "sow") reading.mutate();
    },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      {onFile ? (
        <span className="inline-flex items-center gap-1 text-status-ontrack-foreground">
          <Check className="h-3 w-3" strokeWidth={3} /> {onFile}
        </span>
      ) : (
        <span className="text-muted-foreground">
          {kind === "sow" ? "No SOW on file yet." : "No contract on file yet."}
        </span>
      )}
      {path ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 underline"
          onClick={async () => {
            try {
              const { url } = await link({ data: { dealId, path } });
              window.open(url, "_blank", "noopener");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <ExternalLink className="h-3 w-3" /> Open
        </button>
      ) : null}
      {editable ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="inline-flex h-6 items-center gap-1 rounded-sm border border-border px-2 text-[11px] hover:bg-muted disabled:opacity-50"
            disabled={upload.isPending}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3 w-3" />
            {upload.isPending
              ? "Uploading…"
              : onFile
                ? "Replace"
                : `Upload the ${kind === "sow" ? "SOW" : "contract"}`}
          </button>
        </>
      ) : null}
      {error ? (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function Choice({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[12px] transition-colors disabled:opacity-60",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border hover:bg-muted",
      )}
    >
      {active ? <Check className="h-3 w-3" /> : null}
      {children}
    </button>
  );
}

/* --------------------------------------------------- yes: what they have */

function HaveForms({
  dealId,
  answers,
  editable,
}: {
  dealId: string;
  answers: IntakeAnswers;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const upload = useServerFn(uploadIntakeForm);
  const link = useServerFn(getIntakeFormLink);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      return upload({
        data: { dealId, fileName: file.name, contentType: file.type as never, dataBase64 },
      });
    },
    onMutate: () => setError(null),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["deal", dealId] }),
    onError: (e) => setError((e as Error).message),
  });

  const open = async (path: string) => {
    try {
      const { url } = await link({ data: { dealId, path } });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
      <p className="text-[12px] text-muted-foreground">
        Upload what they have — a PDF of the form, or a photo of the paper one. The build starts
        from these, and the mapping conversation is about these.
      </p>
      {answers.uploaded_forms.length ? (
        <ul className="divide-y divide-border rounded-md border border-border bg-background">
          {answers.uploaded_forms.map((f) => (
            <li key={f.path} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <span className="truncate text-[12px]">{f.name}</span>
              <button
                type="button"
                onClick={() => void open(f.path)}
                className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" /> Open
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {editable ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) mutation.mutate(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[12px] hover:bg-muted disabled:opacity-60"
          >
            <Upload className="h-3.5 w-3.5" /> {mutation.isPending ? "Uploading…" : "Upload a form"}
          </button>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------ no: starting from the library */

function NoForms({
  answers,
  editable,
  busy,
  onSet,
}: {
  answers: IntakeAnswers;
  editable: boolean;
  busy: boolean;
  onSet: (patch: Record<string, unknown>) => void;
}) {
  const [process, setProcess] = useState(answers.current_process ?? "");
  const [users, setUsers] = useState(answers.field_users?.toString() ?? "");
  const processRef = useRef<HTMLTextAreaElement>(null);
  const usersRef = useRef<HTMLInputElement>(null);
  // The record changed under this panel — the brief filled the process in,
  // another tab saved — and the field must show it. Only while not being
  // typed in: a refetch must never take the cursor's text away.
  useEffect(() => {
    if (document.activeElement !== processRef.current) setProcess(answers.current_process ?? "");
  }, [answers.current_process]);
  useEffect(() => {
    if (document.activeElement !== usersRef.current)
      setUsers(answers.field_users?.toString() ?? "");
  }, [answers.field_users]);

  const suggestions = useQuery({
    queryKey: ["form-templates", "suggest", answers.industry],
    queryFn: () => suggestFormTemplatesFn({ data: { industry: answers.industry } }),
    staleTime: 60_000,
  });

  const input =
    "rounded-sm border border-border bg-background px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60";
  // A picked card is a wanted form. The set here is what the grid outlines.
  const chosen = new Set(chosenFrom(answers.wanted_forms, answers.chosen_templates));
  const toggle = (t: { id: string; name: string }) => onSet(toggleWantedTemplate(answers, t));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/20 p-2.5 sm:grid-cols-3">
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Industry
          <select
            className={cn(input, "w-full")}
            value={answers.industry ?? ""}
            disabled={!editable || busy}
            onChange={(e) => onSet({ industry: e.target.value || null })}
          >
            <option value="">—</option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Company size
          <select
            className={cn(input, "w-full")}
            value={answers.company_size ?? ""}
            disabled={!editable || busy}
            onChange={(e) => onSet({ company_size: e.target.value || null })}
          >
            <option value="">—</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          People in the field
          <input
            ref={usersRef}
            type="number"
            min={0}
            className={cn(input, "w-full")}
            value={users}
            disabled={!editable}
            onChange={(e) => setUsers(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            onBlur={() => {
              const n = users.trim() === "" ? null : Number(users);
              if (n === (answers.field_users ?? null)) return;
              if (n === null || (Number.isInteger(n) && n >= 0)) onSet({ field_users: n });
            }}
            placeholder="24"
          />
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground sm:col-span-3">
          The process today — paper, spreadsheet, whiteboard? In their words.
          <textarea
            ref={processRef}
            rows={2}
            className={cn(input, "w-full")}
            value={process}
            disabled={!editable}
            onChange={(e) => setProcess(e.target.value)}
            onBlur={() => {
              if ((process.trim() || null) !== (answers.current_process ?? null)) {
                onSet({
                  current_process: process.trim() || null,
                  current_process_source: process.trim() ? "person" : null,
                });
              }
            }}
            placeholder="Three crews fill in a paper ticket; the office retypes them on Fridays."
          />
          {answers.current_process && answers.current_process_source === "ai" ? (
            <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
                Written by the brief from the call notes — not yet their words
              </span>
              <button
                type="button"
                className="rounded-sm border border-border px-1.5 py-0.5 hover:bg-muted disabled:opacity-60"
                disabled={!editable || busy}
                onClick={() => onSet({ current_process_source: "person" })}
                title="The deck will put this line in quotation marks as the customer's own words. Only confirm if it is; otherwise retype it above as they said it."
              >
                Confirm: this is how they said it
              </button>
            </span>
          ) : null}
        </label>
      </div>

      <div>
        <p className="mb-1.5 text-[12px] text-muted-foreground">
          {answers.industry
            ? `Starting points for ${answers.industry}. Pick every one they want — each lands on the list below, and the first on the list is the first form.`
            : "Pick an industry to see starting points from the form library."}
        </p>
        {suggestions.isLoading ? (
          <p className="text-[12px] text-muted-foreground">Loading the library…</p>
        ) : null}
        {suggestions.data ? (
          <>
            {suggestions.data.forIndustry.length ? (
              <CardGrid
                cards={suggestions.data.forIndustry}
                chosen={chosen}
                onToggle={editable ? toggle : undefined}
              />
            ) : answers.industry ? (
              <p className="text-[12px] text-muted-foreground">
                Nothing filed under {answers.industry} yet — the closest from other industries are
                below.
              </p>
            ) : null}
            {suggestions.data.others.length && answers.industry ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-[12px] text-muted-foreground">
                  Other industries ({suggestions.data.others.length})
                </summary>
                <div className="mt-2">
                  <CardGrid
                    cards={suggestions.data.others}
                    chosen={chosen}
                    onToggle={editable ? toggle : undefined}
                  />
                </div>
              </details>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function CardGrid({
  cards,
  chosen,
  onToggle,
}: {
  cards: Array<Parameters<typeof TemplateCard>[0]["template"]>;
  chosen: Set<string>;
  onToggle?: ((t: { id: string; name: string }) => void) | undefined;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {cards.map((t) => (
        <TemplateCard
          key={t.id}
          template={t}
          selected={chosen.has(t.id)}
          onSelect={onToggle ? () => onToggle({ id: t.id, name: t.name }) : undefined}
        />
      ))}
    </div>
  );
}

/**
 * The forms they want built, in order. The first is the seven-day form;
 * the rest are what comes next — and any of them can be put on the plan as
 * a form build, so three paid builds show up as three named forms, not
 * "3 forms".
 */
function WantedForms({
  answers,
  editable,
  busy,
  onSet,
}: {
  answers: IntakeAnswers;
  editable: boolean;
  busy: boolean;
  onSet: (patch: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  // Only real forms: a service an older brief wrote onto this list is shown
  // where it belongs, on the plan, and the next save here drops it.
  const forms = formsOnly(answers);
  const services = (answers.timeline.services ?? []) as ServiceSpec[];
  const disabled = !editable || busy;
  const input =
    "rounded-sm border border-border bg-background px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60";
  const write = (next: IntakeAnswers["wanted_forms"]) =>
    onSet({ wanted_forms: next, chosen_templates: templateIds(next) });
  const add = () => {
    const patch = addWantedForm(answers, name);
    if (patch.wanted_forms !== answers.wanted_forms) onSet(patch);
    setName("");
  };
  const inPlan = (formName: string) =>
    services.find(
      (x) =>
        x.kind === "paid_form" && x.name.trim().toLowerCase() === formName.trim().toLowerCase(),
    );
  const addToPlan = (formName: string) => {
    const id = `paid-${Math.random().toString(36).slice(2, 8)}`;
    onSet({
      timeline: {
        ...answers.timeline,
        services: [...services, { id, kind: "paid_form", name: formName, phase: 1 }],
        integration_tier: services.length ? 0 : answers.timeline.integration_tier,
      },
    });
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Forms to build · {forms.length || "none yet"}
      </p>
      {forms.length ? (
        <ol className="divide-y divide-border rounded-md border border-border bg-background">
          {forms.map((f, i) => {
            const planned = inPlan(f.name);
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5">
                <span
                  className={cn(
                    "w-[92px] shrink-0 rounded-sm px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wider",
                    i === 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {i === 0 ? "First form" : `Then · ${i + 1}`}
                </span>
                <input
                  className={cn(input, "min-w-0 flex-1")}
                  value={f.name}
                  disabled={disabled}
                  onChange={(e) =>
                    write(forms.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)))
                  }
                />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {f.template_id ? "library" : "named on the call"}
                </span>
                {i > 0 ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] hover:bg-muted disabled:opacity-50"
                    disabled={disabled}
                    title="Make this the first form"
                    onClick={() => write(makeFirstWantedForm(forms, f.id))}
                  >
                    <ArrowUp className="h-3 w-3" /> First
                  </button>
                ) : null}
                {i > 0 ? (
                  planned ? (
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                      On the plan · phase {planned.phase}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] hover:bg-muted disabled:opacity-50"
                      disabled={disabled}
                      title={`Add "${f.name}" to the plan as a ${SERVICE_KINDS.paid_form.label.toLowerCase()}, phase 1`}
                      onClick={() => addToPlan(f.name)}
                    >
                      <ListPlus className="h-3 w-3" /> Add to plan
                    </button>
                  )
                ) : null}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  aria-label={`Remove ${f.name}`}
                  disabled={disabled}
                  onClick={() => write(forms.filter((x) => x.id !== f.id))}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          Pick cards from the library or type the forms they named — three or four is normal. The
          first on the list is the one we build in seven days; the rest can go on the plan.
        </p>
      )}
      {editable ? (
        <div className="flex items-center gap-1.5">
          <input
            className={cn(input, "min-w-0 flex-1")}
            placeholder="A form they named — Chemical Delivery Ticket"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button
            type="button"
            className="rounded-sm border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
            disabled={busy || !name.trim()}
            onClick={add}
          >
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}
