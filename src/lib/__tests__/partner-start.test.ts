import { describe, expect, it, vi } from "vitest";

import { intakeAnswersSchema, readIntake } from "../intake-answers";
import { explicitPartnerKeyFor, templateKeyFor } from "../partner-implementation";
import {
  partnerStartArgs,
  startPartnerImplementation,
  type PartnerStartClient,
  type PartnerStartInput,
} from "../partner-start.server";

/**
 * The TypeScript partner creation path. The client has ONE method, rpc: any
 * other database write in the path would throw, so these tests also prove that
 * a partner start makes exactly one call and nothing else.
 */

const SOW = {
  sow_reference: "SOW-1",
  sow_signed_date: "2026-09-30",
  sow_value: 12500,
  sow_document_url: null,
  sow_document_name: null,
  sow_document_path: null,
};

const base: PartnerStartInput = {
  dealId: "00000000-0000-4000-8000-0000000000d1",
  implementationName: "Acme partner implementation",
  partnerKey: "field_fusion_iq",
  sow: SOW,
  customerId: null,
  newCustomer: { name: "Acme Pools", arr: 1500, industry: "Pools", salesforce_account_id: null },
  enteredBy: "00000000-0000-4000-8000-0000000000e1",
  actorProfile: "00000000-0000-4000-8000-0000000000f1",
  at: "2026-10-13T10:00:00.000Z",
};

function clientReturning(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<typeof result>>(
    async () => result,
  );
  const client: PartnerStartClient = { rpc };
  return { client, rpc };
}

describe("startPartnerImplementation: successful creation", () => {
  it("makes one RPC call, creating the customer and the implementation together", async () => {
    const { client, rpc } = clientReturning({
      data: {
        implementation_id: "11111111-1111-4111-8111-111111111111",
        customer_id: "22222222-2222-4222-8222-222222222222",
        customer_created: true,
      },
      error: null,
    });
    const started = await startPartnerImplementation(client, base);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("create_partner_implementation", {
      p_customer_id: null,
      p_new_customer: {
        name: "Acme Pools",
        arr: 1500,
        industry: "Pools",
        salesforce_account_id: null,
      },
      p_deal_id: base.dealId,
      p_name: "Acme partner implementation",
      p_partner_key: "field_fusion_iq",
      p_sow: SOW,
      p_entered_by: base.enteredBy,
      p_actor_profile: base.actorProfile,
      p_at: base.at,
    });
    expect(started).toEqual({
      implementationId: "11111111-1111-4111-8111-111111111111",
      customerId: "22222222-2222-4222-8222-222222222222",
      customerCreated: true,
    });
  });

  it("an existing customer is passed by id, with no new customer fields, and is not reported as created", async () => {
    const { client, rpc } = clientReturning({
      data: {
        implementation_id: "11111111-1111-4111-8111-111111111111",
        customer_id: "33333333-3333-4333-8333-333333333333",
        customer_created: false,
      },
      error: null,
    });
    const started = await startPartnerImplementation(client, {
      ...base,
      customerId: "33333333-3333-4333-8333-333333333333",
      newCustomer: null,
    });
    const args = rpc.mock.calls[0]![1];
    expect(args["p_customer_id"]).toBe("33333333-3333-4333-8333-333333333333");
    expect(args["p_new_customer"]).toBeNull();
    expect(started.customerCreated).toBe(false);
  });
});

describe("startPartnerImplementation: a failed RPC", () => {
  it("throws with a clear statement that nothing was written, and makes no second call", async () => {
    const { client, rpc } = clientReturning({
      data: null,
      error: {
        message: "The partner implementation journey is not published, so nothing was started.",
      },
    });
    await expect(startPartnerImplementation(client, base)).rejects.toThrow(
      /was not started, so nothing was written.*not published/,
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("treats a call that returns no implementation as a failure, never as a started partner", async () => {
    const { client } = clientReturning({ data: null, error: null });
    await expect(startPartnerImplementation(client, base)).rejects.toThrow(
      /No implementation was returned/,
    );
  });

  it("treats a malformed result as a failure", async () => {
    const { client } = clientReturning({ data: { customer_id: "x" }, error: null });
    await expect(startPartnerImplementation(client, base)).rejects.toThrow(/nothing was written/);
  });

  it("refuses to build the call when there is neither a customer nor the fields for one", async () => {
    const { client, rpc } = clientReturning({ data: null, error: null });
    await expect(
      startPartnerImplementation(client, { ...base, customerId: null, newCustomer: null }),
    ).rejects.toThrow(/needs a customer/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("the partner path is entered only by an explicitly partnered account", () => {
  const intake = (over: Record<string, unknown>) => readIntake(intakeAnswersSchema.parse(over));

  it("a standard account has no partner, so it never reaches the partner call", () => {
    const standard = intake({ path: "new_logo" });
    expect(explicitPartnerKeyFor(standard)).toBeNull();
    expect(templateKeyFor(standard)).toBeNull();
  });

  it("a legacy Field Fusion account keeps its own template and never reaches the partner call", () => {
    const legacy = intake({ path: "field_fusion", field_fusion: { handed_off_at: null } });
    expect(explicitPartnerKeyFor(legacy)).toBeNull();
    expect(templateKeyFor(legacy)).toBe("field-fusion");
  });

  it("an explicitly partnered account carries its partner into the call", () => {
    const partnered = intake({
      path: "new_logo",
      partner_implementation: { partner_key: "field_fusion_iq" },
    });
    expect(explicitPartnerKeyFor(partnered)).toBe("field_fusion_iq");
    expect(partnerStartArgs({ ...base, partnerKey: "field_fusion_iq" }).p_partner_key).toBe(
      "field_fusion_iq",
    );
  });
});
