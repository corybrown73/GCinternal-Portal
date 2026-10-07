import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MANAGE_ROLES } from "./roles";
import { createHash } from "crypto";
import { isFlagOn } from "./app-config.server";
import { audit } from "./server/audit";
import { emitEvent, recordImplementationCreated, safeCreateAlert } from "./server/events";
import { sfId18 } from "./server/sf-id";
import type { FieldMap } from "./server/sf-field-maps";
import { outboundFields } from "./server/sf-field-maps";
import type { TemplateCandidate } from "./server/template-select";
import type {
  CreateImplementationArgs,
  CreateResult,
  CustomerRow,
  ImplementationRow,
  IngestPort,
  PortalAccountRow,
  SyncLogRow,
} from "./server/sf-ingest";
import { type AccountStage } from "./presale-stages";
import { isAtOrPast, wonStage } from "./pipeline-stages";
import { loadPipelineStages } from "./pipeline-stages.server";
import { dealStageForLifecycle, TERMINAL_LIFECYCLE_STAGE } from "./deal-stage";

const db = () => supabaseAdmin as any;

/**
 * Plain JSON, as it crosses a serverFn boundary. `Record<string, unknown>` does
 * not satisfy TanStack's serializable check, and jsonb columns are exactly this
 * shape anyway.
 */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/**
 * The Supabase side of the Salesforce integration: the ingest port, the admin
 * reads and writes behind /admin/integrations, and the presale stage seam.
 *
 * The decision procedure itself lives in src/lib/server/sf-ingest.ts and knows
 * nothing about Supabase — everything here is the adapter that gives it real
 * rows. Authorization for anything a person triggers is enforced in this layer,
 * because every query below runs on the service-role client and RLS never sees
 * it.
 */

export { TERMINAL_LIFECYCLE_STAGE };

export function bodyHash(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body ?? null))
    .digest("hex");
}

/** Global kill switch, independent of the database. */
export function integrationKilled(): boolean {
  return process.env["SF_INTEGRATION_DISABLED"] === "1";
}

/* ------------------------------------------------------------------ port */

export function createIngestPort(ctx: { apiKeyId: string | null }): IngestPort {
  return {
    async flags() {
      if (integrationKilled()) {
        return { autoCreate: false, presaleBridge: false, templates: false };
      }
      const [autoCreate, presaleBridge, templates] = await Promise.all([
        isFlagOn("sf_auto_create"),
        isFlagOn("sf_presale_bridge"),
        isFlagOn("journey_templates"),
      ]);
      return { autoCreate, presaleBridge, templates };
    },

    async fieldMaps() {
      return loadFieldMaps();
    },

    async publishedTemplates() {
      const { data } = await db()
        .from("journey_templates")
        .select("id, key, name, version, status, journey_type, default_for")
        .eq("status", "published")
        .is("superseded_by_id", null);
      return (data ?? []) as TemplateCandidate[];
    },

    async fallbackTemplateKey() {
      const { data } = await db()
        .from("portal_app_config")
        .select("value")
        .eq("key", "sf_fallback_template")
        .maybeSingle();
      const v = (data as { value?: unknown } | null)?.value;
      return typeof v === "string" ? v : null;
    },

    async findCustomerBySfAccountId(sfAccountId: string) {
      const { data } = await db()
        .from("customers")
        .select("*")
        .eq("salesforce_account_id", sfAccountId)
        .maybeSingle();
      return (data ?? null) as CustomerRow | null;
    },

    async findPortalAccountBySfId(sfAccountId: string) {
      const { data } = await db()
        .from("portal_accounts")
        .select("id, name, salesforce_id, customer_id, stage")
        .eq("salesforce_id", sfAccountId)
        .maybeSingle();
      return (data ?? null) as PortalAccountRow | null;
    },

    async stampCustomerSfAccountId(customerId, sfAccountId, evidence) {
      // Identity only. No payload value is ever written over a customer field.
      const { error } = await db()
        .from("customers")
        .update({ salesforce_account_id: sfAccountId })
        .eq("id", customerId)
        .is("salesforce_account_id", null);
      if (error) throw new Error(error.message);
      await audit({
        actor_type: ctx.apiKeyId ? "api_key" : "system",
        actor_id: ctx.apiKeyId,
        action: "customer.sf_id_adopted",
        entity_type: "customer",
        entity_id: customerId,
        payload: { salesforce_account_id: sfAccountId, ...evidence },
      });
    },

    async createCustomer(input): Promise<CreateResult> {
      const { data, error } = await db()
        .from("customers")
        .insert({
          name: input.name,
          arr: input.arr,
          salesforce_account_id: input.salesforceAccountId,
          source: "salesforce",
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") return { conflict: true };
        throw new Error(error.message);
      }
      return { id: data.id as string };
    },

    async linkPortalAccountCustomer(accountId, customerId) {
      const { error } = await db()
        .from("portal_accounts")
        .update({ customer_id: customerId })
        .eq("id", accountId)
        .is("customer_id", null);
      if (error) throw new Error(error.message);
      await audit({
        actor_type: ctx.apiKeyId ? "api_key" : "system",
        actor_id: ctx.apiKeyId,
        action: "account.customer_linked",
        entity_type: "account",
        entity_id: accountId,
        payload: { customer_id: customerId, via: "salesforce_ingest" },
      });
    },

    async findCurrentImplementationByOpportunity(oppId) {
      const { data } = await db()
        .from("implementations")
        .select("*")
        .eq("salesforce_opportunity_id", oppId)
        .is("superseded_by_implementation_id", null)
        .maybeSingle();
      return (data ?? null) as ImplementationRow | null;
    },

    async isTerminal(impl) {
      if (impl.current_stage === TERMINAL_LIFECYCLE_STAGE) return true;
      const { data } = await db()
        .from("graduations")
        .select("id")
        .eq("implementation_id", impl.id)
        .maybeSingle();
      return Boolean(data);
    },

    async createImplementation(args: CreateImplementationArgs): Promise<CreateResult> {
      const patch: Record<string, unknown> = {
        name: args.name,
        sales_owner: args.salesOwner,
        ...(args.ownerId ? { owner_id: args.ownerId } : {}),
        ...(args.mapped["target_launch_date"]
          ? { target_launch_date: args.mapped["target_launch_date"] }
          : {}),
        ...(args.mapped["sow_value"] !== undefined && args.mapped["sow_value"] !== null
          ? { sow_value: args.mapped["sow_value"] }
          : {}),
      };

      const { data, error } = await db().rpc("sf_create_implementation", {
        p_customer_id: args.customerId,
        p_patch: patch,
        p_template_id: args.templateId,
        p_opportunity_id: args.salesforceOpportunityId,
        p_account_id: args.salesforceAccountId,
        p_closed_won_at: args.sfClosedWonAt,
        p_actor_profile_id: null,
      });
      if (error) {
        // 23505 arrives as a Postgres error through the RPC; either shape means
        // a concurrent delivery claimed the opportunity first.
        if (
          error.code === "23505" ||
          /duplicate key|unique constraint/i.test(error.message ?? "")
        ) {
          return { conflict: true };
        }
        throw new Error(error.message);
      }
      return { id: data as string };
    },

    async loadImplementation(id) {
      const { data } = await db().from("implementations").select("*").eq("id", id).maybeSingle();
      return (data ?? null) as ImplementationRow | null;
    },

    async applyReplayFills(implId, fills, syncLogId) {
      const { error } = await db().from("implementations").update(fills).eq("id", implId);
      if (error) throw new Error(error.message);

      await audit({
        actor_type: ctx.apiKeyId ? "api_key" : "system",
        actor_id: ctx.apiKeyId,
        action: "implementation.replay_fill",
        entity_type: "implementation",
        entity_id: implId,
        payload: { fields: fills, sync_log_id: syncLogId },
      });

      // Visible where a person actually looks, not only in an admin table: a
      // value that appeared without anyone typing it has to be explainable
      // from the implementation's own timeline.
      const { data: impl } = await db()
        .from("implementations")
        .select("current_stage")
        .eq("id", implId)
        .maybeSingle();
      await db()
        .from("journal_entries")
        .insert({
          implementation_id: implId,
          stage: impl?.current_stage ?? "handoff",
          note:
            `Filled from a Salesforce replay because the field was blank and its mapping ` +
            `allows it: ${Object.keys(fills).join(", ")}. See the integration sync log ` +
            `(${syncLogId}) for the payload this came from.`,
          author_id: null,
        });
    },

    async ownerIdByEmail(email) {
      const { data } = await db()
        .from("team_members")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },

    async cachedIdempotentResponse(key, hash) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await db()
        .from("integration_sync_log")
        .select("response_status, response_payload")
        .eq("idempotency_key", key)
        .eq("request_hash", hash)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data || data.response_status === null) return null;
      return { status: data.response_status as number, body: data.response_payload };
    },

    async writeSyncLog(row) {
      return writeSyncLog({ ...row, api_key_id: ctx.apiKeyId });
    },

    async emitImplementationCreated(impl) {
      await recordImplementationCreated({
        implementationId: impl.id,
        customerId: impl.customerId,
        source: "salesforce",
      });
    },

    async alertRewonAfterCompletion(args) {
      await safeCreateAlert({
        kind: "sf_rewon_after_completion",
        severity: "warning",
        title: `Salesforce re-won a delivered opportunity: ${args.opportunityName}`,
        detail:
          `Opportunity ${args.opportunityId} was delivered on implementation ${args.implementationId}. ` +
          `Nothing was created or changed. If this is a genuine follow-on, create it from the ` +
          `Customer 360 so the supersession is recorded against a person.`,
        customerId: args.customerId,
        implementationId: args.implementationId,
        payload: {
          salesforce_opportunity_id: args.opportunityId,
          existing_implementation_id: args.implementationId,
        },
        dedupeOn: { key: "salesforce_opportunity_id", value: args.opportunityId },
        notify: true,
      });
    },

    async bridgePresaleStage(accountId) {
      return bridgeDealToClosedWon(accountId);
    },
  };
}

