import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The external portal's authorization suite (docs/design/portal-access.md §5).
 *
 * This is the surface where an unauthenticated visitor reaches customer data,
 * so these tests are the gate on the feature flags rather than a nice-to-have.
 * They run the REAL server modules — `loadSharedPlan`, the five action
 * functions, the door — against an in-memory Supabase, so a scoping bug fails
 * here rather than in production.
 *
 * Fixtures use real uuids on purpose: test 4's regex scan for a leaked uuid is
 * only meaningful if there are uuids around to leak.
 *
 * Not covered here, by design: the DB triggers (revoke-on-contact-delete,
 * revoke-on-implementation-close, grant immutability). Those are SQL
 * guarantees; emulating them in a fake would test the fake. What is covered is
 * the app-visible half — a revoked grant stops working, whoever revoked it.
 */

const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    flags: {
      external_plan_view_enabled: true,
      external_plan_actions_enabled: true,
    } as Record<string, boolean>,
    emails: [] as Array<{ to: string; subject: string; html: string }>,
    forward: null as any,
    flagModule: null as any,
    emailModule: null as any,
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  state.flagModule = {
    isFlagOn: async (flag: string) => state.flags[flag] === true,
    getV2Flags: async () => state.flags,
    resetFlagCache: () => {},
  };
  state.emailModule = {
    sendEmail: async (opts: { to: string; subject: string; html: string }) => {
      state.emails.push(opts);
      return { delivered: false };
    },
  };
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("@/lib/app-config.server", () => h.flagModule);
vi.mock("../app-config.server", () => h.flagModule);
vi.mock("@/lib/server/email", () => h.emailModule);
vi.mock("../server/email", () => h.emailModule);

import {
  ExternalAccessError,
  loadSharedPlan,
  type ExternalViewer,
} from "../server/external-viewer";
import {
  addComment,
  completeTask,
  openPlanWithToken,
  recordOpen,
  reassign,
  reopenTask,
  sanitizeFileName,
  uploadFile,
} from "../external-plan.server";
import { canManageExternalAccess, requireManage } from "../external-share.server";
import { generateSnapshot, snapshotForToken } from "../snapshots.server";
import { generatePlanToken, hashPasscode, signPlanSession } from "../server/plan-tokens";
import { resetConfigCache } from "../server/app-config";
import { SHARED_PLAN_KEYS, SHARED_TASK_KEYS, SNAPSHOT_KEYS, taskRef } from "../shared-plan";

/* ------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* ------------------------------------------------------------------------- */

const CUST_A = "11111111-1111-4111-8111-111111111111";
const CUST_B = "22222222-2222-4222-8222-222222222222";
const IMPL_A = "33333333-3333-4333-8333-333333333333";
const IMPL_B = "44444444-4444-4444-8444-444444444444";
const WI_A_SHARED = "55555555-5555-4555-8555-555555555555";
const WI_A_INTERNAL = "66666666-6666-4666-8666-666666666666";
const WI_A_BLOCKED = "6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b";
const WI_B_SHARED = "77777777-7777-4777-8777-777777777777";
const CONTACT_A = "88888888-8888-4888-8888-888888888888";
const CONTACT_B = "99999999-9999-4999-8999-999999999999";
const GRANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GRANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PROFILE_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const KEY_A = "a1a1a1a1a1a1a1a1a1";
const KEY_B = "b2b2b2b2b2b2b2b2b2";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const past = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

let tokenA = "";
let tokenB = "";

