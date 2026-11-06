import type { QueryKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { refreshStageViews, stageRefreshKeys } from "../stage-refresh";

function recorder() {
  const calls: QueryKey[] = [];
  const qc = {
    invalidateQueries: ({ queryKey }: { queryKey: QueryKey }) => {
      calls.push(queryKey);
      return Promise.resolve();
    },
  };
  return { qc, calls };
}

describe("the stage views re-read together", () => {
  it("a task tick or a move refreshes the header, the rail, the gate panel and the deal", () => {
    const keys = stageRefreshKeys({
      implementationId: "impl-1",
      customerId: "cust-1",
      dealId: "deal-1",
    });
    expect(keys).toEqual(
      expect.arrayContaining([
        ["plan", "impl-1"],
        ["partner-progress", "impl-1"],
        ["customer360", "cust-1"],
        ["deal", "deal-1"],
        ["welcome", "deal-1"],
        ["home"],
      ]),
    );
  });

  it("a milestone or booking with no implementation in scope refreshes every plan that is on screen", () => {
    const keys = stageRefreshKeys({ dealId: "deal-1" });
    expect(keys).toEqual(expect.arrayContaining([["plan"], ["partner-progress"], ["customer360"]]));
    expect(keys).not.toContainEqual(["plan", undefined]);
  });

  it("asks the query client for every key and resolves once they have all been asked", async () => {
    const { qc, calls } = recorder();
    await refreshStageViews(qc, { implementationId: "impl-1", dealId: "deal-1" });
    expect(calls).toEqual(stageRefreshKeys({ implementationId: "impl-1", dealId: "deal-1" }));
  });
});
