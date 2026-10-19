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
  const intake = {
    path: "new_logo",
    timeline: { completed: { kickoff: date, intake_done: "2026-09-20" } },
  };
  function render(
    correction: Parameters<typeof KickoffHeldRecord>[0]["correction"],
    editable = true,
  ) {
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(KickoffHeldRecord, {
          dealId: "00000000-0000-4000-8000-0000000000d1",
          stage: "get_it_working",
          intake,
          correction,
          editable,
        }),
      ),
    );
  }
  /** The checkbox's own tag, so the disabled state is read from the control itself. */
  const checkbox = (markup: string) => markup.match(/<input[^>]*type="checkbox"[^>]*>/)![0];

  it("shows Kickoff held as ticked, with what unticking does, and an enabled control", () => {
    const markup = render({ kind: "auto", date });
    expect(markup).toContain("Kickoff held");
    expect(checkbox(markup)).toContain('checked=""');
    expect(checkbox(markup)).not.toContain("disabled");
    expect(markup).toContain("Unticking returns the deal to Kickoff");
    expect(markup).not.toContain("not available yet");
  });

  it("keeps the control disabled for a viewer who cannot edit the deal, and says why", () => {
    const markup = render({ kind: "auto", date }, false);
    expect(checkbox(markup)).toContain("disabled");
    expect(markup).toContain("Only a deal editor can change this.");
  });

  it("explains that later tasks are kept and asks first", () => {
    const markup = render({ kind: "confirm_later_work", date, laterTasksDone: 2 });
    expect(markup).toContain("Later tasks are already done. Unticking keeps them");
    expect(checkbox(markup)).not.toContain("disabled");
  });

  it("names the complete stage, asks for a stage-correction review, and cannot be unticked when blocked", () => {
    const markup = render({ kind: "blocked", date, completedStage: "get_it_working" });
    expect(markup).toContain("Get it working is already complete");
    expect(markup).toContain("stage-correction review");
    expect(checkbox(markup)).toContain("disabled");
  });

  it("shows nothing when Kickoff is not held or does not apply", () => {
    expect(render({ kind: "not_held" })).toBe("");
    expect(render({ kind: "not_applicable" })).toBe("");
  });
});
