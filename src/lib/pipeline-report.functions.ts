import { createServerFn } from "@tanstack/react-start";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/** The pipeline report the morning email and the MCP tool read, for the Reports page. */
export const getPipelineReport = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadPipelineReport } = await import("./pipeline-report.server");
    return loadPipelineReport();
  });
