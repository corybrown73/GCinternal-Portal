import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Entering a deal by hand: the stage you pick is the stage you get (or the
 * gate says why not), the owners named at entry stick, an existing account
 * joins its customer at the close, and a typed industry is kept as typed.
 *
 * The real presale.server runs against the in-memory database. Only the
 * stage write itself (transitionStage, the RPC behind it) is stood in for,
 * with the same Closed Won rule the database applies.
 */

const h = vi.hoisted(() => ({
  fake: null as any,
  audits: [] as Array<Record<string, any>>,
  assigned: [] as Array<Record<string, any>>,
  moves: [] as Array<{ dealId: string; toStage: string; note?: string }>,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: new Proxy({}, { get: (_t, k) => h.fake.client[k as string] }),
}));
vi.mock("../server/audit", () => ({
  audit: async (entry: Record<string, any>) => {
    h.audits.push(entry);
  },
}));
vi.mock("../server/accounts", async () => {
  const { isPreClose } = await import("../presale-stages");
  const { missingForClosedWon, wonGateMessage } = await import("../won-gate");
  return {
    resolveAccountId: async (id: string) => id,
    upsertAccount: async (parsed: Record<string, any>) => {
      const row = {
        id: `00000000-0000-4000-8000-${String(h.fake.store.portal_accounts.length + 1).padStart(12, "0")}`,
        stage: "prospect",
        intake: {},
        am_owner_id: null,
        se_owner_id: null,
        customer_id: null,
        ...parsed,
      };
      h.fake.store.portal_accounts.push(row);
      return { account: { ...row }, created: true };
    },
    // The gate as the database applies it: a person's move out of a
    // pre-close stage needs a call note and the SOW.
    transitionStage: async (
      dealId: string,
      toStage: string,
      ctx: { source: string; force?: boolean },
      note?: string,
    ) => {
      const row = h.fake.store.portal_accounts.find((r: any) => r.id === dealId);
      if (ctx.source === "ui" && !isPreClose(toStage) && isPreClose(row.stage) && !ctx.force) {
        const missing = missingForClosedWon({
          reports: h.fake.store.portal_gong_reports.filter((r: any) => r.account_id === dealId)
            .length,
          sowPath: row.sow_document_path ?? null,
          sowReference: row.sow_reference ?? null,
        });
        if (missing.length) throw new Error(wonGateMessage(missing));
      }
      if (row.stage === toStage) return { changed: false };
      row.stage = toStage;
      h.moves.push({ dealId, toStage, ...(note ? { note } : {}) });
      return { changed: true };
    },
  };
});
vi.mock("../pipeline-stages.server", async () => {
  const { BUILTIN_PIPELINE_STAGES } = await import("../pipeline-stages");
  return { loadPipelineStages: async () => BUILTIN_PIPELINE_STAGES };
});
vi.mock("../app-config.server", () => ({ isFlagOn: async () => true }));
vi.mock("../assignment.server", () => ({
  assignDeal: async (args: Record<string, any>) => {
    h.assigned.push(args);
    if (args["teamMemberId"]) {
      (h.fake.store.portal_assignments ??= []).push({
        deal_id: args["dealId"],
        team_member_id: args["teamMemberId"],
        created_at: new Date().toISOString(),
      });
    }
    return { assigneeName: args["teamMemberId"] ? "Teya Rampaul" : "Next up" };
  },
  dealAssignment: async (dealId: string) => ({
    owner: h.assigned.some((a) => a["dealId"] === dealId) ? { name: "Teya Rampaul" } : null,
  }),
  // The active team: the TIS is on it; nobody else is.
  loadPool: async () => [
    {
      teamMemberId: "44444444-4444-4444-8444-444444444444",
      name: "Teya Rampaul",
      active: true,
      inPool: true,
    },
  ],
}));
vi.mock("../server/ai/jobs", () => ({ autoReadDeal: async () => null }));
vi.mock("../activity.server", () => ({ teamMemberIdForProfile: async () => null }));
vi.mock("../server/events", () => ({ recordImplementationCreated: async () => undefined }));
vi.mock("../server/plan-apply", () => ({
  applyPlanToNewImplementation: async () => ({ applied: false }),
}));
vi.mock("../journey-for-deal.server", () => ({ mirrorJourneyToDeal: async () => undefined }));

