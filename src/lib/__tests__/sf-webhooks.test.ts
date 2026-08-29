import { describe, expect, it } from "vitest";
import {
  applyInboundMaps,
  applyTransform,
  driftReport,
  outboundFields,
  readPath,
  type FieldMap,
} from "../server/sf-field-maps";
import {
  canonicalBody,
  decryptSecret,
  encryptSecret,
  endpointWantsEvent,
  generateWebhookSecret,
  nextAttemptAt,
  signPayload,
  verifySignature,
  MAX_DELIVERY_ATTEMPTS,
} from "../server/webhook-signing";
import { buildOpenApiDocument } from "../server/openapi";
import { opportunityIngestSchema } from "../server/sf-schemas";

const KEY = Buffer.alloc(32, 7);

function map(over: Partial<FieldMap>): FieldMap {
  return {
    direction: "inbound",
    source_path: "amount",
    target_field: "sow_value",
    transform: "number",
    fill_policy: "never",
    required: false,
    active: true,
    ...over,
  };
}

describe("field maps", () => {
  it("reads dotted paths, indexing arrays by position", () => {
    expect(readPath({ a: { b: 1 } }, "a.b")).toBe(1);
    expect(
      readPath({ line_items: [{ product_code: "GC-CORE" }] }, "line_items.0.product_code"),
    ).toBe("GC-CORE");
    expect(readPath({ a: { b: 1 } }, "a.b.c")).toBeUndefined();
    expect(readPath(null, "a")).toBeUndefined();
  });

  it("applies only the fixed transform menu", () => {
    expect(applyTransform("2026-09-30T00:00:00Z", "date")).toBe("2026-09-30");
    expect(applyTransform("$1,250", "number")).toBe(1250);
    expect(applyTransform("not a date", "date")).toBeNull();
    expect(applyTransform("graduate-to-cs", "stage_label")).toBe("Graduate To Cs");
    expect(applyTransform("AE@GoCanvas.com", "lowercase")).toBe("ae@gocanvas.com");
    // An unknown transform passes the value through rather than evaluating it.
    expect(applyTransform("x", "rm -rf /")).toBe("x");
  });

  it("reports required inbound fields the payload did not carry", () => {
    const result = applyInboundMaps({}, [map({ source_path: "amount", required: true })]);
    expect(result.missingRequired).toEqual(["amount"]);
    expect(result.values).toEqual({});
  });

  it("ignores inactive rows and the other direction", () => {
    const result = applyInboundMaps({ amount: 5 }, [
      map({ active: false }),
      map({ direction: "outbound", source_path: "amount", target_field: "GCHub_Amount__c" }),
    ]);
    expect(result.values).toEqual({});
  });
});

describe("drift", () => {
  it("defaults every differing field to action 'none' — replay writes nothing", () => {
    const report = driftReport({ sow_value: 10 }, { sow_value: 20 }, [map({})]);
    expect(report.fills).toEqual({});
    expect(report.entries).toEqual([
      {
        field: "sow_value",
        payload_value: 10,
        hub_value: 20,
        action: "none",
        fill_policy: "never",
      },
    ]);
  });

  it("fills only a blank field, and only where the map opted in", () => {
    const maps = [map({ fill_policy: "if_blank" })];
    expect(driftReport({ sow_value: 10 }, { sow_value: null }, maps).fills).toEqual({
      sow_value: 10,
    });
    // Not blank: opting in never overwrites a value someone put there.
    expect(driftReport({ sow_value: 10 }, { sow_value: 20 }, maps).fills).toEqual({});
    // Blank, but the policy is 'never'.
    expect(driftReport({ sow_value: 10 }, { sow_value: null }, [map({})]).fills).toEqual({});
  });

  it("does not report a field that only differs by type", () => {
    expect(driftReport({ sow_value: "10" }, { sow_value: 10 }, [map({})]).entries).toEqual([]);
  });

  it("builds Salesforce-shaped outbound bodies", () => {
    expect(
      outboundFields({ current_stage: "graduate-to-cs", health_computed: "on_track" }, [
        map({
          direction: "outbound",
          source_path: "current_stage",
          target_field: "GCHub_Stage__c",
          transform: "stage_label",
        }),
        map({
          direction: "outbound",
          source_path: "health_computed",
          target_field: "GCHub_Health__c",
          transform: "none",
        }),
        map({ direction: "outbound", source_path: "missing", target_field: "GCHub_Nothing__c" }),
      ]),
    ).toEqual({ GCHub_Stage__c: "Graduate To Cs", GCHub_Health__c: "on_track" });
  });
});

