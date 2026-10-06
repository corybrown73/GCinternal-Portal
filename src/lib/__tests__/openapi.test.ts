import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEAL_FIELD_KEYS } from "../deal-field-catalog";
import { buildOpenApiDocument } from "../server/openapi";
import {
  accountUpsertSchema,
  createAlertBody,
  createTicketBody,
  tamRequestCreateSchema,
  transitionSchema,
} from "../server/schemas";
import { opportunityIngestSchema } from "../server/sf-schemas";

/**
 * The document people integrate against must describe every route that
 * exists, and every field the validators accept. A spec that drifts from the
 * code is worse than none, because people believe it.
 */

const doc = buildOpenApiDocument() as {
  paths: Record<string, Record<string, { "x-required-scope"?: string }>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
};

describe("the OpenAPI document", () => {
  it("has a path for every /api/v1 route file", () => {
    const files = readdirSync(new URL("../../routes/api/v1/", import.meta.url))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => f.replace(/\.ts$/, ""))
      .filter((f) => f !== "docs" && f !== "openapi[.]json");
    for (const f of files) {
      // accounts.$id.transition → /accounts/{id}/transition
      const path =
        "/" +
        f
          .split(".")
          .map((seg) => (seg.startsWith("$") ? `{${seg.slice(1)}}` : seg))
          .join("/");
      expect(Object.keys(doc.paths), `missing ${path}`).toContain(path);
    }
  });

  it("names a scope on every operation", () => {
    for (const [path, ops] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        expect(op["x-required-scope"], `${method} ${path}`).toBeTruthy();
      }
    }
  });

  it("describes every field the validators accept", () => {
    const pairs: Array<[string, { shape: Record<string, unknown> }]> = [
      ["AccountUpsert", accountUpsertSchema],
      ["AccountTransition", transitionSchema],
      ["OpportunityIngest", opportunityIngestSchema],
      ["TamRequest", tamRequestCreateSchema],
      ["Ticket", createTicketBody],
      ["Alert", createAlertBody],
    ];
    for (const [name, schema] of pairs) {
      const props = Object.keys(doc.components.schemas[name]!.properties ?? {});
      for (const key of Object.keys(schema.shape)) expect(props, `${name}.${key}`).toContain(key);
    }
  });

  it("describes every deal field an admin can map, and requires only the company", () => {
    const cw = doc.components.schemas["ClosedWon"] as {
      properties: Record<string, unknown>;
      required: string[];
    };
    for (const key of DEAL_FIELD_KEYS) expect(Object.keys(cw.properties), key).toContain(key);
    expect(cw.required).toEqual(["company"]);
  });
});
