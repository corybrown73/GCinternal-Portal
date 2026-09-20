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
  blockers: Array<{ key: string; label: string }>;
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
  readiness?: ReadonlyArray<{ key: string; label: string }>;
  /** The customer has opened their page: as good as sent. */
  customerOpened?: boolean;
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
  const blockers = (input.readiness ?? []).map((r) => ({ key: r.key, label: r.label }));

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
      label: "Generate the customer brief",
      hint: "The button at the top right. Reads the calls; fills the intake's blanks — the process today, the forms, seats, systems.",
      done: input.aiBriefs > 0,
      panel: { key: "deal:brief", id: "brief-actions" },
    },
    {
      key: "intake",
      label: "Finish the intake",
      // Names the one answer still missing, so "never completes" cannot
      // happen with every visible field filled in.
      hint: !status.done
        ? `Still missing: ${status.next ?? "an answer"}`
        : !hasForm
          ? "Still missing: the first form to build — pick a library card or name theirs."
          : "Industry, the process today, and the forms to build — the first one first.",
      done: status.done && hasForm,
      panel: { key: "deal:intake", id: "panel-intake" },
    },
    {
      key: "sow",
      label: "Upload the SOW, read it into the plan",
      hint: "Upload the signed PDF under Notes & documents, then press “Read the SOW into the plan” on the plan below. Ticks when the plan has actually read it.",
      done: input.hasSow && Boolean(a.timeline.sow_applied_at),
      panel: input.hasSow
        ? { key: "deal:plan", id: "panel-plan" }
        : { key: "deal:gong", id: "panel-gong" },
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
      label: "Send the customer their link",
      hint: "Open the welcome page, copy the customer's link and send it. Ticks when you mark it sent, or when they open it — never before.",
      done:
        blockers.length === 0 && (Boolean(a.welcome_shared_at) || Boolean(input.customerOpened)),
      panel: { key: "deal:plan", id: "panel-plan" },
    },
  ];
  return steps.map((s) => ({ ...s, blockers: s.key === "share" ? blockers : [] }));
}
