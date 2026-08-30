import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/**
 * The internal door to the project conversation.
 *
 * Reading and posting are open to any internal user — a conversation the team
 * cannot join is not one place for communication, and the whole point is that
 * the person who knows the answer can say it without being granted something
 * first.
 *
 * Two things are NOT open, and both are for the same reason: they change what a
 * customer can see or who gets mail about it.
 *
 *  - adding or removing a participant is manage-gated;
 *  - `visibility` is validated as a literal union, so a client cannot invent a
 *    third value and land somewhere the server does not check.
 *
 * The server module re-checks everything here from `context.profile`. These
 * validators shape the input; they are not the authorization.
 */

const MANAGE_ROLES = ["admin", "super_admin", "manager"];

function assertCanManage(profile: { role: string }): void {
  if (!MANAGE_ROLES.includes(profile.role)) {
    throw new Error(
      "Forbidden: who is in a project conversation can only be changed by an admin, super admin or manager.",
    );
  }
}

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ implementationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { loadConversation } = await import("./conversation.server");
    return loadConversation(data.implementationId, context.profile.id);
  });

export const postConversationMessage = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        implementationId: z.string().uuid(),
        body: z.string().trim().min(1).max(20000),
        // A literal union, not a string. "internal" is the safe default only
        // because a typo in a third value would otherwise fall through to
        // whatever the database column defaults to — which is 'shared'.
        visibility: z.enum(["shared", "internal"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { postMessage } = await import("./conversation.server");
    return postMessage({
      implementationId: data.implementationId,
      profileId: context.profile.id,
      body: data.body,
      visibility: data.visibility,
    });
  });

export const addConversationParticipant = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        implementationId: z.string().uuid(),
        profileId: z.string().uuid().optional(),
        contactId: z.string().uuid().optional(),
      })
      .refine((v) => Boolean(v.profileId) !== Boolean(v.contactId), {
        message: "Add either a teammate or a customer contact, not both.",
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { addParticipant } = await import("./conversation.server");
    return addParticipant({
      implementationId: data.implementationId,
      actingProfileId: context.profile.id,
      profileId: data.profileId,
      contactId: data.contactId,
    });
  });

export const removeConversationParticipant = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ implementationId: z.string().uuid(), participantId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { removeParticipant } = await import("./conversation.server");
    return removeParticipant({
      implementationId: data.implementationId,
      actingProfileId: context.profile.id,
      participantId: data.participantId,
    });
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ implementationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { markRead } = await import("./conversation.server");
    await markRead(data.implementationId, context.profile.id);
    return { ok: true as const };
  });
