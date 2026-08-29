import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import type { JsonValue } from "./journey-conditions";
import {
  GATE_MODES,
  JOURNEY_TYPES,
  OFFSET_BASES,
  PARTIES,
  QUESTION_KINDS,
  STAGE_PHASES,
  TEMPLATE_KEY_PATTERN,
  VISIBILITIES,
} from "./template-draft";

/* ------------------------------------------------------------------------- */
/* Journey template browser + builder.                                        */
/*                                                                            */
/* AUTHORIZATION, two levels:                                                 */
/*  - READ: requireInternalAuth. A customer-role login can never reach        */
/*    template content, whatever the client renders.                          */
/*  - WRITE: internal AND manage-level (admin / super_admin / manager), via   */
/*    the explicit assertCanManage(context.profile) below. The middleware     */
/*    puts the caller's portal profile on context.profile; this is the real   */
/*    gate — the page's canManage() check only hides dead buttons.            */
/*                                                                            */
/* The `journey_templates` feature flag is a separate, softer gate applied    */
/* inside templates.server.ts: with it off the reads return `flagOn: false`   */
/* and no content instead of throwing, so the page can explain itself.        */
/* ------------------------------------------------------------------------- */

const MANAGE_ROLES = ["admin", "super_admin", "manager"];

/** Every write goes through this. Reads deliberately do not. */
function assertCanManage(profile: { role: string }): void {
  if (!MANAGE_ROLES.includes(profile.role)) {
    throw new Error(
      "Forbidden: journey templates can only be edited by an admin, super admin or manager.",
    );
  }
}

/* ---------- Shared validators ---------- */

const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

/**
 * `include_when` must be an OBJECT keyed by scoping-question key, or null.
 * The evaluator reads a scalar or an array as "no condition at all", so
 * accepting one here would silently turn a conditional task unconditional.
 */
const includeWhen = z.record(z.string(), jsonValue).nullable();

const templateId = z.string().uuid();
const contentKey = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(
    TEMPLATE_KEY_PATTERN,
    "A key is lowercase letters, digits, underscores and dashes — it is the identity that spans versions.",
  );

/* ========================================================================= */
/* Reads — internal only                                                     */
/* ========================================================================= */

export const getTemplateFamilies = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadTemplateFamilies } = await import("./templates.server");
    return loadTemplateFamilies();
  });

export const getTemplateVersion = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ templateId }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data }) => {
    const { loadTemplateVersion } = await import("./templates.server");
    return loadTemplateVersion(data.templateId);
  });

/* ========================================================================= */
/* Writes — internal AND manage-level                                        */
/* ========================================================================= */

export const createTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        key: contentKey,
        name: z.string().trim().min(2).max(120),
        journey_type: z.enum(JOURNEY_TYPES),
        description: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { createTemplateFamily } = await import("./templates.server");
    return createTemplateFamily(
      {
        key: data.key,
        name: data.name,
        journey_type: data.journey_type,
        description: data.description ?? null,
      },
      context.profile.id,
    );
  });

export const createTemplateVersion = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ sourceTemplateId: templateId }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { createDraftVersion } = await import("./templates.server");
    return createDraftVersion(data.sourceTemplateId, context.profile.id);
  });

export const saveTemplateMetadata = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        templateId,
        name: z.string().trim().min(2).max(120),
        journey_type: z.enum(JOURNEY_TYPES),
        description: z.string().trim().max(1000).nullable().optional(),
        version_note: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { updateDraftMetadata } = await import("./templates.server");
    await updateDraftMetadata(
      data.templateId,
      {
        name: data.name,
        journey_type: data.journey_type,
        description: data.description ?? null,
        version_note: data.version_note ?? null,
      },
      context.profile.id,
    );
    return { ok: true };
  });

export const publishTemplateVersion = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ templateId, note: z.string().trim().max(1000).nullable().optional() }).parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { publishDraft } = await import("./templates.server");
    return publishDraft(data.templateId, data.note ?? null, context.profile.id);
  });

/* ---------- Stages ---------- */

