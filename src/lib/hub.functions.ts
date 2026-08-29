import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
} from "./journal-input";
import {
  createImplementationInput,
  toCustomerPatch,
  toImplementationPatch,
  toImplementationUpdatePatch,
  updateImplementationInput,
} from "./implementation-input";

export const getHome = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadHome } = await import("./hub.server");
    return loadHome();
  });

export const getLeadership = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadLeadership } = await import("./hub.server");
    return loadLeadership();
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
    return loadCustomer360(data.customerId, data.implementationId ?? null);
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

export const addImplementation = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createImplementationInput.parse(data))
  .handler(async ({ data }) => {
    const { createImplementation } = await import("./hub.server");
    return createImplementation({
      customerId: data.customerId,
      newCustomer: data.newCustomer ? toCustomerPatch(data.newCustomer) : null,
      patch: toImplementationPatch(data),
    });
  });

export const setImplementation = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateImplementationInput.parse(data))
  .handler(async ({ data }) => {
    const { updateImplementation } = await import("./hub.server");
    return updateImplementation(data.id, toImplementationUpdatePatch(data));
  });

export const advanceImplementationStage = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => advanceStageInput.parse(data))
  .handler(async ({ data }) => {
    const { advanceStage } = await import("./hub.server");
    return advanceStage({
      implementationId: data.implementationId,
      toStage: data.toStage,
      enteredBy: data.enteredBy,
      notes: data.notes,
    });
  });

/* ---------- P0 Slice 3: delivery record write paths ---------- */

export const addRequirement = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createRequirementInput.parse(data))
  .handler(async ({ data }) => {
    const { createRequirement } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createRequirement(implementationId, toRequirementPatch(rest));
  });

export const setRequirement = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateRequirementInput.parse(data))
  .handler(async ({ data }) => {
    const { updateRequirement } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateRequirement(id, toRequirementPatch(rest));
  });

export const addRisk = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createRiskInput.parse(data))
  .handler(async ({ data }) => {
    const { createRisk } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createRisk(implementationId, toRiskPatch(rest));
  });

export const setRisk = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateRiskInput.parse(data))
  .handler(async ({ data }) => {
    const { updateRisk } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateRisk(id, toRiskPatch(rest));
  });

export const addIssue = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createIssueInput.parse(data))
  .handler(async ({ data }) => {
    const { createIssue } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createIssue(implementationId, toIssuePatch(rest));
  });

export const setIssue = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateIssueInput.parse(data))
  .handler(async ({ data }) => {
    const { updateIssue } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateIssue(id, toIssuePatch(rest));
  });

export const addEscalation = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createEscalationInput.parse(data))
  .handler(async ({ data }) => {
    const { createEscalation } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createEscalation(implementationId, toEscalationPatch(rest));
  });

export const setEscalation = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateEscalationInput.parse(data))
  .handler(async ({ data }) => {
    const { updateEscalation } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateEscalation(id, toEscalationPatch(rest));
  });

export const addDecision = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createDecisionInput.parse(data))
  .handler(async ({ data }) => {
    const { createDecision } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createDecision(implementationId, toDecisionPatch(rest));
  });

export const setDecision = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateDecisionInput.parse(data))
  .handler(async ({ data }) => {
    const { updateDecision } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateDecision(id, toDecisionPatch(rest));
  });

export const addCommitment = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => createCommitmentInput.parse(data))
  .handler(async ({ data }) => {
    const { createCommitment } = await import("./hub.server");
    const { implementationId, ...rest } = data;
    return createCommitment(implementationId, toCommitmentPatch(rest));
  });

export const setCommitment = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => updateCommitmentInput.parse(data))
  .handler(async ({ data }) => {
    const { updateCommitment } = await import("./hub.server");
    const { id, ...rest } = data;
    return updateCommitment(id, toCommitmentPatch(rest));
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
