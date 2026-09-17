import { createServerFn } from "@tanstack/react-start";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

export const getSetupStatusFn = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async ({ context }) => {
    const { loadSetupStatus } = await import("./setup-status.server");
    return loadSetupStatus(context.profile.id);
  });
