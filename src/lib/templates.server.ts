import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isFlagOn } from "./app-config.server";
import { includeWhenKeys, type JsonValue } from "./journey-conditions";
import { audit } from "./server/audit";
import {
  copyQuestionRows,
  copyStageRows,
  copyTaskRows,
  isSameIdSet,
  mapStageIdsByKey,
  nextPosition,
  type GateMode,
  type JourneyType,
  type OffsetBasis,
  type Party,
  type QuestionKind,
  type SourceQuestionRow,
  type SourceStageRow,
  type SourceTaskRow,
  type StagePhase,
  type Visibility,
} from "./template-draft";

const db = () => supabaseAdmin as any;

/* ------------------------------------------------------------------------- */
/* Template browser + builder.                                                */
/*                                                                            */
/* A template FAMILY is a `key`; a VERSION is a row. Published content is      */
/* frozen in the database (see 0013's journey_template_frozen trigger), so the */
/* write half below only ever touches a DRAFT: changing a published version is */
/* impossible by design, and the way to change one is to create a new draft    */
/* version (a deep copy) and publish that. Every write calls requireDraft      */
/* first so an author gets that sentence instead of a raw trigger exception.   */
/*                                                                            */
/* The whole surface is gated on the `journey_templates` flag. That is a UX    */
/* gate, not an authorization one: the caller is already required to be        */
/* internal by requireInternalAuth before any of this runs, and every write is */
/* additionally manage-only (see templates.functions.ts). With the flag off    */
/* the loaders return `flagOn: false` and NO content, so nothing half-built    */
/* leaks into the product before the content review lands.                     */
/* ------------------------------------------------------------------------- */

export interface TemplateVersionSummary {
  id: string;
  key: string;
  version: number;
  name: string;
  journey_type: string;
  status: "draft" | "published" | "archived";
  description: string | null;
  version_note: string | null;
  published_at: string | null;
  supersedes_id: string | null;
  superseded_by_id: string | null;
  /** Live = the one version instantiation picks: published and not superseded. */
  is_live: boolean;
  stage_count: number;
  task_count: number;
  conditional_task_count: number;
  question_count: number;
  /** Implementations whose journey_template_id pins THIS version. */
  implementation_count: number;
}

export interface TemplateFamily {
  key: string;
  name: string;
  journey_type: string;
  /** The published, un-superseded version, if the family has one. */
  live: TemplateVersionSummary | null;
  /** Newest version first. */
  versions: TemplateVersionSummary[];
  implementation_count: number;
}

export interface TemplateBrowserList {
  flagOn: boolean;
  families: TemplateFamily[];
}

export interface TemplateTaskDetail {
  id: string;
  position: number;
  task_key: string;
  title: string;
  description: string | null;
  role_key: string;
  role_name: string | null;
  party: string;
  visibility: string;
  offset_basis: string;
  offset_days: number;
  duration_days: number;
  is_optional: boolean;
  include_when: JsonValue;
  /** Scoping-question keys the condition names, in order. */
  condition_keys: string[];
  /** Condition keys with no matching scoping question — a content bug. */
  unknown_condition_keys: string[];
  depends_on_keys: string[];
}

export interface TemplateStageDetail {
  id: string;
  position: number;
  stage_key: string;
  name: string;
  phase: string;
  purpose: string | null;
  gate_mode: string;
  target_duration_days: number | null;
  tasks: TemplateTaskDetail[];
}

export interface ScopingQuestionDetail {
  id: string;
  position: number;
  key: string;
  prompt: string;
  kind: string;
  options: JsonValue;
  required: boolean;
  /** Tasks whose include_when names this question. */
  used_by_task_keys: string[];
}

export interface TemplateVersionLink {
  id: string;
  version: number;
  status: string;
}

export interface TemplateRoleOption {
  key: string;
  name: string;
  party: string;
}

export interface TemplateVersionDetail {
  template: TemplateVersionSummary;
  stages: TemplateStageDetail[];
  questions: ScopingQuestionDetail[];
  /** Assignable roles — the task editor's role_key options. */
  roles: TemplateRoleOption[];
  /** Every version of the same family, newest first — the version switcher. */
  siblings: TemplateVersionLink[];
  supersedes: TemplateVersionLink | null;
  superseded_by: TemplateVersionLink | null;
}

export interface TemplateBrowserDetail {
  flagOn: boolean;
  detail: TemplateVersionDetail | null;
}

