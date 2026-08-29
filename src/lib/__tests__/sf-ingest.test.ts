import { beforeEach, describe, expect, it } from "vitest";
import { ingestOpportunity, type IngestFlags, type IngestPort } from "../server/sf-ingest";
import type { OpportunityIngestInput } from "../server/sf-schemas";
import { sfId18 } from "../server/sf-id";
import { presaleStageForLifecycle } from "../sf-integration.server";

/**
 * The replay / supersede behaviour matrix.
 *
 * This is the phase's correctness bar, so it is tested against a fake store
 * that enforces the same partial unique index the database does: one CURRENT
 * implementation per opportunity id. Everything the pipeline can do to that
 * store — create, adopt, replay, refuse, lose a race — is exercised here,
 * including the cases that only show up when two deliveries arrive at once or
 * when a payload changes between retries.
 */

const OPP_15 = "0066g00000ABCDE";
const OPP_18 = sfId18(OPP_15)!;
const ACC_15 = "0016g00000ABCDE";
const ACC_18 = sfId18(ACC_15)!;

function payload(over: Partial<OpportunityIngestInput> = {}): OpportunityIngestInput {
  return {
    salesforce_opportunity_id: OPP_18,
    salesforce_account_id: ACC_18,
    account_name: "Acme Corp",
    opportunity_name: "Acme — New Logo",
    opportunity_type: "New Logo",
    amount: 50_000,
    close_date: "2026-09-30",
    owner_email: "ae@gocanvas.com",
    se_email: "se@gocanvas.com",
    line_items: [{ product_code: "GC-CORE", product_family: "Platform" }],
    ...over,
  };
}

type Impl = {
  id: string;
  customer_id: string;
  name: string;
  current_stage: string;
  salesforce_opportunity_id: string | null;
  salesforce_account_id: string | null;
  sf_closed_won_at: string | null;
  superseded_by_implementation_id: string | null;
  target_launch_date: string | null;
  sow_value: number | null;
  sales_owner: string | null;
  graduated: boolean;
  [k: string]: unknown;
};

class FakeStore {
  customers = new Map<string, { id: string; name: string; salesforce_account_id: string | null }>();
  portalAccounts = new Map<
    string,
    {
      id: string;
      name: string;
      salesforce_id: string | null;
      customer_id: string | null;
      stage: string;
    }
  >();
  implementations = new Map<string, Impl>();
  syncLogs: Array<Record<string, unknown>> = [];
  events: Array<Record<string, unknown>> = [];
  alerts: Array<Record<string, unknown>> = [];
  audits: Array<Record<string, unknown>> = [];
  fills: Array<{ implId: string; fills: Record<string, unknown> }> = [];
  bridged: string[] = [];
  linked: Array<{ accountId: string; customerId: string }> = [];
  stamped: Array<{ customerId: string; sfAccountId: string }> = [];

  flags: IngestFlags = { autoCreate: true, presaleBridge: false, templates: false };
  maps: any[] = [];
  templates: any[] = [];
  owners = new Map<string, string>();
  idempotencyCache = new Map<string, { status: number; body: unknown }>();

  /** Runs immediately before createImplementation — the concurrency seam. */
  beforeCreate: (() => void) | null = null;

