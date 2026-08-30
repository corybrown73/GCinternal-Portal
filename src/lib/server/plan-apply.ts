import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getV2Flags } from "../app-config.server";
import { chooseTemplate, type SelectionInputs, type TemplateCandidate } from "./template-select";

const db = () => supabaseAdmin as any;

/**
 * Give a freshly created implementation its plan.
 *
 * WHY THIS EXISTS. Three code paths create implementations, and until now only
 * one of them produced a plan:
 *
 *   * `sf_create_implementation` (0023) calls `instantiate_journey` — correct,
 *     though it selected nothing, because no template carried a `default_for`
 *     rule and the configured fallback was read by no code;
 *   * `startOnboarding` — the pre-sale to onboarding handoff, the path this
 *     product is named for — raw-inserted a row and stopped;
 *   * `createImplementation` — the manual "New implementation" — the same.
 *
 * So every project a person started through the UI arrived with no stages and
 * no tasks. Acme, BlueRiver and Corewell had stage instances only because
 * migrations 0015/0016 seeded them; Summit Field Services, created through the
 * handoff, sat at `handoff` with nothing at all. The reported symptom was that
 * the process "gets a little confusing", which is what an empty screen looks
 * like from the inside.
 *
 * NEVER THROWS. A project that exists without a plan is recoverable in one
 * click; a handoff that rolls back after linking the deal and moving the
 * pre-sale stage is not. The caller gets a result describing what happened and
 * carries on either way.
 */
export type PlanApplyResult = {
  applied: boolean;
  /** Why, in words, for the audit payload and for a person reading it later. */
  reason: string;
  template_id?: string;
  template_key?: string;
  template_version?: number;
  via?: "rule" | "fallback";
  stages?: number;
  work_items?: number;
};

const NO_INPUTS: SelectionInputs = {
  opportunity_type: null,
  amount: null,
  product_codes: [],
  product_families: [],
};

async function fallbackTemplateKey(): Promise<string | null> {
  const { data } = await db()
    .from("portal_app_config")
    .select("value")
    .eq("key", "sf_fallback_template")
    .maybeSingle();
  const v = data?.value;
  return typeof v === "string" ? v : null;
}

async function publishedTemplates(): Promise<TemplateCandidate[]> {
  const { data } = await db()
    .from("journey_templates")
    .select("id, key, name, version, status, journey_type, default_for")
    .eq("status", "published")
    .is("superseded_by_id", null);
  return (data ?? []) as TemplateCandidate[];
}

export async function applyPlanToNewImplementation(args: {
  implementationId: string;
  actorProfileId: string | null;
  /**
   * What is known about the deal. The Salesforce path has an opportunity type
   * and an amount; the pre-sale handoff has neither, which is exactly the case
   * the configured fallback exists to cover.
   */
  inputs?: Partial<SelectionInputs>;
}): Promise<PlanApplyResult> {
  try {
    // Both flags, because a plan is stages AND tasks. With `work_items` off the
    // stage rail would render from a template while the tasks stayed invisible,
    // which is a stranger state than having no plan at all.
    const flags = await getV2Flags();
    if (!flags.journey_templates || !flags.work_items) {
      return {
        applied: false,
        reason: !flags.journey_templates ? "journey_templates is off" : "work_items is off",
      };
    }

    const [candidates, key] = await Promise.all([publishedTemplates(), fallbackTemplateKey()]);
    const selection = chooseTemplate(candidates, { ...NO_INPUTS, ...args.inputs }, key);

    if (!selection.winner) {
      return {
        applied: false,
        reason: selection.fallback?.reason ?? "no template matched and no fallback is configured",
      };
    }

    const { data, error } = await db().rpc("apply_journey_template", {
      p_implementation_id: args.implementationId,
      p_template_id: selection.winner.template_id,
      p_answers: {},
      p_roles: {},
      p_actor_id: args.actorProfileId,
    });

    if (error) {
      // Reported, not raised. See the note above about what a half-completed
      // handoff costs.
      console.error("[plan-apply] apply_journey_template failed", error);
      return { applied: false, reason: `apply_journey_template failed: ${error.message}` };
    }

    const res = (data ?? {}) as Record<string, unknown>;
    if (res["applied"] !== true) {
      return {
        applied: false,
        reason: String(res["reason"] ?? "the function declined to apply a plan"),
      };
    }

    return {
      applied: true,
      reason:
        selection.winner.via === "fallback"
          ? `no rule matched; applied the configured fallback '${selection.winner.template_key}'`
          : `rule ${selection.winner.rule_index} of '${selection.winner.template_key}' matched`,
      template_id: selection.winner.template_id,
      template_key: selection.winner.template_key,
      template_version: selection.winner.template_version,
      via: selection.winner.via,
      stages: Number(res["stages"] ?? 0),
      work_items: Number(res["work_items"] ?? 0),
    };
  } catch (e) {
    console.error("[plan-apply] unexpected failure", e);
    return {
      applied: false,
      reason: `unexpected failure: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
