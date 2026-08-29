import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-side role guards. `requireInternal` is the enforcement point the
 * requireInternalAuth middleware runs for every hub/presale server function —
 * a customer-role JWT must be rejected here, not just hidden by the client
 * AuthGate.
 */

const profiles = new Map<
  string,
  { id: string; email: string; full_name: string | null; role: string }
>();

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => {
            if (table !== "portal_profiles") throw new Error(`unexpected table ${table}`);
            return { data: profiles.get(id) ?? null, error: null };
          },
        }),
      }),
    }),
  },
}));

import { canEditJourneys, requireInternal } from "../portal.server";

beforeEach(() => {
  profiles.clear();
  profiles.set("u-internal", {
    id: "u-internal",
    email: "i@gocanvas.com",
    full_name: "I",
    role: "implementation",
  });
  profiles.set("u-customer", {
    id: "u-customer",
    email: "c@example.com",
    full_name: "C",
    role: "customer",
  });
});

describe("requireInternal", () => {
  it("passes internal roles through with their profile", async () => {
    const profile = await requireInternal("u-internal");
    expect(profile.role).toBe("implementation");
  });

  it("rejects customer-role logins", async () => {
    await expect(requireInternal("u-customer")).rejects.toThrow(/internal users only/i);
  });

  it("rejects auth users with no portal profile", async () => {
    await expect(requireInternal("u-ghost")).rejects.toThrow(/no profile/i);
  });
});

describe("canEditJourneys", () => {
  it("allows managers/admins/implementation, denies sales/tam_se/customer", () => {
    for (const role of ["admin", "super_admin", "manager", "implementation"]) {
      expect(canEditJourneys(role)).toBe(true);
    }
    for (const role of ["sales", "tam_se", "customer", ""]) {
      expect(canEditJourneys(role)).toBe(false);
    }
  });
});
