import { z } from "zod";

import {
  SERVICE_KIND_LIST,
  SERVICE_KINDS,
  serviceWeeks,
  type ServiceKind,
  type ServiceSpec,
} from "./onboarding-services";
import { INTEGRATION_TIERS, type IntegrationTier } from "./onboarding-timeline";

/**
 * The SOW, read into the plan.
 *
 * WHAT THE MODEL IS ASKED FOR. Not dates — never dates. The model reads the
 * SOW and says what was bought, in the catalogue's terms: kind, the name the
 * SOW uses, the tier or length where the SOW says, and which phase it
 * belongs in. The timeline then computes every date from the close date
 * and the rule, the same way it does when a person ticks the list by hand.
 * The model's job is the reading; the plan's job is the calendar.
 *
 * EVERY ROW IS A PROPOSAL. A person reviews the rows, unticks what is
 * wrong, changes a phase, and applies. The SOW stays attached as the
 * record; if it cannot be read, the answer is "manual", not a guess.
 */

const kindEnum = z.enum(SERVICE_KIND_LIST.map((k) => k.kind) as [ServiceKind, ...ServiceKind[]]);

export const sowPlanRowSchema = z.object({
  kind: kindEnum,
  /** The name the SOW uses: "QuickBooks Online", "Invoice PDF", "JSA form". */
  name: z.string().trim().min(1).max(120),
  /** Integrations only: 2 intermediate, 3 advanced, 4 complex, 5 unknown. Null elsewhere. */
  tier: z.number().int().min(2).max(5).nullable(),
  /** Length in weeks when the SOW states one; null to use the catalogue. */
  weeks: z.number().min(0.5).max(52).nullable(),
  /** 1 = alongside the form from kickoff; 2 and up wait for the phase before. */
  phase: z.number().int().min(1).max(4),
  /** What we need from the customer, when the SOW says; null for the catalogue line. */
  needs: z.string().trim().max(300).nullable(),
  /** A short verbatim quote from the SOW that this row rests on. */
  evidence: z.string().trim().max(300).nullable(),
  confidence: z.enum(["stated", "implied", "uncertain"]),
});
export type SowPlanRow = z.infer<typeof sowPlanRowSchema>;

export const sowPlanProposalSchema = z.object({
  readable: z.boolean(),
  problem: z.string().nullable(),
  /** One line: what was bought. */
  summary: z.string(),
  /** The first form, when the SOW names it. */
  first_form: z.string().trim().max(160).nullable(),
  /** Licensed seats as stated, or null. */
  seats: z.number().int().nonnegative().nullable(),
  services: z.array(sowPlanRowSchema).max(20),
  /** Things the SOW says that the plan cannot hold: exclusions, conditions, dates it names. */
  notes: z.array(z.string()).max(20),
  /** What the SOW does not say that the plan needs. */
  gaps: z.array(z.string()).max(20),
});
export type SowPlanProposal = z.infer<typeof sowPlanProposalSchema>;

/** The catalogue, in words the model reads. */
export function catalogueForPrompt(): string {
  const kinds = SERVICE_KIND_LIST.map(
    (k) =>
      `- ${k.kind}: "${k.label}". Default phase ${k.defaultPhase} (${k.defaultPhase === 1 ? "runs alongside the form from the kickoff call" : "waits until the first form is proven"}). Default length ${k.weeks} week${k.weeks === 1 ? "" : "s"}.`,
  ).join("\n");
  const tiers = INTEGRATION_TIERS.filter((t) => t.tier >= 2)
    .map((t) => `- tier ${t.tier}: ${t.name}, ${t.weeks} weeks. ${t.summary}`)
    .join("\n");
  return `Service kinds:\n${kinds}\n\nIntegration tiers (integrations only):\n${tiers}`;
}

/** A proposal row → the service the plan stores. Ids are fresh; the plan computes the dates. */
export function rowToService(row: SowPlanRow, id: string): ServiceSpec {
  const spec: ServiceSpec = { id, kind: row.kind, name: row.name, phase: row.phase };
  if (row.kind === "integration") spec.tier = (row.tier ?? 3) as IntegrationTier;
  else if (row.weeks && row.weeks !== SERVICE_KINDS[row.kind].weeks) spec.weeks = row.weeks;
  if (row.needs) spec.needs = row.needs;
  return spec;
}

/**
 * Merge accepted rows into the list a person already has. A row whose name
 * matches an existing service (case-insensitive) updates that service's
 * phase, tier, weeks and needs rather than adding a twin.
 */
export function mergeProposal(
  existing: ServiceSpec[],
  rows: SowPlanRow[],
  makeId: (row: SowPlanRow) => string,
): ServiceSpec[] {
  const out = [...existing];
  for (const row of rows) {
    const key = row.name.trim().toLowerCase();
    const i = out.findIndex((s) => s.name.trim().toLowerCase() === key);
    const next = rowToService(row, i >= 0 ? out[i]!.id : makeId(row));
    if (i >= 0) out[i] = { ...out[i]!, ...next };
    else out.push(next);
  }
  return out;
}

/** The length the plan will use for a row, for the review table. */
export function rowWeeks(row: SowPlanRow): number {
  return serviceWeeks(rowToService(row, "preview"));
}
