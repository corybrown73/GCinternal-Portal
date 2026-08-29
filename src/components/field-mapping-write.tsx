import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus } from "lucide-react";

import { StatusChip } from "@/components/record";
import { addFieldMapping, setFieldMapping } from "@/lib/hub.functions";
import { FIELD_MAPPING_STATUSES } from "@/lib/solution-enums";
import { humanize } from "@/lib/hub-format";

const selectClass =
  "h-6 rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";

const iconButtonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";

type Mapping = {
  id: string;
  source_field: string | null;
  target_field: string | null;
  transformation_notes: string | null;
  source_system: string | null;
  required: boolean | null;
  status: string | null;
};

const dash = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? "—" : v);

const requiredToken = (v: boolean | null | undefined) =>
  v === null || v === undefined ? "" : v ? "yes" : "no";

const nullable = (v: string) => (v.trim() === "" ? null : v.trim());

type Draft = {
  sourceField: string;
  sourceSystem: string;
  targetField: string;
  transformationNotes: string;
  required: string;
  status: string;
};

const draftFrom = (m?: Mapping): Draft => ({
  sourceField: m?.source_field ?? "",
  sourceSystem: m?.source_system ?? "",
  targetField: m?.target_field ?? "",
  transformationNotes: m?.transformation_notes ?? "",
  required: requiredToken(m?.required),
  status: m?.status ?? "",
});

const draftPayload = (d: Draft) => ({
  sourceField: nullable(d.sourceField),
  sourceSystem: nullable(d.sourceSystem),
  targetField: nullable(d.targetField),
  transformationNotes: nullable(d.transformationNotes),
  required: d.required === "" ? null : d.required === "yes",
  status:
    d.status === "" ? null : (d.status as (typeof FIELD_MAPPING_STATUSES)[number]),
});

function RequiredSelect({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <select
      aria-label="Required"
      className={selectClass}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Not set</option>
      <option value="yes">Required</option>
      <option value="no">Not required</option>
    </select>
  );
}

function StatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <select
      aria-label="Mapping status"
      className={selectClass}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Not set</option>
      {FIELD_MAPPING_STATUSES.map((s) => (
        <option key={s} value={s}>
          {humanize(s)}
        </option>
      ))}
    </select>
  );
}

/** One mapping row: read it, or open it and edit every part of it. */
export function FieldMappingRow({ solutionId, mapping }: { solutionId: string; mapping: Mapping }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(mapping));

  const queryClient = useQueryClient();
  const save = useServerFn(setFieldMapping);
  const mutation = useMutation({
    mutationFn: () => save({ data: { id: mapping.id, ...draftPayload(draft) } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["technical-solution", solutionId] });
      setEditing(false);
    },
  });

  const reset = () => {
    setDraft(draftFrom(mapping));
    mutation.reset();
  };

  if (!editing) {
    return (
      <tr className="align-top">
        <td className="px-3 py-1.5 font-mono text-[12px]">{dash(mapping.source_field)}</td>
        <td className="px-3 py-1.5 text-[12px]">{dash(mapping.source_system)}</td>
        <td className="px-3 py-1.5 font-mono text-[12px]">{dash(mapping.target_field)}</td>
        <td className="px-3 py-1.5 text-[12px]">{dash(mapping.transformation_notes)}</td>
        <td className="px-3 py-1.5 text-[12px]">
          {mapping.required === null || mapping.required === undefined
            ? "—"
            : mapping.required
              ? "Yes"
              : "No"}
        </td>
        <td className="px-3 py-1.5 text-[12px]">
          {mapping.status ? <StatusChip status={mapping.status} /> : "—"}
        </td>
        <td className="px-3 py-1.5 text-right">
          <button
            type="button"
            className={iconButtonClass}
            onClick={() => {
              reset();
              setEditing(true);
            }}
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        </td>
      </tr>
    );
  }

  const disabled = mutation.isPending;

  return (
    <tr className="align-top bg-surface">
      <td className="px-3 py-1.5">
        <input
          aria-label="Source field"
          className={`${inputClass} font-mono`}
          placeholder="Field in the source system"
          value={draft.sourceField}
          disabled={disabled}
          onChange={(e) => setDraft({ ...draft, sourceField: e.target.value })}
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          aria-label="Source system"
          className={inputClass}
          placeholder="Where the data comes from"
          value={draft.sourceSystem}
          disabled={disabled}
          onChange={(e) => setDraft({ ...draft, sourceSystem: e.target.value })}
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          aria-label="GoCanvas field"
          className={`${inputClass} font-mono`}
          placeholder="Field it lands in"
          value={draft.targetField}
          disabled={disabled}
          onChange={(e) => setDraft({ ...draft, targetField: e.target.value })}
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          aria-label="Transformation"
          className={inputClass}
          placeholder="How the value is changed"
          value={draft.transformationNotes}
          disabled={disabled}
          onChange={(e) => setDraft({ ...draft, transformationNotes: e.target.value })}
        />
      </td>
      <td className="px-3 py-1.5">
        <RequiredSelect
          value={draft.required}
          disabled={disabled}
          onChange={(v) => setDraft({ ...draft, required: v })}
        />
      </td>
      <td className="px-3 py-1.5">
        <StatusSelect
          value={draft.status}
          disabled={disabled}
          onChange={(v) => setDraft({ ...draft, status: v })}
        />
      </td>
      <td className="px-3 py-1.5 text-right">
        <span className="inline-flex items-center gap-2">
          <button
            type="button"
            className={iconButtonClass}
            disabled={disabled}
            onClick={() => mutation.mutate()}
          >
            Save
          </button>
          <button
            type="button"
            className={iconButtonClass}
            disabled={disabled}
            onClick={() => {
              reset();
              setEditing(false);
            }}
          >
            Cancel
          </button>
          {mutation.isError ? (
            <span className="text-[11px] text-destructive">
              {(mutation.error as Error).message}
            </span>
          ) : null}
        </span>
      </td>
    </tr>
  );
}

