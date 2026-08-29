import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Filter,
  Lock,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { Field, NoRows, Panel } from "@/components/record";
import {
  createTemplate,
  createTemplateVersion,
  getTemplateFamilies,
  getTemplateVersion,
  publishTemplateVersion,
  removeTemplateQuestion,
  removeTemplateStage,
  removeTemplateTask,
  reorderTemplateQuestions,
  reorderTemplateStages,
  reorderTemplateTasks,
  saveTemplateMetadata,
  saveTemplateQuestion,
  saveTemplateStage,
  saveTemplateTask,
} from "@/lib/templates.functions";
import type {
  ScopingQuestionDetail,
  TemplateBrowserList,
  TemplateStageDetail,
  TemplateTaskDetail,
  TemplateVersionDetail,
} from "@/lib/templates.server";
import { formatIncludeWhen, includeWhenKeys } from "@/lib/journey-conditions";
import {
  formatIncludeWhenJson,
  formatOptionList,
  moveInOrder,
  parseIncludeWhen,
  parseKeyList,
  parseOptionList,
  GATE_MODES,
  JOURNEY_TYPES,
  OFFSET_BASES,
  PARTIES,
  QUESTION_KINDS,
  STAGE_PHASES,
  VISIBILITIES,
  type GateMode,
  type JourneyType,
  type OffsetBasis,
  type Party,
  type QuestionKind,
  type StagePhase,
  type Visibility,
} from "@/lib/template-draft";
import { canManage, useProfile } from "@/lib/auth";
import { fmtDate, formatTaskOffset, humanize } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------------- */
/* Journey template browser and builder.                                      */
/*                                                                            */
/* A family is a key, a version is a row. PUBLISHED CONTENT IS FROZEN by a    */
/* database trigger, because live implementations pin the exact version they  */
/* were created from — so a published version renders read-only here and the  */
/* only way to change it is "New version", which deep-copies it into a draft  */
/* you then edit and publish.                                                 */
/*                                                                            */
/* Write affordances appear only for manage-level profiles, and only with the */
/* journey_templates flag on. Both are conveniences: the server function is   */
/* the real gate (templates.functions.ts) and the trigger is the backstop.    */
/* ------------------------------------------------------------------------- */

const familiesQuery = queryOptions({
  queryKey: ["admin", "templates"],
  queryFn: () => getTemplateFamilies(),
});

const versionQuery = (templateId: string) =>
  queryOptions({
    queryKey: ["admin", "templates", "version", templateId],
    queryFn: () => getTemplateVersion({ data: { templateId } }),
  });

/** The version shown when the URL names none: the first family's live one. */
function defaultVersionId(list: TemplateBrowserList): string | null {
  const first = list.families[0];
  if (!first) return null;
  return first.live?.id ?? first.versions[0]?.id ?? null;
}

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Journey templates — Admin | GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "Browse and edit journey template families: stages, tasks, conditions and scoping questions.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { template?: string } => {
    const raw = search["template"];
    return typeof raw === "string" && raw ? { template: raw } : {};
  },
  loaderDeps: ({ search }) => ({ template: search.template ?? null }),
  loader: async ({ context, deps }) => {
    const list = await context.queryClient.ensureQueryData(familiesQuery);
    if (!list.flagOn) return;
    const selected = deps.template ?? defaultVersionId(list);
    // Warm the detail here so selecting a version never suspends mid-render.
    if (selected) await context.queryClient.ensureQueryData(versionQuery(selected));
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load journey templates: {error.message}
    </div>
  ),
  component: TemplatesPage,
});

const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const primaryClass =
  "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
const monoClass = "font-mono text-[11px] text-muted-foreground";
const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const areaClass =
  "min-h-[60px] w-full resize-y rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const selectClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";

function Chip({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "live" | "warn" | "idle";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        tone === "live" && "bg-status-ontrack text-status-ontrack-foreground",
        tone === "warn" && "bg-status-risk text-status-risk-foreground",
        tone === "idle" && "bg-status-idle text-status-idle-foreground",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function statusTone(status: string, isLive: boolean): "live" | "idle" | "muted" {
  if (isLive) return "live";
  if (status === "archived") return "idle";
  return "muted";
}

function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <p role="alert" className="px-3 py-1.5 text-[11px] font-medium text-destructive">
      {message}
    </p>
  );
}

function LabelledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={labelClass}>{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

function MoveButtons({
  onMove,
  canUp,
  canDown,
  pending,
  what,
}: {
  onMove: (delta: number) => void;
  canUp: boolean;
  canDown: boolean;
  pending: boolean;
  what: string;
}) {
  return (
    <>
      <button
        type="button"
        className={buttonClass}
        title={`Move this ${what} up`}
        aria-label={`Move this ${what} up`}
        disabled={!canUp || pending}
        onClick={() => onMove(-1)}
      >
        <ChevronUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        className={buttonClass}
        title={`Move this ${what} down`}
        aria-label={`Move this ${what} down`}
        disabled={!canDown || pending}
        onClick={() => onMove(1)}
      >
        <ChevronDown className="h-3 w-3" />
      </button>
    </>
  );
}

/** Both queries: the family list carries the counts a content edit changes. */
function useTemplateInvalidate(templateId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "templates"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "templates", "version", templateId] }),
    ]);
}

/* ------------------------------------------------------------------------- */
/* Page                                                                       */
/* ------------------------------------------------------------------------- */

