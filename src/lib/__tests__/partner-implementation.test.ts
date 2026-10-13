import { describe, expect, it } from "vitest";

import { intakeAnswersSchema, readIntake } from "../intake-answers";
import {
  customerStages,
  HANDOFF_ROLES,
  IMPLEMENTATION_READY,
  implementationTypeFor,
  PARTNER_JOURNEY,
  partnerStage,
  partnerStageForDealStage,
  stageOwner,
} from "../partner-implementation";
import { CANONICAL_JOURNEY_KEYS } from "../stage-flow";

const intakeWith = (over: Record<string, unknown> = {}) =>
  readIntake(intakeAnswersSchema.parse({ ...over }));

describe("generic Partner Implementation selection", () => {
  it("an explicit partner on the intake selects a Partner Implementation for that partner", () => {
    const intake = intakeWith({
      path: "new_logo",
      partner_implementation: { partner_key: "field_fusion_iq" },
    });
    expect(implementationTypeFor(intake)).toEqual({
      type: "partner_implementation",
      partner: "field_fusion_iq",
      legacy: false,
    });
  });

  it("an account with no partner and a standard path stays on the standard six-stage model", () => {
    expect(implementationTypeFor(intakeWith({ path: "new_logo" }))).toEqual({
      type: "standard",
      partner: null,
      legacy: false,
    });
    expect(implementationTypeFor(intakeWith({}))).toMatchObject({ type: "standard" });
  });

  it("partner identity is stored separately from the account path", () => {
    const intake = intakeWith({
      path: "existing",
      partner_implementation: { partner_key: "field_fusion_iq" },
    });
    expect(intake.path).toBe("existing");
    expect(implementationTypeFor(intake).type).toBe("partner_implementation");
  });
});

describe("existing Field Fusion records are read through a compatibility mapping", () => {
  it("an account already on the Field Fusion path is read as Field Fusion IQ, marked legacy, and its record is untouched", () => {
    const raw = {
      path: "field_fusion",
      field_fusion: { form_connected: true, handed_off_at: "2026-10-02T10:00:00.000Z" },
    };
    const intake = intakeWith(raw);
    expect(implementationTypeFor(intake)).toEqual({
      type: "partner_implementation",
      partner: "field_fusion_iq",
      legacy: true,
    });
    expect(intake.path).toBe("field_fusion");
    expect(intake.field_fusion.handed_off_at).toBe("2026-10-02T10:00:00.000Z");
    expect(intake.partner_implementation).toBeNull();
  });

  it("an explicit partner wins over the legacy path", () => {
    const intake = intakeWith({
      path: "field_fusion",
      partner_implementation: { partner_key: "field_fusion_iq" },
    });
    expect(implementationTypeFor(intake)).toMatchObject({ legacy: false });
  });

  it("the existing Field Fusion deal stages map onto the partner stages they correspond to", () => {
    expect(partnerStageForDealStage("closed_won")?.key).toBe("closed_won_planning");
    expect(partnerStageForDealStage("field_fusion_setup")?.key).toBe("partner_setup");
    expect(partnerStageForDealStage("onboarding_kickoff")?.key).toBe("form_finalisation");
  });

  it("a deal stage with no partner equivalent yet maps to nothing rather than a guess", () => {
    expect(partnerStageForDealStage("get_it_working")).toBeNull();
    expect(partnerStageForDealStage("onboarding_complete")).toBeNull();
    expect(partnerStageForDealStage(null)).toBeNull();
    expect(partnerStageForDealStage("not_a_stage")).toBeNull();
  });
});

describe("the canonical seven-stage internal sequence", () => {
  it("runs in the agreed order, with positions 1 to 7", () => {
    expect(PARTNER_JOURNEY.map((s) => [s.position, s.key])).toEqual([
      [1, "pre_sale_poc"],
      [2, "closed_won_planning"],
      [3, "partner_setup"],
      [4, "form_finalisation"],
      [5, "pilot"],
      [6, "trial_run"],
      [7, "roll_out"],
    ]);
  });

  it("carries the agreed labels", () => {
    expect(PARTNER_JOURNEY.map((s) => s.label)).toEqual([
      "Pre-Sale & POC",
      "Closed Won & Planning",
      "Partner Setup & Connection",
      "Form Finalisation & Data Readiness",
      "Pilot",
      "Trial Run",
      "Roll Out & Graduation",
    ]);
  });

  it("the Implementation Ready milestone sits between stages 3 and 4", () => {
    expect(IMPLEMENTATION_READY.afterStage).toBe("partner_setup");
    expect(IMPLEMENTATION_READY.beforeStage).toBe("form_finalisation");
    expect(partnerStage(IMPLEMENTATION_READY.beforeStage).position).toBe(
      partnerStage(IMPLEMENTATION_READY.afterStage).position + 1,
    );
  });
});

describe("the five-stage customer-facing sequence", () => {
  it("begins at Partner Setup & Connection and runs to Roll Out & Graduation", () => {
    expect(customerStages().map((s) => s.key)).toEqual([
      "partner_setup",
      "form_finalisation",
      "pilot",
      "trial_run",
      "roll_out",
    ]);
    expect(customerStages()).toHaveLength(5);
  });

  it("the first two commercial stages stay internal", () => {
    expect(partnerStage("pre_sale_poc").visibility).toBe("internal");
    expect(partnerStage("closed_won_planning").visibility).toBe("internal");
  });
});

describe("ownership changes at Implementation Ready", () => {
  it("the partner owns stages up to and including setup, GoCanvas TIS owns everything after", () => {
    expect(PARTNER_JOURNEY.map((s) => [s.key, stageOwner(s.key)])).toEqual([
      ["pre_sale_poc", "partner"],
      ["closed_won_planning", "partner"],
      ["partner_setup", "partner"],
      ["form_finalisation", "gocanvas_tis"],
      ["pilot", "gocanvas_tis"],
      ["trial_run", "gocanvas_tis"],
      ["roll_out", "gocanvas_tis"],
    ]);
  });

  it("the handoff roles name both sides, and the partner stays on after handoff", () => {
    expect(HANDOFF_ROLES.before).toMatch(/Partner Implementation Lead owns the setup/);
    expect(HANDOFF_ROLES.after).toMatch(/GoCanvas TIS owns implementation and enablement/);
    expect(HANDOFF_ROLES.after).toMatch(/partner remains available/);
  });
});

describe("the standard six-stage journey is unchanged", () => {
  it("keeps the six canonical stages in their existing order", () => {
    expect(CANONICAL_JOURNEY_KEYS).toEqual([
      "pre_kickoff",
      "kickoff",
      "get_it_working",
      "make_it_yours",
      "make_it_run",
      "complete",
    ]);
  });

  it("a standard account resolves to the standard implementation type, never to the partner journey", () => {
    for (const path of ["new_logo", "existing", "dm_conversion", null] as const) {
      expect(implementationTypeFor(intakeWith({ path }))).toMatchObject({ type: "standard" });
    }
  });
});