  seq = 0;
  id(prefix: string) {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  /** The partial unique index: one CURRENT implementation per opportunity. */
  currentFor(oppId: string): Impl | null {
    for (const impl of this.implementations.values()) {
      if (
        impl.salesforce_opportunity_id === oppId &&
        impl.superseded_by_implementation_id === null
      ) {
        return impl;
      }
    }
    return null;
  }

  insertImplementation(args: {
    customerId: string;
    name: string;
    oppId: string;
    accountId: string;
    closedWonAt: string | null;
    mapped: Record<string, unknown>;
  }): Impl {
    const impl: Impl = {
      id: this.id("impl"),
      customer_id: args.customerId,
      name: args.name,
      current_stage: "handoff",
      salesforce_opportunity_id: args.oppId,
      salesforce_account_id: args.accountId,
      sf_closed_won_at: args.closedWonAt,
      superseded_by_implementation_id: null,
      target_launch_date: (args.mapped["target_launch_date"] as string) ?? null,
      sow_value: (args.mapped["sow_value"] as number) ?? null,
      sales_owner: (args.mapped["sales_owner"] as string) ?? null,
      graduated: false,
    };
    this.implementations.set(impl.id, impl);
    return impl;
  }

  port(): IngestPort {
    return makePort(this);
  }
}

/** The fake's port. A standalone factory so nothing aliases `this`. */
function makePort(store: FakeStore): IngestPort {
  return {
    async flags() {
      return store.flags;
    },
    async fieldMaps() {
      return store.maps;
    },
    async publishedTemplates() {
      return store.templates;
    },
    async findCustomerBySfAccountId(sfAccountId) {
      for (const c of store.customers.values()) {
        if (c.salesforce_account_id === sfAccountId) return c as never;
      }
      return null;
    },
    async findPortalAccountBySfId(sfAccountId) {
      for (const a of store.portalAccounts.values()) {
        if (a.salesforce_id === sfAccountId) return a;
      }
      return null;
    },
    async stampCustomerSfAccountId(customerId, sfAccountId) {
      const c = store.customers.get(customerId);
      if (c && c.salesforce_account_id === null) c.salesforce_account_id = sfAccountId;
      store.stamped.push({ customerId, sfAccountId });
    },
    async createCustomer(input) {
      for (const c of store.customers.values()) {
        if (c.salesforce_account_id === input.salesforceAccountId) return { conflict: true };
      }
      const row = {
        id: store.id("cust"),
        name: input.name,
        salesforce_account_id: input.salesforceAccountId,
      };
      store.customers.set(row.id, row);
      return { id: row.id };
    },
    async linkPortalAccountCustomer(accountId, customerId) {
      const a = store.portalAccounts.get(accountId);
      if (a && a.customer_id === null) a.customer_id = customerId;
      store.linked.push({ accountId, customerId });
    },
    async findCurrentImplementationByOpportunity(oppId) {
      return store.currentFor(oppId) as never;
    },
    async isTerminal(impl) {
      const row = store.implementations.get(impl.id);
      return Boolean(row?.graduated) || impl.current_stage === "graduate-to-cs";
    },
    async createImplementation(args) {
      store.beforeCreate?.();
      if (store.currentFor(args.salesforceOpportunityId)) return { conflict: true };
      const impl = store.insertImplementation({
        customerId: args.customerId,
        name: args.name,
        oppId: args.salesforceOpportunityId,
        accountId: args.salesforceAccountId,
        closedWonAt: args.sfClosedWonAt,
        mapped: args.mapped,
      });
      return { id: impl.id };
    },
    async loadImplementation(id) {
      return (store.implementations.get(id) ?? null) as never;
    },
    async applyReplayFills(implId, fills) {
      const impl = store.implementations.get(implId);
      if (impl) Object.assign(impl, fills);
      store.fills.push({ implId, fills });
    },
    async ownerIdByEmail(email) {
      return store.owners.get(email.toLowerCase()) ?? null;
    },
    async cachedIdempotentResponse(key, hash) {
      return store.idempotencyCache.get(`${key}:${hash}`) ?? null;
    },
    async writeSyncLog(row) {
      const id = store.id("log");
      store.syncLogs.push({ id, ...row });
      if (row.idempotency_key && row.request_hash) {
        store.idempotencyCache.set(`${row.idempotency_key}:${row.request_hash}`, {
          status: row.response_status,
          body: row.response_payload,
        });
      }
      return id;
    },
    async emitImplementationCreated(impl) {
      store.events.push({ type: "implementation.created", ...impl });
    },
    async alertRewonAfterCompletion(args) {
      // Deduped, like the real wrapper: one open alert per opportunity.
      if (store.alerts.some((a) => a["opportunityId"] === args.opportunityId)) return;
      store.alerts.push({ ...args });
    },
    async bridgePresaleStage(accountId) {
      store.bridged.push(accountId);
      return { changed: true };
    },
  };
}

const ctx = (over: Partial<{ idempotencyKey: string | null; bodyHash: string }> = {}) => ({
  apiKeyId: "key-1",
  idempotencyKey: null,
  bodyHash: "hash-a",
  ...over,
});

let store: FakeStore;
beforeEach(() => {
  store = new FakeStore();
});

describe("the replay matrix", () => {
  it("five deliveries of the same closed-won payload yield ONE implementation and FIVE sync-log rows", async () => {
    const port = store.port();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const out = await ingestOpportunity(payload(), port, ctx());
      statuses.push(out.status);
    }

    expect(store.implementations.size).toBe(1);
    expect(store.customers.size).toBe(1);
    expect(store.syncLogs).toHaveLength(5);
    expect(statuses).toEqual([201, 200, 200, 200, 200]);
    expect(store.syncLogs.map((r) => r["status"])).toEqual([
      "succeeded",
      "replayed",
      "replayed",
      "replayed",
      "replayed",
    ]);
  });

  it("a replay whose payload changed writes NOTHING and reports the drift instead", async () => {
    const port = store.port();
    await ingestOpportunity(payload(), port, ctx());
    const before = { ...store.implementations.values().next().value! };

    const out = await ingestOpportunity(
      payload({ opportunity_name: "Acme — renamed", amount: 999_999, close_date: "2027-01-31" }),
      port,
      ctx(),
    );

    expect(out.status).toBe(200);
    expect(out.body["replay"]).toBe(true);
    const after = store.implementations.values().next().value!;
    expect(after.name).toBe(before.name);
    expect(after.sow_value).toBe(before.sow_value);
    expect(after.target_launch_date).toBe(before.target_launch_date);
    expect(store.fills).toHaveLength(0);

    const decision = store.syncLogs.at(-1)!["decision"] as any;
    const fields = decision.drift.map((d: any) => d.field);
    expect(fields).toContain("name");
    expect(fields).toContain("sow_value");
    expect(decision.drift.every((d: any) => d.action === "none")).toBe(true);
  });

  it("fills a blank field on replay ONLY where a field map opted in, and reports it", async () => {
    store.maps = [
      {
        direction: "inbound",
        source_path: "close_date",
        target_field: "target_launch_date",
        transform: "date",
        fill_policy: "if_blank",
        required: false,
        active: true,
      },
      {
        direction: "inbound",
        source_path: "opportunity_name",
        target_field: "name",
        transform: "none",
        fill_policy: "never",
        required: false,
        active: true,
      },
    ];
    const port = store.port();
    await ingestOpportunity(payload({ close_date: undefined }), port, ctx());
    const impl = store.implementations.values().next().value!;
    expect(impl.target_launch_date).toBeNull();

    await ingestOpportunity(
      payload({ close_date: "2026-11-01", opportunity_name: "Something else" }),
      port,
      ctx(),
    );

    expect(store.fills).toHaveLength(1);
    expect(store.fills[0]!.fills).toEqual({ target_launch_date: "2026-11-01" });
    // The name was blank-policy 'never' and was already set: untouched.
    expect(impl.name).toBe("Acme — New Logo");
  });

  it("a 15-character id replays against an implementation stored under the 18-character one", async () => {
    const port = store.port();
    await ingestOpportunity(payload(), port, ctx());
    const out = await ingestOpportunity(
      payload({ salesforce_opportunity_id: OPP_15, salesforce_account_id: ACC_15 }),
      port,
      ctx(),
    );
    expect(out.status).toBe(200);
    expect(store.implementations.size).toBe(1);
    const decision = store.syncLogs.at(-1)!["decision"] as any;
    expect(decision.normalized.opportunity_id).toBe(OPP_18);
    expect(decision.normalized.opportunity_id_received).toBe(OPP_15);
  });
});

