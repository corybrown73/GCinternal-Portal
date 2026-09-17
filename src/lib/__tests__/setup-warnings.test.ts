import { describe, expect, it } from "vitest";

import { setupWarnings } from "../setup-warnings";

const ok = {
  aiConfigured: true,
  emailLive: true,
  poolSize: 3,
  profiles: { total: 3, missingPhoto: 0, missingBooking: 0 },
  me: { photo: true, booking: true, title: true },
};

describe("setupWarnings", () => {
  it("is silent when everything is set up", () => {
    expect(setupWarnings(ok, true)).toEqual([]);
    expect(setupWarnings(null, true)).toEqual([]);
  });

  it("tells everyone about their own profile, and only managers about the deployment", () => {
    const s = {
      ...ok,
      aiConfigured: false,
      emailLive: false,
      poolSize: 0,
      me: { ...ok.me, photo: false },
    };
    expect(setupWarnings(s, false).map((w) => w.key)).toEqual(["me"]);
    expect(setupWarnings(s, true).map((w) => w.key)).toEqual(["me", "pool", "ai", "email"]);
    expect(setupWarnings(s, true).find((w) => w.key === "pool")!.to).toBe("/admin/assignment");
  });
});
