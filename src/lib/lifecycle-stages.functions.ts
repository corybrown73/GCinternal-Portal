import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { LIFECYCLE_STAGE_KEY_PATTERN, STAGE_COLORS } from "./lifecycle-stages";

/* ------------------------------------------------------------------------- */
/* Post-sale lifecycle stage configuration.                                   */
/*                                                                            */
/* Same two-level authorization as the pre-sale pipeline next door:           */
/*  - READ: requireInternalAuth. A customer-role login never sees this.       */
/*  - WRITE: internal AND manage-level, via assertCanManage(context.profile). */
/*    The /admin layout's client-side gate only hides dead buttons.           */
/*                                                                            */
/* The `lifecycle_stage_config` flag is a softer, separate gate applied inside */
/* lifecycle-stages.server.ts: reads fall back to the built-in stages, writes  */
/* refuse with an explanation, and neither touches 0031's table. That is a     */
/* schema-presence check, not an authorization one.                           */
/* ------------------------------------------------------------------------- */

const MANAGE_ROLES = ["admin", "super_admin", "manager"];

function assertCanManage(profile: { role: string }): void {
  if (!MANAGE_ROLES.includes(profile.role)) {
    throw new Error(
      "Forbidden: the post-sale stages can only be edited by an admin, super admin or manager.",
    );
  }
}

const stageKey = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    LIFECYCLE_STAGE_KEY_PATTERN,
    "A stage key is 2–40 lowercase letters, digits and hyphens, starting with a letter.",
  );
const stageLabel = z.string().trim().min(1, "A stage needs a label").max(60);
const stageIntent = z.string().trim().max(400).optional();
const stageColor = z.enum(STAGE_COLORS);
const stagePhase = z.enum(["intake", "delivery", "value", "steady-state"]);

/* ---------- read ---------- */

/** Everything that renders a stage label reads this. */
export const getLifecycleStages = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadLifecycleStages } = await import("./lifecycle-stages.server");
    return loadLifecycleStages();
  });

/** The admin page reads this: the stages plus what would block a delete. */
export const getLifecycleStageAdminView = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadLifecycleStageAdminView } = await import("./lifecycle-stages.server");
    return loadLifecycleStageAdminView();
  });

/* ---------- write ---------- */

export const saveLifecycleStage = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ key: stageKey, label: stageLabel, intent: stageIntent, color: stageColor })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { updateLifecycleStage } = await import("./lifecycle-stages.server");
    return updateLifecycleStage(context.profile.id, {
      key: data.key,
      label: data.label,
      intent: data.intent ?? null,
      color: data.color,
    });
  });

export const addLifecycleStage = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        key: stageKey,
        label: stageLabel,
        intent: stageIntent,
        phase: stagePhase,
        color: stageColor,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { createLifecycleStage } = await import("./lifecycle-stages.server");
    return createLifecycleStage(context.profile.id, {
      key: data.key,
      label: data.label,
      intent: data.intent ?? null,
      phase: data.phase,
      color: data.color,
    });
  });

export const reorderLifecycleStagesFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ keys: z.array(stageKey).min(1).max(60) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { reorderLifecycleStages } = await import("./lifecycle-stages.server");
    return reorderLifecycleStages(context.profile.id, data.keys);
  });

export const removeLifecycleStage = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ key: stageKey }).parse(data))
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { deleteLifecycleStage } = await import("./lifecycle-stages.server");
    return deleteLifecycleStage(context.profile.id, data.key);
  });
