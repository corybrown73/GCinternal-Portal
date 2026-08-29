/**
 * Template auto-selection from `journey_templates.default_for` (0013).
 *
 * Pure and total: it takes the candidate templates and the facts from the
 * Salesforce payload, and returns both the winner AND the complete evaluation
 * of every rule it looked at. The evaluation is not debug output — it is the
 * record written to `integration_sync_log.decision`, so that months later a
 * reader can see *why* this template was chosen and which clause of which rule
 * decided it. A computed choice that does not carry its inputs is exactly the
 * black box this project refuses to ship.
 *
 * Rule shape (`default_for`), either one object or `{ "rules": [ ... ] }`:
 *
 *   {
 *     "priority": 100,                      // higher wins; default 0
 *     "opportunity_type_any": ["New Logo"], // OR within the list
 *     "product_code_any":   ["GC-*"],       // OR, glob (* and ?)
 *     "product_code_all":   ["GC-CORE"],    // AND, glob
 *     "product_family_any": ["Platform"],   // OR, glob
 *     "min_amount": 0,                      // inclusive
 *     "max_amount": 100000                  // inclusive
 *   }
 *
 * Clauses AND together; a clause that is absent is not evaluated (it cannot
 * fail). A rule with no clauses at all never matches — a catch-all belongs in
 * the `sf_fallback_template` config, not hidden in a template's rules.
 */

export type TemplateRule = {
  priority?: number;
  opportunity_type_any?: string[];
  product_code_any?: string[];
  product_code_all?: string[];
  product_family_any?: string[];
  min_amount?: number;
  max_amount?: number;
};

export type TemplateCandidate = {
  id: string;
  key: string;
  name: string;
  version: number;
  status: string;
  journey_type: string | null;
  default_for: unknown;
};

export type SelectionInputs = {
  opportunity_type: string | null;
  amount: number | null;
  product_codes: string[];
  product_families: string[];
};

export type ClauseEvaluation = {
  clause: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
};

export type RuleEvaluation = {
  template_id: string;
  template_key: string;
  template_version: number;
  rule_index: number;
  priority: number;
  matched: boolean;
  /** Set when the rule could not be evaluated at all (malformed, unpublished). */
  skipped_reason?: string;
  clauses: ClauseEvaluation[];
};

export type TemplateSelection = {
  /** The chosen template, or null when nothing matched. */
  winner: {
    template_id: string;
    template_key: string;
    template_version: number;
    journey_type: string | null;
    priority: number;
    rule_index: number;
  } | null;
  /** Every rule considered, in the order considered. Evidence, not debug. */
  evaluations: RuleEvaluation[];
  /** Non-empty when two rules tied on priority and the tie-break decided it. */
  ties: string[];
  inputs: SelectionInputs;
};

/** Case-insensitive glob over `*` and `?`. No regex ever reaches user input. */
export function globMatch(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
  return rx.test(value);
}

function anyGlob(patterns: string[], values: string[]): boolean {
  return patterns.some((p) => values.some((v) => globMatch(p, v)));
}

function asStringList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return out.length > 0 ? out : null;
}

function rulesOf(defaultFor: unknown): TemplateRule[] {
  if (!defaultFor || typeof defaultFor !== "object") return [];
  const obj = defaultFor as Record<string, unknown>;
  if (Array.isArray(obj["rules"])) {
    return (obj["rules"] as unknown[]).filter(
      (r): r is TemplateRule => !!r && typeof r === "object" && !Array.isArray(r),
    );
  }
  return [obj as TemplateRule];
}