function TemplatesPage() {
  const { data: list } = useSuspenseQuery(familiesQuery);
  const { template } = Route.useSearch();
  const { profile } = useProfile();
  const [creating, setCreating] = useState(false);

  if (!list.flagOn) {
    return (
      <>
        <PageHeader
          title="Journey templates"
          description="The versioned definitions that generate an implementation plan: stages, tasks, conditions and scoping questions."
          actions={
            <Link to="/admin" className={buttonClass}>
              <ChevronLeft className="h-3 w-3" /> Admin
            </Link>
          }
        />
        <PageBody className="max-w-3xl">
          <EmptyState
            title="Journey templates are not enabled yet"
            description="Template content is seeded but stays hidden until the journey_templates flag is switched on for this environment. Nothing is broken — turn the flag on in portal_app_config (key v2_flags) to review the templates here."
            hint="flag: journey_templates — off"
          />
        </PageBody>
      </>
    );
  }

  // The server function re-checks this on every write; hiding the buttons just
  // avoids offering an action that would be refused.
  const canWrite = canManage(profile?.role);
  const selectedId = template ?? defaultVersionId(list);

  return (
    <>
      <PageHeader
        title="Journey templates"
        description="A family is a key, a version is a row. Published content is frozen because live implementations pin the exact version they were created from — to change one, publish a new version."
        actions={
          <Link to="/admin" className={buttonClass}>
            <ChevronLeft className="h-3 w-3" /> Admin
          </Link>
        }
      />
      <PageBody className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:items-start">
          <Panel
            title="Families"
            count={list.families.length}
            action={
              canWrite && !creating ? (
                <button type="button" className={buttonClass} onClick={() => setCreating(true)}>
                  <Plus className="h-3 w-3" /> New template
                </button>
              ) : null
            }
          >
            {creating ? <NewTemplateForm onDone={() => setCreating(false)} /> : null}
            {list.families.length === 0 ? (
              <NoRows label="No journey templates exist yet." />
            ) : (
              <ul className="divide-y divide-border">
                {list.families.map((family) => {
                  const shown = family.live ?? family.versions[0] ?? null;
                  const active = family.versions.some((v) => v.id === selectedId);
                  const draft = family.versions.find((v) => v.status === "draft") ?? null;
                  return (
                    <li key={family.key}>
                      <Link
                        to="/templates"
                        search={shown ? { template: shown.id } : {}}
                        className={cn("block px-3 py-2 hover:bg-muted/60", active && "bg-muted/70")}
                        aria-current={active ? "true" : undefined}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[13px] font-medium">{family.name}</span>
                          <span className={monoClass}>v{shown?.version ?? "—"}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <code className={monoClass}>{family.key}</code>
                          <Chip>{humanize(family.journey_type)}</Chip>
                          {shown ? (
                            <Chip tone={statusTone(shown.status, shown.is_live)}>
                              {shown.is_live ? "live" : shown.status}
                            </Chip>
                          ) : null}
                          {draft && draft.id !== shown?.id ? (
                            <Chip tone="warn">draft v{draft.version}</Chip>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {family.versions.length} version
                          {family.versions.length === 1 ? "" : "s"} · {family.implementation_count}{" "}
                          implementation
                          {family.implementation_count === 1 ? "" : "s"} pinned
                        </p>
                        {shown?.version_note ? (
                          <p className="mt-0.5 line-clamp-2 text-[11px] italic text-muted-foreground">
                            {shown.version_note}
                          </p>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {selectedId ? (
            <VersionDetail templateId={selectedId} canWrite={canWrite} />
          ) : (
            <Panel title="Version">
              <NoRows label="Select a family to inspect its versions." />
            </Panel>
          )}
        </div>
      </PageBody>
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* New family                                                                 */
/* ------------------------------------------------------------------------- */

function NewTemplateForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useServerFn(createTemplate);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [journeyType, setJourneyType] = useState<JourneyType>("new_logo");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          key: key.trim(),
          name: name.trim(),
          journey_type: journeyType,
          description: description.trim() || null,
        },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "templates"] });
      onDone();
      navigate({ to: "/templates", search: { template: result.templateId } });
    },
  });

  return (
    <form
      className="space-y-2 border-b border-border bg-surface px-3 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <p className="text-[11px] text-muted-foreground">
        A new family starts at v1 as a draft. The key is permanent — it is the identity every
        version of this template shares.
      </p>
      <LabelledField label="Key">
        <input
          className={inputClass}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="new_logo_standard"
          required
        />
      </LabelledField>
      <LabelledField label="Name">
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New logo — standard"
          required
        />
      </LabelledField>
      <LabelledField label="Journey type">
        <select
          className={selectClass}
          value={journeyType}
          onChange={(e) => setJourneyType(e.target.value as JourneyType)}
        >
          {JOURNEY_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </select>
      </LabelledField>
      <LabelledField label="Description">
        <textarea
          className={areaClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </LabelledField>
      {mutation.error ? <ErrorLine error={mutation.error} /> : null}
      <div className="flex items-center gap-2">
        <button type="submit" className={primaryClass} disabled={mutation.isPending}>
          {mutation.isPending ? "Creating…" : "Create draft"}
        </button>
        <button type="button" className={buttonClass} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------------- */
/* One version                                                                */
/* ------------------------------------------------------------------------- */

function VersionDetail({ templateId, canWrite }: { templateId: string; canWrite: boolean }) {
  const { data } = useSuspenseQuery(versionQuery(templateId));

  if (!data.flagOn || !data.detail) {
    return (
      <Panel title="Version">
        <NoRows label="That template version no longer exists. Pick a family on the left." />
      </Panel>
    );
  }

  const detail = data.detail;
  const { template, questions } = detail;
  const isDraft = template.status === "draft";
  const questionPrompt = new Map(questions.map((q) => [q.key, q.prompt]));

  return (
    <div className="min-w-0 space-y-3">
      <VersionHeader detail={detail} canWrite={canWrite} />

      <QuestionsPanel detail={detail} canEdit={canWrite && isDraft} />

      <StagesPanel detail={detail} canEdit={canWrite && isDraft} prompts={questionPrompt} />
    </div>
  );
}

function VersionHeader({ detail, canWrite }: { detail: TemplateVersionDetail; canWrite: boolean }) {
  const { template, siblings, supersedes, superseded_by } = detail;
  const isDraft = template.status === "draft";
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const newVersion = useServerFn(createTemplateVersion);
  const newVersionMutation = useMutation({
    mutationFn: () => newVersion({ data: { sourceTemplateId: template.id } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "templates"] });
      navigate({ to: "/templates", search: { template: result.templateId } });
    },
  });

  return (
    <Panel
      level="primary"
      title={
        <>
          {template.name}
          <span className={monoClass}>
            {template.key} · v{template.version}
          </span>
        </>
      }
      meta={
        <span className="flex items-center gap-1.5">
          <Chip tone={statusTone(template.status, template.is_live)}>
            {template.is_live ? "live" : template.status}
          </Chip>
          <Chip>{humanize(template.journey_type)}</Chip>
        </span>
      }
      action={
        canWrite ? (
          isDraft ? (
            <span className="flex items-center gap-1.5">
              {editing ? null : (
                <button type="button" className={buttonClass} onClick={() => setEditing(true)}>
                  <Pencil className="h-3 w-3" /> Edit details
                </button>
              )}
              {publishing ? null : (
                <button type="button" className={primaryClass} onClick={() => setPublishing(true)}>
                  Publish
                </button>
              )}
            </span>
          ) : template.is_live ? (
            <button
              type="button"
              className={primaryClass}
              disabled={newVersionMutation.isPending}
              onClick={() => newVersionMutation.mutate()}
              title="Copy this version into a new draft you can edit"
            >
              <Plus className="h-3 w-3" />
              {newVersionMutation.isPending ? "Copying…" : "New version"}
            </button>
          ) : null
        ) : null
      }
    >
      {!isDraft ? (
        <div className="flex items-start gap-1.5 border-b border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>
            <span className="font-medium text-foreground">
              {humanize(template.status)} — create a new version to change it.
            </span>{" "}
            Its content is frozen in the database: the {template.implementation_count}{" "}
            implementation
            {template.implementation_count === 1 ? "" : "s"} pinned to this version must keep
            exactly the plan they were created from.
            {canWrite && template.is_live
              ? " Use “New version” above — it copies every stage, task and question into a draft you can edit, then publish."
              : null}
          </span>
        </div>
      ) : (
        <div className="border-b border-border bg-surface px-3 py-2 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">Draft.</span> Nothing here affects a running
          implementation until it is published; publishing supersedes the family&rsquo;s live
          version.
        </div>
      )}
      {newVersionMutation.error ? <ErrorLine error={newVersionMutation.error} /> : null}

      {superseded_by ? (
        <div className="border-b border-border bg-status-risk px-3 py-2 text-[12px] text-status-risk-foreground">
          This version was superseded by{" "}
          <Link
            to="/templates"
            search={{ template: superseded_by.id }}
            className="font-medium underline"
          >
            v{superseded_by.version}
          </Link>
          . New implementations get that one; the {template.implementation_count} pinned here keep
          this content.
        </div>
      ) : null}

      {editing ? (
        <MetadataForm detail={detail} onDone={() => setEditing(false)} />
      ) : (
        <dl className="grid gap-3 px-3 py-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <Field
            label="Published"
            value={template.published_at ? fmtDate(template.published_at) : "—"}
          />
          <Field label="Implementations pinned" value={template.implementation_count} />
          <Field label="Stages" value={template.stage_count} />
          <Field
            label="Tasks"
            value={
              <span>
                {template.task_count}
                {template.conditional_task_count > 0 ? (
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    ({template.conditional_task_count} conditional)
                  </span>
                ) : null}
              </span>
            }
          />
          <Field label="Scoping questions" value={template.question_count} />
          <Field
            label="Supersedes"
            value={
              supersedes ? (
                <Link to="/templates" search={{ template: supersedes.id }} className="underline">
                  v{supersedes.version}
                </Link>
              ) : (
                "—"
              )
            }
          />
        </dl>
      )}

      {publishing ? <PublishForm detail={detail} onDone={() => setPublishing(false)} /> : null}

      {!editing && (template.description || template.version_note) ? (
        <div className="space-y-1 border-t border-border px-3 py-2">
          {template.description ? (
            <p className="text-[12px] text-muted-foreground">{template.description}</p>
          ) : null}
          {template.version_note ? (
            <p className="text-[12px] italic text-muted-foreground">
              Version note: {template.version_note}
            </p>
          ) : null}
        </div>
      ) : null}

      {siblings.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
          <span className={labelClass}>Versions</span>
          {siblings.map((s) => (
            <Link
              key={s.id}
              to="/templates"
              search={{ template: s.id }}
              className={cn(
                "rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted/60",
                s.id === template.id && "bg-muted font-medium text-foreground",
              )}
            >
              v{s.version}
              <span className="ml-1 text-muted-foreground">{s.status}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function MetadataForm({ detail, onDone }: { detail: TemplateVersionDetail; onDone: () => void }) {
  const { template } = detail;
  const invalidate = useTemplateInvalidate(template.id);
  const save = useServerFn(saveTemplateMetadata);
  const [name, setName] = useState(template.name);
  const [journeyType, setJourneyType] = useState<JourneyType>(template.journey_type as JourneyType);
  const [description, setDescription] = useState(template.description ?? "");
  const [note, setNote] = useState(template.version_note ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          templateId: template.id,
          name: name.trim(),
          journey_type: journeyType,
          description: description.trim() || null,
          version_note: note.trim() || null,
        },
      }),
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
  });

  return (
    <form
      className="space-y-2 border-b border-border px-3 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <LabelledField label="Name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </LabelledField>
        <LabelledField label="Journey type">
          <select
            className={selectClass}
            value={journeyType}
            onChange={(e) => setJourneyType(e.target.value as JourneyType)}
          >
            {JOURNEY_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </select>
        </LabelledField>
      </div>
      <LabelledField label="Description">
        <textarea
          className={areaClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </LabelledField>
      <LabelledField label="Version note">
        <textarea className={areaClass} value={note} onChange={(e) => setNote(e.target.value)} />
      </LabelledField>
      {mutation.error ? <ErrorLine error={mutation.error} /> : null}
      <div className="flex items-center gap-2">
        <button type="submit" className={primaryClass} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save details"}
        </button>
        <button type="button" className={buttonClass} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PublishForm({ detail, onDone }: { detail: TemplateVersionDetail; onDone: () => void }) {
  const { template, stages } = detail;
  const invalidate = useTemplateInvalidate(template.id);
  const publish = useServerFn(publishTemplateVersion);
  const [note, setNote] = useState(template.version_note ?? "");

  const mutation = useMutation({
    mutationFn: () => publish({ data: { templateId: template.id, note: note.trim() || null } }),
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
  });

  const blocked = stages.length === 0;

  return (
    <form
      className="space-y-2 border-t border-border bg-surface px-3 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <p className="text-[12px] text-muted-foreground">
        Publishing freezes this version&rsquo;s content and supersedes the family&rsquo;s current
        live version. Implementations already running keep the version they were created from; new
        ones get this one.
      </p>
      <LabelledField label="Version note — what changed and why">
        <textarea className={areaClass} value={note} onChange={(e) => setNote(e.target.value)} />
      </LabelledField>
      {blocked ? (
        <p className="text-[11px] font-medium text-destructive">
          Add at least one stage before publishing.
        </p>
      ) : null}
      {mutation.error ? <ErrorLine error={mutation.error} /> : null}
      <div className="flex items-center gap-2">
        <button type="submit" className={primaryClass} disabled={mutation.isPending || blocked}>
          {mutation.isPending ? "Publishing…" : `Publish v${template.version}`}
        </button>
        <button type="button" className={buttonClass} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------------- */
/* Scoping questions                                                          */
/* ------------------------------------------------------------------------- */

function QuestionsPanel({ detail, canEdit }: { detail: TemplateVersionDetail; canEdit: boolean }) {
  const templateId = detail.template.id;
  const questions = detail.questions;
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const invalidate = useTemplateInvalidate(templateId);
  const remove = useServerFn(removeTemplateQuestion);
  const reorder = useServerFn(reorderTemplateQuestions);
  const order = questions.map((q) => q.id);

  const removeMutation = useMutation({
    mutationFn: (questionId: string) => remove({ data: { templateId, questionId } }),
    onSuccess: () => invalidate(),
  });
  const moveMutation = useMutation({
    mutationFn: (vars: { id: string; delta: number }) =>
      reorder({ data: { templateId, orderedIds: moveInOrder(order, vars.id, vars.delta) } }),
    onSuccess: () => invalidate(),
  });

  return (
    <Panel
      title="Scoping questions"
      count={questions.length}
      action={
        canEdit && editing !== "new" ? (
          <button type="button" className={buttonClass} onClick={() => setEditing("new")}>
            <Plus className="h-3 w-3" /> Add question
          </button>
        ) : null
      }
    >
      <ErrorLine error={removeMutation.error ?? moveMutation.error} />
      {editing === "new" ? (
        <QuestionForm templateId={templateId} question={null} onDone={() => setEditing(null)} />
      ) : null}
      {questions.length === 0 ? (
        <NoRows label="No scoping questions — every task on this template is unconditional." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-surface text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-medium">#</th>
                <th className="px-3 py-1.5 font-medium">Key</th>
                <th className="px-3 py-1.5 font-medium">Prompt</th>
                <th className="px-3 py-1.5 font-medium">Kind</th>
                <th className="px-3 py-1.5 font-medium">Options</th>
                <th className="px-3 py-1.5 font-medium">Drives</th>
                {canEdit ? <th className="px-3 py-1.5 font-medium">Edit</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {questions.map((q, index) =>
                editing === q.id ? (
                  <tr key={q.id}>
                    <td colSpan={canEdit ? 7 : 6} className="p-0">
                      <QuestionForm
                        templateId={templateId}
                        question={q}
                        onDone={() => setEditing(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={q.id} className="hover:bg-muted/60">
                    <td className={cn("px-3 py-1.5", monoClass)}>{q.position}</td>
                    <td className="px-3 py-1.5">
                      <code className="font-mono text-[11px]">{q.key}</code>
                      {q.required ? <span className="ml-1 text-destructive">*</span> : null}
                    </td>
                    <td className="px-3 py-1.5 text-[12px]">{q.prompt}</td>
                    <td className={cn("px-3 py-1.5", monoClass)}>{q.kind}</td>
                    <td className={cn("px-3 py-1.5", monoClass)}>
                      {Array.isArray(q.options) ? q.options.map(String).join(", ") : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-[11px] text-muted-foreground">
                      {q.used_by_task_keys.length === 0 ? (
                        <span className="text-muted-foreground/70">no tasks</span>
                      ) : (
                        `${q.used_by_task_keys.length} task${q.used_by_task_keys.length === 1 ? "" : "s"}`
                      )}
                    </td>
                    {canEdit ? (
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-1">
                          <MoveButtons
                            what="question"
                            canUp={index > 0}
                            canDown={index < questions.length - 1}
                            pending={moveMutation.isPending}
                            onMove={(delta) => moveMutation.mutate({ id: q.id, delta })}
                          />
                          <button
                            type="button"
                            className={buttonClass}
                            onClick={() => setEditing(q.id)}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className={cn(buttonClass, "hover:text-destructive")}
                            disabled={removeMutation.isPending}
                            onClick={() => {
                              const used = q.used_by_task_keys.length;
                              const warning = used
                                ? ` ${used} task${used === 1 ? "" : "s"} condition on it and would then never be created.`
                                : "";
                              if (window.confirm(`Delete question "${q.key}"?${warning}`)) {
                                removeMutation.mutate(q.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      </td>
                    ) : null}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function QuestionForm({
  templateId,
  question,
  onDone,
}: {
  templateId: string;
  question: ScopingQuestionDetail | null;
  onDone: () => void;
}) {
  const invalidate = useTemplateInvalidate(templateId);
  const save = useServerFn(saveTemplateQuestion);
  const [key, setKey] = useState(question?.key ?? "");
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [kind, setKind] = useState<QuestionKind>((question?.kind as QuestionKind) ?? "boolean");
  const [options, setOptions] = useState(formatOptionList(question?.options));
  const [required, setRequired] = useState(question?.required ?? false);

  const wantsOptions = kind === "select" || kind === "multi_select";

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          templateId,
          questionId: question?.id ?? null,
          key: key.trim(),
          prompt: prompt.trim(),
          kind,
          options: wantsOptions ? parseOptionList(options) : null,
          required,
        },
      }),
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
  });

  return (
    <form
      className="space-y-2 border-b border-border bg-surface px-3 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="grid gap-2 sm:grid-cols-4">
        <LabelledField label="Key">
          <input
            className={inputClass}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="has_integration"
            required
          />
        </LabelledField>
        <LabelledField label="Kind">
          <select
            className={selectClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as QuestionKind)}
          >
            {QUESTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {humanize(k)}
              </option>
            ))}
          </select>
        </LabelledField>
        <LabelledField label="Options (comma-separated)">
          <input
            className={inputClass}
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            disabled={!wantsOptions}
            placeholder={wantsOptions ? "Salesforce, NetSuite, Other" : "n/a for this kind"}
          />
        </LabelledField>
        <LabelledField label="Required">
          <label className="flex h-6 items-center gap-1.5 text-[12px]">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            Must be answered
          </label>
        </LabelledField>
      </div>
      <LabelledField label="Prompt">
        <input
          className={inputClass}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Did they buy an integration?"
          required
        />
      </LabelledField>
      <p className="text-[11px] text-muted-foreground">
        The key is what a task&rsquo;s <code className="font-mono">include_when</code> names.
        Renaming it here does NOT rewrite those conditions — they will stop matching.
      </p>
      {mutation.error ? <ErrorLine error={mutation.error} /> : null}
      <div className="flex items-center gap-2">
        <button type="submit" className={primaryClass} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : question ? "Save question" : "Add question"}
        </button>
        <button type="button" className={buttonClass} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------------- */
/* Stages and tasks                                                           */
/* ------------------------------------------------------------------------- */

function StagesPanel({
  detail,
  canEdit,
  prompts,
}: {
  detail: TemplateVersionDetail;
  canEdit: boolean;
  prompts: Map<string, string>;
}) {
  const templateId = detail.template.id;
  const stages = detail.stages;
  const [editingStage, setEditingStage] = useState<string | "new" | null>(null);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const invalidate = useTemplateInvalidate(templateId);
  const removeStage = useServerFn(removeTemplateStage);
  const reorderStages = useServerFn(reorderTemplateStages);
  const stageOrder = stages.map((s) => s.id);

  const removeStageMutation = useMutation({
    mutationFn: (stageId: string) => removeStage({ data: { templateId, stageId } }),
    onSuccess: () => invalidate(),
  });
  const moveStageMutation = useMutation({
    mutationFn: (vars: { id: string; delta: number }) =>
      reorderStages({
        data: { templateId, orderedIds: moveInOrder(stageOrder, vars.id, vars.delta) },
      }),
    onSuccess: () => invalidate(),
  });

  return (
    <Panel
      title="Stages and tasks"
      count={stages.length}
      action={
        canEdit && editingStage !== "new" ? (
          <button type="button" className={buttonClass} onClick={() => setEditingStage("new")}>
            <Plus className="h-3 w-3" /> Add stage
          </button>
        ) : null
      }
    >
      <ErrorLine error={removeStageMutation.error ?? moveStageMutation.error} />
      {editingStage === "new" ? (
        <StageForm templateId={templateId} stage={null} onDone={() => setEditingStage(null)} />
      ) : null}
      {stages.length === 0 ? (
        <NoRows label="This version has no stages." />
      ) : (
        <div className="divide-y divide-border">
          {stages.map((stage, index) => (
            <section key={stage.id}>
              {editingStage === stage.id ? (
                <StageForm
                  templateId={templateId}
                  stage={stage}
                  onDone={() => setEditingStage(null)}
                />
              ) : (
                <header className="bg-surface px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className={monoClass}>{stage.position}</span>
                    <h3 className="text-[13px] font-semibold">{stage.name}</h3>
                    <code className={monoClass}>{stage.stage_key}</code>
                    <Chip>{humanize(stage.phase)}</Chip>
                    <Chip tone={stage.gate_mode === "blocking" ? "warn" : "muted"}>
                      {stage.gate_mode} gate
                    </Chip>
                    {stage.target_duration_days != null ? (
                      <span className={monoClass}>target {stage.target_duration_days}d</span>
                    ) : null}
                    {canEdit ? (
                      <span className="ml-auto flex items-center gap-1">
                        <MoveButtons
                          what="stage"
                          canUp={index > 0}
                          canDown={index < stages.length - 1}
                          pending={moveStageMutation.isPending}
                          onMove={(delta) => moveStageMutation.mutate({ id: stage.id, delta })}
                        />
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() => setEditingStage(stage.id)}
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                        <button
                          type="button"
                          className={cn(buttonClass, "hover:text-destructive")}
                          disabled={removeStageMutation.isPending}
                          onClick={() => {
                            const count = stage.tasks.length;
                            const warning = count
                              ? ` Its ${count} task${count === 1 ? "" : "s"} go with it.`
                              : "";
                            if (window.confirm(`Delete stage "${stage.name}"?${warning}`)) {
                              removeStageMutation.mutate(stage.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() => setEditingTask(`new:${stage.id}`)}
                        >
                          <Plus className="h-3 w-3" /> Task
                        </button>
                      </span>
                    ) : null}
                  </div>
                  {stage.purpose ? (
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{stage.purpose}</p>
                  ) : null}
                </header>
              )}

              {editingTask === `new:${stage.id}` ? (
                <TaskForm
                  detail={detail}
                  stageId={stage.id}
                  task={null}
                  onDone={() => setEditingTask(null)}
                />
              ) : null}

              {stage.tasks.length === 0 ? (
                <NoRows label="No tasks in this stage." />
              ) : (
                <ul className="divide-y divide-border/70">
                  {stage.tasks.map((task, taskIndex) =>
                    editingTask === task.id ? (
                      <li key={task.id}>
                        <TaskForm
                          detail={detail}
                          stageId={stage.id}
                          task={task}
                          onDone={() => setEditingTask(null)}
                        />
                      </li>
                    ) : (
                      <TaskRow
                        key={task.id}
                        task={task}
                        prompts={prompts}
                        canEdit={canEdit}
                        stage={stage}
                        index={taskIndex}
                        templateId={templateId}
                        onEdit={() => setEditingTask(task.id)}
                      />
                    ),
                  )}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}

function StageForm({
  templateId,
  stage,
  onDone,
}: {
  templateId: string;
  stage: TemplateStageDetail | null;
  onDone: () => void;
}) {
  const invalidate = useTemplateInvalidate(templateId);
  const save = useServerFn(saveTemplateStage);
  const [stageKey, setStageKey] = useState(stage?.stage_key ?? "");
  const [name, setName] = useState(stage?.name ?? "");
  const [phase, setPhase] = useState<StagePhase>((stage?.phase as StagePhase) ?? "delivery");
  const [gateMode, setGateMode] = useState<GateMode>((stage?.gate_mode as GateMode) ?? "advisory");
  const [target, setTarget] = useState(
    stage?.target_duration_days == null ? "" : String(stage.target_duration_days),
  );
  const [purpose, setPurpose] = useState(stage?.purpose ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          templateId,
          stageId: stage?.id ?? null,
          stage_key: stageKey.trim(),
          name: name.trim(),
          phase,
          purpose: purpose.trim() || null,
          gate_mode: gateMode,
          target_duration_days: target.trim() === "" ? null : Number(target),
        },
      }),
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
  });

  return (
    <form
      className="space-y-2 border-b border-border bg-surface px-3 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="grid gap-2 sm:grid-cols-5">
        <LabelledField label="Stage key">
          <input
            className={inputClass}
            value={stageKey}
            onChange={(e) => setStageKey(e.target.value)}
            placeholder="kickoff"
            required
          />
        </LabelledField>
        <LabelledField label="Name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </LabelledField>
        <LabelledField label="Phase">
          <select
            className={selectClass}
            value={phase}
            onChange={(e) => setPhase(e.target.value as StagePhase)}
          >
            {STAGE_PHASES.map((p) => (
              <option key={p} value={p}>
                {humanize(p)}
              </option>
            ))}
          </select>
        </LabelledField>
        <LabelledField label="Gate mode">
          <select
            className={selectClass}
            value={gateMode}
            onChange={(e) => setGateMode(e.target.value as GateMode)}
          >
            {GATE_MODES.map((g) => (
              <option key={g} value={g}>
                {humanize(g)}
              </option>
            ))}
          </select>
        </LabelledField>
        <LabelledField label="Target days">
          <input
            className={inputClass}
            type="number"
            min={0}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </LabelledField>
      </div>
      <LabelledField label="Purpose">
        <textarea
          className={areaClass}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </LabelledField>
      <p className="text-[11px] text-muted-foreground">
        The stage key is this stage&rsquo;s identity across versions — keep it stable when you copy
        a version forward.
      </p>
      {mutation.error ? <ErrorLine error={mutation.error} /> : null}
      <div className="flex items-center gap-2">
        <button type="submit" className={primaryClass} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : stage ? "Save stage" : "Add stage"}
        </button>
        <button type="button" className={buttonClass} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function TaskRow({
  task,
  prompts,
  canEdit,
  stage,
  index,
  templateId,
  onEdit,
}: {
  task: TemplateTaskDetail;
  prompts: Map<string, string>;
  canEdit: boolean;
  stage: TemplateStageDetail;
  index: number;
  templateId: string;
  onEdit: () => void;
}) {
  const condition = formatIncludeWhen(task.include_when);
  const isConditional = condition !== null;
  const invalidate = useTemplateInvalidate(templateId);
  const remove = useServerFn(removeTemplateTask);
  const reorder = useServerFn(reorderTemplateTasks);
  const order = stage.tasks.map((t) => t.id);

  const removeMutation = useMutation({
    mutationFn: () => remove({ data: { templateId, taskId: task.id } }),
    onSuccess: () => invalidate(),
  });
  const moveMutation = useMutation({
    mutationFn: (delta: number) =>
      reorder({
        data: { templateId, stageId: stage.id, orderedIds: moveInOrder(order, task.id, delta) },
      }),
    onSuccess: () => invalidate(),
  });

  return (
    <li
      className={cn(
        "px-3 py-2",
        isConditional && "border-l-2 border-status-risk-foreground bg-status-risk/20",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={monoClass}>{task.position}</span>
        <span className="text-[13px] font-medium">{task.title}</span>
        {isConditional ? <Chip tone="warn">conditional</Chip> : null}
        {task.is_optional ? <Chip tone="idle">optional</Chip> : null}
        {task.visibility === "shared" ? <Chip>customer-visible</Chip> : null}
        {canEdit ? (
          <span className="ml-auto flex items-center gap-1">
            <MoveButtons
              what="task"
              canUp={index > 0}
              canDown={index < stage.tasks.length - 1}
              pending={moveMutation.isPending}
              onMove={(delta) => moveMutation.mutate(delta)}
            />
            <button type="button" className={buttonClass} onClick={onEdit}>
              <Pencil className="h-3 w-3" /> Edit
            </button>
            <button
              type="button"
              className={cn(buttonClass, "hover:text-destructive")}
              disabled={removeMutation.isPending}
              onClick={() => {
                if (window.confirm(`Delete task "${task.title}"?`)) removeMutation.mutate();
              }}
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </span>
        ) : null}
      </div>
      <ErrorLine error={removeMutation.error ?? moveMutation.error} />
      {condition ? (
        <p className="mt-1 flex items-start gap-1.5 rounded-sm bg-status-risk px-2 py-1 text-[12px] font-medium text-status-risk-foreground">
          <Filter className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>
            {condition}
            {task.condition_keys.length > 0 ? (
              <span className="ml-1 font-normal opacity-80">
                (
                {task.condition_keys
                  .map((key) => prompts.get(key) ?? `${key} — no such scoping question`)
                  .join("; ")}
                )
              </span>
            ) : null}
          </span>
        </p>
      ) : null}
      {task.unknown_condition_keys.length > 0 ? (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-destructive">
          <TriangleAlert className="h-3 w-3 shrink-0" strokeWidth={2} />
          This condition names {task.unknown_condition_keys.join(", ")}, which this template asks no
          scoping question for — the task can never be created.
        </p>
      ) : null}
      {task.description ? (
        <p className="mt-0.5 text-[12px] text-muted-foreground">{task.description}</p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <code className="font-mono">{task.task_key}</code>
        <span>{task.role_name ?? task.role_key}</span>
        <span>{humanize(task.party)}</span>
        <span>{formatTaskOffset(task.offset_basis, task.offset_days)}</span>
        <span>{task.duration_days}d</span>
        {task.depends_on_keys.length > 0 ? (
          <span>after {task.depends_on_keys.join(", ")}</span>
        ) : null}
      </div>
    </li>
  );
}

function TaskForm({
  detail,
  stageId,
  task,
  onDone,
}: {
  detail: TemplateVersionDetail;
  stageId: string;
  task: TemplateTaskDetail | null;
  onDone: () => void;
}) {
  const templateId = detail.template.id;
  const invalidate = useTemplateInvalidate(templateId);
  const save = useServerFn(saveTemplateTask);

  const [targetStageId, setTargetStageId] = useState(stageId);
  const [taskKey, setTaskKey] = useState(task?.task_key ?? "");
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [roleKey, setRoleKey] = useState(
    task?.role_key ?? detail.roles[0]?.key ?? "implementation_manager",
  );
  const [party, setParty] = useState<Party>((task?.party as Party) ?? "internal");
  const [visibility, setVisibility] = useState<Visibility>(
    (task?.visibility as Visibility) ?? "internal",
  );
  const [offsetBasis, setOffsetBasis] = useState<OffsetBasis>(
    (task?.offset_basis as OffsetBasis) ?? "stage_entry",
  );
  const [offsetDays, setOffsetDays] = useState(String(task?.offset_days ?? 0));
  const [durationDays, setDurationDays] = useState(String(task?.duration_days ?? 1));
  const [isOptional, setIsOptional] = useState(task?.is_optional ?? false);
  const [dependsOn, setDependsOn] = useState((task?.depends_on_keys ?? []).join(", "));
  const [includeWhenRaw, setIncludeWhenRaw] = useState(formatIncludeWhenJson(task?.include_when));

  // The condition is the one field an author can silently get wrong, so it is
  // parsed on every keystroke and read back to them in the same words the
  // browser uses. An unparseable condition cannot be saved at all.
  const parsed = parseIncludeWhen(includeWhenRaw);
  const labels: Record<string, string> = {};
  for (const q of detail.questions) labels[q.key] = q.prompt;
  const preview = parsed.ok ? formatIncludeWhen(parsed.value, labels) : null;
  const questionKeys = new Set(detail.questions.map((q) => q.key));
  const unknownConditionKeys = parsed.ok
    ? includeWhenKeys(parsed.value).filter((k) => !questionKeys.has(k))
    : [];

  const dependsOnKeys = parseKeyList(dependsOn);
  const taskKeys = new Set(
    detail.stages
      .flatMap((s) => s.tasks.map((t) => t.task_key))
      .filter((k) => k !== task?.task_key),
  );
  const unknownDependsOn = dependsOnKeys.filter((k) => !taskKeys.has(k));

  const mutation = useMutation({
    mutationFn: () => {
      if (!parsed.ok) throw new Error(parsed.error);
      return save({
        data: {
          templateId,
          taskId: task?.id ?? null,
          template_stage_id: targetStageId,
          task_key: taskKey.trim(),
          title: title.trim(),
          description: description.trim() || null,
          role_key: roleKey,
          party,
          visibility,
          offset_basis: offsetBasis,
          offset_days: Number(offsetDays) || 0,
          duration_days: Number(durationDays) || 0,
          is_optional: isOptional,
          include_when: parsed.value,
          depends_on_keys: dependsOnKeys,
        },
      });
    },
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
  });

  const roleOptions = detail.roles.some((r) => r.key === roleKey)
    ? detail.roles
    : [{ key: roleKey, name: roleKey, party: "internal" }, ...detail.roles];

  return (
    <form
      className="space-y-2 border-b border-border bg-muted/40 px-3 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="grid gap-2 sm:grid-cols-4">
        <LabelledField label="Task key">
          <input
            className={inputClass}
            value={taskKey}
            onChange={(e) => setTaskKey(e.target.value)}
            placeholder="send_welcome_pack"
            required
          />
        </LabelledField>
        <LabelledField label="Title">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </LabelledField>
        <LabelledField label="Stage">
          <select
            className={selectClass}
            value={targetStageId}
            onChange={(e) => setTargetStageId(e.target.value)}
          >
            {detail.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.position}. {s.name}
              </option>
            ))}
          </select>
        </LabelledField>
        <LabelledField label="Role">
          <select
            className={selectClass}
            value={roleKey}
            onChange={(e) => setRoleKey(e.target.value)}
          >
            {roleOptions.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
        </LabelledField>
      </div>

      <div className="grid gap-2 sm:grid-cols-6">
        <LabelledField label="Party">
          <select
            className={selectClass}
            value={party}
            onChange={(e) => setParty(e.target.value as Party)}
          >
            {PARTIES.map((p) => (
              <option key={p} value={p}>
                {humanize(p)}
              </option>
            ))}
          </select>
        </LabelledField>
        <LabelledField label="Visibility">
          <select
            className={selectClass}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
          >
            {VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {humanize(v)}
              </option>
            ))}
          </select>
        </LabelledField>
        <LabelledField label="Offset basis">
          <select
            className={selectClass}
            value={offsetBasis}
            onChange={(e) => setOffsetBasis(e.target.value as OffsetBasis)}
          >
            {OFFSET_BASES.map((o) => (
              <option key={o} value={o}>
                {humanize(o)}
              </option>
            ))}
          </select>
        </LabelledField>
        <LabelledField label="Offset days">
          <input
            className={inputClass}
            type="number"
            value={offsetDays}
            onChange={(e) => setOffsetDays(e.target.value)}
          />
        </LabelledField>
        <LabelledField label="Duration days">
          <input
            className={inputClass}
            type="number"
            min={0}
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
          />
        </LabelledField>
        <LabelledField label="Optional">
          <label className="flex h-6 items-center gap-1.5 text-[12px]">
            <input
              type="checkbox"
              checked={isOptional}
              onChange={(e) => setIsOptional(e.target.checked)}
            />
            Can be skipped
          </label>
        </LabelledField>
      </div>

      <LabelledField label="Description">
        <textarea
          className={areaClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </LabelledField>

      <div className="grid gap-2 sm:grid-cols-2">
        <LabelledField label="Depends on (task keys)">
          <input
            className={inputClass}
            value={dependsOn}
            onChange={(e) => setDependsOn(e.target.value)}
            placeholder="kickoff_held, data_received"
          />
        </LabelledField>
        <div className="min-w-0">
          <span className={labelClass}>include_when (JSON — empty means always included)</span>
          <textarea
            className={cn(areaClass, "mt-0.5 font-mono")}
            value={includeWhenRaw}
            onChange={(e) => setIncludeWhenRaw(e.target.value)}
            placeholder='{"has_integration": true}'
            spellCheck={false}
          />
        </div>
      </div>

      {unknownDependsOn.length > 0 ? (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
          <TriangleAlert className="h-3 w-3 shrink-0" strokeWidth={2} />
          No task on this version has the key {unknownDependsOn.join(", ")} — that dependency will
          be dropped at instantiation.
        </p>
      ) : null}

      {parsed.ok ? (
        <p className="rounded-sm bg-surface px-2 py-1 text-[12px]">
          <span className={labelClass}>Reads as</span>{" "}
          {preview ?? "Always included — no scoping question gates this task."}
        </p>
      ) : (
        <p
          role="alert"
          className="rounded-sm bg-status-risk px-2 py-1 text-[12px] font-medium text-status-risk-foreground"
        >
          {parsed.error}
        </p>
      )}
      {parsed.ok && unknownConditionKeys.length > 0 ? (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
          <TriangleAlert className="h-3 w-3 shrink-0" strokeWidth={2} />
          This template asks no scoping question called {unknownConditionKeys.join(", ")} — with
          this condition the task can never be created.
        </p>
      ) : null}

      {mutation.error ? <ErrorLine error={mutation.error} /> : null}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className={primaryClass}
          disabled={mutation.isPending || !parsed.ok || detail.stages.length === 0}
        >
          {mutation.isPending ? "Saving…" : task ? "Save task" : "Add task"}
        </button>
        <button type="button" className={buttonClass} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
