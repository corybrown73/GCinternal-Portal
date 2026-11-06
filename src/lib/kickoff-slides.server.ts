import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { audit } from "./server/audit";
import { rowOrThrow, rowsOrThrow, couldNotLoad } from "./server/db-read";
import { reportFailure } from "./errors";
import { deckKindFor } from "./deck-kind";
import type { IntakeAnswers } from "./intake-answers";
import { isTrainingOnly } from "./intake-answers";
import { PARTNERS, implementationTypeFor } from "./partner-implementation";
import { isTestAccount } from "./test-accounts";
import {
  OPTIONAL_SLIDE_KEYS,
  canConfigureKickoffDeck,
  recommendKickoffSlides,
  resolveKickoffSelection,
  type KickoffDeckView,
  type KickoffFacts,
  type KickoffSelection,
} from "./kickoff-slides";

const db = () => supabaseAdmin as any;

/**
 * WHERE A SAVED SELECTION LIVES. In `scoping_answers` (migration 0014), one row
 * per implementation and question, keyed `kickoff_deck`. Not in the deal's
 * intake: a rolled-back release rewrites the intake on every save and would
 * silently drop an unknown key, whereas `main` never reads or writes this table
 * except to insert answers for a brand-new implementation, which cannot collide.
 * No migration is needed: the table, its unique key and its policies already exist.
 */
export const KICKOFF_DECK_QUESTION = "kickoff_deck";

/** What a saved selection row holds. Validated on read: a row that does not read is an error, not an empty deck. */
const storedSchema = z.object({
  included: z.array(z.string().max(60)).max(20),
  order: z.array(z.string().max(60)).max(20),
  saved_at: z.string(),
});

export const KICKOFF_DECK_NOT_AVAILABLE =
  "The kickoff slide builder is available for test implementations only, during the controlled rollout.";

export const KICKOFF_DECK_REFUSED =
  "Only an administrator, a manager, or the TIS assigned to this implementation can change its kickoff slides.";

/**
 * Whether this deal is a test account (the deal or its customer is flagged, the
 * same rule every other test-only feature uses). Live customer deals return false
 * and see nothing of the deck builder.
 */
export async function kickoffDeckAvailable(dealId: string): Promise<boolean> {
  const deal = rowOrThrow<any>(
    await db()
      .from("portal_accounts")
      .select("id,customer_id,is_test")
      .eq("id", dealId)
      .maybeSingle(),
    "the kickoff slides",
  );
  if (!deal) return false;
  if (deal.is_test === true) return true;
  if (!deal.customer_id) return false;
  const customer = rowOrThrow<any>(
    await db().from("customers").select("id,is_test").eq("id", deal.customer_id).maybeSingle(),
    "the kickoff slides",
  );
  return isTestAccount(deal, customer);
}

/**
 * The Kickoff deck for a deal's current implementation, for the internal view.
 *   - null: not a test deal. The deck builder does not exist for it at all.
 *   - a view with `loadError`: a read failed. Nothing is replaced silently: the
 *     presentation shows the standard slides with the error, and saving is refused.
 *   - otherwise: the recommendation, and the saved selection, which takes precedence.
 */
export async function kickoffDeckView(args: {
  dealId: string;
  intake: IntakeAnswers;
  /** The first form is named, and whether a person confirmed it (not the paperwork alone). */
  firstFormNamed: boolean;
  firstFormConfirmed: boolean;
}): Promise<KickoffDeckView | null> {
  try {
    if (!(await kickoffDeckAvailable(args.dealId))) return null;
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
}): Promise<KickoffDeckView> {
  const what = "the kickoff slides";
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

  const classification = deckKindFor({ journeyKey, priorImplementations, products: null });
  const type = implementationTypeFor(args.intake);
  const partnerLed = classification.kind === "partner" || type.type === "partner_implementation";
  const expansion = classification.kind === "expansion" || args.intake.path === "existing";
  const facts: KickoffFacts = {
    path: args.intake.path,
    trainingOnly: isTrainingOnly(args.intake),
    expansion,
    partnerLed,
    partnerName: type.partner ? (PARTNERS[type.partner]?.name ?? null) : null,
    services: (args.intake.timeline.services ?? []).map((s) => ({ kind: s.kind, name: s.name })),
    solutionsInvolved: args.intake.solutions_involved,
    firstFormNamed: args.firstFormNamed,
    firstFormConfirmed: args.firstFormConfirmed,
    hasImplementation: Boolean(impl),
  };
  const recommended = recommendKickoffSlides(facts);

  const implementationId = impl ? String(impl.id) : null;
  const stored = implementationId ? await readStored(implementationId) : null;
  const selection = resolveKickoffSelection(stored?.selection ?? null, recommended);
  const recommendationChanged =
    stored !== null &&
    (stored.selection.included.length !== recommended.included.length ||
      recommended.included.some((k) => !stored.selection.included.includes(k)));

  return {
    loadError: null,
    implementationId,
    kind: classification.kind,
    kindReason: classification.reason,
    recommended,
    selection,
    saved: stored ? { savedAt: stored.savedAt, savedBy: await nameFor(stored.answeredBy) } : null,
    recommendationChanged,
    canConfigure: false,
    partnerName: type.partner ? (PARTNERS[type.partner]?.name ?? null) : null,
    purchased: (args.intake.timeline.services ?? []).map((s) => ({
      kind: s.kind,
      name: s.name,
      phase: s.phase,
    })),
  };
}

