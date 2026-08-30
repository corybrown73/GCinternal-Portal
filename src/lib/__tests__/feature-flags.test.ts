import { describe, expect, it } from "vitest";
import {
  catalogueKeys,
  dependentsOf,
  FLAG_CATALOGUE,
  FLAG_GROUP_LABELS,
  flagsInGroup,
  unmetRequirements,
  type FlagGroup,
} from "../feature-flags";
import { readFileSync } from "node:fs";
import { DEFAULT_FLAGS_FOR_TEST } from "./flag-keys";

describe("the duplicated key list", () => {
  it("still matches DEFAULT_FLAGS in app-config.server.ts", () => {
    // flag-keys.ts copies the key set because importing app-config.server.ts
    // would construct a service-role Supabase client in a unit test. A copy can
    // drift, and a drifted copy would silently weaken every assertion below —
    // so the real source is parsed and compared. This is the guard on the guard.
    const source = readFileSync("src/lib/app-config.server.ts", "utf8");
    const block = source.slice(
      source.indexOf("const DEFAULT_FLAGS: V2Flags = {"),
      source.indexOf("const CACHE_MS"),
    );
    expect(block.length, "could not find DEFAULT_FLAGS").toBeGreaterThan(0);
    const real = [...block.matchAll(/^\s{2}([a-z_]+):\s*(?:true|false),$/gm)].map((m) => m[1]!);
    expect(real.length).toBeGreaterThan(10);
    expect([...real].sort()).toEqual(Object.keys(DEFAULT_FLAGS_FOR_TEST).sort());
  });
});

describe("the flag catalogue", () => {
  it("describes every flag the app actually has", () => {
    // The failure this prevents: a flag added in code, shipped, and then
    // invisible on the admin screen — so the only way to turn it on is raw SQL
    // again, which is the thing this screen exists to end.
    const described = new Set(catalogueKeys());
    const missing = Object.keys(DEFAULT_FLAGS_FOR_TEST).filter((k) => !described.has(k));
    expect(missing, `undescribed flags: ${missing.join(", ")}`).toEqual([]);
  });

  it("describes nothing that is not a real flag", () => {
    // The other direction: a typo in the catalogue would render a switch that
    // writes a key nothing ever reads, and it would look like it worked.
    const real = new Set(Object.keys(DEFAULT_FLAGS_FOR_TEST));
    const extra = catalogueKeys().filter((k) => !real.has(k));
    expect(extra, `catalogue names non-existent flags: ${extra.join(", ")}`).toEqual([]);
  });

  it("lists each flag exactly once", () => {
    const keys = catalogueKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every flag a label and a description somebody can act on", () => {
    for (const f of FLAG_CATALOGUE) {
      expect(f.label.length, f.key as string).toBeGreaterThan(2);
      // A one-word description is not a description. The point of the
      // catalogue is that an admin can decide without reading the source.
      expect(f.description.length, f.key as string).toBeGreaterThan(30);
      expect(f.description.trim().endsWith("."), f.key as string).toBe(true);
    }
  });

  it("puts every flag in a group that has a heading", () => {
    for (const f of FLAG_CATALOGUE) {
      expect(FLAG_GROUP_LABELS[f.group], f.key as string).toBeTruthy();
    }
  });

  it("only depends on flags that exist", () => {
    const real = new Set(catalogueKeys());
    for (const f of FLAG_CATALOGUE) {
      for (const r of f.requires ?? []) {
        expect(real.has(r as string), `${String(f.key)} requires unknown ${String(r)}`).toBe(true);
      }
    }
  });

  it("has no dependency cycles or self-references", () => {
    for (const f of FLAG_CATALOGUE) {
      expect((f.requires ?? []).map(String)).not.toContain(f.key as string);
    }
    // One level deep is all the UI renders; assert the data stays that shallow
    // rather than growing a graph the screen cannot explain.
    for (const f of FLAG_CATALOGUE) {
      for (const r of f.requires ?? []) {
        const parent = FLAG_CATALOGUE.find((x) => x.key === r);
        expect(parent?.requires ?? [], `${String(f.key)} -> ${String(r)} -> ...`).toEqual([]);
      }
    }
  });

  it("marks the customer-facing flags as external", () => {
    // These are the ones where a careless flip cannot be taken back by
    // flipping it again, so the screen has to say so.
    const external = FLAG_CATALOGUE.filter((f) => f.external).map((f) => f.key);
    expect(external).toContain("external_plan_view_enabled");
    expect(external).toContain("external_plan_actions_enabled");
  });
});

describe("flagsInGroup", () => {
  it("partitions the catalogue with nothing lost", () => {
    const groups: FlagGroup[] = ["customer", "delivery", "presale", "platform", "integrations"];
    const total = groups.reduce((n, g) => n + flagsInGroup(g).length, 0);
    expect(total).toBe(FLAG_CATALOGUE.length);
  });
});

describe("unmetRequirements", () => {
  const actions = FLAG_CATALOGUE.find((f) => f.key === "external_plan_actions_enabled")!;

  it("names the flag that has to be on first", () => {
    expect(unmetRequirements(actions, { external_plan_view_enabled: false })).toEqual([
      "external_plan_view_enabled",
    ]);
  });

  it("is empty once the requirement is met", () => {
    expect(unmetRequirements(actions, { external_plan_view_enabled: true })).toEqual([]);
  });

  it("treats a missing key as off, not as satisfied", () => {
    // A flag absent from the stored row falls back to its compiled-in default,
    // which is off. Reading absence as "fine" would show a green screen for a
    // feature that does nothing.
    expect(unmetRequirements(actions, {})).toEqual(["external_plan_view_enabled"]);
  });

  it("is empty for a flag that requires nothing", () => {
    const standalone = FLAG_CATALOGUE.find((f) => !f.requires)!;
    expect(unmetRequirements(standalone, {})).toEqual([]);
  });
});

describe("dependentsOf", () => {
  it("names what turning this off would also stop", () => {
    const state = { external_plan_view_enabled: true, external_plan_actions_enabled: true };
    expect(dependentsOf("external_plan_view_enabled", state).map((f) => f.key)).toEqual([
      "external_plan_actions_enabled",
    ]);
  });

  it("says nothing when the dependent is already off", () => {
    const state = { external_plan_view_enabled: true, external_plan_actions_enabled: false };
    expect(dependentsOf("external_plan_view_enabled", state)).toEqual([]);
  });

  it("says nothing for a flag nothing depends on", () => {
    expect(dependentsOf("demo_mode", { demo_mode: true })).toEqual([]);
  });
});
