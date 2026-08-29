import { describe, expect, it } from "vitest";
import {
  describeIncludeWhen,
  evaluateIncludeWhen,
  formatIncludeWhen,
  includeWhenKeys,
} from "../journey-conditions";

/**
 * These rules are enforced in SQL by journey_include_when_matches
 * (supabase/migrations/0014_work_items.sql); this module only previews them in
 * the template builder. Every case below is pinned against the SQL's behaviour
 * — a divergence means the builder tells the user a task will be created that
 * instantiation then skips, or the other way round.
 */

const included = (cond: unknown, answers: Record<string, unknown> = {}) =>
  evaluateIncludeWhen(cond, answers).included;

describe("evaluateIncludeWhen — no condition", () => {
  it("includes the task when there is no condition at all", () => {
    expect(included(null)).toBe(true);
    expect(included(undefined)).toBe(true);
  });

  it("includes the task when the condition is not an object, so it names no clause", () => {
    expect(included("always")).toBe(true);
    expect(included(42)).toBe(true);
    expect(included(["not", "a", "condition"])).toBe(true);
  });

  it("includes the task for an empty condition object", () => {
    expect(evaluateIncludeWhen({}, { anything: 1 })).toEqual({
      included: true,
      failedKeys: [],
      missingKeys: [],
    });
  });
});

describe("evaluateIncludeWhen — equality", () => {
  it("treats a scalar clause as equality against the answer", () => {
    expect(included({ region: "emea" }, { region: "emea" })).toBe(true);
    expect(included({ region: "emea" }, { region: "amer" })).toBe(false);
    expect(included({ seats: 50 }, { seats: 50 })).toBe(true);
    expect(included({ sso: true }, { sso: true })).toBe(true);
    expect(included({ sso: true }, { sso: false })).toBe(false);
  });

  it('does not coerce types, so the string "50" is not the number 50', () => {
    expect(included({ seats: 50 }, { seats: "50" })).toBe(false);
  });

  it("compares array clauses structurally and in order", () => {
    expect(included({ tags: ["a", "b"] }, { tags: ["a", "b"] })).toBe(true);
    expect(included({ tags: ["a", "b"] }, { tags: ["b", "a"] })).toBe(false);
  });
});

describe("evaluateIncludeWhen — numeric comparisons", () => {
  it("applies >, >=, < and <= to the answer", () => {
    expect(included({ seats: { ">": 100 } }, { seats: 101 })).toBe(true);
    expect(included({ seats: { ">": 100 } }, { seats: 100 })).toBe(false);
    expect(included({ seats: { ">=": 100 } }, { seats: 100 })).toBe(true);
    expect(included({ seats: { "<": 100 } }, { seats: 99 })).toBe(true);
    expect(included({ seats: { "<": 100 } }, { seats: 100 })).toBe(false);
    expect(included({ seats: { "<=": 100 } }, { seats: 100 })).toBe(true);
  });

  it("ANDs several comparisons in the same clause into a range", () => {
    expect(included({ seats: { ">=": 10, "<=": 20 } }, { seats: 15 })).toBe(true);
    expect(included({ seats: { ">=": 10, "<=": 20 } }, { seats: 21 })).toBe(false);
  });

  it("accepts a numeric string as the bound, the way the SQL's ->> cast does", () => {
    expect(included({ seats: { ">": "100" } }, { seats: 101 })).toBe(true);
    expect(included({ seats: { ">": "100" } }, { seats: 99 })).toBe(false);
  });

  it("excludes the task when the answer is not a number, since it cannot be compared", () => {
    expect(included({ seats: { ">": 100 } }, { seats: "many" })).toBe(false);
    expect(included({ seats: { ">": 100 } }, { seats: true })).toBe(false);
    expect(included({ seats: { ">": 100 } }, { seats: null })).toBe(false);
  });
});

