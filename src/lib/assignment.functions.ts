import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth, requireManager } from "@/integrations/supabase/internal-middleware";
import { canManage, type PortalRole } from "@/lib/auth";
import { ownerChangeFromRaw } from "@/lib/owner-change";

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
        mode: z.enum(["auto", "claim"]).optional(),
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
  .middleware([requireManager])
  .inputValidator((data: unknown) => {
    const base = z
      .object({
        dealId: z.string().uuid(),
        teamMemberId: z.string().uuid().nullable().optional(),
      })
      .parse(data);
    const ownerChange = ownerChangeFromRaw((data as { ownerChange?: unknown }).ownerChange);
    return { ...base, ownerChange };
  })
  .handler(async ({ data, context }) => {
    const { assignDeal, namedPickNeedsReasonFor } = await import("./assignment.server");
    // A named pick needs its reason only where it changes an existing implementation's
    // owner. A deal with no implementation yet is the pre-sale assignment: no reason.
    if (
      !data.ownerChange &&
      (await namedPickNeedsReasonFor(data.dealId, data.teamMemberId ?? null))
    ) {
      throw new Error("Choose why the implementation is being reassigned.");
    }
    return assignDeal({
      dealId: data.dealId,
      teamMemberId: data.teamMemberId ?? null,
      actorProfileId: context.profile.id,
      reassignment: data.ownerChange
        ? { ...data.ownerChange, actorProfileId: context.profile.id }
        : null,
    });
  });

/**
 * Take an unowned account yourself. Anyone in the pool may; the deal must
 * have no owner yet, so a claim can never quietly take a colleague's account.
 */
export const claimDealFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { claimDeal } = await import("./assignment.server");
    return claimDeal(context.profile.id, data.dealId);
  });

/**
 * Take a person off the team. Soft: `active` goes false, so every picker,
 * the pool and the owner lists stop showing them while past assignments
 * and history keep the name. Refused while they still own accounts or have
 * a login — reassign, or remove the user under Admin → Users, first.
 */
export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ teamMemberId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { removeTeamMember: remove } = await import("./assignment.server");
    return remove(data.teamMemberId);
  });
