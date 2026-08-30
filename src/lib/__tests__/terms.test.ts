import { describe, expect, it } from "vitest";

import { termLabel } from "@/lib/terms";
import { humanize } from "@/lib/hub-format";
import { ROLE_LABELS } from "@/lib/auth";

describe("humanize", () => {
  // The reported symptoms, verbatim.
  it("spells the acronyms the way the business does", () => {
    expect(humanize("tam_se")).toBe("TAM / SE");
    expect(humanize("tam_se")).not.toBe("Tam se");
    expect(humanize("am")).toBe("AM");
    expect(humanize("admin")).toBe("Super admin");
  });

  it("uppercases a known acronym inside a compound it has never seen", () => {
    expect(humanize("sla_breach")).toBe("SLA breach");
    expect(humanize("sow_uploaded")).toBe("SOW uploaded");
  });

  it("still reads plainly for an enum value nothing knows about", () => {
    expect(humanize("in_progress")).toBe("In progress");
    expect(humanize("nice_to_have")).toBe("Nice to have");
  });

  it("renders a missing value as a dash", () => {
    expect(humanize(null)).toBe("—");
    expect(humanize("")).toBe("—");
  });
});

describe("termLabel", () => {
  it("returns null when it has no opinion, so callers can tell a hit from a guess", () => {
    expect(termLabel("in_progress")).toBeNull();
    expect(termLabel("")).toBeNull();
  });

  it("treats spaces and hyphens as the same separator as underscores", () => {
    expect(termLabel("tam-se")).toBe("TAM / SE");
    expect(termLabel("TAM SE")).toBe("TAM / SE");
  });
});

describe("ROLE_LABELS", () => {
  // /admin/users read "TAM / SE" from this table while the ticket-routing
  // picker printed "Tam se" from humanize, for the same stored value.
  it("agrees with humanize on the roles that mean the same thing", () => {
    for (const role of ["manager", "sales", "implementation", "tam_se", "customer"] as const) {
      expect(ROLE_LABELS[role]).toBe(humanize(role));
    }
  });

  // These two are the deliberate exceptions: as PORTAL roles they name a
  // permission, not the job title the same string means in the directory.
  it("keeps the portal meaning for am and se", () => {
    expect(ROLE_LABELS.am).toBe("Sales");
    expect(ROLE_LABELS.se).toBe("TAM / SE");
  });
});
