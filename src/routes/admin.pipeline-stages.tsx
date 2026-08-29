import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronLeft, ChevronUp, Flag, Plus, Trash2, Trophy } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { NoRows, Panel } from "@/components/record";
import {
  addPipelineStage,
  editPipelineStage,
  getPipelineStageAdminView,
  markPipelineStage,
  removePipelineStage,
  reorderPipelineStagesFn,
} from "@/lib/pipeline-stages.functions";
import {
  PIPELINE_STAGE_KEY_PATTERN,
  STAGE_COLOR_DOT_CLASS,
  STAGE_COLOR_LABELS,
  STAGE_COLORS,
  type StageColor,
} from "@/lib/pipeline-stages";
import { cn } from "@/lib/utils";

/**
 * Pipeline stage configuration. Design: docs/design/presale-stages.md.
 *
 * This page only decides what to render. Every mutation re-checks manage-level
 * role server-side (pipeline-stages.functions.ts), and the invariants it leans
 * on — an occupied stage cannot be deleted, a key cannot be rewritten, exactly
 * one won stage — are triggers in 0028 rather than anything this file enforces.
 */

const stagesQuery = queryOptions({
  queryKey: ["admin", "pipeline-stages"],
  queryFn: () => getPipelineStageAdminView(),
});

export const Route = createFileRoute("/admin/pipeline-stages")({
  head: () => ({
    meta: [
      { title: "Pipeline stages — Admin | GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "The pre-sale pipeline's stages: label, colour, order, and which stage means Closed Won.",
      },
    ],
  }),
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(stagesQuery).catch(() => {});
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load the pipeline stages: {error.message}
    </div>
  ),
  component: PipelineStagesPage,
});

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50";
const primaryButtonClass =
  "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

function ColorPicker({
  value,
  onChange,
  id,
}: {
  value: StageColor;
  onChange: (c: StageColor) => void;
  id?: string;
}) {
  return (
    <select
      id={id}
      className={cn(inputClass, "w-auto")}
      value={value}
      onChange={(e) => onChange(e.target.value as StageColor)}
    >
      {STAGE_COLORS.map((c) => (
        <option key={c} value={c}>
          {STAGE_COLOR_LABELS[c]}
        </option>
      ))}
    </select>
  );
}

