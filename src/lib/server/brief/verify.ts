import { z as z4 } from "zod/v4";

import { groundOnboarding, quoteHolds, quoteInText } from "@/lib/onboarding-grounding";

import { aiConfigured } from "../ai/config";
import { runStructured, type AiUsage } from "../ai/client";
import type { PreparedDocument } from "../ai/documents";
import {
  onboardingSchema,
  STAKEHOLDER_ROLE_KINDS,
  type BriefJson,
  type BriefVerification,
  type VerificationStatus,
} from "../schemas";

/**
 * The third reading. A model checks the first two against the same sources
 * — the onboarding block as before, and now everything else a customer
 * reads: the kickoff slides, the people, the goals, the dates — and hands
 * back each kept item with the words it rests on. Then the code rules run
 * on its answer: a quote from the calls or the notes has to be in them,
 * word for word; a quote from the SOW has to carry a page or be in the
 * document's text. What the model dropped is dropped; what it kept and
 * cannot be found is kept, marked unverified, and the deck lists it to
 * check. Never throws: a verifier that fails leaves the grounded first
 * reading in place, with every item marked unverified.
 */

const sourceEnum = z4.enum(["calls", "sow", "notes"]);
const grounded = {
  quote: z4.string(),
  source: sourceEnum,
  page: z4.number().int().nullable(),
};
const quotedValue = z4.object({ value: z4.string(), ...grounded }).nullable();

export const verifiedBriefSchema = z4.object({
  onboarding: onboardingSchema,
  kickoff: z4.object({
    scope: z4.array(
      z4.object({
        workflow: z4.string(),
        replaces: z4.string().nullable(),
        teams: z4.string().nullable(),
        ...grounded,
      }),
    ),
    licensed_seats: quotedValue,
    renewal_date: quotedValue,
    roles: z4.array(
      z4.object({
        responsibility: z4.string(),
        owner: z4.string(),
        support: z4.string().nullable(),
        ...grounded,
      }),
    ),
    it_contact: quotedValue,
  }),
  stakeholders: z4.array(
    z4.object({
      name: z4.string(),
      role: z4.string(),
      notes: z4.string(),
      role_kind: z4.enum(STAKEHOLDER_ROLE_KINDS).nullable(),
      email: z4.string().nullable(),
      ...grounded,
    }),
  ),
  goals: z4.array(z4.object({ text: z4.string(), ...grounded })),
  dates: z4.array(
    z4.object({
      type: z4.enum(["signed", "start", "deadline", "absence"]),
      date: z4.string(),
      end: z4.string().nullable(),
      who: z4.string().nullable(),
      ...grounded,
    }),
  ),
});
export type VerifiedBrief = z4.infer<typeof verifiedBriefSchema>;

export type VerifyContext = {
  dealId: string | null;
  /** The shared prefix every pass sends; the verifier's instruction follows it. */
  prefix: import("../ai/client").AiContentBlock[];
  system: string;
  /** The brief passes' shared effort, so the verifier's request matches their cached prefix. */
  effort?: import("../ai/config").AiEffort | undefined;
  callsText: string;
  sow: PreparedDocument | null;
  jobId?: string | null | undefined;
};

type Grounded = { quote: string; source: "calls" | "sow" | "notes"; page: number | null };

/**
 * Does the item's quote hold? Calls and notes are text we hold, so the
 * quote must be in them. The SOW is read by the model, so its quote is
 * trusted only with a page number, or when the document is text (a Word
 * file) and the words are in it.
 */
export function itemHolds(
  item: Grounded,
  callsText: string,
  sow: PreparedDocument | null,
): boolean {
  if (item.source === "sow") {
    if (item.page !== null) return item.quote.trim().length >= 4;
    return Boolean(sow?.text) && quoteInText(item.quote, sow!.text!);
  }
  return quoteHolds(item.quote, item.source, callsText);
}

/**
 * The verifier's answer, applied to the brief by the code rules. Pure, so
 * the same rule holds in the tests and on the retry: returns the verified
 * brief and the map of what happened to each item.
 */
