import { afterEach, describe, expect, it, vi } from "vitest";

import { appUrl, resetAppUrlWarning } from "@/lib/app-url";

const original = { url: process.env["APP_URL"], env: process.env["NODE_ENV"] };

afterEach(() => {
  process.env["APP_URL"] = original.url;
  process.env["NODE_ENV"] = original.env;
  resetAppUrlWarning();
  vi.restoreAllMocks();
});

describe("appUrl", () => {
  it("returns the configured origin", () => {
    process.env["APP_URL"] = "https://gcinternalportal.com";
    expect(appUrl()).toBe("https://gcinternalportal.com");
  });

  // A trailing slash turns every built link into "…com//plan/abc". Harmless in
  // a browser, and it looks like a bug to the customer reading the address.
  it("strips a trailing slash so links do not double up", () => {
    process.env["APP_URL"] = "https://gcinternalportal.com/";
    expect(appUrl()).toBe("https://gcinternalportal.com");
    process.env["APP_URL"] = "https://gcinternalportal.com///";
    expect(appUrl()).toBe("https://gcinternalportal.com");
  });

  it("falls back to localhost in development", () => {
    delete process.env["APP_URL"];
    process.env["NODE_ENV"] = "development";
    expect(appUrl()).toBe("http://localhost:3000");
  });

  // The failure this module exists to make visible: a production deploy with
  // no APP_URL emails customers a link that only resolves on the machine that
  // generated it, and nothing throws.
  it("shouts once when unset in production", () => {
    delete process.env["APP_URL"];
    process.env["NODE_ENV"] = "production";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(appUrl()).toBe("http://localhost:3000");
    expect(appUrl()).toBe("http://localhost:3000");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain("APP_URL_UNSET");
  });
});
