import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/**
 * The caller's presenter selections. Internal users only (requireInternalAuth,
 * the same gate as the Presenter Workspace itself). The profile comes from the
 * session and nothing the client sends names a profile or an organisation.
 */

const dealInput = z.object({ dealId: z.string().uuid() });
const selectionInput = z.object({ dealId: z.string().uuid(), journalEntryId: z.string().uuid() });

export const getPresenterNotes = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => dealInput.parse(data))
  .handler(async ({ data, context }) => {
    const { listPresenterNotesFor } = await import("./presenter-notes.server");
    return listPresenterNotesFor(data.dealId, context.profile.id);
  });

export const choosePresenterNote = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => selectionInput.parse(data))
  .handler(async ({ data, context }) => {
    const { addPresenterNoteFor } = await import("./presenter-notes.server");
    return addPresenterNoteFor(data.dealId, data.journalEntryId, context.profile.id);
  });

export const dropPresenterNote = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => selectionInput.parse(data))
  .handler(async ({ data, context }) => {
    const { removePresenterNoteFor } = await import("./presenter-notes.server");
    return removePresenterNoteFor(data.dealId, data.journalEntryId, context.profile.id);
  });
