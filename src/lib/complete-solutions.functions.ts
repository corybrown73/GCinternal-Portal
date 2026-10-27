import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireDealEditor,
  requireInternalAuth,
} from "@/integrations/supabase/internal-middleware";

import {
  COMPONENT_CATEGORIES,
  COMPONENT_STATUSES,
  confirmReadinessInput,
  createComponentInput,
  createSolutionInput,
  dependencyInput,
  formTrackingInput,
  INTEGRATION_TYPES,
  isoDate,
  PRIORITIES,
  READINESS,
  SOLUTION_SCOPES,
  SOLUTION_STATUSES,
  setSolutionTargetInput,
  updateComponentInput,
  updateSolutionInput,
  versionInput,
} from "./complete-solutions";

/**
 * Server functions for complete solutions. Reads need any signed-in internal
 * role. Writes need an internal role (requireDealEditor), and the database then
 * decides whether this person may change this implementation's solutions: a
 * manager or admin any implementation, an implementation owner their own, and
 * nobody else. The acting person is always the signed-in profile, never a field
 * in the request.
 *
 * Each handler checks the `complete_solutions` flag first. The flag hides the
 * feature; it is not a permission (see feature-flags.ts).
 */

const uuid = z.string().uuid();

async function assertEnabled(): Promise<void> {
  const { isFlagOn } = await import("./app-config.server");
  if (!(await isFlagOn("complete_solutions"))) {
    throw new Error("Complete solutions are not turned on for this Hub yet.");
  }
}

export const getCompleteSolutions = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ implementationId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { loadWorkspace } = await import("./complete-solutions.server");
    return loadWorkspace(data.implementationId, context.profile.id);
  });

export const getCompleteSolutionHistory = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ solutionId: uuid }).parse(data))
  .handler(async ({ data }) => {
    await assertEnabled();
    const { loadSolutionHistory } = await import("./complete-solutions.server");
    return loadSolutionHistory(data.solutionId);
  });

export const addCompleteSolution = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => createSolutionInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { createCompleteSolution } = await import("./complete-solutions.server");
    return createCompleteSolution(
      {
        implementationId: data.implementationId,
        title: data.title,
        scope: data.scope,
        priority: data.priority,
        startCondition: data.startCondition ?? null,
        estimateWeeks: data.estimateWeeks ?? null,
        sowQuote: data.sowQuote ?? null,
        nextAction: data.nextAction ?? null,
      },
      context.profile.id,
    );
  });

export const editCompleteSolution = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => updateSolutionInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { updateCompleteSolution } = await import("./complete-solutions.server");
    const { id, expectedUpdatedAt, ...patch } = data;
    return updateCompleteSolution(id, patch, expectedUpdatedAt, context.profile.id);
  });

export const setCompleteSolutionTarget = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => setSolutionTargetInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { setSolutionTargetDate } = await import("./complete-solutions.server");
    return setSolutionTargetDate(
      data.id,
      data.targetDate,
      data.reason ?? null,
      data.expectedUpdatedAt,
      context.profile.id,
    );
  });

export const confirmCompleteSolutionReadiness = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => confirmReadinessInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { confirmSolutionReadiness } = await import("./complete-solutions.server");
    return confirmSolutionReadiness(
      data.id,
      data.readiness,
      data.reason ?? null,
      data.expectedUpdatedAt,
      context.profile.id,
    );
  });

export const archiveCompleteSolution = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        archived: z.boolean(),
        reason: z.string().trim().max(500).nullable().optional(),
        expectedUpdatedAt: versionInput,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { setSolutionArchived } = await import("./complete-solutions.server");
    return setSolutionArchived(
      data.id,
      data.archived,
      data.reason ?? null,
      data.expectedUpdatedAt,
      context.profile.id,
    );
  });

