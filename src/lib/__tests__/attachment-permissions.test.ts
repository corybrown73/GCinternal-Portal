import { describe, expect, it } from "vitest";

import {
  REMOVAL_MESSAGES,
  canRemoveAttachment,
  deletionTier,
  removalDenial,
  storagePathBelongsTo,
} from "../attachment-permissions";

/**
 * Issue #79, approved policy. The uploader may delete what they uploaded. The
 * exact `admin` role may delete across all implementations, including files with
 * no recorded uploader. Other internal users may delete only their own uploads.
 * Implementation ownership grants nothing. Customers and unknown roles grant nothing.
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

const INTERNAL_ROLES = [
  "super_admin",
  "manager",
  "sales",
  "implementation",
  "tam_se",
  "onboarding",
  "am",
  "se",
];

describe("deletionTier: only the exact admin role is an administrator", () => {
  it("resolves admin to the admin tier", () => {
    expect(deletionTier("admin")).toBe("admin");
  });

  it.each(INTERNAL_ROLES)("keeps %s as an internal role, uploader-only", (role) => {
    expect(deletionTier(role)).toBe("internal");
  });

  it("gives customers no tier", () => {
    expect(deletionTier("customer")).toBe("none");
  });

  it.each(["Admin", "ADMIN", " admin", "admin ", "administrator", "auditor", "", "owner"])(
    "treats %j as unknown, which grants nothing",
    (role) => {
      expect(deletionTier(role)).toBe("none");
    },
  );

  it.each([null, undefined, 0, false, {}, ["admin"]])(
    "treats a non-string role (%j) as unknown",
    (role) => {
      expect(deletionTier(role)).toBe("none");
    },
  );

  it("does not resolve other prototype names to a tier", () => {
    expect(deletionTier("constructor")).toBe("none");
    expect(deletionTier("__proto__")).toBe("none");
    expect(deletionTier("toString")).toBe("none");
  });
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

describe("removalDenial: the uploader may delete their own attachment", () => {
  it("allows the uploader to delete their own stored file", () => {
    expect(removalDenial({ id: UPLOADER, role: "am" }, stored(), IMPL)).toBeNull();
  });

  it("allows the uploader to delete their own link, which has no storage path", () => {
    expect(
      removalDenial({ id: UPLOADER, role: "se" }, stored({ storage_path: null }), IMPL),
    ).toBeNull();
  });

  it.each(["admin", ...INTERNAL_ROLES])("allows an uploader in the %s role", (role) => {
    expect(removalDenial({ id: UPLOADER, role }, stored(), IMPL)).toBeNull();
  });
});

describe("removalDenial: the exact admin role may delete across implementations", () => {
  it("allows an admin to delete another person's attachment", () => {
    expect(removalDenial({ id: COLLEAGUE, role: "admin" }, stored(), IMPL)).toBeNull();
  });

  it("allows an admin to delete an attachment with no recorded uploader", () => {
    expect(
      removalDenial({ id: COLLEAGUE, role: "admin" }, stored({ added_by: null }), IMPL),
    ).toBeNull();
  });

  it("allows an admin to delete a link, which has no storage path", () => {
    expect(
      removalDenial({ id: COLLEAGUE, role: "admin" }, stored({ storage_path: null }), IMPL),
    ).toBeNull();
  });

  it("still refuses an admin on a file in another implementation, because the request names this one", () => {
    expect(
      removalDenial(
        { id: COLLEAGUE, role: "admin" },
        stored({ implementation_id: OTHER_IMPL }),
        IMPL,
      ),
    ).toBe(REMOVAL_MESSAGES.wrongAccount);
  });

  it("still refuses an admin on a stored path outside the account's folder", () => {
    expect(
      removalDenial(
        { id: COLLEAGUE, role: "admin" },
        stored({ storage_path: `accounts/${OTHER_IMPL}/${UUID}-deck.pdf` }),
        IMPL,
      ),
    ).toBe(REMOVAL_MESSAGES.badPath);
  });
});

describe("removalDenial: everyone else may delete only what they uploaded", () => {
  it.each(["am", "se", "sales", "implementation", "tam_se", "onboarding"])(
    "refuses a %s on someone else's file",
    (role) => {
      expect(removalDenial({ id: COLLEAGUE, role }, stored(), IMPL)).toBe(
        REMOVAL_MESSAGES.notUploader,
      );
    },
  );

  it.each(["super_admin", "manager"])(
    "refuses a %s on someone else's file: only the exact admin role is an administrator",
    (role) => {
      expect(removalDenial({ id: COLLEAGUE, role }, stored(), IMPL)).toBe(
        REMOVAL_MESSAGES.notUploader,
      );
    },
  );

  it.each(["super_admin", "manager", "am"])(
    "refuses a %s on a file with no recorded uploader",
    (role) => {
      expect(removalDenial({ id: COLLEAGUE, role }, stored({ added_by: null }), IMPL)).toBe(
        REMOVAL_MESSAGES.noUploader,
      );
    },
  );

  it("refuses a customer, even when the customer is the uploader", () => {
    expect(removalDenial({ id: UPLOADER, role: "customer" }, stored(), IMPL)).toBe(
      REMOVAL_MESSAGES.notPermitted,
    );
  });

  it("refuses a customer on a file with no recorded uploader", () => {
    expect(
      removalDenial({ id: COLLEAGUE, role: "customer" }, stored({ added_by: null }), IMPL),
    ).toBe(REMOVAL_MESSAGES.notPermitted);
  });

  it.each([null, undefined, "", "auditor", "Admin", "ADMIN", "administrator"])(
    "refuses an unknown or missing role (%j), even on its own upload",
    (role) => {
      expect(removalDenial({ id: UPLOADER, role }, stored(), IMPL)).toBe(
        REMOVAL_MESSAGES.notPermitted,
      );
      expect(removalDenial({ id: COLLEAGUE, role }, stored({ added_by: null }), IMPL)).toBe(
        REMOVAL_MESSAGES.notPermitted,
      );
    },
  );
});

describe("removalDenial: a missing uploader or identity is never granted", () => {
  it("refuses an uploader-less file to a non-admin, whatever their role", () => {
    for (const role of ["am", "manager", "se", "sales"]) {
      expect(removalDenial({ id: COLLEAGUE, role }, stored({ added_by: null }), IMPL)).toBe(
        REMOVAL_MESSAGES.noUploader,
      );
    }
  });

  it("refuses a caller whose identity is missing", () => {
    expect(removalDenial({ id: "", role: "admin" }, stored(), IMPL)).toBe(
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

describe("removalDenial: implementation ownership grants nothing", () => {
  it("takes no ownership input, so an account owner who did not upload is refused", () => {
    // The rule reads the actor, the file, and the requested account. The deal's
    // account manager is not an input, so owning the deal cannot change the answer.
    expect(removalDenial({ id: COLLEAGUE, role: "am" }, stored(), IMPL)).toBe(
      REMOVAL_MESSAGES.notUploader,
    );
  });
});

describe("canRemoveAttachment: the Resources card asks the same question", () => {
  const file = { implementation_id: IMPL, added_by: UPLOADER, storage_path: OWN_PATH };

  it("shows Remove to the uploader", () => {
    expect(canRemoveAttachment({ id: UPLOADER, role: "am" }, file, IMPL)).toBe(true);
  });

  it("shows Remove to the exact admin on someone else's file", () => {
    expect(canRemoveAttachment({ id: COLLEAGUE, role: "admin" }, file, IMPL)).toBe(true);
  });

  it("shows Remove to the exact admin on a file with no recorded uploader", () => {
    expect(
      canRemoveAttachment({ id: COLLEAGUE, role: "admin" }, { ...file, added_by: null }, IMPL),
    ).toBe(true);
  });

  it("hides Remove from a non-admin on someone else's file, and from a manager", () => {
    expect(canRemoveAttachment({ id: COLLEAGUE, role: "am" }, file, IMPL)).toBe(false);
    expect(canRemoveAttachment({ id: COLLEAGUE, role: "manager" }, file, IMPL)).toBe(false);
    expect(canRemoveAttachment({ id: COLLEAGUE, role: "super_admin" }, file, IMPL)).toBe(false);
  });

  it("hides Remove when there is no signed-in profile yet", () => {
    expect(canRemoveAttachment(null, file, IMPL)).toBe(false);
    expect(canRemoveAttachment(undefined, file, IMPL)).toBe(false);
  });
});