/* ----------------------------------------------------------- shared reads */

export async function loadFieldMaps(): Promise<FieldMap[]> {
  const { data } = await db()
    .from("integration_field_maps")
    .select("id, direction, source_path, target_field, transform, fill_policy, required, active")
    .eq("provider", "salesforce")
    .order("direction")
    .order("source_path");
  return (data ?? []) as FieldMap[];
}

export async function writeSyncLog(
  row: SyncLogRow & { request_hash: string | null; api_key_id?: string | null },
): Promise<string> {
  const { data, error } = await db()
    .from("integration_sync_log")
    .insert({
      direction: row.direction,
      provider: "salesforce",
      kind: row.kind,
      external_id: row.external_id,
      implementation_id: row.implementation_id,
      customer_id: row.customer_id,
      api_key_id: row.api_key_id ?? null,
      idempotency_key: row.idempotency_key,
      request_hash: row.request_hash,
      request_payload: row.request_payload,
      decision: row.decision,
      response_status: row.response_status,
      response_payload: row.response_payload,
      status: row.status,
      error: row.error,
    })
    .select("id")
    .single();
  if (error) {
    // The exchange record must never take down the exchange itself.
    console.error("[sf] sync log write failed", error.message);
    return "";
  }
  return data.id as string;
}

/* ---------------------------------------------------- presale stage seam */

/**
 * The ingest's half of PLAN.md decision 10: a closed-won opportunity moves the
 * matched deal to the WON stage — forward only, through the one legal writer
 * (`portal_transition_stage`), and only when `sf_presale_bridge` is on.
 *
 * Two things changed here and neither changes behaviour on a deployment that
 * has not edited its pipeline. The destination is the stage MARKED as won
 * rather than the literal `closed_won`; and "forward" is a position in the
 * CONFIGURED order rather than an index into the enum's declaration order.
 * Reordering the pipeline therefore changes what forward means, which is what
 * reordering a pipeline is.
 */
export async function bridgeDealToClosedWon(accountId: string): Promise<{ changed: boolean }> {
  const [{ data: account }, stages] = await Promise.all([
    db().from("portal_accounts").select("id, stage").eq("id", accountId).maybeSingle(),
    loadPipelineStages(),
  ]);
  if (!account) return { changed: false };
  const won = wonStage(stages);
  if (isAtOrPast(stages, account.stage, won.key)) return { changed: false };

  const { transitionStage } = await import("./server/accounts");
  return transitionStage(
    accountId,
    won.key as AccountStage,
    { source: "api" },
    "Closed-won opportunity received from Salesforce",
  );
}

