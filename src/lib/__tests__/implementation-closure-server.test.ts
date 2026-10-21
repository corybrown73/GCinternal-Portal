import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  // Any read or write outside the database function would reach this and fail the test.
  from: vi.fn(() => {
    throw new Error("closing an implementation must go through the database function only");
  }),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: h.rpc, from: h.from },
}));

import { closeImplementation, closureRefusal } from "../implementation-closure.server";

const IMPL = "d0000000-0000-4000-8000-000000000001";
const ACTOR = "a0000000-0000-4000-8000-000000000003";

beforeEach(() => {
  h.rpc.mockReset();
  h.from.mockClear();
});

describe("closing goes through the database function", () => {
  it("passes the implementation, reason, explanation and the acting profile", async () => {
    h.rpc.mockResolvedValue({
      data: {
        id: IMPL,
        closed_at: "2026-10-21T10:15:00Z",
        closure_reason: "implementation_not_required",
      },
      error: null,
    });

    const out = await closeImplementation(
      {
        implementationId: IMPL,
        reason: "implementation_not_required",
        note: "Customer runs it in-house.",
      },
      ACTOR,
    );

    expect(h.rpc).toHaveBeenCalledWith("portal_close_implementation", {
      p_implementation_id: IMPL,
      p_reason: "implementation_not_required",
      p_note: "Customer runs it in-house.",
      p_actor_profile_id: ACTOR,
    });
    expect(out).toEqual({ implementationId: IMPL, closedAt: "2026-10-21T10:15:00Z" });
    expect(h.from).not.toHaveBeenCalled();
  });

  it("says nothing changed when the database returns no closure time", async () => {
    h.rpc.mockResolvedValue({ data: { id: IMPL, closed_at: null }, error: null });
    await expect(
      closeImplementation(
        { implementationId: IMPL, reason: "implementation_not_required", note: "x" },
        ACTOR,
      ),
    ).rejects.toThrow(/Nothing has been changed/);
  });
});

describe("a refusal is said plainly", () => {
  it("explains a forbidden closure without leaking the rule's internals", () => {
    const e = closureRefusal({ code: "42501", message: "forbidden: ..." });
    expect(e.message).toMatch(/cannot close this implementation/);
    expect(e.message).toMatch(/manager, an admin, or the implementation specialist/);
  });

  it("says when the implementation is already closed", () => {
    expect(closureRefusal({ code: "23505" }).message).toBe(
      "This implementation is already closed.",
    );
  });

  it("says when the implementation has graduated, and never offers closure as a route round it", () => {
    const e = closureRefusal({
      code: "22023",
      message: "Implementation x has graduated and cannot be closed",
    });
    expect(e.message).toBe("A graduated implementation cannot be closed.");
  });

  it("shows the database's own message for another invalid closure", () => {
    expect(
      closureRefusal({ code: "22023", message: "a closure needs a short explanation" }).message,
    ).toBe("a closure needs a short explanation");
  });

  it("falls back to a plain nothing-changed message for anything unrecognised", () => {
    expect(closureRefusal({ code: "XX000", message: "boom" }).message).toBe(
      "Could not close the implementation. Nothing has been changed.",
    );
  });

  it("turns a database refusal into an error rather than a success", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "dup" } });
    await expect(
      closeImplementation(
        { implementationId: IMPL, reason: "implementation_not_required", note: "x" },
        ACTOR,
      ),
    ).rejects.toThrow(/already closed/);
  });
});
