import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { createServerFn } from "@tanstack/react-start";

/**
 * Phase 6 server functions. Read-only — there is no write side, by design.
 * Authorization is in app code (`requireInternalAuth`), as everywhere else:
 * every read runs on the service-role client, so RLS is defense-in-depth only.
 */
export const getSignals = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadSignals } = await import("./signals.server");
    return loadSignals();
  });
