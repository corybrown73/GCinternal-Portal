import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * Issue #83, Part 1, corrected. Applying a reviewed SOW proposal is recorded as
 * the signed-in user's linked team member. Only a correctly linked, active team
 * member may apply. Every other case is refused before anything is written, and
 * the request cannot name an author.
 */

const h = vi.hoisted(() => {
  const state = {
    client: null as any,
    forward: null as any,
    journal: [] as Array<Record<string, any>>,
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

// The journal write belongs to hub.server; this test checks who it was written for.
vi.mock("../hub.server", () => ({
  createJournalEntry: async (args: Record<string, any>) => {
    h.journal.push(args);
    return { ok: true, id: "journal-new" };
  },
}));

import { applySowProposalInput } from "../sow-analysis";
import { applySowProposalToImplementation } from "../hub.functions";

const IMPL = "33333333-3333-4333-8333-333333333333";
const USER = "11111111-1111-4111-8111-111111111111";
const USER_TM = "77777777-7777-4777-8777-777777777771";
const OTHER_TM = "88888888-8888-4888-8888-888888888888";
const INACTIVE_TM = "99999999-9999-4999-8999-999999999999";
const STALE_TM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OLD_REQ = "c0000000-0000-4000-8000-000000000001";

const rows: Rows = {
  implementations: [{ id: IMPL, customer_goals: "Existing goal." }],
  requirements: [
    { id: OLD_REQ, implementation_id: IMPL, title: "Earlier requirement", source: "SOW analysis" },
  ],
  success_criteria: [],
  team_members: [
    { id: USER_TM, name: "Signed In", active: true },
    { id: OTHER_TM, name: "Someone Else", active: true },
    { id: INACTIVE_TM, name: "Left The Team", active: false },
  ],
};

let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  // These tests are about who the write is attributed to. The signed-in person may change the
  // implementation here, so the access check answers yes.
  fake = createFakeSupabase(rows, {
    rpcHandlers: { post_sale_may_manage: () => ({ data: true }) },
  });
  h.client = fake.client;
  h.journal.length = 0;
});

const snapshot = () => JSON.stringify(fake.store);

/** The request body the page sends. It deliberately names another employee as author. */
const body = (extra: Record<string, unknown> = {}) => ({
  implementationId: IMPL,
  goals: "Reduce inspection time.",
  requirements: ["Capture photos offline"],
  successMeasures: ["Inspections under 10 minutes"],
  journeyNote: "Reviewed journey.",
  ...extra,
});

const profile = (over: Record<string, unknown> = {}) => ({
  id: USER,
  email: "signed-in@gocanvas.com",
  full_name: "Signed In",
  role: "implementation",
  team_member_id: USER_TM,
  ...over,
});

const apply = (
  data: Record<string, unknown>,
  p: Record<string, unknown> | null | undefined = profile(),
) => applySowProposalToImplementation({ data, context: { profile: p } } as never);

/** A refusal: the message, no journal entry, and every row exactly as it was. */
async function expectRefusedWithoutWrites(run: () => Promise<unknown>, message: RegExp) {
  const before = snapshot();
  await expect(run()).rejects.toThrow(message);
  expect(h.journal).toEqual([]);
  expect(snapshot()).toBe(before);
}

describe("a correctly linked, active team member applies the proposal as themselves", () => {
  it("records the linked team member as author, and ignores an author named in the body", async () => {
    await apply(body({ authorId: OTHER_TM }));
    expect(h.journal).toHaveLength(1);
    expect(h.journal[0]!["authorId"]).toBe(USER_TM);
    expect(h.journal[0]!["authorId"]).not.toBe(OTHER_TM);
  });

  it("applies goals, requirements, success measures and the journey note, attributed to the linked member", async () => {
    const out = await apply(body());
    expect(out).toEqual({ goals: true, requirements: 1, successMeasures: 1, note: true });
    const impl = fake.store["implementations"]!.find((r) => r["id"] === IMPL)!;
    expect(String(impl["customer_goals"])).toContain("Existing goal.");
    expect(String(impl["customer_goals"])).toContain("Reduce inspection time.");
    expect(fake.store["requirements"]!.map((r) => r["title"])).toContain("Capture photos offline");
    expect(fake.store["success_criteria"]!.map((r) => r["description"])).toContain(
      "Inspections under 10 minutes",
    );
    expect(h.journal).toEqual([
      expect.objectContaining({
        implementationId: IMPL,
        note: "Reviewed journey.",
        authorId: USER_TM,
      }),
    ]);
  });

  it("applies only what was picked", async () => {
    const out = await apply(body({ goals: null, successMeasures: [], journeyNote: null }));
    expect(out).toEqual({ goals: false, requirements: 1, successMeasures: 0, note: false });
    expect(h.journal).toEqual([]);
  });
});

describe("a body-supplied author cannot override the session identity", () => {
  it("drops an author field from the request schema, so it is never read", () => {
    const parsed = applySowProposalInput.parse(body({ authorId: OTHER_TM }));
    expect(parsed).not.toHaveProperty("authorId");
  });

  it.each(["author_id", "applied_by", "teamMemberId", "team_member_id", "authorTeamMemberId"])(
    "ignores a team member named under the field %s",
    async (field) => {
      await apply(body({ [field]: OTHER_TM }));
      expect(h.journal[0]!["authorId"]).toBe(USER_TM);
    },
  );

  it("refuses a body that names an author, when the signed-in user has no link, rather than using the body", async () => {
    await expectRefusedWithoutWrites(
      () => apply(body({ authorId: OTHER_TM }), profile({ team_member_id: null })),
      /not linked to a team member/,
    );
  });
});

describe("a user with no linked team member is refused", () => {
  it("refuses a login with no team member link, and says the profile needs linking", async () => {
    await expectRefusedWithoutWrites(
      () => apply(body(), profile({ team_member_id: null })),
      /link your profile to your team member record, then apply it again/,
    );
  });

  it("refuses a link that is not a usable identifier, and treats it as no link", async () => {
    await expectRefusedWithoutWrites(
      () => apply(body(), profile({ team_member_id: "not-an-id" })),
      /not linked to a team member/,
    );
  });
});

describe("an invalid or stale team member link is refused", () => {
  it("refuses a link to a team member that no longer exists", async () => {
    await expectRefusedWithoutWrites(
      () => apply(body(), profile({ team_member_id: STALE_TM })),
      /no longer exists.*link your profile/s,
    );
  });

  it("refuses a link to a team member who is no longer active", async () => {
    await expectRefusedWithoutWrites(
      () => apply(body(), profile({ team_member_id: INACTIVE_TM })),
      /no longer active.*link your profile/s,
    );
  });

  it("refuses when the team member record cannot be read, rather than assuming the link is good", async () => {
    const orig = fake.client.from;
    fake.client.from = (table: string) => {
      const builder = orig(table);
      if (table !== "team_members") return builder;
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: "connection reset" } }),
          }),
        }),
      };
    };
    await expectRefusedWithoutWrites(() => apply(body()), /Could not check your team member link/);
  });
});

