import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
const createAdminClient = () => supabaseAdmin as unknown as SupabaseClient;
import { audit } from "./audit";
import { sfId18 } from "./sf-id";
import { resolveSalesforceIdWrite } from "./sf-account-match";
import type { AccountUpsertInput } from "./schemas";
import type { Account, TransitionSource } from "../presale-types";
import type { AccountStage } from "../presale-stages";

export interface ActorContext {
  source: TransitionSource;
  actorProfileId?: string | null;
  actorApiKeyId?: string | null;
}

// Accepts a portal UUID or "sf_<salesforce_id>".
export async function resolveAccountId(idOrSf: string): Promise<string | null> {
  const admin = createAdminClient();
  if (idOrSf.startsWith("sf_")) {
    // Normalized so a caller passing the 15-character form still resolves.
    const { data } = await admin
      .from("portal_accounts")
      .select("id")
      .eq("salesforce_id", sfId18(idOrSf.slice(3)) ?? idOrSf.slice(3))
      .maybeSingle();
    return data?.id ?? null;
  }
  const { data } = await admin.from("portal_accounts").select("id").eq("id", idOrSf).maybeSingle();
  return data?.id ?? null;
}

async function profileIdByEmail(email?: string): Promise<string | null> {
  if (!email) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("portal_profiles")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return data?.id ?? null;
}

export async function transitionStage(
  accountId: string,
  toStage: AccountStage,
  ctx: ActorContext,
  note?: string,
  occurredAt?: string,
): Promise<{ changed: boolean }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("portal_transition_stage", {
    p_account_id: accountId,
    p_to_stage: toStage,
    p_source: ctx.source,
    p_actor_profile: ctx.actorProfileId ?? null,
    p_actor_api_key: ctx.actorApiKeyId ?? null,
    p_note: note ?? null,
    p_occurred_at: occurredAt ?? null,
  });
  if (error) throw new Error(error.message);
  const changed = data !== null;
  if (changed) {
    await audit({
      actor_type: ctx.actorApiKeyId ? "api_key" : ctx.actorProfileId ? "user" : "system",
      actor_id: ctx.actorApiKeyId ?? ctx.actorProfileId ?? null,
      action: "stage.transition",
      entity_type: "account",
      entity_id: accountId,
      payload: { to_stage: toStage, source: ctx.source },
    });
  }
  return { changed };
}

export async function upsertAccount(
  input: AccountUpsertInput,
  ctx: ActorContext,
): Promise<{ account: Account; created: boolean; stage_changed: boolean }> {
  const admin = createAdminClient();

  // Salesforce hands out the same record as a 15- or an 18-character id. Both
  // the match and the stored value are normalized to 18 so the key is a key —
  // otherwise a row written from a CSV export never matches the same account
  // arriving from the API. (0023's data fix normalized what was already there.)
  const normalizedSfId = sfId18(input.salesforce_id ?? null);

  let existing: Account | null = null;
  let matchedBy: "salesforce_id" | "name" | null = null;
  if (normalizedSfId) {
    const { data } = await admin
      .from("portal_accounts")
      .select("*")
      .eq("salesforce_id", normalizedSfId)
      .maybeSingle<Account>();
    existing = data;
    if (existing) matchedBy = "salesforce_id";
  }
  if (!existing) {
    // ilike with no wildcards = case-insensitive equality; matches the
    // unique index on lower(name).
    const { data } = await admin
      .from("portal_accounts")
      .select("*")
      .ilike("name", input.name)
      .maybeSingle<Account>();
    existing = data;
    if (existing) matchedBy = "name";
  }

  const amOwnerId = await profileIdByEmail(input.am_owner_email);
  const seOwnerId = await profileIdByEmail(input.se_owner_email);

  // PLAN.md decision 4 — see resolveSalesforceIdWrite for the reasoning.
  const sfIdDecision = resolveSalesforceIdWrite({
    matchedBy,
    incoming: input.salesforce_id,
    existing: existing?.salesforce_id ?? null,
  });

  const fields: Record<string, unknown> = {
    name: input.name,
    ...(input.domain !== undefined && { domain: input.domain }),
    ...(sfIdDecision.write !== null && { salesforce_id: sfIdDecision.write }),
    ...(input.arr !== undefined && { arr: input.arr }),
    ...(input.products !== undefined && { products: input.products }),
    ...(input.summary !== undefined && { summary: input.summary }),
    ...(amOwnerId && { am_owner_id: amOwnerId }),
    ...(seOwnerId && { se_owner_id: seOwnerId }),
  };

  let account: Account;
  let created = false;
  let stageChanged = false;

  if (existing) {
    const { data, error } = await admin
      .from("portal_accounts")
      .update(fields)
      .eq("id", existing.id)
      .select("*")
      .single<Account>();
    if (error) throw new Error(error.message);
    account = data;
    if (input.stage && input.stage !== existing.stage) {
      const { changed } = await transitionStage(existing.id, input.stage, ctx);
      stageChanged = changed;
      account = { ...account, stage: input.stage };
    }
  } else {
    const initialStage = input.stage ?? "prospect";
    const { data, error } = await admin
      .from("portal_accounts")
      .insert({ ...fields, stage: initialStage })
      .select("*")
      .single<Account>();
    if (error) throw new Error(error.message);
    account = data;
    created = true;
    stageChanged = Boolean(input.stage);
    // Creation history row (from_stage null).
    await admin.from("portal_stage_transitions").insert({
      account_id: account.id,
      from_stage: null,
      to_stage: initialStage,
      source: ctx.source,
      actor_profile_id: ctx.actorProfileId ?? null,
      actor_api_key_id: ctx.actorApiKeyId ?? null,
      note: "Account created",
    });
  }

  await audit({
    actor_type: ctx.actorApiKeyId ? "api_key" : ctx.actorProfileId ? "user" : "system",
    actor_id: ctx.actorApiKeyId ?? ctx.actorProfileId ?? null,
    action: "account.upsert",
    entity_type: "account",
    entity_id: account.id,
    payload: {
      created,
      stage_changed: stageChanged,
      source: ctx.source,
      matched_by: matchedBy,
      ...(sfIdDecision.conflict && {
        salesforce_id_conflict: {
          ...sfIdDecision.conflict,
          reason:
            "matched on name only; the account already carries a different Salesforce id, which is the stronger evidence",
        },
      }),
    },
  });

  return { account, created, stage_changed: stageChanged };
}
