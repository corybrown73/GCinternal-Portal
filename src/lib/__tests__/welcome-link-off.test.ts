import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * "Turn off link" stays off: a reading or an assignment never mints a new
 * customer link for a deal a person turned the link off on. A person issuing
 * one (the deck, sending the questions) brings it back.
 */
const h = vi.hoisted(() => {
  const state = { supabase: { client: null as any }, forward: null as any };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));

import { issueWelcomeLinkUnlessOff, welcomeLinkTurnedOff } from "../welcome.server";

const DEAL = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";

const log = (action: string, created_at: string) => ({
  id: `${action}-${created_at}`,
  actor_type: action === "welcome.link_revoked" ? "user" : "system",
  actor_id: null,
  action,
  entity_type: "account",
  entity_id: DEAL,
  payload: {},
  created_at,
});

let fake: ReturnType<typeof createFakeSupabase>;
const seed = (audit: Rows[string]) => {
  fake = createFakeSupabase({
    portal_accounts: [
      { id: DEAL, welcome_token_hash: null, welcome_issued_at: null, welcome_share_url: null },
    ],
    portal_audit_log: audit,
  });
  h.supabase.client = fake.client;
};

beforeEach(() => seed([]));

describe("a customer link a person turned off", () => {
  it("is not brought back by the system", async () => {
    seed([
      log("welcome.link_issued", "2026-10-01T00:00:00Z"),
      log("welcome.link_revoked", "2026-10-05T00:00:00Z"),
    ]);
    expect(await welcomeLinkTurnedOff(DEAL)).toBe(true);
    expect(await issueWelcomeLinkUnlessOff(null, DEAL)).toBeNull();
    expect(fake.store["portal_accounts"]![0]!.welcome_share_url).toBeNull();
  });

  it("is issued by the system when it was never turned off, or a person issued one since", async () => {
    expect(await welcomeLinkTurnedOff(DEAL)).toBe(false);
    seed([
      log("welcome.link_revoked", "2026-10-05T00:00:00Z"),
      { ...log("welcome.link_issued", "2026-10-06T00:00:00Z"), actor_id: USER },
    ]);
    expect(await welcomeLinkTurnedOff(DEAL)).toBe(false);
    const issued = await issueWelcomeLinkUnlessOff(null, DEAL);
    expect(issued?.url).toMatch(/\/welcome\/gcwl_/);
    expect(fake.store["portal_accounts"]![0]!.welcome_share_url).toBe(issued?.url);
  });

  it("is not issued when the link's history cannot be read", async () => {
    // Every query on the audit log fails; the rest of the database works.
    const down: any = new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === "then"
            ? (resolve: (v: unknown) => void) =>
                resolve({ data: null, error: { message: "connection reset" } })
            : () => down,
      },
    );
    const real = fake.client;
    h.supabase.client = {
      ...real,
      from: (table: string) => (table === "portal_audit_log" ? down : real.from(table)),
    };
    await expect(issueWelcomeLinkUnlessOff(null, DEAL)).rejects.toThrow(/turned off/);
    expect(fake.store["portal_accounts"]![0]!.welcome_share_url).toBeNull();
    expect(fake.store["portal_accounts"]![0]!.welcome_token_hash).toBeNull();
  });
});