import { createFakeSupabase } from "./fake-supabase";
import {
  createDeal,
  enterDealAtStage,
  linkExistingCustomer,
  settleNewDeal,
  transitionDeal,
} from "../presale.server";
import {
  canAssignAtEntry,
  existingCustomerAtClose,
  gateParam,
  heldNote,
  isNewDealStage,
  liveWonGateMissing,
  NEW_DEAL_STAGES,
  parseGateParam,
} from "../deal-entry";
import { WON_GATE_LABEL } from "../won-gate";
import { canonicalIndustry, INDUSTRIES, isListedIndustry, readIntake } from "../intake-answers";
import { industryIcon } from "../industry-icons";

const ME = "11111111-1111-4111-8111-111111111111";
const AE = "22222222-2222-4222-8222-222222222222";
const TIS_PERSON = "33333333-3333-4333-8333-333333333333";
const TIS = "44444444-4444-4444-8444-444444444444";
const VARLEY = "55555555-5555-4555-8555-555555555555";

const deal = (id: string) => h.fake.store.portal_accounts.find((r: any) => r.id === id);
const empty = { domain: null, salesforce_id: null, arr: null, summary: null };

beforeEach(() => {
  h.audits = [];
  h.assigned = [];
  h.moves = [];
  h.fake = createFakeSupabase({
    portal_profiles: [
      { id: ME, email: "cory@example.com", full_name: "Cory", role: "admin" },
      { id: AE, email: "mike@example.com", full_name: "Mike Chen", role: "sales" },
      { id: TIS_PERSON, email: "teya@example.com", full_name: "Teya", role: "implementation" },
    ],
    portal_accounts: [],
    portal_gong_reports: [],
    customers: [{ id: VARLEY, name: "Varley Electric", industry: "Electrical" }],
    implementations: [],
  });
});

async function seedDeal(extra: Record<string, any> = {}) {
  const { account } = await createDeal(ME, { name: "Summit Plumbing", ...empty });
  Object.assign(deal(account.id), extra);
  return account.id;
}

describe("the stages New account offers", () => {
  it("offers Prospect, Negotiate & Finalize and Closed Won, nothing after the close", () => {
    expect(NEW_DEAL_STAGES).toEqual(["prospect", "negotiate", "closed_won"]);
    expect(isNewDealStage("onboarding_kickoff")).toBe(false);
    expect(isNewDealStage("onboarding_complete")).toBe(false);
    expect(canAssignAtEntry("prospect")).toBe(false);
    expect(canAssignAtEntry("negotiate")).toBe(true);
  });

  it("refuses a post-close stage on the server too", async () => {
    const id = await seedDeal();
    await expect(enterDealAtStage(ME, id, "make_it_run")).rejects.toThrow(/starts at Prospect/);
    expect(deal(id).stage).toBe("prospect");
  });
});

describe("a deal entered at Closed Won", () => {
  it("is Closed Won when the notes and the SOW are on it — through the same close", async () => {
    const id = await seedDeal({ sow_document_path: "sow/summit.pdf" });
    h.fake.store.portal_gong_reports.push({ id: "r1", account_id: id });
    const out = await settleNewDeal(ME, id, { stage: "closed_won", canAssign: true });
    expect(out).toMatchObject({ stage: "closed_won", refused: null });
    expect(deal(id).stage).toBe("closed_won");
    // The close's own work ran: the customer's page and the rotation.
    expect(h.fake.store.implementations).toHaveLength(1);
    expect(h.assigned).toEqual([expect.objectContaining({ dealId: id })]);
  });

  it("is held at Negotiate & Finalize when the gate refuses, and says why", async () => {
    const id = await seedDeal();
    h.fake.store.portal_gong_reports.push({ id: "r1", account_id: id });
    const out = await settleNewDeal(ME, id, { stage: "closed_won", canAssign: true });
    expect(out.stage).toBe("negotiate");
    expect(out.refused?.missing).toEqual(["sow"]);
    expect(out.refused?.message).toMatch(/Not ready for Closed Won/);
    expect(deal(id).stage).toBe("negotiate");
    // Stage history reads in words, without the gate's machine tag.
    expect(h.moves.at(-1)?.note).toBe(
      "Entered as Closed Won; held at Negotiate & Finalize — no signed SOW or contract yet",
    );
    // Nothing the close starts happened.
    expect(h.fake.store.implementations).toHaveLength(0);
  });

  it("honours Negotiate & Finalize with no gate", async () => {
    const id = await seedDeal();
    const out = await settleNewDeal(ME, id, { stage: "negotiate", canAssign: true });
    expect(out).toMatchObject({ stage: "negotiate", refused: null });
    expect(deal(id).stage).toBe("negotiate");
  });

  it("will not re-stage a deal that already has its stage", async () => {
    const id = await seedDeal({ stage: "negotiate" });
    await expect(settleNewDeal(ME, id, { stage: "closed_won", canAssign: true })).rejects.toThrow(
      /already has its stage/,
    );
  });
});