const FLAG = "journey_templates" as const;

function countBy<T>(rows: T[], pick: (row: T) => string | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const id = pick(row);
    if (!id) continue;
    out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** Every family with its versions and the counts a reviewer scans first. */
export async function loadTemplateFamilies(): Promise<TemplateBrowserList> {
  if (!(await isFlagOn(FLAG))) return { flagOn: false, families: [] };

  const [
    { data: templates },
    { data: stages },
    { data: tasks },
    { data: questions },
    { data: impls },
  ] = await Promise.all([
    db()
      .from("journey_templates")
      .select(
        "id, key, version, name, journey_type, status, description, version_note, published_at, supersedes_id, superseded_by_id",
      )
      .order("key")
      .order("version", { ascending: false }),
    db().from("journey_template_stages").select("id, template_id"),
    db().from("journey_template_tasks").select("id, template_id, include_when"),
    db().from("scoping_questions").select("id, template_id"),
    db().from("implementations").select("id, journey_template_id"),
  ]);

  const stageCounts = countBy(stages ?? [], (s: any) => s.template_id);
  const taskCounts = countBy(tasks ?? [], (t: any) => t.template_id);
  const conditionalCounts = countBy(
    (tasks ?? []).filter((t: any) => includeWhenKeys(t.include_when).length > 0),
    (t: any) => t.template_id,
  );
  const questionCounts = countBy(questions ?? [], (q: any) => q.template_id);
  const implCounts = countBy(impls ?? [], (i: any) => i.journey_template_id);

  const summaries: TemplateVersionSummary[] = (templates ?? []).map((t: any) => ({
    id: t.id,
    key: t.key,
    version: t.version,
    name: t.name,
    journey_type: t.journey_type,
    status: t.status,
    description: t.description ?? null,
    version_note: t.version_note ?? null,
    published_at: t.published_at ?? null,
    supersedes_id: t.supersedes_id ?? null,
    superseded_by_id: t.superseded_by_id ?? null,
    is_live: t.status === "published" && !t.superseded_by_id,
    stage_count: stageCounts.get(t.id) ?? 0,
    task_count: taskCounts.get(t.id) ?? 0,
    conditional_task_count: conditionalCounts.get(t.id) ?? 0,
    question_count: questionCounts.get(t.id) ?? 0,
    implementation_count: implCounts.get(t.id) ?? 0,
  }));

  const byKey = new Map<string, TemplateVersionSummary[]>();
  for (const summary of summaries) {
    const list = byKey.get(summary.key);
    if (list) list.push(summary);
    else byKey.set(summary.key, [summary]);
  }

  const families: TemplateFamily[] = [];
  for (const [key, versions] of byKey) {
    // Already newest-first from the query; sort again so the shape is not
    // hostage to the ordering of a future query change.
    versions.sort((a, b) => b.version - a.version);
    const live = versions.find((v) => v.is_live) ?? null;
    const newest = versions[0];
    families.push({
      key,
      name: live?.name ?? newest?.name ?? key,
      journey_type: live?.journey_type ?? newest?.journey_type ?? "",
      live,
      versions,
      implementation_count: versions.reduce((sum, v) => sum + v.implementation_count, 0),
    });
  }
  families.sort((a, b) => a.name.localeCompare(b.name));

  return { flagOn: true, families };
}

/** One version's full content: ordered stages, their tasks, scoping questions. */
export async function loadTemplateVersion(templateId: string): Promise<TemplateBrowserDetail> {
  if (!(await isFlagOn(FLAG))) return { flagOn: false, detail: null };

  const { data: template } = await db()
    .from("journey_templates")
    .select(
      "id, key, version, name, journey_type, status, description, version_note, published_at, supersedes_id, superseded_by_id",
    )
    .eq("id", templateId)
    .maybeSingle();
  // A stale id in the URL is a dead end, not an error page: the browser says
  // so and the family list stays usable.
  if (!template) return { flagOn: true, detail: null };

  const [
    { data: stages },
    { data: tasks },
    { data: questions },
    { data: roles },
    { data: impls },
    { data: siblings },
  ] = await Promise.all([
    db()
      .from("journey_template_stages")
      .select("id, position, stage_key, name, phase, purpose, gate_mode, target_duration_days")
      .eq("template_id", templateId)
      .order("position"),
    db().from("journey_template_tasks").select("*").eq("template_id", templateId).order("position"),
    db()
      .from("scoping_questions")
      .select("id, position, key, prompt, kind, options, required")
      .eq("template_id", templateId)
      .order("position"),
    db().from("journey_roles").select("key, name, party"),
    db().from("implementations").select("id").eq("journey_template_id", templateId),
    db()
      .from("journey_templates")
      .select("id, version, status")
      .eq("key", template.key)
      .order("version", { ascending: false }),
  ]);

  const roleName = new Map<string, string>((roles ?? []).map((r: any) => [r.key, r.name]));
  const questionKeys = new Set((questions ?? []).map((q: any) => q.key as string));

  const tasksByStage = new Map<string, TemplateTaskDetail[]>();
  const taskRows: TemplateTaskDetail[] = (tasks ?? []).map((t: any) => {
    const conditionKeys = includeWhenKeys(t.include_when);
    const row: TemplateTaskDetail = {
      id: t.id,
      position: t.position,
      task_key: t.task_key,
      title: t.title,
      description: t.description ?? null,
      role_key: t.role_key,
      role_name: roleName.get(t.role_key) ?? null,
      party: t.party,
      visibility: t.visibility,
      offset_basis: t.offset_basis,
      offset_days: t.offset_days,
      duration_days: t.duration_days,
      is_optional: t.is_optional,
      include_when: (t.include_when ?? null) as JsonValue,
      condition_keys: conditionKeys,
      unknown_condition_keys: conditionKeys.filter((k) => !questionKeys.has(k)),
      depends_on_keys: (t.depends_on_keys ?? []) as string[],
    };
    const stageTasks = tasksByStage.get(t.template_stage_id);
    if (stageTasks) stageTasks.push(row);
    else tasksByStage.set(t.template_stage_id, [row]);
    return row;
  });

  const stageRows: TemplateStageDetail[] = (stages ?? []).map((s: any) => ({
    id: s.id,
    position: s.position,
    stage_key: s.stage_key,
    name: s.name,
    phase: s.phase,
    purpose: s.purpose ?? null,
    gate_mode: s.gate_mode,
    target_duration_days: s.target_duration_days ?? null,
    tasks: (tasksByStage.get(s.id) ?? []).sort((a, b) => a.position - b.position),
  }));

  const questionRows: ScopingQuestionDetail[] = (questions ?? []).map((q: any) => ({
    id: q.id,
    position: q.position,
    key: q.key,
    prompt: q.prompt,
    kind: q.kind,
    options: (q.options ?? null) as JsonValue,
    required: q.required,
    used_by_task_keys: taskRows
      .filter((t) => t.condition_keys.includes(q.key))
      .map((t) => t.task_key),
  }));

  const siblingRows: TemplateVersionLink[] = (siblings ?? []).map((s: any) => ({
    id: s.id,
    version: s.version,
    status: s.status,
  }));
  const linkTo = (id: string | null) => siblingRows.find((s) => s.id === id) ?? null;

  const summary: TemplateVersionSummary = {
    id: template.id,
    key: template.key,
    version: template.version,
    name: template.name,
    journey_type: template.journey_type,
    status: template.status,
    description: template.description ?? null,
    version_note: template.version_note ?? null,
    published_at: template.published_at ?? null,
    supersedes_id: template.supersedes_id ?? null,
    superseded_by_id: template.superseded_by_id ?? null,
    is_live: template.status === "published" && !template.superseded_by_id,
    stage_count: stageRows.length,
    task_count: taskRows.length,
    conditional_task_count: taskRows.filter((t) => t.condition_keys.length > 0).length,
    question_count: questionRows.length,
    implementation_count: (impls ?? []).length,
  };

  return {
    flagOn: true,
    detail: {
      template: summary,
      stages: stageRows,
      questions: questionRows,
      roles: (roles ?? []).map((r: any) => ({ key: r.key, name: r.name, party: r.party })),
      siblings: siblingRows,
      supersedes: linkTo(template.supersedes_id ?? null),
      superseded_by: linkTo(template.superseded_by_id ?? null),
    },
  };
}

/* ========================================================================= */
/* WRITE                                                                     */
/*                                                                           */
/* Every function below is called only from a manage-level server function   */
/* (templates.functions.ts holds that check). The database has the last word */
/* twice over — the frozen trigger on published content, and the deferrable  */
/* position constraints that make a whole reorder legal in one statement —   */
/* but a raise from a trigger is not an error an author can act on, so the   */
/* readable version is produced here, before the write is attempted.         */
/* ========================================================================= */

interface TemplateRow {
  id: string;
  org_id: string;
  key: string;
  version: number;
  name: string;
  journey_type: string;
  status: "draft" | "published" | "archived";
  description: string | null;
  default_for: JsonValue;
}

const TEMPLATE_COLUMNS =
  "id, org_id, key, version, name, journey_type, status, description, default_for";

/**
 * The flag gates writing as well as reading. It is not authorization (that is
 * the manage-role check in templates.functions.ts); it just keeps the whole
 * surface consistently dark in an environment where the feature is off.
 */
async function requireFlagOn(): Promise<void> {
  if (!(await isFlagOn(FLAG))) {
    throw new Error(
      "Journey templates are not enabled in this environment (flag: journey_templates).",
    );
  }
}

async function loadTemplateRow(templateId: string): Promise<TemplateRow | null> {
  const { data } = await db()
    .from("journey_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("id", templateId)
    .maybeSingle();
  return (data ?? null) as TemplateRow | null;
}

/** The one sentence an author needs when they aimed a write at frozen content. */
function frozenMessage(row: TemplateRow): string {
  return (
    `${row.key} v${row.version} is ${row.status} and its content is frozen — live implementations ` +
    `pin this exact version. Publish a new version instead: open the live version, choose "New ` +
    `version", edit the draft copy, then publish it.`
  );
}

/**
 * The gate every content write goes through. The frozen trigger is the
 * backstop; this is the explanation.
 */
async function requireDraft(templateId: string): Promise<TemplateRow> {
  await requireFlagOn();
  const row = await loadTemplateRow(templateId);
  if (!row) throw new Error("That journey template version no longer exists.");
  if (row.status !== "draft") throw new Error(frozenMessage(row));
  return row;
}

function duplicateKeyMessage(error: { code?: string; message: string }, what: string): string {
  if (error.code === "23505") return `A ${what} with that key already exists on this version.`;
  return error.message;
}

/* ---------- Families and versions ---------- */

export interface NewTemplateInput {
  key: string;
  name: string;
  journey_type: JourneyType;
  description?: string | null;
}

/** A brand-new family: key + v1, always a draft. */
export async function createTemplateFamily(
  input: NewTemplateInput,
  actorId: string,
): Promise<{ templateId: string }> {
  await requireFlagOn();
  const key = input.key.trim();

  const { data: existing } = await db()
    .from("journey_templates")
    .select("id, version")
    .eq("key", key)
    .limit(1);
  if ((existing ?? []).length > 0) {
    throw new Error(
      `A template family with the key "${key}" already exists. Open it and create a new version instead of a second family.`,
    );
  }

  const { data, error } = await db()
    .from("journey_templates")
    .insert({
      key,
      version: 1,
      name: input.name.trim(),
      journey_type: input.journey_type,
      description: input.description?.trim() || null,
      status: "draft",
      created_by: actorId,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create the template: ${error.message}`);

  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "template.family_created",
    entity_type: "journey_template",
    entity_id: data.id,
    payload: { key, journey_type: input.journey_type },
  });
  return { templateId: data.id };
}

/**
 * A new DRAFT version of an existing family: a deep copy of `sourceTemplateId`
 * (normally the live version) into a fresh row at version N+1.
 *
 * `stage_key` and `task_key` carry over untouched — they are the identity that
 * spans versions, so drift matching, `depends_on_keys` and every `include_when`
 * clause keep meaning the same thing in the copy. Only the uuids change, and
 * each task is re-pointed at the COPY of its own stage by matching stage_key.
 *
 * PostgREST gives no transaction, so a failure part-way deletes the new draft
 * row; the FK cascades take its children with it, leaving nothing half-copied.
 */
export async function createDraftVersion(
  sourceTemplateId: string,
  actorId: string,
): Promise<{ templateId: string }> {
  await requireFlagOn();
  const source = await loadTemplateRow(sourceTemplateId);
  if (!source) throw new Error("That journey template version no longer exists.");

  const { data: family } = await db()
    .from("journey_templates")
    .select("id, version, status")
    .eq("org_id", source.org_id)
    .eq("key", source.key)
    .order("version", { ascending: false });
  const versions = (family ?? []) as Array<{ id: string; version: number; status: string }>;

  const openDraft = versions.find((v) => v.status === "draft");
  if (openDraft) {
    throw new Error(
      `${source.key} already has an unpublished draft (v${openDraft.version}). Edit and publish that one instead of starting a second draft.`,
    );
  }
  const nextVersion = (versions[0]?.version ?? source.version) + 1;

  const [{ data: stages }, { data: tasks }, { data: questions }] = await Promise.all([
    db()
      .from("journey_template_stages")
      .select("*")
      .eq("template_id", sourceTemplateId)
      .order("position"),
    db()
      .from("journey_template_tasks")
      .select("*")
      .eq("template_id", sourceTemplateId)
      .order("position"),
    db()
      .from("scoping_questions")
      .select("*")
      .eq("template_id", sourceTemplateId)
      .order("position"),
  ]);

  const { data: draft, error: draftError } = await db()
    .from("journey_templates")
    .insert({
      org_id: source.org_id,
      key: source.key,
      version: nextVersion,
      name: source.name,
      journey_type: source.journey_type,
      description: source.description,
      default_for: source.default_for,
      status: "draft",
      created_by: actorId,
    })
    .select("id")
    .single();
  if (draftError) {
    throw new Error(`Could not start a new version of ${source.key}: ${draftError.message}`);
  }
  const draftId = draft.id as string;
  const target = { templateId: draftId, orgId: source.org_id };

  try {
    const sourceStages = (stages ?? []) as SourceStageRow[];
    let stageIdByOldId = new Map<string, string>();

    if (sourceStages.length > 0) {
      const { data: copiedStages, error: stageError } = await db()
        .from("journey_template_stages")
        .insert(copyStageRows(sourceStages, target))
        .select("id, stage_key");
      if (stageError) throw new Error(stageError.message);
      stageIdByOldId = mapStageIdsByKey(sourceStages, copiedStages ?? []);
    }

    const sourceTasks = (tasks ?? []) as SourceTaskRow[];
    if (sourceTasks.length > 0) {
      const { error: taskError } = await db()
        .from("journey_template_tasks")
        .insert(copyTaskRows(sourceTasks, target, stageIdByOldId));
      if (taskError) throw new Error(taskError.message);
    }

    const sourceQuestions = (questions ?? []) as SourceQuestionRow[];
    if (sourceQuestions.length > 0) {
      const { error: questionError } = await db()
        .from("scoping_questions")
        .insert(copyQuestionRows(sourceQuestions, target));
      if (questionError) throw new Error(questionError.message);
    }
  } catch (e) {
    await db().from("journey_templates").delete().eq("id", draftId);
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`Could not copy ${source.key} v${source.version} into a new draft: ${detail}`);
  }

  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "template.version_created",
    entity_type: "journey_template",
    entity_id: draftId,
    payload: {
      key: source.key,
      version: nextVersion,
      copied_from: sourceTemplateId,
      stages: (stages ?? []).length,
      tasks: (tasks ?? []).length,
      questions: (questions ?? []).length,
    },
  });
  return { templateId: draftId };
}

export interface TemplateMetadataPatch {
  name: string;
  journey_type: JourneyType;
  description: string | null;
  version_note: string | null;
}

export async function updateDraftMetadata(
  templateId: string,
  patch: TemplateMetadataPatch,
  actorId: string,
): Promise<void> {
  await requireDraft(templateId);
  const { error } = await db()
    .from("journey_templates")
    .update({
      name: patch.name.trim(),
      journey_type: patch.journey_type,
      description: patch.description?.trim() || null,
      version_note: patch.version_note?.trim() || null,
    })
    .eq("id", templateId);
  if (error) throw new Error(`Could not save this draft: ${error.message}`);

  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "template.updated",
    entity_type: "journey_template",
    entity_id: templateId,
  });
}

/** Publishes through the RPC, which also supersedes the outgoing live version. */
export async function publishDraft(
  templateId: string,
  note: string | null,
  actorId: string,
): Promise<{ templateId: string }> {
  const draft = await requireDraft(templateId);

  const { data: stages } = await db()
    .from("journey_template_stages")
    .select("id")
    .eq("template_id", templateId)
    .limit(1);
  if ((stages ?? []).length === 0) {
    throw new Error(
      `${draft.key} v${draft.version} has no stages yet. Add at least one stage before publishing.`,
    );
  }

  const { error } = await db().rpc("publish_template", {
    draft_id: templateId,
    note: note?.trim() || null,
    actor_id: actorId,
  });
  if (error) throw new Error(`Could not publish ${draft.key} v${draft.version}: ${error.message}`);

  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "template.published",
    entity_type: "journey_template",
    entity_id: templateId,
    payload: { key: draft.key, version: draft.version, note: note ?? null },
  });
  return { templateId };
}

/* ---------- Stages ---------- */

export interface StagePatch {
  stage_key: string;
  name: string;
  phase: StagePhase;
  purpose: string | null;
  gate_mode: GateMode;
  target_duration_days: number | null;
}

export async function saveDraftStage(
  templateId: string,
  stageId: string | null,
  patch: StagePatch,
  actorId: string,
): Promise<{ stageId: string }> {
  await requireDraft(templateId);
  const values = {
    stage_key: patch.stage_key.trim(),
    name: patch.name.trim(),
    phase: patch.phase,
    purpose: patch.purpose?.trim() || null,
    gate_mode: patch.gate_mode,
    target_duration_days: patch.target_duration_days,
  };

  if (stageId) {
    const { data, error } = await db()
      .from("journey_template_stages")
      .update(values)
      .eq("id", stageId)
      .eq("template_id", templateId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Could not save the stage: ${duplicateKeyMessage(error, "stage")}`);
    if (!data) throw new Error("That stage is not part of this template version.");
    await audit({
      actor_type: "user",
      actor_id: actorId,
      action: "template.stage_saved",
      entity_type: "journey_template_stage",
      entity_id: stageId,
      payload: { template_id: templateId, stage_key: values.stage_key },
    });
    return { stageId };
  }

  const { data: existing } = await db()
    .from("journey_template_stages")
    .select("position")
    .eq("template_id", templateId);
  const { data, error } = await db()
    .from("journey_template_stages")
    .insert({ ...values, template_id: templateId, position: nextPosition(existing ?? []) })
    .select("id")
    .single();
  if (error) throw new Error(`Could not add the stage: ${duplicateKeyMessage(error, "stage")}`);

  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "template.stage_added",
    entity_type: "journey_template_stage",
    entity_id: data.id,
    payload: { template_id: templateId, stage_key: values.stage_key },
  });
  return { stageId: data.id };
}

