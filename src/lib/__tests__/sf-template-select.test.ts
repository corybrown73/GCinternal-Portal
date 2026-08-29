import { describe, expect, it } from "vitest";
import { globMatch, selectTemplate, type TemplateCandidate } from "../server/template-select";

/**
 * Template auto-selection must be able to explain itself: the winner is only
 * half the answer, and a reader six months later needs the rules that lost too.
 * These tests pin the evaluation record as hard as they pin the choice.
 */

const inputs = {
  opportunity_type: "New Logo",
  amount: 50_000,
  product_codes: ["GC-CORE", "GC-INT-SAP"],
  product_families: ["Platform"],
};

function tpl(over: Partial<TemplateCandidate>): TemplateCandidate {
  return {
    id: "t1",
    key: "new_logo",
    name: "New Logo",
    version: 1,
    status: "published",
    journey_type: "new_logo",
    default_for: null,
    ...over,
  };
}

describe("selectTemplate", () => {
  it("matches on opportunity type and records every clause it checked", () => {
    const result = selectTemplate(
      [tpl({ default_for: { priority: 5, opportunity_type_any: ["New Logo", "Add-On"] } })],
      inputs,
    );
    expect(result.winner?.template_key).toBe("new_logo");
    expect(result.evaluations[0]!.clauses).toEqual([
      {
        clause: "opportunity_type_any",
        expected: ["New Logo", "Add-On"],
        actual: "New Logo",
        passed: true,
      },
    ]);
  });

  it("ANDs clauses and shows which one failed", () => {
    const result = selectTemplate(
      [
        tpl({
          default_for: { opportunity_type_any: ["New Logo"], min_amount: 100_000 },
        }),
      ],
      inputs,
    );
    expect(result.winner).toBeNull();
    const clauses = result.evaluations[0]!.clauses;
    expect(clauses.find((c) => c.clause === "opportunity_type_any")!.passed).toBe(true);
    expect(clauses.find((c) => c.clause === "min_amount")).toMatchObject({
      passed: false,
      expected: 100_000,
      actual: 50_000,
    });
  });

  it("ORs within a list and globs product codes", () => {
    const result = selectTemplate(
      [tpl({ key: "integration", default_for: { product_code_any: ["GC-INT-*"] } })],
      inputs,
    );
    expect(result.winner?.template_key).toBe("integration");
  });

  it("requires every product for product_code_all", () => {
    const miss = selectTemplate(
      [tpl({ default_for: { product_code_all: ["GC-CORE", "GC-MIGRATE"] } })],
      inputs,
    );
    expect(miss.winner).toBeNull();
    const hit = selectTemplate(
      [tpl({ default_for: { product_code_all: ["GC-CORE", "GC-INT-*"] } })],
      inputs,
    );
    expect(hit.winner).not.toBeNull();
  });

  it("picks the highest priority and records the tie it broke", () => {
    const result = selectTemplate(
      [
        tpl({
          id: "a",
          key: "aaa",
          default_for: { priority: 10, opportunity_type_any: ["New Logo"] },
        }),
        tpl({
          id: "b",
          key: "bbb",
          default_for: { priority: 10, opportunity_type_any: ["New Logo"] },
        }),
        tpl({
          id: "c",
          key: "ccc",
          default_for: { priority: 1, opportunity_type_any: ["New Logo"] },
        }),
      ],
      inputs,
    );
    expect(result.winner?.template_id).toBe("a");
    expect(result.ties).toEqual(["bbb v1 (rule 0)"]);
    // The loser is still in the record, with its own evaluation.
    expect(result.evaluations).toHaveLength(3);
  });

  it("never selects an unpublished template, and says why it was skipped", () => {
    const result = selectTemplate(
      [tpl({ status: "draft", default_for: { opportunity_type_any: ["New Logo"] } })],
      inputs,
    );
    expect(result.winner).toBeNull();
    expect(result.evaluations[0]!.skipped_reason).toContain("draft");
  });

  it("treats an empty rule as no rule, not as a catch-all", () => {
    const result = selectTemplate([tpl({ default_for: {} })], inputs);
    expect(result.winner).toBeNull();
    expect(result.evaluations[0]!.matched).toBe(false);
  });

  it("supports several alternative rules on one template", () => {
    const result = selectTemplate(
      [
        tpl({
          default_for: {
            rules: [
              { priority: 1, opportunity_type_any: ["Renewal"] },
              { priority: 7, opportunity_type_any: ["New Logo"] },
            ],
          },
        }),
      ],
      inputs,
    );
    expect(result.winner?.rule_index).toBe(1);
    expect(result.evaluations).toHaveLength(2);
  });

  it("fails an amount clause closed when the payload has no amount", () => {
    const result = selectTemplate([tpl({ default_for: { min_amount: 0 } })], {
      ...inputs,
      amount: null,
    });
    expect(result.winner).toBeNull();
  });

  it("carries the inputs it decided on", () => {
    const result = selectTemplate([tpl({ default_for: { opportunity_type_any: ["x"] } })], inputs);
    expect(result.inputs).toEqual(inputs);
  });
});

describe("globMatch", () => {
  it("is case-insensitive and anchored", () => {
    expect(globMatch("gc-*", "GC-CORE")).toBe(true);
    expect(globMatch("GC-CORE", "GC-CORE-PLUS")).toBe(false);
    expect(globMatch("GC-COR?", "GC-CORE")).toBe(true);
  });

  it("treats regex metacharacters as literals", () => {
    expect(globMatch("a.b", "axb")).toBe(false);
    expect(globMatch("a.b", "a.b")).toBe(true);
    expect(globMatch("a+b", "a+b")).toBe(true);
  });
});