export const addSolutionComponent = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => createComponentInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { createComponent } = await import("./complete-solutions.server");
    return createComponent(
      {
        solutionId: data.solutionId,
        category: data.category,
        integrationType: data.integrationType ?? null,
        name: data.name,
        priority: data.priority,
        targetDate: data.targetDate ?? null,
        startCondition: data.startCondition ?? null,
        estimateWeeks: data.estimateWeeks ?? null,
        nextAction: data.nextAction ?? null,
        sowQuote: data.sowQuote ?? null,
      },
      context.profile.id,
    );
  });

export const editSolutionComponent = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => updateComponentInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { updateComponent } = await import("./complete-solutions.server");
    return updateComponent(data, context.profile.id);
  });

export const setComponentFormTracking = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => formTrackingInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { setFormTracking } = await import("./complete-solutions.server");
    return setFormTracking(data, context.profile.id);
  });

export const addComponentDependency = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => dependencyInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { addDependency } = await import("./complete-solutions.server");
    return addDependency(data, context.profile.id);
  });

export const removeComponentDependency = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => z.object({ componentId: uuid, dependsOnId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { removeDependency } = await import("./complete-solutions.server");
    return removeDependency(data, context.profile.id);
  });

export const archiveSolutionComponent = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        archived: z.boolean(),
        reason: z.string().trim().max(500).nullable().optional(),
        expectedUpdatedAt: versionInput,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { setComponentArchived } = await import("./complete-solutions.server");
    return setComponentArchived(
      data.id,
      data.archived,
      data.reason ?? null,
      data.expectedUpdatedAt,
      context.profile.id,
    );
  });

/** The vocabularies the screens offer, in one place, so the server and the screen agree. */
export const solutionVocabulary = {
  scopes: SOLUTION_SCOPES,
  solutionStatuses: SOLUTION_STATUSES,
  readiness: READINESS,
  priorities: PRIORITIES,
  componentStatuses: COMPONENT_STATUSES,
} as const;

/**
 * A reviewed set as the TIS confirms it. Validated at the boundary: a set that
 * was edited into something the database would refuse is rejected here, before
 * anything is written.
 */
const reviewedComponentInput = z
  .object({
    category: z.enum(COMPONENT_CATEGORIES),
    integrationType: z.enum(INTEGRATION_TYPES).nullable(),
    name: z.string().trim().min(1).max(200),
    priority: z.enum(PRIORITIES),
    dependsOn: z.array(z.string().trim().min(1).max(200)).max(20),
    critical: z.boolean(),
    startCondition: z.string().trim().max(1000).nullable(),
    estimateWeeks: z.number().int().min(1).max(520).nullable(),
    sowQuote: z.string().trim().max(2000).nullable(),
    suggestedTarget: isoDate.nullable(),
  })
  .superRefine((c, ctx) => {
    if (c.integrationType && c.category !== "integrations") {
      ctx.addIssue({
        code: "custom",
        path: ["integrationType"],
        message: "Only an integration has an integration type.",
      });
    }
  });

const reviewedSolutionInput = z.object({
  title: z.string().trim().min(1).max(200),
  scope: z.enum(SOLUTION_SCOPES),
  purchasedServiceId: z.string().trim().min(1).max(100).nullable().optional(),
  startCondition: z.string().trim().max(1000).nullable(),
  estimateWeeks: z.number().int().min(1).max(520).nullable(),
  sowQuote: z.string().trim().max(2000).nullable(),
  suggestedTarget: isoDate.nullable(),
  targetReason: z.string().max(500),
  components: z.array(reviewedComponentInput).max(60),
});

export const suggestSolutionsFromSow = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => z.object({ implementationId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { readSolutionsFromSow } = await import("./complete-solutions-sow.server");
    return readSolutionsFromSow(data.implementationId);
  });

export const saveSuggestedSolutions = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        implementationId: uuid,
        sowName: z.string().trim().max(300).nullable(),
        solutions: z.array(reviewedSolutionInput).min(1).max(30),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { saveReviewedSolutions } = await import("./complete-solutions-sow.server");
    return saveReviewedSolutions(
      data.implementationId,
      data.solutions,
      data.sowName,
      context.profile.id,
    );
  });
