import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { canManage, type PortalRole } from "@/lib/auth";

function assertCanManage(profile: { role: string }): void {
  if (!canManage(profile.role as PortalRole)) {
    throw new Error("Only a manager can change assignment");
  }
}

export const getAssignmentSettings = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadRules, loadPool, recentAssignments } = await import("./assignment.server");
    const rules = await loadRules();
    const [pool, recent] = await Promise.all([loadPool(rules), recentAssignments(30)]);
    return { rules, pool, recent };
  });

export const saveAssignmentRules = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        window_days: z.number().int().min(1).max(365),
        base_points: z.number().int().min(0).max(20),
        arr_bands: z
          .array(z.object({ min: z.number().min(0), points: z.number().int().min(0).max(20) }))
          .max(8),
        seat_bands: z
          .array(z.object({ min: z.number().min(0), points: z.number().int().min(0).max(20) }))
          .max(8),
        integration_points: z.record(z.string().regex(/^[0-5]$/), z.number().int().min(0).max(20)),
        service_points: z.number().int().min(0).max(20),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { saveRules } = await import("./assignment.server");
    return saveRules(data);
  });

export const setAssignmentPoolMember = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        teamMemberId: z.string().uuid(),
        active: z.boolean(),
        capacity: z.number().min(0.25).max(5).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { setPoolMember } = await import("./assignment.server");
    await setPoolMember(data);
    return { ok: true };
  });

export const getDealAssignment = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { dealAssignment } = await import("./assignment.server");
    return dealAssignment(data.dealId);
  });

/** Assign by rule (no member) or by hand (a member). */
export const assignDealFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        teamMemberId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assignDeal } = await import("./assignment.server");
    return assignDeal({
      dealId: data.dealId,
      teamMemberId: data.teamMemberId ?? null,
      actorProfileId: context.profile.id,
    });
  });
