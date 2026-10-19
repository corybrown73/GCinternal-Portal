import { intakeAnswersSchema, type IntakeAnswers } from "./intake-answers";
import {
  PARTNERS,
  implementationTypeFor,
  isPartnerDeal,
  isPartnerJourney,
} from "./partner-implementation";

/**
 * Which documents a project may have generated. Pure, so the rule is stated
 * once and every generator asks the same question.
 *
 * A partner implementation plans through the partner journey, not through the
 * standard kickoff deck or the standard onboarding plan deck. So neither is
 * generated for one. A partner deal that has no project yet is refused the same
 * way, so a standard deck cannot be drawn for it before it starts.
 *
 * The deal's stored intake is read in four states (readIntakeReading). Only
 * explicit partner evidence refuses a standard deal. An intake that cannot be
 * read also refuses, because its partner status cannot be ruled out.
 *
 * Standard implementations are not affected: their documents generate as before.
 */
export type GeneratedDocument = "kickoff-deck" | "onboarding-plan";

const DOCUMENT_NAME: Record<GeneratedDocument, string> = {
  "kickoff-deck": "kickoff deck",
  "onboarding-plan": "onboarding plan deck",
};

/**
 * What a deal's stored intake says about its partner status:
 *  - "absent": no intake was ever saved. Partner selection always saves one, so
 *    a partner deal cannot be in this state. It reads as the app reads an empty
 *    intake: a New Logo, with no partner evidence to refuse on.
 *  - "standard": an intake that parses and carries no partner classification. A
 *    null path is here too. The app's plan treats it as a New Logo, and a partner
 *    choice always records a path or a partner key, which reads as "partner".
 *  - "partner": explicit partner evidence: a partner path, a legacy Field Fusion
 *    path, or a partner key. Found in an intake that parses, or in one that does not.
 *  - "malformed": an intake that does not parse and shows no partner evidence.
 *    Its partner status cannot be ruled out, so it is refused.
 */
export type IntakeReading = "absent" | "standard" | "partner" | "malformed";

export function readIntakeReading(raw: unknown): IntakeReading {
  if (raw === null || raw === undefined) return "absent";
  const parsed = intakeAnswersSchema.safeParse(raw);
  if (parsed.success) return intakeSaysPartner(parsed.data) ? "partner" : "standard";
  return rawSaysPartner(raw) ? "partner" : "malformed";
}

/** Whether a parsed intake says partner, by its path or its partner choice, as the partner start reads them. */
function intakeSaysPartner(
  intake: Pick<IntakeAnswers, "path" | "partner_implementation">,
): boolean {
  return isPartnerDeal(intake) || implementationTypeFor(intake).type === "partner_implementation";
}

/**
 * Partner evidence in an intake that does not parse, read field by field with
 * the same signals: the partner path, a legacy Field Fusion path, or any partner
 * choice recorded. A malformed intake cannot hide these.
 */
function rawSaysPartner(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const fields = raw as Record<string, unknown>;
  if (fields["path"] === "partner_implementation") return true;
  if (Object.values(PARTNERS).some((p) => p.legacyIntakePath === fields["path"])) return true;
  const choice = fields["partner_implementation"];
  return choice !== null && choice !== undefined;
}

export type DocumentSubject = {
  /** The project, if one exists. Its journey decides, by isPartnerJourney(). */
  implementation: { journey_type?: string | null; partner_key?: string | null } | null;
  /** The deal's stored intake, as it was read. Read through readIntakeReading. */
  intake: unknown;
};

/**
 * The reason a document cannot be generated for this subject, in words a person
 * can act on. Null when the document may be generated.
 */
export function documentRefusal(
  document: GeneratedDocument,
  subject: DocumentSubject,
): string | null {
  const name = DOCUMENT_NAME[document];

  if (subject.implementation && isPartnerJourney(subject.implementation)) {
    return `No ${name} is generated for a partner implementation. Its planning is the partner journey, shown in Current Implementation, so there is no standard ${name} to make.`;
  }

  const reading = readIntakeReading(subject.intake);
  if (reading === "partner") {
    return `No ${name} is generated for a partner deal. Its planning is the partner journey, which starts with the partner implementation, so there is no standard ${name} to make yet.`;
  }
  if (reading === "malformed") {
    return `The deal's intake could not be read, so it cannot be ruled out as a partner deal. No ${name} is generated until the intake is repaired. Nothing was generated.`;
  }
  return null;
}