/**
 * Add another mapping to this solution. A solution can carry as many mappings as
 * the integration needs, so this stays open for a second entry after each save.
 */
export function AddFieldMapping({ solutionId }: { solutionId: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom());

  const queryClient = useQueryClient();
  const create = useServerFn(addFieldMapping);
  const mutation = useMutation({
    mutationFn: () =>
      create({ data: { technicalSolutionId: solutionId, ...draftPayload(draft) } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["technical-solution", solutionId] });
      setDraft(draftFrom());
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        className={iconButtonClass}
        onClick={() => {
          setDraft(draftFrom());
          mutation.reset();
          setOpen(true);
        }}
      >
        <Plus className="h-3 w-3" /> Add mapping
      </button>
    );
  }

  const disabled = mutation.isPending;
  const ready = draft.sourceField.trim() !== "" || draft.targetField.trim() !== "";

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={iconButtonClass}
        onClick={() => {
          mutation.reset();
          setOpen(false);
        }}
      >
        Close
      </button>
      {mutation.isSuccess ? (
        <span className="text-[11px] text-muted-foreground">Mapping added</span>
      ) : null}
      <AddRowForm
        draft={draft}
        disabled={disabled}
        ready={ready}
        error={mutation.isError ? (mutation.error as Error).message : null}
        onChange={setDraft}
        onSave={() => mutation.mutate()}
      />
    </span>
  );
}

/** The new-mapping fields, laid out to match the table above it. */
function AddRowForm({
  draft,
  disabled,
  ready,
  error,
  onChange,
  onSave,
}: {
  draft: Draft;
  disabled: boolean;
  ready: boolean;
  error: string | null;
  onChange: (d: Draft) => void;
  onSave: () => void;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input
        aria-label="New source field"
        className={`${inputClass} w-28 font-mono`}
        placeholder="Source field"
        value={draft.sourceField}
        disabled={disabled}
        onChange={(e) => onChange({ ...draft, sourceField: e.target.value })}
      />
      <input
        aria-label="New source system"
        className={`${inputClass} w-28`}
        placeholder="Source system"
        value={draft.sourceSystem}
        disabled={disabled}
        onChange={(e) => onChange({ ...draft, sourceSystem: e.target.value })}
      />
      <input
        aria-label="New GoCanvas field"
        className={`${inputClass} w-28 font-mono`}
        placeholder="GoCanvas field"
        value={draft.targetField}
        disabled={disabled}
        onChange={(e) => onChange({ ...draft, targetField: e.target.value })}
      />
      <input
        aria-label="New transformation"
        className={`${inputClass} w-32`}
        placeholder="Transformation"
        value={draft.transformationNotes}
        disabled={disabled}
        onChange={(e) => onChange({ ...draft, transformationNotes: e.target.value })}
      />
      <RequiredSelect
        value={draft.required}
        disabled={disabled}
        onChange={(v) => onChange({ ...draft, required: v })}
      />
      <StatusSelect
        value={draft.status}
        disabled={disabled}
        onChange={(v) => onChange({ ...draft, status: v })}
      />
      <button
        type="button"
        className={iconButtonClass}
        disabled={disabled || !ready}
        onClick={onSave}
      >
        {disabled ? "Saving…" : "Save mapping"}
      </button>
      {error ? <span className="text-[11px] text-destructive">{error}</span> : null}
    </span>
  );
}