describe("webhook signing", () => {
  it("signs the exact bytes sent, and verifies them", () => {
    const body = canonicalBody({
      id: "e1",
      type: "implementation.created",
      created_at: "2026-08-29T00:00:00.000Z",
      data: { a: 1 },
    });
    const ts = 1_700_000_000;
    const sig = signPayload("whsec_test", ts, body);
    expect(sig.startsWith("v1=")).toBe(true);
    expect(verifySignature("whsec_test", ts, body, sig, ts)).toBe(true);
    expect(verifySignature("whsec_other", ts, body, sig, ts)).toBe(false);
    expect(verifySignature("whsec_test", ts, `${body} `, sig, ts)).toBe(false);
  });

  it("rejects a replayed signature outside the tolerance window", () => {
    const body = canonicalBody({ id: "e", type: "t", created_at: "x", data: {} });
    const ts = 1_700_000_000;
    const sig = signPayload("s", ts, body);
    expect(verifySignature("s", ts, body, sig, ts + 299)).toBe(true);
    expect(verifySignature("s", ts, body, sig, ts + 301)).toBe(false);
  });

  it("serializes the canonical body with a fixed key order", () => {
    expect(canonicalBody({ id: "1", type: "t", created_at: "c", data: { z: 1 } })).toBe(
      '{"id":"1","type":"t","created_at":"c","data":{"z":1}}',
    );
  });

  it("round-trips a secret through AES-256-GCM and rejects tampering", () => {
    const { secret, last4 } = generateWebhookSecret();
    expect(secret.startsWith("whsec_")).toBe(true);
    expect(secret.endsWith(last4)).toBe(true);

    const ct = encryptSecret(secret, KEY);
    expect(ct).not.toContain(secret);
    expect(decryptSecret(ct, KEY)).toBe(secret);
    expect(() => decryptSecret(`${ct}x`, KEY)).toThrow();
    expect(() => decryptSecret(ct, Buffer.alloc(32, 8))).toThrow();
  });

  it("backs off and eventually gives up", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(nextAttemptAt(0, from)!.toISOString()).toBe("2026-01-01T00:01:00.000Z");
    expect(nextAttemptAt(3, from)!.toISOString()).toBe("2026-01-01T02:00:00.000Z");
    expect(nextAttemptAt(MAX_DELIVERY_ATTEMPTS, from)).toBeNull();
  });

  it("treats an empty subscription as 'every event'", () => {
    expect(endpointWantsEvent([], "stage.changed")).toBe(true);
    expect(endpointWantsEvent(["alert.raised"], "stage.changed")).toBe(false);
    expect(endpointWantsEvent(["stage.changed"], "stage.changed")).toBe(true);
  });
});

describe("openapi", () => {
  it("describes every field the ingest validator actually accepts", () => {
    const doc = buildOpenApiDocument() as any;
    const properties = doc.components.schemas.OpportunityIngest.properties;
    for (const field of Object.keys(opportunityIngestSchema.shape)) {
      expect(properties, `OpenAPI is missing '${field}'`).toHaveProperty(field);
    }
    expect(doc.components.schemas.OpportunityIngest.required).toContain(
      "salesforce_opportunity_id",
    );
    // Optional fields must not be listed as required.
    expect(doc.components.schemas.OpportunityIngest.required).not.toContain("se_email");
  });

  it("names the scope each endpoint needs", () => {
    const doc = buildOpenApiDocument() as any;
    expect(doc.paths["/implementations"].post["x-required-scope"]).toBe("implementations:write");
    expect(doc.paths["/implementations"].get["x-required-scope"]).toBe("implementations:read");
  });

  it("documents the events that have no emitter yet as such", () => {
    const doc = buildOpenApiDocument() as any;
    expect(doc.webhooks["gate.blocked"].post.description).toContain("no emitter");
    expect(doc.webhooks["implementation.created"].post.description).toContain("every writer");
  });

  it("is serializable and mentions no secret", () => {
    const json = JSON.stringify(buildOpenApiDocument());
    expect(json).not.toMatch(/whsec_/);
    expect(json).not.toMatch(/secret_ciphertext/);
  });
});
