/**
 * The Salesforce opportunity ingest pipeline.
 *
 * This module is the whole decision procedure for POST /api/v1/implementations
 * and it is deliberately written against a narrow port (`IngestPort`) rather
 * than against Supabase. That is not decoration: the behaviour that matters
 * here — replaying the same closed-won payload five times yields ONE
 * implementation and FIVE sync-log rows, a re-won opportunity after completion
 * is refused rather than duplicated, two concurrent deliveries collapse onto
 * one row — is exactly the behaviour a live database makes expensive to test.
 * With a port, `src/lib/__tests__/sf-ingest.test.ts` runs the entire matrix,
 * including the ugly cases, against a fake store that enforces the same unique
 * index the real one does.
 *
 * Three invariants hold everywhere below:
 *
 * - **Replay writes nothing.** The only exception is a field whose mapping row
 *   explicitly says `fill_policy = 'if_blank'`, and every such fill is audited
 *   and journalled where a person will see it.
 * - **Recorded and computed facts never merge.** `sf_closed_won_at` comes from
 *   the payload or stays null; the template choice is stored beside the rules
 *   that produced it, not in place of them.
 * - **The database decides who wins a race.** The partial unique index on
 *   `salesforce_opportunity_id` is the serializer; a 23505 is a normal outcome
 *   and means "someone else got there first", which is a replay.
 */

import { sfId18 } from "./sf-id";
import { applyInboundMaps, driftReport, type DriftReport, type FieldMap } from "./sf-field-maps";
import { chooseTemplate, type TemplateCandidate, type TemplateSelection } from "./template-select";
import type { OpportunityIngestInput } from "./sf-schemas";

/* ------------------------------------------------------------------ types */

export type CustomerRow = {
  id: string;
  name: string;
  salesforce_account_id: string | null;
  [k: string]: unknown;
};

export type PortalAccountRow = {
  id: string;
  name: string;
  salesforce_id: string | null;
  customer_id: string | null;
  stage: string;
};

export type ImplementationRow = {
  id: string;
  customer_id: string;
  name: string;
  current_stage: string;
  salesforce_opportunity_id: string | null;
  salesforce_account_id: string | null;
  sf_closed_won_at: string | null;
  superseded_by_implementation_id: string | null;
  [k: string]: unknown;
};

export type CreateImplementationArgs = {
  customerId: string;
  name: string;
  salesforceOpportunityId: string;
  salesforceAccountId: string;
  sfClosedWonAt: string | null;
  ownerId: string | null;
  salesOwner: string | null;
  templateId: string | null;
  mapped: Record<string, unknown>;
};

export type CreateResult = { id: string } | { conflict: true };

export type SyncLogRow = {
  direction: "inbound";
  kind: string;
  external_id: string | null;
  implementation_id: string | null;
  customer_id: string | null;
  idempotency_key: string | null;
  request_payload: unknown;
  decision: Record<string, unknown>;
  response_status: number;
  response_payload: unknown;
  status: "succeeded" | "replayed" | "rejected" | "failed";
  error: string | null;
};

export type IngestFlags = {
  /** `sf_auto_create` AND the SF_INTEGRATION_DISABLED kill switch. */
  autoCreate: boolean;
  /** `sf_presale_bridge` — the deal STAGE move only. The link is core. */
  presaleBridge: boolean;
  /** Phase 2's `journey_templates`; gates APPLYING a template, never recording the choice. */
  templates: boolean;
};

export interface IngestPort {
  flags(): Promise<IngestFlags>;
  fieldMaps(): Promise<FieldMap[]>;
  publishedTemplates(): Promise<TemplateCandidate[]>;
  /**
   * `sf_fallback_template` from portal_app_config: the template KEY to use when
   * no `default_for` rule matches. template-select.ts has always specified this
   * as where a catch-all belongs; 0023 seeded the key and, until 0033, nothing
   * read it — which is why selection in this deployment had never once returned
   * a winner.
   */
  fallbackTemplateKey(): Promise<string | null>;

  findCustomerBySfAccountId(sfAccountId: string): Promise<CustomerRow | null>;
  findPortalAccountBySfId(sfAccountId: string): Promise<PortalAccountRow | null>;
  stampCustomerSfAccountId(
    customerId: string,
    sfAccountId: string,
    evidence: Record<string, unknown>,
  ): Promise<void>;
  createCustomer(input: {
    name: string;
    salesforceAccountId: string;
    arr: number | null;
  }): Promise<CreateResult>;
  linkPortalAccountCustomer(accountId: string, customerId: string): Promise<void>;