describe("owners named at entry", () => {
  it("sets the AE picked in the dialog", async () => {
    const { account } = await createDeal(ME, { name: "Summit Plumbing", ...empty, amOwnerId: AE });
    expect(deal(account.id).am_owner_id).toBe(AE);
    expect(deal(account.id).created_by).toBe(ME);
  });

  it("refuses an AE who does not sell or manage, before creating anything", async () => {
    await expect(
      createDeal(ME, { name: "Summit Plumbing", ...empty, amOwnerId: TIS_PERSON }),
    ).rejects.toThrow(/seller or a manager/);
    expect(h.fake.store.portal_accounts).toHaveLength(0);
  });

  it("assigns the TIS through assignDeal before the close, so the rotation is not run too", async () => {
    const id = await seedDeal({ sow_document_path: "sow/summit.pdf" });
    h.fake.store.portal_gong_reports.push({ id: "r1", account_id: id });
    const out = await settleNewDeal(ME, id, {
      stage: "closed_won",
      implementationOwnerId: TIS,
      canAssign: true,
    });
    expect(out.assignee).toBe("Teya Rampaul");
    expect(h.assigned).toEqual([
      expect.objectContaining({ dealId: id, teamMemberId: TIS, actorProfileId: ME }),
    ]);
    expect(deal(id).stage).toBe("closed_won");
  });

  it("keeps the TIS for a refused close: the deal waits at Negotiate & Finalize with its owner", async () => {
    const id = await seedDeal();
    const out = await settleNewDeal(ME, id, {
      stage: "closed_won",
      implementationOwnerId: TIS,
      canAssign: true,
    });
    expect(out.stage).toBe("negotiate");
    expect(h.assigned).toHaveLength(1);
  });

  it("refuses a TIS who has left the team, before anything is written", async () => {
    const id = await seedDeal({ sow_document_path: "sow/summit.pdf" });
    h.fake.store.portal_gong_reports.push({ id: "r1", account_id: id });
    await expect(
      settleNewDeal(ME, id, {
        stage: "closed_won",
        implementationOwnerId: "77777777-7777-4777-8777-777777777777",
        canAssign: true,
      }),
    ).rejects.toThrow(/no longer on the team/);
    expect(h.assigned).toHaveLength(0);
    expect(deal(id).stage).toBe("prospect");
  });

  it("does not assign the TIS twice when a retry follows a failure after the assignment", async () => {
    const id = await seedDeal();
    h.fake.store.portal_assignments = [
      { deal_id: id, team_member_id: TIS, created_at: new Date().toISOString() },
    ];
    const out = await settleNewDeal(ME, id, {
      stage: "negotiate",
      implementationOwnerId: TIS,
      canAssign: true,
    });
    expect(h.assigned).toHaveLength(0);
    expect(out).toMatchObject({ stage: "negotiate", assignee: "Teya Rampaul" });
  });

  it("does not assign at a bare Prospect, nor for someone who is not a manager", async () => {
    const id = await seedDeal();
    await expect(
      settleNewDeal(ME, id, { stage: "prospect", implementationOwnerId: TIS, canAssign: true }),
    ).rejects.toThrow(/from Negotiate & Finalize on/);
    await expect(
      settleNewDeal(ME, id, { stage: "negotiate", implementationOwnerId: TIS, canAssign: false }),
    ).rejects.toThrow(/Only a manager/);
    expect(h.assigned).toHaveLength(0);
  });
});

