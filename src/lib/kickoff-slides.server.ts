import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { audit } from "./server/audit";
import { rowOrThrow, rowsOrThrow, couldNotLoad } from "./server/db-read";
import { reportFailure } from "./errors";
import { deckKindFor } from "./deck-kind";
import type { IntakeAnswers } from "./intake-answers";
import { PARTNERS, implementationTypeFor, type PartnerKey } from "./partner-implementation";
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
const storedSchema = z.object({
  deck_type: z.enum(["standard", "partner"]),
  form_ready: z.boolean(),
  saved_at: z.string(),
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
      partnerByRecord: Boolean(impl?.partner_key) || type.type === "partner_implementation",
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
    choice: { deckType: parsed.data.deck_type, formReady: parsed.data.form_ready },
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
    },
  });
  return { implementationId: args.implementationId, saved: args.choice !== null };
}
