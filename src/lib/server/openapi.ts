import { z } from "zod";
import { opportunityIngestSchema } from "./sf-schemas";
import { accountUpsertSchema, transitionSchema } from "./schemas";
import { API_SCOPES } from "./api-auth";
import { EVENT_TYPES } from "./events";

/**
 * The OpenAPI 3.1 document for /api/v1.
 *
 * The request bodies are generated FROM the Zod validators that actually run,
 * by walking their shapes — not transcribed beside them. A hand-written spec
 * drifts from the code the first time someone adds a field, and then it is
 * worse than no spec at all because people believe it.
 * `src/lib/__tests__/sf-openapi.test.ts` fails if a validator grows a field the
 * document does not describe.
 *
 * The document is public: an API description is not a secret, and every route
 * it names is still behind a scoped key.
 */

type JsonSchema = Record<string, unknown>;

/** A deliberately small Zod → JSON Schema walk covering the shapes we use. */
export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const def = schema._def as any;
  const typeName = def?.typeName as string | undefined;

  switch (typeName) {
    case "ZodObject": {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        const field = value as z.ZodTypeAny;
        properties[key] = zodToJsonSchema(field);
        if (!field.isOptional()) required.push(key);
      }
      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
      };
    }
    case "ZodString": {
      const checks = (def.checks ?? []) as Array<{ kind: string; value?: number }>;
      const out: JsonSchema = { type: "string" };
      for (const c of checks) {
        if (c.kind === "min") out["minLength"] = c.value;
        if (c.kind === "max") out["maxLength"] = c.value;
        if (c.kind === "email") out["format"] = "email";
      }
      return out;
    }
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodArray":
      return { type: "array", items: zodToJsonSchema(def.type) };
    case "ZodEnum":
      return { type: "string", enum: def.values };
    case "ZodRecord":
      return { type: "object", additionalProperties: true };
    case "ZodOptional":
    case "ZodNullable":
    case "ZodDefault":
      return zodToJsonSchema(def.innerType);
    case "ZodEffects":
      return zodToJsonSchema(def.schema);
    default:
      return {};
  }
}

const errorSchema: JsonSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: { code: { type: "string" }, message: { type: "string" } },
      required: ["code", "message"],
    },
  },
  required: ["error"],
};

function jsonBody(schema: JsonSchema) {
  return { content: { "application/json": { schema } } };
}

