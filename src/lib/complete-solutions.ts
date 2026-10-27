import { z } from "zod";

/**
 * Complete solutions: what a TIS delivers for a customer's implementation.
 *
 *   customer → implementation → complete solution → components
 *
 * This file is pure (no database, no server imports) so the rules that decide
 * what the screen says — readiness, dates, cycles, which status blocks
 * completion — are tested directly and read the same on the server and in the
 * browser.
 *
 * WHAT IS SUGGESTED AND WHAT IS CONFIRMED. Readiness is a suggestion computed
 * from component progress and critical dependencies. It is never a percentage.
 * A person confirms it, and a material change needs a reason. Dates are the
 * same: a SOW estimate can suggest a target only when the SOW also states when
 * the work can start; otherwise no date is invented.
 */

export const SOLUTION_SCOPES = ["purchased", "requested"] as const;
export type SolutionScope = (typeof SOLUTION_SCOPES)[number];
export const SOLUTION_SCOPE_LABEL: Record<SolutionScope, string> = {
  purchased: "Purchased",
  requested: "Requested — not yet approved",
};

export const SOLUTION_STATUSES = ["not_started", "in_progress", "waiting", "complete"] as const;
export type SolutionStatus = (typeof SOLUTION_STATUSES)[number];
export const SOLUTION_STATUS_LABEL: Record<SolutionStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  waiting: "Waiting",
  complete: "Complete",
};

export const READINESS = ["not_ready", "at_risk", "ready"] as const;
export type Readiness = (typeof READINESS)[number];
export const READINESS_LABEL: Record<Readiness, string> = {
  not_ready: "Not ready",
  at_risk: "At risk",
  ready: "Ready",
};

export const PRIORITIES = [
  "needed_for_go_live",
  "deliver_during_implementation",
  "planned_for_later",
] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = {
  needed_for_go_live: "Needed for Go-Live",
  deliver_during_implementation: "Deliver During Implementation",
  planned_for_later: "Planned for Later",
};

export const COMPONENT_CATEGORIES = [
  "forms",
  "integrations",
  "analytics",
  "training",
  "other",
] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<ComponentCategory, string> = {
  forms: "Forms",
  integrations: "Integrations",
  analytics: "Analytics",
  training: "Training",
  other: "Other",
};

/** Dispatch and Dynamic Reference Data are integration types, not categories. */
export const INTEGRATION_TYPES = ["dispatch", "dynamic_reference_data", "system"] as const;
export type IntegrationType = (typeof INTEGRATION_TYPES)[number];
export const INTEGRATION_TYPE_LABEL: Record<IntegrationType, string> = {
  dispatch: "Dispatch",
  dynamic_reference_data: "Dynamic Reference Data",
  system: "Other system",
};

/** The vocabulary the TIS already uses for work in progress. */
export const COMPONENT_STATUSES = [
  "not_started",
  "being_built",
  "waiting",
  "ready_for_testing",
  "changes_needed",
  "complete",
] as const;
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];
export const COMPONENT_STATUS_LABEL: Record<ComponentStatus, string> = {
  not_started: "Not Started",
  being_built: "Being Built",
  waiting: "Waiting",
  ready_for_testing: "Ready for Testing",
  changes_needed: "Changes Needed",
  complete: "Complete",
};

export const SUBMISSION_FIELDS_NOTE =
  "Submission counts are entered by hand, with the date they were checked. A count is not evidence that the customer uses the form: usage is confirmed separately.";

/* ----------------------------------------------------------- suggestions */

export type ReadinessComponent = {
  id: string;
  name: string;
  status: ComponentStatus;
  priority: Priority;
  archived: boolean;
};

export type ReadinessSuggestion = {
  readiness: Readiness;
  /** Plain reasons, each naming the thing that drove the suggestion. */
  reasons: string[];
};

/**
 * Suggested readiness for one complete solution.
 *
 * - Only components needed for go-live count toward readiness. If none are
 *   marked that way, every component not planned for later counts instead.
 * - Not ready while any counted component is not yet complete.
 * - At risk when a counted component is Changes Needed or Waiting, or when a
 *   counted component is held by an open critical dependency.
 * - Ready only when every counted component is complete.
 *
 * Completed components are not weighed against open ones: one open
 * go-live component keeps the solution not ready however many are done.
 */
