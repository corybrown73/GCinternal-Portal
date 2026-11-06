import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { CARD } from "@/components/current-implementation-context";
import {
  addTrainingNeed,
  editTrainingNeed,
  getTrainingPlan,
  recordTrainingDelivery,
  recordTrainingReadiness,
  setTrainingNeedArchived,
} from "@/lib/training.functions";
import {
  DEMONSTRATED_LABEL,
  DEMONSTRATED_STATUSES,
  METHOD_LABEL,
  RESPONSIBILITY_LABEL,
  TRAINING_METHODS,
  TRAINING_RESPONSIBILITIES,
  progressText,
  responsibilityText,
  type DemonstratedStatus,
  type TrainingMethod,
  type TrainingNeed,
  type TrainingResponsibility,
} from "@/lib/training-plan";
import { cn } from "@/lib/utils";

const FIELD =
  "rounded-sm border border-input bg-background px-2 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60";
const BUTTON =
  "rounded-sm border border-border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50";
const PRIMARY =
  "rounded-sm border border-primary/40 bg-primary/5 px-2.5 py-1 text-[12px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50";

type PlanView = Awaited<ReturnType<typeof getTrainingPlan>>;
type Enabled = Extract<PlanView, { enabled: true }>;
type EvidenceChoice = Enabled["evidence"][number];

/** A draft the form edits. Empty strings stand for "not set". */
type Draft = {
  topic: string;
  audience: string;
  outcome: string;
  method: TrainingMethod | "";
  responsibility: TrainingResponsibility | "";
  responsibilitySource: "sow" | "tis_confirmed" | "";
  sowQuote: string;
  nextStep: string;
  purchasedServiceId: string | null;
};

const EMPTY: Draft = {
  topic: "",
  audience: "",
  outcome: "",
  method: "",
  responsibility: "",
  responsibilitySource: "",
  sowQuote: "",
  nextStep: "",
  purchasedServiceId: null,
};

function draftFrom(n: TrainingNeed): Draft {
  return {
    topic: n.topic,
    audience: n.audience ?? "",
    outcome: n.outcome ?? "",
    method: n.method ?? "",
    responsibility: n.responsibility ?? "",
    responsibilitySource: n.responsibilitySource ?? "",
    sowQuote: n.sowQuote ?? "",
    nextStep: n.nextStep ?? "",
    purchasedServiceId: n.purchasedServiceId,
  };
}

/** The fields a form sends. A blank string is sent as null, so clearing a field clears it. */
function payloadFrom(d: Draft) {
  const orNull = (v: string) => (v.trim() === "" ? null : v.trim());
  const sourced = d.responsibility !== "" && d.responsibilitySource !== "";
  return {
    topic: d.topic.trim(),
    audience: orNull(d.audience),
    outcome: orNull(d.outcome),
    method: d.method === "" ? null : d.method,
    responsibility: sourced ? d.responsibility : null,
    responsibilitySource: sourced ? d.responsibilitySource : null,
    sowQuote: d.responsibilitySource === "sow" ? orNull(d.sowQuote) : null,
    nextStep: orNull(d.nextStep),
    purchasedServiceId: d.purchasedServiceId,
  };
}