  findCurrentImplementationByOpportunity(oppId: string): Promise<ImplementationRow | null>;
  /** Terminal := a graduations row exists OR current_stage = 'graduate-to-cs'. */
  isTerminal(impl: ImplementationRow): Promise<boolean>;
  createImplementation(args: CreateImplementationArgs): Promise<CreateResult>;
  loadImplementation(id: string): Promise<ImplementationRow | null>;
  applyReplayFills(
    implId: string,
    fills: Record<string, unknown>,
    syncLogId: string,
  ): Promise<void>;

  ownerIdByEmail(email: string): Promise<string | null>;

  cachedIdempotentResponse(
    key: string,
    bodyHash: string,
  ): Promise<{ status: number; body: unknown } | null>;
  writeSyncLog(row: SyncLogRow & { request_hash: string | null }): Promise<string>;
  emitImplementationCreated(impl: { id: string; customerId: string }): Promise<void>;
  alertRewonAfterCompletion(args: {
    opportunityId: string;
    implementationId: string;
    customerId: string;
    opportunityName: string;
  }): Promise<void>;
  bridgePresaleStage(accountId: string): Promise<{ changed: boolean }>;
}

export type IngestContext = {
  apiKeyId: string | null;
  idempotencyKey: string | null;
  bodyHash: string;
};

export type IngestOutcome = {
  status: number;
  body: Record<string, unknown>;
  syncLogId: string | null;
};

/* -------------------------------------------------------------- pipeline */

/** The canonical payload → hub column mapping, before any admin override. */
export function canonicalMapping(input: OpportunityIngestInput): Record<string, unknown> {
  return {
    name: input.opportunity_name,
    sales_owner: input.owner_email ?? null,
    target_launch_date: input.close_date ? input.close_date.slice(0, 10) : null,
    sow_value: input.amount ?? null,
  };
}

export function selectionInputsFrom(input: OpportunityIngestInput) {
  const items = input.line_items ?? [];
  return {
    opportunity_type: input.opportunity_type ?? null,
    amount: input.amount ?? null,
    product_codes: items
      .map((li) => li.product_code)
      .filter((c): c is string => typeof c === "string" && c !== ""),
    product_families: items
      .map((li) => li.product_family)
      .filter((c): c is string => typeof c === "string" && c !== ""),
  };
}

/** Salesforce's own statement of when the deal closed, or nothing. Never inferred. */
export function closedWonAt(input: OpportunityIngestInput): {
  value: string | null;
  provenance: string;
} {
  if (input.closed_won_at) {
    return {
      value: new Date(input.closed_won_at).toISOString(),
      provenance: "payload.closed_won_at",
    };
  }
  if (input.close_date) {
    return { value: new Date(input.close_date).toISOString(), provenance: "payload.close_date" };
  }
  return { value: null, provenance: "absent — not inferred" };
}

