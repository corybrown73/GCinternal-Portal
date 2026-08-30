import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus } from "lucide-react";

import { addSuccessCriterion, setSuccessCriterion } from "@/lib/hub.functions";
import { LIFECYCLE_STAGES } from "@/lib/lifecycle";
import { humanize } from "@/lib/hub-format";

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const selectClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

type TeamMember = { id: string; name: string; role: string };
type ContactOption = { id: string; name: string; role: string };

type Draft = {
  description: string;
  metric: string;
  baselineValue: string;
  targetValue: string;
  measurementSource: string;
  dueStage: string;
  ownerId: string;
  baselinePeriod: string;
  targetDate: string;
  customerOwnerContactId: string;
};

export type EditableCriterion = {
  id: string;
  description: string;
  metric: string | null;
  baseline_value: string | null;
  target_value: string | null;
  measurement_source: string | null;
  due_stage: string | null;
  owner_id: string | null;
  baseline_period: string | null;
  target_date: string | null;
  customer_owner_contact_id: string | null;
};

const emptyDraft: Draft = {
  description: "",
  metric: "",
  baselineValue: "",
  targetValue: "",
  measurementSource: "",
  dueStage: "",
  ownerId: "",
  baselinePeriod: "",
  targetDate: "",
  customerOwnerContactId: "",
};

const draftFrom = (c: EditableCriterion): Draft => ({
  description: c.description ?? "",
  metric: c.metric ?? "",
  baselineValue: c.baseline_value ?? "",
  targetValue: c.target_value ?? "",
  measurementSource: c.measurement_source ?? "",
  dueStage: c.due_stage ?? "",
  ownerId: c.owner_id ?? "",
  baselinePeriod: c.baseline_period ?? "",
  targetDate: c.target_date ?? "",
  customerOwnerContactId: c.customer_owner_contact_id ?? "",
});

const nullable = (v: string) => (v.trim() === "" ? null : v.trim());

const payload = (draft: Draft) => ({
  description: draft.description.trim(),
  metric: nullable(draft.metric),
  baselineValue: nullable(draft.baselineValue),
  targetValue: nullable(draft.targetValue),
  measurementSource: nullable(draft.measurementSource),
  dueStage: nullable(draft.dueStage),
  ownerId: nullable(draft.ownerId),
  baselinePeriod: nullable(draft.baselinePeriod),
  targetDate: nullable(draft.targetDate),
  customerOwnerContactId: nullable(draft.customerOwnerContactId),
});

