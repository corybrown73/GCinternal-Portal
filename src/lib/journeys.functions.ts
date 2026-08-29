import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ------------------------------------------------------------------------- */
/* Journey engine server functions.                                          */
/* Viewing requires an internal profile; editing/enrolling additionally      */
/* requires canManage or the implementation role. recordJourneyView is the   */
/* single PUBLIC function (token-authenticated, used by /view/$token).       */
/* ------------------------------------------------------------------------- */

async function internalOnly(userId: string) {
  const { requireInternal } = await import("./portal.server");
  return requireInternal(userId);
}

async function editorOnly(userId: string) {
  const [{ requireInternal, canEditJourneys }] = await Promise.all([import("./portal.server")]);
  const profile = await requireInternal(userId);
  if (!canEditJourneys(profile.role)) {
    throw new Error("Forbidden: managers or implementation only");
  }
  return profile;
}

export const getJourneys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await internalOnly(context.userId);
    const { ensureDefaultJourney, loadJourneys } = await import("./journeys.server");
    // Lazy idempotent seed — internal path only.
    await ensureDefaultJourney();
    return loadJourneys();
  });

export const getJourneyDetail = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ journeyId: z.string().uuid() }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await internalOnly(context.userId);
    const { loadJourneyDetail } = await import("./journeys.server");
    return loadJourneyDetail(data.journeyId);
  });

export const addJourney = createServerFn({ method: "POST" })
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
    const { createJourney } = await import("./journeys.server");
    return createJourney({ ...data, createdBy: profile.id });
  });

export const toggleJourneyActive = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ journeyId: z.string().uuid(), active: z.boolean() }).parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const profile = await editorOnly(context.userId);
    const { setJourneyActive } = await import("./journeys.server");
    await setJourneyActive(data.journeyId, data.active, profile.id);
    return { ok: true };
  });

const stepInput = z.object({
  journeyId: z.string().uuid(),
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
    const { saveJourneyStep } = await import("./journeys.server");
    return saveJourneyStep(
      data.journeyId,
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
    z.object({ journeyId: z.string().uuid(), stepId: z.string().uuid() }).parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const profile = await editorOnly(context.userId);
    const { deleteJourneyStep } = await import("./journeys.server");
    await deleteJourneyStep(data.journeyId, data.stepId, profile.id);
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
    const { createContentItem } = await import("./journeys.server");
    return createContentItem({ ...data, createdBy: profile.id });
  });

export const enrollJourneyContact = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        journeyId: z.string().uuid(),
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
    const { enrollContact } = await import("./journeys.server");
    const enrollment = await enrollContact(data.journeyId, {
      customerId: data.customerId,
      contactEmail: data.contactEmail,
      contactId: data.contactId ?? null,
      firstName: data.firstName ?? null,
    });
    return { id: enrollment.id };
  });

/* PUBLIC — the tracked-link landing. Auth is the signed token itself. */
export const recordJourneyView = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: z.string().min(10) }).parse(data))
  .handler(async ({ data }) => {
    const { recordView } = await import("./journeys.server");
    return recordView(data.token);
  });
