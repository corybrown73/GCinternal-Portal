/**
 * `include_when` evaluator — a pure mirror of the SQL function
 * `journey_include_when_matches(cond jsonb, answers jsonb)` in
 * supabase/migrations/0014_work_items.sql.
 *
 * SQL is the enforcement point: it decides which template tasks become real
 * work items at instantiation. This module exists ONLY so the template builder
 * can preview "with these answers, these tasks would be created". If the two
 * disagree the preview lies, so every rule below matches the SQL exactly.
 *
 * The governing invariant, shared with the SQL: a clause that cannot be
 * evaluated EXCLUDES its task. Unanswered questions and malformed clauses both
 * fail closed, so neither can put work on a plan nobody asked for. In
 * particular an unrecognised operator (a plausible typo like `equals`) fails
 * rather than constraining nothing — a mistake can only ever narrow scope.
 *
 * Pure by contract: no imports, no I/O, safe in a client bundle.
 */

/** A JSON value exactly as it arrives from a jsonb column. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** The object form of a clause. Every field is optional; all present ones AND. */
export type IncludeWhenOperatorClause = {
  /** true → the question must be answered; false → it must not be. */
  exists?: boolean;
  ">"?: JsonValue;
  ">="?: JsonValue;
  "<"?: JsonValue;
  "<="?: JsonValue;
  in?: JsonValue[];
  contains?: JsonValue;
};

/** A bare JSON value is an equality test; an object is an operator clause. */
export type IncludeWhenClause = JsonValue | IncludeWhenOperatorClause;

/** `include_when` as stored on a journey template task. null = always included. */
export type IncludeWhen = Record<string, IncludeWhenClause> | null;

export type IncludeWhenResult = {
  /** True when every clause passed (an absent condition passes vacuously). */
  included: boolean;
  /** Question keys whose clause failed, in condition order. */
  failedKeys: string[];
  /**
   * The subset of `failedKeys` that failed because the question is unanswered.
   * The builder shows these as "answer this" rather than "value doesn't match".
   */
  missingKeys: string[];
};

const COMPARISONS: ReadonlyArray<
  [keyof IncludeWhenOperatorClause, (a: number, b: number) => boolean]
> = [
  [">", (a, b) => a > b],
  [">=", (a, b) => a >= b],
  ["<", (a, b) => a < b],
  ["<=", (a, b) => a <= b],
];

/** What `::numeric` accepts from text — decimal only, so no NaN/Infinity/hex. */
const NUMERIC_TEXT = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

/** The complete operator vocabulary. Anything else fails its clause. */
const KNOWN_OPERATORS = new Set([">", ">=", "<", "<=", "in", "contains", "exists"]);

/** jsonb 'object' — arrays and null are separate types there, as they are here. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** jsonb equality: structural, order-sensitive for arrays, not for object keys. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((k) => hasOwn(b, k) && deepEqual(a[k], b[k]))
    );
  }
  return false;
}

/** Containment below the top level: structures must match, no scalar shortcut. */
function containsNested(container: unknown, contained: unknown): boolean {
  if (isPlainObject(contained)) {
    if (!isPlainObject(container)) return false;
    return Object.entries(contained).every(
      ([key, value]) => hasOwn(container, key) && containsNested(container[key], value),
    );
  }
  if (Array.isArray(contained)) {
    if (!Array.isArray(container)) return false;
    return contained.every((item) => container.some((element) => containsNested(element, item)));
  }
  return deepEqual(container, contained);
}

/**
 * The `@>` operator. Postgres grants exactly one exception to "the structures
 * must match": at the TOP level an array contains a bare primitive. It is not
 * reciprocal and it does not apply to nested elements.
 */
function jsonContains(container: unknown, contained: unknown): boolean {
  if (Array.isArray(container) && !Array.isArray(contained) && !isPlainObject(contained)) {
    return container.some((element) => deepEqual(element, contained));
  }
  return containsNested(container, contained);
}

/** The answer side casts through `::text::numeric`, so only a JSON number survives. */
const numericAnswer = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** The bound side uses `->>`, so a numeric string works there too. */
function numericBound(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && NUMERIC_TEXT.test(value.trim())) return Number(value.trim());
  return null;
}

/** Everything except presence: the answer is known to exist by this point. */
function clauseMatches(clause: unknown, answer: unknown): boolean {
  // A clause that is not an object is an equality test against the answer.
  if (!isPlainObject(clause)) return deepEqual(answer, clause);

  // Every key must be one we understand, so a typo narrows rather than widens.
  for (const op of Object.keys(clause)) {
    if (!KNOWN_OPERATORS.has(op)) return false;
  }

  for (const [op, compare] of COMPARISONS) {
    if (!hasOwn(clause, op)) continue;
    // Both sides must really be numbers; an unusable bound (null included)
    // fails the clause rather than passing vacuously.
    const left = numericAnswer(answer);
    const right = numericBound(clause[op]);
    if (left === null || right === null) return false;
    if (!compare(left, right)) return false;
  }

  if (hasOwn(clause, "in")) {
    const options = clause["in"];
    if (!Array.isArray(options)) return false;
    if (!jsonContains(options, [answer])) return false;
  }
  if (hasOwn(clause, "contains") && !jsonContains(answer, clause["contains"])) return false;

  return true;
}

/**
 * Would a task carrying `cond` be created for these answers, and if not, why?
 *
 * A missing answer fails its clause (never silently passes) so an unanswered
 * scoping question can never quietly add work. `exists` is the one clause that
 * asks about presence instead of value.
 */
export function evaluateIncludeWhen(
  cond: unknown,
  answers: Record<string, unknown>,
): IncludeWhenResult {
  const failedKeys: string[] = [];
  const missingKeys: string[] = [];

  // null, a JSON scalar, or an array is not a condition at all: always included.
  if (!isPlainObject(cond)) return { included: true, failedKeys, missingKeys };

  const given = isPlainObject(answers) ? answers : {};

  for (const [key, clause] of Object.entries(cond)) {
    // jsonb has no `undefined`; a key holding one could never round-trip, so it
    // counts as unanswered. A JSON null, however, is a present answer.
    const present = hasOwn(given, key) && given[key] !== undefined;
    const answer = given[key];

    // `exists` asks about presence. It must be a real boolean — `{"exists":
    // "yes"}` would otherwise quietly mean "must be UNANSWERED", the opposite
    // of what its author meant. Unlike before, it does NOT consume the clause:
    // any sibling operators still apply.
    if (isPlainObject(clause) && hasOwn(clause, "exists")) {
      const wanted = clause["exists"];
      if (typeof wanted !== "boolean") {
        failedKeys.push(key);
        continue;
      }
      if (wanted) {
        if (!present) {
          failedKeys.push(key);
          missingKeys.push(key);
          continue;
        }
      } else {
        // Absence was required. If it holds, nothing else can be tested.
        if (present) failedKeys.push(key);
        continue;
      }
    }

    if (!present) {
      failedKeys.push(key);
      missingKeys.push(key);
      continue;
    }

    if (!clauseMatches(clause, answer)) failedKeys.push(key);
  }

  return { included: failedKeys.length === 0, failedKeys, missingKeys };
}
