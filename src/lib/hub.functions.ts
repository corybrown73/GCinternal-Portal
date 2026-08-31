import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { EDITABLE_RECORD_FIELD_KEYS, type EditableRecordField } from "./record-fields";
import { advanceStageInput } from "./stage-advance-input";
import { analyzeSowInput, applySowProposalInput, setSowDocumentInput } from "./sow-analysis";
import { SOLUTION_STATUSES } from "./solution-enums";
import {
  createFieldMappingInput,
  createSolutionNoteInput,
  toFieldMappingPatch,
  updateFieldMappingInput,
  updateSolutionDesignInput,
} from "./solution-note-input";
import {
  createSuccessCriterionInput,
  toSuccessCriterionPatch,
  updateSuccessCriterionInput,
} from "./success-criterion-input";
import {
  createConfirmationInput,
  createObservationInput,
  toObservationRow,
  updateConfirmationInput,
} from "./success-observation-input";
import {
  createCustomerContactInput,
  toCustomerContactPatch,
  updateCustomerContactInput,
} from "./customer-contact-input";
import {
  createAdoptionAreaInput,
  createAdoptionObservationInput,
  toAdoptionAreaPatch,
  toAdoptionObservationRow,
  updateAdoptionAreaInput,
} from "./adoption-input";
import {
  createCommitmentInput,
  createDecisionInput,
  createEscalationInput,
  createIssueInput,
  createRequirementInput,
  createRiskInput,
  toCommitmentPatch,
  toDecisionPatch,
  toEscalationPatch,
  toIssuePatch,
  toRequirementPatch,
  toRiskPatch,
  updateCommitmentInput,
  updateDecisionInput,
  updateEscalationInput,
  updateIssueInput,
  updateRequirementInput,
  updateRiskInput,
} from "./delivery-input";
import {
  createApprovalInput,
  createEvidenceInput,
  toApprovalPatch,
  toEvidencePatch,
  updateApprovalInput,
  updateEvidenceInput,
} from "./evidence-input";
import {
  attachmentPathInput,
  createJournalEntryInput,
  uploadAttachmentInput,
  uploadCustomerLogoInput,
} from "./journal-input";
import {
  createImplementationInput,
  toCustomerPatch,
  toImplementationPatch,
  toImplementationUpdatePatch,
  updateImplementationInput,
  updateImplementationInputChecked,
  toRecordedHealthPatch,
} from "./implementation-input";

/**
 * `scope` is the only thing these accept, and the server resolves WHO from
 * `context.profile` — never from the request. A caller may ask to see all
 * accounts or a named colleague's; it may not ask to be somebody else.
 *
 * The scope also travels back in the response, resolved, so the header can name
 * whose book is on screen without a second round trip. A filtered list that
 * does not say it is filtered is how somebody concludes an account was deleted.
 */
const scopeInput = (data: unknown) =>
  z
    .object({ scope: z.string().trim().max(60).optional() })
    .optional()
    .parse(data) ?? {};

export const getHome = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator(scopeInput)
  .handler(async ({ data, context }) => {
    const { loadHome } = await import("./hub.server");
    const { resolveScope } = await import("./ownership.server");
    const { describeScope } = await import("./ownership");
    const resolved = await resolveScope(context.profile.id, data?.scope ?? null);
    const home = await loadHome(resolved);
    return {
      ...home,
      scope: {
        mode: resolved.scope.mode,
        person_id: resolved.scope.personId,
        label: describeScope(resolved.scope, resolved.viewer, resolved.personName),
        viewer_name: resolved.viewer.name,
      },
    };
  });

export const getLeadership = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator(scopeInput)
  .handler(async ({ data, context }) => {
    const { loadLeadership } = await import("./hub.server");
    const { resolveScope } = await import("./ownership.server");
    const { describeScope } = await import("./ownership");
    const resolved = await resolveScope(context.profile.id, data?.scope ?? null);
    const leadership = await loadLeadership(resolved);
    return {
      ...leadership,
      scope: {
        mode: resolved.scope.mode,
        person_id: resolved.scope.personId,
        label: describeScope(resolved.scope, resolved.viewer, resolved.personName),
        viewer_name: resolved.viewer.name,
      },
    };
  });

