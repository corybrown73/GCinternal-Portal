import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { audit } from "./server/audit";
import { rowOrThrow, rowsOrThrow, couldNotLoad } from "./server/db-read";
import { reportFailure } from "./errors";
import { deckKindFor } from "./deck-kind";
import type { IntakeAnswers } from "./intake-answers";
import { PARTNERS, implementationTypeFor, type PartnerKey } from "./partner-implementation";
import {
  completionLabel,
  deliveryFromStored,
  effectiveCompletion,
  suggestDeliveryDates,
  type SavedSchedule,
} from "./delivery-timeline";
import { tierForIntake } from "./complexity-tiers";
import {
  canConfigureKickoffDeck,
  isAdditionalSolution,
  recommendKickoffDeck,
  resolveKickoffSelection,
  type KickoffChoice,
  type KickoffDeckView,
  type KickoffFacts,
} from "./kickoff-slides";

const db = () => supabaseAdmin as any;

/**
 * WHERE A SAVED CHOICE LIVES. In `scoping_answers` (migration 0014), one row per
 * implementation and question, keyed `kickoff_deck`. Not in the deal's intake: a
 * rolled-back release rewrites the intake on every save and would silently drop
 * an unknown key. No migration is needed: the table, its unique key and its
 * policies already exist.
 */
export const KICKOFF_DECK_QUESTION = "kickoff_deck";

/**
 * What a saved choice row holds. Validated on read: a row that does not read is an
 * explicit error, never an empty or guessed deck. A release rolled back to the
 * earlier slide picker reads this row as malformed and holds the presentation,
 * rather than presenting a deck nobody chose.
 */
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const storedSchema = z.object({
  deck_type: z.enum(["standard", "partner"]),
  form_ready: z.boolean(),
  saved_at: z.string(),
  /** The TIS's delivery dates, when saved. Absent on a choice saved before dates existed. */
  schedule: z
    .object({
      forms_finalised_on: isoDay.nullable(),
      completion_from: isoDay.nullable(),
      completion_to: isoDay.nullable(),
      adjusted_reason: z.string().max(500).nullable(),
    })
    .nullable()
    .optional(),
});

export const KICKOFF_DECK_REFUSED =
  "Only an administrator, a manager, or the TIS assigned to this implementation can change its kickoff deck.";

/**
 * The Kickoff deck for a deal's current implementation, for the internal view.
 *   - a view with `loadError`: a read failed. The presentation is blocked until it
 *     loads, and saving is refused. Nothing is replaced silently.
 *   - otherwise: the automatic choice, and the saved choice, which takes precedence.
 *   - a deal whose deck type is unsettled (no saved choice, signals disagree): the
 *     selection is null and the presentation is blocked until the TIS chooses.
 */
export async function kickoffDeckView(args: {
  dealId: string;
  intake: IntakeAnswers;
  /** The first form is named, and whether a person confirmed it (not the paperwork alone). */
  firstFormNamed: boolean;
  firstFormConfirmed: boolean;
  firstFormName: string | null;
  /** The plan's kickoff day and close day (ISO), from the Hub timeline. */
  kickoffDate: string | null;
  closeDate: string | null;
}): Promise<KickoffDeckView> {
  try {
    return await readView(args);
  } catch (e) {
    return failedView(e);
  }
}