function evaluateRule(rule: TemplateRule, inputs: SelectionInputs): ClauseEvaluation[] {
  const clauses: ClauseEvaluation[] = [];

  const oppTypes = asStringList(rule.opportunity_type_any);
  if (oppTypes) {
    const actual = inputs.opportunity_type ?? "";
    clauses.push({
      clause: "opportunity_type_any",
      expected: oppTypes,
      actual: inputs.opportunity_type,
      passed: actual !== "" && oppTypes.some((t) => globMatch(t, actual)),
    });
  }

  const codeAny = asStringList(rule.product_code_any);
  if (codeAny) {
    clauses.push({
      clause: "product_code_any",
      expected: codeAny,
      actual: inputs.product_codes,
      passed: anyGlob(codeAny, inputs.product_codes),
    });
  }

  const codeAll = asStringList(rule.product_code_all);
  if (codeAll) {
    clauses.push({
      clause: "product_code_all",
      expected: codeAll,
      actual: inputs.product_codes,
      passed: codeAll.every((p) => inputs.product_codes.some((v) => globMatch(p, v))),
    });
  }

  const familyAny = asStringList(rule.product_family_any);
  if (familyAny) {
    clauses.push({
      clause: "product_family_any",
      expected: familyAny,
      actual: inputs.product_families,
      passed: anyGlob(familyAny, inputs.product_families),
    });
  }

  if (typeof rule.min_amount === "number" && Number.isFinite(rule.min_amount)) {
    clauses.push({
      clause: "min_amount",
      expected: rule.min_amount,
      actual: inputs.amount,
      passed: inputs.amount !== null && inputs.amount >= rule.min_amount,
    });
  }

  if (typeof rule.max_amount === "number" && Number.isFinite(rule.max_amount)) {
    clauses.push({
      clause: "max_amount",
      expected: rule.max_amount,
      actual: inputs.amount,
      passed: inputs.amount !== null && inputs.amount <= rule.max_amount,
    });
  }

  return clauses;
}

/**
 * Choose a template. Only `status = 'published'` candidates participate;
 * everything else is recorded as skipped so the reason is visible rather than
 * inferred from an absence.
 */
export function selectTemplate(
  candidates: TemplateCandidate[],
  inputs: SelectionInputs,
): TemplateSelection {
  const evaluations: RuleEvaluation[] = [];
  const ties: string[] = [];

  for (const c of candidates) {
    const rules = rulesOf(c.default_for);
    if (c.status !== "published") {
      evaluations.push({
        template_id: c.id,
        template_key: c.key,
        template_version: c.version,
        rule_index: -1,
        priority: 0,
        matched: false,
        skipped_reason: `status is '${c.status}', only a published template can be selected`,
        clauses: [],
      });
      continue;
    }
    if (rules.length === 0) {
      evaluations.push({
        template_id: c.id,
        template_key: c.key,
        template_version: c.version,
        rule_index: -1,
        priority: 0,
        matched: false,
        skipped_reason: "no default_for rules",
        clauses: [],
      });
      continue;
    }

    rules.forEach((rule, idx) => {
      const clauses = evaluateRule(rule, inputs);
      const priority =
        typeof rule.priority === "number" && Number.isFinite(rule.priority) ? rule.priority : 0;
      evaluations.push({
        template_id: c.id,
        template_key: c.key,
        template_version: c.version,
        rule_index: idx,
        priority,
        // A rule with zero clauses is not a catch-all; it is an empty rule.
        matched: clauses.length > 0 && clauses.every((cl) => cl.passed),
        clauses,
      });
    });
  }

  const matched = evaluations.filter((e) => e.matched);
  if (matched.length === 0) {
    return { winner: null, evaluations, ties, inputs };
  }

  // Highest priority wins. A tie is broken by template key then version so the
  // outcome is deterministic across replays — and the tie is recorded, because
  // "it picked one of two equally-valid templates" is a fact a reader needs.
  const top = matched.reduce((best, e) => {
    if (e.priority !== best.priority) return e.priority > best.priority ? e : best;
    if (e.template_key !== best.template_key) return e.template_key < best.template_key ? e : best;
    return e.template_version <= best.template_version ? e : best;
  });
  const tied = matched.filter(
    (e) => e.priority === top.priority && e.template_id !== top.template_id,
  );
  for (const t of tied)
    ties.push(`${t.template_key} v${t.template_version} (rule ${t.rule_index})`);

  const winnerTemplate = candidates.find((c) => c.id === top.template_id) ?? null;
  return {
    winner: {
      template_id: top.template_id,
      template_key: top.template_key,
      template_version: top.template_version,
      journey_type: winnerTemplate?.journey_type ?? null,
      priority: top.priority,
      rule_index: top.rule_index,
    },
    evaluations,
    ties,
    inputs,
  };
}