export const getCustomer360 = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        customerId: z.string().uuid(),
        implementationId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { loadCustomer360 } = await import("./hub.server");
    // Fail at 8s rather than hanging to the platform's 20s function limit.
    //
    // When this page timed out at 20s the client got an unhandled 500 with the
    // message "HTTPError" and the page simply never rendered — no error, no
    // spinner, indistinguishable from a hang. Eight seconds is well beyond what
    // this load should ever take and still leaves room to say something useful.
    //
    // This bounds the RESPONSE, not the queries: Supabase's REST calls are not
    // cancelled by it, so the work may finish after we have stopped waiting.
    // That is acceptable for a read — the point is that the person gets an
    // answer instead of a blank pane.
    const TIMEOUT_MS = 8000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        loadCustomer360(data.customerId, data.implementationId ?? null),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Loading this implementation took longer than 8 seconds. Nothing was changed — reload to try again.",
                ),
              ),
            TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  });

export const getTechnicalSolutions = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadTechnicalSolutions } = await import("./hub.server");
    return loadTechnicalSolutions();
  });

export const getTechnicalSolution = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { loadTechnicalSolution } = await import("./hub.server");
    return loadTechnicalSolution(data.id);
  });

export const setTechnicalSolutionOwner = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), ownerId: z.string().uuid().nullable() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { updateTechnicalSolutionOwner } = await import("./hub.server");
    return updateTechnicalSolutionOwner(data.id, data.ownerId);
  });

export const setTechnicalSolutionStatus = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(SOLUTION_STATUSES) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { updateTechnicalSolutionStatus } = await import("./hub.server");
    return updateTechnicalSolutionStatus(data.id, data.status);
  });

export const createTechnicalSolutionNote = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createSolutionNoteInput.parse(data))
  .handler(async ({ data }) => {
    const { addTechnicalSolutionNote } = await import("./hub.server");
    return addTechnicalSolutionNote(data);
  });

export const addFieldMapping = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createFieldMappingInput.parse(data))
  .handler(async ({ data }) => {
    const { createFieldMapping } = await import("./hub.server");
    const { technicalSolutionId, ...rest } = data;
    return createFieldMapping(technicalSolutionId, toFieldMappingPatch(rest));
  });

export const setFieldMapping = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateFieldMappingInput.parse(data))
  .handler(async ({ data }) => {
    const { updateFieldMapping } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateFieldMapping(id, toFieldMappingPatch(rest));
  });

export const setSolutionDesign = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateSolutionDesignInput.parse(data))
  .handler(async ({ data }) => {
    const { updateTechnicalSolutionDesign } = await import("./hub.server");
    return updateTechnicalSolutionDesign(data.id, {
      design_summary: data.designSummary,
      configuration_details: data.configurationDetails,
    });
  });

export const addSuccessCriterion = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createSuccessCriterionInput.parse(data))
  .handler(async ({ data }) => {
    const { createSuccessCriterion } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createSuccessCriterion(implementationId, toSuccessCriterionPatch(rest));
  });

export const setSuccessCriterion = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateSuccessCriterionInput.parse(data))
  .handler(async ({ data }) => {
    const { updateSuccessCriterion } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateSuccessCriterion(id, toSuccessCriterionPatch(rest));
  });

export const addSuccessCriterionObservation = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createObservationInput.parse(data))
  .handler(async ({ data }) => {
    const { createSuccessCriterionObservation } = await import("./hub.server");
    return createSuccessCriterionObservation(toObservationRow(data));
  });

export const addSuccessCriterionConfirmation = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createConfirmationInput.parse(data))
  .handler(async ({ data }) => {
    const { createSuccessCriterionConfirmation } = await import("./hub.server");
    return createSuccessCriterionConfirmation(data);
  });

export const setSuccessCriterionConfirmation = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateConfirmationInput.parse(data))
  .handler(async ({ data }) => {
    const { updateSuccessCriterionConfirmation } = await import("./hub.server");
    return updateSuccessCriterionConfirmation(data.id, {
      status: data.status,
      evidenceId: data.evidenceId,
    });
  });

export const addAdoptionArea = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createAdoptionAreaInput.parse(data))
  .handler(async ({ data }) => {
    const { createAdoptionArea } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createAdoptionArea(implementationId, toAdoptionAreaPatch(rest));
  });

export const setAdoptionArea = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateAdoptionAreaInput.parse(data))
  .handler(async ({ data }) => {
    const { updateAdoptionArea } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateAdoptionArea(id, toAdoptionAreaPatch(rest));
  });

