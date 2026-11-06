import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { deckKindFor } from "./deck-kind";
import type { IntakeAnswers } from "./intake-answers";
import { isTrainingOnly } from "./intake-answers";
import { PARTNERS, implementationTypeFor } from "./partner-implementation";
import {
  recommendKickoffSlides,
  resolveKickoffSelection,
  type KickoffDeckView,
  type KickoffFacts,
} from "./kickoff-slides";

const db = () => supabaseAdmin as any;

/**
 * The Kickoff deck for a deal's current implementation: the recommendation from
 * confirmed facts, and the TIS's saved selection for that implementation, which
 * takes precedence. Read on the server for the internal view only.
 */
export async function kickoffDeckView(args: {
  dealId: string;
  intake: IntakeAnswers;
  /** The first form is named, and whether a person confirmed it (not the paperwork alone). */
  firstFormNamed: boolean;
  firstFormConfirmed: boolean;
}): Promise<KickoffDeckView> {
  const { data: impl } = await db()
    .from("implementations")
    .select("id,customer_id,journey_template_id,partner_key,journey_type")
    .eq("deal_id", args.dealId)
    .is("superseded_by_implementation_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let journeyKey: string | null = null;
  let priorImplementations = 0;
  if (impl) {
    if (impl.journey_template_id) {
      const { data: tpl } = await db()
        .from("journey_templates")
        .select("key")
        .eq("id", impl.journey_template_id)
        .maybeSingle();
      journeyKey = (tpl?.key as string | null) ?? null;
    }
    if (impl.customer_id) {
      const { count } = await db()
        .from("implementations")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", impl.customer_id)
        .neq("id", impl.id)
        .is("superseded_by_implementation_id", null);
      priorImplementations = count ?? 0;
    }
  }

  const classification = deckKindFor({
    journeyKey,
    priorImplementations,
    products: null,
  });
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
  const stored = implementationId ? (args.intake.kickoff_deck?.[implementationId] ?? null) : null;
  const selection = resolveKickoffSelection(stored, recommended);

  const recommendationChanged =
    stored !== null &&
    (stored.included.length !== recommended.included.length ||
      recommended.included.some((k) => !stored.included.includes(k)));

  return {
    implementationId,
    kind: classification.kind,
    kindReason: classification.reason,
    recommended,
    selection,
    saved: stored ? { savedAt: stored.saved_at, savedBy: await nameFor(stored.saved_by) } : null,
    recommendationChanged,
    partnerName: type.partner ? (PARTNERS[type.partner]?.name ?? null) : null,
    purchased: (args.intake.timeline.services ?? []).map((s) => ({
      kind: s.kind,
      name: s.name,
      phase: s.phase,
    })),
  };
}

async function nameFor(profileId: string | null): Promise<string | null> {
  if (!profileId) return null;
  const { data } = await db()
    .from("portal_profiles")
    .select("full_name,email")
    .eq("id", profileId)
    .maybeSingle();
  return ((data?.full_name as string | null) || (data?.email as string | null)) ?? null;
}
