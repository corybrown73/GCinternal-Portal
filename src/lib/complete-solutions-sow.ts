import { z } from "zod/v4";

import {
  COMPONENT_CATEGORIES,
  INTEGRATION_TYPES,
  PRIORITIES,
  SOLUTION_SCOPES,
  suggestTargetDate,
  type ComponentCategory,
  type IntegrationType,
  type Priority,
  type SolutionScope,
} from "./complete-solutions";

/**
 * What a reading of a signed SOW may propose: complete solutions, their
 * components, the dependencies between them, and what the SOW leaves open.
 *
 * A PROPOSAL, NEVER A RECORD. Nothing here is saved. The TIS reviews, edits and
 * confirms the set, and only then is it written (complete-solutions.server.ts).
 *
 * THE RULES THE READING MUST KEEP (and this file enforces the ones a parser can):
 * - Only what the SOW says. Anything it does not name is left out, and the
 *   reading lists it as a gap rather than filling it in.
 * - Scope is the SOW's. Work it lists as included is purchased. Work it describes
 *   as a request, an option or not yet approved is requested, so the two are
 *   never confused.
 * - A date is suggested only when the SOW gives a start date AND a duration. See
 *   suggestTargetDate; this file does not invent one.
 * - Every item keeps the SOW's own words (sowQuote) so the TIS can check it.
 */

const text = (max: number) =>
  z
    .unknown()
    .transform((v) => (typeof v === "string" ? v.trim().slice(0, max) : ""))
    .transform((v) => (v === "" ? null : v));

const weeks = z.unknown().transform((v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 520 ? Math.round(n) : null;
});

const isoOrNull = z
  .unknown()
  .transform((v) =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null,
  );

const oneOf = <T extends readonly string[]>(values: T, fallback: T[number]) =>
  z
    .unknown()
    .transform((v): T[number] =>
      typeof v === "string" && (values as readonly string[]).includes(v)
        ? (v as T[number])
        : fallback,
    );

const list = (max: number) =>
  z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v : []))
    .transform((arr) =>
      arr
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter((x) => x !== "")
        .slice(0, max),
    );

export const sowComponentSchema = z.object({
  category: oneOf(COMPONENT_CATEGORIES, "other"),
  integrationType: z
    .unknown()
    .transform((v): IntegrationType | null =>
      typeof v === "string" && (INTEGRATION_TYPES as readonly string[]).includes(v)
        ? (v as IntegrationType)
        : null,
    ),
  name: text(200),
  priority: oneOf(PRIORITIES, "deliver_during_implementation"),
  dependsOn: list(20),
  critical: z.unknown().transform((v) => v === true),
  /** The component's own start date, only if the SOW gives one. */
  startDate: isoOrNull,
  startCondition: text(1000),
  estimateWeeks: weeks,
  sowQuote: text(2000),
});

export const sowSolutionSchema = z.object({
  title: text(200),
  // Unless the SOW clearly lists the work as included, it is requested: a
  // proposal is never counted as purchased by default.
  scope: oneOf(SOLUTION_SCOPES, "requested"),
  startDate: isoOrNull,
  startCondition: text(1000),
  estimateWeeks: weeks,
  sowQuote: text(2000),
  components: z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v : []))
    .pipe(z.array(sowComponentSchema).max(60)),
});

export const sowReadingSchema = z.object({
  readable: z.unknown().transform((v) => v !== false),
  problem: text(500),
  solutions: z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v : []))
    .pipe(z.array(sowSolutionSchema).max(30)),
  gaps: list(40),
});

export type SowComponentProposal = z.infer<typeof sowComponentSchema>;
export type SowSolutionProposal = z.infer<typeof sowSolutionSchema>;
export type SowReading = z.infer<typeof sowReadingSchema>;

/**
 * The set as the TIS reviews it: each solution and component with the date the
 * reading suggests (null when the SOW does not allow one). The TIS may change
 * any of it before saving.
 */
