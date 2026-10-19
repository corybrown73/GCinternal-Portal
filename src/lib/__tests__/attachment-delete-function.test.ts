import { describe, expect, it, vi } from "vitest";

/**
 * Issue #79. The deleteAttachment server function is what the page calls. These
 * tests call it directly, as a crafted request would, and check what it hands
 * to the removal: the actor is the caller's session, never the request body,
 * and the account must be named.
 *
 * createServerFn is replaced with a small stand-in that keeps the input
 * validator and the handler, so the wrapper's own code runs. The role gate
 * (requireDealEditor) is a separate module and is not run here; removal refuses
 * customers on its own (attachment-deletion.test.ts).
 */

const h = vi.hoisted(() => ({ calls: [] as any[] }));

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
  requireDealEditor: {},
  requireInternalAuth: {},
}));

vi.mock("../attachments.server", () => ({
  removeAccountFile: async (args: unknown) => {
    h.calls.push(args);
    return { ok: true, removed: true };
  },
  loadAccountFiles: async () => [],
  addAccountLink: async () => ({}),
  addAccountUpload: async () => ({}),
  accountFileLink: async () => ({ url: "" }),
}));

import { deleteAttachment } from "../attachments.functions";

const IMPL = "33333333-3333-4333-8333-333333333333";
const FILE = "a0000000-0000-4000-8000-000000000001";
const UPLOADER = "11111111-1111-4111-8111-111111111111";
const COLLEAGUE = "66666666-6666-4666-8666-666666666666";

const session = { id: UPLOADER, email: "uploader@gocanvas.com", full_name: "Uploader", role: "am" };

const call = (data: unknown, profile: unknown = session) =>
  deleteAttachment({ data, context: { profile } } as never);

describe("deleteAttachment: the caller's session decides who is removing", () => {
  it("hands the removal the caller's session as the actor, with the account the request names", async () => {
    h.calls.length = 0;
    const out = await call({ id: FILE, implementationId: IMPL });
    expect(out).toEqual({ ok: true, removed: true });
    expect(h.calls).toEqual([
      { id: FILE, implementationId: IMPL, actor: { id: UPLOADER, role: "am" } },
    ]);
  });

  it("passes the exact admin role from the session, and nothing from the body", async () => {
    h.calls.length = 0;
    await call({ id: FILE, implementationId: IMPL }, { id: COLLEAGUE, role: "admin" });
    expect(h.calls[0].actor).toEqual({ id: COLLEAGUE, role: "admin" });
    h.calls.length = 0;
    await call({ id: FILE, implementationId: IMPL, role: "admin" }, { id: UPLOADER, role: "am" });
    expect(h.calls[0].actor).toEqual({ id: UPLOADER, role: "am" });
  });

  it("ignores any identity the request body claims for itself", async () => {
    h.calls.length = 0;
    await call({
      id: FILE,
      implementationId: IMPL,
      actor: { id: COLLEAGUE, role: "admin" },
      actorId: COLLEAGUE,
      added_by: COLLEAGUE,
    });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].actor).toEqual({ id: UPLOADER, role: "am" });
    expect(Object.keys(h.calls[0]).sort()).toEqual(["actor", "id", "implementationId"]);
  });

  it("refuses a request that does not name the account", async () => {
    h.calls.length = 0;
    await expect(call({ id: FILE })).rejects.toThrow();
    expect(h.calls).toEqual([]);
  });

  it("refuses a request whose account or attachment id is not an id", async () => {
    h.calls.length = 0;
    await expect(call({ id: "not-an-id", implementationId: IMPL })).rejects.toThrow();
    await expect(call({ id: FILE, implementationId: "not-an-id" })).rejects.toThrow();
    expect(h.calls).toEqual([]);
  });
});