function CriterionForm({
  draft,
  setDraft,
  team,
  contacts,
  disabled,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  team: TeamMember[];
  contacts: ContactOption[];
  disabled: boolean;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  return (
    <div className="space-y-2">
      <label className="block space-y-0.5">
        <span className={labelClass}>Description</span>
        <input
          className={inputClass}
          aria-label="Description"
          value={draft.description}
          disabled={disabled}
          placeholder="Outcome the customer expects"
          onChange={(e) => set({ description: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <label className="block space-y-0.5">
          <span className={labelClass}>Metric</span>
          <input
            className={inputClass}
            aria-label="Metric"
            value={draft.metric}
            disabled={disabled}
            placeholder="Not set"
            onChange={(e) => set({ metric: e.target.value })}
          />
        </label>
      </div>

      {/* Kickoff intake: customer-confirmed measurement frame. Every field is
          optional — blank means "not confirmed yet", never zero. */}
      <div className="rounded-sm border border-border/70 bg-muted/30 p-2">
        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Confirmed at kickoff
        </p>
        <p className="mt-0.5 mb-1.5 text-[11px] text-muted-foreground">
          Leave blank where the customer has not provided it. Nothing is inferred.
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <label className="block space-y-0.5">
            <span className={labelClass}>Starting point</span>
            <input
              className={inputClass}
              aria-label="Starting point"
              value={draft.baselineValue}
              disabled={disabled}
              placeholder="Not provided"
              onChange={(e) => set({ baselineValue: e.target.value })}
            />
          </label>
          <label className="block space-y-0.5">
            <span className={labelClass}>Starting point period</span>
            <input
              className={inputClass}
              aria-label="Starting point period"
              value={draft.baselinePeriod}
              disabled={disabled}
              placeholder="e.g. Jun–Aug 2026"
              onChange={(e) => set({ baselinePeriod: e.target.value })}
            />
          </label>
          <label className="block space-y-0.5">
            <span className={labelClass}>Target</span>
            <input
              className={inputClass}
              aria-label="Target"
              value={draft.targetValue}
              disabled={disabled}
              placeholder="Not provided"
              onChange={(e) => set({ targetValue: e.target.value })}
            />
          </label>
          <label className="block space-y-0.5">
            <span className={labelClass}>Target date</span>
            <input
              type="date"
              className={inputClass}
              aria-label="Target date"
              value={draft.targetDate}
              disabled={disabled}
              onChange={(e) => set({ targetDate: e.target.value })}
            />
          </label>
          <label className="block space-y-0.5">
            <span className={labelClass}>How we'll measure it</span>
            <input
              className={inputClass}
              aria-label="How we'll measure it"
              value={draft.measurementSource}
              disabled={disabled}
              placeholder="Not provided"
              onChange={(e) => set({ measurementSource: e.target.value })}
            />
          </label>
          <label className="block space-y-0.5">
            <span className={labelClass}>Due stage</span>
            <select
              className={selectClass}
              aria-label="Due stage"
              value={draft.dueStage}
              disabled={disabled}
              onChange={(e) => set({ dueStage: e.target.value })}
            >
              <option value="">Not set</option>
              {LIFECYCLE_STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-0.5">
            <span className={labelClass}>Internal owner</span>
            <select
              className={selectClass}
              aria-label="Internal owner"
              value={draft.ownerId}
              disabled={disabled}
              onChange={(e) => set({ ownerId: e.target.value })}
            >
              <option value="">Unassigned</option>
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-0.5">
            <span className={labelClass}>Customer-side owner</span>
            <select
              className={selectClass}
              aria-label="Customer-side owner"
              value={draft.customerOwnerContactId}
              disabled={disabled}
              onChange={(e) => set({ customerOwnerContactId: e.target.value })}
            >
              <option value="">Not named</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {humanize(c.role)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

function useInvalidate(customerId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
}

export function AddSuccessCriterion({
  customerId,
  implementationId,
  team,
  contacts,
}: {
  customerId: string;
  implementationId: string;
  team: TeamMember[];
  contacts: ContactOption[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const invalidate = useInvalidate(customerId);
  const create = useServerFn(addSuccessCriterion);

  const mutation = useMutation({
    mutationFn: () => create({ data: { implementationId, ...payload(draft) } }),
    onSuccess: async () => {
      await invalidate();
      setDraft(emptyDraft);
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          mutation.reset();
          setDraft(emptyDraft);
          setOpen(true);
        }}
      >
        <Plus className="h-3 w-3" /> Add success measure
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-sm border border-border bg-surface p-2">
      <CriterionForm
        draft={draft}
        setDraft={setDraft}
        team={team}
        contacts={contacts}
        disabled={mutation.isPending}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={mutation.isPending || draft.description.trim() === ""}
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
            setDraft(emptyDraft);
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

export function EditSuccessCriterion({
  customerId,
  criterion,
  team,
  contacts,
}: {
  customerId: string;
  criterion: EditableCriterion;
  team: TeamMember[];
  contacts: ContactOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(criterion));
  const invalidate = useInvalidate(customerId);
  const save = useServerFn(setSuccessCriterion);

  const mutation = useMutation({
    mutationFn: () => save({ data: { id: criterion.id, ...payload(draft) } }),
    onSuccess: async () => {
      await invalidate();
      setEditing(false);
    },
  });

  if (!editing) {
    return (
      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          mutation.reset();
          setDraft(draftFrom(criterion));
          setEditing(true);
        }}
      >
        <Pencil className="h-3 w-3" /> Edit
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-sm border border-border bg-surface p-2">
      <CriterionForm
        draft={draft}
        setDraft={setDraft}
        team={team}
        contacts={contacts}
        disabled={mutation.isPending}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={mutation.isPending || draft.description.trim() === ""}
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
            setDraft(draftFrom(criterion));
            setEditing(false);
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