describe("evaluateIncludeWhen — in", () => {
  it("passes when the answer is one of the listed values", () => {
    expect(included({ region: { in: ["emea", "apac"] } }, { region: "apac" })).toBe(true);
    expect(included({ region: { in: ["emea", "apac"] } }, { region: "amer" })).toBe(false);
  });

  it("matches numbers and booleans in the list, not just strings", () => {
    expect(included({ tier: { in: [1, 2] } }, { tier: 2 })).toBe(true);
    expect(included({ tier: { in: [1, 2] } }, { tier: "2" })).toBe(false);
  });

  it("excludes the task when `in` is not a list of values", () => {
    expect(included({ region: { in: "emea" } }, { region: "emea" })).toBe(false);
  });
});

describe("evaluateIncludeWhen — contains", () => {
  it("passes when a list answer holds the given value", () => {
    expect(included({ modules: { contains: "billing" } }, { modules: ["billing", "crm"] })).toBe(
      true,
    );
    expect(included({ modules: { contains: "billing" } }, { modules: ["crm"] })).toBe(false);
  });

  it("requires every listed value when `contains` is itself a list", () => {
    const answers = { modules: ["billing", "crm", "sso"] };
    expect(included({ modules: { contains: ["billing", "sso"] } }, answers)).toBe(true);
    expect(included({ modules: { contains: ["billing", "hr"] } }, answers)).toBe(false);
  });

  it("matches an object answer on the given keys only, ignoring its extras", () => {
    const answers = { config: { sso: true, scim: false } };
    expect(included({ config: { contains: { sso: true } } }, answers)).toBe(true);
    expect(included({ config: { contains: { sso: false } } }, answers)).toBe(false);
  });

  it("is containment, not substring matching, for a string answer", () => {
    expect(included({ name: { contains: "acme" } }, { name: "acme" })).toBe(true);
    expect(included({ name: { contains: "acm" } }, { name: "acme" })).toBe(false);
  });
});

describe("evaluateIncludeWhen — exists", () => {
  it("requires the question to be answered when exists is true", () => {
    expect(included({ budget: { exists: true } }, { budget: "unknown" })).toBe(true);
    expect(included({ budget: { exists: true } }, {})).toBe(false);
  });

  it("requires the question to be unanswered when exists is false", () => {
    expect(included({ budget: { exists: false } }, {})).toBe(true);
    expect(included({ budget: { exists: false } }, { budget: "10k" })).toBe(false);
  });

  it("counts an explicit null as an answer, because the key is present", () => {
    expect(included({ budget: { exists: true } }, { budget: null })).toBe(true);
    expect(included({ budget: { exists: false } }, { budget: null })).toBe(false);
  });

  it("reports an unmet exists:true as both failed and missing", () => {
    expect(evaluateIncludeWhen({ budget: { exists: true } }, {})).toEqual({
      included: false,
      failedKeys: ["budget"],
      missingKeys: ["budget"],
    });
  });

  it("reports an unmet exists:false as failed but not missing — the answer is there", () => {
    expect(evaluateIncludeWhen({ budget: { exists: false } }, { budget: "10k" })).toEqual({
      included: false,
      failedKeys: ["budget"],
      missingKeys: [],
    });
  });
});

describe("evaluateIncludeWhen — missing answers", () => {
  it("fails any non-exists clause whose question is unanswered, never adding work silently", () => {
    expect(included({ region: "emea" }, {})).toBe(false);
    expect(included({ seats: { ">": 0 } }, {})).toBe(false);
    expect(included({ region: { in: ["emea"] } }, {})).toBe(false);
    expect(included({ modules: { contains: "billing" } }, {})).toBe(false);
  });

  it("treats an undefined value as unanswered, since jsonb cannot store one", () => {
    expect(included({ region: "emea" }, { region: undefined })).toBe(false);
  });

  it("names the unanswered questions in both failedKeys and missingKeys", () => {
    expect(evaluateIncludeWhen({ region: "emea", seats: { ">": 10 } }, {})).toEqual({
      included: false,
      failedKeys: ["region", "seats"],
      missingKeys: ["region", "seats"],
    });
  });
});

