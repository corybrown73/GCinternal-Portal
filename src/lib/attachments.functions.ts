import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

const KIND = z.enum(["sow", "board", "deck", "doc", "sheet", "recording", "other"]);

export const getAccountFiles = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ implementationId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { loadAccountFiles } = await import("./attachments.server");
    return loadAccountFiles(data.implementationId);
  });

export const addAttachmentLink = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        implementationId: z.string().uuid(),
        title: z.string().min(1).max(200),
        kind: KIND,
        url: z.string().min(1).max(2000),
        description: z.string().max(1000).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { addAccountLink } = await import("./attachments.server");
    return addAccountLink({
      implementationId: data.implementationId,
      title: data.title,
      kind: data.kind,
      url: data.url,
      description: data.description ?? null,
      actorProfileId: context.profile.id,
    });
  });

export const uploadAttachment = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        implementationId: z.string().uuid(),
        title: z.string().min(1).max(200),
        kind: KIND,
        fileName: z.string().min(1).max(255),
        contentType: z.string().min(1).max(200),
        // ~25MB of base64 is ~18MB of file. A cap here rather than nowhere:
        // an unbounded body is a way to take the server down by accident.
        dataBase64: z.string().min(1).max(25_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { addAccountUpload } = await import("./attachments.server");
    return addAccountUpload({ ...data, actorProfileId: context.profile.id });
  });

export const openAttachment = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { accountFileLink } = await import("./attachments.server");
    return accountFileLink(data.id);
  });

export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { removeAccountFile } = await import("./attachments.server");
    return removeAccountFile(data.id);
  });
