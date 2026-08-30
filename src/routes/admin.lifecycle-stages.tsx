import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronLeft, ChevronUp, Lock, Plus, Trash2 } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { NoRows, Panel } from "@/components/record";
import {
  addLifecycleStage,
  getLifecycleStageAdminView,
  removeLifecycleStage,
  reorderLifecycleStagesFn,
  saveLifecycleStage,
} from "@/lib/lifecycle-stages.functions";
import { LIFECYCLE_PHASE_LABELS, STAGE_COLORS, type StageColor } from "@/lib/lifecycle-stages";
import { STAGE_COLOR_CLASS, STAGE_COLOR_LABELS } from "@/lib/pipeline-stages";
import type { LifecyclePhase } from "@/lib/lifecycle";
import { cn } from "@/lib/utils";

/**
 * Editing the post-sale stages.
 *
 * The screen's job is to make the one non-obvious rule obvious before somebody
 * runs into it: a built-in stage can be renamed, recoloured and reordered, and
 * cannot be deleted, because roughly twenty-five places in the application name
 * these ids as literals. The lock icon and the sentence next to it exist so
 * that "why can't I delete this" is answered on the screen rather than by an
 * error message after the fact.
 */

const viewQuery = queryOptions({
  queryKey: ["admin", "lifecycle-stages"],
  queryFn: () => getLifecycleStageAdminView(),
});

export const Route = createFileRoute("/admin/lifecycle-stages")({
  head: () => ({ meta: [{ title: "Post-sale stages — Admin | GoCanvas Handoff Hub" }] }),
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(viewQuery).catch(() => {});
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load the post-sale stages: {error.message}
    </div>
  ),
  component: LifecycleStagesPage,
});

const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40";
const inputClass =
  "h-7 rounded-sm border border-border bg-background px-2 text-[13px] outline-none focus:ring-1 focus:ring-ring";

