import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, Filter, TriangleAlert } from "lucide-react";

import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { Field, NoRows, Panel } from "@/components/record";
import { getTemplateFamilies, getTemplateVersion } from "@/lib/templates.functions";
import type { TemplateBrowserList, TemplateTaskDetail } from "@/lib/templates.server";
import { formatIncludeWhen } from "@/lib/journey-conditions";
import { fmtDate, formatTaskOffset, humanize } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------------- */
/* Read-only journey template browser.                                        */
/*                                                                            */
/* This page exists so the team can review seeded template content BEFORE the */
/* journey_templates flag flips. There is deliberately no edit, publish or    */
/* reorder affordance here — published content is frozen in the database and  */
/* the editing surface lands later.                                          */
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

export const Route = createFileRoute("/admin/templates")({
  head: () => ({
    meta: [
      { title: "Journey templates — Admin | GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "Read-only browser for journey template families: stages, tasks, conditions and scoping questions.",
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
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
const monoClass = "font-mono text-[11px] text-muted-foreground";

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

function TemplatesPage() {
  const { data: list } = useSuspenseQuery(familiesQuery);
  const { template } = Route.useSearch();

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

  const selectedId = template ?? defaultVersionId(list);

  return (
    <>
      <PageHeader
        title="Journey templates"
        description="Read-only. A family is a key, a version is a row; published content is frozen because live implementations pin the exact version they were created from."
        actions={
          <Link to="/admin" className={buttonClass}>
            <ChevronLeft className="h-3 w-3" /> Admin
          </Link>
        }
      />
      <PageBody className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:items-start">
          <Panel title="Families" count={list.families.length}>
            {list.families.length === 0 ? (
              <NoRows label="No journey templates exist yet." />
            ) : (
              <ul className="divide-y divide-border">
                {list.families.map((family) => {
                  const shown = family.live ?? family.versions[0] ?? null;
                  const active = family.versions.some((v) => v.id === selectedId);
                  return (
                    <li key={family.key}>
                      <Link
                        to="/admin/templates"
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
            <VersionDetail templateId={selectedId} />
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

function VersionDetail({ templateId }: { templateId: string }) {
  const { data } = useSuspenseQuery(versionQuery(templateId));

  if (!data.flagOn || !data.detail) {
    return (
      <Panel title="Version">
        <NoRows label="That template version no longer exists. Pick a family on the left." />
      </Panel>
    );
  }

  const { template, stages, questions, siblings, supersedes, superseded_by } = data.detail;
  const questionPrompt = new Map(questions.map((q) => [q.key, q.prompt]));

  return (
    <div className="min-w-0 space-y-3">
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
      >
        {superseded_by ? (
          <div className="border-b border-border bg-status-risk px-3 py-2 text-[12px] text-status-risk-foreground">
            This version was superseded by{" "}
            <Link
              to="/admin/templates"
              search={{ template: superseded_by.id }}
              className="font-medium underline"
            >
              v{superseded_by.version}
            </Link>
            . New implementations get that one; the {template.implementation_count} pinned here keep
            this content.
          </div>
        ) : null}
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
                <Link
                  to="/admin/templates"
                  search={{ template: supersedes.id }}
                  className="underline"
                >
                  v{supersedes.version}
                </Link>
              ) : (
                "—"
              )
            }
          />
        </dl>
        {template.description || template.version_note ? (
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
                to="/admin/templates"
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

      <Panel title="Scoping questions" count={questions.length}>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {questions.map((q) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Stages and tasks" count={stages.length}>
        {stages.length === 0 ? (
          <NoRows label="This version has no stages." />
        ) : (
          <div className="divide-y divide-border">
            {stages.map((stage) => (
              <section key={stage.id}>
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
                  </div>
                  {stage.purpose ? (
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{stage.purpose}</p>
                  ) : null}
                </header>
                {stage.tasks.length === 0 ? (
                  <NoRows label="No tasks in this stage." />
                ) : (
                  <ul className="divide-y divide-border/70">
                    {stage.tasks.map((task) => (
                      <TaskRow key={task.id} task={task} prompts={questionPrompt} />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function TaskRow({ task, prompts }: { task: TemplateTaskDetail; prompts: Map<string, string> }) {
  const condition = formatIncludeWhen(task.include_when);
  const isConditional = condition !== null;

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
      </div>
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
