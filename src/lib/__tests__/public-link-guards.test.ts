import { beforeEach, describe, expect, it } from "vitest";

import {
  isPublicLinkPath,
  PUBLIC_LINK_HEADERS,
  withPublicLinkHeaders,
} from "../public-link-headers";
import {
  enforceRateLimit,
  resetRateLimits,
  takeRateLimit,
  RateLimitedError,
  WELCOME_CLICK_LIMIT,
  WELCOME_READ_LIMIT,
} from "../server/rate-limit";

/**
 * The customer link's guards (Teya, item 8, the parts that need no migration):
 * real noindex / no-referrer / no-store headers on the token pages, and a
 * best-effort per-token rate limit.
 */
describe("public link headers", () => {
  it("cover the token pages and nothing else", () => {
    for (const p of ["/welcome/gcwl_x", "/plan/abc", "/view/abc", "/go/gcwl_x/123"])
      expect(isPublicLinkPath(p)).toBe(true);
    for (const p of ["/", "/welcome", "/customers/1", "/planning", "/api/welcome-ics/x"])
      expect(isPublicLinkPath(p)).toBe(false);
  });

  it("are set on the response, also on one whose headers cannot change", () => {
    const r = withPublicLinkHeaders(new Response("ok", { headers: { "x-a": "1" } }));
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    expect(r.headers.get("cache-control")).toBe("no-store, private");
    expect(r.headers.get("x-a")).toBe("1");

    const locked = Response.redirect("https://example.com/", 302);
    const out = withPublicLinkHeaders(locked);
    expect(out.status).toBe(302);
    expect(out.headers.get("location")).toBe("https://example.com/");
    for (const [k, v] of Object.entries(PUBLIC_LINK_HEADERS)) expect(out.headers.get(k)).toBe(v);
  });
});

describe("rate limit", () => {
  beforeEach(() => resetRateLimits());

  it("allows the budget per key and window, then refuses until the window passes", () => {
    const rule = { limit: 3, windowMs: 1000 };
    expect([1, 2, 3].map(() => takeRateLimit("a", rule, 0))).toEqual([true, true, true]);
    expect(takeRateLimit("a", rule, 500)).toBe(false);
    // Another token has its own budget.
    expect(takeRateLimit("b", rule, 500)).toBe(true);
    expect(takeRateLimit("a", rule, 1000)).toBe(true);
  });

  it("throws a 429-shaped error when enforced", () => {
    const rule = { limit: 1, windowMs: 1000 };
    enforceRateLimit("k", rule, 0);
    expect(() => enforceRateLimit("k", rule, 10)).toThrow(RateLimitedError);
    try {
      enforceRateLimit("k", rule, 10);
    } catch (e) {
      expect((e as RateLimitedError).statusCode).toBe(429);
      expect((e as RateLimitedError).retryAfterMs).toBe(990);
    }
  });

  it("leaves room for a customer team on one link, and keeps clicks off the polling budget", () => {
    // Ten tabs polling every ten seconds, and each of them loading twice.
    for (let i = 0; i < 10 * 6 + 10 * 2; i++)
      expect(takeRateLimit("welcome:read:t", WELCOME_READ_LIMIT, 0)).toBe(true);
    expect(takeRateLimit("welcome:click:t", WELCOME_CLICK_LIMIT, 0)).toBe(true);
  });
});
