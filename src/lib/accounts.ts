import "server-only";
import { createAdminClient } from "./supabase/admin";
import { audit } from "./audit";
import type { AccountUpsertInput } from "./schemas";
import type { Account, TransitionSource } from "./types";
import type { AccountStage } from "./stages";

export interface ActorContext {
  source: TransitionSource;
  actorProfileId?: string | null;
  actorApiKeyId?: string | null;
}

// Accepts a portal UUID or "sf_<salesforce_id>".
export async function resolveAccountId(idOrSf: string): Promise<string | null> {
  const admin = createAdminClient();
  if (idOrSf.startsWith("sf_")) {
    const { data } = await admin
      .from("portal_accounts")
      .select("id")
      .eq("salesforce_id", idOrSf.slice(3))
      .maybeSingle();
    return data?.id ?? null;
  }
  const { data } = await admin
    .from("portal_accounts")
    .select("id")
    .eq("id", idOrSf)
    .maybeSingle();
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
  occurredAt?: string
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
  ctx: ActorContext
): Promise<{ account: Account; created: boolean; stage_changed: boolean }> {
  const admin = createAdminClient();

  let existing: Account | null = null;
  if (input.salesforce_id) {
    const { data } = await admin
      .from("portal_accounts")
      .select("*")
      .eq("salesforce_id", input.salesforce_id)
      .maybeSingle<Account>();
    existing = data;
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
  }

  const amOwnerId = await profileIdByEmail(input.am_owner_email);
  const seOwnerId = await profileIdByEmail(input.se_owner_email);

  const fields: Record<string, unknown> = {
    name: input.name,
    ...(input.domain !== undefined && { domain: input.domain }),
    ...(input.salesforce_id !== undefined && { salesforce_id: input.salesforce_id }),
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
    payload: { created, stage_changed: stageChanged, source: ctx.source },
  });

  return { account, created, stage_changed: stageChanged };
}
