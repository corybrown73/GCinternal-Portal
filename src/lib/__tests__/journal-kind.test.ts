import { describe, expect, it } from "vitest";

import { createJournalEntryInput, JOURNAL_KIND_LABEL, JOURNAL_KINDS } from "../journal-input";

/** An implementation note is a plain note unless it is one of the three exception kinds. */
describe("journal kinds", () => {
  const base = {
    implementationId: "00000000-0000-4000-8000-000000000001",
    note: "Customer silent for five days",
    authorId: null,
    links: null,
    attachmentUrl: null,
    attachmentName: null,
  };

  it("defaults to a plain note", () => {
    expect(createJournalEntryInput.parse(base).kind).toBe("note");
  });

  it("accepts the model's three exceptions and nothing else", () => {
    for (const kind of JOURNAL_KINDS) {
      expect(createJournalEntryInput.parse({ ...base, kind }).kind).toBe(kind);
      expect(JOURNAL_KIND_LABEL[kind]).toBeTruthy();
    }
    expect(() => createJournalEntryInput.parse({ ...base, kind: "rant" })).toThrow();
  });
});