export type ReviewedSolution = {
  title: string;
  scope: SolutionScope;
  /** The purchase record item this solution delivers: a match the person confirms, never assumed. */
  purchasedServiceId?: string | null | undefined;
  startCondition: string | null;
  estimateWeeks: number | null;
  sowQuote: string | null;
  suggestedTarget: string | null;
  targetReason: string;
  components: ReviewedComponent[];
};

export type ReviewedComponent = {
  category: ComponentCategory;
  integrationType: IntegrationType | null;
  name: string;
  priority: Priority;
  dependsOn: string[];
  critical: boolean;
  startCondition: string | null;
  estimateWeeks: number | null;
  sowQuote: string | null;
  suggestedTarget: string | null;
};

/**
 * Turns a parsed reading into the set the TIS reviews. Duplicate names inside
 * one solution are merged, dependencies on names the reading does not contain
 * are dropped (and the drop is reported as a gap), and every date goes through
 * suggestTargetDate.
 */
export function reviewedSetFrom(reading: SowReading): {
  solutions: ReviewedSolution[];
  gaps: string[];
} {
  const gaps = [...reading.gaps];
  const seenTitles = new Set<string>();
  const solutions: ReviewedSolution[] = [];

  for (const s of reading.solutions) {
    if (!s.title) continue;
    const key = s.title.toLowerCase();
    if (seenTitles.has(key)) {
      gaps.push(`"${s.title}" appears more than once in the SOW; only the first is proposed.`);
      continue;
    }
    seenTitles.add(key);

    const names = new Set<string>();
    const components: ReviewedComponent[] = [];
    for (const c of s.components) {
      if (!c.name) continue;
      const cKey = c.name.toLowerCase();
      if (names.has(cKey)) continue;
      names.add(cKey);
      components.push({
        category: c.category,
        integrationType: c.category === "integrations" ? c.integrationType : null,
        name: c.name,
        priority: c.priority,
        dependsOn: c.dependsOn,
        critical: c.critical,
        startCondition: c.startCondition,
        estimateWeeks: c.estimateWeeks,
        sowQuote: c.sowQuote,
        // A component is dated only from its own stated start and duration. The
        // solution's start is not assumed to be the component's.
        suggestedTarget: suggestTargetDate({
          startDate: c.startDate,
          estimateWeeks: c.estimateWeeks,
        }).date,
      });
    }
    // A dependency on a name the reading does not contain is not kept.
    for (const c of components) {
      const known = c.dependsOn.filter(
        (d) => names.has(d.toLowerCase()) && d.toLowerCase() !== c.name.toLowerCase(),
      );
      if (known.length !== c.dependsOn.length) {
        gaps.push(
          `${c.name} depends on something the SOW does not name as a component of "${s.title}".`,
        );
      }
      c.dependsOn = known;
    }

    const solutionDate = suggestTargetDate({
      startDate: s.startDate,
      estimateWeeks: s.estimateWeeks,
    });
    solutions.push({
      title: s.title,
      scope: s.scope,
      startCondition: s.startCondition,
      estimateWeeks: s.estimateWeeks,
      sowQuote: s.sowQuote,
      suggestedTarget: solutionDate.date,
      targetReason: solutionDate.reason,
      components,
    });
  }

  if (solutions.length === 0 && reading.problem) gaps.push(reading.problem);
  return { solutions, gaps };
}

/** Whether a title already names an active solution, compared without case or spacing. */
export function sameName(a: string, b: string): boolean {
  return (
    a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase()
  );
}

/**
 * A solution takes the priority of its most urgent component: anything needed
 * for go-live makes the solution needed for go-live. Nothing to go on gives the
 * default, deliver during implementation.
 */
export function prioritiesOf(components: ReadonlyArray<{ priority: Priority }>): Priority {
  if (components.some((c) => c.priority === "needed_for_go_live")) return "needed_for_go_live";
  if (components.some((c) => c.priority === "deliver_during_implementation")) {
    return "deliver_during_implementation";
  }
  return components.length ? "planned_for_later" : "deliver_during_implementation";
}
