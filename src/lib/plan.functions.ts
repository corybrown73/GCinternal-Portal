import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/** Read the templated plan for one implementation. Internal-only. */
export const getPlan = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ implementationId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { loadPlan } = await import("./plan.server");
    return loadPlan(data.implementationId);
  });

export const setTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        workItemId: z.string().uuid(),
        status: z.enum(["not_started", "in_progress", "waiting", "blocked", "done", "skipped"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { setWorkItemStatus } = await import("./plan.server");
    return setWorkItemStatus({
      workItemId: data.workItemId,
      status: data.status,
      actorProfileId: context.profile.id,
    });
  });
