import { createServerFn } from "@tanstack/react-start";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/** Time to value and the stage timings, for the Reports page. */
export const getTtvReport = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadTtvReport } = await import("./ttv-report.server");
    return loadTtvReport();
  });