/** Lifecycle stage → the deal stage it implies. One mapping, in lib/deal-stage. */
export const presaleStageForLifecycle = dealStageForLifecycle;

/**
 * The other half of decision 10: the presale tail
 * (onboarding_kickoff → in_onboarding → onboarding_complete) mirrors delivery
 * progress but has always been updated by hand. This syncs it FORWARD from a
 * lifecycle advance, through `portal_transition_stage`, and never backward — a
 * deal that is already further along is left exactly where it is.
 *
 * Never throws: a presale mirror must not fail a stage advance that has already
 * been recorded in `implementation_stage_history`, which is the authority.
 */
export async function syncPresaleStageFromLifecycle(
  implementationId: string,
  lifecycleStage: string,
): Promise<{ synced: boolean; reason?: string }> {
  try {
    if (integrationKilled()) return { synced: false, reason: "kill switch" };
    if (!(await isFlagOn("sf_presale_bridge"))) return { synced: false, reason: "flag off" };

    const target = presaleStageForLifecycle(lifecycleStage);
    if (!target) return { synced: false, reason: "stage is not part of the lifecycle" };

    const { data: impl } = await db()
      .from("implementations")
      .select("customer_id, deal_id")
      .eq("id", implementationId)
      .maybeSingle();
    if (!impl) return { synced: false, reason: "implementation not found" };

    // The project's own deal. A customer with two deals (an add-on beside
    // the original) used to make the customer lookup fail with "multiple
    // rows"; the deal link is exact, and the customer lookup is only for
    // legacy projects that were never linked.
    const { data: account } = impl.deal_id
      ? await db().from("portal_accounts").select("id, stage").eq("id", impl.deal_id).maybeSingle()
      : await db()
          .from("portal_accounts")
          .select("id, stage")
          .eq("customer_id", impl.customer_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
    if (!account) return { synced: false, reason: "no linked deal" };
    const stages = await loadPipelineStages();
    if (isAtOrPast(stages, account.stage, target)) {
      return { synced: false, reason: "deal is already at or past that stage" };
    }
    // The Field Fusion gate holds until the person running it presses "Hand
    // to implementation"; a plan step ticked early must not move the deal
    // past it on its own.
    if (account.stage === "field_fusion_setup") {
      return { synced: false, reason: "Field Fusion setup holds until the handoff" };
    }
    // Closed Won and Pre-kickoff belong to the deal's checklist: the brief
    // being generated moves the project to planning, but the deal only
    // reaches Onboarding when the AE is answered, the prep is done and the
    // meetings are booked. Ask the checklist; it moves the deal when it may.
    if (target !== "onboarding_complete") {
      const { syncDealStage } = await import("./stage-flow.server");
      const { moved } = await syncDealStage(account.id, null);
      return moved ? { synced: true } : { synced: false, reason: "the checklist is not done" };
    }

    const { transitionStage } = await import("./server/accounts");
    const { changed } = await transitionStage(
      account.id,
      target,
      { source: "system" },
      `Mirrored from delivery: implementation entered ${lifecycleStage}`,
    );
    return { synced: changed };
  } catch (e) {
    console.error("[sf] presale stage sync failed", e);
    return { synced: false, reason: "error" };
  }
}

/* ------------------------------------------------------- write-back events */

const WRITE_BACK_FIELDS = [
  "current_stage",
  "health_computed",
  "target_launch_date",
  "actual_launch_date",
] as const;

/**
 * Emit a `salesforce.write_back` event for an implementation that carries an
 * opportunity id. Deduped on the exact field set, so a no-op recompute does not
 * queue a delivery.
 */
export async function emitWriteBack(implementationId: string): Promise<{ emitted: boolean }> {
  try {
    if (integrationKilled()) return { emitted: false };
    const { data: impl } = await db()
      .from("implementations")
      .select(
        "id, customer_id, salesforce_opportunity_id, salesforce_account_id, " +
          WRITE_BACK_FIELDS.join(", "),
      )
      .eq("id", implementationId)
      .maybeSingle();
    if (!impl?.salesforce_opportunity_id) return { emitted: false };

    const maps = await loadFieldMaps();
    const fields = outboundFields(impl as Record<string, unknown>, maps);
    if (Object.keys(fields).length === 0) return { emitted: false };

    const digest = createHash("sha256").update(JSON.stringify(fields)).digest("hex").slice(0, 16);
    return await emitEvent({
      event_type: "salesforce.write_back",
      entity_type: "implementation",
      entity_id: impl.id,
      implementation_id: impl.id,
      payload: {
        salesforce_opportunity_id: impl.salesforce_opportunity_id,
        salesforce_account_id: impl.salesforce_account_id,
        fields,
        inputs: Object.fromEntries(WRITE_BACK_FIELDS.map((f) => [f, (impl as any)[f] ?? null])),
      },
      dedupe_key: `wb:${impl.salesforce_opportunity_id}:${digest}`,
    });
  } catch (e) {
    console.error("[sf] write-back emit failed", e);
    return { emitted: false };
  }
}

/* --------------------------------------------------------------- admin API */

async function requireManager(userId: string): Promise<{ id: string; role: string }> {
  const { data } = await db()
    .from("portal_profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!data) throw new Error("No portal profile exists for this user");
  if (!MANAGE_ROLES.includes(data.role)) {
    throw new Error("Integration settings are manager-only");
  }
  return data as { id: string; role: string };
}

async function requireAdmin(userId: string): Promise<{ id: string; role: string }> {
  const profile = await requireManager(userId);
  if (!["admin", "super_admin"].includes(profile.role)) {
    throw new Error("Admin only");
  }
  return profile;
}

export type IntegrationStatus = {
  flags: {
    sf_auto_create: boolean;
    sf_presale_bridge: boolean;
    sf_pull_enabled: boolean;
    journey_templates: boolean;
  };
  killSwitch: boolean;
  counts: {
    sync_log_24h: number;
    failed_24h: number;
    undispatched_events: number;
    endpoints: number;
    needs_template: number;
  };
};

export async function loadIntegrationStatus(userId: string): Promise<IntegrationStatus> {
  await requireManager(userId);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [flags, recent, failed, undispatched, endpoints, needsTemplate] = await Promise.all([
    Promise.all([
      isFlagOn("sf_auto_create"),
      isFlagOn("sf_presale_bridge"),
      isFlagOn("journey_templates"),
      isFlagOn("sf_pull_enabled"),
    ]),
    db()
      .from("integration_sync_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
    db()
      .from("integration_sync_log")
      .select("id", { count: "exact", head: true })
      .in("status", ["failed", "rejected"])
      .gte("created_at", since),
    db()
      .from("integration_events")
      .select("id", { count: "exact", head: true })
      .is("dispatched_at", null),
    db().from("webhook_endpoints").select("id", { count: "exact", head: true }).eq("active", true),
    db()
      .from("implementations")
      .select("id", { count: "exact", head: true })
      .eq("source", "salesforce")
      .is("journey_template_id", null),
  ]);

  return {
    flags: {
      sf_auto_create: flags[0],
      sf_presale_bridge: flags[1],
      journey_templates: flags[2],
      sf_pull_enabled: flags[3],
    },
    killSwitch: integrationKilled(),
    counts: {
      sync_log_24h: recent.count ?? 0,
      failed_24h: failed.count ?? 0,
      undispatched_events: undispatched.count ?? 0,
      endpoints: endpoints.count ?? 0,
      needs_template: needsTemplate.count ?? 0,
    },
  };
}

export type SyncLogEntry = {
  id: string;
  direction: string;
  kind: string;
  external_id: string | null;
  implementation_id: string | null;
  customer_id: string | null;
  status: string;
  response_status: number | null;
  error: string | null;
  created_at: string;
  decision: Json;
  request_payload: Json;
};

export async function loadSyncLog(
  userId: string,
  filter: {
    status?: string | null;
    externalId?: string | null;
    kind?: string | null;
    limit?: number;
  },
): Promise<SyncLogEntry[]> {
  await requireManager(userId);
  let q = db()
    .from("integration_sync_log")
    .select(
      "id, direction, kind, external_id, implementation_id, customer_id, status, response_status, error, created_at, decision, request_payload",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(filter.limit ?? 100, 200));
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.kind) q = q.eq("kind", filter.kind);
  if (filter.externalId) q = q.eq("external_id", sfId18(filter.externalId));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as SyncLogEntry[];
}

/** Re-run a stored payload through the pipeline. Safe: §1 idempotency applies. */
export async function rerunSyncLogEntry(
  userId: string,
  syncLogId: string,
): Promise<{ status: number; sync_log_id: string | null }> {
  await requireManager(userId);
  const { data: row } = await db()
    .from("integration_sync_log")
    .select("id, kind, request_payload")
    .eq("id", syncLogId)
    .maybeSingle();
  if (!row) throw new Error("That sync log row no longer exists");
  if (row.kind !== "opportunity.ingest") {
    throw new Error("Only an inbound opportunity ingest can be re-run from here");
  }

  const { opportunityIngestSchema } = await import("./server/sf-schemas");
  const parsed = opportunityIngestSchema.safeParse(row.request_payload);
  if (!parsed.success) throw new Error("The stored payload no longer validates");

  const { ingestOpportunity } = await import("./server/sf-ingest");
  const outcome = await ingestOpportunity(parsed.data, createIngestPort({ apiKeyId: null }), {
    apiKeyId: null,
    idempotencyKey: null,
    bodyHash: bodyHash(parsed.data),
  });

  if (outcome.syncLogId) {
    await db()
      .from("integration_sync_log")
      .update({ retried_from_id: syncLogId })
      .eq("id", outcome.syncLogId);
  }
  return { status: outcome.status, sync_log_id: outcome.syncLogId };
}

export async function loadFieldMapsForAdmin(userId: string): Promise<FieldMap[]> {
  await requireManager(userId);
  return loadFieldMaps();
}

export async function saveFieldMap(
  userId: string,
  input: {
    id?: string | null;
    direction: "inbound" | "outbound" | "inbound_deal";
    source_path: string;
    target_field: string;
    transform: string | null;
    fill_policy: "never" | "if_blank";
    required: boolean;
    active: boolean;
  },
): Promise<{ ok: true }> {
  const profile = await requireAdmin(userId);
  if (input.direction === "inbound_deal") {
    const { isDealFieldKey } = await import("./deal-field-catalog");
    if (!isDealFieldKey(input.target_field)) {
      throw new Error(
        `"${input.target_field}" is not a deal field the closed-won endpoint can write.`,
      );
    }
  }
  const patch = {
    direction: input.direction,
    source_path: input.source_path,
    target_field: input.target_field,
    transform: input.transform,
    fill_policy: input.fill_policy,
    required: input.required,
    active: input.active,
    updated_by: profile.id,
    updated_at: new Date().toISOString(),
    // A row a person has edited is no longer a seed row, and the 0023 rollback
    // deletes seed rows by this tag. Clearing it here is what makes that
    // rollback honest instead of a hope about UI behaviour.
    notes: null,
  };

  if (input.id) {
    const { error } = await db().from("integration_field_maps").update(patch).eq("id", input.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db().from("integration_field_maps").insert(patch);
    if (error) throw new Error(error.message);
  }

  await audit({
    actor_type: "user",
    actor_id: profile.id,
    action: "integration.field_map_saved",
    entity_type: "integration_field_map",
    ...(input.id ? { entity_id: input.id } : {}),
    payload: { ...patch, updated_at: new Date().toISOString() },
  });
  return { ok: true };
}

export async function deleteFieldMap(userId: string, id: string): Promise<{ ok: true }> {
  const profile = await requireAdmin(userId);
  const { error } = await db().from("integration_field_maps").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await audit({
    actor_type: "user",
    actor_id: profile.id,
    action: "integration.field_map_deleted",
    entity_type: "integration_field_map",
    entity_id: id,
  });
  return { ok: true };
}

/** "Test a payload": the mapped output and the full template evaluation, no writes. */
export async function previewIngest(
  userId: string,
  payload: unknown,
): Promise<{ mapped: Json; missingRequired: string[]; selection: Json; errors: string[] }> {
  await requireManager(userId);
  const { opportunityIngestSchema } = await import("./server/sf-schemas");
  const parsed = opportunityIngestSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      mapped: {},
      missingRequired: [],
      selection: null,
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const { applyInboundMaps } = await import("./server/sf-field-maps");
  const { canonicalMapping, selectionInputsFrom } = await import("./server/sf-ingest");
  const { selectTemplate } = await import("./server/template-select");

  const maps = await loadFieldMaps();
  const inbound = applyInboundMaps(parsed.data, maps);
  const { data: templates } = await db()
    .from("journey_templates")
    .select("id, key, name, version, status, journey_type, default_for")
    .eq("status", "published")
    .is("superseded_by_id", null);

  return {
    mapped: { ...canonicalMapping(parsed.data), ...inbound.values } as Json,
    missingRequired: inbound.missingRequired,
    selection: selectTemplate(
      (templates ?? []) as TemplateCandidate[],
      selectionInputsFrom(parsed.data),
    ) as unknown as Json,
    errors: [],
  };
}

/**
 * "Test a closed-won payload": what the map and the aliases make of a body,
 * who the TIS and the AE would resolve to, and what the schema says — with
 * nothing written. The same resolution the endpoint runs.
 */
export async function previewClosedWon(
  userId: string,
  payload: unknown,
): Promise<{
  row: Json;
  sources: Record<string, string>;
  unmapped_keys: string[];
  missing_required: string[];
  errors: string[];
  tis: { input: string | null; resolved: string | null };
  ae: { input: string | null; matched: boolean };
}> {
  await requireManager(userId);
  const { applyDealMaps, dealMapRoots } = await import("./server/sf-field-maps");
  const { resolveClosedWonRow, closedWonSchema } = await import("./server/closed-won");
  const maps = await loadFieldMaps();
  const mapped = applyDealMaps(payload, maps);
  const resolved = resolveClosedWonRow(payload, mapped.values, dealMapRoots(maps));
  const sources = Object.fromEntries(
    Object.entries(resolved.sources).map(([k, how]) => [
      k,
      how === "map" ? `map:${mapped.sources[k]}` : "alias",
    ]),
  );
  const parsed = closedWonSchema.safeParse(resolved.row);
  if (!parsed.success) {
    return {
      row: resolved.row as Json,
      sources,
      unmapped_keys: resolved.unmappedKeys,
      missing_required: mapped.missingRequired,
      errors: parsed.error.issues.map((i) => i.message),
      tis: { input: null, resolved: null },
      ae: { input: null, matched: false },
    };
  }
  const { resolveTeamMember } = await import("./server/team-lookup");
  const owner = parsed.data.implementation_owner ?? null;
  const member = owner ? await resolveTeamMember(owner) : null;
  let aeMatched = false;
  if (parsed.data.rep_email) {
    const { data } = await db()
      .from("portal_profiles")
      .select("id")
      .eq("email", parsed.data.rep_email)
      .maybeSingle();
    aeMatched = Boolean(data);
  }
  const { handoff, ...rest } = parsed.data;
  return {
    row: { ...rest, ...handoff } as Json,
    sources,
    unmapped_keys: resolved.unmappedKeys,
    missing_required: mapped.missingRequired,
    errors: [],
    tis: { input: owner, resolved: member?.name ?? null },
    ae: { input: parsed.data.rep_email ?? null, matched: aeMatched },
  };
}

/* -------------------------------------------------------- Salesforce pull */

const PULL_STATE_KEY = "salesforce_pull";
export const PULL_LOG_KIND = "sf_pull_closed_won";

/** A stored rule, read defensively: a malformed group is dropped, a missing key keeps the default. */
function readIncludeRule(
  v: unknown,
  fallback: import("./server/salesforce-poll").IncludeRule | null,
): import("./server/salesforce-poll").IncludeRule | null {
  if (v === undefined) return fallback;
  if (v === null) return null;
  if (!v || typeof v !== "object") return fallback;
  const groups = Array.isArray((v as { groups?: unknown }).groups)
    ? ((v as { groups: unknown[] }).groups as unknown[])
    : [];
  const out: import("./server/salesforce-poll").IncludeGroup[] = [];
  for (const g of groups) {
    if (!g || typeof g !== "object") continue;
    const gg = g as { label?: unknown; conditions?: unknown; path?: unknown };
    const conditions = Array.isArray(gg.conditions)
      ? (gg.conditions as unknown[]).filter(
          (c): c is import("./server/salesforce-poll").IncludeCondition =>
            !!c &&
            typeof c === "object" &&
            ((c as { kind?: unknown }).kind === "field" ||
              (c as { kind?: unknown }).kind === "products") &&
            Array.isArray((c as { values?: unknown }).values),
        )
      : [];
    const path = gg.path;
    out.push({
      label: typeof gg.label === "string" ? gg.label : "Rule",
      conditions,
      path:
        path === "new_logo" ||
        path === "existing" ||
        path === "dm_conversion" ||
        path === "field_fusion"
          ? path
          : null,
    });
  }
  return { groups: out };
}

export async function loadPullState(): Promise<import("./server/salesforce-poll").PullState> {
  const { defaultPullState } = await import("./server/salesforce-poll");
  const fallback = defaultPullState(new Date());
  try {
    const { data } = await db()
      .from("portal_app_config")
      .select("value")
      .eq("key", PULL_STATE_KEY)
      .maybeSingle();
    const v = (data?.value ?? {}) as Partial<import("./server/salesforce-poll").PullState>;
    return {
      watermark:
        typeof v.watermark === "string" && !Number.isNaN(Date.parse(v.watermark))
          ? v.watermark
          : fallback.watermark,
      include: readIncludeRule((v as { include?: unknown }).include, fallback.include),
      last_run_at: typeof v.last_run_at === "string" ? v.last_run_at : null,
      last_result: (v.last_result as import("./server/salesforce-poll").PullSummary | null) ?? null,
      last_error: typeof v.last_error === "string" ? v.last_error : null,
      batch_limit:
        typeof v.batch_limit === "number" && v.batch_limit > 0
          ? v.batch_limit
          : fallback.batch_limit,
    };
  } catch (e) {
    console.error("[salesforce pull] could not read state", e);
    return fallback;
  }
}

async function savePullState(next: import("./server/salesforce-poll").PullState): Promise<void> {
  const { error } = await db()
    .from("portal_app_config")
    .upsert(
      { key: PULL_STATE_KEY, value: next, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(`Could not save the Salesforce pull state: ${error.message}`);
}

async function salesforceClientOrThrow() {
  const { salesforceEnv, createSalesforceClient } = await import("./server/salesforce-client");
  const env = salesforceEnv();
  if (!env) {
    throw new Error(
      "Salesforce is not configured: set SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET and SALESFORCE_LOGIN_URL on the deployment.",
    );
  }
  return createSalesforceClient(env);
}

/**
 * The pull, with the real world plugged in: Salesforce over the client, the
 * deal map from the table, the state row, the sync log, and the SAME ingest
 * dependencies the closed-won webhook wires — the system actor in place of
 * an API key.
 */
export async function runSalesforcePull(
  trigger: "cron" | "manual",
): Promise<import("./server/salesforce-poll").PullSummary> {
  const { runPoll } = await import("./server/salesforce-poll");
  const { upsertAccount } = await import("./server/accounts");
  const { startOnboardingAs, saveDealIntakeFacts } = await import("./presale.server");
  const { assignDeal } = await import("./assignment.server");
  const { resolveTeamMember } = await import("./server/team-lookup");
  const client = await salesforceClientOrThrow();
  const ctx = { source: "system" as const };

  return runPoll({
    now: () => new Date(),
    loadMaps: loadFieldMaps,
    loadState: loadPullState,
    saveState: savePullState,
    query: (soql) => client.query(soql),
    log: async (entry) => {
      await writeSyncLog({
        direction: "inbound",
        kind: PULL_LOG_KIND,
        external_id: entry.external_id,
        implementation_id:
          typeof entry.decision["implementation_id"] === "string"
            ? (entry.decision["implementation_id"] as string)
            : null,
        customer_id:
          typeof entry.decision["customer_id"] === "string"
            ? (entry.decision["customer_id"] as string)
            : null,
        idempotency_key: null,
        request_payload: entry.request_payload,
        decision: { ...entry.decision, trigger },
        response_status: entry.status === "failed" ? 500 : entry.status === "replayed" ? 200 : 201,
        response_payload: null,
        status: entry.status,
        error: entry.error,
        request_hash: bodyHash(entry.request_payload),
      });
    },
    ingestDeps: {
      upsertAccount: async (input) => {
        const r = await upsertAccount(input, ctx);
        return { account: r.account as any, created: r.created };
      },
      recordContact: async (dealId, c) => {
        const patch: Record<string, string> = {};
        if (c.name) patch["primary_contact_name"] = c.name;
        if (c.email) patch["primary_contact_email"] = c.email;
        if (c.role) patch["primary_contact_role"] = c.role;
        if (Object.keys(patch).length === 0) return;
        const { error } = await db().from("portal_accounts").update(patch).eq("id", dealId);
        if (error) throw new Error(`Could not record the contact: ${error.message}`);
      },
      startOnboarding: (dealId) =>
        startOnboardingAs({ kind: "system", label: "the Salesforce pull" }, dealId, {
          createNewCustomer: true,
        }),
      recordFacts: async (dealId, facts) => {
        await saveDealIntakeFacts(dealId, facts);
      },
      assign: async (dealId, implementationId, owner) => {
        const member = owner ? await resolveTeamMember(owner) : null;
        return assignDeal({
          dealId,
          implementationId,
          ...(member ? { teamMemberId: member.id } : {}),
          actorProfileId: null,
          note: owner && !member ? `Salesforce named "${owner}", who is not on the team` : null,
        });
      },
      existingImplementation: async (customerId) => {
        const { data } = await db()
          .from("implementations")
          .select("id")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return (data?.id as string | undefined) ?? null;
      },
    },
  });
}

export type SalesforcePullStatus = {
  configured: boolean;
  enabled: boolean;
  killSwitch: boolean;
  state: import("./server/salesforce-poll").PullState;
  /** The query the current map and rule produce, or null with the reason it cannot be built. */
  soql: string | null;
  soqlError: string | null;
};

export async function loadSalesforcePullStatus(userId: string): Promise<SalesforcePullStatus> {
  await requireManager(userId);
  const { salesforceConfigured } = await import("./server/salesforce-client");
  const { buildSoql } = await import("./server/salesforce-poll");
  const [state, maps, enabled] = await Promise.all([
    loadPullState(),
    loadFieldMaps(),
    isFlagOn("sf_pull_enabled"),
  ]);
  let soql: string | null = null;
  let soqlError: string | null = null;
  try {
    soql = buildSoql(maps, state.watermark, state.batch_limit, state.include);
  } catch (e) {
    soqlError = e instanceof Error ? e.message : String(e);
  }
  return {
    configured: salesforceConfigured(),
    enabled,
    killSwitch: integrationKilled(),
    state,
    soql,
    soqlError,
  };
}

export type PullPreviewRow = {
  id: string;
  name: string;
  account: string | null;
  type: string | null;
  amount: number | null;
  close_date: string | null;
  products: string[];
  /** The rule group that lets it in, re-checked on the fetched record. */
  group: string | null;
  /** What the deal would be, with no map rows beyond those saved. */
  company: string | null;
  tis: string | null;
};

/**
 * "Preview matches": the opportunities the current rule would pull since a
 * date, as they would land — nothing imported, nothing written. The admin
 * reads this before turning the pull on, and again after changing the rule.
 */
export async function previewSalesforcePull(
  userId: string,
  input: { sinceIso?: string | null; limit?: number | null },
): Promise<{ soql: string; rows: PullPreviewRow[]; error: string | null }> {
  await requireManager(userId);
  const { buildSoql, recordToRow, recordProducts, matchedGroup } =
    await import("./server/salesforce-poll");
  const { readPath } = await import("./server/sf-field-maps");
  const [state, maps] = await Promise.all([loadPullState(), loadFieldMaps()]);
  const since =
    input.sinceIso && !Number.isNaN(Date.parse(input.sinceIso)) ? input.sinceIso : state.watermark;
  let soql: string;
  try {
    soql = buildSoql(maps, since, Math.min(input.limit ?? 25, 100), state.include);
  } catch (e) {
    return { soql: "", rows: [], error: e instanceof Error ? e.message : String(e) };
  }
  try {
    const client = await salesforceClientOrThrow();
    const records =
      await client.query<import("./server/salesforce-poll").SalesforceOpportunity>(soql);
    const rows: PullPreviewRow[] = records.map((r) => {
      const { row } = recordToRow(r, maps, state.include);
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
      return {
        id: String(r["Id"]),
        name: str(r["Name"]) ?? String(r["Id"]),
        account: str(readPath(r, "Account.Name")),
        type: str(r["Type"]),
        amount: typeof r["Amount"] === "number" ? r["Amount"] : null,
        close_date: str(r["CloseDate"]),
        products: recordProducts(r).names,
        group: matchedGroup(r, state.include)?.label ?? null,
        company: str(row["company"]),
        tis: str(row["implementation_owner"]),
      };
    });
    return { soql, rows, error: null };
  } catch (e) {
    return { soql, rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** "Test connection": a token, who it is, and how many won opportunities it can see. */
export async function testSalesforceConnection(userId: string): Promise<{
  ok: boolean;
  organizationId: string | null;
  userName: string | null;
  wonOpportunities: number | null;
  error: string | null;
}> {
  await requireAdmin(userId);
  try {
    const client = await salesforceClientOrThrow();
    const who = await client.whoAmI();
    const rows = await client.query<{ expr0: number }>(
      "SELECT COUNT(Id) expr0 FROM Opportunity WHERE IsWon = true",
    );
    return {
      ok: true,
      organizationId: who.organizationId,
      userName: who.userName,
      wonOpportunities: rows[0]?.expr0 ?? null,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      organizationId: null,
      userName: null,
      wonOpportunities: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function runSalesforcePullNow(
  userId: string,
): Promise<import("./server/salesforce-poll").PullSummary> {
  const profile = await requireAdmin(userId);
  const summary = await runSalesforcePull("manual");
  await audit({
    actor_type: "user",
    actor_id: profile.id,
    action: "integration.salesforce_pull_run",
    entity_type: "config",
    payload: {
      found: summary.found,
      created: summary.created,
      updated: summary.updated,
      failed: summary.failed,
    },
  });
  return summary;
}

/** The admin moves the watermark (a backfill start) or the batch size. */
export async function setSalesforcePullState(
  userId: string,
  input: {
    backfillFrom?: string | null;
    batchLimit?: number | null;
    /** The whole rule, replaced. `undefined` leaves it; `null` clears it (the pull then refuses to run). */
    include?: import("./server/salesforce-poll").IncludeRule | null;
  },
): Promise<import("./server/salesforce-poll").PullState> {
  const profile = await requireAdmin(userId);
  const state = await loadPullState();
  const next = { ...state };
  if (input.include !== undefined) {
    // Refuse a rule SOQL cannot express before it is saved, so the admin
    // hears about a bad field path now, not from the next cron run.
    const { ruleToSoql } = await import("./server/salesforce-poll");
    if (input.include) ruleToSoql(input.include);
    next.include = input.include;
  }
  if (input.backfillFrom) {
    const d = new Date(input.backfillFrom);
    if (Number.isNaN(d.getTime())) throw new Error("That is not a date.");
    next.watermark = d.toISOString();
    next.last_error = null;
  }
  if (input.batchLimit)
    next.batch_limit = Math.max(1, Math.min(2000, Math.round(input.batchLimit)));
  await savePullState(next);
  await audit({
    actor_type: "user",
    actor_id: profile.id,
    action: "integration.salesforce_pull_state",
    entity_type: "config",
    payload: {
      backfillFrom: input.backfillFrom ?? null,
      batchLimit: input.batchLimit ?? null,
      include: input.include === undefined ? "unchanged" : (input.include as unknown as Json),
    },
  });
  return next;
}

export type NeedsTemplateRow = {
  id: string;
  name: string;
  customer_id: string;
  current_stage: string;
  created_at: string;
  salesforce_opportunity_id: string | null;
};

/** SF-created implementations with no template pinned. */
export async function loadNeedsTemplateQueue(userId: string): Promise<NeedsTemplateRow[]> {
  await requireManager(userId);
  const { data } = await db()
    .from("implementations")
    .select("id, name, customer_id, current_stage, created_at, salesforce_opportunity_id")
    .eq("source", "salesforce")
    .is("journey_template_id", null)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as NeedsTemplateRow[];
}

/* --------------------------------------------------------------- supersede */

/**
 * The human-driven follow-on. Never called by the ingest: a re-won opportunity
 * against delivered work returns 409 and waits for a person.
 */
export async function supersedeImplementation(
  userId: string,
  input: { oldImplementationId: string; reason: string; name?: string | null },
): Promise<{ newImplementationId: string }> {
  const profile = await requireManager(userId);
  if (!input.reason?.trim()) throw new Error("Say why this implementation is being superseded");

  const { data, error } = await db().rpc("sf_supersede_implementation", {
    p_old_implementation_id: input.oldImplementationId,
    p_new_implementation: input.name ? { name: input.name } : {},
    p_reason: input.reason.trim(),
    p_actor_profile_id: profile.id,
  });
  if (error) throw new Error(error.message);

  const newId = data as string;
  const { data: impl } = await db()
    .from("implementations")
    .select("customer_id")
    .eq("id", newId)
    .maybeSingle();
  if (impl) {
    await recordImplementationCreated({
      implementationId: newId,
      customerId: impl.customer_id,
      source: "salesforce",
    });
  }
  return { newImplementationId: newId };
}

/* ---------------------------------------------------------------- webhooks */

export type WebhookEndpointRow = {
  id: string;
  name: string;
  url: string;
  secret_last4: string;
  event_types: string[];
  active: boolean;
  created_at: string;
  disabled_at: string | null;
  disabled_reason: string | null;
};

/**
 * Endpoints, WITHOUT their secrets. There is no read path to a signing secret
 * anywhere in this codebase: the plaintext exists once, in the response to the
 * call that created it, and the ciphertext lives in a table with RLS on and no
 * policies at all.
 */
export async function loadWebhookEndpoints(userId: string): Promise<WebhookEndpointRow[]> {
  await requireManager(userId);
  const { data } = await db()
    .from("webhook_endpoints")
    .select(
      "id, name, url, secret_last4, event_types, active, created_at, disabled_at, disabled_reason",
    )
    .order("created_at", { ascending: false });
  return (data ?? []) as WebhookEndpointRow[];
}

export async function createWebhookEndpoint(
  userId: string,
  input: { name: string; url: string; eventTypes: string[] },
): Promise<{ endpoint: WebhookEndpointRow; secret: string }> {
  const profile = await requireAdmin(userId);
  const { generateWebhookSecret, encryptSecret } = await import("./server/webhook-signing");
  const { secret, last4 } = generateWebhookSecret();
  // Encrypt BEFORE inserting: a missing KEK must fail the call, never leave an
  // endpoint that can be signed for but whose secret nobody can recover.
  const ciphertext = encryptSecret(secret);

  const { data, error } = await db()
    .from("webhook_endpoints")
    .insert({
      name: input.name,
      url: input.url,
      secret_last4: last4,
      event_types: input.eventTypes,
      created_by: profile.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const { error: secretError } = await db()
    .from("webhook_endpoint_secrets")
    .insert({ endpoint_id: data.id, secret_ciphertext: ciphertext });
  if (secretError) {
    await db().from("webhook_endpoints").delete().eq("id", data.id);
    throw new Error(`Could not store the signing secret: ${secretError.message}`);
  }

  await audit({
    actor_type: "user",
    actor_id: profile.id,
    action: "webhook_endpoint.create",
    entity_type: "webhook_endpoint",
    entity_id: data.id,
    payload: { name: input.name, url: input.url, event_types: input.eventTypes },
  });

  // The only time the plaintext is ever returned.
  return { endpoint: data as WebhookEndpointRow, secret };
}

export async function setWebhookEndpointActive(
  userId: string,
  input: { id: string; active: boolean; reason?: string | null },
): Promise<{ ok: true }> {
  const profile = await requireAdmin(userId);
  const { error } = await db()
    .from("webhook_endpoints")
    .update({
      active: input.active,
      disabled_at: input.active ? null : new Date().toISOString(),
      disabled_reason: input.active ? null : (input.reason ?? "Disabled by an admin"),
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
  await audit({
    actor_type: "user",
    actor_id: profile.id,
    action: input.active ? "webhook_endpoint.enable" : "webhook_endpoint.disable",
    entity_type: "webhook_endpoint",
    entity_id: input.id,
    payload: { reason: input.reason ?? null },
  });
  return { ok: true };
}

export type DeliveryRow = {
  id: string;
  endpoint_id: string;
  event_id: string;
  attempt: number;
  status: string;
  response_status: number | null;
  last_error: string | null;
  next_attempt_at: string;
  delivered_at: string | null;
  created_at: string;
};

export async function loadWebhookDeliveries(
  userId: string,
  endpointId?: string | null,
): Promise<DeliveryRow[]> {
  await requireManager(userId);
  let q = db()
    .from("webhook_deliveries")
    .select(
      "id, endpoint_id, event_id, attempt, status, response_status, last_error, next_attempt_at, delivered_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (endpointId) q = q.eq("endpoint_id", endpointId);
  const { data } = await q;
  return (data ?? []) as DeliveryRow[];
}

/** Redeliver = a NEW pending row, so the failed history is preserved. */
export async function redeliverWebhook(userId: string, deliveryId: string): Promise<{ ok: true }> {
  const profile = await requireManager(userId);
  const { data: row } = await db()
    .from("webhook_deliveries")
    .select("endpoint_id, event_id, request_body")
    .eq("id", deliveryId)
    .maybeSingle();
  if (!row) throw new Error("That delivery no longer exists");

  await db().from("webhook_deliveries").delete().eq("id", deliveryId);
  const { error } = await db().from("webhook_deliveries").insert({
    endpoint_id: row.endpoint_id,
    event_id: row.event_id,
    request_body: row.request_body,
    status: "pending",
    attempt: 0,
  });
  if (error) throw new Error(error.message);

  await audit({
    actor_type: "user",
    actor_id: profile.id,
    action: "webhook_delivery.redeliver",
    entity_type: "webhook_delivery",
    entity_id: deliveryId,
  });
  return { ok: true };
}

/** A signed, real event so an operator can verify a Zap end to end. */
export async function sendTestEvent(userId: string, endpointId: string): Promise<{ ok: true }> {
  const profile = await requireAdmin(userId);
  const { data: endpoint } = await db()
    .from("webhook_endpoints")
    .select("id")
    .eq("id", endpointId)
    .maybeSingle();
  if (!endpoint) throw new Error("That endpoint no longer exists");

  await emitEvent({
    event_type: "salesforce.write_back",
    entity_type: "test",
    entity_id: endpointId,
    payload: { test: true, requested_by: profile.id, requested_at: new Date().toISOString() },
    dedupe_key: `test:${endpointId}:${Date.now()}`,
  });
  return { ok: true };
}

export async function setIntegrationFlag(
  userId: string,
  input: { flag: "sf_auto_create" | "sf_presale_bridge" | "sf_pull_enabled"; enabled: boolean },
): Promise<{ ok: true }> {
  const profile = await requireAdmin(userId);
  const { data: row } = await db()
    .from("portal_app_config")
    .select("value")
    .eq("key", "v2_flags")
    .maybeSingle();
  const value = { ...((row?.value ?? {}) as Record<string, unknown>), [input.flag]: input.enabled };
  const { error } = await db()
    .from("portal_app_config")
    .upsert(
      { key: "v2_flags", value, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(error.message);

  const { resetFlagCache } = await import("./app-config.server");
  resetFlagCache();

  await audit({
    actor_type: "user",
    actor_id: profile.id,
    action: "integration.flag_changed",
    entity_type: "config",
    payload: { flag: input.flag, enabled: input.enabled },
  });
  return { ok: true };
}
