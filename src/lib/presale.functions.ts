import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { EDITABLE_DEAL_FIELDS, type EditableDealField } from "./presale-fields";

import {
  requireDealEditor,
  requireInternalAuth,
  requireManager,
} from "@/integrations/supabase/internal-middleware";
import { STAGES } from "./presale-stages";

/* ---------- pipeline ---------- */

/** Home: the deals that have not started onboarding, in the page's scope. */
export const getDealInbox = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ scope: z.string().optional() }).optional().parse(data),
  )
  .handler(async ({ data, context }) => {
    const { loadDealInbox } = await import("./presale.server");
    const { resolveScope } = await import("./ownership.server");
    const resolved = await resolveScope(context.profile.id, data?.scope ?? null);
    return loadDealInbox(resolved);
  });

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
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(1, "Name is required"),
        domain: z.string().trim().nullable(),
        salesforceId: z.string().trim().nullable(),
        arr: z.number().nonnegative().nullable(),
        summary: z.string().max(10000).nullable(),
        path: z
          .enum(["new_logo", "existing", "dm_conversion", "field_fusion"])
          .nullable()
          .optional(),
        industry: z.string().trim().max(80).nullable().optional(),
        stage: z.enum(STAGES).optional(),
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
      path: data.path ?? null,
      industry: data.industry ?? null,
      stage: data.stage ?? null,
    });
  });

export const moveDealStage = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        toStage: z.enum(STAGES),
        note: z.string().max(2000).optional(),
        /** The person saw what is missing and moved it anyway. */
        force: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { transitionDeal } = await import("./presale.server");
    if (data.force) {
      // Moving past what the gate found missing is a manager's call, and the
      // server says so even when a button somewhere forgot to.
      const { canManage } = await import("@/lib/auth");
      if (!canManage(context.profile.role as import("@/lib/auth").PortalRole)) {
        throw new Error(
          "Only a manager or admin can move a deal past what the gate found missing.",
        );
      }
    }
    return transitionDeal(context.userId, data.dealId, data.toStage, data.note, data.force);
  });

export const uploadSow = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        fileName: z.string().trim().min(1).max(200),
        // PDF only. A signed contract is a PDF, and accepting anything else
        // means accepting a document format that can carry script from a
        // signed URL on our own origin.
        contentType: z.literal("application/pdf"),
        /** ~34 MB of base64 is ~25 MB of PDF. */
        dataBase64: z.string().min(1).max(34_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { uploadDealSow } = await import("./presale.server");
    return uploadDealSow(context.profile.id, data);
  });

export const getSowLink = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { dealSowLink } = await import("./presale.server");
    return dealSowLink(context.profile.id, data.dealId);
  });

export const setDealField = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
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
  .middleware([requireManager])
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
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        title: z.string().trim().min(1, "Title is required"),
        reportType: z.enum(["call_notes", "account_map"]),
        contentMd: z.string().trim().min(1, "Paste or upload some content first"),
        callDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { addGongReport } = await import("./presale.server");
    return addGongReport(context.userId, data);
  });

export const removeReport = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => z.object({ reportId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { deleteGongReport } = await import("./presale.server");
    return deleteGongReport(context.userId, data.reportId);
  });

export const generateBriefForDeal = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
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
  .middleware([requireDealEditor])
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
  .middleware([requireDealEditor])
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
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z.object({ noteId: z.string().uuid(), reviewed: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { setNoteReviewStatus } = await import("./presale.server");
    return setNoteReviewStatus(context.userId, data.noteId, data.reviewed);
  });

export const removeNote = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
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
  .middleware([requireDealEditor])
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

/** The key stays; what it may do changes. Super admin, audited, never on a revoked key. */
export const updateApiKeyScopes = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        keyId: z.string().uuid(),
        scopes: z.array(z.string()).min(1, "Pick at least one scope"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { updateApiKeyScopesRecord } = await import("./presale.server");
    return updateApiKeyScopesRecord(context.userId, data.keyId, data.scopes);
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

/**
 * Passwords, set by an admin. Super-admin only, like roles and invites: a
 * password is the account.
 */
export const setUserPasswordFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ profileId: z.string().uuid(), password: z.string().min(12).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { setUserPassword } = await import("./user-passwords.server");
    return setUserPassword(context.userId, data.profileId, data.password);
  });

export const sendPasswordResetFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ profileId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { issuePasswordReset } = await import("./user-passwords.server");
    return issuePasswordReset(context.userId, data.profileId);
  });

/* ---------- onboarding intake (0047) ---------- */