function LifecycleStagesPage() {
  const { data } = useSuspenseQuery(viewQuery);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    key: "",
    label: "",
    intent: "",
    phase: "delivery" as LifecyclePhase,
    color: "idle" as StageColor,
  });

  const save = useServerFn(saveLifecycleStage);
  const add = useServerFn(addLifecycleStage);
  const reorder = useServerFn(reorderLifecycleStagesFn);
  const remove = useServerFn(removeLifecycleStage);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "lifecycle-stages"] });
  const onError = (e: unknown) => setError(e instanceof Error ? e.message : "That didn't work.");
  const onDone = () => {
    setError(null);
    void refresh();
  };

  const saveStage = useMutation({
    mutationFn: (vars: { key: string; label: string; intent: string; color: StageColor }) =>
      save({
        data: {
          key: vars.key,
          label: vars.label,
          ...(vars.intent.trim() ? { intent: vars.intent.trim() } : {}),
          color: vars.color,
        },
      }),
    onSuccess: onDone,
    onError,
  });

  const addStage = useMutation({
    mutationFn: () =>
      add({
        data: {
          key: draft.key,
          label: draft.label,
          ...(draft.intent.trim() ? { intent: draft.intent.trim() } : {}),
          phase: draft.phase,
          color: draft.color,
        },
      }),
    onSuccess: () => {
      setAdding(false);
      setDraft({ key: "", label: "", intent: "", phase: "delivery", color: "idle" });
      onDone();
    },
    onError,
  });

  const move = useMutation({
    mutationFn: (keys: string[]) => reorder({ data: { keys } }),
    onSuccess: onDone,
    onError,
  });

  const deleteStage = useMutation({
    mutationFn: (key: string) => remove({ data: { key } }),
    onSuccess: onDone,
    onError,
  });

  const keys = useMemo(() => data.stages.map((s) => s.key), [data.stages]);

  const swap = (index: number, delta: number) => {
    const next = [...keys];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    move.mutate(next);
  };

  const busy = saveStage.isPending || addStage.isPending || move.isPending || deleteStage.isPending;

  return (
    <>
      <PageHeader
        title="Post-sale stages"
        description="What each stage after the sale is called, what it says it means, its colour and its order. Renaming a stage changes what people read and nothing else — the history and the rules key off an id that never moves."
        actions={
          <div className="flex items-center gap-2">
            {data.flagOn ? (
              <button type="button" className={buttonClass} onClick={() => setAdding((v) => !v)}>
                <Plus className="h-3 w-3" /> Add stage
              </button>
            ) : null}
            <Link to="/admin" className={buttonClass}>
              <ChevronLeft className="h-3 w-3" /> Admin
            </Link>
          </div>
        }
      />
      <PageBody className="max-w-4xl space-y-3">
        {!data.flagOn ? (
          <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
            Editable post-sale stages are not switched on for this deployment. The stages below are
            the built-in ones and are shown read-only.
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-border bg-status-blocked px-3 py-2 text-[12px] text-status-blocked-foreground"
          >
            {error}
          </p>
        ) : null}

        {adding ? (
          <Panel title="Add a stage">
            <form
              className="space-y-2 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.key.trim() || !draft.label.trim()) return;
                addStage.mutate();
              }}
            >
              <div className="flex flex-wrap gap-2">
                <label>
                  <span className="mb-0.5 block text-[11px] text-muted-foreground">Label</span>
                  <input
                    autoFocus
                    value={draft.label}
                    onChange={(e) => {
                      const label = e.target.value;
                      setDraft((d) => ({
                        ...d,
                        label,
                        // The key is derived while it is still empty, then left
                        // alone — it is permanent, so it must stop tracking the
                        // label the moment somebody touches it.
                        key: d.key === slug(d.label) || d.key === "" ? slug(label) : d.key,
                      }));
                    }}
                    placeholder="Pilot"
                    className={`${inputClass} w-44`}
                  />
                </label>
                <label>
                  <span className="mb-0.5 block text-[11px] text-muted-foreground">
                    Key (permanent)
                  </span>
                  <input
                    value={draft.key}
                    onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
                    placeholder="pilot"
                    className={`${inputClass} w-44 font-mono`}
                  />
                </label>
                <label>
                  <span className="mb-0.5 block text-[11px] text-muted-foreground">Phase</span>
                  <select
                    value={draft.phase}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, phase: e.target.value as LifecyclePhase }))
                    }
                    className={inputClass}
                  >
                    {(Object.keys(LIFECYCLE_PHASE_LABELS) as LifecyclePhase[]).map((p) => (
                      <option key={p} value={p}>
                        {LIFECYCLE_PHASE_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-0.5 block text-[11px] text-muted-foreground">Colour</span>
                  <select
                    value={draft.color}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, color: e.target.value as StageColor }))
                    }
                    className={inputClass}
                  >
                    {STAGE_COLORS.map((c) => (
                      <option key={c} value={c}>
                        {STAGE_COLOR_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <input
                value={draft.intent}
                onChange={(e) => setDraft((d) => ({ ...d, intent: e.target.value }))}
                placeholder="What has to be true to leave this stage"
                className={`${inputClass} w-full`}
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={busy || !draft.key.trim() || !draft.label.trim()}
                  className="rounded-sm border border-border px-2 py-1 text-[12px] disabled:opacity-40"
                >
                  Add stage
                </button>
                <button type="button" className={buttonClass} onClick={() => setAdding(false)}>
                  Cancel
                </button>
                <p className="text-[11px] text-muted-foreground">
                  A stage you add is one projects can move into straight away. It takes part in no
                  built-in rule — launch gates and graduation readiness name specific stages.
                </p>
              </div>
            </form>
          </Panel>
        ) : null}

        <Panel title="Stages" count={data.stages.length}>
          {data.stages.length === 0 ? (
            <NoRows label="No stages configured." />
          ) : (
            <ul className="divide-y divide-border">
              {data.stages.map((stage, i) => (
                <StageRow
                  key={stage.key}
                  index={i}
                  last={i === data.stages.length - 1}
                  stage={stage}
                  editable={data.flagOn}
                  busy={busy}
                  onSave={(label, intent, color) =>
                    saveStage.mutate({ key: stage.key, label, intent, color })
                  }
                  onMove={(delta) => swap(i, delta)}
                  onDelete={() => deleteStage.mutate(stage.key)}
                />
              ))}
            </ul>
          )}
        </Panel>

        <p className="text-[11px] text-muted-foreground">
          The eight stages marked with a lock are named directly by the application — the launch
          gate, graduation readiness, the Customer Success handoff and the Salesforce bridge each
          look for a specific one. They can be renamed, recoloured and reordered; they cannot be
          deleted, and their key never changes, so nothing you do here can quietly switch a rule
          off.
        </p>
      </PageBody>
    </>
  );
}

