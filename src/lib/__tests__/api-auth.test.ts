import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A fake admin client for requireApiKey: one row by hash, an update that
 * records what it was asked to do, and an rpc that is never reached with the
 * limits flag off.
 */
const h = vi.hoisted(() => {
  const state = {
    row: null as null | Record<string, unknown>,
    updates: [] as Array<Record<string, unknown>>,
    flags: {} as Record<string, boolean>,
  };
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => {
          state.updates.push(patch);
          return Promise.resolve({ error: null });
        },
      }),
    }),
    rpc: async () => ({ data: 1, error: null }),
  };
  return { state, db, flagModule: { isFlagOn: async (f: string) => state.flags[f] === true } };
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));
vi.mock("@/lib/app-config.server", () => h.flagModule);
vi.mock("../app-config.server", () => h.flagModule);

import { requireApiKey } from "../server/api-auth";

const req = () =>
  new Request("https://x/api/mcp", { headers: { authorization: "Bearer gcp_live_x" } });
const code = async (r: { apiKeyId: string } | Response) =>
  r instanceof Response ? ((await r.json()) as { error: { code: string } }).error.code : "ok";

describe("requireApiKey", () => {
  beforeEach(() => {
    h.state.row = null;
    h.state.updates = [];
    h.state.flags = {};
  });

  it("refuses an unknown key without stamping anything", async () => {
    expect(await code(await requireApiKey(req(), "handoff:read"))).toBe("invalid_api_key");
    expect(h.state.updates).toEqual([]);
  });

  it("refuses a revoked key as invalid, not as a missing scope, and does not stamp", async () => {
    h.state.row = { id: "k1", scopes: [], revoked_at: "2026-09-01T00:00:00Z", expires_at: null };
    expect(await code(await requireApiKey(req(), "handoff:read"))).toBe("invalid_api_key");
    expect(h.state.updates).toEqual([]);
  });

  it("stamps last_used_at on a live key even when it lacks the scope", async () => {
    h.state.row = { id: "k1", scopes: ["accounts:read"], revoked_at: null, expires_at: null };
    expect(await code(await requireApiKey(req(), "handoff:read"))).toBe("missing_scope");
    await Promise.resolve();
    expect(h.state.updates.length).toBe(1);
    expect(h.state.updates[0]).toHaveProperty("last_used_at");
  });

  it("lets a key with the scope through", async () => {
    h.state.row = { id: "k1", scopes: ["handoff:read"], revoked_at: null, expires_at: null };
    expect(await requireApiKey(req(), "handoff:read")).toEqual({ apiKeyId: "k1" });
  });

  it("with limits on, an expired key is 'expired' before it is 'missing a scope'", async () => {
    h.state.flags["api_key_limits"] = true;
    h.state.row = {
      id: "k1",
      scopes: ["accounts:read"],
      revoked_at: null,
      expires_at: "2020-01-01T00:00:00Z",
      rate_limit_per_minute: null,
    };
    expect(await code(await requireApiKey(req(), "handoff:read"))).toBe("expired_api_key");
  });

  it("with limits off, an expiry date changes nothing", async () => {
    h.state.row = {
      id: "k1",
      scopes: ["handoff:read"],
      revoked_at: null,
      expires_at: "2020-01-01T00:00:00Z",
    };
    expect(await requireApiKey(req(), "handoff:read")).toEqual({ apiKeyId: "k1" });
  });
});