export function applyVerification(
  brief: BriefJson,
  verified: VerifiedBrief,
  input: { callsText: string; sow: PreparedDocument | null; checkedAt: string },
): BriefJson {
  const fields: Record<string, VerificationStatus> = {};
  const holds = (item: Grounded) => itemHolds(item, input.callsText, input.sow);
  const mark = (path: string, item: Grounded) => {
    fields[path] = holds(item) ? "grounded" : "unverified";
  };
  // A list: the kept items in order, then one "dropped" per item the
  // verifier removed, at the indexes past the stored list.
  const list = <T extends Grounded>(path: string, kept: T[], before: number): T[] => {
    kept.forEach((item, i) => mark(`${path}[${i}]`, item));
    for (let i = kept.length; i < before; i++) fields[`${path}[${i}]`] = "dropped";
    return kept;
  };
  const single = (path: string, kept: Grounded | null, hadValue: boolean) => {
    if (kept) mark(path, kept);
    else if (hadValue) fields[path] = "dropped";
  };

  const scope = list("kickoff.scope", verified.kickoff.scope, brief.kickoff.scope.length);
  const roles = list("kickoff.roles", verified.kickoff.roles, brief.kickoff.roles.length);
  single("kickoff.licensed_seats", verified.kickoff.licensed_seats, !!brief.kickoff.licensed_seats);
  single("kickoff.renewal_date", verified.kickoff.renewal_date, !!brief.kickoff.renewal_date);
  single("kickoff.it_contact", verified.kickoff.it_contact, !!brief.kickoff.it_contact);
  const stakeholders = list("stakeholders", verified.stakeholders, brief.stakeholders.length);
  const goals = list("goals", verified.goals, brief.goals.length);
  const dates = list("dates", verified.dates, (brief.dates ?? []).length);

  // The onboarding block as before: the code rules drop what cannot be
  // quoted, and the map says which forms and whether the flow held.
  const onboarding = groundOnboarding(verified.onboarding, input.callsText);
  const formsBefore = brief.onboarding?.forms.length ?? 0;
  (onboarding?.forms ?? []).forEach((_, i) => {
    fields[`onboarding.forms[${i}]`] = "grounded";
  });
  for (let i = onboarding?.forms.length ?? 0; i < formsBefore; i++) {
    fields[`onboarding.forms[${i}]`] = "dropped";
  }
  if (onboarding?.flow) fields["onboarding.flow"] = "grounded";
  else if (brief.onboarding?.flow || verified.onboarding.flow)
    fields["onboarding.flow"] = "dropped";

  return {
    ...brief,
    goals: goals.map((g) => g.text),
    stakeholders: stakeholders.map(({ name, role, notes, role_kind, email }) => ({
      name,
      role,
      notes,
      role_kind,
      email,
    })),
    dates: dates.map(({ type, date, end, who, quote }) => ({ type, date, end, who, quote })),
    kickoff: {
      ...brief.kickoff,
      scope: scope.map(({ workflow, replaces, teams }) => ({ workflow, replaces, teams })),
      roles: roles.map(({ responsibility, owner, support }) => ({
        responsibility,
        owner,
        support,
      })),
      licensed_seats: verified.kickoff.licensed_seats?.value ?? null,
      renewal_date: verified.kickoff.renewal_date?.value ?? null,
      it_contact: verified.kickoff.it_contact?.value ?? null,
    },
    ...(onboarding ? { onboarding } : {}),
    verification: { checked_at: input.checkedAt, fields },
  };
}

/** Every customer-facing item marked unverified: what the brief carries when the verifier did not run. */
export function unverifiedMap(brief: BriefJson, checkedAt: string): BriefVerification {
  const fields: Record<string, VerificationStatus> = {};
  brief.kickoff.scope.forEach((_, i) => (fields[`kickoff.scope[${i}]`] = "unverified"));
  brief.kickoff.roles.forEach((_, i) => (fields[`kickoff.roles[${i}]`] = "unverified"));
  if (brief.kickoff.licensed_seats) fields["kickoff.licensed_seats"] = "unverified";
  if (brief.kickoff.renewal_date) fields["kickoff.renewal_date"] = "unverified";
  if (brief.kickoff.it_contact) fields["kickoff.it_contact"] = "unverified";
  brief.stakeholders.forEach((_, i) => (fields[`stakeholders[${i}]`] = "unverified"));
  brief.goals.forEach((_, i) => (fields[`goals[${i}]`] = "unverified"));
  (brief.dates ?? []).forEach((_, i) => (fields[`dates[${i}]`] = "unverified"));
  (brief.onboarding?.forms ?? []).forEach(
    (_, i) => (fields[`onboarding.forms[${i}]`] = "unverified"),
  );
  if (brief.onboarding?.flow) fields["onboarding.flow"] = "unverified";
  return { checked_at: checkedAt, fields };
}

/**
 * The model's check over the assembled brief, then the code rules. The
 * onboarding block is grounded by code first, as it always was, so the
 * verifier can remove and correct but cannot add what the calls do not
 * say. Returns the verified brief — unverified throughout when the model
 * could not be asked — and the usage when it was.
 */
export async function verifyBrief(
  ctx: VerifyContext,
  brief: BriefJson,
  now: () => Date = () => new Date(),
): Promise<{ brief: BriefJson; usage: AiUsage | null }> {
  const onboarding = groundOnboarding(brief.onboarding, ctx.callsText);
  const grounded: BriefJson = { ...brief, ...(onboarding ? { onboarding } : {}) };
  const checkedAt = now().toISOString();
  if (!aiConfigured()) {
    return {
      brief: { ...grounded, verification: unverifiedMap(grounded, checkedAt) },
      usage: null,
    };
  }
  try {
    const { briefVerifyTask } = await import("./prompt");
    const toCheck: Partial<BriefJson> = { ...grounded };
    delete toCheck.verification;
    const { data, usage } = await runStructured({
      kind: "verify",
      schema: verifiedBriefSchema,
      system: ctx.system,
      content: [...ctx.prefix, { type: "text", text: briefVerifyTask(JSON.stringify(toCheck)) }],
      maxTokens: 16000,
      effort: ctx.effort,
      dealId: ctx.dealId,
      jobId: ctx.jobId ?? null,
    });
    return {
      brief: applyVerification(grounded, data, {
        callsText: ctx.callsText,
        sow: ctx.sow,
        checkedAt,
      }),
      usage,
    };
  } catch (e) {
    console.error("[brief] the verifier did not run; the grounded first reading stands", e);
    return {
      brief: { ...grounded, verification: unverifiedMap(grounded, checkedAt) },
      usage: null,
    };
  }
}
