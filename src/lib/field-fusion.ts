import type { IntakeAnswers } from "./intake-answers";

/**
 * Field Fusion accounts. Client-safe: constants and the checklist.
 *
 * A Field Fusion deal takes a different phase 1. The product ships set up,
 * so there is no form to build; instead one person (Liesl, by default)
 * confirms the setup is working before implementation ever sees the
 * account, then hands it over with the use case and goals from the calls.
 * Implementation's first call is a training call, not a kickoff, and the
 * plan is the training week — see TRAINING_PLAN in onboarding-timeline.ts.
 */

/** The pipeline stage the deal waits in between Closed Won and the handoff. */
export const FIELD_FUSION_STAGE = "field_fusion_setup" as const;

/** The journey template key the implementation takes, when it is published. */
export const FIELD_FUSION_TEMPLATE_KEY = "field-fusion";

/** Who runs the setup. Overridden by `portal_app_config.field_fusion_owner_email`. */
export const FIELD_FUSION_OWNER_EMAIL_DEFAULT = "liesl.prinsloo@gocanvas.com";

export type FieldFusionCheck = {
  key: "form_connected" | "client_trained";
  label: string;
  done: boolean;
};

/** The two things that must be true before the handoff, with their state. */
export function fieldFusionChecklist(intake: IntakeAnswers): FieldFusionCheck[] {
  const ff = intake.field_fusion;
  return [
    { key: "form_connected", label: "The form is connected", done: ff.form_connected },
    {
      key: "client_trained",
      label: "The client is trained on Field Fusion",
      done: ff.client_trained,
    },
  ];
}

/** True when both checks are ticked. */
export function fieldFusionReady(intake: IntakeAnswers): boolean {
  return fieldFusionChecklist(intake).every((c) => c.done);
}

/**
 * What the handoff carries to implementation: where it came from, the use
 * case and goals the brief read out of the calls, and the setup notes.
 */
export type HandoffNote = {
  from: string;
  useCase: string | null;
  goals: string[];
  notes: string | null;
};