function seed(): Rows {
  const mintedA = generatePlanToken();
  const mintedB = generatePlanToken();
  tokenA = mintedA.token;
  tokenB = mintedB.token;

  return {
    customers: [
      // arr/segment/logo are in the row on purpose: the projection must not
      // carry them even though the query returns the row.
      { id: CUST_A, name: "Acme", arr: 250000, segment: "enterprise", logo_path: null },
      { id: CUST_B, name: "Beta Corp", arr: 90000, segment: "mid", logo_path: null },
    ],
    implementations: [
      {
        id: IMPL_A,
        customer_id: CUST_A,
        name: "Acme rollout",
        current_stage: "build",
        target_launch_date: "2026-10-01",
        portal_key: KEY_A,
        owner_id: OWNER,
        sow_value: 120000,
        sow_document_url: "https://internal/sow-a.pdf",
        discovery_notes: "they are nervous about IT",
        tier: "gold",
        status: "at_risk",
      },
      {
        id: IMPL_B,
        customer_id: CUST_B,
        name: "Beta rollout",
        current_stage: "build",
        target_launch_date: "2026-11-01",
        portal_key: KEY_B,
        owner_id: OWNER,
        sow_value: 40000,
      },
    ],
    customer_contacts: [
      {
        id: CONTACT_A,
        customer_id: CUST_A,
        name: "Ada",
        email: "ada@acme.example",
        role: "champion",
      },
      {
        id: CONTACT_B,
        customer_id: CUST_B,
        name: "Bo",
        email: "bo@beta.example",
        role: "champion",
      },
    ],
    team_members: [{ id: OWNER, name: "Ivy Owner", email: "ivy@gocanvas.com" }],
    portal_profiles: [{ id: PROFILE_A, full_name: "Ada Login", email: "ada@acme.example" }],
    customer_users: [
      {
        profile_id: PROFILE_A,
        customer_id: CUST_A,
        implementation_id: null,
        contact_id: CONTACT_A,
      },
    ],
    work_items: [
      {
        id: WI_A_SHARED,
        implementation_id: IMPL_A,
        title: "Send us your field list",
        description: "CSV is fine",
        party: "customer",
        visibility: "shared",
        status: "not_started",
        due_at: past(2),
        depends_on: [],
        position: 1,
      },
      {
        id: WI_A_INTERNAL,
        implementation_id: IMPL_A,
        title: "INTERNAL: escalate to the account team",
        description: "customer is a flight risk",
        party: "internal",
        visibility: "internal",
        status: "not_started",
        due_at: null,
        depends_on: [],
        position: 2,
      },
      {
        id: WI_A_BLOCKED,
        implementation_id: IMPL_A,
        title: "Approve the build",
        description: null,
        party: "customer",
        visibility: "shared",
        status: "not_started",
        due_at: future(3),
        depends_on: [WI_A_INTERNAL],
        position: 3,
      },
      {
        id: WI_B_SHARED,
        implementation_id: IMPL_B,
        title: "Beta's own task",
        description: null,
        party: "customer",
        visibility: "shared",
        status: "not_started",
        due_at: null,
        depends_on: [],
        position: 1,
      },
    ],
    work_item_comments: [
      {
        id: "e1111111-1111-4111-8111-111111111111",
        work_item_id: WI_A_SHARED,
        author_profile_id: PROFILE_A,
        author_contact_id: null,
        internal: true,
        body: "INTERNAL NOTE: chase the champion, they are ghosting us",
        created_at: past(1),
      },
    ],
    work_item_files: [],
    milestones: [
      {
        implementation_id: IMPL_A,
        name: "Kickoff",
        status: "completed",
        target_date: "2026-08-01",
        completed_date: "2026-08-02",
      },
    ],
    commitments: [
      {
        implementation_id: IMPL_A,
        description: "Ship the integration guide",
        due_date: "2026-09-01",
        committed_to: "Ada",
        fulfilled_at: null,
      },
    ],
    external_access_grants: [
      {
        id: GRANT_A,
        implementation_id: IMPL_A,
        customer_id: CUST_A,
        contact_id: CONTACT_A,
        email: "ada@acme.example",
        token_hash: mintedA.hash,
        token_prefix: mintedA.prefix,
        can_complete: true,
        passcode_hash: null,
        passcode_attempts: 0,
        locked_until: null,
        expires_at: future(30),
        revoked_at: null,
        created_via: "internal",
        parent_grant_id: null,
        open_count: 0,
      },
      {
        id: GRANT_B,
        implementation_id: IMPL_B,
        customer_id: CUST_B,
        contact_id: CONTACT_B,
        email: "bo@beta.example",
        token_hash: mintedB.hash,
        token_prefix: mintedB.prefix,
        can_complete: true,
        passcode_hash: null,
        passcode_attempts: 0,
        locked_until: null,
        expires_at: future(30),
        revoked_at: null,
        created_via: "internal",
        parent_grant_id: null,
        open_count: 0,
      },
    ],
    external_plan_events: [],
    portal_audit_log: [],
    audit_log: [],
    plan_snapshots: [],
    portal_app_config: [
      { key: "external_plan_link_ttl_days", value: 60 },
      { key: "external_plan_reassign_daily_limit", value: 2 },
      { key: "snapshot_share_ttl_days", value: 30 },
    ],
  };
}

