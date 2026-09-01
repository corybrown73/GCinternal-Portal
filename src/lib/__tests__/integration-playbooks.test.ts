import { describe, expect, it } from "vitest";

import { INTEGRATION_PLAYBOOKS, playbookFor, UNKNOWN_TARGET } from "../integration-playbooks";

describe("playbookFor", () => {
  it("matches how a client actually writes it, not a canonical string", () => {
    expect(playbookFor("QuickBooks Online")?.name).toBe("QuickBooks Online");
    expect(playbookFor("qbo")?.name).toBe("QuickBooks Online");
    expect(playbookFor("we're on QuickBooks Online (Plus)")?.name).toBe("QuickBooks Online");
    expect(playbookFor("Intuit")?.name).toBe("QuickBooks Online");
  });

  it("prefers the longer alias, so a product family does not swallow a product", () => {
    // "sage intacct" must not lose to "sage".
    expect(playbookFor("Sage Intacct")?.name).toBe("Sage");
    expect(playbookFor("Sage 200 on-premise")?.name).toBe("Sage");
  });

  it("says plainly when there is no reviewed playbook, instead of guessing", () => {
    const hit = playbookFor("Fieldwire");
    expect(hit?.known).toBe(false);
    expect(hit?.name).toBe("Fieldwire");
    expect(hit?.playbook.seDays).toBe("to be scoped");
    expect(hit?.playbook.watchOut[0]).toContain("no reviewed playbook");
  });

  it("returns nothing when no system was named at all", () => {
    expect(playbookFor(null)).toBeNull();
    expect(playbookFor("   ")).toBeNull();
  });

  it("keeps the client's own wording as the name for an unknown system", () => {
    expect(playbookFor("  Acme WorkOrders  ")?.name).toBe("Acme WorkOrders");
  });
});

describe("the playbooks themselves", () => {
  it("every one carries prerequisites, a warning and a client gameplan", () => {
    // A playbook without these is a name on a slide and nothing else.
    for (const p of INTEGRATION_PLAYBOOKS) {
      expect(p.prerequisites.length, `${p.name} prerequisites`).toBeGreaterThan(0);
      expect(p.watchOut.length, `${p.name} watchOut`).toBeGreaterThan(0);
      expect(p.gameplan.length, `${p.name} gameplan`).toBeGreaterThan(2);
      expect(p.seDays, `${p.name} seDays`).toMatch(/\d/);
    }
  });

  it("has no duplicate aliases, which would make matching order-dependent", () => {
    const seen = new Set<string>();
    for (const p of INTEGRATION_PLAYBOOKS) {
      for (const a of p.aliases) {
        expect(seen.has(a), `${a} appears twice`).toBe(false);
        seen.add(a);
      }
    }
  });

  it("the unknown fallback refuses to imply an estimate it does not have", () => {
    expect(UNKNOWN_TARGET.seDays).not.toMatch(/^\d/);
  });
});