export const saveTemplateStage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        templateId,
        stageId: z.string().uuid().nullable().optional(),
        stage_key: contentKey,
        name: z.string().trim().min(2).max(120),
        phase: z.enum(STAGE_PHASES),
        purpose: z.string().trim().max(1000).nullable().optional(),
        gate_mode: z.enum(GATE_MODES),
        target_duration_days: z.number().int().min(0).max(3650).nullable().optional(),
      })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { saveDraftStage } = await import("./templates.server");
    return saveDraftStage(
      data.templateId,
      data.stageId ?? null,
      {
        stage_key: data.stage_key,
        name: data.name,
        phase: data.phase,
        purpose: data.purpose ?? null,
        gate_mode: data.gate_mode,
        target_duration_days: data.target_duration_days ?? null,
      },
      context.profile.id,
    );
  });

export const removeTemplateStage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ templateId, stageId: z.string().uuid() }).parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { deleteDraftStage } = await import("./templates.server");
    await deleteDraftStage(data.templateId, data.stageId, context.profile.id);
    return { ok: true };
  });

/* ---------- Tasks ---------- */

export const saveTemplateTask = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        templateId,
        taskId: z.string().uuid().nullable().optional(),
        template_stage_id: z.string().uuid(),
        task_key: contentKey,
        title: z.string().trim().min(2).max(200),
        description: z.string().trim().max(2000).nullable().optional(),
        role_key: z.string().trim().min(1).max(80),
        party: z.enum(PARTIES),
        visibility: z.enum(VISIBILITIES),
        offset_basis: z.enum(OFFSET_BASES),
        offset_days: z.number().int().min(-3650).max(3650),
        duration_days: z.number().int().min(0).max(3650),
        is_optional: z.boolean(),
        include_when: includeWhen,
        depends_on_keys: z.array(contentKey).max(50),
      })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { saveDraftTask } = await import("./templates.server");
    return saveDraftTask(
      data.templateId,
      data.taskId ?? null,
      {
        template_stage_id: data.template_stage_id,
        task_key: data.task_key,
        title: data.title,
        description: data.description ?? null,
        role_key: data.role_key,
        party: data.party,
        visibility: data.visibility,
        offset_basis: data.offset_basis,
        offset_days: data.offset_days,
        duration_days: data.duration_days,
        is_optional: data.is_optional,
        include_when: data.include_when,
        depends_on_keys: data.depends_on_keys,
      },
      context.profile.id,
    );
  });

export const removeTemplateTask = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ templateId, taskId: z.string().uuid() }).parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { deleteDraftTask } = await import("./templates.server");
    await deleteDraftTask(data.templateId, data.taskId, context.profile.id);
    return { ok: true };
  });

/* ---------- Scoping questions ---------- */

export const saveTemplateQuestion = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        templateId,
        questionId: z.string().uuid().nullable().optional(),
        key: contentKey,
        prompt: z.string().trim().min(2).max(500),
        kind: z.enum(QUESTION_KINDS),
        options: z.array(jsonValue).nullable().optional(),
        required: z.boolean(),
      })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { saveDraftQuestion } = await import("./templates.server");
    return saveDraftQuestion(
      data.templateId,
      data.questionId ?? null,
      {
        key: data.key,
        prompt: data.prompt,
        kind: data.kind,
        options: data.options ?? null,
        required: data.required,
      },
      context.profile.id,
    );
  });

export const removeTemplateQuestion = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ templateId, questionId: z.string().uuid() }).parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { deleteDraftQuestion } = await import("./templates.server");
    await deleteDraftQuestion(data.templateId, data.questionId, context.profile.id);
    return { ok: true };
  });

/* ---------- Ordering ---------- */

const orderedIds = z.array(z.string().uuid()).min(1).max(500);

export const reorderTemplateStages = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ templateId, orderedIds }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { reorderDraftStages } = await import("./templates.server");
    await reorderDraftStages(data.templateId, data.orderedIds, context.profile.id);
    return { ok: true };
  });

export const reorderTemplateTasks = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ templateId, stageId: z.string().uuid(), orderedIds }).parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { reorderDraftTasks } = await import("./templates.server");
    await reorderDraftTasks(data.templateId, data.stageId, data.orderedIds, context.profile.id);
    return { ok: true };
  });

export const reorderTemplateQuestions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ templateId, orderedIds }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { reorderDraftQuestions } = await import("./templates.server");
    await reorderDraftQuestions(data.templateId, data.orderedIds, context.profile.id);
    return { ok: true };
  });
