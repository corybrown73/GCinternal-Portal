import { describe, expect, it } from "vitest";

import {
  createJournalEntryInput,
  customerMeetingInput,
  EXCEPTION_JOURNAL_KINDS,
  isExceptionKind,
  JOURNAL_KIND_LABEL,
  JOURNAL_KINDS,
  NOTE_FORM_KINDS,
} from "../journal-input";

const IMPL = "00000000-0000-4000-8000-000000000001";

/** A plain note is a note unless it is one of the explicitly listed exception kinds. */
describe("journal kinds", () => {
  const base = {
    implementationId: IMPL,
    note: "Customer silent for five days",
    authorId: null,
    links: null,
    attachmentUrl: null,
    attachmentName: null,
  };

  it("defaults to a plain note", () => {
    expect(createJournalEntryInput.parse(base).kind).toBe("note");
  });

  it("the Add-note form takes a note or one of the three exceptions, and nothing else", () => {
    for (const kind of NOTE_FORM_KINDS) {
      expect(createJournalEntryInput.parse({ ...base, kind }).kind).toBe(kind);
    }
    expect(NOTE_FORM_KINDS).toEqual(["note", "scope", "customer", "internal_delivery"]);
    expect(() => createJournalEntryInput.parse({ ...base, kind: "customer_meeting" })).toThrow();
    expect(() => createJournalEntryInput.parse({ ...base, kind: "rant" })).toThrow();
  });

  it("exceptions are exactly the three listed kinds; a customer meeting is not one", () => {
    expect([...EXCEPTION_JOURNAL_KINDS].sort()).toEqual(["customer", "internal_delivery", "scope"]);
    for (const kind of JOURNAL_KINDS) {
      expect(isExceptionKind(kind)).toBe(
        (EXCEPTION_JOURNAL_KINDS as readonly string[]).includes(kind),
      );
    }
    expect(isExceptionKind("customer_meeting")).toBe(false);
    expect(isExceptionKind("note")).toBe(false);
  });

  it("every kind has a label, and a customer meeting is labelled as one", () => {
    for (const kind of JOURNAL_KINDS) expect(JOURNAL_KIND_LABEL[kind]).toBeTruthy();
    expect(JOURNAL_KIND_LABEL.customer_meeting).toBe("Customer meeting");
  });
});

describe("customer meeting input", () => {
  const valid = {
    implementationId: IMPL,
    meetingDate: "2026-10-15",
    participants: "  Dana Sample, Riley Example  ",
    note: "  Approvals to route to the regional manager.  ",
  };

  it("takes a meeting date, optional participants and what was discussed", () => {
    const parsed = customerMeetingInput.parse(valid);
    expect(parsed.meetingDate).toBe("2026-10-15");
    expect(parsed.participants).toBe("Dana Sample, Riley Example");
    expect(parsed.note).toBe("Approvals to route to the regional manager.");
  });

  it("treats blank participants as none", () => {
    expect(customerMeetingInput.parse({ ...valid, participants: "   " }).participants).toBeNull();
  });

  it("needs a date that exists on the calendar", () => {
    for (const meetingDate of ["", "15/10/2026", "2026-02-30", "2026-13-01", "2026-10-1"]) {
      expect(() => customerMeetingInput.parse({ ...valid, meetingDate })).toThrow();
    }
  });

  it("needs what was discussed", () => {
    expect(() => customerMeetingInput.parse({ ...valid, note: "   " })).toThrow();
  });

  it("carries no field that could create anything other than the note itself", () => {
    expect(Object.keys(customerMeetingInput.parse(valid)).sort()).toEqual(
      ["implementationId", "meetingDate", "note", "participants"].sort(),
    );
  });
});
