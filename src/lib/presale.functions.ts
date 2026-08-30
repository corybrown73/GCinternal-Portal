import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { EDITABLE_DEAL_FIELDS, type EditableDealField } from "./presale-fields";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { STAGES } from "./presale-stages";

/* ---------- pipeline ---------- */

export const getPipeline = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator(
    (data: unknown) =>
      z
        .object({ scope: z.string().trim().max(60).optional() })
        .optional()
        .parse(data) ?? {},
  )
  .handler(async ({ data, context }) => {
    const { loadPipeline } = await import("./presale.server");
    const { resolveScope } = await import("./ownership.server");
    const { describeScope } = await import("./ownership");
    // Who is asking comes from the request context, never from `data`.
    const resolved = await resolveScope(context.profile.id, data?.scope ?? null);
    const pipeline = await loadPipeline(resolved);
    return {
      ...pipeline,
      scope: {
        mode: resolved.scope.mode,
        person_id: resolved.scope.personId,
        label: describeScope(resolved.scope, resolved.viewer, resolved.personName),
        viewer_name: resolved.viewer.name,
      },
    };
  });

export const addDeal = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(1, "Name is required"),
        domain: z.string().trim().nullable(),
        salesforceId: z.string().trim().nullable(),
        arr: z.number().nonnegative().nullable(),
        summary: z.string().max(10000).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { createDeal } = await import("./presale.server");
    return createDeal(context.userId, {
      name: data.name,
      domain: data.domain,
      salesforce_id: data.salesforceId,
      arr: data.arr,
      summary: data.summary,
    });
  });

export const moveDealStage = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        toStage: z.enum(STAGES),
        note: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { transitionDeal } = await import("./presale.server");
    return transitionDeal(context.userId, data.dealId, data.toStage, data.note);
  });

export const setDealField = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        // The allowed set lives in one place on the server. Listing the names
        // again here would let the two drift, and the drift would look like a
        // field that saves in one build and silently refuses in the next.
        field: z.enum(
          Object.keys(EDITABLE_DEAL_FIELDS) as [EditableDealField, ...EditableDealField[]],
        ),
        value: z.string().max(2000).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { updateDealField } = await import("./presale.server");
    return updateDealField(context.userId, data.dealId, data.field, data.value);
  });

export const importDeals = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        csv: z
          .string()
          .min(1, "The CSV file is empty")
          .max(2 * 1024 * 1024),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { importDealsCsv } = await import("./presale.server");
    return importDealsCsv(context.userId, data.csv);
  });

/* ---------- deal record ---------- */

export const getDeal = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { loadDeal } = await import("./presale.server");
    return loadDeal(data.dealId);
  });

export const addReport = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        title: z.string().trim().min(1, "Title is required"),
        reportType: z.enum(["call_notes", "account_map"]),
        contentMd: z.string().trim().min(1, "Paste or upload some content first"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { addGongReport } = await import("./presale.server");
    return addGongReport(context.userId, data);
  });

export const removeReport = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ reportId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { deleteGongReport } = await import("./presale.server");
    return deleteGongReport(context.userId, data.reportId);
  });

export const generateBriefForDeal = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { generateDealBrief } = await import("./presale.server");
    return generateDealBrief(context.userId, data.dealId);
  });

export const getBriefDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ briefId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { briefDownloadUrl } = await import("./presale.server");
    return briefDownloadUrl(context.userId, data.briefId);
  });

export const createTamRequestForDeal = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        justification: z.string().trim().min(10, "Justification must be at least 10 characters"),
        urgency: z.enum(["low", "medium", "high"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requestTam } = await import("./presale.server");
    return requestTam(context.userId, data);
  });

export const addNote = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        bodyMd: z.string().trim().min(1, "Write something first"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { addDealNote } = await import("./presale.server");
    return addDealNote(context.userId, data);
  });

export const setNoteReviewed = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ noteId: z.string().uuid(), reviewed: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { setNoteReviewStatus } = await import("./presale.server");
    return setNoteReviewStatus(context.userId, data.noteId, data.reviewed);
  });

export const removeNote = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ noteId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { deleteDealNote } = await import("./presale.server");
    return deleteDealNote(context.userId, data.noteId);
  });

export const getHandoffOptions = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { loadHandoffOptions } = await import("./presale.server");
    return loadHandoffOptions(context.userId, data.dealId);
  });

export const startOnboardingForDeal = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        // Both are ignored while `account_model` is off.
        customerId: z.string().uuid().nullable().optional(),
        createNewCustomer: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { startOnboarding } = await import("./presale.server");
    return startOnboarding(context.userId, data.dealId, {
      customerId: data.customerId ?? null,
      createNewCustomer: data.createNewCustomer === true,
    });
  });

/* ---------- admin ---------- */

export const getApiKeys = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async ({ context }) => {
    const { listApiKeys } = await import("./presale.server");
    return listApiKeys(context.userId);
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(1, "Name is required"),
        scopes: z.array(z.string()).min(1, "Pick at least one scope"),
        // Phase 7. Optional and null-by-default so an existing caller is
        // unaffected: a key with no expiry behaves exactly as every key does
        // today.
        expiresAt: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
          .nullable()
          .optional(),
        rateLimitPerMinute: z.number().int().min(1).max(100000).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { createApiKeyRecord } = await import("./presale.server");
    return createApiKeyRecord(context.userId, data);
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ keyId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { revokeApiKeyRecord } = await import("./presale.server");
    return revokeApiKeyRecord(context.userId, data.keyId);
  });

export const getUsers = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async ({ context }) => {
    const { listProfiles } = await import("./presale.server");
    return listProfiles(context.userId);
  });

/**
 * Inviting a teammate is ADMIN-only, not manager-only.
 *
 * An invite creates a staff account with a role attached, so it is the same
 * decision as changing a role and is gated the same way — `requireSuperAdmin`
 * in the server layer, which is what `setUserRole` already uses. A manager can
 * run their book; they cannot enlarge the team.
 */
export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(200),
        fullName: z.string().trim().max(120).optional(),
        role: z.enum(["manager", "sales", "implementation", "tam_se", "super_admin"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireSuperAdmin } = await import("./presale.server");
    const inviter = await requireSuperAdmin(context.userId);
    const { inviteUser: invite } = await import("./user-invites.server");
    return invite(
      { id: inviter.id, full_name: inviter.full_name ?? null, email: inviter.email },
      { email: data.email, fullName: data.fullName ?? null, role: data.role },
    );
  });

export const getPendingInvites = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async ({ context }) => {
    const { requireSuperAdmin } = await import("./presale.server");
    await requireSuperAdmin(context.userId);
    const { listPendingInvites } = await import("./user-invites.server");
    return listPendingInvites();
  });

export const revokeUserInvite = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ inviteId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { requireSuperAdmin } = await import("./presale.server");
    await requireSuperAdmin(context.userId);
    const { revokeInvite } = await import("./user-invites.server");
    await revokeInvite(data.inviteId, context.userId);
    return { ok: true as const };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        profileId: z.string().uuid(),
        role: z.enum(["super_admin", "manager", "sales", "implementation", "tam_se", "customer"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { setProfileRole } = await import("./presale.server");
    return setProfileRole(context.userId, context.supabase, data.profileId, data.role);
  });