describe("a re-won opportunity", () => {
  it("is refused with 409 when the prior implementation graduated, and alerts once", async () => {
    const port = store.port();
    await ingestOpportunity(payload(), port, ctx());
    const impl = store.implementations.values().next().value!;
    impl.graduated = true;

    const first = await ingestOpportunity(payload(), port, ctx());
    const second = await ingestOpportunity(payload(), port, ctx());

    expect(first.status).toBe(409);
    expect(second.status).toBe(409);
    expect((first.body["error"] as any).code).toBe("opportunity_already_delivered");
    expect(first.body["existing_implementation_id"]).toBe(impl.id);
    expect(store.implementations.size).toBe(1);
    // Deduped: a Zapier retry storm must not email every manager repeatedly.
    expect(store.alerts).toHaveLength(1);
    expect(store.syncLogs.filter((r) => r["status"] === "rejected")).toHaveLength(2);
  });

  it("is refused when the prior implementation reached graduate-to-cs, whatever its status", async () => {
    const port = store.port();
    await ingestOpportunity(payload(), port, ctx());
    const impl = store.implementations.values().next().value!;
    impl.current_stage = "graduate-to-cs";
    // Deliberately NOT touching `status`: terminality is never read off it.
    impl["status"] = "active";

    const out = await ingestOpportunity(payload(), port, ctx());
    expect(out.status).toBe(409);
  });

  it("is a plain replay — never a duplicate — while the prior implementation is still running", async () => {
    const port = store.port();
    await ingestOpportunity(payload(), port, ctx());
    const impl = store.implementations.values().next().value!;
    impl.current_stage = "build";

    const out = await ingestOpportunity(payload(), port, ctx());
    expect(out.status).toBe(200);
    expect(out.body["created"]).toBe(false);
    expect(store.implementations.size).toBe(1);
    expect(store.alerts).toHaveLength(0);
  });
});

