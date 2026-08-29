import { describe, expect, it } from "vitest";
import { isSfId, sfId18 } from "../server/sf-id";
import { resolveSalesforceIdWrite } from "../server/sf-account-match";

/**
 * The vectors below are hand-derived from the algorithm and are the SAME
 * vectors the SQL twin `sf_id_18(text)` (migration 0023) must produce. Both
 * implementations exist because normalization has to happen in the app on every
 * write and in the database for the one-time data fix; if they ever disagree,
 * the key stops being a key and every idempotency guarantee in Phase 5 quietly
 * fails. These are the pin.
 *
 *   "0016g00000ABCDE" — chunk 1 "0016g" has no A-Z → 'A'
 *                       chunk 2 "00000" has no A-Z → 'A'
 *                       chunk 3 "ABCDE" is all A-Z → bits 11111 = 31 → '5'
 *   "0016G00000abcde" — chunk 1 "0016G" sets bit 4 → 16 → 'Q'
 */
describe("sfId18", () => {
  it("appends the case-pattern checksum for a 15-character id", () => {
    expect(sfId18("0016g00000ABCDE")).toBe("0016g00000ABCDEAA5");
    expect(sfId18("0016G00000abcde")).toBe("0016G00000abcdeQAA");
  });

  it("is idempotent: an 18-character id is returned unchanged", () => {
    const long = sfId18("0016g00000ABCDE")!;
    expect(sfId18(long)).toBe(long);
    expect(sfId18(sfId18(long))).toBe(long);
  });

  it("never invents an identity it cannot derive", () => {
    expect(sfId18(null)).toBeNull();
    expect(sfId18(undefined)).toBeNull();
    expect(sfId18("   ")).toBeNull();
    // Not 15 characters, or not alphanumeric: returned as-is, not mangled.
    expect(sfId18("acme-corp")).toBe("acme-corp");
    expect(sfId18("0016g00000ABC-E")).toBe("0016g00000ABC-E");
  });

  it("trims, because Zapier fields arrive with whitespace", () => {
    expect(sfId18("  0016g00000ABCDE  ")).toBe("0016g00000ABCDEAA5");
  });

  it("distinguishes ids that differ only by case, which is the whole point", () => {
    expect(sfId18("0016g00000ABCDE")).not.toBe(sfId18("0016g00000abcde"));
  });
});

describe("isSfId", () => {
  it("accepts both shapes and nothing else", () => {
    expect(isSfId("0016g00000ABCDE")).toBe(true);
    expect(isSfId("0016g00000ABCDEAA5")).toBe(true);
    expect(isSfId("0016g00000ABCD")).toBe(false);
    expect(isSfId("")).toBe(false);
    expect(isSfId(null)).toBe(false);
  });
});

/**
 * PLAN.md decision 4. The presale upsert keeps its name fallback, but a name
 * match must never repoint a Salesforce id that is already recorded.
 */
describe("resolveSalesforceIdWrite", () => {
  it("writes the normalized id when the row was matched BY that id", () => {
    expect(
      resolveSalesforceIdWrite({
        matchedBy: "salesforce_id",
        incoming: "0016g00000ABCDE",
        existing: "0016g00000ABCDEAA5",
      }),
    ).toEqual({ write: "0016g00000ABCDEAA5", conflict: null });
  });

  it("fills an id onto a name-matched row that has none — that adds evidence", () => {
    expect(
      resolveSalesforceIdWrite({ matchedBy: "name", incoming: "0016g00000ABCDE", existing: null }),
    ).toEqual({ write: "0016g00000ABCDEAA5", conflict: null });
  });

  it("REFUSES to overwrite a different id on a name-matched row, and says so", () => {
    const decision = resolveSalesforceIdWrite({
      matchedBy: "name",
      incoming: "0016g00000ABCDE",
      existing: "0019z99999ZZZZZAA5",
    });
    expect(decision.write).toBeNull();
    expect(decision.conflict).toEqual({
      kept: "0019z99999ZZZZZAA5",
      rejected: "0016g00000ABCDEAA5",
    });
  });

  it("treats a 15/18 pair as the same id, not a conflict", () => {
    expect(
      resolveSalesforceIdWrite({
        matchedBy: "name",
        incoming: "0016g00000ABCDE",
        existing: "0016g00000ABCDEAA5",
      }),
    ).toEqual({ write: "0016g00000ABCDEAA5", conflict: null });
  });

  it("leaves the column alone when no id was supplied", () => {
    expect(
      resolveSalesforceIdWrite({
        matchedBy: "name",
        incoming: null,
        existing: "0016g00000ABCDEAA5",
      }),
    ).toEqual({ write: null, conflict: null });
  });
});
