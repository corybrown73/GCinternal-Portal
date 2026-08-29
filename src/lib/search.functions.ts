import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { SAVED_VIEW_SURFACES, saveViewInput } from "./saved-view-input";

/**
 * Global search and saved views. Internal-only: a customer-role login cannot
 * reach these, and search queries no table the caller could not already open.
 */

export const search = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ q: z.string().max(200) }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data }) => {
    const { globalSearch } = await import("./search.server");
    return globalSearch(data.q);
  });

export const getSavedViews = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ surface: z.enum(SAVED_VIEW_SURFACES) }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { listSavedViews } = await import("./search.server");
    return listSavedViews(context.profile.id, data.surface);
  });

export const createSavedView = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveViewInput.parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { saveView } = await import("./search.server");
    // The owner is the caller, never an input: a view whose owner came from the
    // request body is a view anybody can plant in somebody else's list.
    return saveView(context.profile.id, data);
  });

export const removeSavedView = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { deleteSavedView } = await import("./search.server");
    return deleteSavedView(context.profile.id, data.id);
  });