describe("concurrency", () => {
  it("a delivery that loses the create race replays the winner instead of duplicating", async () => {
    const port = store.port();
    // The other delivery commits between our read and our write.
    store.beforeCreate = () => {
      store.beforeCreate = null;
      const cust = { id: "cust-other", name: "Acme Corp", salesforce_account_id: ACC_18 };
      store.customers.set(cust.id, cust);
      store.insertImplementation({
        customerId: cust.id,
        name: "Acme — New Logo",
        oppId: OPP_18,
        accountId: ACC_18,
        closedWonAt: null,
        mapped: {},
      });
    };

    const out = await ingestOpportunity(payload(), port, ctx());

    expect(out.status).toBe(200);
    expect(out.body["replay"]).toBe(true);
    expect(store.implementations.size).toBe(1);
    const decision = store.syncLogs.at(-1)!["decision"] as any;
    expect(decision.branch).toBe("replay");
    expect(decision.note).toContain("lost the create race");
  });

  it("two interleaved deliveries produce one implementation, one 201 and one 200", async () => {
    const portA = store.port();
    const portB = store.port();
    const a = await ingestOpportunity(payload(), portA, ctx());
    const b = await ingestOpportunity(payload(), portB, ctx());
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(store.implementations.size).toBe(1);
  });
});

describe("customer resolution", () => {
  it("adopts the customer an earlier handoff already created rather than duplicating it", async () => {
    store.customers.set("cust-ui", {
      id: "cust-ui",
      name: "Acme Corporation",
      salesforce_account_id: null,
    });
    store.portalAccounts.set("deal-1", {
      id: "deal-1",
      name: "Acme Corp",
      salesforce_id: ACC_18,
      customer_id: "cust-ui",
      stage: "onboarding_kickoff",
    });

    const out = await ingestOpportunity(payload(), store.port(), ctx());

    expect(out.status).toBe(201);
    expect(store.customers.size).toBe(1);
    expect((out.body["customer"] as any).id).toBe("cust-ui");
    expect((out.body["customer"] as any).adopted).toBe(true);
    // Identity is stamped; no payload value is written over the customer.
    expect(store.stamped).toEqual([{ customerId: "cust-ui", sfAccountId: ACC_18 }]);
    expect(store.customers.get("cust-ui")!.name).toBe("Acme Corporation");
  });

  it("matches an already-stamped customer without re-stamping it", async () => {
    store.customers.set("cust-sf", {
      id: "cust-sf",
      name: "Acme",
      salesforce_account_id: ACC_18,
    });
    const out = await ingestOpportunity(payload(), store.port(), ctx());
    expect((out.body["customer"] as any).id).toBe("cust-sf");
    expect(store.stamped).toHaveLength(0);
  });

  it("links the deal to the customer even with the bridge flag OFF, but does not move its stage", async () => {
    store.portalAccounts.set("deal-1", {
      id: "deal-1",
      name: "Acme Corp",
      salesforce_id: ACC_18,
      customer_id: null,
      stage: "closed_won",
    });

    await ingestOpportunity(payload(), store.port(), ctx());

    // The link is core: without it, "Start onboarding" on the deal page would
    // happily create a second customer and a second implementation.
    expect(store.linked).toHaveLength(1);
    expect(store.bridged).toHaveLength(0);
  });

  it("moves the deal's stage only when the bridge flag is on", async () => {
    store.flags = { ...store.flags, presaleBridge: true };
    store.portalAccounts.set("deal-1", {
      id: "deal-1",
      name: "Acme Corp",
      salesforce_id: ACC_18,
      customer_id: null,
      stage: "negotiation",
    });

    await ingestOpportunity(payload(), store.port(), ctx());
    expect(store.bridged).toEqual(["deal-1"]);
  });
});