export async function deleteDraftStage(
  templateId: string,
  stageId: string,
  actorId: string,
): Promise<void> {
  await requireDraft(templateId);
  // The FK cascade takes the stage's tasks with it; the frozen trigger fires
  // on those deletes too, and passes for the same reason this one does.
  const { error } = await db()
    .from("journey_template_stages")
    .delete()
    .eq("id", stageId)
    .eq("template_id", templateId);
  if (error) throw new Error(`Could not delete the stage: ${error.message}`);
  await renumberStages(templateId);

  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "template.stage_deleted",
    entity_type: "journey_template_stage",
    entity_id: stageId,
    payload: { template_id: templateId },
  });
}

/* ---------- Tasks ---------- */

export interface TaskPatch {
  template_stage_id: string;
  task_key: string;
  title: string;
  description: string | null;
  role_key: string;
  party: Party;
  visibility: Visibility;
  offset_basis: OffsetBasis;
  offset_days: number;
  duration_days: number;
  is_optional: boolean;
  include_when: JsonValue;
  depends_on_keys: string[];
}

async function requireStageOf(templateId: string, stageId: string): Promise<void> {
  const { data } = await db()
    .from("journey_template_stages")
    .select("id")
    .eq("id", stageId)
    .eq("template_id", templateId)
    .maybeSingle();
  if (!data) throw new Error("That stage is not part of this template version.");
}

