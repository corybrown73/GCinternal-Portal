import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, ShieldCheck } from "lucide-react";

import {
  addSuccessCriterionConfirmation,
  addSuccessCriterionObservation,
  setSuccessCriterionConfirmation,
} from "@/lib/hub.functions";
import { CONFIRMATION_STATUSES, OBSERVATION_ASSESSMENTS } from "@/lib/success-observation-input";
import { humanize } from "@/lib/hub-format";

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

export type TeamOption = { id: string; name: string; role: string };
export type ContactOption = { id: string; name: string; role: string; email: string | null };
export type EvidenceOption = { id: string; title: string; type: string };

const utcToday = () => new Date().toISOString().slice(0, 10);

const nullable = (v: string) => (v.trim() === "" ? null : v.trim());

type ObservationDraft = {
  observedValue: string;
  observedAt: string;
  observedBy: string;
  source: string;
  assessment: string;
  notes: string;
  evidenceId: string;
};

const emptyObservation = (): ObservationDraft => ({
  observedValue: "",
  observedAt: utcToday(),
  observedBy: "",
  source: "",
  assessment: "",
  notes: "",
  evidenceId: "",
});

function useInvalidate(customerId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
}

export function AddObservation({
  customerId,
  criterionId,
  team,
  evidence,
}: {
  customerId: string;
  criterionId: string;
  team: TeamOption[];
  evidence: EvidenceOption[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ObservationDraft>(emptyObservation);
  const invalidate = useInvalidate(customerId);
  const save = useServerFn(addSuccessCriterionObservation);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          successCriteriaId: criterionId,
          observedValue: draft.observedValue.trim(),
          observedAt: draft.observedAt,
          // Left blank unless explicitly chosen — no fabricated attribution.
          observedBy: nullable(draft.observedBy),
          source: nullable(draft.source),
          assessment: draft.assessment as (typeof OBSERVATION_ASSESSMENTS)[number],
          notes: nullable(draft.notes),
          evidenceId: nullable(draft.evidenceId),
        },
      }),
    onSuccess: async () => {
      await invalidate();
      setDraft(emptyObservation());
      setOpen(false);
    },
  });

  const set = (patch: Partial<ObservationDraft>) => setDraft({ ...draft, ...patch });
  const valid =
    draft.observedValue.trim() !== "" && draft.observedAt !== "" && draft.assessment !== "";

  if (!open) {
    return (
      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          mutation.reset();
          setDraft(emptyObservation());
          setOpen(true);
        }}
      >
        <Plus className="h-3 w-3" /> Record result
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-sm border border-border bg-surface p-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <label className="block space-y-0.5">
          <span className={labelClass}>Observed value</span>
          <input
            className={inputClass}
            aria-label="Observed value"
            value={draft.observedValue}
            disabled={mutation.isPending}
            onChange={(e) => set({ observedValue: e.target.value })}
          />
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Observed date</span>
          <input
            type="date"
            className={inputClass}
            aria-label="Observed date"
            value={draft.observedAt}
            disabled={mutation.isPending}
            onChange={(e) => set({ observedAt: e.target.value })}
          />
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Assessment</span>
          <select
            className={inputClass}
            aria-label="Assessment"
            value={draft.assessment}
            disabled={mutation.isPending}
            onChange={(e) => set({ assessment: e.target.value })}
          >
            <option value="">Select</option>
            {OBSERVATION_ASSESSMENTS.map((a) => (
              <option key={a} value={a}>
                {humanize(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Observed by</span>
          <select
            className={inputClass}
            aria-label="Observed by"
            value={draft.observedBy}
            disabled={mutation.isPending}
            onChange={(e) => set({ observedBy: e.target.value })}
          >
            <option value="">Not recorded</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Source</span>
          <input
            className={inputClass}
            aria-label="Source"
            value={draft.source}
            placeholder="Not set"
            disabled={mutation.isPending}
            onChange={(e) => set({ source: e.target.value })}
          />
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Evidence</span>
          <select
            className={inputClass}
            aria-label="Evidence"
            value={draft.evidenceId}
            disabled={mutation.isPending}
            onChange={(e) => set({ evidenceId: e.target.value })}
          >
            <option value="">{evidence.length ? "None" : "No evidence recorded"}</option>
            {evidence.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-0.5">
        <span className={labelClass}>Notes</span>
        <input
          className={inputClass}
          aria-label="Notes"
          value={draft.notes}
          placeholder="Optional"
          disabled={mutation.isPending}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={mutation.isPending || !valid}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save result"}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={mutation.isPending}
          onClick={() => {
            mutation.reset();
            setDraft(emptyObservation());
            setOpen(false);
          }}
        >
          Cancel
        </button>
        {mutation.isError ? (
          <span className="text-[11px] text-destructive">Save failed — values kept</span>
        ) : null}
      </div>
    </div>
  );
}

type ConfirmationDraft = { contactId: string; evidenceId: string; status: string };

export function CustomerConfirmationEditor({
  customerId,
  implementationId,
  criterionId,
  existing,
  contacts,
  evidence,
}: {
  customerId: string;
  implementationId: string;
  criterionId: string;
  existing: {
    id: string;
    status: string;
    evidence_id: string | null;
    customer_contact_id: string | null;
  } | null;
  contacts: ContactOption[];
  evidence: EvidenceOption[];
}) {
  const initial = (): ConfirmationDraft => ({
    contactId: existing?.customer_contact_id ?? "",
    evidenceId: existing?.evidence_id ?? "",
    status: existing?.status ?? "pending",
  });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ConfirmationDraft>(initial);
  const invalidate = useInvalidate(customerId);
  const create = useServerFn(addSuccessCriterionConfirmation);
  const update = useServerFn(setSuccessCriterionConfirmation);

  const mutation = useMutation({
    mutationFn: () =>
      existing
        ? update({
            data: {
              id: existing.id,
              status: draft.status as (typeof CONFIRMATION_STATUSES)[number],
              evidenceId: nullable(draft.evidenceId),
            },
          })
        : create({
            data: {
              implementationId,
              successCriteriaId: criterionId,
              customerContactId: draft.contactId,
              evidenceId: nullable(draft.evidenceId),
              status: draft.status as (typeof CONFIRMATION_STATUSES)[number],
            },
          }),
    onSuccess: async () => {
      await invalidate();
      setOpen(false);
    },
  });

  const set = (patch: Partial<ConfirmationDraft>) => setDraft({ ...draft, ...patch });
  const valid = existing ? true : draft.contactId !== "";

  if (!open) {
    return (
      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          mutation.reset();
          setDraft(initial());
          setOpen(true);
        }}
      >
        <ShieldCheck className="h-3 w-3" />{" "}
        {existing ? "Update confirmation" : "Record customer confirmation"}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-sm border border-border bg-surface p-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <label className="block space-y-0.5">
          <span className={labelClass}>Customer contact</span>
          <select
            className={inputClass}
            aria-label="Customer contact"
            value={draft.contactId}
            disabled={mutation.isPending || !!existing}
            onChange={(e) => set({ contactId: e.target.value })}
          >
            <option value="">
              {contacts.length ? "Select contact" : "No customer contacts recorded"}
            </option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {humanize(c.role)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Status</span>
          <select
            className={inputClass}
            aria-label="Confirmation status"
            value={draft.status}
            disabled={mutation.isPending}
            onChange={(e) => set({ status: e.target.value })}
          >
            {CONFIRMATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Evidence</span>
          <select
            className={inputClass}
            aria-label="Confirmation evidence"
            value={draft.evidenceId}
            disabled={mutation.isPending}
            onChange={(e) => set({ evidenceId: e.target.value })}
          >
            <option value="">{evidence.length ? "None" : "No evidence recorded"}</option>
            {evidence.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={mutation.isPending || !valid}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={mutation.isPending}
          onClick={() => {
            mutation.reset();
            setDraft(initial());
            setOpen(false);
          }}
        >
          Cancel
        </button>
        {mutation.isError ? (
          <span className="text-[11px] text-destructive">Save failed — values kept</span>
        ) : null}
      </div>
    </div>
  );
}