describe("a missing or invalid session identity writes nothing", () => {
  it.each([
    ["no session profile", undefined],
    ["a null session profile", null],
    ["a profile with no id", { role: "implementation", team_member_id: USER_TM }],
    ["an empty id", profile({ id: "" })],
    ["a malformed id", profile({ id: "not-an-id" })],
  ])("refuses %s, and writes nothing", async (_label, p) => {
    await expectRefusedWithoutWrites(
      () =>
        applySowProposalToImplementation({
          data: body({ authorId: OTHER_TM }),
          context: { profile: p },
        } as never),
      /no signed-in user/,
    );
  });
});

describe("previously applied proposals are not rewritten", () => {
  it("keeps the earlier requirement exactly as it was, and appends the new goal rather than replacing the old", async () => {
    await apply(body());
    const earlier = fake.store["requirements"]!.find((r) => r["id"] === OLD_REQ)!;
    expect(earlier).toEqual(rows["requirements"]![0]);
    const impl = fake.store["implementations"]!.find((r) => r["id"] === IMPL)!;
    expect(String(impl["customer_goals"]).startsWith("Existing goal.")).toBe(true);
  });

  it("a refusal leaves the team members, requirements and implementation exactly as they were", async () => {
    const before = snapshot();
    await expect(apply(body(), profile({ team_member_id: null }))).rejects.toThrow();
    await expect(apply(body(), profile({ team_member_id: STALE_TM }))).rejects.toThrow();
    await expect(apply(body(), profile({ team_member_id: INACTIVE_TM }))).rejects.toThrow();
    expect(snapshot()).toBe(before);
    expect(h.journal).toEqual([]);
  });
});
