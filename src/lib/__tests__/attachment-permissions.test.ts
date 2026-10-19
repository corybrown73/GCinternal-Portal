import { describe, expect, it } from "vitest";

import {
  REMOVAL_MESSAGES,
  canRemoveAttachment,
  removalDenial,
  storagePathBelongsTo,
} from "../attachment-permissions";

/**
 * Issue #79. The policy: the uploader may remove their own attachment; an
 * administrator with the correct scope may (NOT ENABLED: the scope has no
 * definition for internal roles, so no administrator is granted removal of
 * someone else's file); everyone else may view but not remove.
 */

const IMPL = "33333333-3333-4333-8333-333333333333";
const OTHER_IMPL = "55555555-5555-4555-8555-555555555555";
const UPLOADER = "11111111-1111-4111-8111-111111111111";
const COLLEAGUE = "66666666-6666-4666-8666-666666666666";
const UUID = "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
const OWN_PATH = `accounts/${IMPL}/${UUID}-deck.pdf`;

const stored = (
  over: Partial<{
    implementation_id: string;
    added_by: string | null;
    storage_path: string | null;
  }> = {},
) => ({
  implementation_id: IMPL,
  added_by: UPLOADER,
  storage_path: OWN_PATH,
  ...over,
});

describe("storagePathBelongsTo: the file sits in its account's folder, under a name the upload wrote", () => {
  it("accepts a file the upload wrote for this account", () => {
    expect(storagePathBelongsTo(OWN_PATH, IMPL)).toBe(true);
  });

  it("refuses another account's folder", () => {
    expect(storagePathBelongsTo(`accounts/${OTHER_IMPL}/${UUID}-deck.pdf`, IMPL)).toBe(false);
  });

  it("refuses a path that climbs out of the folder", () => {
    expect(storagePathBelongsTo(`accounts/${IMPL}/../${OTHER_IMPL}/${UUID}-x.pdf`, IMPL)).toBe(
      false,
    );
  });

  it("refuses a file in a sub-folder", () => {
    expect(storagePathBelongsTo(`accounts/${IMPL}/sub/${UUID}-x.pdf`, IMPL)).toBe(false);
  });

  it("refuses a name the upload would not have written, with no unique prefix", () => {
    expect(storagePathBelongsTo(`accounts/${IMPL}/deck.pdf`, IMPL)).toBe(false);
  });

  it("refuses a path outside the bucket's account folders", () => {
    expect(storagePathBelongsTo(`sow/${UUID}-x.pdf`, IMPL)).toBe(false);
    expect(storagePathBelongsTo("", IMPL)).toBe(false);
  });
});

describe("removalDenial: the uploader may remove their own attachment", () => {
  it("allows the uploader to remove their own stored file", () => {
    expect(removalDenial({ id: UPLOADER, role: "am" }, stored(), IMPL)).toBeNull();
  });

  it("allows the uploader to remove their own link, which has no storage path", () => {
    expect(
      removalDenial({ id: UPLOADER, role: "se" }, stored({ storage_path: null }), IMPL),
    ).toBeNull();
  });

  it("allows the uploader in every internal role", () => {
    for (const role of [
      "admin",
      "manager",
      "sales",
      "implementation",
      "tam_se",
      "onboarding",
      "am",
      "se",
    ]) {
      expect(removalDenial({ id: UPLOADER, role }, stored(), IMPL)).toBeNull();
    }
  });
});

describe("removalDenial: everyone else may not remove the attachment", () => {
  it("refuses another internal user, even with edit rights on the deal", () => {
    expect(removalDenial({ id: COLLEAGUE, role: "am" }, stored(), IMPL)).toBe(
      REMOVAL_MESSAGES.notUploader,
    );
  });

  it.each(["admin", "super_admin", "manager"])(
    "refuses a %s on someone else's file, since the administrator tier is not enabled",
    (role) => {
      expect(removalDenial({ id: COLLEAGUE, role }, stored(), IMPL)).toBe(
        REMOVAL_MESSAGES.notUploader,
      );
    },
  );

  it("refuses a customer, even when the customer is the uploader", () => {
    expect(removalDenial({ id: UPLOADER, role: "customer" }, stored(), IMPL)).toBe(
      REMOVAL_MESSAGES.notPermitted,
    );
  });

  it("refuses an actor with no role", () => {
    expect(removalDenial({ id: UPLOADER, role: null }, stored(), IMPL)).toBe(
      REMOVAL_MESSAGES.notPermitted,
    );
    expect(removalDenial({ id: UPLOADER, role: undefined }, stored(), IMPL)).toBe(
      REMOVAL_MESSAGES.notPermitted,
    );
  });
});

describe("removalDenial: a missing uploader or identity is never granted", () => {
  it("refuses everyone when the file has no recorded uploader, administrators included", () => {
    for (const role of ["am", "admin", "manager"]) {
      expect(removalDenial({ id: COLLEAGUE, role }, stored({ added_by: null }), IMPL)).toBe(
        REMOVAL_MESSAGES.noUploader,
      );
    }
  });

  it("refuses a caller whose identity is missing", () => {
    expect(removalDenial({ id: "", role: "am" }, stored(), IMPL)).toBe(
      REMOVAL_MESSAGES.notIdentified,
    );
    expect(removalDenial(undefined, stored(), IMPL)).toBe(REMOVAL_MESSAGES.notIdentified);
    expect(removalDenial(null, stored(), IMPL)).toBe(REMOVAL_MESSAGES.notIdentified);
  });
});

describe("removalDenial: the file must belong to the account the request names", () => {
  it("refuses a file that belongs to a different implementation", () => {
    expect(
      removalDenial({ id: UPLOADER, role: "am" }, stored({ implementation_id: OTHER_IMPL }), IMPL),
    ).toBe(REMOVAL_MESSAGES.wrongAccount);
  });

  it("refuses a stored path that is not in the account's folder", () => {
    expect(
      removalDenial(
        { id: UPLOADER, role: "am" },
        stored({ storage_path: `accounts/${OTHER_IMPL}/${UUID}-deck.pdf` }),
        IMPL,
      ),
    ).toBe(REMOVAL_MESSAGES.badPath);
  });

  it("checks the account before the path, so a wrong account is named as such", () => {
    expect(
      removalDenial(
        { id: UPLOADER, role: "am" },
        stored({
          implementation_id: OTHER_IMPL,
          storage_path: `accounts/${OTHER_IMPL}/${UUID}-deck.pdf`,
        }),
        IMPL,
      ),
    ).toBe(REMOVAL_MESSAGES.wrongAccount);
  });
});

describe("canRemoveAttachment: the Resources card asks the same question", () => {
  it("shows Remove to the uploader only", () => {
    const file = { implementation_id: IMPL, added_by: UPLOADER, storage_path: OWN_PATH };
    expect(canRemoveAttachment({ id: UPLOADER, role: "am" }, file, IMPL)).toBe(true);
    expect(canRemoveAttachment({ id: COLLEAGUE, role: "admin" }, file, IMPL)).toBe(false);
    expect(canRemoveAttachment(null, file, IMPL)).toBe(false);
    expect(canRemoveAttachment(undefined, file, IMPL)).toBe(false);
  });
});