export async function ingestOpportunity(
  input: OpportunityIngestInput,
  port: IngestPort,
  ctx: IngestContext,
): Promise<IngestOutcome> {
  const oppId = sfId18(input.salesforce_opportunity_id)!;
  const accountId = sfId18(input.salesforce_account_id)!;

  const normalized = {
    opportunity_id: oppId,
    opportunity_id_received: input.salesforce_opportunity_id,
    account_id: accountId,
    account_id_received: input.salesforce_account_id,
  };

  const flags = await port.flags();
  if (!flags.autoCreate) {
    const body = {
      error: {
        code: "feature_disabled",
        message: "Salesforce auto-create is turned off (feature flag sf_auto_create).",
      },
    };
    const syncLogId = await port.writeSyncLog({
      direction: "inbound",
      kind: "opportunity.ingest",
      external_id: oppId,
      implementation_id: null,
      customer_id: null,
      idempotency_key: ctx.idempotencyKey,
      request_payload: input,
      request_hash: ctx.bodyHash,
      decision: { branch: "feature_disabled", normalized },
      response_status: 503,
      response_payload: body,
      status: "rejected",
      error: "feature_disabled",
    });
    return { status: 503, body, syncLogId };
  }

  // Request-level idempotency cache. The durable key is the opportunity id;
  // this only saves a caller from a torn retry of the SAME body.
  if (ctx.idempotencyKey) {
    const cached = await port.cachedIdempotentResponse(ctx.idempotencyKey, ctx.bodyHash);
    if (cached) {
      return {
        status: cached.status,
        body: { ...(cached.body as Record<string, unknown>), idempotent_replay: true },
        syncLogId: null,
      };
    }
  }

  const maps = await port.fieldMaps();
  const inbound = applyInboundMaps(input, maps);
  const mapped = { ...canonicalMapping(input), ...inbound.values };

  const existing = await port.findCurrentImplementationByOpportunity(oppId);
  if (existing) {
    return await replayOrRefuse(existing, {
      input,
      port,
      ctx,
      maps,
      mapped,
      normalized,
      oppId,
      branchNote: "existing implementation for this opportunity",
    });
  }

  /* ---- Customer resolution: adoption before creation ------------------- */
  const customer = await resolveCustomer(port, {
    accountId,
    accountName: input.account_name,
    oppId,
  });
  if ("error" in customer) {
    const body = { error: { code: "customer_resolution_failed", message: customer.error } };
    const syncLogId = await port.writeSyncLog({
      direction: "inbound",
      kind: "opportunity.ingest",
      external_id: oppId,
      implementation_id: null,
      customer_id: null,
      idempotency_key: ctx.idempotencyKey,
      request_payload: input,
      request_hash: ctx.bodyHash,
      decision: { branch: "customer_resolution_failed", normalized },
      response_status: 500,
      response_payload: body,
      status: "failed",
      error: customer.error,
    });
    return { status: 500, body, syncLogId };
  }

  /* ---- Template selection: always evaluated, always recorded ------------ */
  const candidates = await port.publishedTemplates();
  const fallbackKey = await port.fallbackTemplateKey();
  const selection: TemplateSelection = chooseTemplate(
    candidates,
    selectionInputsFrom(input),
    fallbackKey,
  );
  const templateApplied = flags.templates && selection.winner !== null;

  /* ---- Owner resolution ------------------------------------------------- */
  //
  // WHICH EMAIL BECOMES THE IMPLEMENTATION LEAD. This used to be
  // `input.owner_email` — the Salesforce Opportunity Owner, i.e. the AE — which
  // meant every auto-created project listed the AE as its implementation
  // specialist. The AE is the `sales_owner`; they are not the person who runs
  // the delivery.
  //
  // The order is explicit and stops before the AE: an assigned implementation
  // owner, then the SE who scoped the deal, then nobody. Unassigned is a
  // visible state somebody fixes in a second; silently wrong is a state nobody
  // notices until the first status meeting.
  const ownerEmailForDelivery = input.implementation_owner_email ?? input.se_email ?? null;
  const ownerId = ownerEmailForDelivery ? await port.ownerIdByEmail(ownerEmailForDelivery) : null;
  const ownerSource = input.implementation_owner_email
    ? ("implementation_owner_email" as const)
    : input.se_email
      ? ("se_email" as const)
      : ("none" as const);

  const won = closedWonAt(input);

  const created = await port.createImplementation({
    customerId: customer.customerId,
    name: input.opportunity_name,
    salesforceOpportunityId: oppId,
    salesforceAccountId: accountId,
    sfClosedWonAt: won.value,
    ownerId,
    salesOwner: input.owner_email ?? null,
    templateId: templateApplied ? selection.winner!.template_id : null,
    mapped,
  });

  if ("conflict" in created) {
    // Someone delivered the same opportunity concurrently and the unique index
    // picked a winner. That is not an error: re-read and replay.
    const winner = await port.findCurrentImplementationByOpportunity(oppId);
    if (winner) {
      return await replayOrRefuse(winner, {
        input,
        port,
        ctx,
        maps,
        mapped,
        normalized,
        oppId,
        branchNote: "lost the create race (23505) — replaying the winner",
      });
    }
    const body = {
      error: {
        code: "conflict_unresolved",
        message: "Another delivery claimed this opportunity and then disappeared. Retry.",
      },
    };
    const syncLogId = await port.writeSyncLog({
      direction: "inbound",
      kind: "opportunity.ingest",
      external_id: oppId,
      implementation_id: null,
      customer_id: customer.customerId,
      idempotency_key: ctx.idempotencyKey,
      request_payload: input,
      request_hash: ctx.bodyHash,
      decision: { branch: "conflict_unresolved", normalized },
      response_status: 409,
      response_payload: body,
      status: "failed",
      error: "conflict_unresolved",
    });
    return { status: 409, body, syncLogId };
  }

  /* ---- Core deal-link (NOT behind the bridge flag) ---------------------- */
  // This is what makes the SF path and "Start onboarding" mutually idempotent:
  // startOnboarding's only guard is portal_accounts.customer_id.
  let dealLink: Record<string, unknown> = { linked: false };
  if (customer.portalAccountId && !customer.portalAccountAlreadyLinked) {
    await port.linkPortalAccountCustomer(customer.portalAccountId, customer.customerId);
    dealLink = { linked: true, portal_account_id: customer.portalAccountId };
  } else if (customer.portalAccountId) {
    dealLink = {
      linked: false,
      reason: "already linked",
      portal_account_id: customer.portalAccountId,
    };
  }

  /* ---- Bridge flag gates ONLY the presale stage move -------------------- */
  let bridge: Record<string, unknown> = { attempted: false };
  if (flags.presaleBridge && customer.portalAccountId) {
    const moved = await port.bridgePresaleStage(customer.portalAccountId);
    bridge = { attempted: true, changed: moved.changed };
  } else if (customer.portalAccountId) {
    bridge = { attempted: false, reason: "sf_presale_bridge is off" };
  }

  await port.emitImplementationCreated({
    id: created.id,
    customerId: customer.customerId,
  });

  const body = {
    created: true,
    replay: false,
    implementation: {
      id: created.id,
      salesforce_opportunity_id: oppId,
      salesforce_account_id: accountId,
    },
    customer: {
      id: customer.customerId,
      adopted: customer.resolution === "adopted_portal_account",
      created: customer.resolution === "created",
    },
    template: selection.winner
      ? {
          template_id: selection.winner.template_id,
          template_key: selection.winner.template_key,
          template_version: selection.winner.template_version,
          applied: templateApplied,
        }
      : null,
  };

  const syncLogId = await port.writeSyncLog({
    direction: "inbound",
    kind: "opportunity.ingest",
    external_id: oppId,
    implementation_id: created.id,
    customer_id: customer.customerId,
    idempotency_key: ctx.idempotencyKey,
    request_payload: input,
    request_hash: ctx.bodyHash,
    decision: {
      branch: "created",
      normalized,
      customer: {
        id: customer.customerId,
        resolution: customer.resolution,
        evidence: customer.evidence,
      },
      // The inputs the choice was made on, and every rule it was made against.
      template: {
        ...selection,
        applied: templateApplied,
        not_applied_reason:
          selection.winner && !templateApplied ? "journey_templates flag off" : null,
      },
      owner: {
        // What Salesforce sent, which field we took the delivery owner from,
        // and whether it resolved. An operator looking at an unassigned project
        // can answer "why" from this row without re-running anything.
        sales_owner_email: input.owner_email ?? null,
        implementation_owner_email: input.implementation_owner_email ?? null,
        se_email: input.se_email ?? null,
        owner_source: ownerSource,
        resolved_owner_id: ownerId,
        unresolved: ownerEmailForDelivery !== null && ownerId === null,
      },
      sf_closed_won_at: won,
      mapped_fields: mapped,
      missing_required_maps: inbound.missingRequired,
      deal_link: dealLink,
      presale_bridge: bridge,
    },
    response_status: 201,
    response_payload: body,
    status: "succeeded",
    error: null,
  });

  return { status: 201, body, syncLogId };
}

