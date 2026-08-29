import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { STAGES } from "./presale-stages";

/* ---------- pipeline ---------- */

export const getPipeline = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadPipeline } = await import("./presale.server");
    return loadPipeline();
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
