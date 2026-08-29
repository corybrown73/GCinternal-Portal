import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ------------------------------------------------------------------------- */
/* Sequence engine server functions.                                          */
/* Viewing requires an internal profile; editing/enrolling additionally      */
/* requires canManage or the implementation role. recordSequenceView is the   */
/* single PUBLIC function (token-authenticated, used by /view/$token).       */
/* ------------------------------------------------------------------------- */

async function internalOnly(userId: string) {
  const { requireInternal } = await import("./portal.server");
  return requireInternal(userId);
}

async function editorOnly(userId: string) {
  const { requireInternal, canEditSequences } = await import("./portal.server");
  const profile = await requireInternal(userId);
  if (!canEditSequences(profile.role)) {
    throw new Error("Forbidden: managers or implementation only");
  }
  return profile;
}

export const getSequences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await internalOnly(context.userId);
    const { ensureDefaultSequence, loadSequences } = await import("./sequences.server");
    // Lazy idempotent seed — internal path only.
    await ensureDefaultSequence();
    return loadSequences();
  });

export const getSequenceDetail = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ sequenceId: z.string().uuid() }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await internalOnly(context.userId);
    const { loadSequenceDetail } = await import("./sequences.server");
    return loadSequenceDetail(data.sequenceId);
  });

export const addSequence = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        description: z.string().trim().max(500).nullable().optional(),
        trigger_event: z.enum(["manual", "customer_created", "stage_entered"]),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const profile = await editorOnly(context.userId);
    const { createSequence } = await import("./sequences.server");
    return createSequence({
      name: data.name,
      description: data.description ?? null,
      trigger_event: data.trigger_event,
      createdBy: profile.id,
    });
  });

export const toggleSequenceActive = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ sequenceId: z.string().uuid(), active: z.boolean() }).parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const profile = await editorOnly(context.userId);
    const { setSequenceActive } = await import("./sequences.server");
    await setSequenceActive(data.sequenceId, data.active, profile.id);
    return { ok: true };
  });

const stepInput = z.object({
  sequenceId: z.string().uuid(),
  stepId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(200),
  content_item_id: z.string().uuid().nullable().optional(),
  email_subject: z.string().trim().min(2).max(300),
  email_body: z.string().trim().min(2).max(8000),
  advance_on: z.enum(["viewed", "delay"]),
  delay_hours: z.number().int().positive().nullable().optional(),
});

export const saveStep = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => stepInput.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const profile = await editorOnly(context.userId);
    const { saveSequenceStep } = await import("./sequences.server");
    return saveSequenceStep(
      data.sequenceId,
      data.stepId ?? null,
      {
        title: data.title,
        content_item_id: data.content_item_id ?? null,
        email_subject: data.email_subject,
        email_body: data.email_body,
        advance_on: data.advance_on,
        delay_hours: data.advance_on === "delay" ? (data.delay_hours ?? null) : null,
      },
      profile.id,
    );
  });

export const removeStep = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ sequenceId: z.string().uuid(), stepId: z.string().uuid() }).parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const profile = await editorOnly(context.userId);
    const { deleteSequenceStep } = await import("./sequences.server");
    await deleteSequenceStep(data.sequenceId, data.stepId, profile.id);
    return { ok: true };
  });

export const addContentItem = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        title: z.string().trim().min(2).max(200),
        kind: z.enum(["video", "doc", "link"]),
        url: z.string().trim().url(),
        description: z.string().trim().max(500).nullable().optional(),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const profile = await editorOnly(context.userId);
    const { createContentItem } = await import("./sequences.server");
    return createContentItem({
      title: data.title,
      kind: data.kind,
      url: data.url,
      description: data.description ?? null,
      createdBy: profile.id,
    });
  });

export const enrollSequenceContact = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        sequenceId: z.string().uuid(),
        customerId: z.string().uuid(),
        contactId: z.string().uuid().nullable().optional(),
        contactEmail: z.string().trim().email(),
        firstName: z.string().trim().max(80).nullable().optional(),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await editorOnly(context.userId);
    const { enrollContact } = await import("./sequences.server");
    const enrollment = await enrollContact(data.sequenceId, {
      customerId: data.customerId,
      contactEmail: data.contactEmail,
      contactId: data.contactId ?? null,
      firstName: data.firstName ?? null,
    });
    return { id: enrollment.id };
  });

/* PUBLIC — the tracked-link landing. Auth is the signed token itself. */
export const recordSequenceView = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: z.string().min(10) }).parse(data))
  .handler(async ({ data }) => {
    const { recordView } = await import("./sequences.server");
    return recordView(data.token);
  });