export function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "GoCanvas Implementation Hub API",
      version: "1.0.0",
      description:
        "Machine surface for the implementation hub. Every endpoint is authenticated with a " +
        "scoped API key (`Authorization: Bearer gcp_live_…` or `x-api-key`). Webhook deliveries " +
        "are at-least-once and unordered: consumers must be idempotent and should order by " +
        "`created_at` plus entity id.",
    },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", description: `Scopes: ${API_SCOPES.join(", ")}` },
      },
      schemas: {
        Error: errorSchema,
        OpportunityIngest: zodToJsonSchema(opportunityIngestSchema),
        AccountUpsert: zodToJsonSchema(accountUpsertSchema),
        AccountTransition: zodToJsonSchema(transitionSchema),
      },
    },
    security: [{ apiKey: [] }],
    paths: {
      "/implementations": {
        post: {
          summary: "Create (or replay) an implementation from a closed-won Opportunity",
          description:
            "Idempotent on the normalized 18-character opportunity id. Replaying the same " +
            "payload returns 200 with `replay: true` and writes NOTHING except a sync-log row " +
            "and, where a field map explicitly opts in, a fill of a blank field. An opportunity " +
            "whose implementation has already been delivered returns 409 and raises a deduped " +
            "alert — a follow-on is created by a person, never automatically.",
          "x-required-scope": "implementations:write",
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header",
              required: false,
              schema: { type: "string" },
              description:
                "Optional. Collapses a torn retry of the SAME body within 24 hours. The durable " +
                "key is the opportunity id, not this header.",
            },
          ],
          requestBody: {
            required: true,
            ...jsonBody({ $ref: "#/components/schemas/OpportunityIngest" }),
          },
          responses: {
            "201": { description: "Created", ...jsonBody({ type: "object" }) },
            "200": { description: "Replay — nothing was changed", ...jsonBody({ type: "object" }) },
            "409": {
              description: "The opportunity has already been delivered",
              ...jsonBody({ $ref: "#/components/schemas/Error" }),
            },
            "422": {
              description: "Validation failed",
              ...jsonBody({ $ref: "#/components/schemas/Error" }),
            },
            "503": {
              description: "Salesforce auto-create is turned off",
              ...jsonBody({ $ref: "#/components/schemas/Error" }),
            },
          },
        },
        get: {
          summary: "List implementations that carry a Salesforce opportunity id",
          "x-required-scope": "implementations:read",
          parameters: [
            { name: "salesforce_opportunity_id", in: "query", schema: { type: "string" } },
            {
              name: "updated_since",
              in: "query",
              schema: { type: "string", format: "date-time" },
            },
          ],
          responses: { "200": { description: "OK", ...jsonBody({ type: "object" }) } },
        },
      },
      "/accounts": {
        post: {
          summary: "Upsert a presale account",
          "x-required-scope": "accounts:write",
          requestBody: {
            required: true,
            ...jsonBody({ $ref: "#/components/schemas/AccountUpsert" }),
          },
          responses: {
            "201": { description: "Created", ...jsonBody({ type: "object" }) },
            "200": { description: "Updated", ...jsonBody({ type: "object" }) },
          },
        },
        get: {
          summary: "List presale accounts",
          "x-required-scope": "accounts:read",
          parameters: [
            { name: "stage", in: "query", schema: { type: "string" } },
            { name: "updated_since", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: { "200": { description: "OK", ...jsonBody({ type: "object" }) } },
        },
      },
      "/accounts/{id}": {
        get: {
          summary: "One presale account and its last 50 stage transitions",
          "x-required-scope": "accounts:read",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "A portal UUID or `sf_<salesforce_id>`.",
            },
          ],
          responses: { "200": { description: "OK", ...jsonBody({ type: "object" }) } },
        },
      },
      "/accounts/{id}/transition": {
        post: {
          summary: "Move a presale account to a new stage",
          "x-required-scope": "transitions:write",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            ...jsonBody({ $ref: "#/components/schemas/AccountTransition" }),
          },
          responses: { "200": { description: "OK", ...jsonBody({ type: "object" }) } },
        },
      },
    },
    webhooks: Object.fromEntries(
      EVENT_TYPES.map((type) => [
        type,
        {
          post: {
            summary: `Outbound event: ${type}`,
            description: webhookNote(type),
            requestBody: {
              ...jsonBody({
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  type: { type: "string", const: type },
                  created_at: { type: "string", format: "date-time" },
                  data: { type: "object" },
                },
                required: ["id", "type", "created_at", "data"],
              }),
            },
            responses: { "200": { description: "Acknowledged" } },
          },
        },
      ]),
    ),
    "x-webhook-signing": {
      headers: {
        "X-GCHub-Event-Id": "The event uuid. Use it to deduplicate.",
        "X-GCHub-Event-Type": "The event type.",
        "X-GCHub-Timestamp": "Unix seconds. Reject if more than 300s from your clock.",
        "X-GCHub-Signature": "v1=hex(hmac_sha256(secret, `{timestamp}.{raw body}`))",
      },
      note: "Sign the raw bytes we sent, not a re-serialization of the parsed JSON.",
    },
  };
}

function webhookNote(type: string): string {
  switch (type) {
    case "gate.blocked":
      return "Declared, with no emitter yet — the launch gate does not publish events today.";
    case "handoff.returned":
      return "Declared, with no emitter yet — Phase 3's handoff gate does not publish events today.";
    case "salesforce.write_back":
      return "Field-level write-back for a Zapier 'Update Record by Id' step. `data.fields` is keyed by Salesforce API name.";
    default:
      return "Emitted by every writer of this fact, not only the Salesforce path.";
  }
}
