import { flowAnswered, intakeStatus, readIntake, type IntakeAnswers } from "./intake-answers";
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
  /** YYYY-MM-DD in the reader's zone; the server passes the team's day. */
  today?: string;
  /** The customer has opened their page: as good as sent. */
  customerOpened?: boolean;
}): GuideStep[] {
  const a: IntakeAnswers = readIntake(input.intake);
  const status = intakeStatus(a);
  const close = closeDateFor({
    intake: a,
    stageHistory: input.stageHistory,
    wonStageKey: input.wonStageKey,
    ...(input.today ? { today: input.today } : {}),
  });
  const t = timelineFor(a, close.date);
  const calls = t.milestones.filter((m) => m.kind === "call");
  const services = a.timeline.services ?? [];
  // The flow's own question: forms named, the Account Manager's answers, or nothing to ask.
  const hasForm = flowAnswered(a);
  const blockers = (input.readiness ?? []).map((r) => ({ key: r.key, label: r.label }));

  const steps: Array<Omit<GuideStep, "blockers">> = [
    {
      key: "gong",
      label: "Notes in",
      hint: "Paste the Gong transcript or the call notes. The brief writes itself from them and fills the facts below.",
      done: input.gongReports > 0,
      panel: { key: "deal:intake", id: "panel-intake" },
    },
    {
      key: "synth",
      label: "The brief is written",
      hint: "Automatic once the notes are in. If it did not run, press Build it — it says why.",
      done: input.aiBriefs > 0,
      panel: { key: "deal:brief", id: "brief-actions" },
    },
    {
      key: "paper",
      label: "SOW or contract on file",
      hint:
        a.has_sow === null
          ? "Say whether there is a SOW. Upload it, or the contract — seats and term travel with the deal."
          : a.has_sow
            ? "Upload the signed SOW under step 1."
            : "No SOW: upload the contract under step 1 so the seat count is on the record.",
      done: a.has_sow === true ? input.hasSow : a.has_sow === false ? Boolean(a.contract) : false,
      panel: { key: "deal:intake", id: "panel-intake" },
    },
    {
      key: "intake",
      label: "Confirm the facts",
      // Names the one answer still missing, so "never completes" cannot
      // happen with every visible field filled in.
      hint: !status.done
        ? `Still missing: ${status.next ?? "an answer"}`
        : "Integrations involved, industry, field users, the process today — pre-filled from the notes, confirmed by you.",
      done: status.done,
      panel: { key: "deal:intake", id: "panel-intake" },
    },
    {
      key: "path",
      label: "Pick the flow",
      hint:
        a.path === null
          ? "New logo, existing account, Device Magic conversion, or Field Fusion. The plan and the deck follow it."
          : !hasForm
            ? a.path === "existing"
              ? "Still missing: the Account Manager's answers — is the form final, and who builds it."
              : "Still missing: the first form to build — pick a library card or name theirs."
            : "The flow's own question is answered.",
      done: a.path !== null && hasForm,
      panel: { key: "deal:intake", id: "panel-intake" },
    },
    {
      key: "sow",
      label: a.has_sow === false ? "No SOW to read" : "Read the SOW into the plan",
      hint:
        a.has_sow === false
          ? "Nothing bought beyond the core: the plan stands on the flow alone."
          : "Press “Read the SOW into the plan” on the plan below. Ticks when the plan has actually read it — integrations come from here, never from the notes.",
      done: a.has_sow === false || (input.hasSow && Boolean(a.timeline.sow_applied_at)),
      panel: input.hasSow
        ? { key: "deal:plan", id: "panel-plan" }
        : { key: "deal:intake", id: "panel-intake" },
    },
    {
      key: "times",
      label: "Set the call times",
      hint: `${calls.length === 3 ? "All three" : "Both"} calls, with a time and a zone, so the invites can go out.`,
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
