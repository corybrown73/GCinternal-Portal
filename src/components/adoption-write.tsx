import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus } from "lucide-react";

import { addAdoptionArea, addAdoptionObservation, setAdoptionArea } from "@/lib/hub.functions";
import {
  ADOPTION_KINDS,
  ADOPTION_KIND_LABEL,
  ADOPTION_STATES,
  type AdoptionKind,
  type AdoptionStateValue,
} from "@/lib/adoption-input";
import { humanize } from "@/lib/hub-format";
import type { AdoptionArea } from "@/lib/hub-types";

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const primaryClass =
  "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

export type TeamOption = { id: string; name: string; role: string };
export type ContactOption = { id: string; name: string; role: string };
export type EvidenceOption = { id: string; title: string; type: string };

const nullable = (v: string) => (v.trim() === "" ? null : v.trim());
const utcToday = () => new Date().toISOString().slice(0, 10);

function useInvalidate(customerId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
}

/* ---------------- Adoption area: create + edit (deferred save) ---------------- */

type AreaDraft = {
  kind: string;
  name: string;
  intendedUsage: string;
  ownerId: string;
  notes: string;
  intendedUsers: string;
  expectedFrequency: string;
  inUseDefinition: string;
  customerOwnerContactId: string;
};

const emptyArea = (): AreaDraft => ({
  kind: "user_group",
  name: "",
  intendedUsage: "",
  ownerId: "",
  notes: "",
  intendedUsers: "",
  expectedFrequency: "",
  inUseDefinition: "",
  customerOwnerContactId: "",
});

const areaDraftOf = (area: AdoptionArea): AreaDraft => ({
  kind: area.kind,
  name: area.name,
  intendedUsage: area.intended_usage ?? "",
  ownerId: area.owner_id ?? "",
  notes: area.notes ?? "",
  intendedUsers: area.intended_users ?? "",
  expectedFrequency: area.expected_frequency ?? "",
  inUseDefinition: area.in_use_definition ?? "",
  customerOwnerContactId: area.customer_owner_contact_id ?? "",
});