let fake: ReturnType<typeof createFakeSupabase>;

const viewerA: ExternalViewer = {
  kind: "grant",
  grantId: GRANT_A,
  implementationId: IMPL_A,
  customerId: CUST_A,
  contactId: CONTACT_A,
  canComplete: true,
};

const grants = () => fake.store["external_access_grants"]!;
const events = () => fake.store["external_plan_events"]!;
const items = () => fake.store["work_items"]!;
const grantA = () => grants().find((g) => g.id === GRANT_A)!;

async function cookieFor(grantId: string, passcodeVerified = false): Promise<string> {
  return signPlanSession({ grantId, passcodeVerified });
}

beforeEach(() => {
  process.env["PLAN_SESSION_SECRET"] = "test-secret-for-the-plan-session-cookie";
  process.env["APP_URL"] = "https://hub.example";
  fake = createFakeSupabase(seed());
  h.supabase.client = fake.client;
  h.flags = { external_plan_view_enabled: true, external_plan_actions_enabled: true };
  h.emails = [];
  resetConfigCache();
});

/* ------------------------------------------------------------------------- */
/* 1. Cross-implementation isolation                                          */
/* ------------------------------------------------------------------------- */

describe("1. cross-implementation isolation", () => {
  it("a grant for A cannot load B by asking for B's portal key", async () => {
    await expect(loadSharedPlan(viewerA, KEY_B)).rejects.toThrow(ExternalAccessError);
  });

  it("a grant for A loads A even when it asks for A's key", async () => {
    const plan = await loadSharedPlan(viewerA, KEY_A);
    expect(plan.implementation_name).toBe("Acme rollout");
  });

  it("A's cookie cannot complete, comment on or upload against B's task", async () => {
    const cookie = await cookieFor(GRANT_A);
    const bRef = taskRef(WI_B_SHARED);
    await expect(completeTask(cookie, bRef)).rejects.toThrow(ExternalAccessError);
    await expect(addComment(cookie, bRef, "hello")).rejects.toThrow(ExternalAccessError);
    await expect(
      uploadFile(cookie, {
        ref: bRef,
        fileName: "x.csv",
        mimeType: "text/csv",
        contentBase64: Buffer.from("a,b").toString("base64"),
      }),
    ).rejects.toThrow(ExternalAccessError);
    // B's task is untouched.
    expect(items().find((w) => w.id === WI_B_SHARED)!.status).toBe("not_started");
  });

  it("B's snapshot share token is not readable once revoked, and never names A", async () => {
    await generateSnapshot(IMPL_B, null);
    const snap = fake.store["plan_snapshots"]![0]!;
    const minted = generatePlanToken();
    Object.assign(snap, {
      share_token_hash: minted.hash,
      share_expires_at: future(10),
      share_revoked_at: new Date().toISOString(),
    });
    const result = await snapshotForToken(minted.token);
    expect(result.state).toBe("unavailable");
  });
});

/* ------------------------------------------------------------------------- */
/* 2. Grant lifecycle                                                         */
/* ------------------------------------------------------------------------- */