/** The saved row for one implementation, or null when none. A row that does not read is an explicit error. */
async function readStored(
  implementationId: string,
): Promise<{ selection: KickoffSelection; savedAt: string; answeredBy: string | null } | null> {
  const row = rowOrThrow<any>(
    await db()
      .from("scoping_answers")
      .select("value,answered_by")
      .eq("implementation_id", implementationId)
      .eq("question_key", KICKOFF_DECK_QUESTION)
      .maybeSingle(),
    "the saved slide selection",
  );
  if (!row) return null;
  const parsed = storedSchema.safeParse(row.value);
  if (!parsed.success) {
    console.error("[kickoff-slides] a saved selection does not read:", implementationId);
    throw new Error(couldNotLoad("the saved slide selection"));
  }
  return {
    selection: { included: parsed.data.included, order: parsed.data.order },
    savedAt: parsed.data.saved_at,
    answeredBy: (row.answered_by as string | null) ?? null,
  };
}

/** A view that says a read failed. The presentation shows the standard slides with this message; nothing is recommended in its place. */
function failedView(error: unknown): KickoffDeckView {
  const loadError =
    error instanceof Error && error.message ? error.message : couldNotLoad("the kickoff slides");
  return {
    loadError,
    implementationId: null,
    kind: "new-logo",
    kindReason: "",
    recommended: { included: [], reasons: {}, flags: [] },
    selection: { included: [], order: [...OPTIONAL_SLIDE_KEYS] },
    saved: null,
    recommendationChanged: false,
    canConfigure: false,
    partnerName: null,
    purchased: [],
  };
}

async function nameFor(profileId: string | null): Promise<string | null> {
  if (!profileId) return null;
  const profile = rowOrThrow<any>(
    await db().from("portal_profiles").select("full_name,email").eq("id", profileId).maybeSingle(),
    "the kickoff slides",
  );
  return ((profile?.full_name as string | null) || (profile?.email as string | null)) ?? null;
}

/**
 * Refuse a save or reset unless the signed-in person may configure every
 * implementation named. Read from the database, never from the client. A name
 * that is not an implementation of this deal is refused, so a configuration can
 * only be written against the deal's own implementations. A failed read is an
 * explicit error: nothing is written.
 */
export async function assertKickoffDeckAuthority(
  userId: string,
  dealId: string,
  implementationIds: string[],
): Promise<void> {
  if (implementationIds.length === 0) return;
  const what = "the kickoff slides";
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
  const what = "the kickoff slides";
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
 * Save or reset one implementation's Kickoff deck. Checks, in order, before any
 * write: the deal is a test account; the person may configure that implementation.
 * Writes exactly one row in `scoping_answers` (or deletes it on reset). It touches
 * no stage, owner, task, milestone or the deal's intake, and runs no journey work.
 */
export async function saveKickoffDeck(args: {
  actorProfileId: string;
  dealId: string;
  implementationId: string;
  selection: { included: string[]; order: string[] } | null;
}): Promise<{ implementationId: string; saved: boolean }> {
  if (!(await kickoffDeckAvailable(args.dealId))) throw new Error(KICKOFF_DECK_NOT_AVAILABLE);
  await assertKickoffDeckAuthority(args.actorProfileId, args.dealId, [args.implementationId]);

  if (args.selection === null) {
    const { error } = await db()
      .from("scoping_answers")
      .delete()
      .eq("implementation_id", args.implementationId)
      .eq("question_key", KICKOFF_DECK_QUESTION);
    if (error) throw new Error(reportFailure("kickoff-slides", "reset the kickoff slides", error));
  } else {
    const now = new Date().toISOString();
    const { error } = await db()
      .from("scoping_answers")
      .upsert(
        {
          implementation_id: args.implementationId,
          question_key: KICKOFF_DECK_QUESTION,
          value: { included: args.selection.included, order: args.selection.order, saved_at: now },
          source: "manual",
          answered_by: args.actorProfileId,
          answered_at: now,
        },
        { onConflict: "implementation_id,question_key" },
      );
    if (error) throw new Error(reportFailure("kickoff-slides", "save the kickoff slides", error));
  }

  await audit({
    actor_type: "user",
    actor_id: args.actorProfileId,
    action: args.selection === null ? "kickoff_deck.reset" : "kickoff_deck.saved",
    entity_type: "implementation",
    entity_id: args.implementationId,
    payload: {
      deal_id: args.dealId,
      included: args.selection?.included ?? null,
      order: args.selection?.order ?? null,
    },
  });
  return { implementationId: args.implementationId, saved: args.selection !== null };
}