describe("evaluateIncludeWhen — multiple clauses", () => {
  const cond = {
    region: "emea",
    seats: { ">=": 100 },
    modules: { contains: "billing" },
  };

  it("includes the task only when every clause passes", () => {
    expect(included(cond, { region: "emea", seats: 250, modules: ["billing"] })).toBe(true);
  });

  it("excludes the task as soon as one clause fails", () => {
    expect(included(cond, { region: "amer", seats: 250, modules: ["billing"] })).toBe(false);
  });

  it("reports every failing clause, not just the first, so the preview can explain itself", () => {
    expect(evaluateIncludeWhen(cond, { region: "amer", modules: ["crm"] })).toEqual({
      included: false,
      failedKeys: ["region", "seats", "modules"],
      missingKeys: ["seats"],
    });
  });

  it("ignores answers no clause asks about", () => {
    expect(included({ region: "emea" }, { region: "emea", unrelated: "noise" })).toBe(true);
  });
});

describe("evaluateIncludeWhen — malformed clauses fail closed", () => {
  // The governing rule: a clause that cannot be evaluated EXCLUDES its task.
  // Malformed conditions and unanswered questions both fail closed, so neither
  // can put work on a plan that nobody asked for.

  it("excludes when the clause names an operator we do not recognise", () => {
    // `equals` is a plausible typo for a supported operator. If it constrained
    // nothing, the typo would silently WIDEN scope and add unasked-for work.
    expect(included({ region: { equals: "emea" } }, { region: "amer" })).toBe(false);
    expect(included({ region: { equals: "emea" } }, { region: "emea" })).toBe(false);
    expect(included({ region: { equals: "emea" } }, {})).toBe(false);
  });

  it("includes on an empty operator clause, which constrains nothing but needs an answer", () => {
    expect(included({ region: {} }, { region: "amer" })).toBe(true);
    expect(included({ region: {} }, {})).toBe(false);
  });

  it("applies operators sitting beside exists rather than letting exists swallow them", () => {
    expect(included({ seats: { exists: true, ">": 1000 } }, { seats: 1 })).toBe(false);
    expect(included({ seats: { exists: true, ">": 1000 } }, { seats: 5000 })).toBe(true);
    expect(included({ seats: { exists: true, ">": 1000 } }, {})).toBe(false);
  });

  it("excludes when exists is not a real boolean", () => {
    // {"exists": "yes"} must not quietly come to mean "must be UNANSWERED".
    expect(included({ budget: { exists: "yes" } }, { budget: "10k" })).toBe(false);
    expect(included({ budget: { exists: "yes" } }, {})).toBe(false);
  });

  it("excludes when a comparison bound is unusable", () => {
    expect(included({ seats: { ">": null } }, { seats: 1 })).toBe(false);
    expect(included({ seats: { ">": "lots" } }, { seats: 1000 })).toBe(false);
  });

  it("excludes when in is given something other than a list", () => {
    expect(included({ region: { in: "emea" } }, { region: "emea" })).toBe(false);
  });
});

/**
 * The template browser renders the same conditions the evaluator enforces. The
 * sentence must not claim a task is narrower or broader than the evaluator
 * makes it — in particular every fail-closed case has to READ as never
 * included, or a reviewer signs off on work that instantiation will skip.
 */
