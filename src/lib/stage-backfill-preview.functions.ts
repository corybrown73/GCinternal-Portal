import { createServerFn } from "@tanstack/react-start";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/**
 * READ only, same bar as the template browser (templates.functions.ts):
 * requireInternalAuth — a customer-role login can never reach this. There is
 * no write counterpart: loadStageBackfillPreview() issues no insert, update,
 * delete, or rpc call, by design (see stage-backfill-preview.server.ts).
 */
export const getStageBackfillPreview = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadStageBackfillPreview } = await import("./stage-backfill-preview.server");
    return loadStageBackfillPreview();
  });