export async function saveDraftTask(
  templateId: string,
  taskId: string | null,
  patch: TaskPatch,
  actorId: string,
): Promise<{ taskId: string }> {
  await requireDraft(templateId);
  await requireStageOf(templateId, patch.template_stage_id);

  const values = {
    template_stage_id: patch.template_stage_id,
    task_key: patch.task_key.trim(),
    title: patch.title.trim(),
    description: patch.description?.trim() || null,
    role_key: patch.role_key,
    party: patch.party,
    visibility: patch.visibility,
    offset_basis: patch.offset_basis,
    offset_days: patch.offset_days,
    duration_days: patch.duration_days,
    is_optional: patch.is_optional,
    include_when: patch.include_when ?? null,
    depends_on_keys: patch.depends_on_keys,
  };

  const { data: siblings } = await db()
    .from("journey_template_tasks")
    .select("id, position")
    .eq("template_stage_id", patch.template_stage_id);

  if (taskId) {
    const { data: current } = await db()
      .from("journey_template_tasks")
      .select("id, template_stage_id, position")
      .eq("id", taskId)
      .eq("template_id", templateId)
      .maybeSingle();
    if (!current) throw new Error("That task is not part of this template version.");

    // Moved to another stage: it has to land at the end of the new one, since
    // its old position may already be taken there.
    const movedStage = current.template_stage_id !== patch.template_stage_id;
    const position = movedStage ? nextPosition(siblings ?? []) : current.position;

    const { error } = await db()
      .from("journey_template_tasks")
      .update({ ...values, position })
      .eq("id", taskId)
      .eq("template_id", templateId);
    if (error) throw new Error(`Could not save the task: ${duplicateKeyMessage(error, "task")}`);
    if (movedStage) await renumberTasks(current.template_stage_id);

    await audit({
      actor_type: "user",
      actor_id: actorId,
      action: "template.task_saved",
      entity_type: "journey_template_task",
      entity_id: taskId,
      payload: { template_id: templateId, task_key: values.task_key },
    });
    return { taskId };
  }

  const { data, error } = await db()
    .from("journey_template_tasks")
    .insert({ ...values, template_id: templateId, position: nextPosition(siblings ?? []) })
    .select("id")
    .single();
  if (error) throw new Error(`Could not add the task: ${duplicateKeyMessage(error, "task")}`);

  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "template.task_added",
    entity_type: "journey_template_task",
    entity_id: data.id,
    payload: { template_id: templateId, task_key: values.task_key },
  });
  return { taskId: data.id };
}

