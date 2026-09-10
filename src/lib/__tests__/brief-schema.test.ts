import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";

import { briefJsonSchema } from "../server/schemas";

/**
 * The brief schema goes through the SDK's zod helper to become the model's
 * structured-output format. That helper reads zod v4 internals; a v3 schema
 * blew up at runtime with "cannot read properties of undefined (reading
 * 'def')" — the first thing anyone saw after adding an API key.
 */
describe("briefJsonSchema as a structured-output format", () => {
  it("builds a JSON schema the SDK accepts, and parses back through the same schema", () => {
    const format = zodOutputFormat(briefJsonSchema);
    expect(format.type).toBe("json_schema");
    const schema = format.schema as { properties?: Record<string, unknown> };
    expect(Object.keys(schema.properties ?? {})).toEqual(
      expect.arrayContaining(["one_liner", "kickoff", "expansion", "discovery_questions"]),
    );
    expect(() => format.parse("{}")).toThrow(/Failed to parse structured output/);
  });
});
