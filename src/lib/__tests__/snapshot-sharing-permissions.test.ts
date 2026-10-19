import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * Issue #83, Part 1. Generating, sharing and revoking a plan snapshot follows
 * the same role rule as customer links. Each server function is called directly,
 * as a crafted request would call it, and a refusal changes no snapshot and
 * creates no link.
 */

const h = vi.hoisted(() => {
  const state = {
    client: null as any,
    forward: null as any,
    audits: [] as Array<Record<string, unknown>>,
    generated: [] as Array<{ implementationId: string; actorId: string | null }>,
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.client?.[prop] });
  return state;
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (d: unknown) => unknown = (d) => d;
    const chain: any = {
      middleware: () => chain,
      inputValidator: (v: (d: unknown) => unknown) => {
        validate = v;
        return chain;
      },
      handler: (fn: (a: any) => unknown) => async (input: { data: unknown; context?: unknown }) =>
        fn({ data: validate(input.data), context: input.context }),
    };
    return chain;
  },
}));

vi.mock("@/integrations/supabase/internal-middleware", () => ({
  requireInternalAuth: {},
  requireDealEditor: {},
  requireManager: {},
}));

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));

vi.mock("../server/audit", () => ({
  audit: async (entry: Record<string, unknown>) => {
    h.audits.push(entry);
  },
}));

vi.mock("../server/app-config", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getConfigNumber: async () => 7 };
});

// Generation builds the whole customer view; the test only needs to see that the
// handler reached it, and with whom. The real generator is covered by external-portal-auth.test.ts.
vi.mock("../snapshots.server", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    generateSnapshot: async (implementationId: string, actorId: string | null) => {
      h.generated.push({ implementationId, actorId });
      return { id: "snapshot-new", week_start: "2026-10-19" };
    },
  };
});

import { mintSnapshotShare, revokeSnapshotShare } from "../snapshots.server";
import {
  generatePlanSnapshot,
  revokePlanSnapshotShare,
  sharePlanSnapshot,
} from "../external-share.functions";
import { SNAPSHOT_SHARING_ACTION } from "../external-share-policy";

const IMPL = "33333333-3333-4333-8333-333333333333";
const USER = "11111111-1111-4111-8111-111111111111";
const SNAP_OPEN = "b0000000-0000-4000-8000-000000000001";
const SNAP_SHARED = "b0000000-0000-4000-8000-000000000002";
const FUTURE = "2099-01-01T00:00:00Z";

const AUTHORISED = ["admin", "super_admin", "manager", "implementation", "onboarding"];
const UNAUTHORISED = ["am", "sales", "se", "tam_se", "customer", "auditor", "Admin", ""];

const rows: Rows = {
  plan_snapshots: [
    {
      id: SNAP_OPEN,
      implementation_id: IMPL,
      week_start: "2026-10-12",
      generated_at: "2026-10-12T06:00:00Z",
      share_token_hash: null,
      share_expires_at: null,
      share_revoked_at: null,
    },
    {
      id: SNAP_SHARED,
      implementation_id: IMPL,
      week_start: "2026-10-05",
      generated_at: "2026-10-05T06:00:00Z",
      share_token_hash: "existing-link-hash",
      share_expires_at: FUTURE,
      share_revoked_at: null,
    },
  ],
  implementations: [{ id: IMPL, portal_key: "portal-key" }],
};

let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  fake = createFakeSupabase(rows);
  h.client = fake.client;
  h.audits.length = 0;
  h.generated.length = 0;
});

const snapshots = () => JSON.stringify(fake.store["plan_snapshots"]);
const session = (role: string | null | undefined, id = USER) => ({ id, role });

describe("generating a snapshot", () => {
  it.each(AUTHORISED)("lets the %s role generate, as the signed-in user", async (role) => {
    const out = await generatePlanSnapshot({
      data: { implementationId: IMPL },
      context: { profile: session(role) },
    } as never);
    expect(out).toEqual({ id: "snapshot-new", week_start: "2026-10-19" });
    expect(h.generated).toEqual([{ implementationId: IMPL, actorId: USER }]);
  });

  it.each([...UNAUTHORISED, null, undefined])(
    "refuses the %j role, and generates nothing",
    async (role) => {
      const before = snapshots();
      await expect(
        generatePlanSnapshot({
          data: { implementationId: IMPL },
          context: { profile: session(role) },
        } as never),
      ).rejects.toThrow(`Forbidden: your role cannot ${SNAPSHOT_SHARING_ACTION}`);
      expect(h.generated).toEqual([]);
      expect(snapshots()).toBe(before);
    },
  );

  it("refuses an authorised role with no signed-in identity", async () => {
    await expect(
      generatePlanSnapshot({
        data: { implementationId: IMPL },
        context: { profile: session("admin", "") },
      } as never),
    ).rejects.toThrow(/no signed-in user/);
    expect(h.generated).toEqual([]);
  });
});