export async function deleteDraftTask(
  templateId: string,
  taskId: string,
  actorId: string,
): Promise<void> {
  await requireDraft(templateId);
  const { data: task } = await db()
    .from("journey_template_tasks")
    .select("id, template_stage_id")
    .eq("id", taskId)
    .eq("template_id", templateId)
    .maybeSingle();
  if (!task) throw new Error("That task is not part of this template version.");

  const { error } = await db()
    .from("journey_template_tasks")
    .delete()
    .eq("id", taskId)
    .eq("template_id", templateId);
  if (error) throw new Error(`Could not delete the task: ${error.message}`);
  await renumberTasks(task.template_stage_id);

  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "template.task_deleted",
    entity_type: "journey_template_task",
    entity_id: taskId,
    payload: { template_id: templateId },
  });
}

/* ---------- Scoping questions ---------- */

export interface QuestionPatch {
  key: string;
  prompt: string;
  kind: QuestionKind;
  options: JsonValue;
  required: boolean;
}

export async function saveDraftQuestion(
  templateId: string,
  questionId: string | null,
  patch: QuestionPatch,
  actorId: string,
): Promise<{ questionId: string }> {
  await requireDraft(templateId);
  const values = {
    key: patch.key.trim(),
    prompt: patch.prompt.trim(),
    kind: patch.kind,
    options: patch.options ?? null,
    required: patch.required,
  };

  if (questionId) {
    const { data, error } = await db()
      .from("scoping_questions")
      .update(values)
      .eq("id", questionId)
      .eq("template_id", templateId)
      .select("id")
      .maybeSingle();
    if (error) {
      throw new Error(`Could not save the question: ${duplicateKeyMessage(error, "question")}`);
    }
    if (!data) throw new Error("That question is not part of this template version.");
    await audit({
      actor_type: "user",
      actor_id: actorId,
      action: "template.question_saved",
      entity_type: "scoping_question",
      entity_id: questionId,
      payload: { template_id: templateId, key: values.key },
    });
    return { questionId };
  }

  const { data: existing } = await db()
    .from("scoping_questions")
    .select("position")
    .eq("template_id", templateId);
  const { data, error } = await db()
    .from("scoping_questions")
    .insert({ ...values, template_id: templateId, position: nextPosition(existing ?? []) })
    .select("id")
    .single();
  if (error)
    throw new Error(`Could not add the question: ${duplicateKeyMessage(error, "question")}`);

  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "template.question_added",
    entity_type: "scoping_question",
    entity_id: data.id,
    payload: { template_id: templateId, key: values.key },
  });
  return { questionId: data.id };
}

