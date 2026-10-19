import { describe, expect, it } from "vitest";

import {
  EXTERNAL_SHARING_ROLES,
  SNAPSHOT_SHARING_ACTION,
  canManageExternalAccess,
  requireManage,
} from "../external-share-policy";

/**
 * Issue #83, Part 1. Snapshot generation, sharing and revocation use the same
 * role list as customer links. This is that list, pinned: a change to it is a
 * change to who may send a customer a link, and must show up here.
 */

describe("the external-sharing roles are the existing five", () => {
  it("lists exactly the roles that may issue customer links today", () => {
    expect([...EXTERNAL_SHARING_ROLES].sort()).toEqual(
      ["admin", "implementation", "manager", "onboarding", "super_admin"].sort(),
    );
  });

  it.each(["admin", "super_admin", "manager", "implementation", "onboarding"])(
    "allows the %s role",
    (role) => {
      expect(canManageExternalAccess(role)).toBe(true);
      expect(() => requireManage(role)).not.toThrow();
      expect(() => requireManage(role, SNAPSHOT_SHARING_ACTION)).not.toThrow();
    },
  );

  it.each([
    "am",
    "sales",
    "se",
    "tam_se",
    "customer",
    "auditor",
    "Admin",
    "ADMIN",
    " admin",
    "administrator",
    "",
  ])("refuses the %j role", (role) => {
    expect(canManageExternalAccess(role)).toBe(false);
    expect(() => requireManage(role)).toThrow(/cannot issue or revoke customer links/);
  });

  it.each([null, undefined])("refuses a missing role (%j)", (role) => {
    expect(canManageExternalAccess(role)).toBe(false);
    expect(() => requireManage(role)).toThrow(/Forbidden/);
  });

  it("does not resolve other object-prototype names to a role", () => {
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(canManageExternalAccess(name)).toBe(false);
    }
  });

  it("names the snapshot action in the refusal when asked to", () => {
    expect(() => requireManage("am", SNAPSHOT_SHARING_ACTION)).toThrow(
      "Forbidden: your role cannot generate, share or revoke plan snapshots",
    );
  });
});
