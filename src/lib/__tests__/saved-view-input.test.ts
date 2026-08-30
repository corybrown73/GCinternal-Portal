import { describe, expect, it } from "vitest";

import { searchToView } from "../saved-view-input";

describe("searchToView", () => {
  it("carries the account scope, which a saved view was silently dropping", () => {
    // THE BUG. Saving from ?scope=all&stage=graduate-to-cs stored
    // {"dir":"desc","sort":"days","stage":"graduate-to-cs"} — no scope — so
    // applying the view reset to "mine" and rendered zero rows. The serializer
    // was never at fault; the call site hand-built an object without it.
    const out = searchToView({
      scope: "all",
      stage: "graduate-to-cs",
      sort: "days",
      dir: "desc",
    });
    expect(out).toEqual({
      scope: "all",
      stage: "graduate-to-cs",
      sort: "days",
      dir: "desc",
    });
  });

  it("keeps an owner scope intact rather than flattening it", () => {
    const out = searchToView({ scope: "owner:a0000000-0000-4000-8000-000000000002" });
    expect(out["scope"]).toBe("owner:a0000000-0000-4000-8000-000000000002");
  });

  it("omits an absent scope instead of storing an empty string", () => {
    // A view pinning scope:"" would filter on the empty string on any surface
    // that treats a present key as a filter.
    expect(searchToView({ scope: undefined, sort: "days" })).toEqual({ sort: "days" });
    expect(searchToView({ scope: "", sort: "days" })).toEqual({ sort: "days" });
    expect(searchToView({ scope: "   ", sort: "days" })).toEqual({ sort: "days" });
  });

  it("drops nulls and keeps numbers and booleans", () => {
    expect(searchToView({ a: null, b: 0, c: false, d: "x" })).toEqual({ b: 0, c: false, d: "x" });
  });
});
