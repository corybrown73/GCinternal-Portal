import type { IntakeAnswers } from "./intake-answers";
import { implementationTypeFor, isPartnerDeal, isPartnerJourney } from "./partner-implementation";

/**
 * Which documents a project may have generated. Pure, so the rule is stated
 * once and every generator asks the same question.
 *
 * A partner implementation plans through the partner journey, not through the
 * standard kickoff deck or the standard onboarding plan deck. So neither is
 * generated for one. A partner deal that has no project yet is refused the same
 * way, so a standard deck cannot be drawn for it before it starts.
 *
 * Standard implementations are not affected: their documents generate as before.
 */
export type GeneratedDocument = "kickoff-deck" | "onboarding-plan";

const DOCUMENT_NAME: Record<GeneratedDocument, string> = {
  "kickoff-deck": "kickoff deck",
  "onboarding-plan": "onboarding plan deck",
};

export type DocumentSubject = {
  /** The project, if one exists. Its journey decides, by isPartnerJourney(). */
  implementation: { journey_type?: string | null; partner_key?: string | null } | null;
  /**
   * The deal's intake. A deal whose intake says partner is refused even before a
   * project exists. Both partner answers count: the intake path, and an explicit
   * partner key, as the partner start reads them.
   */
  intake: Pick<IntakeAnswers, "path" | "partner_implementation"> | null;
};

/** Whether the deal's own answers say it is a partner deal. */
export function intakeSaysPartner(intake: DocumentSubject["intake"]): boolean {
  if (!intake) return false;
  return isPartnerDeal(intake) || implementationTypeFor(intake).type === "partner_implementation";
}

/**
 * The reason a document cannot be generated for this subject, in words a person
 * can act on. Null when the document may be generated.
 */
export function documentRefusal(
  document: GeneratedDocument,
  subject: DocumentSubject,
): string | null {
  const partnerProject = subject.implementation ? isPartnerJourney(subject.implementation) : false;
  const partnerDeal = intakeSaysPartner(subject.intake);
  if (!partnerProject && !partnerDeal) return null;

  const name = DOCUMENT_NAME[document];
  if (partnerProject) {
    return `No ${name} is generated for a partner implementation. Its planning is the partner journey, shown in Current Implementation, so there is no standard ${name} to make.`;
  }
  return `No ${name} is generated for a partner deal. Its planning is the partner journey, which starts with the partner implementation, so there is no standard ${name} to make yet.`;
}
