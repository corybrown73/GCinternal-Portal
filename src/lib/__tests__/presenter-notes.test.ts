import { describe, expect, it } from "vitest";

import { isSelectableForPresenter, PRESENTER_PRIVACY_NOTE } from "../presenter-notes";

describe("presenter selections", () => {
  it("can select a plain note and a customer meeting", () => {
    expect(isSelectableForPresenter("note")).toBe(true);
    expect(isSelectableForPresenter("customer_meeting")).toBe(true);
  });

  it("can never select an exception record", () => {
    expect(isSelectableForPresenter("scope")).toBe(false);
    expect(isSelectableForPresenter("customer")).toBe(false);
    expect(isSelectableForPresenter("internal_delivery")).toBe(false);
  });

  it("states the privacy boundary in the approved words", () => {
    expect(PRESENTER_PRIVACY_NOTE).toBe(
      "Private to your presenter view. These notes won't appear in the customer kickoff deck, dashboard or shared links. Other authorised internal users may still access the original implementation notes.",
    );
  });
});
