import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    audit: null as any,
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  state.audit = { fn: async () => undefined as unknown };
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/audit", () => ({
  audit: (...args: unknown[]) => (h.audit.fn as any)(...args),
}));

import {
  KICKOFF_HELD_REFUSED,
  assertKickoffHeldAuthority,
  recordKickoffHeldChange,
} from "../kickoff-authority.server";

type Opts = {
  role?: string;
  actorTeam?: string | null;
  owner?: string | null;
  partner?: boolean;
  noImpl?: boolean;
};

function rows(opts: Opts): Rows {
  return {
    portal_profiles: [
      {
        id: "profile-1",
        role: opts.role ?? "implementation",
        team_member_id: opts.actorTeam === undefined ? "tm-me" : opts.actorTeam,
      },
    ],
    implementations: opts.noImpl
      ? []
      : [
          {
            id: "impl-1",
            deal_id: "deal-1",
            owner_id: opts.owner === undefined ? "tm-owner" : opts.owner,
            journey_type: opts.partner ? "partner_implementation" : null,
            partner_key: null,
            superseded_by_implementation_id: null,
            created_at: "2026-10-01T00:00:00Z",
          },
        ],
  };
}

let fake: ReturnType<typeof createFakeSupabase>;
function use(r: Rows) {
  fake = createFakeSupabase(r);
  h.supabase.client = fake.client;
}

beforeEach(() => {
  h.supabase.client = null;
  h.audit.fn = async () => undefined;
});

describe("management roles on any post-sale implementation", () => {
  for (const role of ["super_admin", "admin", "manager"]) {
    it(`${role} may act on an implementation owned by someone else`, async () => {
      use(rows({ role, actorTeam: "tm-me", owner: "tm-owner" }));
      const result = await assertKickoffHeldAuthority("profile-1", "deal-1");
      expect(result).toEqual({ implementationId: "impl-1", role, basis: "management" });
    });

    it(`${role} may act on an implementation with no owner, and without a team record`, async () => {
      use(rows({ role, actorTeam: null, owner: null }));
      await expect(assertKickoffHeldAuthority("profile-1", "deal-1")).resolves.toMatchObject({
        basis: "management",
      });
    });
  }
});

describe("the implementation role", () => {
  it("may act on its own implementation as the assigned TIS", async () => {
    use(rows({ role: "implementation", actorTeam: "tm-owner", owner: "tm-owner" }));
    await expect(assertKickoffHeldAuthority("profile-1", "deal-1")).resolves.toMatchObject({
      basis: "assigned_tis",
    });
  });

  it("is refused on another specialist's implementation", async () => {
    use(rows({ role: "implementation", actorTeam: "tm-me", owner: "tm-owner" }));
    await expect(assertKickoffHeldAuthority("profile-1", "deal-1")).rejects.toThrow(
      KICKOFF_HELD_REFUSED,
    );
  });

  it("is refused on an unassigned implementation", async () => {
    use(rows({ role: "implementation", actorTeam: "tm-me", owner: null }));
    await expect(assertKickoffHeldAuthority("profile-1", "deal-1")).rejects.toThrow(
      KICKOFF_HELD_REFUSED,
    );
  });
});

describe("other roles gain nothing", () => {
  for (const role of ["sales", "am", "se", "tam_se", "onboarding"]) {
    it(`${role} is refused even as the named owner`, async () => {
      use(rows({ role, actorTeam: "tm-owner", owner: "tm-owner" }));
      await expect(assertKickoffHeldAuthority("profile-1", "deal-1")).rejects.toThrow(
        KICKOFF_HELD_REFUSED,
      );
    });
  }
});

describe("deal and implementation state", () => {
  it("refuses a deal with no implementation, even for management", async () => {
    use(rows({ role: "super_admin", noImpl: true }));
    await expect(assertKickoffHeldAuthority("profile-1", "deal-1")).rejects.toThrow(
      KICKOFF_HELD_REFUSED,
    );
  });

  it("leaves a partner implementation to its own record, as before", async () => {
    use(rows({ role: "implementation", actorTeam: "tm-me", owner: "tm-owner", partner: true }));
    await expect(assertKickoffHeldAuthority("profile-1", "deal-1")).resolves.toBeNull();
  });
});

describe("ownership and attribution", () => {
  it("acting as management never changes the primary owner", async () => {
    use(rows({ role: "manager", actorTeam: "tm-me", owner: "tm-owner" }));
    await assertKickoffHeldAuthority("profile-1", "deal-1");
    expect(fake.store["implementations"]![0]!["owner_id"]).toBe("tm-owner");
  });

  it("records the actual actor, the change, and the basis of the authority", async () => {
    const audit = vi.fn(async (_row: Record<string, unknown>) => undefined);
    h.audit.fn = audit;
    use(rows({ role: "manager", actorTeam: "tm-me", owner: "tm-owner" }));
    await recordKickoffHeldChange({
      userId: "profile-1",
      dealId: "deal-1",
      implementationId: "impl-1",
      held: true,
      role: "manager",
      basis: "management",
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: "user",
        actor_id: "profile-1",
        action: "kickoff.held_recorded",
        entity_type: "implementation",
        entity_id: "impl-1",
        payload: expect.objectContaining({ actor_role: "manager", basis: "management" }),
      }),
    );
  });

  it("records a reversal as a reversal", async () => {
    const audit = vi.fn(async (_row: Record<string, unknown>) => undefined);
    h.audit.fn = audit;
    await recordKickoffHeldChange({
      userId: "profile-1",
      dealId: "deal-1",
      implementationId: "impl-1",
      held: false,
      role: "implementation",
      basis: "assigned_tis",
    });
    expect(audit.mock.calls[0]?.[0]).toMatchObject({
      action: "kickoff.held_reversed",
      actor_id: "profile-1",
    });
  });
});
