import type { EffortBand } from "./integration-playbooks";
import { EFFORT_LABEL, playbookFor } from "./integration-playbooks";
import type { BriefJson } from "./server/schemas";

/**
 * What the expansion deck says.
 *
 * A DIFFERENT MEETING FROM A KICKOFF. This customer already runs GoCanvas.
 * Nobody in the room needs the company overview or a rollout timeline; they
 * need four answers — is the form already built, is there history to bring
 * across, what does this replace, and what does it save — plus what connecting
 * their system will actually take.
 *
 * WHERE EACH PART COMES FROM. The four answers and the target system are read
 * out of the SOW and the call notes by the same extraction the brief uses. The
 * assessment of the system itself — effort, prerequisites, what usually goes
 * wrong, the client gameplan — comes from `integration-playbooks.ts`, which is
 * reviewed engineering knowledge in version control rather than something a
 * model produced this morning.
 *
 * THE LEVEL OF EFFORT IS INTERNAL. It is an SE's week being planned, and it
 * belongs in a planning conversation, not in front of the customer. It is
 * carried separately here and the renderer puts it on a slide that says so.
 *
 * Pure.
 */

export type ExpansionAnswer = {
  question: string;
  answer: string | null;
  /** What the meeting risks if this stays unanswered. */
  whyItMatters: string;
};

export type ExpansionDeckData = {
  clientName: string;
  preparedAt: string;
  /** The system being connected, named as the playbook knows it. */
  target: string | null;
  /** False when we matched nothing — the deck says so rather than bluffing. */
  targetKnown: boolean;
  /** The four questions, in the order an account manager gets asked them. */
  answers: ExpansionAnswer[];
  /** What moves, and which way. */
  flows: Array<{ what: string; direction: string }>;
  /** Anything recorded about their instance that changes the build. */
  environment: string[];
  /** What this cannot start without. */
  blockers: string[];
  /** The client-facing plan. */
  gameplan: Array<{ step: string; detail: string }>;
  /** Before build can start. Client-facing — these are asks. */
  prerequisites: string[];
  /** INTERNAL. Never shown to the customer without the slide saying so. */
  internal: {
    effort: EffortBand;
    effortLabel: string;
    seDays: string;
    watchOut: string[];
  } | null;
  /** SOW facts, when the deal recorded them. */
  sow: { reference: string | null; signedDate: string | null; value: string | null };
  /** Fields nobody could fill. */
  missing: string[];
};

export type ExpansionInput = {
  clientName: string;
  preparedAt: string;
  brief: BriefJson;
  sowReference: string | null;
  sowSignedDate: string | null;
  sowValue: number | null;
};

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export function buildExpansionData(input: ExpansionInput): ExpansionDeckData {
  const e = input.brief.expansion;
  const hit = playbookFor(e.integration_target);

  const answers: ExpansionAnswer[] = [
    {
      question: "Is the form already built?",
      answer: clean(e.form_already_built),
      whyItMatters:
        "The plan is completely different depending on the answer. Connecting a form crews already use is mapping; building one first is a rollout.",
    },
    {
      question: "Is there history to bring across?",
      answer: clean(e.historical_data),
      whyItMatters:
        "A migration is separate work from a live connection, and it is usually the part that slips.",
    },
    {
      question: "How does this work get done today?",
      answer: clean(e.current_process),
      whyItMatters:
        "The manual step being removed is what we measure against. Without it there is no before.",
    },
    {
      question: "What does this save?",
      answer: clean(e.time_saved),
      whyItMatters:
        "In their numbers, not ours — it is what the renewal conversation gets held against.",
    },
  ];

  const missing: string[] = [];
  answers.forEach((a, i) => {
    if (!a.answer) missing.push(`answer_${i + 1}`);
  });
  if (!hit) missing.push("integration_target");
  if (e.data_flows.length === 0) missing.push("data_flows");

  return {
    clientName: input.clientName,
    preparedAt: input.preparedAt,
    target: hit?.name ?? null,
    targetKnown: hit?.known ?? false,
    answers,
    flows: e.data_flows,
    environment: e.environment_notes,
    blockers: e.blockers,
    gameplan: hit?.playbook.gameplan ?? [],
    prerequisites: hit?.playbook.prerequisites ?? [],
    internal: hit
      ? {
          effort: hit.playbook.effort,
          effortLabel: EFFORT_LABEL[hit.playbook.effort],
          seDays: hit.playbook.seDays,
          watchOut: hit.playbook.watchOut,
        }
      : null,
    sow: {
      reference: clean(input.sowReference),
      signedDate: clean(input.sowSignedDate),
      value:
        input.sowValue == null ? null : `$${Math.round(input.sowValue).toLocaleString("en-US")}`,
    },
    missing,
  };
}