async function readView(args: {
  dealId: string;
  intake: IntakeAnswers;
  firstFormNamed: boolean;
  firstFormConfirmed: boolean;
  firstFormName: string | null;
  kickoffDate: string | null;
  closeDate: string | null;
}): Promise<KickoffDeckView> {
  const what = "the kickoff deck";
  const impl = rowOrThrow<any>(
    await db()
      .from("implementations")
      .select("id,customer_id,journey_template_id,partner_key,journey_type")
      .eq("deal_id", args.dealId)
      .is("superseded_by_implementation_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    what,
  );

  let journeyKey: string | null = null;
  let priorImplementations = 0;
  if (impl) {
    if (impl.journey_template_id) {
      const tpl = rowOrThrow<any>(
        await db()
          .from("journey_templates")
          .select("key")
          .eq("id", impl.journey_template_id)
          .maybeSingle(),
        what,
      );
      journeyKey = (tpl?.key as string | null) ?? null;
    }
    if (impl.customer_id) {
      const others = rowsOrThrow<{ id: string }>(
        await db()
          .from("implementations")
          .select("id")
          .eq("customer_id", impl.customer_id)
          .neq("id", impl.id)
          .is("superseded_by_implementation_id", null),
        what,
      );
      priorImplementations = others.length;
    }
  }

  // Two independent signals for the deck type. They must agree to pick a deck.
  const classification = deckKindFor({ journeyKey, priorImplementations, products: null });
  const type = implementationTypeFor(args.intake);
  // The implementation's own partner key is the record; the intake's partner is the fallback.
  const partnerKey = ((impl?.partner_key as string | null) ??
    type.partner ??
    null) as PartnerKey | null;
  const partnerName = partnerKey ? (PARTNERS[partnerKey]?.name ?? null) : null;
  const facts: KickoffFacts = {
    deckSignals: {
      // The same partner evidence the server's document guard reads: a partner key, a partner journey type, or a partner intake.
      partnerByRecord:
        Boolean(impl?.partner_key) ||
        impl?.journey_type === "partner_implementation" ||
        type.type === "partner_implementation",
      partnerByJourney: classification.kind === "partner",
    },
    partnerName,
    path: args.intake.path,
    additionalSolutions: (args.intake.timeline.services ?? []).filter(isAdditionalSolution),
    solutionsInvolved: args.intake.solutions_involved,
    firstFormNamed: args.firstFormNamed,
    firstFormConfirmed: args.firstFormConfirmed,
    hasImplementation: Boolean(impl),
  };
  const recommended = recommendKickoffDeck(facts);

  const implementationId = impl ? String(impl.id) : null;
  const stored = implementationId ? await readStored(implementationId) : null;
  const selection = resolveKickoffSelection(stored?.choice ?? null, recommended);

  // Delivery dates: the SOW paragraph first, then the tier target. Proposed only.
  const timelineFacts = args.intake.timeline as unknown as {
    sow_delivery?: Parameters<typeof deliveryFromStored>[0];
    sow_dates?: Array<{ type: string; date: string; who: string | null; quote: string }> | null;
    sow_notes?: string[];
    holidays?: string[];
  };
  const savedSchedule: SavedSchedule | null = stored?.choice.schedule ?? null;
  const suggestion = suggestDeliveryDates({
    sow: deliveryFromStored(timelineFacts.sow_delivery ?? null),
    tierNumber: tierForIntake(args.intake)?.tier ?? null,
    closeDate: args.closeDate,
    kickoffDate: args.kickoffDate,
    signedDate: null,
    formsFinalisedOn: savedSchedule?.formsFinalisedOn ?? null,
    holidays: timelineFacts.holidays ?? [],
    sowDeadlines: (timelineFacts.sow_dates ?? [])
      .filter((d) => d.type === "deadline")
      .map((d) => ({ date: d.date, who: d.who, quote: d.quote })),
    sowNotes: timelineFacts.sow_notes ?? [],
  });
  const effective = effectiveCompletion(suggestion, savedSchedule);

  return {
    loadError: null,
    implementationId,
    recommended,
    selection,
    saved: stored
      ? {
          savedAt: stored.savedAt,
          savedBy: await nameFor(stored.answeredBy),
          deckType: stored.choice.deckType,
          formReady: stored.choice.formReady,
        }
      : null,
    delivery: {
      suggestion,
      saved: savedSchedule,
      effective,
      label: completionLabel(effective),
    },
    canConfigure: false,
    partnerName,
    additional: facts.additionalSolutions.map((s) => ({
      kind: s.kind,
      name: s.name,
      phase: s.phase,
    })),
    firstFormName: args.firstFormNamed ? args.firstFormName : null,
  };
}

/** The saved row for one implementation, or null when none. A row that does not read is an explicit error. */
async function readStored(
  implementationId: string,
): Promise<{ choice: KickoffChoice; savedAt: string; answeredBy: string | null } | null> {
  const row = rowOrThrow<any>(
    await db()
      .from("scoping_answers")
      .select("value,answered_by")
      .eq("implementation_id", implementationId)
      .eq("question_key", KICKOFF_DECK_QUESTION)
      .maybeSingle(),
    "the saved kickoff deck choice",
  );
  if (!row) return null;
  const parsed = storedSchema.safeParse(row.value);
  if (!parsed.success) {
    console.error("[kickoff-slides] a saved kickoff deck choice does not read:", implementationId);
    throw new Error(couldNotLoad("the saved kickoff deck choice"));
  }
  return {
    choice: {
      deckType: parsed.data.deck_type,
      formReady: parsed.data.form_ready,
      schedule: parsed.data.schedule
        ? {
            formsFinalisedOn: parsed.data.schedule.forms_finalised_on,
            completionFrom: parsed.data.schedule.completion_from,
            completionTo: parsed.data.schedule.completion_to,
            adjustedReason: parsed.data.schedule.adjusted_reason,
          }
        : null,
    },
    savedAt: parsed.data.saved_at,
    answeredBy: (row.answered_by as string | null) ?? null,
  };
}

/** A view that says a read failed. The presentation is blocked with this message; no deck is guessed in its place. */
function failedView(error: unknown): KickoffDeckView {
  const loadError =
    error instanceof Error && error.message ? error.message : couldNotLoad("the kickoff deck");
  return {
    loadError,
    implementationId: null,
    recommended: {
      deckType: null,
      deckReason: "",
      ambiguous: false,
      hasAdditional: false,
      flags: [],
    },
    selection: null,
    saved: null,
    canConfigure: false,
    partnerName: null,
    additional: [],
    firstFormName: null,
    delivery: null,
  };
}

async function nameFor(profileId: string | null): Promise<string | null> {
  if (!profileId) return null;
  const profile = rowOrThrow<any>(
    await db().from("portal_profiles").select("full_name,email").eq("id", profileId).maybeSingle(),
    "the kickoff deck",
  );
  return ((profile?.full_name as string | null) || (profile?.email as string | null)) ?? null;
}

/**
 * Refuse a save or reset unless the signed-in person may configure every
 * implementation named. Read from the database, never from the client. A name
 * that is not an implementation of this deal is refused, so a choice can only be
 * written against the deal's own implementations. A failed read is an explicit
 * error: nothing is written.
 */
export async function assertKickoffDeckAuthority(
  userId: string,
  dealId: string,
  implementationIds: string[],
): Promise<void> {
  if (implementationIds.length === 0) return;
  const what = "the kickoff deck";
  const profile = rowOrThrow<any>(
    await db()
      .from("portal_profiles")
      .select("role, team_member_id")
      .eq("id", userId)
      .maybeSingle(),
    what,
  );
  const impls = rowsOrThrow<{ id: string; owner_id: string | null }>(
    await db().from("implementations").select("id,owner_id").eq("deal_id", dealId),
    what,
  );
  const byId = new Map(impls.map((i) => [String(i.id), i]));
  for (const id of implementationIds) {
    const impl = byId.get(id);
    if (!impl) throw new Error("That implementation is not on this deal.");
    const allowed = canConfigureKickoffDeck({
      role: (profile?.role as string | null) ?? null,
      actorTeamMemberId: (profile?.team_member_id as string | null) ?? null,
      ownerTeamMemberId: (impl.owner_id as string | null) ?? null,
    });
    if (!allowed) throw new Error(KICKOFF_DECK_REFUSED);
  }
}

/**
 * Whether this person may save or reset one implementation's deck: the same rule
 * the save enforces. Used to show the controls to those who can use them; it
 * never grants anything. A failed read throws, so the caller can say so.
 */
export async function canConfigureImplementationDeck(
  userId: string,
  dealId: string,
  implementationId: string,
): Promise<boolean> {
  const what = "the kickoff deck";
  const profile = rowOrThrow<any>(
    await db()
      .from("portal_profiles")
      .select("role, team_member_id")
      .eq("id", userId)
      .maybeSingle(),
    what,
  );
  const impl = rowOrThrow<any>(
    await db()
      .from("implementations")
      .select("id,owner_id")
      .eq("deal_id", dealId)
      .eq("id", implementationId)
      .maybeSingle(),
    what,
  );
  if (!impl) return false;
  return canConfigureKickoffDeck({
    role: (profile?.role as string | null) ?? null,
    actorTeamMemberId: (profile?.team_member_id as string | null) ?? null,
    ownerTeamMemberId: (impl.owner_id as string | null) ?? null,
  });
}

/**
 * A TIS's delivery dates are proposals: well-formed ISO days, a completion range
 * that runs forwards, and a stated reason whenever completion dates are set.
 * Nothing here is agreed with the customer.
 */
export function assertScheduleValid(schedule: SavedSchedule | null): void {
  if (!schedule) return;
  const day = /^\d{4}-\d{2}-\d{2}$/;
  for (const d of [schedule.formsFinalisedOn, schedule.completionFrom, schedule.completionTo]) {
    if (d !== null && !day.test(d)) throw new Error("A date must be a calendar day (YYYY-MM-DD).");
  }
  if (schedule.completionFrom || schedule.completionTo) {
    if (!schedule.completionFrom || !schedule.completionTo) {
      throw new Error("Set both ends of the completion range, or neither.");
    }
    if (schedule.completionTo < schedule.completionFrom) {
      throw new Error("The completion range must end on or after the day it starts.");
    }
    if (!schedule.adjustedReason || !schedule.adjustedReason.trim()) {
      throw new Error("Say why the completion dates are set: the TIS adjustment needs a reason.");
    }
  }
}

/**
 * Save or reset one implementation's kickoff deck choice. Checks, before any
 * write, that the person may configure that implementation (the role rule, and
 * that the implementation is on this deal). Writes exactly one row in
 * `scoping_answers` (or deletes it on reset). It touches no stage, owner, task,
 * milestone, deal status or the intake, and runs no journey work.
 */
export async function saveKickoffDeck(args: {
  actorProfileId: string;
  dealId: string;
  implementationId: string;
  choice: KickoffChoice | null;
}): Promise<{ implementationId: string; saved: boolean }> {
  await assertKickoffDeckAuthority(args.actorProfileId, args.dealId, [args.implementationId]);
  if (args.choice) assertScheduleValid(args.choice.schedule ?? null);

  if (args.choice === null) {
    const { error } = await db()
      .from("scoping_answers")
      .delete()
      .eq("implementation_id", args.implementationId)
      .eq("question_key", KICKOFF_DECK_QUESTION);
    if (error) throw new Error(reportFailure("kickoff-deck", "reset the kickoff deck", error));
  } else {
    const now = new Date().toISOString();
    const { error } = await db()
      .from("scoping_answers")
      .upsert(
        {
          implementation_id: args.implementationId,
          question_key: KICKOFF_DECK_QUESTION,
          value: {
            deck_type: args.choice.deckType,
            form_ready: args.choice.formReady,
            saved_at: now,
            schedule: args.choice.schedule
              ? {
                  forms_finalised_on: args.choice.schedule.formsFinalisedOn,
                  completion_from: args.choice.schedule.completionFrom,
                  completion_to: args.choice.schedule.completionTo,
                  adjusted_reason: args.choice.schedule.adjustedReason,
                }
              : null,
          },
          source: "manual",
          answered_by: args.actorProfileId,
          answered_at: now,
        },
        { onConflict: "implementation_id,question_key" },
      );
    if (error) throw new Error(reportFailure("kickoff-deck", "save the kickoff deck", error));
  }

  await audit({
    actor_type: "user",
    actor_id: args.actorProfileId,
    action: args.choice === null ? "kickoff_deck.reset" : "kickoff_deck.saved",
    entity_type: "implementation",
    entity_id: args.implementationId,
    payload: {
      deal_id: args.dealId,
      deck_type: args.choice?.deckType ?? null,
      form_ready: args.choice?.formReady ?? null,
      completion_from: args.choice?.schedule?.completionFrom ?? null,
      completion_to: args.choice?.schedule?.completionTo ?? null,
      forms_finalised_on: args.choice?.schedule?.formsFinalisedOn ?? null,
    },
  });
  return { implementationId: args.implementationId, saved: args.choice !== null };
}