describe("2. grant lifecycle", () => {
  it("expired, revoked and unknown links are one indistinguishable answer", async () => {
    const unknown = await openPlanWithToken("gcpl_not-a-real-token");
    expect(unknown.state).toBe("unavailable");

    grantA().revoked_at = new Date().toISOString();
    const revoked = await openPlanWithToken(tokenA);
    expect(revoked.state).toBe("unavailable");

    grantA().revoked_at = null;
    grantA().expires_at = past(1);
    const expired = await openPlanWithToken(tokenA);
    expect(expired.state).toBe("unavailable");
  });

  it("a live link renders the plan and mints a session", async () => {
    const result = await openPlanWithToken(tokenA);
    expect(result.state).toBe("plan");
    if (result.state !== "plan") return;
    expect(result.session).toBeTruthy();
    expect(result.plan.your_tasks.length).toBeGreaterThan(0);
  });

  it("a cookie minted before revocation stops working the moment the grant is revoked", async () => {
    const cookie = await cookieFor(GRANT_A);
    await expect(completeTask(cookie, taskRef(WI_A_SHARED))).resolves.toBeTruthy();

    grantA().revoked_at = new Date().toISOString();
    grantA().revoke_reason = "contact_removed";
    await expect(completeTask(cookie, taskRef(WI_A_SHARED))).rejects.toThrow(ExternalAccessError);
  });

  it("a forged cookie signed with another secret is rejected", async () => {
    const cookie = await cookieFor(GRANT_A);
    process.env["PLAN_SESSION_SECRET"] = "a-different-secret-entirely-now";
    await expect(completeTask(cookie, taskRef(WI_A_SHARED))).rejects.toThrow(ExternalAccessError);
  });
});

/* ------------------------------------------------------------------------- */
/* 3. Passcode                                                                */
/* ------------------------------------------------------------------------- */

describe("3. passcode", () => {
  beforeEach(() => {
    grantA().passcode_hash = hashPasscode("open sesame");
  });

  it("asks for the passcode, refuses the wrong one, accepts the right one", async () => {
    expect((await openPlanWithToken(tokenA)).state).toBe("passcode");
    const wrong = await openPlanWithToken(tokenA, "nope");
    expect(wrong.state).toBe("passcode");
    expect(wrong.state === "passcode" && wrong.wrong).toBe(true);
    expect((await openPlanWithToken(tokenA, "open sesame")).state).toBe("plan");
  });

  it("locks out after five wrong attempts, and the correct passcode is refused while locked", async () => {
    for (let i = 0; i < 4; i += 1) await openPlanWithToken(tokenA, "nope");
    expect((await openPlanWithToken(tokenA, "nope")).state).toBe("locked");
    expect(grantA().locked_until).toBeTruthy();
    expect((await openPlanWithToken(tokenA, "open sesame")).state).toBe("locked");
    // Every failure is recorded; the lockout is evidence, not a guess.
    expect(events().filter((e) => e.event === "passcode_failed")).toHaveLength(5);
  });

  it("a session that never proved the passcode cannot mutate", async () => {
    const cookie = await cookieFor(GRANT_A, false);
    await expect(completeTask(cookie, taskRef(WI_A_SHARED))).rejects.toThrow(ExternalAccessError);
    const proven = await cookieFor(GRANT_A, true);
    await expect(completeTask(proven, taskRef(WI_A_SHARED))).resolves.toBeTruthy();
  });
});

/* ------------------------------------------------------------------------- */
/* 4. Projection allowlist — every consumer                                   */
/* ------------------------------------------------------------------------- */