export function suggestReadiness(
  components: ReadonlyArray<ReadinessComponent>,
  criticalDependencies: ReadonlyMap<string, ReadonlyArray<string>>,
): ReadinessSuggestion {
  const active = components.filter((c) => !c.archived);
  if (active.length === 0) {
    return { readiness: "not_ready", reasons: ["No components yet."] };
  }
  const byId = new Map(active.map((c) => [c.id, c]));
  let counted = active.filter((c) => c.priority === "needed_for_go_live");
  if (counted.length === 0) counted = active.filter((c) => c.priority !== "planned_for_later");
  if (counted.length === 0) {
    return { readiness: "ready", reasons: ["Nothing is needed for go-live."] };
  }

  const atRisk: string[] = [];
  const notReady: string[] = [];
  for (const c of counted) {
    if (c.status === "changes_needed") atRisk.push(`${c.name} needs changes.`);
    else if (c.status === "waiting") atRisk.push(`${c.name} is waiting.`);
    for (const depId of criticalDependencies.get(c.id) ?? []) {
      const dep = byId.get(depId);
      if (dep && dep.status !== "complete") {
        atRisk.push(`${c.name} cannot finish until ${dep.name} is complete.`);
      }
    }
    if (c.status !== "complete")
      notReady.push(`${c.name} is ${COMPONENT_STATUS_LABEL[c.status].toLowerCase()}.`);
  }

  if (atRisk.length > 0) return { readiness: "at_risk", reasons: atRisk };
  if (notReady.length > 0) return { readiness: "not_ready", reasons: notReady };
  return { readiness: "ready", reasons: ["Every component needed for go-live is complete."] };
}

/**
 * Whether a solution may be marked Complete. Every active component must be
 * complete; the names of the ones that are not are returned so the refusal can
 * say what is open.
 */
export function openComponentsBlockingComplete(
  components: ReadonlyArray<{ name: string; status: ComponentStatus; archived: boolean }>,
): string[] {
  return components.filter((c) => !c.archived && c.status !== "complete").map((c) => c.name);
}

/* ----------------------------------------------------------------- dates */

/**
 * A suggested target date from a SOW estimate, and only when the SOW also gives
 * the starting condition's date. A start date alone, or an estimate alone, is
 * not enough: no date is invented.
 */
