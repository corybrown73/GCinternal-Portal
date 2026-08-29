import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/**
 * Server functions for /admin/integrations.
 *
 * `requireInternalAuth` keeps customer logins out; the role check that actually
 * decides manager-vs-admin lives in sf-integration.server.ts, because every
 * query there runs on the service-role client and RLS never sees it. Reads are
 * manager+, writes are admin, and no read path anywhere returns a webhook
 * signing secret.
 */

const uuid = z.string().uuid();

export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async ({ context }) => {
    const { loadIntegrationStatus } = await import("./sf-integration.server");
    return loadIntegrationStatus(context.profile.id);
  });

export const getSyncLog = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.enum(["succeeded", "replayed", "rejected", "failed"]).nullable().optional(),
        externalId: z.string().trim().max(40).nullable().optional(),
        limit: z.number().int().positive().max(200).optional(),
      })
      .parse(data ?? {}),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { loadSyncLog } = await import("./sf-integration.server");
    return loadSyncLog(context.profile.id, {
      status: data.status ?? null,
      externalId: data.externalId ?? null,
      limit: data.limit ?? 100,
    });
  });

export const rerunSyncLogRow = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { rerunSyncLogEntry } = await import("./sf-integration.server");
    return rerunSyncLogEntry(context.profile.id, data.id);
  });

export const getFieldMaps = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async ({ context }) => {
    const { loadFieldMapsForAdmin } = await import("./sf-integration.server");
    return loadFieldMapsForAdmin(context.profile.id);
  });

export const upsertFieldMap = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid.nullable().optional(),
        direction: z.enum(["inbound", "outbound"]),
        source_path: z.string().trim().min(1).max(200),
        target_field: z.string().trim().min(1).max(200),
        transform: z
          .enum(["none", "date", "number", "stage_label", "lowercase"])
          .nullable()
          .optional(),
        fill_policy: z.enum(["never", "if_blank"]),
        required: z.boolean(),
        active: z.boolean(),
      })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { saveFieldMap } = await import("./sf-integration.server");
    return saveFieldMap(context.profile.id, {
      id: data.id ?? null,
      direction: data.direction,
      source_path: data.source_path,
      target_field: data.target_field,
      transform: data.transform ?? null,
      fill_policy: data.fill_policy,
      required: data.required,
      active: data.active,
    });
  });

export const removeFieldMap = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { deleteFieldMap } = await import("./sf-integration.server");
    return deleteFieldMap(context.profile.id, data.id);
  });

export const previewPayload = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ payload: z.string().max(50_000) }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { previewIngest } = await import("./sf-integration.server");
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.payload);
    } catch {
      return { mapped: {}, missingRequired: [], selection: null, errors: ["Body must be JSON"] };
    }
    return previewIngest(context.profile.id, parsed);
  });

export const getNeedsTemplate = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async ({ context }) => {
    const { loadNeedsTemplateQueue } = await import("./sf-integration.server");
    return loadNeedsTemplateQueue(context.profile.id);
  });

export const getWebhookEndpoints = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async ({ context }) => {
    const { loadWebhookEndpoints } = await import("./sf-integration.server");
    return loadWebhookEndpoints(context.profile.id);
  });

export const addWebhookEndpoint = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(120),
        url: z.string().trim().url(),
        eventTypes: z.array(z.string().trim().max(60)).max(20),
      })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { createWebhookEndpoint } = await import("./sf-integration.server");
    return createWebhookEndpoint(context.profile.id, data);
  });

export const toggleWebhookEndpoint = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ id: uuid, active: z.boolean(), reason: z.string().max(300).nullable().optional() })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { setWebhookEndpointActive } = await import("./sf-integration.server");
    return setWebhookEndpointActive(context.profile.id, {
      id: data.id,
      active: data.active,
      reason: data.reason ?? null,
    });
  });

export const getWebhookDeliveries = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ endpointId: uuid.nullable().optional() }).parse(data ?? {}),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { loadWebhookDeliveries } = await import("./sf-integration.server");
    return loadWebhookDeliveries(context.profile.id, data.endpointId ?? null);
  });

export const redeliverWebhookDelivery = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { redeliverWebhook } = await import("./sf-integration.server");
    return redeliverWebhook(context.profile.id, data.id);
  });

export const sendWebhookTestEvent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ endpointId: uuid }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { sendTestEvent } = await import("./sf-integration.server");
    return sendTestEvent(context.profile.id, data.endpointId);
  });

export const setIntegrationFeatureFlag = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ flag: z.enum(["sf_auto_create", "sf_presale_bridge"]), enabled: z.boolean() })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { setIntegrationFlag } = await import("./sf-integration.server");
    return setIntegrationFlag(context.profile.id, data);
  });

/**
 * The human half of the re-won-opportunity story. A 409 from the ingest waits
 * for this: a manager says why, and the supersession is recorded against them.
 */
export const createFollowOnImplementation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        oldImplementationId: uuid,
        reason: z.string().trim().min(1, "Say why this is being superseded").max(1000),
        name: z.string().trim().max(200).nullable().optional(),
      })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { supersedeImplementation } = await import("./sf-integration.server");
    return supersedeImplementation(context.profile.id, {
      oldImplementationId: data.oldImplementationId,
      reason: data.reason,
      name: data.name ?? null,
    });
  });