function StageRow({
  index,
  last,
  stage,
  editable,
  busy,
  onSave,
  onMove,
  onDelete,
}: {
  index: number;
  last: boolean;
  stage: {
    key: string;
    label: string;
    intent: string | null;
    phase: LifecyclePhase;
    color: StageColor;
    is_builtin: boolean;
    project_count: number;
    in_history: boolean;
  };
  editable: boolean;
  busy: boolean;
  onSave: (label: string, intent: string, color: StageColor) => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(stage.label);
  const [intent, setIntent] = useState(stage.intent ?? "");
  const [color, setColor] = useState<StageColor>(stage.color);

  const dirty = label !== stage.label || intent !== (stage.intent ?? "") || color !== stage.color;

  return (
    <li className="space-y-1.5 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-6 shrink-0 font-mono text-[11px] text-muted-foreground">
          {String(index + 1).padStart(2, "0")}
        </span>
        {editable ? (
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={`${inputClass} w-44`}
          />
        ) : (
          <span className="w-44 text-[13px] font-medium">{stage.label}</span>
        )}
        <span
          className={cn(
            "rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
            STAGE_COLOR_CLASS[color],
          )}
        >
          {LIFECYCLE_PHASE_LABELS[stage.phase]}
        </span>
        {editable ? (
          <select
            value={color}
            onChange={(e) => setColor(e.target.value as StageColor)}
            className={inputClass}
          >
            {STAGE_COLORS.map((c) => (
              <option key={c} value={c}>
                {STAGE_COLOR_LABELS[c]}
              </option>
            ))}
          </select>
        ) : null}
        <span className="font-mono text-[10px] text-muted-foreground">{stage.key}</span>
        {stage.is_builtin ? (
          <span
            title="Named directly by the application. Rename it freely; it cannot be deleted."
            className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            <Lock className="h-2.5 w-2.5" /> built in
          </span>
        ) : null}
        {stage.project_count > 0 ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {stage.project_count} project{stage.project_count === 1 ? "" : "s"}
          </span>
        ) : stage.in_history ? (
          <span className="font-mono text-[10px] text-muted-foreground">in history</span>
        ) : null}

        {editable ? (
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              className={buttonClass}
              disabled={busy || index === 0}
              onClick={() => onMove(-1)}
              aria-label={`Move ${stage.label} earlier`}
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy || last}
              onClick={() => onMove(1)}
              aria-label={`Move ${stage.label} later`}
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy || !dirty}
              onClick={() => onSave(label, intent, color)}
            >
              Save
            </button>
            {!stage.is_builtin ? (
              <button
                type="button"
                className={buttonClass}
                disabled={busy || stage.project_count > 0}
                onClick={onDelete}
                title={
                  stage.project_count > 0
                    ? "Projects are still in this stage"
                    : `Delete ${stage.label}`
                }
              >
                <Trash2 className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {editable ? (
        <input
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="What has to be true to leave this stage"
          className={`${inputClass} ml-8 w-[calc(100%-2rem)]`}
        />
      ) : stage.intent ? (
        <p className="ml-8 text-[12px] text-muted-foreground">{stage.intent}</p>
      ) : null}
    </li>
  );
}

/** Label → a legal key. Only used while the key field is untouched. */
function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .replace(/-+$/, "")
    .slice(0, 40);
}