/* ------------------------------------------------------------- branches */

type ReplayCtx = {
  input: OpportunityIngestInput;
  port: IngestPort;
  ctx: IngestContext;
  maps: FieldMap[];
  mapped: Record<string, unknown>;
  normalized: Record<string, unknown>;
  oppId: string;
  branchNote: string;
};

async function replayOrRefuse(existing: ImplementationRow, r: ReplayCtx): Promise<IngestOutcome> {
  const { port, ctx, input, maps, mapped, normalized, oppId } = r;
  const terminal = await port.isTerminal(existing);

  if (terminal) {
    // A re-won opportunity against delivered work is a human decision, never an
    // automatic one: the alert is deduped and never throws, and the caller is
    // told exactly which RPC a manager has to drive.
    await port.alertRewonAfterCompletion({
      opportunityId: oppId,
      implementationId: existing.id,
      customerId: existing.customer_id,
      opportunityName: input.opportunity_name,
    });
    const body = {
      error: {
        code: "opportunity_already_delivered",
        message:
          "This opportunity already has a completed implementation. A follow-on must be created by a person.",
      },
      existing_implementation_id: existing.id,
      existing_customer_id: existing.customer_id,
      resolution: "Create a follow-on implementation from the Customer 360 (supersede action).",
    };
    const syncLogId = await port.writeSyncLog({
      direction: "inbound",
      kind: "opportunity.ingest",
      external_id: oppId,
      implementation_id: existing.id,
      customer_id: existing.customer_id,
      idempotency_key: ctx.idempotencyKey,
      request_payload: input,
      request_hash: ctx.bodyHash,
      decision: {
        branch: "rejected_terminal",
        note: r.branchNote,
        normalized,
        terminal_because: "a graduations row exists or current_stage is 'graduate-to-cs'",
        current_stage: existing.current_stage,
      },
      response_status: 409,
      response_payload: body,
      status: "rejected",
      error: "opportunity_already_delivered",
    });
    return { status: 409, body, syncLogId };
  }

  // Pure replay. Compute the drift, write nothing unless a field map opted in.
  const drift: DriftReport = driftReport(mapped, existing as Record<string, unknown>, maps);
  const body = {
    created: false,
    replay: true,
    implementation: {
      id: existing.id,
      salesforce_opportunity_id: existing.salesforce_opportunity_id,
      salesforce_account_id: existing.salesforce_account_id,
    },
    customer: { id: existing.customer_id, adopted: false, created: false },
    drift: drift.entries.map((e) => ({ field: e.field, action: e.action })),
  };

  const syncLogId = await port.writeSyncLog({
    direction: "inbound",
    kind: "opportunity.ingest",
    external_id: oppId,
    implementation_id: existing.id,
    customer_id: existing.customer_id,
    idempotency_key: ctx.idempotencyKey,
    request_payload: input,
    request_hash: ctx.bodyHash,
    decision: {
      branch: "replay",
      note: r.branchNote,
      normalized,
      // The drift report is the whole point of a replay: what Salesforce now
      // says, what the hub says, and the fact that we changed nothing.
      drift: drift.entries,
      fills: drift.fills,
      // Recorded on a replay too, so a payload that starts carrying an
      // implementation owner is visible in the log even though a replay
      // deliberately changes nothing.
      implementation_owner_email: input.implementation_owner_email ?? null,
      se_email: input.se_email ?? null,
    },
    response_status: 200,
    response_payload: body,
    status: "replayed",
    error: null,
  });

  if (Object.keys(drift.fills).length > 0) {
    await port.applyReplayFills(existing.id, drift.fills, syncLogId);
  }

  return { status: 200, body, syncLogId };
}

