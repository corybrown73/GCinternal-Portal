import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireDealEditor,
  requireInternalAuth,
} from "@/integrations/supabase/internal-middleware";

const KIND = z.enum(["sow", "board", "deck", "doc", "sheet", "recording", "other"]);

export const getAccountFiles = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ implementationId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { loadAccountFiles } = await import("./attachments.server");
    return loadAccountFiles(data.implementationId);
  });

export const addAttachmentLink = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
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
  .middleware([requireDealEditor])
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

/**
 * The customer page's "Attach SOW" stored a file (under sow/): make it the
 * deal's SOW too and queue the reading, as a deal-page upload does.
 */
export const adoptImplementationSow = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        implementationId: z.string().uuid(),
        // Only what storeAttachment wrote for a SOW: a path in the sow/ folder.
        path: z
          .string()
          .min(5)
          .max(400)
          .regex(/^sow\/[A-Za-z0-9._-]+$/),
        name: z.string().trim().min(1).max(255),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { adoptUploadedSow } = await import("./server/deal-sow");
    return adoptUploadedSow({
      implementationId: data.implementationId,
      path: data.path,
      name: data.name,
      actorProfileId: context.profile.id,
      source: "customer_sow_panel",
    });
  });

export const openAttachment = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { accountFileLink } = await import("./attachments.server");
    return accountFileLink(data.id);
  });

/**
 * Removes one attachment, if the caller uploaded it (issue #79). The account it
 * is about is part of the request, and the server checks that the attachment is
 * in that account. Who is asking comes from the session, never from the body: a
 * body claiming someone else's id is ignored, because the schema has no such field.
 */
export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        implementationId: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { removeAccountFile } = await import("./attachments.server");
    return removeAccountFile({
      id: data.id,
      implementationId: data.implementationId,
      actor: { id: context.profile.id, role: context.profile.role },
    });
  });
