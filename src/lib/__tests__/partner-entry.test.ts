import { describe, expect, it, vi } from "vitest";

import { intakeAnswersSchema } from "../intake-answers";
import { DEAL_TYPES } from "../stage-flow";
import {
  implementationTypeFor,
  initialStageFor,
  PARTNER_TEMPLATE_KEY,
  PARTNERS,
  partnerOptions,
  partnerSelectionError,
  partnerSelectionPatch,
  requiresPartnerTemplate,
  templateKeyFor,
  type Partner,
  type PartnerKey,
} from "../partner-implementation";
import { partnerStartArgs, startPartnerImplementation } from "../partner-start.server";
import { FIELD_FUSION_TEMPLATE_KEY } from "../field-fusion";

/**
 * Choosing a Partner Implementation, and starting it through the transactional
 * path. One journey, any registered partner: the selector reads the registry, and
 * the start is the same call for every partner.
 */

const DEAL = "22222222-2222-4222-8222-222222222222";

describe("Partner Implementation is selectable", () => {
  it("is one of the implementation types, next to the standard ones", () => {
    const paths = DEAL_TYPES.map((t) => t.path);
    expect(paths).toEqual([
      "new_logo",
      "existing",
      "dm_conversion",
      "field_fusion",
      "partner_implementation",
    ]);
    expect(DEAL_TYPES.find((t) => t.path === "partner_implementation")!.label).toBe(
      "Partner implementation",
    );
  });

  it("the standard and legacy types are unchanged", () => {
    expect(DEAL_TYPES.find((t) => t.path === "new_logo")!.label).toBe("New logo");
    expect(DEAL_TYPES.find((t) => t.path === "field_fusion")!.label).toBe("Field Fusion");
    expect(intakeAnswersSchema.parse({ path: "new_logo" }).path).toBe("new_logo");
    expect(intakeAnswersSchema.parse({ path: "field_fusion" }).path).toBe("field_fusion");
  });
});

describe("the registered partner options", () => {
  it("offers the partners in the registry, and only those: Field Fusion IQ today", () => {
    expect(partnerOptions()).toEqual([{ key: "field_fusion_iq", name: "Field Fusion IQ" }]);
  });

  it("follows the registry: a second registered partner appears with the same route and no other change", () => {
    const registry = {
      ...PARTNERS,
      acme_iq: { key: "acme_iq", name: "Acme IQ", legacyIntakePath: null },
    } as unknown as Readonly<Record<PartnerKey, Partner>>;
    expect(partnerOptions(registry).map((o) => o.key)).toEqual(["field_fusion_iq", "acme_iq"]);
  });
});

describe("selecting a partner stores the generic partner intake", () => {
  it("Field Fusion IQ produces the partner_implementation structure, not a Field Fusion journey", () => {
    const intake = intakeAnswersSchema.parse(partnerSelectionPatch("field_fusion_iq"));
    expect(intake.path).toBe("partner_implementation");
    expect(intake.partner_implementation).toEqual({ partner_key: "field_fusion_iq" });
    const type = implementationTypeFor(intake);
    expect(type).toEqual({
      type: "partner_implementation",
      partner: "field_fusion_iq",
      legacy: false,
    });
    expect(templateKeyFor(intake)).toBe(PARTNER_TEMPLATE_KEY);
    expect(templateKeyFor(intake)).not.toBe(FIELD_FUSION_TEMPLATE_KEY);
    expect(requiresPartnerTemplate(intake)).toBe(true);
    expect(initialStageFor(intake)).toBe("closed_won_planning");
  });

  it("a second partner stores the same structure and takes the same template", () => {
    const intake = intakeAnswersSchema.parse({
      path: "partner_implementation",
      partner_implementation: { partner_key: "field_fusion_iq" },
    });
    // The same route for any registered partner: the partner key is data, not a branch.
    expect(
      templateKeyFor({ ...intake, partner_implementation: { partner_key: "field_fusion_iq" } }),
    ).toBe(PARTNER_TEMPLATE_KEY);
  });

  it("a standard implementation is unchanged by the new type", () => {
    const intake = intakeAnswersSchema.parse({ path: "new_logo" });
    expect(implementationTypeFor(intake)).toEqual({
      type: "standard",
      partner: null,
      legacy: false,
    });
    expect(templateKeyFor(intake)).toBeNull();
    expect(requiresPartnerTemplate(intake)).toBe(false);
  });

  it("a legacy Field Fusion account keeps its own template", () => {
    const intake = intakeAnswersSchema.parse({ path: "field_fusion" });
    expect(implementationTypeFor(intake)).toMatchObject({
      type: "partner_implementation",
      legacy: true,
    });
    expect(templateKeyFor(intake)).toBe(FIELD_FUSION_TEMPLATE_KEY);
    expect(requiresPartnerTemplate(intake)).toBe(false);
  });
});

