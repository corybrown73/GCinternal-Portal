import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";

/**
 * Server-side internal-role gate. Composes the JWT check with a
 * portal_profiles role lookup so a customer-role login can never invoke an
 * internal server function — whatever the client-side AuthGate renders.
 * Handlers receive `context.profile` (id, email, full_name, role) in
 * addition to requireSupabaseAuth's context.
 */
export const requireInternalAuth = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    // Dynamic import: portal.server pulls in the service-role client and must
    // never reach the client bundle through this module's import graph.
    const { requireInternal } = await import("@/lib/portal.server");
    const profile = await requireInternal(context.userId);
    return next({ context: { profile } });
  });

/**
 * Deal writes. Today every internal role may edit a deal, so this is the
 * same gate as requireInternalAuth with the rule named — when the rule
 * changes in canEditDeal, every write picks it up. The point is that the
 * server holds the rule, not only the buttons.
 */
export const requireDealEditor = createMiddleware({ type: "function" })
  .middleware([requireInternalAuth])
  .server(async ({ next, context }) => {
    const { canEditDeal } = await import("@/lib/auth");
    if (!canEditDeal(context.profile.role as import("@/lib/auth").PortalRole)) {
      throw new Error("Forbidden: your role can read deals but not change them");
    }
    return next();
  });

/** Manager-only writes: assigning somebody else, bulk import, forcing past a gate. */
export const requireManager = createMiddleware({ type: "function" })
  .middleware([requireInternalAuth])
  .server(async ({ next, context }) => {
    const { canManage } = await import("@/lib/auth");
    if (!canManage(context.profile.role as import("@/lib/auth").PortalRole)) {
      throw new Error("Forbidden: only a manager or admin can do that");
    }
    return next();
  });
