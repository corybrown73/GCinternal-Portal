import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

const h = vi.hoisted(() => {
  const state = { supabase: { client: null as any }, forward: null as any };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));

import { assertKickoffHeldAuthority } from "../kickoff-authority.server";

function rows(opts: {
  owner?: string | null;
  partner?: boolean;
  noImpl?: boolean;
  actorTeam?: string | null;
}): Rows {
  return {
    portal_profiles: [
      { id: "profile-1", team_member_id: opts.actorTeam === undefined ? "tm-1" : opts.actorTeam },
    ],
    implementations: opts.noImpl
      ? []
      : [
          {
            id: "impl-1",
            deal_id: "deal-1",
            owner_id: opts.owner === undefined ? "tm-1" : opts.owner,
            journey_type: opts.partner ? "partner_implementation" : null,
            partner_key: null,
            superseded_by_implementation_id: null,
            created_at: "2026-10-01T00:00:00Z",
          },
        ],
  };
}

function use(r: Rows) {
  h.supabase.client = createFakeSupabase(r).client;
}

beforeEach(() => {
  h.supabase.client = null;
});

describe("the held-kickoff check, over the database", () => {
  it("lets the assigned TIS through", async () => {
    use(rows({}));
    await expect(assertKickoffHeldAuthority("profile-1", "deal-1")).resolves.toBeUndefined();
  });

  it("refuses a specialist who is not the assigned TIS", async () => {
    use(rows({ owner: "tm-9" }));
    await expect(assertKickoffHeldAuthority("profile-1", "deal-1")).rejects.toThrow(
      /assigned to this implementation/,
    );
  });

  it("refuses an unassigned implementation, even for a signed-in specialist", async () => {
    use(rows({ owner: null }));
    await expect(assertKickoffHeldAuthority("profile-1", "deal-1")).rejects.toThrow(
      /assigned to this implementation/,
    );
  });

  it("refuses a person with no team record", async () => {
    use(rows({ actorTeam: null }));
    await expect(assertKickoffHeldAuthority("profile-1", "deal-1")).rejects.toThrow(
      /assigned to this implementation/,
    );
  });

  it("refuses when the deal has no implementation", async () => {
    use(rows({ noImpl: true }));
    await expect(assertKickoffHeldAuthority("profile-1", "deal-1")).rejects.toThrow(
      /assigned to this implementation/,
    );
  });

  it("leaves a partner implementation to its own record, as before", async () => {
    use(rows({ owner: "tm-9", partner: true }));
    await expect(assertKickoffHeldAuthority("profile-1", "deal-1")).resolves.toBeUndefined();
  });
});