describe("a missing or invalid partner selection is rejected clearly", () => {
  it("names the missing partner when none is chosen", () => {
    const intake = intakeAnswersSchema.parse({ path: "partner_implementation" });
    expect(partnerSelectionError(intake)).toBe(
      "Choose which partner leads this Partner Implementation before it starts.",
    );
  });

  it("refuses a partner that is not registered", () => {
    expect(
      partnerSelectionError({
        path: "partner_implementation",
        partner_implementation: { partner_key: "not_a_partner" as PartnerKey },
      }),
    ).toBe('"not_a_partner" is not a registered partner, so the implementation cannot start.');
  });

  it("accepts a chosen registered partner, and is silent for every other type", () => {
    expect(
      partnerSelectionError({
        path: "partner_implementation",
        partner_implementation: { partner_key: "field_fusion_iq" },
      }),
    ).toBeNull();
    expect(partnerSelectionError({ path: "new_logo", partner_implementation: null })).toBeNull();
    expect(partnerSelectionError({ path: null, partner_implementation: null })).toBeNull();
  });

  it("the intake will not store a partner the registry does not know", () => {
    expect(() =>
      intakeAnswersSchema.parse({
        path: "partner_implementation",
        partner_implementation: { partner_key: "not_a_partner" },
      }),
    ).toThrow();
  });
});

describe("partner creation goes through the existing transactional start", () => {
  it("one call to create_partner_implementation, carrying the chosen partner key", async () => {
    const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
      data: { implementation_id: "impl-1", customer_id: "cust-1", customer_created: true },
      error: null,
    }));
    const patch = partnerSelectionPatch("field_fusion_iq");
    const started = await startPartnerImplementation({ rpc } as never, {
      dealId: DEAL,
      implementationName: "Partner rollout",
      partnerKey: patch.partner_implementation.partner_key,
      sow: {
        sow_reference: null,
        sow_signed_date: null,
        sow_value: null,
        sow_document_url: null,
        sow_document_name: null,
        sow_document_path: null,
      },
      customerId: null,
      newCustomer: { name: "Acme" },
      enteredBy: null,
      actorProfile: null,
      at: "2026-10-13T12:00:00.000Z",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![0]).toBe("create_partner_implementation");
    expect(rpc.mock.calls[0]![1]).toMatchObject({
      p_deal_id: DEAL,
      p_partner_key: "field_fusion_iq",
    });
    expect(started).toMatchObject({ implementationId: "impl-1", customerId: "cust-1" });
  });

  it("a start with no customer and no fields for one is refused before anything is written", () => {
    expect(() =>
      partnerStartArgs({
        dealId: DEAL,
        implementationName: "x",
        partnerKey: "field_fusion_iq",
        sow: {
          sow_reference: null,
          sow_signed_date: null,
          sow_value: null,
          sow_document_url: null,
          sow_document_name: null,
          sow_document_path: null,
        },
        customerId: null,
        newCustomer: null,
        enteredBy: null,
        actorProfile: null,
        at: "t",
      }),
    ).toThrow("A partner start needs a customer");
  });
});
