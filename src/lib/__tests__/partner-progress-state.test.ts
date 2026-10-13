import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PartnerProgressStatus, partnerBodyState } from "@/components/partner-journey-panels";

/**
 * Current Implementation's partner body while its progress is loading, when it
 * cannot load, and after a retry. It never draws the standard stage controls in
 * place of the partner journey.
 */

describe("partnerBodyState — what the partner body shows", () => {
  it("is ready once progress is in hand, whatever the query's history", () => {
    expect(partnerBodyState({ data: { stages: [] }, isError: false })).toBe("ready");
  });

  it("is an error when the progress failed and nothing is in hand", () => {
    expect(partnerBodyState({ data: undefined, isError: true })).toBe("error");
  });

  it("is loading while the first read is in flight", () => {
    expect(partnerBodyState({ data: undefined, isError: false })).toBe("loading");
  });

  it("recovers after a retry: an error becomes ready when progress arrives", () => {
    const failed = { data: undefined, isError: true };
    const recovered = { data: { stages: [] }, isError: false };
    expect(partnerBodyState(failed)).toBe("error");
    expect(partnerBodyState(recovered)).toBe("ready");
  });
});

describe("PartnerProgressStatus — the failure and loading states", () => {
  const onRetry = () => {};

  it("explains the failure, offers a retry, and offers no standard control", () => {
    const markup = renderToStaticMarkup(
      createElement(PartnerProgressStatus, { state: "error", retrying: false, onRetry }),
    );
    expect(markup).toContain("can&#x27;t be loaded right now");
    expect(markup).toContain("Nothing has been changed");
    expect(markup).toContain("Try again");
    expect(markup).not.toMatch(
      /Move to|Advance anyway|Override|Skip to Graduation|Complete &amp; Graduate|Hand to GoCanvas/,
    );
  });

  it("shows the retry as busy while it is trying again", () => {
    const markup = renderToStaticMarkup(
      createElement(PartnerProgressStatus, { state: "error", retrying: true, onRetry }),
    );
    expect(markup).toContain("Trying again…");
    expect(markup).toMatch(/<button[^>]*disabled=""/);
  });

  it("shows a loading line while the journey loads", () => {
    const markup = renderToStaticMarkup(
      createElement(PartnerProgressStatus, { state: "loading", retrying: false, onRetry }),
    );
    expect(markup).toContain("Loading the partner journey");
    expect(markup).not.toContain("Try again");
  });

  it("draws nothing once the journey is ready, so it never stands in for it", () => {
    expect(
      renderToStaticMarkup(
        createElement(PartnerProgressStatus, { state: "ready", retrying: false, onRetry }),
      ),
    ).toBe("");
  });
});
