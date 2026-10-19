import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * Issue #83, Part 1. Applying a reviewed SOW proposal records the signed-in user
 * as the author. The request cannot name an author, and an identity that is
 * missing or unusable writes nothing. Existing proposals and the workflow itself
 * are unchanged.
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
const OLD_REQ = "c0000000-0000-4000-8000-000000000001";

const rows: Rows = {
  implementations: [{ id: IMPL, customer_goals: "Existing goal." }],
  requirements: [
    { id: OLD_REQ, implementation_id: IMPL, title: "Earlier requirement", source: "SOW analysis" },
  ],
  success_criteria: [],
};

let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  fake = createFakeSupabase(rows);
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

describe("the author is the signed-in user, not the request", () => {
  it("records the signed-in user's team member, and ignores an author named in the body", async () => {
    await apply(body({ authorId: OTHER_TM }));
    expect(h.journal).toHaveLength(1);
    expect(h.journal[0]!["authorId"]).toBe(USER_TM);
    expect(h.journal[0]!["authorId"]).not.toBe(OTHER_TM);
  });

  it("drops an author field from the request schema, so it is never read", () => {
    const parsed = applySowProposalInput.parse(body({ authorId: OTHER_TM }));
    expect(parsed).not.toHaveProperty("authorId");
  });

  it("ignores a body that impersonates a team member under any field name", async () => {
    await apply(body({ author_id: OTHER_TM, applied_by: OTHER_TM, teamMemberId: OTHER_TM }));
    expect(h.journal[0]!["authorId"]).toBe(USER_TM);
  });

  it("records no author when the signed-in login has no team member link, and still applies the proposal", async () => {
    await apply(body({ authorId: OTHER_TM }), profile({ team_member_id: null }));
    expect(h.journal[0]!["authorId"]).toBeNull();
    expect(fake.store["requirements"]!.map((r) => r["title"])).toContain("Capture photos offline");
  });

  it("treats an unusable team member link in the session as no link, never as a value from the request", async () => {
    await apply(body({ authorId: OTHER_TM }), profile({ team_member_id: "not-an-id" }));
    expect(h.journal[0]!["authorId"]).toBeNull();
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
    const before = snapshot();
    await expect(
      applySowProposalToImplementation({
        data: body({ authorId: OTHER_TM }),
        context: { profile: p },
      } as never),
    ).rejects.toThrow(/no signed-in user/);
    expect(h.journal).toEqual([]);
    expect(snapshot()).toBe(before);
  });

  it("refuses without writing a requirement or changing the goals", async () => {
    const before = snapshot();
    await expect(apply(body(), profile({ id: null }))).rejects.toThrow(/no signed-in user/);
    expect(snapshot()).toBe(before);
  });
});

describe("the existing SOW proposal workflow still works", () => {
  it("applies goals, requirements, success measures and the journey note, attributed to the user", async () => {
    const out = await apply(body());
    expect(out).toEqual({
      goals: true,
      requirements: 1,
      successMeasures: 1,
      note: true,
    });
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

  it("applies only what was picked, and writes nothing else", async () => {
    const out = await apply(body({ goals: null, successMeasures: [], journeyNote: null }));
    expect(out).toEqual({ goals: false, requirements: 1, successMeasures: 0, note: false });
    expect(h.journal).toEqual([]);
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
});
