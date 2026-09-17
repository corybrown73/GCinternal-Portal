import { intakeStatus, readIntake, type IntakeAnswers } from "./intake-answers";
import { closeDateFor, timelineFor } from "./onboarding-plan";

/**
 * The deal page's order of work, computed from the record. Pure, so the
 * guide strip can never disagree with the data it sits above.
 */
export type GuideStep = {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  /** Which section to open: its collapse key and its element id. */
  panel: { key: string; id: string };
  /**
   * What still stands in the way of this step, by name. Only the share step
   * carries these: the welcome page's own readiness list, so "send the link"
   * cannot read as done while the page still has blanks.
   */
  blockers: string[];
};

export function guideSteps(input: {
  intake: unknown;
  gongReports: number;
  aiBriefs: number;
  hasSow: boolean;
  shareUrl: string | null;
  stageHistory: Array<{ to_stage: string; occurred_at: string }>;
  wonStageKey: string;
  /** The welcome page's readiness list, when the caller has it. */
  readiness?: ReadonlyArray<{ label: string }>;
}): GuideStep[] {
  const a: IntakeAnswers = readIntake(input.intake);
  const status = intakeStatus(a);
  const close = closeDateFor({
    intake: a,
    stageHistory: input.stageHistory,
    wonStageKey: input.wonStageKey,
  });
  const t = timelineFor(a, close.date);
  const calls = t.milestones.filter((m) => m.key === "kickoff" || m.key === "working");
  const services = a.timeline.services ?? [];
  const hasForm = a.wanted_forms.length > 0 || a.uploaded_forms.length > 0;
  const blockers = (input.readiness ?? []).map((r) => r.label);

  const steps: Array<Omit<GuideStep, "blockers">> = [
    {
      key: "path",
      label: "Pick the path",
      hint: "New customer, or an existing account adding services. Everything below follows it.",
      done: a.path !== null,
      panel: { key: "deal:intake", id: "panel-intake" },
    },
    {
      key: "gong",
      label: "Paste the Gong brief",
      hint: "Call notes or the account map. The AI reads these; so does the welcome page.",
      done: input.gongReports > 0,
      panel: { key: "deal:gong", id: "panel-gong" },
    },
    {
      key: "synth",
      label: "Synthesise with AI",
      hint: "Fills the intake's blanks from the calls — the process today, the forms, seats, systems.",
      done: input.aiBriefs > 0,
      panel: { key: "deal:brief", id: "panel-brief" },
    },
    {
      key: "intake",
      label: "Finish the intake",
      hint: "Industry, the process today, and the forms to build — the first one first.",
      done: status.done && hasForm,
      panel: { key: "deal:intake", id: "panel-intake" },
    },
    {
      key: "sow",
      label: "Upload the SOW, read it into the plan",
      hint: "The signed PDF is the record. Reading it proposes the services; you tick what is right.",
      done: input.hasSow && (services.length > 0 || (a.timeline.integration_tier ?? 0) > 0),
      panel: { key: "deal:plan", id: "panel-plan" },
    },
    {
      key: "times",
      label: "Set the call times",
      hint: "Both calls, with a time and a zone, so the invites can go out.",
      done: calls.length > 0 && calls.every((m) => m.time),
      panel: { key: "deal:plan", id: "panel-plan" },
    },
    {
      key: "share",
      label: "Open the welcome page, send the link",
      hint: "Present it on the first call. Copy the customer's link and the QR is on the cover.",
      done: Boolean(input.shareUrl) && blockers.length === 0,
      panel: { key: "deal:brief", id: "panel-brief" },
    },
  ];
  return steps.map((s) => ({ ...s, blockers: s.key === "share" ? blockers : [] }));
}