export function TrainingPlanTab({ implementationId }: { implementationId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getTrainingPlan);
  const q = useQuery({
    queryKey: ["training-plan", implementationId],
    queryFn: () => load({ data: { implementationId } }),
  });
  const [draft, setDraft] = useState<
    { mode: "add"; prefill: Draft } | { mode: "edit"; id: string; base: TrainingNeed } | null
  >(null);

  if (q.isLoading)
    return <p className="text-[13px] text-muted-foreground">Loading the training plan…</p>;
  if (q.isError) {
    return (
      <p className="text-[13px] text-destructive">
        The training plan could not be read. Reload to try again.
      </p>
    );
  }
  const plan = q.data;
  if (!plan || !plan.enabled) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Training & Readiness is not turned on for this Hub yet.
      </p>
    );
  }

  const refresh = () =>
    void qc.invalidateQueries({ queryKey: ["training-plan", implementationId] });

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-[16px] font-semibold">Training &amp; Readiness</h2>
        <p className="text-[12px] text-muted-foreground">
          What the customer needs, who is responsible, what was delivered, and what they have shown.
          Delivered and shown are recorded separately.
        </p>
      </header>

      <Summary plan={plan} />

      {plan.coverage.uncovered.length > 0 ? (
        <section
          className={cn(CARD, "px-4 py-3 space-y-2")}
          aria-label="Purchased training not yet planned"
        >
          <h3 className="text-[13px] font-semibold">Purchased training with no need yet</h3>
          <p className="text-[12px] text-muted-foreground">
            These come from the purchase record. Adding one opens the form pre-filled; nothing is
            created until you save it, and no responsibility is assumed.
          </p>
          <ul className="space-y-1">
            {plan.coverage.uncovered.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span>{s.name}</span>
                {plan.canEdit ? (
                  <button
                    type="button"
                    className={BUTTON}
                    onClick={() =>
                      setDraft({
                        mode: "add",
                        prefill: { ...EMPTY, topic: s.name, purchasedServiceId: s.id },
                      })
                    }
                  >
                    Add as a training need
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2" aria-label="Training needs">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold">Training needs</h3>
          {plan.canEdit && draft === null ? (
            <button
              type="button"
              className={PRIMARY}
              onClick={() => setDraft({ mode: "add", prefill: EMPTY })}
            >
              Add a training need
            </button>
          ) : null}
        </div>

        {draft ? (
          <NeedForm
            key={draft.mode === "edit" ? draft.id : "add"}
            implementationId={implementationId}
            mode={draft.mode}
            prefill={draft.mode === "add" ? draft.prefill : draftFrom(draft.base)}
            base={draft.mode === "edit" ? draft.base : null}
            onDone={() => {
              setDraft(null);
              refresh();
            }}
            onCancel={() => setDraft(null)}
          />
        ) : null}

        {plan.needs.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No training needs are recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {plan.needs.map((n) => (
              <NeedRow
                key={n.id}
                need={n}
                canEdit={plan.canEdit}
                evidence={plan.evidence}
                onChanged={refresh}
                onEdit={() => setDraft({ mode: "edit", id: n.id, base: n })}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Summary({ plan }: { plan: Enabled }) {
  const c = plan.coverage;
  const cell = (label: string, value: number) => (
    <div className="space-y-0.5">
      <div className="text-[18px] font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
  return (
    <section
      className={cn(CARD, "grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-5")}
      aria-label="Training summary"
    >
      {cell("Topics", c.topics)}
      {cell("Delivered", c.delivered)}
      {cell("Shown", c.demonstrated)}
      {cell("Practice still needed", c.practiceNeeded)}
      {cell("Responsibility to confirm", c.needsConfirmation.length)}
    </section>
  );
}

function NeedRow({
  need,
  canEdit,
  evidence,
  onChanged,
  onEdit,
}: {
  need: TrainingNeed;
  canEdit: boolean;
  evidence: EvidenceChoice[];
  onChanged: () => void;
  onEdit: () => void;
}) {
  const text = progressText(need);
  const [panel, setPanel] = useState<null | "delivery" | "readiness" | "archive">(null);
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<DemonstratedStatus>(need.demonstratedStatus);
  const [evidenceId, setEvidenceId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onMutate: () => setError(null),
    onSuccess: () => {
      setPanel(null);
      onChanged();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "That change was not saved."),
  });

  const deliveryFn = useServerFn(recordTrainingDelivery);
  const readinessFn = useServerFn(recordTrainingReadiness);
  const archiveFn = useServerFn(setTrainingNeedArchived);

  return (
    <li className={cn(CARD, "space-y-2 px-4 py-3")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="text-[14px] font-semibold">{need.topic}</div>
          {need.audience ? (
            <div className="text-[12px] text-muted-foreground">For: {need.audience}</div>
          ) : null}
          {need.outcome ? <div className="text-[12px]">Outcome: {need.outcome}</div> : null}
          {need.method ? (
            <div className="text-[12px] text-muted-foreground">{METHOD_LABEL[need.method]}</div>
          ) : null}
        </div>
        {canEdit ? (
          <button type="button" className={BUTTON} onClick={onEdit}>
            Edit
          </button>
        ) : null}
      </div>

      <dl className="grid gap-2 text-[12px] sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Responsibility</dt>
          <dd className={cn(!need.responsibility && "text-amber-700 dark:text-amber-300")}>
            {responsibilityText(need)}
          </dd>
          {need.responsibilitySource === "sow" && need.sowQuote ? (
            <dd className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
              “{need.sowQuote}”
            </dd>
          ) : null}
        </div>
        <div>
          <dt className="text-muted-foreground">Delivered</dt>
          <dd>{text.delivered}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Customer readiness</dt>
          <dd>{text.readiness}</dd>
          {need.demonstratedEvidenceId ? (
            <dd className="text-[11px] text-muted-foreground">Evidence linked</dd>
          ) : null}
        </div>
      </dl>

      {need.nextStep ? (
        <p className="text-[12px]">
          <span className="text-muted-foreground">Next: </span>
          {need.nextStep}
        </p>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON}
            onClick={() => setPanel(panel === "delivery" ? null : "delivery")}
          >
            Record delivery
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() => setPanel(panel === "readiness" ? null : "readiness")}
          >
            Record readiness
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() => setPanel(panel === "archive" ? null : "archive")}
          >
            Archive
          </button>
        </div>
      ) : null}

      {panel === "delivery" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[12px]">
            Date delivered
            <input
              type="date"
              className={cn(FIELD, "ml-2")}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={PRIMARY}
            disabled={!date || run.isPending}
            onClick={() =>
              run.mutate(() =>
                deliveryFn({
                  data: { id: need.id, expectedUpdatedAt: need.updatedAt, deliveredOn: date },
                }),
              )
            }
          >
            Save delivery
          </button>
        </div>
      ) : null}

      {panel === "readiness" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[12px]">
              Customer readiness
              <select
                className={cn(FIELD, "ml-2")}
                value={status}
                onChange={(e) => setStatus(e.target.value as DemonstratedStatus)}
              >
                {DEMONSTRATED_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {DEMONSTRATED_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            {status === "demonstrated" ? (
              <label className="text-[12px]">
                Evidence
                <select
                  className={cn(FIELD, "ml-2")}
                  value={evidenceId}
                  onChange={(e) => setEvidenceId(e.target.value)}
                >
                  <option value="">Choose evidence</option>
                  {evidence.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {need.demonstratedStatus === "demonstrated" && status !== "demonstrated" ? (
              <label className="text-[12px]">
                Why it changes
                <input
                  className={cn(FIELD, "ml-2")}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            ) : null}
            <button
              type="button"
              className={PRIMARY}
              disabled={run.isPending || (status === "demonstrated" && !evidenceId)}
              onClick={() =>
                run.mutate(() =>
                  readinessFn({
                    data: {
                      id: need.id,
                      expectedUpdatedAt: need.updatedAt,
                      status,
                      evidenceId: status === "demonstrated" ? evidenceId : null,
                      previousStatus: need.demonstratedStatus,
                      reason: reason || null,
                    },
                  }),
                )
              }
            >
              Save readiness
            </button>
          </div>
          {status === "demonstrated" && evidence.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Readiness is shown with evidence. Add the evidence to this implementation first.
            </p>
          ) : null}
        </div>
      ) : null}

      {panel === "archive" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[12px]">
            Why it is archived
            <input
              className={cn(FIELD, "ml-2")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={PRIMARY}
            disabled={!reason.trim() || run.isPending}
            onClick={() =>
              run.mutate(() =>
                archiveFn({
                  data: {
                    id: need.id,
                    expectedUpdatedAt: need.updatedAt,
                    archived: true,
                    reason: reason.trim(),
                  },
                }),
              )
            }
          >
            Archive
          </button>
        </div>
      ) : null}

      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </li>
  );
}

function NeedForm({
  implementationId,
  mode,
  prefill,
  base,
  onDone,
  onCancel,
}: {
  implementationId: string;
  mode: "add" | "edit";
  prefill: Draft;
  base: TrainingNeed | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(prefill);
  const [error, setError] = useState<string | null>(null);
  const addFn = useServerFn(addTrainingNeed);
  const editFn = useServerFn(editTrainingNeed);
  const save = useMutation({
    mutationFn: async () => {
      const payload = payloadFrom(d);
      if (mode === "add") {
        return addFn({ data: { implementationId, ...payload } });
      }
      return editFn({
        data: { id: base!.id, expectedUpdatedAt: base!.updatedAt, ...payload },
      });
    },
    onMutate: () => setError(null),
    onSuccess: () => onDone(),
    onError: (e) => setError(e instanceof Error ? e.message : "That change was not saved."),
  });

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  return (
    <form
      className={cn(CARD, "grid gap-3 px-4 py-3 sm:grid-cols-2")}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label className="space-y-1 text-[12px] sm:col-span-2">
        Topic
        <input
          className={cn(FIELD, "w-full")}
          value={d.topic}
          onChange={(e) => set("topic", e.target.value)}
          required
        />
      </label>
      <label className="space-y-1 text-[12px]">
        Audience
        <input
          className={cn(FIELD, "w-full")}
          value={d.audience}
          onChange={(e) => set("audience", e.target.value)}
        />
      </label>
      <label className="space-y-1 text-[12px]">
        Method
        <select
          className={cn(FIELD, "w-full")}
          value={d.method}
          onChange={(e) => set("method", e.target.value as Draft["method"])}
        >
          <option value="">Not chosen</option>
          {TRAINING_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-[12px] sm:col-span-2">
        Outcome: what the customer should be able to do
        <input
          className={cn(FIELD, "w-full")}
          value={d.outcome}
          onChange={(e) => set("outcome", e.target.value)}
        />
      </label>
      <fieldset className="space-y-1 text-[12px]">
        <legend>Responsibility</legend>
        <select
          className={cn(FIELD, "w-full")}
          value={d.responsibility}
          onChange={(e) => set("responsibility", e.target.value as Draft["responsibility"])}
        >
          <option value="">Not confirmed yet</option>
          {TRAINING_RESPONSIBILITIES.map((r) => (
            <option key={r} value={r}>
              {RESPONSIBILITY_LABEL[r]}
            </option>
          ))}
        </select>
      </fieldset>
      <fieldset className="space-y-1 text-[12px]">
        <legend>Where it comes from</legend>
        <select
          className={cn(FIELD, "w-full")}
          value={d.responsibilitySource}
          onChange={(e) =>
            set("responsibilitySource", e.target.value as Draft["responsibilitySource"])
          }
        >
          <option value="">Not set</option>
          <option value="tis_confirmed">Confirmed by TIS</option>
          <option value="sow">From the SOW</option>
        </select>
      </fieldset>
      {d.responsibilitySource === "sow" ? (
        <label className="space-y-1 text-[12px] sm:col-span-2">
          SOW wording (kept exactly as written)
          <textarea
            className={cn(FIELD, "w-full")}
            rows={2}
            value={d.sowQuote}
            onChange={(e) => set("sowQuote", e.target.value)}
          />
        </label>
      ) : null}
      <label className="space-y-1 text-[12px] sm:col-span-2">
        Next step (practice or follow-up)
        <input
          className={cn(FIELD, "w-full")}
          value={d.nextStep}
          onChange={(e) => set("nextStep", e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <button type="submit" className={PRIMARY} disabled={save.isPending || !d.topic.trim()}>
          {save.isPending ? "Saving…" : mode === "add" ? "Add the need" : "Save changes"}
        </button>
        <button type="button" className={BUTTON} onClick={onCancel}>
          Cancel
        </button>
        {error ? <span className="text-[12px] text-destructive">{error}</span> : null}
      </div>
    </form>
  );
}
