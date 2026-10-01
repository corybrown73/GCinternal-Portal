import { describe, expect, it } from "vitest";

import { nextForSeller, salesHomeFor } from "../home-sales";
import { NAV_CATALOGUE, visibleNav } from "../nav-visibility";
import { isOwnedBy } from "../ownership";
import { homeVariantFor, isManagerRole, MANAGE_ROLES } from "../roles";

/**
 * Views by role: a seller lands on their deals, an implementer on Today, a
 * manager on everything; the sidebar leads with what each of them opens.
 */
describe("roles", () => {
  it("has one list of who manages", () => {
    expect([...MANAGE_ROLES].sort()).toEqual(["admin", "manager", "super_admin"]);
    expect(isManagerRole("manager")).toBe(true);
    expect(isManagerRole("sales")).toBe(false);
    expect(isManagerRole(null)).toBe(false);
  });

  it("picks the Home for a login", () => {
    expect(homeVariantFor("sales")).toBe("sales");
    expect(homeVariantFor("am")).toBe("sales");
    expect(homeVariantFor("implementation")).toBe("tis");
    expect(homeVariantFor("onboarding")).toBe("tis");
    expect(homeVariantFor("tam_se")).toBe("tis");
    expect(homeVariantFor("manager")).toBe("manager");
    expect(homeVariantFor("super_admin")).toBe("manager");
    expect(homeVariantFor(undefined)).toBe("tis");
  });
});

describe("the sidebar leads with what the role opens", () => {
  const everyone = { canManage: false, isSuperAdmin: false };
  const primary = (variant: "sales" | "tis" | "manager") =>
    visibleNav({ hidden: [] }, everyone, variant)
      .filter((e) => e.primary)
      .map((e) => e.to);
  it("seller: Home, Customers, Pipeline; implementer adds the Calendar; manager adds Reports", () => {
    expect(primary("sales")).toEqual(["/", "/customers", "/pipeline"]);
    expect(primary("tis")).toEqual(["/", "/customers", "/pipeline", "/calendar"]);
    expect(primary("manager")).toEqual(["/", "/customers", "/pipeline", "/calendar", "/reports"]);
  });
  it("without a variant, the catalogue's own marks stand", () => {
    expect(
      visibleNav({ hidden: [] }, everyone)
        .filter((e) => e.primary)
        .map((e) => e.to),
    ).toEqual(NAV_CATALOGUE.filter((e) => e.primary).map((e) => e.to));
  });
});

describe("the seller's Home", () => {
  const labels = new Map([
    ["prospect", "Prospect"],
    ["negotiate", "Negotiate & Finalize"],
    ["closed_won", "Closed Won"],
    ["onboarding_kickoff", "Pre-kickoff"],
    ["in_onboarding", "Onboarding"],
    ["onboarding_complete", "Complete"],
  ]);
  const order = new Map([...labels.keys()].map((k, i) => [k, i + 1]));
  const opts = { labels, order, terminalKey: "onboarding_complete" };

  it("says the one thing on the seller next, by where the deal is", () => {
    const f = {
      handoff: "outstanding" as const,
      tis: null,
      firstMeeting: null,
      terminal: false,
      ff: false,
    };
    expect(nextForSeller("negotiate", f)).toMatchObject({ tone: "critical" });
    expect(nextForSeller("negotiate", { ...f, tis: "Dana" }).text).toBe(
      "Fill in the handoff for the TIS",
    );
    expect(nextForSeller("negotiate", { ...f, tis: "Dana", handoff: "complete" }).text).toBe(
      "Book the first meeting for Dana",
    );
    expect(
      nextForSeller("negotiate", {
        ...f,
        tis: "Dana",
        handoff: "sent",
        firstMeeting: "2026-10-06",
      }),
    ).toMatchObject({ tone: "info" });
    expect(
      nextForSeller("negotiate", {
        ...f,
        tis: "Dana",
        handoff: "complete",
        firstMeeting: "2026-10-06",
      }),
    ).toMatchObject({ tone: "good" });
    expect(nextForSeller("onboarding_kickoff", { ...f, tis: "Dana" }).text).toBe(
      "Finish the handoff for the TIS",
    );
    expect(nextForSeller("in_onboarding", { ...f, tis: "Dana", handoff: "complete" }).text).toBe(
      "In onboarding with Dana",
    );
    expect(nextForSeller("onboarding_complete", { ...f, terminal: true }).tone).toBe("muted");
    expect(nextForSeller("negotiate", { ...f, ff: true }).tone).toBe("info");
  });

  it("ranks the urgent rows first and counts the tiles", () => {
    const home = salesHomeFor(
      [
        {
          id: "a",
          name: "Acme",
          stage: "negotiate",
          owner_name: null,
          handoff_status: "outstanding",
        },
        {
          id: "b",
          name: "Bolt",
          stage: "negotiate",
          owner_name: "Dana",
          handoff_status: "complete",
          first_meeting: "2026-10-06",
        },
        {
          id: "c",
          name: "Crest",
          stage: "closed_won",
          customer_id: "cust-c",
          implementation_id: "impl-c",
          owner_name: "Dana",
          handoff_status: "outstanding",
        },
        {
          id: "d",
          name: "Dune",
          stage: "onboarding_complete",
          customer_id: "cust-d",
          handoff_status: "complete",
        },
        {
          id: "e",
          name: "Echo FF",
          stage: "closed_won",
          path: "field_fusion",
          customer_id: "cust-e",
        },
      ],
      opts,
    );
    // Critical, then warning, then the two "good" rows in stage order, then complete.
    expect(home.rows.map((r) => r.id)).toEqual(["a", "c", "b", "e", "d"]);
    expect(home.rows[0]!.href).toEqual({ kind: "deal", dealId: "a" });
    expect(home.rows[1]!.href).toEqual({
      kind: "customer",
      customerId: "cust-c",
      implId: "impl-c",
    });
    expect(home.rows.find((r) => r.id === "e")!.handoff).toBeNull();
    expect(home.tiles).toEqual({
      needsTis: 1,
      handoffOpen: 2,
      noFirstMeeting: 2,
      closedNotKickedOff: 2,
    });
  });
});

describe("the account manager's book", () => {
  it("counts a customer whose account manager is the viewer", () => {
    const viewer = { profileId: "p1", teamMemberId: "tm1", name: "Ana" };
    const facts = {
      implementationOwnerId: "tm9",
      csmOwnerId: null,
      amOwnerProfileId: null,
      seOwnerProfileId: null,
      accountManagerId: "tm1",
    };
    expect(isOwnedBy(facts, viewer)).toBe(true);
    expect(isOwnedBy({ ...facts, accountManagerId: "tm2" }, viewer)).toBe(false);
  });
});