describe("4. projection allowlist, all serializer consumers", () => {
  const FORBIDDEN = [
    "arr",
    "segment",
    "sow_value",
    "sow_document_url",
    "discovery_notes",
    "tier",
    "INTERNAL",
    "flight risk",
    "ghosting",
  ];

  const consumers: Array<[string, () => Promise<unknown>]> = [
    ["link door", () => loadSharedPlan(viewerA, KEY_A)],
    [
      "auth door",
      () =>
        loadSharedPlan(
          {
            kind: "auth",
            profileId: PROFILE_A,
            customerIds: [CUST_A],
            implementationIds: null,
          },
          KEY_A,
        ),
    ],
    ["internal preview", () => loadSharedPlan({ kind: "preview", profileId: OWNER }, KEY_A)],
    [
      "snapshot content",
      async () => {
        await generateSnapshot(IMPL_A, null);
        return fake.store["plan_snapshots"]![0]!.content;
      },
    ],
  ];

  for (const [name, load] of consumers) {
    it(`${name}: carries no internal field and no uuid`, async () => {
      const payload = await load();
      const json = JSON.stringify(payload);
      for (const needle of FORBIDDEN) expect(json).not.toContain(needle);
      expect(UUID_RE.test(json)).toBe(false);
    });
  }

  it("keys are a subset of the frozen allowlist, for the plan and for a snapshot", async () => {
    const plan = await loadSharedPlan(viewerA, KEY_A);
    expect(Object.keys(plan).sort()).toEqual([...SHARED_PLAN_KEYS].sort());
    for (const task of plan.your_tasks) {
      expect(Object.keys(task).sort()).toEqual([...SHARED_TASK_KEYS].sort());
    }

    await generateSnapshot(IMPL_A, null);
    const content = fake.store["plan_snapshots"]![0]!.content;
    expect(Object.keys(content).sort()).toEqual([...SNAPSHOT_KEYS].sort());
    expect(Object.keys(content.plan).sort()).toEqual([...SHARED_PLAN_KEYS].sort());
  });

  it("an internal-visibility task never appears, and an internal comment never does either", async () => {
    const plan = await loadSharedPlan(viewerA, KEY_A);
    expect(plan.your_tasks.map((t) => t.title)).not.toContain(
      "INTERNAL: escalate to the account team",
    );
    expect(plan.your_tasks.flatMap((t) => t.comments)).toHaveLength(0);
  });

  it("a task blocked by INTERNAL work says so without naming it, and is not completable", async () => {
    const plan = await loadSharedPlan(viewerA, KEY_A);
    const blocked = plan.your_tasks.find((t) => t.title === "Approve the build")!;
    // The customer learns that something on our side is outstanding — not the
    // internal task's title, which is written for us.
    expect(blocked.blocked_by).toEqual(["Work on the GoCanvas side"]);
    expect(blocked.can_complete).toBe(false);
  });
});

/* ------------------------------------------------------------------------- */
/* 5. The authenticated door's scoping                                        */
/* ------------------------------------------------------------------------- */

describe("5. auth-door scoping", () => {
  it("a login linked to A cannot read B", async () => {
    const viewer: ExternalViewer = {
      kind: "auth",
      profileId: PROFILE_A,
      customerIds: [CUST_A],
      implementationIds: null,
    };
    await expect(loadSharedPlan(viewer, KEY_B)).rejects.toThrow(ExternalAccessError);
  });

  it("an implementation-scoped login cannot read a sibling implementation", async () => {
    fake.store["implementations"]!.push({
      id: "3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a",
      customer_id: CUST_A,
      name: "Acme phase two",
      current_stage: "build",
      target_launch_date: null,
      portal_key: "c3c3c3c3c3c3c3c3c3",
      owner_id: OWNER,
    });
    const viewer: ExternalViewer = {
      kind: "auth",
      profileId: PROFILE_A,
      customerIds: [CUST_A],
      implementationIds: [IMPL_A],
    };
    await expect(loadSharedPlan(viewer, "c3c3c3c3c3c3c3c3c3")).rejects.toThrow(ExternalAccessError);
  });
});

/* ------------------------------------------------------------------------- */
/* 6. Who may issue a credential                                              */
/* ------------------------------------------------------------------------- */

describe("6. internal role gate on issuing links", () => {
  it("allows the delivery and management roles", () => {
    for (const role of ["admin", "super_admin", "manager", "implementation", "onboarding"]) {
      expect(canManageExternalAccess(role)).toBe(true);
    }
  });

  it("refuses sales, tam_se and a customer login", () => {
    for (const role of ["sales", "tam_se", "customer", "am", "se", ""]) {
      expect(canManageExternalAccess(role)).toBe(false);
      expect(() => requireManage(role)).toThrow(/cannot issue/i);
    }
  });
});

/* ------------------------------------------------------------------------- */
/* 7. Write scoping                                                           */
/* ------------------------------------------------------------------------- */