function PipelineStagesPage() {
  const { data } = useSuspenseQuery(stagesQuery);
  const queryClient = useQueryClient();

  const add = useServerFn(addPipelineStage);
  const edit = useServerFn(editPipelineStage);
  const mark = useServerFn(markPipelineStage);
  const reorder = useServerFn(reorderPipelineStagesFn);
  const remove = useServerFn(removePipelineStage);

  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState<StageColor>("idle");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "pipeline-stages"] });
  const onError = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const onDone = () => {
    setError(null);
    void invalidate();
  };

  const addMutation = useMutation({
    mutationFn: () =>
      add({ data: { key: newKey.trim().toLowerCase(), label: newLabel.trim(), color: newColor } }),
    onSuccess: () => {
      setNewKey("");
      setNewLabel("");
      setNewColor("idle");
      onDone();
    },
    onError,
  });
  const editMutation = useMutation({
    mutationFn: (vars: { key: string; label: string; color: StageColor }) => edit({ data: vars }),
    onSuccess: onDone,
    onError,
  });
  const markMutation = useMutation({
    mutationFn: (vars: { key: string; mark: "won" | "terminal" }) => mark({ data: vars }),
    onSuccess: onDone,
    onError,
  });
  const reorderMutation = useMutation({
    mutationFn: (keys: string[]) => reorder({ data: { keys } }),
    onSuccess: onDone,
    onError,
  });
  const removeMutation = useMutation({
    mutationFn: (key: string) => remove({ data: { key } }),
    onSuccess: onDone,
    onError,
  });

  const busy =
    addMutation.isPending ||
    editMutation.isPending ||
    markMutation.isPending ||
    reorderMutation.isPending ||
    removeMutation.isPending;

  const move = (index: number, delta: number) => {
    const keys = data.stages.map((s) => s.key);
    const target = index + delta;
    if (target < 0 || target >= keys.length) return;
    const next = [...keys];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    reorderMutation.mutate(next);
  };

  const keyValid = PIPELINE_STAGE_KEY_PATTERN.test(newKey.trim().toLowerCase());

  return (
    <>
      <PageHeader
        title="Pipeline stages"
        description="The pre-sale pipeline the board renders and every stage transition is recorded against. Rename, recolour and reorder freely; a stage's key is its identity in the stage history and never changes."
        actions={
          <Link to="/admin" className={buttonClass}>
            <ChevronLeft className="h-3 w-3" /> Admin
          </Link>
        }
      />
      <PageBody className="max-w-3xl space-y-4">
        {!data.flagOn ? (
          <div className="rounded-md border border-dashed border-border bg-card px-4 py-3">
            <p className="text-[13px] font-medium">Showing the built-in pipeline</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Configurable stages are off on this deployment (<code>presale_stage_config</code>), so
              the pipeline is the five stages compiled into the app and nothing here can be edited.
              Turning the flag on changes nothing by itself: the stored configuration is seeded from
              exactly this list.
            </p>
          </div>
        ) : null}

        {data.flagOn && !data.configured ? (
          <div className="rounded-md border border-status-risk-foreground/40 bg-status-risk px-4 py-3">
            <p className="text-[13px] font-medium text-status-risk-foreground">
              No stored configuration found
            </p>
            <p className="mt-1 text-[12px] text-status-risk-foreground/90">
              The flag is on but <code>portal_pipeline_stages</code> is empty, so the app is using
              its built-in stages. Migration 0028 seeds the table; until it has been applied there
              is nothing to edit.
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        ) : null}

        <Panel title="Stages" count={data.stages.length}>
          {data.stages.length === 0 ? (
            <NoRows label="No stages configured." />
          ) : (
            <ul className="divide-y divide-border/70">
              {data.stages.map((stage, i) => (
                <StageRow
                  key={stage.key}
                  index={i}
                  count={data.stages.length}
                  stage={stage}
                  editable={data.flagOn && data.configured && !busy}
                  onSave={(label, color) => editMutation.mutate({ key: stage.key, label, color })}
                  onMark={(m) => markMutation.mutate({ key: stage.key, mark: m })}
                  onMove={(delta) => move(i, delta)}
                  onDelete={() => removeMutation.mutate(stage.key)}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Add a stage">
          <form
            className="space-y-2.5 px-3 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              addMutation.mutate();
            }}
          >
            <p className="text-[12px] text-muted-foreground">
              A new stage is configured immediately, but a deal cannot be moved into it until its
              key exists as an account stage in the database — see{" "}
              <code>docs/design/presale-stages.md</code>. The board shows it as a column that
              nothing can be dragged into until then.
            </p>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="stage-key">
                  Key
                </label>
                <input
                  id="stage-key"
                  className={inputClass}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="discovery"
                  disabled={!data.configured || busy}
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Permanent. Lowercase letters, digits and underscores.
                </p>
              </div>
              <div>
                <label className={labelClass} htmlFor="stage-label">
                  Label
                </label>
                <input
                  id="stage-label"
                  className={inputClass}
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Discovery"
                  disabled={!data.configured || busy}
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground">Changeable at any time.</p>
              </div>
              <div>
                <label className={labelClass} htmlFor="stage-color">
                  Colour
                </label>
                <div className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn("h-2 w-2 rounded-full", STAGE_COLOR_DOT_CLASS[newColor])}
                  />
                  <ColorPicker id="stage-color" value={newColor} onChange={setNewColor} />
                </div>
              </div>
            </div>
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={!data.configured || busy || !keyValid || newLabel.trim().length === 0}
            >
              <Plus className="h-3 w-3" /> {addMutation.isPending ? "Adding…" : "Add stage"}
            </button>
          </form>
        </Panel>
      </PageBody>
    </>
  );
}

function StageRow({
  stage,
  index,
  count,
  editable,
  onSave,
  onMark,
  onMove,
  onDelete,
}: {
  stage: {
    key: string;
    label: string;
    color: StageColor;
    is_won: boolean;
    is_terminal: boolean;
    enterable: boolean;
    account_count: number;
    in_history: boolean;
  };
  index: number;
  count: number;
  editable: boolean;
  onSave: (label: string, color: StageColor) => void;
  onMark: (mark: "won" | "terminal") => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(stage.label);
  const [color, setColor] = useState<StageColor>(stage.color);

  // Server truth wins whenever the query refreshes.
  useEffect(() => setLabel(stage.label), [stage.label]);
  useEffect(() => setColor(stage.color), [stage.color]);

  const dirty = label.trim() !== stage.label || color !== stage.color;
  const blockingCount = stage.account_count;

  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col">
          <button
            type="button"
            aria-label={`Move ${stage.label} earlier`}
            className={cn(buttonClass, "px-1 py-0")}
            disabled={!editable || index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label={`Move ${stage.label} later`}
            className={cn(buttonClass, "px-1 py-0")}
            disabled={!editable || index === count - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        <span aria-hidden className={cn("h-2 w-2 rounded-full", STAGE_COLOR_DOT_CLASS[color])} />

        <input
          className={cn(inputClass, "w-44")}
          value={label}
          aria-label={`Label for ${stage.key}`}
          onChange={(e) => setLabel(e.target.value)}
          disabled={!editable}
        />
        <ColorPicker value={color} onChange={setColor} />

        <button
          type="button"
          className={primaryButtonClass}
          disabled={!editable || !dirty || label.trim().length === 0}
          onClick={() => onSave(label.trim(), color)}
        >
          Save
        </button>

        <span className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            className={cn(
              buttonClass,
              stage.is_won && "border-status-ontrack-foreground/50 text-status-ontrack-foreground",
            )}
            title="This stage means Closed Won. The handoff control, startOnboarding and the Salesforce bridge all read it."
            disabled={!editable || stage.is_won || !stage.enterable}
            onClick={() => onMark("won")}
          >
            <Trophy className="h-3 w-3" /> {stage.is_won ? "Closed Won" : "Mark won"}
          </button>
          <button
            type="button"
            className={cn(buttonClass, stage.is_terminal && "border-primary/50 text-primary")}
            title="This stage means the end of the pipeline."
            disabled={!editable || stage.is_terminal || !stage.enterable}
            onClick={() => onMark("terminal")}
          >
            <Flag className="h-3 w-3" /> {stage.is_terminal ? "Final" : "Mark final"}
          </button>
          <button
            type="button"
            className={cn(buttonClass, "hover:text-destructive")}
            disabled={!editable || blockingCount > 0 || stage.is_won || stage.is_terminal}
            title={
              blockingCount > 0
                ? `${blockingCount} account${blockingCount === 1 ? "" : "s"} in this stage`
                : "Delete this stage"
            }
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
        <code className="font-mono text-[10px]">{stage.key}</code>
        <span>
          {blockingCount === 0
            ? "No deals"
            : `${blockingCount} deal${blockingCount === 1 ? "" : "s"}`}
        </span>
        {stage.in_history ? <span>named in the stage history</span> : null}
        {!stage.enterable ? (
          <span className="text-status-risk-foreground">
            configured, but not yet an account stage — no deal can be moved here
          </span>
        ) : null}
      </p>
    </li>
  );
}
