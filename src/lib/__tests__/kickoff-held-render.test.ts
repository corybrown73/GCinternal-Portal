import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { KickoffHeldConfirm, KickoffHeldRecord } from "@/components/kickoff-held-confirm";
import { readIntake } from "../intake-answers";

/**
 * The confirmation as the TIS sees it: what it says, and that it is one
 * explicit control. The click path is covered by the save and stage tests.
 */
describe("KickoffHeldConfirm", () => {
  const prompt = {
    dealId: "00000000-0000-4000-8000-0000000000d1",
    intake: readIntake({ path: "new_logo" }),
  };

  function render() {
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(KickoffHeldConfirm, { prompt }),
      ),
    );
  }

  it("shows one checkbox labelled Kickoff held", () => {
    const markup = render();
    expect(markup).toContain("Kickoff held");
    expect(markup).toContain('type="checkbox"');
    expect(markup.match(/type="checkbox"/g)).toHaveLength(1);
  });

  it("says to confirm only after the call has actually happened, and what it does next", () => {
    const markup = render();
    expect(markup).toContain("after the kickoff call has actually happened");
    expect(markup).toContain("moves the implementation to Get It Working");
  });
});

describe("KickoffHeldRecord", () => {
  const date = "2026-09-25";
  function render(correction: Parameters<typeof KickoffHeldRecord>[0]["correction"]) {
    return renderToStaticMarkup(createElement(KickoffHeldRecord, { correction }));
  }

  it("shows Kickoff held as ticked, with what unticking does, and says correction is not yet available", () => {
    const markup = render({ kind: "auto", date });
    expect(markup).toContain("Kickoff held");
    expect(markup).toContain('checked=""');
    expect(markup).toContain("Unticking returns the deal to Kickoff");
    expect(markup).toContain("Correcting a mistake is not available yet.");
  });

  it("explains that later tasks are kept and asks first", () => {
    expect(render({ kind: "confirm_later_work", date, laterTasksDone: 2 })).toContain(
      "Later tasks are already done. Unticking keeps them",
    );
  });

  it("names the complete stage and asks for a stage-correction review when blocked", () => {
    const markup = render({ kind: "blocked", date, completedStage: "get_it_working" });
    expect(markup).toContain("Get it working is already complete");
    expect(markup).toContain("stage-correction review");
  });

  it("shows nothing when Kickoff is not held or does not apply", () => {
    expect(render({ kind: "not_held" })).toBe("");
    expect(render({ kind: "not_applicable" })).toBe("");
  });
});