describe("formatIncludeWhen", () => {
  it("returns null when there is no condition, so the task is unconditional", () => {
    expect(formatIncludeWhen(null)).toBeNull();
    expect(formatIncludeWhen(undefined)).toBeNull();
    expect(formatIncludeWhen("always")).toBeNull();
    expect(formatIncludeWhen(["not", "a", "condition"])).toBeNull();
    expect(formatIncludeWhen({})).toBeNull();
  });

  it("renders a bare value as equality", () => {
    expect(formatIncludeWhen({ integration_type: "erp" })).toBe(
      "only when integration_type is erp",
    );
    expect(formatIncludeWhen({ has_sandbox: true })).toBe("only when has_sandbox is yes");
    expect(formatIncludeWhen({ has_sandbox: false })).toBe("only when has_sandbox is no");
    expect(formatIncludeWhen({ seats: 50 })).toBe("only when seats is 50");
    expect(formatIncludeWhen({ notes: null })).toBe("only when notes is null");
  });

  it("renders the comparison operators", () => {
    expect(formatIncludeWhen({ plants: { ">": 1 } })).toBe("only when plants is more than 1");
    expect(formatIncludeWhen({ plants: { ">=": 2 } })).toBe("only when plants is at least 2");
    expect(formatIncludeWhen({ plants: { "<": 10 } })).toBe("only when plants is less than 10");
    expect(formatIncludeWhen({ plants: { "<=": 10 } })).toBe("only when plants is at most 10");
  });

  it("renders in and contains", () => {
    expect(formatIncludeWhen({ region: { in: ["emea"] } })).toBe("only when region is one of emea");
    expect(formatIncludeWhen({ region: { in: ["emea", "amer", "apac"] } })).toBe(
      "only when region is one of emea, amer or apac",
    );
    expect(formatIncludeWhen({ systems: { contains: "erp" } })).toBe(
      "only when systems includes erp",
    );
  });

  it("ANDs the clauses of one key and the keys of one condition", () => {
    expect(formatIncludeWhen({ plants: { ">": 1, "<=": 10 } })).toBe(
      "only when plants is more than 1 and is at most 10",
    );
    expect(formatIncludeWhen({ integration_type: "erp", plants: { ">": 1 } })).toBe(
      "only when integration_type is erp and plants is more than 1",
    );
  });

  it("renders exists as presence, not value", () => {
    expect(formatIncludeWhen({ budget: { exists: true } })).toBe("only when budget is answered");
    expect(formatIncludeWhen({ budget: { exists: false } })).toBe(
      "only when budget is not answered",
    );
    expect(formatIncludeWhen({ budget: {} })).toBe("only when budget is answered");
  });

  it("does not describe siblings of exists:false, which the evaluator never tests", () => {
    const cond = { budget: { exists: false, ">": 10 } };
    expect(evaluateIncludeWhen(cond, { budget: 50 }).included).toBe(false);
    expect(evaluateIncludeWhen(cond, {}).included).toBe(true);
    expect(formatIncludeWhen(cond)).toBe("only when budget is not answered");
  });

  it("says never included wherever the evaluator fails closed", () => {
    const cases: unknown[] = [
      { integration_type: { equals: "erp" } },
      { budget: { exists: "yes" } },
      { region: { in: "emea" } },
    ];
    for (const cond of cases) {
      expect(
        evaluateIncludeWhen(cond, { integration_type: "erp", budget: "10k", region: "emea" })
          .included,
      ).toBe(false);
      expect(formatIncludeWhen(cond)).toContain("never included");
    }
    expect(formatIncludeWhen({ integration_type: { equals: "erp" } })).toBe(
      "only when integration_type has an unrecognised condition (equals), so this task is never included",
    );
  });

  it("uses supplied labels in place of raw question keys", () => {
    expect(
      formatIncludeWhen({ integration_type: "erp" }, { integration_type: "Integration type" }),
    ).toBe("only when Integration type is erp");
  });

  it("exposes the clauses individually and the keys a condition references", () => {
    const cond = { integration_type: "erp", plants: { ">": 1 } };
    expect(describeIncludeWhen(cond)).toEqual(["integration_type is erp", "plants is more than 1"]);
    expect(includeWhenKeys(cond)).toEqual(["integration_type", "plants"]);
    expect(includeWhenKeys(null)).toEqual([]);
  });
});
