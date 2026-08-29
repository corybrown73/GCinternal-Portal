import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { handoverRecordInput } from "./handover-input";

/**
 * Phase 7 server functions: the handover record, the manual trace linker, and
 * the audit-health panel.
 *
 * All internal-only via requireInternalAuth. The handover record is deliberately
 * NOT manage-gated — the person who ran the implementation is the one who knows
 * what they handed over — while audit health is super-admin only, because it
 * reports on the security log.
 */

export const getHandover = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ implementationId: z.string().uuid() }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data }) => {
    const { loadHandover } = await import("./hygiene.server");
    return loadHandover(data.implementationId);
  });

export const saveHandoverRecord = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => handoverRecordInput.parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { saveHandover } = await import("./hygiene.server");
    return saveHandover(data, context.profile.id);
  });

export const getSolutionTrace = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ solutionId: z.string().uuid() }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data }) => {
    const { loadSolutionTrace } = await import("./hygiene.server");
    return loadSolutionTrace(data.solutionId);
  });

export const linkDecision = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ decisionId: z.string().uuid(), solutionId: z.string().uuid() }).parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { linkDecisionToSolution } = await import("./hygiene.server");
    return linkDecisionToSolution(data.decisionId, data.solutionId, context.profile.id);
  });

export const unlinkDecision = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ linkId: z.string().uuid(), solutionId: z.string().uuid() }).parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { unlinkDecisionFromSolution } = await import("./hygiene.server");
    return unlinkDecisionFromSolution(data.linkId, data.solutionId, context.profile.id);
  });

export const getAuditHealth = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async ({ context }) => {
    // Super admin only: this reports on the security log, and "which changes
    // went unrecorded" is itself sensitive.
    const { requireSuperAdmin } = await import("./presale.server");
    await requireSuperAdmin(context.userId);
    const { loadAuditHealth } = await import("./hygiene.server");
    return loadAuditHealth();
  });
