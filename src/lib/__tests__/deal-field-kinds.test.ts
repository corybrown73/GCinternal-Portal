import { describe, expect, it } from "vitest";

import { EDITABLE_DEAL_FIELDS } from "../presale-fields";

/**
 * The allowlist is the authorization boundary for in-place deal edits, and it
 * is declared once and enforced twice (request boundary, then write). These
 * assert the shape both sides rely on.
 */
describe("EDITABLE_DEAL_FIELDS", () => {
  it("carries the SOW, which is where it is actually signed", () => {
    expect(EDITABLE_DEAL_FIELDS.sow_reference).toBe("text");
    expect(EDITABLE_DEAL_FIELDS.sow_signed_date).toBe("date");
    expect(EDITABLE_DEAL_FIELDS.sow_value).toBe("number");
    expect(EDITABLE_DEAL_FIELDS.sow_document_url).toBe("url");
  });

  it("still refuses the two fields that must move through their own path", () => {
    // stage moves through transitionStage, which writes the history everything
    // downstream reads. customer_id is set by the handoff.
    expect(EDITABLE_DEAL_FIELDS).not.toHaveProperty("stage");
    expect(EDITABLE_DEAL_FIELDS).not.toHaveProperty("customer_id");
  });

  it("does not expose the logo as a typed field: it is an upload, not text", () => {
    expect(EDITABLE_DEAL_FIELDS).not.toHaveProperty("logo_path");
  });

  it("uses only kinds the writer knows how to coerce", () => {
    const known = new Set(["text", "number", "uuid", "date", "url"]);
    for (const [field, kind] of Object.entries(EDITABLE_DEAL_FIELDS)) {
      expect(known.has(kind), `${field} has unknown kind ${kind}`).toBe(true);
    }
  });
});