describe("template selection", () => {
  const template = {
    id: "tpl-1",
    key: "new_logo",
    name: "New Logo",
    version: 3,
    status: "published",
    journey_type: "new_logo",
    default_for: { priority: 10, opportunity_type_any: ["New Logo"] },
  };

  it("records the choice and every rule it was made on, even when it cannot apply it", async () => {
    store.templates = [template];
    store.flags = { ...store.flags, templates: false };

    const out = await ingestOpportunity(payload(), store.port(), ctx());

    const decision = store.syncLogs.at(-1)!["decision"] as any;
    expect(decision.template.winner.template_key).toBe("new_logo");
    expect(decision.template.applied).toBe(false);
    expect(decision.template.not_applied_reason).toContain("journey_templates");
    expect(decision.template.inputs).toEqual({
      opportunity_type: "New Logo",
      amount: 50_000,
      product_codes: ["GC-CORE"],
      product_families: ["Platform"],
    });
    expect(decision.template.evaluations[0].clauses[0]).toMatchObject({
      clause: "opportunity_type_any",
      passed: true,
    });
    expect((out.body["template"] as any).applied).toBe(false);
  });

  it("applies the template when Phase 2's flag is on", async () => {
    store.templates = [template];
    store.flags = { ...store.flags, templates: true };
    const out = await ingestOpportunity(payload(), store.port(), ctx());
    expect((out.body["template"] as any).applied).toBe(true);
  });
});

describe("guards", () => {
  it("returns 503 and still records the exchange when the flag is off", async () => {
    store.flags = { ...store.flags, autoCreate: false };
    const out = await ingestOpportunity(payload(), store.port(), ctx());
    expect(out.status).toBe(503);
    expect((out.body["error"] as any).code).toBe("feature_disabled");
    expect(store.implementations.size).toBe(0);
    expect(store.syncLogs).toHaveLength(1);
    expect(store.syncLogs[0]!["status"]).toBe("rejected");
  });

  it("serves a cached response for the same Idempotency-Key and body, and not for a changed body", async () => {
    const port = store.port();
    await ingestOpportunity(payload(), port, ctx({ idempotencyKey: "k1", bodyHash: "h1" }));
    const cached = await ingestOpportunity(
      payload(),
      port,
      ctx({ idempotencyKey: "k1", bodyHash: "h1" }),
    );
    expect(cached.body["idempotent_replay"]).toBe(true);
    expect(store.syncLogs).toHaveLength(1);

    const changed = await ingestOpportunity(
      payload({ amount: 1 }),
      port,
      ctx({ idempotencyKey: "k1", bodyHash: "h2" }),
    );
    expect(changed.status).toBe(200);
    expect(changed.body["idempotent_replay"]).toBeUndefined();
    expect(store.syncLogs).toHaveLength(2);
  });

  it("records the SE email it cannot store anywhere else, so it can be backfilled later", async () => {
    await ingestOpportunity(payload(), store.port(), ctx());
    const decision = store.syncLogs[0]!["decision"] as any;
    expect(decision.se_email).toBe("se@gocanvas.com");
    expect(decision.owner.unresolved).toBe(true);
  });

  it("records the close date as evidence with its provenance, never inferring one", async () => {
    await ingestOpportunity(payload({ close_date: undefined }), store.port(), ctx());
    const decision = store.syncLogs[0]!["decision"] as any;
    expect(decision.sf_closed_won_at).toEqual({ value: null, provenance: "absent — not inferred" });
  });
});

describe("the presale stage seam (PLAN.md decision 10)", () => {
  it("maps a lifecycle stage to the presale tail stage it implies", () => {
    expect(presaleStageForLifecycle("handoff")).toBe("onboarding_kickoff");
    expect(presaleStageForLifecycle("build")).toBe("in_onboarding");
    expect(presaleStageForLifecycle("launch")).toBe("in_onboarding");
    expect(presaleStageForLifecycle("graduate-to-cs")).toBe("onboarding_complete");
  });

  it("refuses to map a stage that is not part of the lifecycle", () => {
    // A deal must never be moved on the strength of a stage we do not know.
    expect(presaleStageForLifecycle("closed_won")).toBeNull();
    expect(presaleStageForLifecycle("")).toBeNull();
  });
});