function AreaForm({
  draft,
  set,
  team,
  contacts,
  sowUsage,
  disabled,
}: {
  draft: AreaDraft;
  set: (patch: Partial<AreaDraft>) => void;
  team: TeamOption[];
  contacts: ContactOption[];
  /** SOW-derived language, shown read-only. Never edited here. */
  sowUsage?: string | null;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="block space-y-0.5">
          <span className={labelClass}>Kind</span>
          <select
            className={inputClass}
            aria-label="Adoption area kind"
            value={draft.kind}
            disabled={disabled}
            onChange={(e) => set({ kind: e.target.value })}
          >
            {ADOPTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {ADOPTION_KIND_LABEL[k as AdoptionKind]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Name</span>
          <input
            className={inputClass}
            aria-label="Adoption area name"
            value={draft.name}
            disabled={disabled}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label className="block space-y-0.5 md:col-span-2">
          <span className={labelClass}>Intended use (from SOW)</span>
          {sowUsage ? (
            <p
              aria-label="Intended use from SOW (read only)"
              className="rounded-sm border border-border bg-muted px-1.5 py-1 text-[12px] text-muted-foreground"
            >
              {sowUsage}
            </p>
          ) : (
            <input
              className={inputClass}
              aria-label="Intended use"
              value={draft.intendedUsage}
              disabled={disabled}
              onChange={(e) => set({ intendedUsage: e.target.value })}
            />
          )}
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Owner</span>
          <select
            className={inputClass}
            aria-label="Adoption area owner"
            value={draft.ownerId}
            disabled={disabled}
            onChange={(e) => set({ ownerId: e.target.value })}
          >
            <option value="">Unassigned</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {humanize(m.role)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5 md:col-span-3">
          <span className={labelClass}>Notes</span>
          <input
            className={inputClass}
            aria-label="Adoption area notes"
            value={draft.notes}
            disabled={disabled}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </label>
      </div>

      {/* Kickoff intake: intended usage confirmed with the customer. Establishes
        intent only — usage evidence stays in observations. */}
      <div className="rounded-sm border border-border/70 bg-muted/30 p-2">
        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Confirmed at kickoff
        </p>
        <p className="mt-0.5 mb-1.5 text-[11px] text-muted-foreground">
          Leave blank where the customer has not provided it. This records intended usage, not
          observed usage.
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-2">
          <label className="block space-y-0.5">
            <span className={labelClass}>Intended users (who)</span>
            <input
              className={inputClass}
              aria-label="Intended users"
              value={draft.intendedUsers}
              disabled={disabled}
              placeholder="Not provided"
              onChange={(e) => set({ intendedUsers: e.target.value })}
            />
          </label>
          <label className="block space-y-0.5">
            <span className={labelClass}>Intended use (what they do)</span>
            <input
              className={inputClass}
              aria-label="Intended use"
              value={draft.intendedUsage}
              disabled={disabled || Boolean(sowUsage)}
              placeholder={sowUsage ? "Held as SOW source text above" : "Not provided"}
              onChange={(e) => set({ intendedUsage: e.target.value })}
            />
          </label>
          <label className="block space-y-0.5">
            <span className={labelClass}>Expected frequency / volume</span>
            <input
              className={inputClass}
              aria-label="Expected frequency"
              value={draft.expectedFrequency}
              disabled={disabled}
              placeholder="Not provided"
              onChange={(e) => set({ expectedFrequency: e.target.value })}
            />
          </label>
          <label className="block space-y-0.5">
            <span className={labelClass}>Definition of &quot;in use&quot;</span>
            <input
              className={inputClass}
              aria-label="Definition of in use"
              value={draft.inUseDefinition}
              disabled={disabled}
              placeholder="Not provided"
              onChange={(e) => set({ inUseDefinition: e.target.value })}
            />
          </label>
          <label className="block space-y-0.5">
            <span className={labelClass}>Customer-side owner</span>
            <select
              className={inputClass}
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

export function AddAdoptionArea({
  customerId,
  implementationId,
  team,
  contacts,
}: {
  customerId: string;
  implementationId: string;
  team: TeamOption[];
  contacts: ContactOption[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AreaDraft>(emptyArea);
  const invalidate = useInvalidate(customerId);
  const save = useServerFn(addAdoptionArea);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          implementationId,
          kind: draft.kind as AdoptionKind,
          name: draft.name.trim(),
          intendedUsage: nullable(draft.intendedUsage),
          ownerId: nullable(draft.ownerId),
          notes: nullable(draft.notes),
          intendedUsers: nullable(draft.intendedUsers),
          expectedFrequency: nullable(draft.expectedFrequency),
          inUseDefinition: nullable(draft.inUseDefinition),
          customerOwnerContactId: nullable(draft.customerOwnerContactId),
        },
      }),
    onSuccess: async () => {
      await invalidate();
      setDraft(emptyArea());
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
          setDraft(emptyArea());
          setOpen(true);
        }}
      >
        <Plus className="h-3 w-3" /> Add usage area
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-sm border border-border bg-surface p-2">
      <AreaForm
        draft={draft}
        set={(patch) => setDraft({ ...draft, ...patch })}
        team={team}
        contacts={contacts}
        disabled={mutation.isPending}
      />
      {mutation.isError ? (
        <p className="text-[11px] text-destructive">{(mutation.error as Error).message}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={primaryClass}
          disabled={draft.name.trim() === "" || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={mutation.isPending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function EditAdoptionArea({
  customerId,
  area,
  team,
  contacts,
}: {
  customerId: string;
  area: AdoptionArea;
  team: TeamOption[];
  contacts: ContactOption[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AreaDraft>(() => areaDraftOf(area));
  const invalidate = useInvalidate(customerId);
  const save = useServerFn(setAdoptionArea);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: area.id,
          kind: draft.kind as AdoptionKind,
          name: draft.name.trim(),
          intendedUsage: nullable(draft.intendedUsage),
          ownerId: nullable(draft.ownerId),
          notes: nullable(draft.notes),
          intendedUsers: nullable(draft.intendedUsers),
          expectedFrequency: nullable(draft.expectedFrequency),
          inUseDefinition: nullable(draft.inUseDefinition),
          customerOwnerContactId: nullable(draft.customerOwnerContactId),
        },
      }),
    onSuccess: async () => {
      await invalidate();
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
          setDraft(areaDraftOf(area));
          setOpen(true);
        }}
      >
        <Pencil className="h-3 w-3" /> Edit
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-sm border border-border bg-surface p-2">
      <AreaForm
        draft={draft}
        set={(patch) => setDraft({ ...draft, ...patch })}
        team={team}
        contacts={contacts}
        sowUsage={area.intended_usage}
        disabled={mutation.isPending}
      />
      {mutation.isError ? (
        <p className="text-[11px] text-destructive">{(mutation.error as Error).message}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={primaryClass}
          disabled={draft.name.trim() === "" || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={mutation.isPending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------------- Adoption observation: append-only ---------------- */

type ObservationDraft = {
  observedAt: string;
  observedBy: string;
  state: string;
  workaroundInUse: boolean;
  workaroundDescription: string;
  source: string;
  notes: string;
  evidenceId: string;
};

const emptyObservation = (): ObservationDraft => ({
  observedAt: utcToday(),
  observedBy: "",
  state: "",
  workaroundInUse: false,
  workaroundDescription: "",
  source: "",
  notes: "",
  evidenceId: "",
});

export function AddAdoptionObservation({
  customerId,
  areaId,
  team,
  evidence,
}: {
  customerId: string;
  areaId: string;
  team: TeamOption[];
  evidence: EvidenceOption[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ObservationDraft>(emptyObservation);
  const invalidate = useInvalidate(customerId);
  const save = useServerFn(addAdoptionObservation);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          adoptionAreaId: areaId,
          observedAt: draft.observedAt,
          // Left blank unless explicitly chosen — no fabricated attribution.
          observedBy: nullable(draft.observedBy),
          state: draft.state as AdoptionStateValue,
          workaroundInUse: draft.workaroundInUse,
          workaroundDescription: draft.workaroundInUse
            ? nullable(draft.workaroundDescription)
            : null,
          source: nullable(draft.source),
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
  const valid = draft.state !== "" && draft.observedAt !== "";

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
        <Plus className="h-3 w-3" /> Record usage
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-sm border border-border bg-surface p-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
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
          <span className={labelClass}>Usage state</span>
          <select
            className={inputClass}
            aria-label="Usage state"
            value={draft.state}
            disabled={mutation.isPending}
            onChange={(e) => set({ state: e.target.value })}
          >
            <option value="">Select…</option>
            {ADOPTION_STATES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
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
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {humanize(m.role)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Source</span>
          <input
            className={inputClass}
            aria-label="Observation source"
            value={draft.source}
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
            <option value="">None</option>
            {evidence.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 pt-4 text-[12px]">
          <input
            type="checkbox"
            aria-label="Workaround still in use"
            checked={draft.workaroundInUse}
            disabled={mutation.isPending}
            onChange={(e) => set({ workaroundInUse: e.target.checked })}
          />
          <span>Workaround still in use</span>
        </label>
      </div>

      {draft.workaroundInUse ? (
        <label className="block space-y-0.5">
          <span className={labelClass}>What workaround</span>
          <input
            className={inputClass}
            aria-label="Workaround description"
            value={draft.workaroundDescription}
            disabled={mutation.isPending}
            onChange={(e) => set({ workaroundDescription: e.target.value })}
          />
        </label>
      ) : null}

      <label className="block space-y-0.5">
        <span className={labelClass}>Notes</span>
        <input
          className={inputClass}
          aria-label="Observation notes"
          value={draft.notes}
          disabled={mutation.isPending}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </label>

      {mutation.isError ? (
        <p className="text-[11px] text-destructive">{(mutation.error as Error).message}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={primaryClass}
          disabled={!valid || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={mutation.isPending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