export function suggestTargetDate(input: {
  startDate: string | null;
  estimateWeeks: number | null;
}): { date: string | null; reason: string } {
  if (!input.startDate || !input.estimateWeeks) {
    return {
      date: null,
      reason: "The SOW does not give both a start date and a duration, so no date is suggested.",
    };
  }
  const start = new Date(`${input.startDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) {
    return { date: null, reason: "The start date is not a valid date, so no date is suggested." };
  }
  start.setUTCDate(start.getUTCDate() + input.estimateWeeks * 7);
  return {
    date: start.toISOString().slice(0, 10),
    reason: `${input.estimateWeeks} weeks from ${input.startDate.slice(0, 10)}, as the SOW estimates.`,
  };
}

/** A date from a person or a SOW, in the form the database stores. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date as YYYY-MM-DD")
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()), "That is not a real date");

/* ------------------------------------------------------------- dependencies */

/**
 * Whether making `component` depend on `dependsOn` would close a loop. `edges`
 * holds the existing "depends on" links for the same implementation.
 */
export function wouldCreateCycle(
  edges: ReadonlyArray<{ from: string; to: string }>,
  component: string,
  dependsOn: string,
): boolean {
  if (component === dependsOn) return true;
  // Adding component → dependsOn closes a loop exactly when dependsOn already
  // reaches component through the existing links.
  const next = new Map<string, string[]>();
  for (const e of edges) next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
  const seen = new Set<string>();
  const stack = [dependsOn];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === component) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(next.get(cur) ?? []));
  }
  return false;
}

/* ------------------------------------------------------------ changes */

/**
 * A change to a component's status, priority or dates is material when it moves
 * readiness, or when a date that already had an original moves. Those need a
 * reason; everything else is recorded without one.
 */
export function requiresReason(input: {
  field: "target_date" | "readiness_confirmed" | "status" | "priority";
  hadOriginal: boolean;
  from: string | null;
  to: string | null;
}): boolean {
  if (input.field === "target_date") return input.hadOriginal && input.from !== input.to;
  if (input.field === "readiness_confirmed") {
    return (
      input.from !== input.to &&
      (input.from === "ready" || input.to === "ready" || input.to === "at_risk")
    );
  }
  return false;
}

/* ------------------------------------------------------------ schemas */

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .optional();
const uuid = z.string().uuid();

export const createSolutionInput = z.object({
  implementationId: uuid,
  title: text(200),
  scope: z.enum(SOLUTION_SCOPES).default("purchased"),
  priority: z.enum(PRIORITIES).default("deliver_during_implementation"),
  startCondition: optionalText(1000),
  estimateWeeks: z.number().int().min(1).max(520).nullable().optional(),
  sowQuote: optionalText(2000),
  nextAction: optionalText(1000),
});

export const updateSolutionInput = z.object({
  id: uuid,
  title: text(200).optional(),
  scope: z.enum(SOLUTION_SCOPES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(SOLUTION_STATUSES).optional(),
  nextAction: optionalText(1000),
  startCondition: optionalText(1000),
});

export const setSolutionTargetInput = z.object({
  id: uuid,
  targetDate: isoDate.nullable(),
  reason: optionalText(500),
});

export const confirmReadinessInput = z.object({
  id: uuid,
  readiness: z.enum(READINESS),
  reason: optionalText(1000),
});

export const createComponentInput = z
  .object({
    solutionId: uuid,
    category: z.enum(COMPONENT_CATEGORIES),
    integrationType: z.enum(INTEGRATION_TYPES).nullable().optional(),
    name: text(200),
    priority: z.enum(PRIORITIES).default("deliver_during_implementation"),
    targetDate: isoDate.nullable().optional(),
    startCondition: optionalText(1000),
    estimateWeeks: z.number().int().min(1).max(520).nullable().optional(),
    nextAction: optionalText(1000),
    sowQuote: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.integrationType && v.category !== "integrations") {
      ctx.addIssue({
        code: "custom",
        path: ["integrationType"],
        message: "Only an integration has an integration type.",
      });
    }
  });

export const updateComponentInput = z
  .object({
    id: uuid,
    name: text(200).optional(),
    priority: z.enum(PRIORITIES).optional(),
    status: z.enum(COMPONENT_STATUSES).optional(),
    blocker: optionalText(1000),
    latestUpdate: optionalText(2000),
    nextAction: optionalText(1000),
    /** Required when the component already has an original date and this moves it. */
    targetDate: isoDate.nullable().optional(),
    targetChangeReason: optionalText(500),
  })
  .superRefine((v, ctx) => {
    // An absent field means "leave it as it is"; an explicit empty value is
    // refused. The server re-checks against the stored row before writing.
    if (v.status === "waiting" && v.blocker === null) {
      ctx.addIssue({ code: "custom", path: ["blocker"], message: "Say what it is waiting on." });
    }
    if (v.status === "changes_needed" && v.latestUpdate === null) {
      ctx.addIssue({
        code: "custom",
        path: ["latestUpdate"],
        message: "Say what needs changing.",
      });
    }
  });

export const formTrackingInput = z
  .object({
    id: uuid,
    formBuilt: z.boolean().optional(),
    customerApproved: z.boolean().optional(),
    submissionCount: z.number().int().min(0).max(10_000_000).nullable().optional(),
    submissionCheckedOn: isoDate.nullable().optional(),
    usageConfirmedOn: isoDate.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    const hasCount = v.submissionCount !== undefined && v.submissionCount !== null;
    if (hasCount && !v.submissionCheckedOn) {
      ctx.addIssue({
        code: "custom",
        path: ["submissionCheckedOn"],
        message: "Enter the date the count was checked.",
      });
    }
  });

export const dependencyInput = z.object({
  componentId: uuid,
  dependsOnId: uuid,
  critical: z.boolean().default(false),
});

export const archiveInput = z.object({
  kind: z.enum(["solution", "component"]),
  id: uuid,
  reason: optionalText(500),
});

/* ---------------------------------------------------------- display */

/** A date for a person, never a timestamp. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

/** A date is overdue when it is past and the work is not complete. */
export function isOverdue(targetDate: string | null, complete: boolean, today: string): boolean {
  return !complete && targetDate !== null && targetDate.slice(0, 10) < today;
}