type CustomerResolution =
  | {
      customerId: string;
      resolution: "matched_sf_account_id" | "adopted_portal_account" | "created";
      evidence: Record<string, unknown>;
      portalAccountId: string | null;
      portalAccountAlreadyLinked: boolean;
    }
  | { error: string };

/**
 * Adoption before creation.
 *
 * A customer that "Start onboarding" already created from the same deal has no
 * `salesforce_account_id` unless the account_model flag was on when it ran, so
 * matching only on that column guarantees a duplicate for every UI-onboarded
 * account. The portal_accounts row is the evidence that links the two, and
 * adopting stamps the identity rather than copying any field values.
 */
async function resolveCustomer(
  port: IngestPort,
  args: { accountId: string; accountName: string; oppId: string },
): Promise<CustomerResolution> {
  const direct = await port.findCustomerBySfAccountId(args.accountId);
  const portalAccount = await port.findPortalAccountBySfId(args.accountId);

  if (direct) {
    return {
      customerId: direct.id,
      resolution: "matched_sf_account_id",
      evidence: { matched_on: "customers.salesforce_account_id" },
      portalAccountId: portalAccount?.id ?? null,
      portalAccountAlreadyLinked: Boolean(portalAccount?.customer_id),
    };
  }

  if (portalAccount?.customer_id) {
    await port.stampCustomerSfAccountId(portalAccount.customer_id, args.accountId, {
      matched_on: "portal_accounts.salesforce_id",
      portal_account_id: portalAccount.id,
      salesforce_opportunity_id: args.oppId,
    });
    return {
      customerId: portalAccount.customer_id,
      resolution: "adopted_portal_account",
      evidence: {
        matched_on: "portal_accounts.salesforce_id",
        portal_account_id: portalAccount.id,
      },
      portalAccountId: portalAccount.id,
      portalAccountAlreadyLinked: true,
    };
  }

  const created = await port.createCustomer({
    name: args.accountName,
    salesforceAccountId: args.accountId,
    arr: null,
  });
  if ("conflict" in created) {
    // Concurrent creation of the same account: re-read rather than write over.
    const again = await port.findCustomerBySfAccountId(args.accountId);
    if (!again) return { error: "customer create conflicted but no row could be re-read" };
    return {
      customerId: again.id,
      resolution: "matched_sf_account_id",
      evidence: { matched_on: "customers.salesforce_account_id after 23505" },
      portalAccountId: portalAccount?.id ?? null,
      portalAccountAlreadyLinked: Boolean(portalAccount?.customer_id),
    };
  }

  return {
    customerId: created.id,
    resolution: "created",
    evidence: { created_from: "payload.account_name", account_name: args.accountName },
    portalAccountId: portalAccount?.id ?? null,
    portalAccountAlreadyLinked: Boolean(portalAccount?.customer_id),
  };
}