export async function deleteDraftQuestion(
  templateId: string,
  questionId: string,
  actorId: string,
): Promise<void> {
  await requireDraft(templateId);
  const { error } = await db()
    .from("scoping_questions")
    .delete()
    .eq("id", questionId)
    .eq("template_id", templateId);
  if (error) throw new Error(`Could not delete the question: ${error.message}`);
  await renumberQuestions(templateId);

  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "template.question_deleted",
    entity_type: "scoping_question",
    entity_id: questionId,
    payload: { template_id: templateId },
  });
}

/* ---------- Ordering ---------- */

/**
 * Stage and task positions are renumbered by `reorder_template_positions`, in
 * ONE statement: the unique (scope, position) constraints are deferrable, so
 * the intermediate collisions inside that statement are legal. Doing it row by
 * row instead would need a temporary hole to shuffle through.
 */
async function reorderScope(
  scopeTable: "stages" | "tasks",
  scopeId: string,
  orderedIds: string[],
): Promise<void> {
  const { error } = await db().rpc("reorder_template_positions", {
    scope_table: scopeTable,
    scope_id: scopeId,
    ordered_ids: orderedIds,
  });
  if (error) throw new Error(`Could not reorder: ${error.message}`);
}

async function renumberStages(templateId: string): Promise<void> {
  const { data } = await db()
    .from("journey_template_stages")
    .select("id")
    .eq("template_id", templateId)
    .order("position");
  const ids = (data ?? []).map((row: any) => row.id as string);
  if (ids.length > 0) await reorderScope("stages", templateId, ids);
}