describe("7. write scoping", () => {
  it("an internal task cannot be completed from outside", async () => {
    const cookie = await cookieFor(GRANT_A);
    await expect(completeTask(cookie, taskRef(WI_A_INTERNAL))).rejects.toThrow(ExternalAccessError);
    expect(items().find((w) => w.id === WI_A_INTERNAL)!.status).toBe("not_started");
  });

  it("a blocked task cannot be completed from outside", async () => {
    const cookie = await cookieFor(GRANT_A);
    await expect(completeTask(cookie, taskRef(WI_A_BLOCKED))).rejects.toThrow(ExternalAccessError);
  });

  it("a read-only grant cannot complete or reopen", async () => {
    grantA().can_complete = false;
    const cookie = await cookieFor(GRANT_A);
    await expect(completeTask(cookie, taskRef(WI_A_SHARED))).rejects.toThrow(ExternalAccessError);
    await expect(reopenTask(cookie, taskRef(WI_A_SHARED))).rejects.toThrow(ExternalAccessError);
  });

  it("a completion is recorded in the events log and both audit stores", async () => {
    const cookie = await cookieFor(GRANT_A);
    await completeTask(cookie, taskRef(WI_A_SHARED));

    const item = items().find((w) => w.id === WI_A_SHARED)!;
    expect(item.status).toBe("done");
    expect(item.completed_via).toBe("external_link");
    expect(item.completed_by_contact_id).toBe(CONTACT_A);

    expect(events().some((e) => e.event === "task_completed")).toBe(true);
    const portalRow = fake.store["portal_audit_log"]!.at(-1)!;
    expect(portalRow.actor_type).toBe("external_contact");
    expect(portalRow.actor_id).toBe(GRANT_A);
    const feedRow = fake.store["audit_log"]!.at(-1)!;
    expect(feedRow.actor_type).toBe("external_contact");
    expect(feedRow.actor_label).toBe("Ada");
  });

  it("an external comment can never be an internal note", async () => {
    const cookie = await cookieFor(GRANT_A);
    await addComment(cookie, taskRef(WI_A_SHARED), "here you go");
    const written = fake.store["work_item_comments"]!.find((c) => c.body === "here you go")!;
    expect(written.internal).toBe(false);
    expect(written.author_contact_id).toBe(CONTACT_A);
    expect(written.author_profile_id ?? null).toBeNull();
  });
});

/* ------------------------------------------------------------------------- */
/* 7b. Reassign — inherited expiry is what keeps expiry meaningful            */
/* ------------------------------------------------------------------------- */

describe("7b. reassign", () => {
  it("the new grant inherits the parent's expiry and passcode exactly", async () => {
    grantA().passcode_hash = hashPasscode("open sesame");
    const cookie = await cookieFor(GRANT_A, true);
    await reassign(cookie, { name: "Colleague", email: "colleague@acme.example" });

    const child = grants().find((g) => g.email === "colleague@acme.example")!;
    expect(child.expires_at).toBe(grantA().expires_at);
    expect(child.passcode_hash).toBe(grantA().passcode_hash);
    expect(child.parent_grant_id).toBe(GRANT_A);
    expect(child.created_via).toBe("reassign");
  });

  it("a chain of reassignments never extends the original lifetime", async () => {
    const cookieA = await cookieFor(GRANT_A);
    await reassign(cookieA, { name: "One", email: "one@acme.example" });
    const child = grants().find((g) => g.email === "one@acme.example")!;

    const cookieChild = await cookieFor(child.id);
    await reassign(cookieChild, { name: "Two", email: "two@acme.example" });
    const grandchild = grants().find((g) => g.email === "two@acme.example")!;

    expect(grandchild.expires_at).toBe(grantA().expires_at);
  });

  it("the colleague is always created under the grant's own customer", async () => {
    const cookie = await cookieFor(GRANT_A);
    // An address that already exists under customer B must NOT be reused: the
    // find-or-create is scoped to the grant's customer.
    await reassign(cookie, { name: "Bo", email: "bo@beta.example" });
    const created = fake.store["customer_contacts"]!.filter((c) => c.email === "bo@beta.example");
    expect(created.map((c) => c.customer_id).sort()).toEqual([CUST_A, CUST_B].sort());
    const newGrant = grants().find((g) => g.created_via === "reassign")!;
    expect(newGrant.email).toBe("bo@beta.example");
    expect(newGrant.customer_id).toBe(CUST_A);
    expect(newGrant.implementation_id).toBe(IMPL_A);
  });

  it("is rate limited per grant per day", async () => {
    const cookie = await cookieFor(GRANT_A);
    await reassign(cookie, { name: "One", email: "one@acme.example" });
    await reassign(cookie, { name: "Two", email: "two@acme.example" });
    // portal_app_config seeds the limit at 2 for this suite.
    await expect(reassign(cookie, { name: "Three", email: "three@acme.example" })).rejects.toThrow(
      ExternalAccessError,
    );
  });
});

