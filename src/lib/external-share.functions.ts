import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/**
 * The internal side of external access. Every function is
 * requireInternalAuth-gated, and the write side additionally checks the
 * caller's role in the server layer (`requireManage`) — issuing a credential to
 * someone outside the company is not something every internal role should be
 * able to do, and it is never flag-gated.
 */

const implementationId = z.string().uuid();
const grantId = z.string().uuid();
const snapshotId = z.string().uuid();

export const getSharePanel = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ implementationId }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data }) => {
    const { loadSharePanel } = await import("./external-share.server");
    return loadSharePanel(data.implementationId);
  });

export const getPlanPreview = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ implementationId }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { previewPlan } = await import("./external-share.server");
    return previewPlan(data.implementationId, context.profile.id);
  });

/**
 * Returns the link ONCE. It is not stored anywhere, so if the issuer loses it
 * the only remedy is to rotate — which is the correct behavior for a
 * credential, and the same contract as an API key.
 */
export const issuePlanLink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        implementationId,
        contactId: z.string().uuid().nullable().optional(),
        email: z.string().trim().email().max(200).nullable().optional(),
        name: z.string().trim().max(120).nullable().optional(),
        canComplete: z.boolean(),
        passcode: z.string().trim().min(4).max(64).nullable().optional(),
        ttlDays: z.number().int().min(1).max(365).nullable().optional(),
        sendEmailToContact: z.boolean().default(true),
      })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { issueGrant } = await import("./external-share.server");
    return issueGrant(
      {
        implementationId: data.implementationId,
        contactId: data.contactId ?? null,
        email: data.email ?? null,
        name: data.name ?? null,
        canComplete: data.canComplete,
        passcode: data.passcode ?? null,
        ttlDays: data.ttlDays ?? null,
        sendEmailToContact: data.sendEmailToContact,
      },
      {
        id: context.profile.id,
        role: context.profile.role,
        name: context.profile.full_name ?? context.profile.email,
      },
    );
  });

export const revokePlanLink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ grantId }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { revokeGrant } = await import("./external-share.server");
    return revokeGrant(data.grantId, { id: context.profile.id, role: context.profile.role });
  });

export const rotatePlanLink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ grantId, ttlDays: z.number().int().min(1).max(365).nullable().optional() })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { rotateGrant } = await import("./external-share.server");
    return rotateGrant(
      data.grantId,
      {
        id: context.profile.id,
        role: context.profile.role,
        name: context.profile.full_name ?? context.profile.email,
      },
      data.ttlDays ?? null,
    );
  });

export const setPlanLinkPasscode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ grantId, passcode: z.string().trim().min(4).max(64).nullable() }).parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { setGrantPasscode } = await import("./external-share.server");
    return setGrantPasscode(data.grantId, data.passcode, {
      id: context.profile.id,
      role: context.profile.role,
    });
  });

/* ------------------------------- snapshots ------------------------------- */

export const getPlanSnapshots = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ implementationId }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data }) => {
    const { listSnapshots } = await import("./snapshots.server");
    return listSnapshots(data.implementationId);
  });

export const generatePlanSnapshot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ implementationId, supersedes: z.string().uuid().nullable().optional() }).parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { generateSnapshot } = await import("./snapshots.server");
    return generateSnapshot(data.implementationId, context.profile.id, {
      supersedes: data.supersedes ?? null,
    });
  });

export const sharePlanSnapshot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ snapshotId }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { mintSnapshotShare } = await import("./snapshots.server");
    return mintSnapshotShare(data.snapshotId, { id: context.profile.id });
  });

export const revokePlanSnapshotShare = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ snapshotId }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { revokeSnapshotShare } = await import("./snapshots.server");
    return revokeSnapshotShare(data.snapshotId, { id: context.profile.id });
  });