async function renumberTasks(stageId: string): Promise<void> {
  const { data } = await db()
    .from("journey_template_tasks")
    .select("id")
    .eq("template_stage_id", stageId)
    .order("position");
  const ids = (data ?? []).map((row: any) => row.id as string);
  if (ids.length > 0) await reorderScope("tasks", stageId, ids);
}

/** Questions have no positional unique constraint, so a plain pass suffices. */
async function renumberQuestions(templateId: string): Promise<void> {
  const { data } = await db()
    .from("scoping_questions")
    .select("id, position")
    .eq("template_id", templateId)
    .order("position");
  let position = 1;
  for (const row of (data ?? []) as Array<{ id: string; position: number }>) {
    if (row.position !== position) {
      await db().from("scoping_questions").update({ position }).eq("id", row.id);
    }
    position += 1;
  }
}

export async function reorderDraftStages(
  templateId: string,
  orderedIds: string[],
  actorId: string,
): Promise<void> {
  await requireDraft(templateId);
  const { data } = await db()
    .from("journey_template_stages")
    .select("id")
    .eq("template_id", templateId);
  const existing = (data ?? []).map((row: any) => row.id as string);
  if (!isSameIdSet(existing, orderedIds)) {
    throw new Error("That reorder does not match this version's stages — reload and try again.");
  }
  await reorderScope("stages", templateId, orderedIds);

  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "template.stages_reordered",
    entity_type: "journey_template",
    entity_id: templateId,
  });
}