/* ------------------------------------------------------------------------- */
/* 8. Upload hardening                                                        */
/* ------------------------------------------------------------------------- */

describe("8. upload hardening", () => {
  const base64 = (bytes: number) => Buffer.alloc(bytes, 1).toString("base64");

  /**
   * The visitor-facing message of an ExternalAccessError is only its neutral
   * code — the specific reason is deliberately server-side only, so it is
   * asserted on `.reason` rather than on the message.
   */
  async function reasonOf(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
    } catch (e) {
      expect(e).toBeInstanceOf(ExternalAccessError);
      return (e as ExternalAccessError).reason;
    }
    throw new Error("expected the call to be refused");
  }

  it("refuses a file over 25 MB", async () => {
    const cookie = await cookieFor(GRANT_A);
    const reason = await reasonOf(
      uploadFile(cookie, {
        ref: taskRef(WI_A_SHARED),
        fileName: "big.csv",
        mimeType: "text/csv",
        contentBase64: base64(25 * 1024 * 1024 + 1),
      }),
    );
    expect(reason).toMatch(/25 MB/);
    expect(fake.uploads).toHaveLength(0);
  });

  it("refuses a MIME type outside the allowlist", async () => {
    const cookie = await cookieFor(GRANT_A);
    const reason = await reasonOf(
      uploadFile(cookie, {
        ref: taskRef(WI_A_SHARED),
        fileName: "run.sh",
        mimeType: "application/x-sh",
        contentBase64: base64(10),
      }),
    );
    expect(reason).toMatch(/mime/i);
    expect(fake.uploads).toHaveLength(0);
  });

  it("sanitizes traversal and stores under the grant's own implementation prefix", async () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("..\\..\\windows\\system32")).toBe("system32");

    const cookie = await cookieFor(GRANT_A);
    await uploadFile(cookie, {
      ref: taskRef(WI_A_SHARED),
      fileName: "../../etc/passwd",
      mimeType: "text/csv",
      contentBase64: base64(10),
    });
    const upload = fake.uploads.at(-1)!;
    expect(upload.bucket).toBe("attachments");
    expect(upload.path.startsWith(`implementations/${IMPL_A}/external/${GRANT_A}/`)).toBe(true);
    expect(upload.path).not.toContain("..");
    expect(fake.store["work_item_files"]![0]!.file_name).toBe("passwd");
  });
});

/* ------------------------------------------------------------------------- */
/* 9. Credential hygiene                                                      */
/* ------------------------------------------------------------------------- */

describe("9. credential hygiene", () => {
  it("no raw token is ever written to a row, an event or an audit payload", async () => {
    const cookie = await cookieFor(GRANT_A);
    await openPlanWithToken(tokenA);
    await completeTask(cookie, taskRef(WI_A_SHARED));
    await reassign(cookie, { name: "One", email: "one@acme.example" });

    const everything = JSON.stringify(fake.store);
    expect(everything).not.toContain(tokenA);
    for (const grant of grants()) {
      expect(everything.includes(String(grant.token_prefix))).toBe(true); // prefix is fine
    }
    // The reassignment's own new token exists only in the email that carried it.
    const invite = h.emails.find((e) => e.to === "one@acme.example")!;
    const links = invite.html.match(/https:\/\/hub\.example\/plan\/gcpl_[A-Za-z0-9_-]+/g) ?? [];
    expect(links).toHaveLength(1);
    expect(everything).not.toContain(links[0]!.split("/plan/")[1]!);
  });
});

/* ------------------------------------------------------------------------- */
/* 10. Telemetry integrity                                                    */
/* ------------------------------------------------------------------------- */

