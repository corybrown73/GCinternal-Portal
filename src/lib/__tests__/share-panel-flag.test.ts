import { describe, expect, it, vi } from "vitest";

/**
 * Deploy safety: the share panel must not touch Phase 4's schema while its
 * flag is off.
 *
 * `ExternalSharePanel` renders on EVERY implementation's Customer 360, with no
 * flag check in the component tree. Everything `loadSharePanel` reads —
 * `implementations.portal_key`, `external_access_grants`,
 * `external_plan_events` — only exists once migrations 0019–0022 are applied.
 * PostgREST rejects the whole query when a selected column is missing, so a
 * deploy that lands before its migrations would take out the app's central
 * page, on every account, for everyone.
 *
 * So the guard is not "the feature is off", it is "this code is safe to ship
 * ahead of its schema". A test that only checked the returned shape would still
 * pass if someone moved a query above the guard, which is exactly the
 * regression that matters — hence asserting that the database is never reached
 * at all.
 */

// Everything the mock factories touch must live inside vi.hoisted(): vi.mock is
// lifted to the top of the file, above any plain const.
const h = vi.hoisted(() => {
  const state = {
    flags: { external_plan_view_enabled: false } as Record<string, boolean>,
    dbCalls: [] as string[],
    db: null as any,
    flagModule: null as any,
  };
  // Any table access at all is a failure, so the fake records the call and then
  // throws the way PostgREST does on missing schema.
  state.db = {
    from(table: string) {
      state.dbCalls.push(table);
      throw new Error(`relation "${table}" does not exist`);
    },
  };
  state.flagModule = {
    isFlagOn: async (flag: string) => state.flags[flag] === true,
    getV2Flags: async () => state.flags,
    resetFlagCache: () => {},
  };
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));
vi.mock("@/lib/app-config.server", () => h.flagModule);
vi.mock("../app-config.server", () => h.flagModule);

import { loadSharePanel } from "../external-share.server";

describe("share panel, flag off", () => {
  it("reaches no table at all, so it is safe to deploy ahead of 0019-0022", async () => {
    h.flags["external_plan_view_enabled"] = false;
    h.dbCalls = [];

    const panel = await loadSharePanel("11111111-1111-4111-8111-111111111111");

    expect(h.dbCalls).toEqual([]);
    expect(panel.enabled).toBe(false);
  });

  it("returns a shape the panel can render without optional chaining tricks", async () => {
    h.flags["external_plan_view_enabled"] = false;
    const panel = await loadSharePanel("11111111-1111-4111-8111-111111111111");

    expect(panel.grants).toEqual([]);
    expect(panel.events).toEqual([]);
    expect(panel.contacts).toEqual([]);
    expect(panel.portal_key).toBe("");
  });

  it("does try to read once the flag is on — proving the guard is what stopped it", async () => {
    // Without this, a loadSharePanel that always returned early would pass the
    // first test while silently disabling the feature for good.
    h.flags["external_plan_view_enabled"] = true;
    h.dbCalls = [];

    await expect(loadSharePanel("11111111-1111-4111-8111-111111111111")).rejects.toThrow(
      /does not exist/,
    );
    expect(h.dbCalls).toContain("implementations");
  });
});