export async function reorderDraftTasks(
  templateId: string,
  stageId: string,
  orderedIds: string[],
  actorId: string,
): Promise<void> {
  await requireDraft(templateId);
  await requireStageOf(templateId, stageId);
  const { data } = await db()
    .from("journey_template_tasks")
    .select("id")
    .eq("template_stage_id", stageId);
  const existing = (data ?? []).map((row: any) => row.id as string);
  if (!isSameIdSet(existing, orderedIds)) {
    throw new Error("That reorder does not match this stage's tasks — reload and try again.");
  }
  await reorderScope("tasks", stageId, orderedIds);

  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "template.tasks_reordered",
    entity_type: "journey_template_stage",
    entity_id: stageId,
    payload: { template_id: templateId },
  });
}

export async function reorderDraftQuestions(
  templateId: string,
  orderedIds: string[],
  actorId: string,
): Promise<void> {
  await requireDraft(templateId);
  const { data } = await db().from("scoping_questions").select("id").eq("template_id", templateId);
  const existing = (data ?? []).map((row: any) => row.id as string);
  if (!isSameIdSet(existing, orderedIds)) {
    throw new Error("That reorder does not match this version's questions — reload and try again.");
  }
  let position = 1;
  for (const id of orderedIds) {
    await db().from("scoping_questions").update({ position }).eq("id", id);
    position += 1;
  }

  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "template.questions_reordered",
    entity_type: "journey_template",
    entity_id: templateId,
  });
}
