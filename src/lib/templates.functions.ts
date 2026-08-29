import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/* ------------------------------------------------------------------------- */
/* Journey template browser — READ ONLY.                                      */
/*                                                                            */
/* requireInternalAuth is the authorization gate (a customer-role login can    */
/* never reach template content). The `journey_templates` feature flag is a    */
/* separate, softer gate applied inside templates.server.ts: with it off these */
/* return `flagOn: false` and no content instead of throwing, so the page can  */
/* explain itself rather than error.                                          */
/* ------------------------------------------------------------------------- */

export const getTemplateFamilies = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadTemplateFamilies } = await import("./templates.server");
    return loadTemplateFamilies();
  });

export const getTemplateVersion = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ templateId: z.string().uuid() }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data }) => {
    const { loadTemplateVersion } = await import("./templates.server");
    return loadTemplateVersion(data.templateId);
  });