export const addAdoptionObservation = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createAdoptionObservationInput.parse(data))
  .handler(async ({ data }) => {
    const { createAdoptionObservation } = await import("./hub.server");
    return createAdoptionObservation(toAdoptionObservationRow(data));
  });

export const addCustomerContact = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createCustomerContactInput.parse(data))
  .handler(async ({ data }) => {
    const { createCustomerContact } = await import("./hub.server");
    const { customerId, ...rest } = data;
    return createCustomerContact(customerId, toCustomerContactPatch(rest));
  });

export const setCustomerContact = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateCustomerContactInput.parse(data))
  .handler(async ({ data }) => {
    const { updateCustomerContact } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateCustomerContact(id, toCustomerContactPatch(rest));
  });

export const getTeamOptions = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadTeamOptions } = await import("./hub.server");
    return loadTeamOptions();
  });

export const getDealOptions = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadDealOptions } = await import("./hub.server");
    return loadDealOptions();
  });

export const addImplementation = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createImplementationInput.parse(data))
  .handler(async ({ data, context }) => {
    const { createImplementation } = await import("./hub.server");
    return createImplementation({
      customerId: data.customerId,
      newCustomer: data.newCustomer ? toCustomerPatch(data.newCustomer) : null,
      patch: toImplementationPatch(data),
      // Authorship of the plan this creates, through the profile id — the same
      // bridge setImplementation uses for the activity feed.
      actorProfileId: context.profile.id,
    });
  });

export const setRecordField = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        implementationId: z.string().uuid(),
        field: z.enum(
          EDITABLE_RECORD_FIELD_KEYS as [EditableRecordField, ...EditableRecordField[]],
        ),
        value: z.string().max(2000).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { updateRecordField } = await import("./hub.server");
    return updateRecordField({
      implementationId: data.implementationId,
      field: data.field,
      value: data.value,
      actorProfileId: context.profile.id,
    });
  });

export const setImplementation = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateImplementationInputChecked.parse(data))
  .handler(async ({ data, context }) => {
    const { updateImplementation } = await import("./hub.server");
    // health_recorded is the human's statement, so it is stamped with the
    // person who saved it — resolved through the profile's team_member bridge.
    return updateImplementation(
      data.id,
      {
        ...toImplementationUpdatePatch(data),
        ...toRecordedHealthPatch(data, {
          teamMemberId: context.profile.team_member_id ?? null,
        }),
      },
      // Phase 7: the account activity feed attributes through the same bridge.
      { actorProfileId: context.profile.id },
    );
  });

export const advanceImplementationStage = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => advanceStageInput.parse(data))
  .handler(async ({ data, context }) => {
    const { advanceStage } = await import("./hub.server");
    return advanceStage({
      implementationId: data.implementationId,
      toStage: data.toStage,
      // BUG-11: implementation_stage_history.entered_by was null on every row,
      // so the post-sale History tab showed a stage change with no actor while
      // the pre-sale one showed full attribution.
      //
      // The cause was not a missing write — it was asking the client a question
      // the server could already answer. "Recorded by" is an optional dropdown
      // that defaults to "Not stated", and nobody fills in a field about
      // themselves. So it now defaults to the authenticated caller, resolved
      // through the portal_profiles -> team_members bridge because entered_by
      // references team_members.
      //
      // An explicit choice still wins: recording a move on a colleague's behalf
      // is a real thing, and the person doing it is the one who should say so.
      enteredBy: data.enteredBy ?? context.profile.team_member_id ?? null,
      notes: data.notes,
    });
  });

/* ---------- P0 Slice 3: delivery record write paths ---------- */

export const addRequirement = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createRequirementInput.parse(data))
  .handler(async ({ data, context }) => {
    const { createRequirement } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createRequirement(implementationId, toRequirementPatch(rest), {
      actorProfileId: context.profile.id,
    });
  });

export const setRequirement = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateRequirementInput.parse(data))
  .handler(async ({ data, context }) => {
    const { updateRequirement } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateRequirement(id, toRequirementPatch(rest), { actorProfileId: context.profile.id });
  });

export const addRisk = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createRiskInput.parse(data))
  .handler(async ({ data, context }) => {
    const { createRisk } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createRisk(implementationId, toRiskPatch(rest), {
      actorProfileId: context.profile.id,
    });
  });

export const setRisk = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateRiskInput.parse(data))
  .handler(async ({ data, context }) => {
    const { updateRisk } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateRisk(id, toRiskPatch(rest), { actorProfileId: context.profile.id });
  });