describe("sharing a snapshot", () => {
  it.each(AUTHORISED)("lets the %s role create a link, and records who did it", async (role) => {
    const out = await sharePlanSnapshot({
      data: { snapshotId: SNAP_OPEN },
      context: { profile: session(role) },
    } as never);
    expect(out.url).toContain("/plan/s/");
    const row = fake.store["plan_snapshots"]!.find((r) => r["id"] === SNAP_OPEN)!;
    expect(row["share_token_hash"]).toEqual(expect.any(String));
    expect(row["share_expires_at"]).toEqual(expect.any(String));
    expect(h.audits).toEqual([
      expect.objectContaining({
        action: "external.snapshot_shared",
        actor_id: USER,
        entity_id: IMPL,
      }),
    ]);
  });

  it.each([...UNAUTHORISED, null])("refuses the %j role, and creates no link", async (role) => {
    const before = snapshots();
    await expect(
      sharePlanSnapshot({
        data: { snapshotId: SNAP_OPEN },
        context: { profile: session(role) },
      } as never),
    ).rejects.toThrow(/Forbidden/);
    expect(snapshots()).toBe(before);
    expect(h.audits).toEqual([]);
  });

  it("refuses a direct call to the module function that bypasses the server function", async () => {
    const before = snapshots();
    await expect(mintSnapshotShare(SNAP_OPEN, { id: USER, role: "am" })).rejects.toThrow(
      /Forbidden/,
    );
    await expect(mintSnapshotShare(SNAP_OPEN, { id: USER, role: undefined })).rejects.toThrow(
      /Forbidden/,
    );
    expect(snapshots()).toBe(before);
    expect(h.audits).toEqual([]);
  });

  it("does not let a body claim a role the session does not have", async () => {
    const before = snapshots();
    await expect(
      sharePlanSnapshot({
        data: { snapshotId: SNAP_OPEN, role: "admin", id: USER },
        context: { profile: session("am") },
      } as never),
    ).rejects.toThrow(/Forbidden/);
    expect(snapshots()).toBe(before);
  });

  it("reports an unknown snapshot to an authorised caller, and writes nothing", async () => {
    const before = snapshots();
    await expect(
      sharePlanSnapshot({
        data: { snapshotId: "b0000000-0000-4000-8000-0000000000ff" },
        context: { profile: session("manager") },
      } as never),
    ).rejects.toThrow("No such snapshot");
    expect(snapshots()).toBe(before);
  });

  it("refuses a malformed snapshot id before anything runs", async () => {
    await expect(
      sharePlanSnapshot({
        data: { snapshotId: "not-an-id" },
        context: { profile: session("admin") },
      } as never),
    ).rejects.toThrow();
  });
});

describe("revoking a snapshot share", () => {
  it.each(AUTHORISED)("lets the %s role revoke, and records who did it", async (role) => {
    const out = await revokePlanSnapshotShare({
      data: { snapshotId: SNAP_SHARED },
      context: { profile: session(role) },
    } as never);
    expect(out).toEqual({ ok: true });
    const row = fake.store["plan_snapshots"]!.find((r) => r["id"] === SNAP_SHARED)!;
    expect(row["share_revoked_at"]).toEqual(expect.any(String));
    expect(h.audits).toEqual([
      expect.objectContaining({ action: "external.snapshot_share_revoked", actor_id: USER }),
    ]);
  });

  it.each([...UNAUTHORISED, null])(
    "refuses the %j role, and leaves the live link working",
    async (role) => {
      const before = snapshots();
      await expect(
        revokePlanSnapshotShare({
          data: { snapshotId: SNAP_SHARED },
          context: { profile: session(role) },
        } as never),
      ).rejects.toThrow(/Forbidden/);
      expect(snapshots()).toBe(before);
      const row = fake.store["plan_snapshots"]!.find((r) => r["id"] === SNAP_SHARED)!;
      expect(row["share_revoked_at"]).toBeNull();
      expect(h.audits).toEqual([]);
    },
  );

  it("refuses a direct call to the module function", async () => {
    await expect(revokeSnapshotShare(SNAP_SHARED, { id: USER, role: "sales" })).rejects.toThrow(
      /Forbidden/,
    );
    const row = fake.store["plan_snapshots"]!.find((r) => r["id"] === SNAP_SHARED)!;
    expect(row["share_revoked_at"]).toBeNull();
  });
});

describe("existing snapshots and public links are not changed by a refusal or by another snapshot's change", () => {
  it("an authorised share of one snapshot leaves the other snapshot's live link as it was", async () => {
    await sharePlanSnapshot({
      data: { snapshotId: SNAP_OPEN },
      context: { profile: session("manager") },
    } as never);
    const shared = fake.store["plan_snapshots"]!.find((r) => r["id"] === SNAP_SHARED)!;
    expect(shared["share_token_hash"]).toBe("existing-link-hash");
    expect(shared["share_expires_at"]).toBe(FUTURE);
    expect(shared["share_revoked_at"]).toBeNull();
  });

  it("a battery of refused requests changes no snapshot, link or audit entry", async () => {
    const before = snapshots();
    const refused = [
      () =>
        generatePlanSnapshot({
          data: { implementationId: IMPL },
          context: { profile: session("am") },
        } as never),
      () =>
        sharePlanSnapshot({
          data: { snapshotId: SNAP_OPEN },
          context: { profile: session("customer") },
        } as never),
      () =>
        revokePlanSnapshotShare({
          data: { snapshotId: SNAP_SHARED },
          context: { profile: session("auditor") },
        } as never),
      () => mintSnapshotShare(SNAP_OPEN, { id: USER, role: null }),
      () => revokeSnapshotShare(SNAP_SHARED, { id: USER, role: "se" }),
    ];
    for (const attempt of refused) {
      await expect(attempt()).rejects.toThrow(/Forbidden/);
    }
    expect(snapshots()).toBe(before);
    expect(h.generated).toEqual([]);
    expect(h.audits).toEqual([]);
  });
});
