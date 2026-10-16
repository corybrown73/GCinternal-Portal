import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { KickoffHeldConfirm } from "@/components/kickoff-held-confirm";
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
