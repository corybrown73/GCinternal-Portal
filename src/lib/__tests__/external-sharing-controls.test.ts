import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * Issue #83, Part 1, corrected. The external-sharing panel shows each action only
 * to the roles the server accepts for it. The server still refuses every call from
 * anyone else, and a refused call writes nothing.
 */

const h = vi.hoisted(() => {
  const state = {
    client: null as any,
    forward: null as any,
    emails: [] as unknown[],
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

vi.mock("../server/email", () => ({
  sendEmail: async (message: unknown) => {
    h.emails.push(message);
  },
}));

import { externalSharingControls, requireManage } from "../external-share-policy";
import {
  issuePlanLink,
  revokePlanLink,
  rotatePlanLink,
  setPlanLinkPasscode,
} from "../external-share.functions";

const IMPL = "33333333-3333-4333-8333-333333333333";
const GRANT = "d0000000-0000-4000-8000-000000000001";
const USER = "11111111-1111-4111-8111-111111111111";

const AUTHORISED = ["admin", "super_admin", "manager", "implementation", "onboarding"];
const UNAUTHORISED = ["am", "sales", "se", "tam_se", "customer", "auditor", "Admin", ""];

const rows: Rows = {
  implementations: [{ id: IMPL, customer_id: null, name: "Acme" }],
  external_access_grants: [
    {
      id: GRANT,
      implementation_id: IMPL,
      email: "customer@example.com",
      revoked_at: null,
      can_complete: true,
      passcode_hash: null,
    },
  ],
};

let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  fake = createFakeSupabase(rows);
  h.client = fake.client;
  h.emails.length = 0;
});

const grants = () => JSON.stringify(fake.store["external_access_grants"]);
const session = (role: string | null | undefined) => ({
  id: USER,
  role,
  full_name: "Someone",
  email: "s@gocanvas.com",
});

describe("the interface offers each action to the authorised roles only", () => {
  it.each(AUTHORISED)("shows every sharing control to the %s role", (role) => {
    expect(externalSharingControls(role)).toEqual({
      issueLink: true,
      revokeLink: true,
      rotateLink: true,
      setPasscode: true,
      snapshotActions: true,
    });
  });

  it.each([...UNAUTHORISED, null, undefined])("shows no sharing control to the %j role", (role) => {
    expect(externalSharingControls(role)).toEqual({
      issueLink: false,
      revokeLink: false,
      rotateLink: false,
      setPasscode: false,
      snapshotActions: false,
    });
  });

  it("names exactly the actions the panel gates", () => {
    expect(Object.keys(externalSharingControls("admin")).sort()).toEqual(
      ["issueLink", "revokeLink", "rotateLink", "setPasscode", "snapshotActions"].sort(),
    );
  });

  it("agrees with the server's own check for every role it is asked about", () => {
    for (const role of [...AUTHORISED, ...UNAUTHORISED, null, undefined]) {
      const allowedByServer = (() => {
        try {
          requireManage(role as string);
          return true;
        } catch {
          return false;
        }
      })();
      const controls = externalSharingControls(role);
      expect(controls.issueLink).toBe(allowedByServer);
      expect(controls.revokeLink).toBe(allowedByServer);
      expect(controls.rotateLink).toBe(allowedByServer);
      expect(controls.setPasscode).toBe(allowedByServer);
    }
  });
});

describe("the server refuses unauthorised callers even when the functions are called directly", () => {
  it.each(UNAUTHORISED)(
    "refuses issuing a link from the %j role, and writes nothing",
    async (role) => {
      const before = grants();
      await expect(
        issuePlanLink({
          data: {
            implementationId: IMPL,
            email: "new@example.com",
            canComplete: true,
            sendEmailToContact: false,
          },
          context: { profile: session(role) },
        } as never),
      ).rejects.toThrow(/cannot issue or revoke customer links/);
      expect(grants()).toBe(before);
      expect(fake.inserts).toEqual([]);
      expect(h.emails).toEqual([]);
    },
  );

  it.each(UNAUTHORISED)(
    "refuses revoking a link from the %j role, and leaves it live",
    async (role) => {
      const before = grants();
      await expect(
        revokePlanLink({ data: { grantId: GRANT }, context: { profile: session(role) } } as never),
      ).rejects.toThrow(/cannot issue or revoke customer links/);
      expect(grants()).toBe(before);
    },
  );

  it.each(UNAUTHORISED)(
    "refuses rotating a link from the %j role, and changes nothing",
    async (role) => {
      const before = grants();
      await expect(
        rotatePlanLink({ data: { grantId: GRANT }, context: { profile: session(role) } } as never),
      ).rejects.toThrow(/cannot issue or revoke customer links/);
      expect(grants()).toBe(before);
      expect(fake.inserts).toEqual([]);
    },
  );

  it.each(UNAUTHORISED)(
    "refuses setting a passcode from the %j role, and changes nothing",
    async (role) => {
      const before = grants();
      await expect(
        setPlanLinkPasscode({
          data: { grantId: GRANT, passcode: "1234" },
          context: { profile: session(role) },
        } as never),
      ).rejects.toThrow(/cannot issue or revoke customer links/);
      expect(grants()).toBe(before);
    },
  );

  it("does not let a body claim a role the session does not have", async () => {
    const before = grants();
    await expect(
      revokePlanLink({
        data: { grantId: GRANT, role: "admin" },
        context: { profile: session("am") },
      } as never),
    ).rejects.toThrow(/cannot issue or revoke customer links/);
    expect(grants()).toBe(before);
  });
});
