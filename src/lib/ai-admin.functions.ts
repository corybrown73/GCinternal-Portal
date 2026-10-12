import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { AI_EFFORTS } from "./server/ai/config";

/**
 * Server functions for the AI tab of /admin/integrations. The role check
 * (manager reads and the flag, admin the effort) is in ai-admin.server.ts,
 * where the service-role queries run.
 */

const uuid = z.string().uuid();

export const getAiStatusFn = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async ({ context }) => {
    const { getAiStatus } = await import("./ai-admin.server");
    return getAiStatus(context.profile.id);
  });

export const listAiJobsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ limit: z.number().int().positive().max(200).optional() }).parse(data ?? {}),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { listAiJobsForAdmin } = await import("./ai-admin.server");
    return listAiJobsForAdmin(context.profile.id, data.limit ?? 50);
  });

export const rerunAiJobFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ jobId: uuid }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { rerunAiJob } = await import("./ai-admin.server");
    return rerunAiJob(context.profile.id, data.jobId);
  });

export const setAiEffortFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ effort: z.enum(AI_EFFORTS) }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { setAiEffort } = await import("./ai-admin.server");
    return setAiEffort(context.profile.id, data.effort);
  });

export const setAiAutoReadFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ enabled: z.boolean() }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { setAiAutoRead } = await import("./ai-admin.server");
    return setAiAutoRead(context.profile.id, data.enabled);
  });