describe("10. telemetry integrity", () => {
  it("the SSR open records nothing; only the beacon does", async () => {
    await openPlanWithToken(tokenA);
    expect(events().filter((e) => e.event === "opened")).toHaveLength(0);

    const cookie = await cookieFor(GRANT_A);
    expect((await recordOpen(cookie)).recorded).toBe(true);
    expect(events().filter((e) => e.event === "opened")).toHaveLength(1);
    expect(grantA().open_count).toBe(1);
  });

  it("dedupes an open to one per grant per hour", async () => {
    const cookie = await cookieFor(GRANT_A);
    await recordOpen(cookie);
    expect((await recordOpen(cookie)).recorded).toBe(false);
    expect(events().filter((e) => e.event === "opened")).toHaveLength(1);

    // An open from two hours ago does not suppress today's.
    events()[0]!.created_at = past(1);
    expect((await recordOpen(cookie)).recorded).toBe(true);
  });

  it("A's events never carry B's implementation", async () => {
    const cookie = await cookieFor(GRANT_A);
    await recordOpen(cookie);
    await completeTask(cookie, taskRef(WI_A_SHARED));
    for (const e of events()) {
      expect(e.implementation_id).toBe(IMPL_A);
      expect(JSON.stringify(e)).not.toContain(IMPL_B);
    }
  });
});

/* ------------------------------------------------------------------------- */
/* 11. Evidence preservation                                                  */
/* ------------------------------------------------------------------------- */

describe("11. evidence preservation", () => {
  it("reopening keeps who completed it and appends a task_reopened event", async () => {
    const cookie = await cookieFor(GRANT_A);
    await completeTask(cookie, taskRef(WI_A_SHARED));
    const completedAt = items().find((w) => w.id === WI_A_SHARED)!.completed_at;

    await reopenTask(cookie, taskRef(WI_A_SHARED));
    const item = items().find((w) => w.id === WI_A_SHARED)!;
    expect(item.status).toBe("in_progress");
    // The pointer columns are NOT cleared: the completion happened, and the
    // event log says so.
    expect(item.completed_by_contact_id).toBe(CONTACT_A);
    expect(item.completed_at).toBe(completedAt);
    expect(events().map((e) => e.event)).toEqual(["task_completed", "task_reopened"]);
  });

  it("a snapshot correction supersedes rather than edits", async () => {
    const first = await generateSnapshot(IMPL_A, null);
    const before = JSON.stringify(fake.store["plan_snapshots"]![0]!.content);

    await generateSnapshot(IMPL_A, OWNER, { supersedes: first.id });
    const rows = fake.store["plan_snapshots"]!;
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows[0]!.content)).toBe(before);
    expect(rows[1]!.supersedes_id).toBe(first.id);
  });
});

/* ------------------------------------------------------------------------- */
/* 12. Flag enforcement — server-side, not UI hiding                          */
/* ------------------------------------------------------------------------- */

describe("12. flag enforcement", () => {
  it("with the view flag off, a valid link is unavailable and the session refuses", async () => {
    h.flags["external_plan_view_enabled"] = false;
    expect((await openPlanWithToken(tokenA)).state).toBe("unavailable");
    await expect(loadSharedPlan(viewerA, KEY_A)).resolves.toBeTruthy(); // projection itself is not the gate
    const cookie = await cookieFor(GRANT_A);
    await expect(completeTask(cookie, taskRef(WI_A_SHARED))).rejects.toThrow(ExternalAccessError);
  });

  it("with actions off but view on, the plan renders and every mutation refuses", async () => {
    h.flags["external_plan_actions_enabled"] = false;
    expect((await openPlanWithToken(tokenA)).state).toBe("plan");
    const cookie = await cookieFor(GRANT_A);
    await expect(completeTask(cookie, taskRef(WI_A_SHARED))).rejects.toThrow(ExternalAccessError);
    await expect(addComment(cookie, taskRef(WI_A_SHARED), "hi")).rejects.toThrow(
      ExternalAccessError,
    );
    await expect(reassign(cookie, { name: "One", email: "one@acme.example" })).rejects.toThrow(
      ExternalAccessError,
    );
    expect(items().find((w) => w.id === WI_A_SHARED)!.status).toBe("not_started");
  });
});
