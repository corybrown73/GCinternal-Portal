import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The customer-facing boundary for this release. Training & Readiness, transcript
 * suggestions, the evidence they create, and the delivery records are internal. These
 * checks read the source of every customer-facing route and server module and fail if any
 * of them reaches for internal data, and they check that every internal write and read is
 * behind an internal-role check.
 */

const ROOT = join(__dirname, "..", "..", "..");

/** The customer-facing surfaces: customer routes, the welcome link, the customer plan and dashboard. */
const CUSTOMER_FACING = [
  "src/routes/welcome.$token.tsx",
  "src/routes/portal.index.tsx",
  "src/routes/portal.plan.$portalKey.tsx",
  "src/routes/portal.tickets.tsx",
  "src/routes/portal.tsx",
  "src/routes/onboarding-plan.$dealId.tsx",
  "src/routes/onboarding-notes.$dealId.tsx",
  "src/routes/customer-dashboard-preview.$dealId.tsx",
  "src/routes/go.$token.$articleId.tsx",
  "src/routes/api/welcome-ics.$token.ts",
  "src/lib/welcome.server.ts",
  "src/lib/welcome.ts",
  "src/lib/welcome.functions.ts",
  "src/lib/external-plan.server.ts",
  "src/lib/portal-plan.server.ts",
  "src/lib/customer-dashboard.ts",
  "src/lib/kickoff-view.ts",
];

/** Internal-only: anything that names these must never appear on a customer surface. */
const INTERNAL_TOKENS = [
  "implementation_training",
  "training.server",
  "training.functions",
  "training-plan",
  "training-readiness-strip",
  "training_readiness",
  "evidence_proposals",
  "transcript",
  "complete_solutions",
  "solution_components",
  "solutions-overview",
  "solutions-summary",
  "solutions-tab",
  "complete-solutions",
  "post_sale_may_manage",
];

const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("the customer-facing surfaces", () => {
  it("every surface in the list exists, so the check is not skipping anything", () => {
    for (const f of CUSTOMER_FACING) expect(existsSync(join(ROOT, f)), f).toBe(true);
  });

  for (const f of CUSTOMER_FACING) {
    it(`${f} names no internal training, transcript, evidence or solution data`, () => {
      const src = read(f);
      const found = INTERNAL_TOKENS.filter((t) => src.includes(t));
      expect(found, `${f} mentions ${found.join(", ")}`).toEqual([]);
    });

    it(`${f} does not read the evidence table`, () => {
      expect(read(f)).not.toMatch(/from\(\s*["']evidence["']\s*\)/);
    });
  }

  it("the Customer 360 Overview and the Solutions summary are not on any customer route", () => {
    for (const f of CUSTOMER_FACING) {
      const src = read(f);
      expect(src).not.toMatch(
        /CompleteSolutionsSummary|TrainingPlanTab|SolutionsTab|SolutionsSummary/,
      );
    }
  });
});

describe("the internal write and read paths are behind an internal role", () => {
  const SERVER_FN_FILES = [
    "src/lib/training.functions.ts",
    "src/lib/complete-solutions.functions.ts",
  ];

  for (const f of SERVER_FN_FILES) {
    it(`every server function in ${f} is behind requireInternalAuth or requireDealEditor`, () => {
      const src = read(f);
      const declared = (src.match(/=\s*createServerFn\(/g) ?? []).length;
      const guarded = (
        src.match(
          /\.middleware\(\[requireInternalAuth\]\)|\.middleware\(\[requireDealEditor\]\)/g,
        ) ?? []
      ).length;
      expect(declared).toBeGreaterThan(0);
      expect(guarded).toBe(declared);
    });
  }

  it("the training writes go through the database functions, never direct table writes", () => {
    const src = read("src/lib/training.server.ts");
    const writes =
      src.match(/\.from\("implementation_training"\)\s*\.(insert|update|upsert|delete)/g) ?? [];
    expect(writes).toEqual([]);
  });
});