describe("an existing account picked on the deal page", () => {
  it("stores the customer on the intake, sets the type, and brings their industry", async () => {
    const id = await seedDeal();
    const out = await linkExistingCustomer(ME, id, VARLEY);
    expect(out).toEqual({ customerId: VARLEY, name: "Varley Electric" });
    const intake = readIntake(deal(id).intake);
    expect(intake.existing_customer_id).toBe(VARLEY);
    expect(intake.path).toBe("existing");
    expect(intake.industry).toBe("Electrical");
    // Not the deal's own link: a linked deal is shown as its customer's page.
    expect(deal(id).customer_id).toBeNull();
  });

  it("joins the implementation to that customer at the close — no second customer", async () => {
    const id = await seedDeal({ sow_document_path: "sow/x.pdf", name: "Varley Electric 2" });
    h.fake.store.portal_gong_reports.push({ id: "r1", account_id: id });
    await linkExistingCustomer(ME, id, VARLEY);
    await transitionDeal(ME, id, "closed_won");
    expect(h.fake.store.customers).toHaveLength(1);
    expect(h.fake.store.implementations).toEqual([
      expect.objectContaining({ customer_id: VARLEY, deal_id: id }),
    ]);
    expect(deal(id).customer_id).toBe(VARLEY);
  });

  it("refuses a customer that does not exist, and a deal already on its customer's page", async () => {
    const id = await seedDeal();
    await expect(
      linkExistingCustomer(ME, id, "66666666-6666-4666-8666-666666666666"),
    ).rejects.toThrow(/no longer exists/);
    deal(id).customer_id = VARLEY;
    await expect(linkExistingCustomer(ME, id, VARLEY)).rejects.toThrow(/already on its customer/);
  });

  it("refuses once the deal is past the close, where nothing would read the pick", async () => {
    const id = await seedDeal({ stage: "closed_won" });
    await expect(linkExistingCustomer(ME, id, VARLEY)).rejects.toThrow(/already closed/);
    expect(readIntake(deal(id).intake).existing_customer_id).toBeNull();
    deal(id).stage = "negotiate";
    await expect(linkExistingCustomer(ME, id, VARLEY)).resolves.toMatchObject({
      customerId: VARLEY,
    });
  });

  it("is only read for an existing account that is not linked yet", () => {
    expect(existingCustomerAtClose({ path: "existing", existing_customer_id: VARLEY }, null)).toBe(
      VARLEY,
    );
    expect(
      existingCustomerAtClose({ path: "new_logo", existing_customer_id: VARLEY }, null),
    ).toBeNull();
    expect(
      existingCustomerAtClose({ path: "existing", existing_customer_id: VARLEY }, "other"),
    ).toBeNull();
  });
});

describe("the Closed Won notice after an upload", () => {
  it("drops the SOW once it is on file, keeps what is still missing", () => {
    const facts = { reports: 0, sowPath: "sow/x.pdf", sowReference: null };
    expect(liveWonGateMissing(["notes", "sow"], facts)).toEqual(["notes"]);
    expect(liveWonGateMissing(["sow"], facts)).toEqual([]);
    expect(liveWonGateMissing(["sow"], { reports: 0, sowPath: null, sowReference: " " })).toEqual([
      "sow",
    ]);
    expect(liveWonGateMissing(["checklist"], facts)).toEqual(["checklist"]);
    expect(liveWonGateMissing(null, facts)).toEqual([]);
  });
});

describe("the refusal handed to the deal page", () => {
  it("round-trips through ?gate= and ignores anything else", () => {
    expect(parseGateParam(gateParam(["notes", "sow"]))).toEqual(["notes", "sow"]);
    expect(parseGateParam("sow")).toEqual(["sow"]);
    expect(parseGateParam("sow,sow, bogus")).toEqual(["sow"]);
    expect(parseGateParam("")).toBeNull();
    expect(parseGateParam(undefined)).toBeNull();
    expect(parseGateParam(42)).toBeNull();
  });

  it("writes the hold note in words", () => {
    expect(heldNote("Closed Won", "Negotiate & Finalize", ["notes", "sow"], WON_GATE_LABEL)).toBe(
      "Entered as Closed Won; held at Negotiate & Finalize — no Gong brief or call note and no signed SOW or contract yet",
    );
  });
});

describe("industries", () => {
  it("lists the four added verticals, with Other last", () => {
    for (const i of ["Electrical", "Pest Control", "Water/Wastewater", "Education/Government"]) {
      expect(INDUSTRIES as readonly string[]).toContain(i);
      expect(industryIcon(i)).not.toBe("ClipboardCheck");
    }
    expect(INDUSTRIES.at(-1)).toBe("Other");
  });

  it("snaps typed text to a listed industry in any case, and keeps the rest as typed", () => {
    expect(canonicalIndustry("electrical")).toBe("Electrical");
    expect(canonicalIndustry("  hvac ")).toBe("HVAC");
    expect(canonicalIndustry(" Landscaping ")).toBe("Landscaping");
    expect(canonicalIndustry("   ")).toBeNull();
  });

  it("keeps a typed industry as typed, and gives it the general icon", async () => {
    expect(isListedIndustry("Landscaping")).toBe(false);
    expect(industryIcon("Landscaping")).toBe("ClipboardCheck");
    const { account } = await createDeal(ME, {
      name: "Greenway Grounds",
      ...empty,
      industry: "Landscaping",
    });
    expect(readIntake(deal(account.id).intake).industry).toBe("Landscaping");
  });
});
