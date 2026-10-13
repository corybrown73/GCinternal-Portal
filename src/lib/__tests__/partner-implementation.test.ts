import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { intakeAnswersSchema, readIntake } from "../intake-answers";
import {
  customerStages,
  initialStageFor,
  isPartnerJourney,
  liveTemplateId,
  nextPartnerStage,
  PARTNER_TEMPLATE_STAGE_KEYS,
  requiresPartnerTemplate,
  templateKeyFor,
  HANDOFF_ROLES,
  IMPLEMENTATION_READY,
  implementationTypeFor,
  PARTNER_JOURNEY,
  partnerStage,
  legacyPartnerStageForDealStage,
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

  it("the legacy mapping is an entry read only: onboarding_kickoff marks the handoff, not Form Finalisation being done", () => {
    // The mapping says where an existing record is shown. It carries no
    // completion, so nothing can read it as stage 4 finished.
    const mapped = legacyPartnerStageForDealStage("onboarding_kickoff");
    expect(mapped?.key).toBe("form_finalisation");
    expect(Object.keys(mapped ?? {})).not.toContain("completedAt");
    expect(Object.keys(mapped ?? {})).not.toContain("done");
    // Stages with no legacy equivalent stay unmapped rather than guessed.
    expect(
      PARTNER_JOURNEY.filter((s) => s.legacyDealStages.length === 0).map((s) => s.key),
    ).toEqual(["pilot", "trial_run", "roll_out"]);
  });

  it("the existing Field Fusion deal stages map onto the legacy partner stages they correspond to", () => {
    expect(legacyPartnerStageForDealStage("closed_won")?.key).toBe("closed_won_planning");
    expect(legacyPartnerStageForDealStage("field_fusion_setup")?.key).toBe("partner_setup");
    expect(legacyPartnerStageForDealStage("onboarding_kickoff")?.key).toBe("form_finalisation");
  });

  it("a deal stage with no partner equivalent yet maps to nothing rather than a guess", () => {
    expect(legacyPartnerStageForDealStage("get_it_working")).toBeNull();
    expect(legacyPartnerStageForDealStage("onboarding_complete")).toBeNull();
    expect(legacyPartnerStageForDealStage(null)).toBeNull();
    expect(legacyPartnerStageForDealStage("not_a_stage")).toBeNull();
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

describe("template selection, start stage and progression", () => {
  it("a new partner uses the partner template; legacy Field Fusion keeps its own; standard uses none", () => {
    expect(
      templateKeyFor(intakeWith({ partner_implementation: { partner_key: "field_fusion_iq" } })),
    ).toBe("partner-implementation");
    expect(templateKeyFor(intakeWith({ path: "field_fusion" }))).toBe("field-fusion");
    expect(templateKeyFor(intakeWith({ path: "new_logo" }))).toBeNull();
  });

  it("a new partner must use the partner template, so a missing one refuses the start; legacy and standard may not", () => {
    expect(
      requiresPartnerTemplate(
        intakeWith({ partner_implementation: { partner_key: "field_fusion_iq" } }),
      ),
    ).toBe(true);
    expect(requiresPartnerTemplate(intakeWith({ path: "field_fusion" }))).toBe(false);
    expect(requiresPartnerTemplate(intakeWith({ path: "new_logo" }))).toBe(false);
  });

  it("a new partner opens on Closed Won & Planning; legacy and standard keep the standard start", () => {
    expect(
      initialStageFor(intakeWith({ partner_implementation: { partner_key: "field_fusion_iq" } })),
    ).toBe("closed_won_planning");
    expect(initialStageFor(intakeWith({ path: "field_fusion" }))).toBeNull();
    expect(initialStageFor(intakeWith({ path: "new_logo" }))).toBeNull();
  });

  it("an implementation runs the partner journey by its journey type or its partner, never by the deal stage", () => {
    expect(isPartnerJourney({ journey_type: "partner_implementation", partner_key: null })).toBe(
      true,
    );
    expect(isPartnerJourney({ journey_type: "new_logo", partner_key: "field_fusion_iq" })).toBe(
      true,
    );
    expect(isPartnerJourney({ journey_type: "new_logo", partner_key: null })).toBe(false);
    expect(isPartnerJourney({})).toBe(false);
  });

  it("progression steps one stage forward through the template's own order, and stops at the end", () => {
    const order = PARTNER_TEMPLATE_STAGE_KEYS;
    expect(order).toEqual([
      "closed_won_planning",
      "partner_setup",
      "form_finalisation",
      "pilot",
      "trial_run",
      "roll_out",
    ]);
    expect(nextPartnerStage(order, "closed_won_planning")).toBe("partner_setup");
    expect(nextPartnerStage(order, "partner_setup")).toBe("form_finalisation");
    expect(nextPartnerStage(order, "roll_out")).toBeNull();
    expect(nextPartnerStage(order, "handoff")).toBeNull();
    expect(nextPartnerStage(order, null)).toBeNull();
  });
});

describe("the template migration matches the approved journey", () => {
  const sql = readFileSync(
    join(__dirname, "../../../supabase/migrations/0083_partner_implementation.sql"),
    "utf8",
  );
  const stageRows = [
    ...sql.matchAll(/\(v_tid, (\d+),\s*'([a-z_]+)',\s*'[^']*',\s*'[^']*',\s*'([a-z]+)'/g),
  ].map((m) => ({ position: Number(m[1]), key: m[2], gate: m[3] }));

  it("its stages are the partner journey from Closed Won & Planning on, in order", () => {
    expect(stageRows.map((r) => r.key)).toEqual([...PARTNER_TEMPLATE_STAGE_KEYS]);
    expect(stageRows.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("Partner Setup and Roll Out & Graduation are blocking; the others are advisory", () => {
    const gate = Object.fromEntries(stageRows.map((r) => [r.key, r.gate]));
    expect(gate).toEqual({
      closed_won_planning: "advisory",
      partner_setup: "blocking",
      form_finalisation: "advisory",
      pilot: "advisory",
      trial_run: "advisory",
      roll_out: "blocking",
    });
  });

  it("no task invents a date: each is dated only from a recorded target launch, with no offset", () => {
    const taskLines = [...sql.matchAll(/'(target_launch)',\s*(-?\d+),\s*(true|false)/g)];
    const total = [...sql.matchAll(/\(v_tid,\s*v_s_[a-z]+,\s*\d+,\s*'[a-z_.]+'/g)].length;
    expect(taskLines.length).toBe(total);
    expect(taskLines.every((m) => m[2] === "0")).toBe(true);
  });

  it("task keys are unique across the template", () => {
    const keys = [...sql.matchAll(/\(v_tid,\s*v_s_[a-z]+,\s*\d+,\s*'([a-z_.]+)'/g)].map(
      (m) => m[1],
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("a partner's start refuses rather than falling back", () => {
  const row = (over: Record<string, unknown>) => ({
    id: "t1",
    key: "partner-implementation",
    status: "published",
    superseded_by_id: null,
    ...over,
  });

  it("finds the live published template", () => {
    expect(liveTemplateId([row({})])).toBe("t1");
  });

  it("refuses when the template is only a draft, superseded, or missing", () => {
    expect(liveTemplateId([row({ status: "draft" })])).toBeNull();
    expect(liveTemplateId([row({ superseded_by_id: "t2" })])).toBeNull();
    expect(liveTemplateId([row({ key: "field-fusion" })])).toBeNull();
    expect(liveTemplateId([])).toBeNull();
  });
});
