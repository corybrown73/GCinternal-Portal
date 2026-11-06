import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireDealEditor,
  requireInternalAuth,
} from "@/integrations/supabase/internal-middleware";

import {
  DEMONSTRATED_STATUSES,
  needInputCheck,
  TRAINING_METHODS,
  TRAINING_RESPONSIBILITIES,
  demonstrationCheck,
} from "./training-plan";

/**
 * Server functions for the Training & Readiness tab. Reads need any signed-in internal
 * role. Writes need an internal role (requireDealEditor), and the database then decides
 * whether this person may change this implementation's training: the owner, a Team
 * Lead, a manager or an admin. The acting person is always the signed-in profile.
 *
 * Each handler checks the `training_plan` flag first. The flag hides the feature; it is
 * not a permission (see feature-flags.ts). A read while the flag is off returns
 * `enabled: false`, so the screen can say so; a write while it is off is refused.
 */

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const expectedVersion = z.string().min(10).max(40);

const fieldsInput = z.object({
  topic: z.string().trim().max(200).optional(),
  audience: optionalText(500),
  outcome: optionalText(1000),
  method: z.enum(TRAINING_METHODS).nullable().optional(),
  responsibility: z.enum(TRAINING_RESPONSIBILITIES).nullable().optional(),
  responsibilitySource: z.enum(["sow", "tis_confirmed"]).nullable().optional(),
  sowQuote: optionalText(2000),
  nextStep: optionalText(1000),
  purchasedServiceId: z.string().trim().max(100).nullable().optional(),
  solutionComponentId: uuid.nullable().optional(),
  adoptionAreaId: uuid.nullable().optional(),
});

async function flagOn(): Promise<boolean> {
  const { isFlagOn } = await import("./app-config.server");
  return isFlagOn("training_plan");
}

async function assertEnabled(): Promise<void> {
  if (!(await flagOn())) {
    throw new Error("Training & Readiness is not turned on for this Hub yet. Nothing was changed.");
  }
}

function checkFields(input: z.infer<typeof fieldsInput>, requireTopic: boolean): void {
  const check = needInputCheck(
    {
      ...(input.topic !== undefined ? { topic: input.topic } : {}),
      audience: input.audience ?? null,
      outcome: input.outcome ?? null,
      method: input.method ?? null,
      responsibility: input.responsibility ?? null,
      responsibilitySource: input.responsibilitySource ?? null,
      sowQuote: input.sowQuote ?? null,
      nextStep: input.nextStep ?? null,
    },
    { requireTopic },
  );
  if (!check.ok) throw new Error(check.reason);
}

export const getTrainingPlan = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ implementationId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    if (!(await flagOn())) return { enabled: false as const };
    const training = await import("./training.server");
    const [plan, canEdit, evidence] = await Promise.all([
      training.loadTrainingFor(data.implementationId),
      training.canEditTraining(context.profile.id, data.implementationId),
      training.loadEvidenceFor(data.implementationId),
    ]);
    return { enabled: true as const, ...plan, canEdit, evidence };
  });

export const addTrainingNeed = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    fieldsInput.extend({ implementationId: uuid, reason: optionalText(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertEnabled();
    checkFields(data, true);
    const { addTrainingNeed: add } = await import("./training.server");
    return add(
      data.implementationId,
      {
        topic: data.topic ?? "",
        audience: data.audience ?? null,
        outcome: data.outcome ?? null,
        method: data.method ?? null,
        responsibility: data.responsibility ?? null,
        responsibilitySource: data.responsibilitySource ?? null,
        sowQuote: data.sowQuote ?? null,
        nextStep: data.nextStep ?? null,
        purchasedServiceId: data.purchasedServiceId ?? null,
        solutionComponentId: data.solutionComponentId ?? null,
        adoptionAreaId: data.adoptionAreaId ?? null,
      },
      context.profile.id,
      data.reason ?? null,
    );
  });

export const editTrainingNeed = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    fieldsInput
      .extend({ id: uuid, expectedUpdatedAt: expectedVersion, reason: optionalText(500) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertEnabled();
    checkFields(data, false);
    const { updateTrainingNeed } = await import("./training.server");
    const { id, expectedUpdatedAt, reason, ...rest } = data;
    const fields = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    return updateTrainingNeed(id, expectedUpdatedAt, fields, context.profile.id, reason ?? null);
  });

export const recordTrainingDelivery = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        expectedUpdatedAt: expectedVersion,
        deliveredOn: isoDate,
        reason: optionalText(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { recordTrainingDelivery: record } = await import("./training.server");
    return record(
      data.id,
      data.expectedUpdatedAt,
      data.deliveredOn,
      context.profile.id,
      data.reason ?? null,
    );
  });

export const recordTrainingReadiness = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        expectedUpdatedAt: expectedVersion,
        status: z.enum(DEMONSTRATED_STATUSES),
        evidenceId: uuid.nullable().optional(),
        previousStatus: z.enum(DEMONSTRATED_STATUSES),
        reason: optionalText(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const check = demonstrationCheck({
      status: data.status,
      evidenceId: data.evidenceId ?? null,
      previousStatus: data.previousStatus,
      reason: data.reason ?? null,
    });
    if (!check.ok) throw new Error(check.reason);
    const { recordTrainingReadiness: record } = await import("./training.server");
    return record(
      data.id,
      data.expectedUpdatedAt,
      data.status,
      data.status === "demonstrated" ? (data.evidenceId ?? null) : null,
      context.profile.id,
      data.reason ?? null,
    );
  });

export const setTrainingNeedArchived = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        expectedUpdatedAt: expectedVersion,
        archived: z.boolean(),
        reason: optionalText(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { setTrainingArchived } = await import("./training.server");
    return setTrainingArchived(
      data.id,
      data.expectedUpdatedAt,
      data.archived,
      context.profile.id,
      data.reason ?? null,
    );
  });
