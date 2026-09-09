import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ExternalLink, Upload } from "lucide-react";

import { Panel } from "@/components/record";
import { TemplateCard } from "@/components/template-card";
import { suggestFormTemplatesFn } from "@/lib/form-templates.functions";
import {
  COMPANY_SIZES,
  INDUSTRIES,
  intakeStatus,
  readIntake,
  type IntakeAnswers,
} from "@/lib/intake-answers";
import { getIntakeFormLink, saveIntake, uploadIntakeForm } from "@/lib/presale.functions";
import { cn } from "@/lib/utils";

/**
 * The onboarding intake, on the deal.
 *
 * One fork, then one of two short paths. "Do they already have forms built?"
 * Yes: upload what they have, and the conversation is about mapping. No: four
 * facts — industry, size, field users, the process today — and the library
 * shows starting points for their industry. Each answer saves as it is given;
 * there is no form to submit, because an intake is a conversation and the
 * person typing is on a call.
 */
export function IntakePanel({
  dealId,
  raw,
  editable,
}: {
  dealId: string;
  raw: unknown;
  editable: boolean;
}) {
  const answers = readIntake(raw);
  const status = intakeStatus(answers);
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => save({ data: { dealId, patch } as never }),
    onMutate: () => setError(null),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["deal", dealId] }),
    onError: (e) => setError((e as Error).message),
  });
  const set = (patch: Record<string, unknown>) => mutation.mutate(patch);

  return (
    <Panel
      title="Onboarding intake"
      meta={status.done ? "Complete" : (status.next ?? undefined)}
      level="primary"
    >
      <div className="space-y-3 px-3 py-2.5">
        {error ? (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        ) : null}

        {/* The fork. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted-foreground">
            Do they already have forms built?
          </span>
          <Choice
            active={answers.forms_built === true}
            disabled={!editable || mutation.isPending}
            onClick={() => set({ forms_built: true })}
          >
            Yes — upload them
          </Choice>
          <Choice
            active={answers.forms_built === false}
            disabled={!editable || mutation.isPending}
            onClick={() => set({ forms_built: false })}
          >
            No — starting fresh
          </Choice>
        </div>

        {answers.forms_built === true ? (
          <HaveForms dealId={dealId} answers={answers} editable={editable} />
        ) : null}

        {answers.forms_built === false ? (
          <NoForms answers={answers} editable={editable} busy={mutation.isPending} onSet={set} />
        ) : null}
      </div>
    </Panel>
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

  const suggestions = useQuery({
    queryKey: ["form-templates", "suggest", answers.industry],
    queryFn: () => suggestFormTemplatesFn({ data: { industry: answers.industry } }),
    staleTime: 60_000,
  });

  const input =
    "rounded-sm border border-border bg-background px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60";
  const chosen = new Set(answers.chosen_templates);
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSet({ chosen_templates: Array.from(next) });
  };

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
            type="number"
            min={0}
            className={cn(input, "w-full")}
            value={users}
            disabled={!editable || busy}
            onChange={(e) => setUsers(e.target.value)}
            onBlur={() => {
              const n = users.trim() === "" ? null : Number(users);
              if (n === null || (Number.isInteger(n) && n >= 0)) onSet({ field_users: n });
            }}
            placeholder="24"
          />
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground sm:col-span-3">
          The process today — paper, spreadsheet, whiteboard? In their words.
          <textarea
            rows={2}
            className={cn(input, "w-full")}
            value={process}
            disabled={!editable || busy}
            onChange={(e) => setProcess(e.target.value)}
            onBlur={() => {
              if ((process.trim() || null) !== (answers.current_process ?? null)) {
                onSet({ current_process: process.trim() || null });
              }
            }}
            placeholder="Three crews fill in a paper ticket; the office retypes them on Fridays."
          />
        </label>
      </div>

      <div>
        <p className="mb-1.5 text-[12px] text-muted-foreground">
          {answers.industry
            ? `Starting points for ${answers.industry}. Pick the ones closest to what they do — the build begins from these.`
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
  onToggle?: ((id: string) => void) | undefined;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {cards.map((t) => (
        <TemplateCard
          key={t.id}
          template={t}
          selected={chosen.has(t.id)}
          onSelect={onToggle ? () => onToggle(t.id) : undefined}
        />
      ))}
    </div>
  );
}
