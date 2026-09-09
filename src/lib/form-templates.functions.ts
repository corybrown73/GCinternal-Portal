import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/**
 * Reading the library is open to any internal user — it is a catalogue.
 * Adding to it or removing from it is a sales-editor action, checked on the
 * server in form-templates.server.ts; the client-side role check only hides
 * dead buttons.
 */

export const listFormTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ industry: z.string().trim().max(80).nullable().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const { listFormTemplates } = await import("./form-templates.server");
    return listFormTemplates({ industry: data.industry ?? null });
  });

export const suggestFormTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ industry: z.string().trim().max(80).nullable() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { suggestFormTemplates } = await import("./form-templates.server");
    return suggestFormTemplates(data.industry);
  });

export const createFormTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(160),
        industry: z.string().trim().min(1).max(80),
        description: z.string().trim().max(2000).nullable().default(null),
        tags: z.array(z.string().trim().max(40)).max(20).default([]),
        image: z
          .object({
            fileName: z.string().trim().min(1).max(200),
            contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
            dataBase64: z.string().min(1).max(8_000_000),
          })
          .nullable()
          .default(null),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { createFormTemplate } = await import("./form-templates.server");
    return createFormTemplate(context.profile.id, data);
  });

export const deleteFormTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { deleteFormTemplate } = await import("./form-templates.server");
    await deleteFormTemplate(context.profile.id, data.id);
    return { ok: true as const };
  });
