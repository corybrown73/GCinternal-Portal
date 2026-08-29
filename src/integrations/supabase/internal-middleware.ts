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
