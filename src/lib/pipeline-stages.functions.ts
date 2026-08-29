import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { PIPELINE_STAGE_KEY_PATTERN, STAGE_COLORS } from "./pipeline-stages";

/* ------------------------------------------------------------------------- */
/* Pre-sale pipeline stage configuration.                                     */
/*                                                                            */
/* AUTHORIZATION, two levels — the templates.functions.ts pattern:            */
/*  - READ: requireInternalAuth. A customer-role login can never see the      */
/*    admin view, whatever the client renders.                                */
/*  - WRITE: internal AND manage-level, via the explicit                      */
/*    assertCanManage(context.profile) below. The /admin layout's client-side */
/*    super-admin gate only hides dead buttons; this is the real one.         */
/*                                                                            */
/* The `presale_stage_config` flag is a separate, softer gate applied inside  */
/* pipeline-stages.server.ts: reads fall back to the built-in stages, writes  */
/* refuse with an explanation, and neither touches 0028's table. That is a    */
/* schema-presence check, not an authorization one — authorization is never   */
/* flag-gated (0011's header).                                                */
/* ------------------------------------------------------------------------- */

const MANAGE_ROLES = ["admin", "super_admin", "manager"];

function assertCanManage(profile: { role: string }): void {
  if (!MANAGE_ROLES.includes(profile.role)) {
    throw new Error(
      "Forbidden: the pipeline stages can only be edited by an admin, super admin or manager.",
    );
  }
}

const stageKey = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    PIPELINE_STAGE_KEY_PATTERN,
    "A stage key is 2–40 lowercase letters, digits and underscores, starting with a letter.",
  );
const stageLabel = z.string().trim().min(1, "A stage needs a label").max(60);
const stageColor = z.enum(STAGE_COLORS);

/* ---------- read ---------- */

/** The board and the deal record read this: just the ordered stages. */
export const getPipelineStages = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadPipelineStages } = await import("./pipeline-stages.server");
    return loadPipelineStages();
  });

/** The admin page reads this: the stages plus what would block a delete. */
export const getPipelineStageAdminView = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadPipelineStageAdminView } = await import("./pipeline-stages.server");
    return loadPipelineStageAdminView();
  });

/* ---------- writes — internal AND manage-level ---------- */

export const addPipelineStage = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ key: stageKey, label: stageLabel, color: stageColor }).parse(data),
  )
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { createPipelineStage } = await import("./pipeline-stages.server");
    return createPipelineStage(context.profile.id, data);
  });

export const editPipelineStage = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ key: stageKey, label: stageLabel, color: stageColor }).parse(data),
  )
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { updatePipelineStage } = await import("./pipeline-stages.server");
    return updatePipelineStage(context.profile.id, data);
  });

export const markPipelineStage = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ key: stageKey, mark: z.enum(["won", "terminal"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { setPipelineStageMark } = await import("./pipeline-stages.server");
    return setPipelineStageMark(context.profile.id, data);
  });

export const reorderPipelineStagesFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ keys: z.array(stageKey).min(1, "The order must list every stage") }).parse(data),
  )
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { reorderPipelineStages } = await import("./pipeline-stages.server");
    return reorderPipelineStages(context.profile.id, data.keys);
  });

export const removePipelineStage = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ key: stageKey }).parse(data))
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { deletePipelineStage } = await import("./pipeline-stages.server");
    return deletePipelineStage(context.profile.id, data.key);
  });
