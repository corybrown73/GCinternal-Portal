import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Presenter selections and their note contents must never reach a customer or an
 * outward surface. This reads the source of every customer-facing builder, route
 * and export, and fails if any of them names the selections or reads journal rows.
 * It is a tripwire, not a proof: the database and the server functions carry the
 * real rule. It exists so a careless import cannot quietly cross the line.
 */

const ROOT = join(__dirname, "..", "..", "..");

const CUSTOMER_FACING_FILES = [
  "src/lib/welcome.server.ts",
  "src/lib/welcome.functions.ts",
  "src/lib/server/onboarding-deck-generate.ts",
  "src/lib/server/handoff-tools.ts",
  "src/lib/shared-plan.ts",
  "src/lib/external-share.server.ts",
  "src/lib/external-plan.functions.ts",
  "src/lib/presenter-workspace.ts",
  "src/lib/sf-integration.server.ts",
  "src/lib/server/mcp.ts",
  "src/routes/customer-dashboard-preview.$dealId.tsx",
  "src/components/welcome-page.tsx",
  "src/components/customer-dashboard.tsx",
];

const FORBIDDEN_IN_CUSTOMER_FACING = [
  "presenter-notes",
  "presenter_note_picks",
  "presenter_note",
  "PresenterNote",
  "listPresenterNotes",
  "getPresenterNotes",
  "choosePresenterNote",
  "dropPresenterNote",
  "customer-meeting.server",
  "customerMeetingInput",
];

/** Builders that render customer-facing content must not read journal rows at all. */
const NO_JOURNAL_READS = [
  "src/lib/welcome.server.ts",
  "src/lib/welcome.functions.ts",
  "src/lib/server/onboarding-deck-generate.ts",
  "src/lib/server/handoff-tools.ts",
  "src/lib/external-share.server.ts",
  "src/lib/external-plan.functions.ts",
  "src/lib/server/mcp.ts",
];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("presenter selections stay out of customer-facing surfaces", () => {
  it("no customer-facing builder, route or export names the selections", () => {
    const apiFiles = filesUnder(join(ROOT, "src/routes/api")).map((f) => relative(ROOT, f));
    const offenders: string[] = [];
    for (const rel of [...CUSTOMER_FACING_FILES, ...apiFiles]) {
      const source = read(rel);
      for (const token of FORBIDDEN_IN_CUSTOMER_FACING) {
        if (source.includes(token)) offenders.push(`${rel} mentions ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("customer-facing builders do not read journal rows", () => {
    const offenders: string[] = [];
    for (const rel of NO_JOURNAL_READS) {
      if (/journal_entries|\.journal\b/.test(read(rel))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("the presentation sync channel carries no payload beyond the word 'changed'", () => {
    const source = read("src/lib/presenter-workspace.ts");
    expect(source).toContain('postMessage("changed")');
    expect(source).not.toMatch(/postMessage\((?!"changed")/);
  });
});
