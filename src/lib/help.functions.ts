import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireDealEditor,
  requireInternalAuth,
  requireManager,
} from "@/integrations/supabase/internal-middleware";

/** How many articles the library holds and when it was last refreshed. */
export const getHelpArticleStatus = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { helpArticleStatus } = await import("./server/help/articles.server");
    return helpArticleStatus();
  });

/** Refresh the library from the help centre; the bundled index stands in when it is unreachable. */
export const syncHelpArticlesFn = createServerFn({ method: "POST" })
  .middleware([requireManager])
  .handler(async ({ context }) => {
    const { syncHelpArticles } = await import("./server/help/articles.server");
    return syncHelpArticles(context.profile.id);
  });

/**
 * Pick the articles again for a deal, from the latest brief and notes.
 * Replaces the AI's picks; a person's additions and edits stay.
 */
export const repickHelpArticlesFn = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { repickHelpArticles } = await import("./presale.server");
    return repickHelpArticles(context.profile.id, data.dealId);
  });