export const saveIntake = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        // A partial: the panel saves one answer at a time, as it is given.
        patch: z
          .object({
            forms_built: z.boolean().nullable().optional(),
            industry: z.string().trim().max(80).nullable().optional(),
            company_size: z.string().trim().max(20).nullable().optional(),
            field_users: z.number().int().nonnegative().nullable().optional(),
            current_process: z.string().trim().max(4000).nullable().optional(),
            current_process_source: z.enum(["ai", "person"]).nullable().optional(),
            path: z
              .enum(["new_logo", "existing", "dm_conversion", "field_fusion"])
              .nullable()
              .optional(),
            training_only: z.boolean().optional(),
            solutions_involved: z.boolean().nullable().optional(),
            has_sow: z.boolean().nullable().optional(),
            existing: z
              .object({
                form_final: z.boolean().nullable().optional(),
                builder: z.enum(["us", "customer"]).nullable().optional(),
                customer_build_by: z
                  .string()
                  .regex(/^\d{4}-\d{2}-\d{2}$/)
                  .nullable()
                  .optional(),
                form_frozen_on: z
                  .string()
                  .regex(/^\d{4}-\d{2}-\d{2}$/)
                  .nullable()
                  .optional(),
              })
              .optional(),
            field_fusion: z
              .object({
                form_connected: z.boolean().optional(),
                client_trained: z.boolean().optional(),
                notes: z.string().trim().max(4000).optional(),
              })
              .optional(),
            chosen_templates: z.array(z.string().uuid()).optional(),
            welcome_hidden_screens: z.array(z.string().max(40)).max(20).optional(),
            welcome_shared_at: z.string().nullable().optional(),
            // One meeting's recap at a time, merged on the server.
            recaps: z
              .record(
                z.string().max(40),
                z.object({
                  completed: z.string().max(2000),
                  open_items: z.string().max(2000),
                  customer_prep: z.string().max(1000),
                  gocanvas_prep: z.string().max(1000),
                  next_objective: z.string().max(500),
                  at: z.string().max(40),
                }),
              )
              .optional(),
            // One tick at a time, merged on the server; null unticks.
            handoff_tasks: z.record(z.string().max(40), z.string().max(40).nullable()).optional(),
            welcome_text: z.record(z.string().max(80), z.string().max(1200)).optional(),
            help_picks: z
              .array(
                z.object({
                  article_id: z.string().min(1).max(40),
                  title: z.string().trim().min(1).max(200),
                  url: z.string().url().max(500),
                  why: z.string().trim().max(240).optional(),
                  source: z.enum(["ai", "person"]).optional(),
                  feature: z.string().trim().max(60).nullable().optional(),
                  when: z
                    .enum(["before session 1", "after session 1", "after session 2", "phase 2"])
                    .nullable()
                    .optional(),
                }),
              )
              .max(8)
              .optional(),
            wanted_forms: z
              .array(
                z.object({
                  id: z.string().min(1).max(40),
                  name: z.string().trim().min(1).max(160),
                  template_id: z.string().uuid().nullable().optional(),
                }),
              )
              .max(20)
              .optional(),
            // The seven-day plan's knobs, saved whole: the panel sends the
            // complete object so a cleared override is a cleared override.
            timeline: z
              .object({
                close_date: z
                  .string()
                  .regex(/^\d{4}-\d{2}-\d{2}$/)
                  .nullable(),
                overrides: z.record(z.string(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
                holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(30),
                integration_tier: z.number().int().min(0).max(5),
                integration_target: z.string().trim().max(120).nullable(),
                field_tester: z.string().trim().max(120).nullable(),
                form_proven_on: z
                  .string()
                  .regex(/^\d{4}-\d{2}-\d{2}$/)
                  .nullable()
                  .optional(),
                completed: z
                  .record(z.string().max(40), z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
                  .optional(),
                times: z.record(z.string().max(40), z.string().regex(/^\d{2}:\d{2}$/)).optional(),
                timezone: z.string().trim().max(64).nullable().optional(),
                sow_applied_at: z.string().nullable().optional(),
                sow_notes: z.array(z.string().max(300)).max(20).optional(),
                services: z
                  .array(
                    z.object({
                      id: z.string().min(1).max(40),
                      kind: z.enum([
                        "integration",
                        "custom_pdf",
                        "paid_form",
                        "analytics",
                        "data_load",
                        "training",
                        "other",
                      ]),
                      name: z.string().trim().min(1).max(120),
                      phase: z.number().int().min(1).max(9),
                      tier: z.number().int().min(0).max(5).nullable().optional(),
                      weeks: z.number().min(0.5).max(52).nullable().optional(),
                      needs: z.string().trim().max(300).nullable().optional(),
                      tool: z.string().trim().max(40).nullable().optional(),
                    }),
                  )
                  .max(20)
                  .optional(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { saveDealIntake } = await import("./presale.server");
    return saveDealIntake(context.profile.id, data.dealId, data.patch);
  });

export const uploadIntakeForm = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        fileName: z.string().trim().min(1).max(200),
        // What a customer has: a PDF of the form, or a photo of the paper one.
        contentType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
        dataBase64: z.string().min(1).max(34_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { uploadDealIntakeForm } = await import("./presale.server");
    return uploadDealIntakeForm(context.profile.id, data);
  });

/** The signed contract, PDF only, onto the intake. Beside or instead of a SOW. */
export const uploadContract = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        fileName: z.string().trim().min(1).max(200),
        contentType: z.literal("application/pdf"),
        dataBase64: z.string().min(1).max(34_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { uploadDealContract } = await import("./presale.server");
    return uploadDealContract(context.profile.id, {
      dealId: data.dealId,
      fileName: data.fileName,
      dataBase64: data.dataBase64,
    });
  });

export const getIntakeFormLink = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ dealId: z.string().uuid(), path: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { intakeFormLink } = await import("./presale.server");
    return intakeFormLink(data.dealId, data.path);
  });