export const addIssue = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createIssueInput.parse(data))
  .handler(async ({ data, context }) => {
    const { createIssue } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createIssue(implementationId, toIssuePatch(rest), {
      actorProfileId: context.profile.id,
    });
  });

export const setIssue = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateIssueInput.parse(data))
  .handler(async ({ data, context }) => {
    const { updateIssue } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateIssue(id, toIssuePatch(rest), { actorProfileId: context.profile.id });
  });

export const addEscalation = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createEscalationInput.parse(data))
  .handler(async ({ data, context }) => {
    const { createEscalation } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createEscalation(implementationId, toEscalationPatch(rest), {
      actorProfileId: context.profile.id,
    });
  });

export const setEscalation = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateEscalationInput.parse(data))
  .handler(async ({ data, context }) => {
    const { updateEscalation } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateEscalation(id, toEscalationPatch(rest), { actorProfileId: context.profile.id });
  });

export const addDecision = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createDecisionInput.parse(data))
  .handler(async ({ data, context }) => {
    const { createDecision } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createDecision(implementationId, toDecisionPatch(rest), {
      actorProfileId: context.profile.id,
    });
  });

export const setDecision = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateDecisionInput.parse(data))
  .handler(async ({ data, context }) => {
    const { updateDecision } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateDecision(id, toDecisionPatch(rest), { actorProfileId: context.profile.id });
  });

export const addCommitment = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createCommitmentInput.parse(data))
  .handler(async ({ data, context }) => {
    const { createCommitment } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createCommitment(implementationId, toCommitmentPatch(rest), {
      actorProfileId: context.profile.id,
    });
  });

export const setCommitment = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateCommitmentInput.parse(data))
  .handler(async ({ data, context }) => {
    const { updateCommitment } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateCommitment(id, toCommitmentPatch(rest), { actorProfileId: context.profile.id });
  });

/* ---------- Slice 4: evidence + approval request write paths ---------- */

export const addEvidence = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createEvidenceInput.parse(data))
  .handler(async ({ data }) => {
    const { createEvidence } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createEvidence(implementationId, toEvidencePatch(rest));
  });

export const setEvidence = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateEvidenceInput.parse(data))
  .handler(async ({ data }) => {
    const { updateEvidence } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateEvidence(id, toEvidencePatch(rest));
  });

export const addApproval = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createApprovalInput.parse(data))
  .handler(async ({ data }) => {
    const { createApproval } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createApproval(implementationId, toApprovalPatch(rest));
  });

export const setApproval = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateApprovalInput.parse(data))
  .handler(async ({ data }) => {
    const { updateApproval } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateApproval(id, toApprovalPatch(rest));
  });

/* ---------- Working notes + attachments ---------- */

export const addJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createJournalEntryInput.parse(data))
  .handler(async ({ data }) => {
    const { createJournalEntry } = await import("./hub.server");
    return createJournalEntry(data);
  });

export const uploadAttachment = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => uploadAttachmentInput.parse(data))
  .handler(async ({ data }) => {
    const { storeAttachment } = await import("./hub.server");
    return storeAttachment(data);
  });

export const uploadCustomerLogo = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => uploadCustomerLogoInput.parse(data))
  .handler(async ({ data }) => {
    const { storeCustomerLogo } = await import("./hub.server");
    return storeCustomerLogo(data);
  });

export const getAttachmentLink = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => attachmentPathInput.parse(data))
  .handler(async ({ data }) => {
    const { attachmentLink } = await import("./hub.server");
    return attachmentLink(data.path);
  });

/* ---------- SOW analysis (read-only proposal) ---------- */

export const analyzeSowDocument = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => analyzeSowInput.parse(data))
  .handler(async ({ data }) => {
    const { analyzeSow } = await import("./sow-analysis.server");
    return analyzeSow(data.implementationId);
  });

export const applySowProposalToImplementation = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => applySowProposalInput.parse(data))
  .handler(async ({ data }) => {
    const { applySowProposal } = await import("./sow-analysis.server");
    return applySowProposal(data);
  });

export const setSowDocumentForImplementation = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => setSowDocumentInput.parse(data))
  .handler(async ({ data }) => {
    const { setSowDocument } = await import("./sow-analysis.server");
    return setSowDocument(data);
  });
